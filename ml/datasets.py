"""
TIRPAN ML — Dataset Downloader & Preprocessor
===============================================
Downloads and preprocesses training data from five public sources:

1. NVD CVE JSON (fkie-cad mirror)    — ~150k CVEs (text + CVSS + CWE)
2. MITRE ATT&CK STIX                  — technique descriptions
3. Exploit-DB CSV                     — verified flag + Metasploit tag (independent signal)
4. CISA KEV catalog                   — ~1.5k CVEs known to be exploited in the wild
5. EPSS scores                        — ~330k CVEs with exploit probability

The independence of (3), (4), (5) from text-derived features eliminates the
label-leakage problem of the previous version (where labels were keyword-
derived from the same text the model later trained on).
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import logging
import lzma
import os
import re
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

# ── URL constants ─────────────────────────────────────────────────────────────

_NVD_RELEASE_BASE = "https://github.com/fkie-cad/nvd-json-data-feeds/releases/latest/download"
_NVD_YEARS = ["2022", "2023", "2024"]

_MITRE_URL = (
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data"
    "/master/enterprise-attack/enterprise-attack.json"
)

_EXPLOITDB_CSV_URL = (
    "https://gitlab.com/exploit-database/exploitdb/-/raw/main/files_exploits.csv"
)

_CISA_KEV_URL = (
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
)

_EPSS_URL = "https://epss.cyentia.com/epss_scores-current.csv.gz"

# ── CWE → asset_category mapping ─────────────────────────────────────────────

CWE_TO_ASSET: dict[str, str] = {
    "CWE-79": "web_application", "CWE-80": "web_application", "CWE-83": "web_application",
    "CWE-87": "web_application", "CWE-116": "web_application", "CWE-352": "web_application",
    "CWE-601": "web_application", "CWE-918": "web_application", "CWE-611": "web_application",
    "CWE-74": "web_application",
    "CWE-89": "data", "CWE-90": "data", "CWE-943": "data",
    "CWE-209": "data", "CWE-200": "data", "CWE-540": "data",
    "CWE-312": "data", "CWE-311": "data",
    "CWE-287": "authentication", "CWE-306": "authentication", "CWE-307": "authentication",
    "CWE-521": "authentication", "CWE-522": "authentication", "CWE-620": "authentication",
    "CWE-640": "authentication", "CWE-384": "authentication", "CWE-613": "authentication",
    "CWE-119": "operating_system", "CWE-120": "operating_system", "CWE-121": "operating_system",
    "CWE-122": "operating_system", "CWE-125": "operating_system", "CWE-787": "operating_system",
    "CWE-416": "operating_system", "CWE-415": "operating_system", "CWE-190": "operating_system",
    "CWE-362": "operating_system", "CWE-269": "operating_system", "CWE-732": "operating_system",
    "CWE-400": "network", "CWE-770": "network", "CWE-369": "network", "CWE-20": "network",
}

_DEFAULT_ASSET = "service"

# ── CVSS → risk_level (used only when an explicit score exists) ───────────────

def cvss_to_risk(score: float | None) -> str:
    if score is None:
        return "info"
    if score >= 9.0:
        return "critical"
    if score >= 7.0:
        return "high"
    if score >= 4.0:
        return "medium"
    if score > 0.0:
        return "low"
    return "info"


# ── attack_phase heuristic from description ────────────────────────────────────
# Ordered: more specific phrases first to win the match.
_PHASE_KEYWORDS: list[tuple[str, str]] = [
    ("exfiltrat", "exfiltration"),
    ("lateral movement", "lateral_movement"),
    ("privilege escalat", "post_exploitation"),
    ("credential dump", "post_exploitation"),
    ("password recover", "post_exploitation"),
    ("token theft", "post_exploitation"),
    ("remote code exec", "exploitation"),
    ("arbitrary code exec", "exploitation"),
    ("arbitrary command", "exploitation"),
    ("command inject", "exploitation"),
    ("command exec", "exploitation"),
    ("sql inject", "exploitation"),
    ("cross-site script", "exploitation"),
    ("cross site script", "exploitation"),
    ("buffer overflow", "exploitation"),
    ("stack overflow", "exploitation"),
    ("heap overflow", "exploitation"),
    ("use-after-free", "exploitation"),
    ("use after free", "exploitation"),
    ("deserializ", "exploitation"),
    ("authentication bypass", "exploitation"),
    ("authentication is not required", "exploitation"),
    ("unauthenticated", "exploitation"),
    ("denial of service", "impact"),
    ("denial-of-service", "impact"),
    (" dos ", "impact"),
    ("crash the", "impact"),
    ("information disclos", "reconnaissance"),
    ("information leak", "reconnaissance"),
    ("directory traversal", "reconnaissance"),
    ("path traversal", "reconnaissance"),
    ("open redirect", "scanning"),
    ("port scan", "scanning"),
]


def description_to_phase(text: str) -> str:
    lower = text.lower()
    for kw, phase in _PHASE_KEYWORDS:
        if kw in lower:
            return phase
    return "scanning"


# ── Downloader ────────────────────────────────────────────────────────────────

def _download(url: str, dest: Path, retries: int = 3) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        logger.info("Cache hit: %s", dest.name)
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            logger.info("Downloading %s (attempt %d)…", url, attempt)
            resp = requests.get(url, timeout=180, stream=True)
            resp.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=65536):
                    fh.write(chunk)
            logger.info("Saved → %s (%.1f MB)", dest, dest.stat().st_size / 1e6)
            return dest
        except Exception as exc:
            logger.warning("Download attempt %d failed: %s", attempt, exc)
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to download {url} after {retries} attempts")


# ── CISA KEV loader ───────────────────────────────────────────────────────────

def load_kev(cache_dir: str | Path = "ml/data") -> set[str]:
    """Return set of CVE IDs that CISA has confirmed exploited in the wild."""
    cache = Path(cache_dir)
    dest = cache / "cisa_kev.json"
    try:
        _download(_CISA_KEV_URL, dest)
    except RuntimeError as e:
        logger.warning("CISA KEV download failed: %s — KEV signal unavailable", e)
        return set()
    try:
        with open(dest, encoding="utf-8") as fh:
            data = json.load(fh)
        cves = {v.get("cveID", "") for v in data.get("vulnerabilities", []) if v.get("cveID")}
        logger.info("CISA KEV: loaded %d CVEs", len(cves))
        return cves
    except Exception as exc:
        logger.warning("CISA KEV parse error: %s", exc)
        return set()


# ── EPSS loader ───────────────────────────────────────────────────────────────

def load_epss(cache_dir: str | Path = "ml/data") -> dict[str, float]:
    """Return dict {cve_id: epss_score} — predicted real-world exploitation probability."""
    cache = Path(cache_dir)
    dest = cache / "epss.csv.gz"
    try:
        _download(_EPSS_URL, dest)
    except RuntimeError as e:
        logger.warning("EPSS download failed: %s — EPSS signal unavailable", e)
        return {}
    scores: dict[str, float] = {}
    try:
        with gzip.open(dest, "rt", encoding="utf-8") as fh:
            # First line is model_version comment, second is header
            first = fh.readline()
            if not first.startswith("#"):
                # Already on header — rewind by re-opening
                fh.seek(0)
            reader = csv.DictReader(fh)
            for row in reader:
                cve = (row.get("cve") or "").strip()
                try:
                    s = float(row.get("epss", 0) or 0)
                except (TypeError, ValueError):
                    continue
                if cve:
                    scores[cve] = s
        logger.info("EPSS: loaded %d scores (%d >= 0.5)", len(scores), sum(1 for v in scores.values() if v >= 0.5))
    except Exception as exc:
        logger.warning("EPSS parse error: %s", exc)
    return scores


# ── NVD loader ────────────────────────────────────────────────────────────────

def load_nvd(cache_dir: str | Path = "ml/data") -> list[dict]:
    cache = Path(cache_dir)
    records: list[dict] = []
    for year in _NVD_YEARS:
        url = f"{_NVD_RELEASE_BASE}/CVE-{year}.json.xz"
        dest = cache / f"CVE-{year}.json.xz"
        try:
            _download(url, dest)
        except RuntimeError as e:
            logger.warning("Skipping NVD %s: %s", year, e)
            continue
        logger.info("Parsing NVD %s…", year)
        with lzma.open(dest, "rt", encoding="utf-8") as fh:
            raw = json.load(fh)
        cve_items = (
            raw if isinstance(raw, list)
            else raw.get("cve_items", raw.get("CVE_Items", raw.get("vulnerabilities", [])))
        )
        for item in cve_items:
            rec = _parse_nvd_item(item)
            if rec:
                records.append(rec)
    logger.info("NVD: loaded %d records", len(records))
    return records


def _parse_nvd_item(item: Any) -> dict | None:
    try:
        if "cve" in item and isinstance(item["cve"], dict):
            cve_node = item["cve"]
        else:
            cve_node = item

        cve_id = cve_node.get("id") or cve_node.get("CVE_data_meta", {}).get("ID", "")
        if not cve_id:
            return None

        desc = ""
        descs = cve_node.get("descriptions", []) or cve_node.get("description", {}).get("description_data", [])
        for d in descs:
            lang = d.get("lang", "en")
            if lang in ("en", "en-US"):
                val = d.get("value", "")
                if val and len(val) >= 20:
                    desc = val
                    break
        if not desc or len(desc) < 20:
            return None

        cvss_score: float | None = None
        attack_vector = ""
        metrics = cve_node.get("metrics", {})
        for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            entries = metrics.get(key, [])
            if entries:
                entry = entries[0]
                cvss_data = entry.get("cvssData", entry)
                score = cvss_data.get("baseScore")
                if score is not None:
                    cvss_score = float(score)
                    attack_vector = str(cvss_data.get("attackVector", cvss_data.get("accessVector", "")))
                    break
        if cvss_score is None:
            impact = item.get("impact", {})
            for k in ("baseMetricV3", "baseMetricV2"):
                node = impact.get(k, {})
                cv = node.get("cvssV3", node.get("cvssV2", {}))
                if cv:
                    cvss_score = float(cv.get("baseScore", 0))
                    attack_vector = str(cv.get("attackVector", cv.get("accessVector", "")))
                    break

        cwe_ids: list[str] = []
        for w in cve_node.get("weaknesses", []):
            for d in w.get("description", []):
                val = d.get("value", "")
                if val.startswith("CWE-"):
                    cwe_ids.append(val)
        if not cwe_ids:
            for pt in cve_node.get("problemtype", {}).get("problemtype_data", []):
                for d in pt.get("description", []):
                    val = d.get("value", "")
                    if val.startswith("CWE-"):
                        cwe_ids.append(val)

        risk_level = cvss_to_risk(cvss_score)
        asset_category = _DEFAULT_ASSET
        for cwe in cwe_ids:
            if cwe in CWE_TO_ASSET:
                asset_category = CWE_TO_ASSET[cwe]
                break
        attack_phase = description_to_phase(desc)

        # Attempt to extract vendor/product hints from description for richer features
        vendor, product = _extract_vendor_product(desc)

        return {
            "cve_id": cve_id,
            "description": desc,
            "cvss_score": cvss_score or 0.0,
            "attack_vector": attack_vector,
            "cwe_ids": cwe_ids,
            "cwe_primary": cwe_ids[0] if cwe_ids else "",
            "risk_level": risk_level,
            "asset_category": asset_category,
            "attack_phase": attack_phase,
            "vendor": vendor,
            "product": product,
        }
    except Exception:
        return None


# Common vendor/product hints used to enrich features (kept short — model derives the rest)
_VENDOR_HINTS = [
    "apache", "nginx", "microsoft", "cisco", "oracle", "ibm", "vmware", "adobe",
    "google", "mozilla", "linux", "redhat", "debian", "ubuntu", "fortinet",
    "paloalto", "checkpoint", "sonicwall", "f5", "atlassian", "jenkins", "gitlab",
    "wordpress", "drupal", "joomla", "magento", "openssl", "openssh", "samba",
    "mysql", "postgresql", "mongodb", "redis", "elasticsearch", "kafka", "rabbitmq",
    "tomcat", "jboss", "weblogic", "websphere", "struts", "spring", "log4j",
    "node", "django", "flask", "rails", "phpmyadmin", "wireshark", "splunk",
]


def _extract_vendor_product(text: str) -> tuple[str, str]:
    """Return (vendor, product) lowercase strings extracted heuristically from text."""
    lower = text.lower()
    vendor = ""
    for v in _VENDOR_HINTS:
        if v in lower:
            vendor = v
            break
    # Product = first capitalized word group near the vendor (fallback to vendor)
    return vendor, vendor


# ── MITRE ATT&CK loader ───────────────────────────────────────────────────────

def load_attack(cache_dir: str | Path = "ml/data") -> dict:
    cache = Path(cache_dir)
    dest = cache / "enterprise-attack.json"
    _download(_MITRE_URL, dest)
    logger.info("Parsing MITRE ATT&CK STIX…")
    with open(dest, encoding="utf-8") as fh:
        bundle = json.load(fh)

    objects = bundle.get("objects", [])

    _KILL_CHAIN_ORDER = [
        "reconnaissance", "resource-development", "initial-access",
        "execution", "persistence", "privilege-escalation",
        "defense-evasion", "credential-access", "discovery",
        "lateral-movement", "collection", "command-and-control",
        "exfiltration", "impact",
    ]

    techniques: list[dict] = []
    service_ttp_map: dict[str, list[str]] = {}

    for obj in objects:
        if obj.get("type") != "attack-pattern":
            continue
        tech_id = ""
        for ref in obj.get("external_references", []):
            if ref.get("source_name") == "mitre-attack":
                tech_id = ref.get("external_id", "")
                break
        if not tech_id:
            continue
        name = obj.get("name", "")
        desc = obj.get("description", "")[:500]
        platforms = obj.get("x_mitre_platforms", [])
        tactics = [
            kcp.get("phase_name", "")
            for kcp in obj.get("kill_chain_phases", [])
            if kcp.get("kill_chain_name") == "mitre-attack"
        ]
        keywords = _extract_attack_keywords(name + " " + desc)
        for kw in keywords:
            service_ttp_map.setdefault(kw, []).append(tech_id)
        techniques.append({
            "id": tech_id,
            "name": name,
            "description": desc,
            "tactics": tactics,
            "platforms": platforms,
            "keywords": keywords,
        })

    # Merge in the curated service→TTP map so suggester is not limited to keywords
    # that happen to appear in ATT&CK technique descriptions.
    for svc, ttps in CURATED_SERVICE_TTP_MAP.items():
        existing = set(service_ttp_map.get(svc, []))
        for tid in ttps:
            if tid not in existing:
                service_ttp_map.setdefault(svc, []).append(tid)

    tactic_transitions: dict[str, dict[str, float]] = {}
    for i, tactic in enumerate(_KILL_CHAIN_ORDER):
        nexts: dict[str, float] = {}
        for j in range(i + 1, min(i + 4, len(_KILL_CHAIN_ORDER))):
            weight = 1.0 / (j - i)
            nexts[_KILL_CHAIN_ORDER[j]] = round(weight, 3)
        tactic_transitions[tactic] = nexts

    phase_to_tactic: dict[str, list[str]] = {
        "reconnaissance": ["reconnaissance", "discovery"],
        "scanning": ["reconnaissance", "discovery"],
        "exploitation": ["initial-access", "execution"],
        "post_exploitation": ["persistence", "privilege-escalation", "credential-access"],
        "lateral_movement": ["lateral-movement"],
        "exfiltration": ["exfiltration", "collection"],
        "impact": ["impact"],
        "other": ["execution"],
    }

    logger.info(
        "ATT&CK: loaded %d techniques, %d service keywords (after curated merge)",
        len(techniques), len(service_ttp_map),
    )
    return {
        "techniques": techniques,
        "tactic_order": _KILL_CHAIN_ORDER,
        "service_ttp_map": service_ttp_map,
        "tactic_transitions": tactic_transitions,
        "phase_to_tactic": phase_to_tactic,
    }


# ── Curated service / product → ATT&CK TTP map ────────────────────────────────
# This is the heart of the attack-path suggester. We map ~80 service/product
# keywords (the kind that actually show up in nmap output and in pentest reports)
# to the specific TTP IDs that are *useful* against that service.
#
# Notes:
#   - Keywords are matched as substrings against lowercased service strings
#   - Each TTP must exist in the loaded ATT&CK bundle to be useful
#   - Order doesn't matter; matching is set-union

CURATED_SERVICE_TTP_MAP: dict[str, list[str]] = {
    # ── Remote services (initial access / lateral) ────────────────────────────
    "ssh":           ["T1110", "T1110.001", "T1110.003", "T1021.004", "T1078"],
    "telnet":        ["T1110", "T1021", "T1078"],
    "rdp":           ["T1110", "T1021.001", "T1078"],
    "vnc":           ["T1110", "T1021.005"],
    "winrm":         ["T1021.006", "T1059.001"],
    "smb":           ["T1021.002", "T1110", "T1570", "T1078"],
    "netbios":       ["T1021.002", "T1018"],
    "ftp":           ["T1110", "T1021", "T1190", "T1078"],
    "tftp":          ["T1105", "T1018"],
    "rsh":           ["T1021", "T1078"],
    "rlogin":        ["T1021", "T1078"],
    # ── Web stacks ────────────────────────────────────────────────────────────
    "http":          ["T1190", "T1133", "T1059"],
    "https":         ["T1190", "T1133", "T1059"],
    "apache":        ["T1190", "T1505.003"],
    "nginx":         ["T1190", "T1505.003"],
    "iis":           ["T1190", "T1505.003", "T1059.001"],
    "tomcat":        ["T1190", "T1505.003", "T1059"],
    "jboss":         ["T1190", "T1059"],
    "weblogic":      ["T1190", "T1059"],
    "websphere":     ["T1190", "T1059"],
    "jenkins":       ["T1190", "T1078", "T1059"],
    "gitlab":        ["T1190", "T1078"],
    "wordpress":     ["T1190", "T1078"],
    "drupal":        ["T1190"],
    "joomla":        ["T1190"],
    "phpmyadmin":    ["T1190", "T1078"],
    "struts":        ["T1190"],
    "spring":        ["T1190"],
    "log4j":         ["T1190"],
    "log4shell":     ["T1190"],
    # ── Databases ─────────────────────────────────────────────────────────────
    "mysql":         ["T1190", "T1110", "T1078"],
    "mariadb":       ["T1190", "T1110", "T1078"],
    "postgresql":    ["T1190", "T1110", "T1078"],
    "postgres":      ["T1190", "T1110", "T1078"],
    "mssql":         ["T1190", "T1110", "T1078", "T1059.001"],
    "oracle-db":     ["T1190", "T1110", "T1078"],
    "mongodb":       ["T1190", "T1078"],
    "redis":         ["T1190", "T1078"],
    "elasticsearch": ["T1190", "T1078"],
    "memcached":     ["T1190"],
    "cassandra":     ["T1190", "T1078"],
    "couchdb":       ["T1190", "T1078"],
    # ── Mail ──────────────────────────────────────────────────────────────────
    "smtp":          ["T1110", "T1190", "T1566"],
    "imap":          ["T1110", "T1190"],
    "pop3":          ["T1110", "T1190"],
    "exchange":      ["T1190", "T1078"],
    # ── Name / discovery services ─────────────────────────────────────────────
    "dns":           ["T1046", "T1071.004", "T1018"],
    "ldap":          ["T1046", "T1018", "T1087.002", "T1110"],
    "kerberos":      ["T1558", "T1110.003", "T1078"],
    "snmp":          ["T1046", "T1018", "T1110"],
    "nfs":           ["T1210", "T1083"],
    # ── Windows-specific ──────────────────────────────────────────────────────
    "msrpc":         ["T1210", "T1021.002"],
    "wmi":           ["T1047", "T1021.003"],
    "psexec":        ["T1021.002", "T1570"],
    "ms-wbt-server": ["T1110", "T1021.001"],
    # ── CI/CD & DevOps ────────────────────────────────────────────────────────
    "docker":        ["T1610", "T1611", "T1078"],
    "kubernetes":    ["T1611", "T1078", "T1190"],
    "rancher":       ["T1611", "T1190"],
    "consul":        ["T1190", "T1078"],
    "etcd":          ["T1190", "T1078"],
    # ── Misc ──────────────────────────────────────────────────────────────────
    "redis-cli":     ["T1190"],
    "rabbitmq":      ["T1190", "T1078"],
    "kafka":         ["T1190", "T1078"],
    "vmware":        ["T1190", "T1078"],
    "esxi":          ["T1190", "T1078"],
    "citrix":        ["T1190", "T1078"],
    "fortinet":      ["T1190", "T1133"],
    "fortigate":     ["T1190", "T1133"],
    "checkpoint":    ["T1190", "T1133"],
    "paloalto":      ["T1190", "T1133"],
    "sonicwall":     ["T1190", "T1133"],
    "f5":            ["T1190", "T1133"],
    "openssl":       ["T1190"],
    "openssh":       ["T1110", "T1021.004", "T1078"],
    "samba":         ["T1021.002", "T1190", "T1110"],
    # ── Platform tags ─────────────────────────────────────────────────────────
    "windows":       ["T1003.001", "T1059.001", "T1021.002", "T1110", "T1078", "T1547.001"],
    "linux":         ["T1003.008", "T1059.004", "T1021.004", "T1110", "T1078", "T1098.004"],
    "macos":         ["T1003", "T1059.002", "T1078"],
}


_ATTACK_KEYWORD_LIST = list(set(CURATED_SERVICE_TTP_MAP.keys()) | {
    "ftp", "ssh", "telnet", "smtp", "dns", "http", "https", "smb", "rdp",
    "mysql", "postgresql", "oracle", "mssql", "mongodb", "redis",
    "vnc", "snmp", "nfs", "ldap", "kerberos", "winrm", "iis",
    "apache", "nginx", "tomcat", "jboss", "websphere",
    "windows", "linux", "macos", "android",
})


def _extract_attack_keywords(text: str) -> list[str]:
    """Extract service/product keywords from ATT&CK technique text for the lookup map."""
    lower = text.lower()
    return [kw for kw in _ATTACK_KEYWORD_LIST if kw in lower]


# ── Exploit-DB loader ─────────────────────────────────────────────────────────

# Map raw EDB CVE codes (semicolon-separated string) into a CVE-ID set
_CVE_RE = re.compile(r"CVE-\d{4}-\d{4,7}", re.IGNORECASE)


def load_exploitdb(cache_dir: str | Path = "ml/data") -> list[dict]:
    """
    Load Exploit-DB CSV. Now extracts:
      - verified flag (independent label signal)
      - tags (Metasploit module present)
      - linked CVE IDs (for KEV/EPSS cross-reference)
    """
    cache = Path(cache_dir)
    dest = cache / "files_exploits.csv"
    try:
        _download(_EXPLOITDB_CSV_URL, dest)
    except RuntimeError as e:
        logger.warning("Exploit-DB download failed: %s — using empty dataset", e)
        return []

    logger.info("Parsing Exploit-DB CSV…")
    records: list[dict] = []
    try:
        with open(dest, encoding="utf-8", errors="ignore") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                rec = _parse_exploitdb_row(row)
                if rec:
                    records.append(rec)
    except Exception as exc:
        logger.warning("Exploit-DB parse error: %s", exc)
        return []
    logger.info("Exploit-DB: loaded %d records", len(records))
    return records


def _parse_exploitdb_row(row: dict) -> dict | None:
    try:
        desc = row.get("description", "") or row.get("file", "") or ""
        etype = (row.get("type", "") or "").strip().lower()
        platform = (row.get("platform", "") or "").strip().lower()
        if not desc:
            return None

        verified = row.get("verified", "")
        tags = row.get("tags", "") or ""
        codes = row.get("codes", "") or ""

        cve_ids = _CVE_RE.findall(codes.upper())

        # Independent metadata — no derivation from description text
        verified_flag = 1 if verified == "1" else 0
        has_msf_module = "metasploit" in tags.lower()

        # CVSS estimate (still a feature, NOT used to derive success label)
        if etype in ("remote", "webapps"):
            cvss_est = 8.0
        elif etype == "dos":
            cvss_est = 6.5
        else:
            cvss_est = 5.0
        attack_vector = "NETWORK" if etype in ("remote", "webapps") else "LOCAL"

        return {
            "edb_id": row.get("id", ""),
            "description": desc.strip(),
            "exploit_type": etype,
            "platform": platform,
            "cvss_score": cvss_est,
            "attack_vector": attack_vector,
            "verified": verified_flag,
            "has_msf_module": int(has_msf_module),
            "cve_ids": cve_ids,
        }
    except Exception:
        return None


# ── Top-K TTP filter (for finding classifier multi-label target) ──────────────
# 858 TTP classes with 858 samples = no chance to learn. We restrict the
# multi-label target to a curated list of TTPs that are both common in pentest
# engagements AND have enough training examples in the merged dataset.

# ── Curated Metasploit module catalog (ground truth for exploit success) ──────
#
# Real-world exploit success is heavily bimodal:
#  - A small set of "trophy" modules (vsftpd backdoor, ms17_010, samba usermap,
#    distcc_exec, unrealircd backdoor, ms08_067…) hits ~90%+ of the time in a
#    pentest lab and ~50-70% in real engagements.
#  - Most EDB entries are PoC code that requires a specific build, a specific
#    config, or has bit-rotted entirely. Real-world success ≈ 5-15%.
#
# Public datasets (KEV, EPSS) tell us *whether a CVE is exploited*, not *whether
# the exploit framework module is reliable*. The two signals are correlated but
# not identical — Log4Shell is in KEV but the public modules need a callback
# host setup; vsftpd 234 backdoor isn't in KEV (too old) but the module is
# rock-solid. So we maintain a curated module-reliability catalog as a third,
# independent label signal alongside KEV and EPSS.
#
# Tier semantics (mirrors Metasploit's "Rank" field):
#   "excellent" → 0.92 — rock-solid in lab, ~75%+ in real engagements
#   "great"     → 0.80 — reliable on matching versions
#   "good"      → 0.62 — works when environment matches
#   "normal"    → 0.42 — works ~50% of time, version-sensitive
#   "average"   → 0.30 — works only with specific configurations
#   "low"       → 0.15 — works rarely; mostly DoS / unstable
#   "manual"    → 0.08 — requires significant setup or PoC-only
#
# Binary label: tier ≥ "good" → 1, else → 0.

_MSF_MODULE_CATALOG: dict[str, tuple[str, str, str]] = {
    # ── Linux/Unix remote — trophy tier ───────────────────────────────────────
    "exploit/unix/ftp/vsftpd_234_backdoor":              ("excellent", "remote",  "linux"),
    "exploit/multi/samba/usermap_script":                ("excellent", "remote",  "linux"),
    "exploit/unix/irc/unreal_ircd_3281_backdoor":        ("excellent", "remote",  "linux"),
    "exploit/unix/misc/distcc_exec":                     ("excellent", "remote",  "linux"),
    "exploit/linux/misc/jenkins_ldap_deserialize":       ("great",     "remote",  "linux"),
    "exploit/multi/http/jenkins_script_console":         ("great",     "remote",  "multi"),
    "exploit/linux/http/laravel_token_unserialize_exec": ("great",     "remote",  "linux"),
    "exploit/multi/elasticsearch/script_mvel_rce":       ("great",     "remote",  "multi"),
    "exploit/multi/elasticsearch/search_groovy_script":  ("great",     "remote",  "multi"),
    "exploit/linux/http/apache_couchdb_cmd_exec":        ("good",      "remote",  "linux"),
    "exploit/linux/http/atutor_filemanager_traversal":   ("normal",    "webapps", "linux"),
    "exploit/linux/redis/redis_replication_cmd_exec":    ("great",     "remote",  "linux"),
    "exploit/linux/postgres/postgres_copy_from_program_cmd_exec": ("great", "remote", "linux"),
    "exploit/linux/http/exim_gethostbyname_bof":         ("good",      "remote",  "linux"),
    "exploit/multi/misc/java_rmi_server":                ("excellent", "remote",  "multi"),
    "exploit/multi/misc/erlang_cookie_rce":              ("good",      "remote",  "multi"),
    # ── Windows remote — trophy tier ──────────────────────────────────────────
    "exploit/windows/smb/ms17_010_eternalblue":          ("great",     "remote",  "windows"),
    "exploit/windows/smb/ms17_010_psexec":               ("great",     "remote",  "windows"),
    "exploit/windows/smb/ms08_067_netapi":               ("great",     "remote",  "windows"),
    "exploit/windows/smb/ms06_040_netapi":               ("good",      "remote",  "windows"),
    "exploit/windows/smb/ms09_050_smb2_negotiate_func_index": ("good", "remote",  "windows"),
    "exploit/windows/smb/psexec":                        ("excellent", "remote",  "windows"),
    "exploit/windows/smb/psexec_psh":                    ("excellent", "remote",  "windows"),
    "exploit/windows/rdp/cve_2019_0708_bluekeep_rce":    ("normal",    "remote",  "windows"),
    "exploit/windows/dcerpc/ms03_026_dcom":              ("great",     "remote",  "windows"),
    "exploit/windows/iis/ms03_007_ntdll_webdav":         ("good",      "remote",  "windows"),
    "exploit/windows/http/iis_webdav_scstoragepathfromurl": ("good",   "remote",  "windows"),
    "exploit/windows/http/exchange_proxylogon_rce":      ("great",     "remote",  "windows"),
    "exploit/windows/http/exchange_proxyshell_rce":      ("great",     "remote",  "windows"),
    "exploit/windows/winrm/winrm_script_exec":           ("great",     "remote",  "windows"),
    "exploit/windows/mssql/mssql_payload":               ("good",      "remote",  "windows"),
    # ── Multi-platform web/application exploits ──────────────────────────────
    "exploit/multi/http/struts2_content_type_ognl":      ("great",     "remote",  "multi"),
    "exploit/multi/http/struts_default_action_mapper":   ("great",     "remote",  "multi"),
    "exploit/multi/http/struts2_namespace_ognl":         ("great",     "remote",  "multi"),
    "exploit/multi/http/apache_normalize_path_rce":      ("great",     "remote",  "multi"),
    "exploit/multi/http/log4shell_header_injection":     ("normal",    "remote",  "multi"),
    "exploit/multi/http/spring4shell_data_binding_rce":  ("good",      "remote",  "multi"),
    "exploit/multi/http/tomcat_mgr_upload":              ("great",     "remote",  "multi"),
    "exploit/multi/http/tomcat_mgr_deploy":              ("great",     "remote",  "multi"),
    "exploit/multi/http/tomcat_jsp_upload_bypass":       ("good",      "remote",  "multi"),
    "exploit/multi/http/jboss_invoke_deploy":            ("good",      "remote",  "multi"),
    "exploit/multi/http/jboss_deploymentfilerepository": ("good",      "remote",  "multi"),
    "exploit/multi/http/glassfish_deployer":             ("good",      "remote",  "multi"),
    "exploit/multi/http/coldfusion_rds":                 ("good",      "remote",  "multi"),
    "exploit/multi/http/wp_plugin_simple_file_list_rce": ("good",      "webapps", "multi"),
    "exploit/multi/http/joomla_http_header_rce":         ("good",      "webapps", "multi"),
    "exploit/multi/http/drupal_drupalgeddon2":           ("excellent", "webapps", "multi"),
    "exploit/multi/http/drupal_drupalgeddon3":           ("good",      "webapps", "multi"),
    "exploit/multi/http/phpmyadmin_lfi_rce":             ("good",      "webapps", "multi"),
    "exploit/multi/http/phpmyadmin_preg_replace":        ("good",      "webapps", "multi"),
    "exploit/multi/http/webmin_show_cgi_exec":           ("good",      "webapps", "multi"),
    "exploit/multi/http/php_cgi_arg_injection":          ("great",     "webapps", "multi"),
    "exploit/multi/http/wp_admin_shell_upload":          ("excellent", "webapps", "multi"),
    "exploit/multi/http/gitlab_exif_rce":                ("good",      "remote",  "multi"),
    "exploit/multi/http/jenkins_metaprogramming":        ("great",     "remote",  "multi"),
    # ── Database services ─────────────────────────────────────────────────────
    "exploit/linux/mysql/mysql_yassl_getname":           ("good",      "remote",  "linux"),
    "exploit/windows/mysql/mysql_yassl_hello":           ("good",      "remote",  "windows"),
    "exploit/linux/postgres/postgres_payload":           ("great",     "remote",  "linux"),
    "exploit/windows/postgres/postgres_payload":         ("great",     "remote",  "windows"),
    "exploit/windows/mssql/mssql_payload_sqli":          ("great",     "remote",  "windows"),
    "exploit/multi/postgres/postgres_createlang":        ("good",      "remote",  "multi"),
    # ── Mail services ─────────────────────────────────────────────────────────
    "exploit/unix/smtp/exim_gethostbyname_bof":          ("good",      "remote",  "linux"),
    "exploit/linux/smtp/haraka":                         ("good",      "remote",  "linux"),
    # ── Local privilege escalation (lower base reliability) ───────────────────
    "exploit/linux/local/dirty_cow":                     ("good",      "local",   "linux"),
    "exploit/linux/local/dirtypipe":                     ("good",      "local",   "linux"),
    "exploit/linux/local/cve_2022_0847_dirtypipe":       ("great",     "local",   "linux"),
    "exploit/linux/local/sudo_baron_samedit":            ("good",      "local",   "linux"),
    "exploit/linux/local/cve_2021_4034_pwnkit_lpe_pkexec": ("excellent", "local", "linux"),
    "exploit/linux/local/cve_2021_3493_overlayfs":       ("good",      "local",   "linux"),
    "exploit/linux/local/cve_2022_2588_route4_filter_uaf": ("normal",  "local",   "linux"),
    "exploit/linux/local/overlayfs_priv_esc":            ("normal",    "local",   "linux"),
    "exploit/linux/local/ubuntu_overlayfs_priv_esc":     ("normal",    "local",   "linux"),
    "exploit/windows/local/ms16_032_secondary_logon_handle_privesc": ("good", "local", "windows"),
    "exploit/windows/local/ms16_075_reflection":         ("normal",    "local",   "windows"),
    "exploit/windows/local/bypassuac":                   ("normal",    "local",   "windows"),
    "exploit/windows/local/bypassuac_eventvwr":          ("good",      "local",   "windows"),
    "exploit/windows/local/bypassuac_fodhelper":         ("good",      "local",   "windows"),
    "exploit/windows/local/cve_2020_1472_zerologon":     ("excellent", "local",   "windows"),
    "exploit/windows/local/cve_2021_34527_printnightmare": ("good",    "local",   "windows"),
    "exploit/windows/local/ntusermndragover":            ("normal",    "local",   "windows"),
    # ── DoS modules (always low — shell vermez) ───────────────────────────────
    "exploit/windows/dos/ms12_020_maxchannelids":        ("manual",    "dos",     "windows"),
    "exploit/windows/dos/ms15_034_ulonglongadd":         ("manual",    "dos",     "windows"),
    "exploit/windows/dos/ms17_010_smb_dos":              ("manual",    "dos",     "windows"),
    "exploit/linux/dos/nginx_dos":                       ("manual",    "dos",     "linux"),
    "exploit/multi/dos/apache_range_dos":                ("manual",    "dos",     "multi"),
    "auxiliary/dos/http/slowloris":                      ("low",       "dos",     "multi"),
    "auxiliary/dos/tcp/synflood":                        ("low",       "dos",     "multi"),
    "auxiliary/dos/windows/smb/ms10_006_negotiate_response_loop": ("manual", "dos", "windows"),
    # ── Handler / non-exploit modules (always 0) ──────────────────────────────
    "exploit/multi/handler":                             ("manual",    "remote",  "multi"),
    "auxiliary/scanner/portscan/tcp":                    ("manual",    "remote",  "multi"),
    "auxiliary/scanner/smb/smb_login":                   ("low",       "remote",  "multi"),
    "auxiliary/scanner/ssh/ssh_login":                   ("low",       "remote",  "multi"),
    # ── Brute-force aux modules (low, depends entirely on creds) ──────────────
    "auxiliary/scanner/http/tomcat_mgr_login":           ("low",       "remote",  "multi"),
    "auxiliary/scanner/mysql/mysql_login":               ("low",       "remote",  "multi"),
    "auxiliary/scanner/postgres/postgres_login":         ("low",       "remote",  "multi"),
    "auxiliary/scanner/vnc/vnc_login":                   ("low",       "remote",  "multi"),
    # ── Service backdoor / specialized ────────────────────────────────────────
    "exploit/multi/http/git_client_command_exec":        ("good",      "remote",  "multi"),
    "exploit/multi/http/rocketmq_broker_unauth":         ("good",      "remote",  "multi"),
    "exploit/unix/webapp/php_eval":                      ("good",      "webapps", "linux"),
    "exploit/unix/webapp/php_include":                   ("good",      "webapps", "linux"),
    "exploit/multi/svn/svnserve_date":                   ("normal",    "remote",  "multi"),
    "exploit/multi/misc/openview_omniback_exec":         ("normal",    "remote",  "multi"),
    "exploit/multi/misc/zenoss_showdaemonxmlconfig_exec": ("normal",   "remote",  "multi"),
    # ── Bind shells / direct shells (immediate session, very reliable) ───────
    "exploit/multi/misc/ingreslock":                     ("excellent", "remote",  "linux"),
    # ── Older but reliable Windows ────────────────────────────────────────────
    "exploit/windows/dcerpc/ms05_017_msmq":              ("good",      "remote",  "windows"),
    "exploit/windows/iis/ms01_026_dbldecode":            ("good",      "remote",  "windows"),
    "exploit/windows/wins/ms04_045_wins":                ("good",      "remote",  "windows"),
    # ── Misc commonly seen on CTFs / pentest labs ────────────────────────────
    "exploit/unix/webapp/wp_ajax_load_more_file_upload": ("good",      "webapps", "linux"),
    "exploit/multi/http/wp_responsive_thumbnail_slider_upload": ("good", "webapps", "multi"),
    "exploit/multi/http/oscommerce_installer_unauth_code_exec": ("good", "webapps", "multi"),
    # ── Manual-rank / lab-only modules (clearly unreliable) ──────────────────
    "exploit/windows/smb/ms17_010_psexec_local":         ("manual",    "local",   "windows"),
    "exploit/windows/local/cve_2019_0708_bluekeep_rce_local": ("manual", "local", "windows"),
    "exploit/multi/misc/legend_bot_exec":                ("manual",    "remote",  "multi"),
}


# Map tier → reliability score (used as soft target / calibration anchor)
_TIER_TO_SCORE: dict[str, float] = {
    "excellent": 0.92,
    "great":     0.80,
    "good":      0.62,
    "normal":    0.42,
    "average":   0.30,
    "low":       0.15,
    "manual":    0.08,
}

# Tier is success if >= "good"; else failure
_SUCCESS_TIERS = {"excellent", "great", "good"}


def load_msf_catalog() -> list[dict]:
    """Return list of curated Metasploit modules with tier-based labels."""
    rows: list[dict] = []
    for module, (tier, etype, plat) in _MSF_MODULE_CATALOG.items():
        rows.append({
            "module":        module,
            "description":   module,  # module path itself is the text feature
            "exploit_type":  etype,
            "platform":      plat,
            "cvss_score":    _cvss_for_tier(tier, etype),
            "attack_vector": "LOCAL" if etype == "local" else "NETWORK",
            "epss_score":    0.0,
            "in_kev":        0,
            "has_msf_module": 1,
            "verified":      1,
            "tier":          tier,
            "tier_score":    _TIER_TO_SCORE[tier],
            "success_label": 1 if tier in _SUCCESS_TIERS else 0,
            "source":        "msf_catalog",
        })
    logger.info("MSF catalog: %d curated modules (%d positive, %d negative)",
                len(rows),
                sum(1 for r in rows if r["success_label"] == 1),
                sum(1 for r in rows if r["success_label"] == 0))
    return rows


def _cvss_for_tier(tier: str, etype: str) -> float:
    """Plausible CVSS for a curated module (used as feature, not label)."""
    if tier == "excellent": return 9.5
    if tier == "great":     return 9.0
    if tier == "good":      return 8.0
    if tier == "normal":    return 7.0
    if tier == "average":   return 6.0
    if etype == "dos":      return 5.5
    return 4.5


# ── Module path feature extraction ────────────────────────────────────────────

_MODULE_PATH_TOKENS = frozenset({
    # Reliability signals embedded in the module path itself
    "backdoor", "usermap", "psexec", "exec", "rce", "payload",
    "deserialize", "deserial", "unserialize", "eval", "include",
    "upload", "shell_upload", "command", "cmd", "ognl",
    # Anti-signals
    "dos", "scanner", "handler", "login", "brute", "fuzz",
    "local", "privesc", "manual", "auxiliary",
    # Known-good keywords
    "vsftpd", "samba", "ms17_010", "ms08_067", "eternalblue",
    "drupalgeddon", "log4shell", "spring4shell", "proxyshell",
    "proxylogon", "zerologon", "printnightmare", "pwnkit",
    "dirtypipe", "dirty_cow", "bluekeep", "unrealircd",
    "distcc", "struts", "tomcat", "jboss", "ingreslock",
})


def extract_module_tokens(module_path: str) -> str:
    """
    Turn a module path like 'exploit/unix/ftp/vsftpd_234_backdoor' into a
    token-rich text feature: 'unix ftp vsftpd 234 backdoor vsftpd backdoor'.
    Includes both the raw tokens AND duplicates of known-signal tokens so
    they get higher TF-IDF weight.
    """
    if not module_path:
        return ""
    tokens = re.split(r"[/_\-\.]+", module_path.lower())
    tokens = [t for t in tokens if t and t not in ("exploit", "auxiliary", "post")]
    # Duplicate signal tokens to boost TF-IDF weight
    boosted = list(tokens)
    for t in tokens:
        if t in _MODULE_PATH_TOKENS:
            boosted.extend([t, t])  # x3 total
    return " ".join(boosted)


# ── Top-K TTP filter (for finding classifier multi-label target) ──────────────
# 858 TTP classes with 858 samples = no chance to learn. We restrict the
# multi-label target to a curated list of TTPs that are both common in pentest
# engagements AND have enough training examples in the merged dataset.

_PENTEST_TOP_TTPS = [
    # Initial access / execution
    "T1190", "T1133", "T1078", "T1059", "T1059.001", "T1059.003", "T1059.004",
    "T1203", "T1210",
    # Discovery
    "T1018", "T1046", "T1057", "T1083", "T1087", "T1087.001", "T1087.002",
    "T1518", "T1518.001",
    # Credential access
    "T1003", "T1003.001", "T1003.008", "T1110", "T1110.001", "T1110.003",
    "T1552", "T1552.001", "T1555", "T1558",
    # Privilege escalation
    "T1068", "T1548", "T1548.002", "T1078.003", "T1547", "T1547.001",
    # Persistence
    "T1098", "T1098.004", "T1505", "T1505.003", "T1053", "T1053.005",
    # Defense evasion
    "T1027", "T1070", "T1070.001", "T1112", "T1562", "T1562.001",
    # Lateral movement
    "T1021", "T1021.001", "T1021.002", "T1021.004", "T1021.005", "T1021.006",
    "T1570",
    # Collection / exfiltration
    "T1005", "T1041", "T1048", "T1048.003",
    # C2
    "T1071", "T1071.001", "T1090", "T1105",
    # Impact
    "T1485", "T1486", "T1498",
]
PENTEST_TOP_TTPS_SET = set(_PENTEST_TOP_TTPS)


# ── Build full training dataset ───────────────────────────────────────────────

def build_training_df(cache_dir: str | Path = "ml/data"):
    """
    Build training DataFrames with **independent labels** for the exploit model.

    Returns: (finding_df, exploit_df, attack_data)
    """
    try:
        import pandas as pd
    except ImportError:
        raise ImportError("pandas is required: pip install pandas")

    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    nvd_records = load_nvd(cache_dir)
    attack_data = load_attack(cache_dir)
    exploitdb_records = load_exploitdb(cache_dir)
    kev_cves = load_kev(cache_dir)
    epss_scores = load_epss(cache_dir)

    # ── Finding DataFrame ──────────────────────────────────────────────────
    finding_rows: list[dict] = []
    for r in nvd_records:
        ttps_for_row: list[str] = []
        d_lower = r["description"].lower()

        # NVD → ATT&CK TTP heuristics. The model needs enough positive examples
        # per class to learn; aim for >=15 positives across the dataset by
        # covering the most common pentest-relevant vulnerability classes.
        is_net = r["attack_vector"] in ("NETWORK", "ADJACENT_NETWORK")
        # Initial access / public-facing exploitation
        if is_net and any(kw in d_lower for kw in (
            "remote code exec", "rce", "command inject", "command execution",
            "arbitrary code execution", "unauthenticated", "no authentication",
        )):
            ttps_for_row.append("T1190")
        # Web injection class
        if "sql injection" in d_lower:
            ttps_for_row.append("T1190")
        if "cross-site script" in d_lower or "cross site script" in d_lower or " xss " in d_lower:
            ttps_for_row.append("T1190")
        if "server-side request forgery" in d_lower or " ssrf " in d_lower:
            ttps_for_row.append("T1190")
        # Memory corruption → exploitation for execution
        if "buffer overflow" in d_lower or "heap overflow" in d_lower or "stack overflow" in d_lower:
            ttps_for_row.append("T1203")
        if "use-after-free" in d_lower or "use after free" in d_lower:
            ttps_for_row.append("T1203")
        # Privilege escalation
        if "privilege escalat" in d_lower or "privesc" in d_lower:
            ttps_for_row.append("T1068")
        if "setuid" in d_lower or "suid" in d_lower:
            ttps_for_row.append("T1548.001")
        if "uac bypass" in d_lower or "bypass uac" in d_lower:
            ttps_for_row.append("T1548.002")
        # Credentials
        if "credential" in d_lower or "hardcoded password" in d_lower or "default credential" in d_lower:
            ttps_for_row.append("T1552")
        if "credential dump" in d_lower or "lsass" in d_lower or "ntds" in d_lower:
            ttps_for_row.append("T1003")
        if "brute force" in d_lower or "brute-force" in d_lower:
            ttps_for_row.append("T1110")
        # Discovery / recon
        if "information disclos" in d_lower or "information leak" in d_lower:
            ttps_for_row.append("T1083")
        if "directory traversal" in d_lower or "path traversal" in d_lower:
            ttps_for_row.append("T1083")
        # Persistence / web shell
        if "web shell" in d_lower or "webshell" in d_lower or "backdoor" in d_lower:
            ttps_for_row.append("T1505.003")
        # Service exploit / lateral
        if "smb" in d_lower or "samba" in d_lower:
            ttps_for_row.append("T1021.002")
        if "ssh" in d_lower:
            ttps_for_row.append("T1021.004")
        if "rdp" in d_lower or "remote desktop" in d_lower:
            ttps_for_row.append("T1021.001")
        # Deserialization → execution
        if "deserializ" in d_lower:
            ttps_for_row.append("T1203")
        # Auth bypass → Valid Accounts / public-facing
        if "authentication bypass" in d_lower or "auth bypass" in d_lower:
            ttps_for_row.append("T1078")
        # DoS → impact
        if "denial of service" in d_lower or "denial-of-service" in d_lower:
            ttps_for_row.append("T1498")
        # Defense evasion / log clearing
        if "clear log" in d_lower or "tamper" in d_lower:
            ttps_for_row.append("T1070")

        # Deduplicate while preserving order, then filter to top-K
        seen = set()
        deduped = []
        for t in ttps_for_row:
            if t not in seen and t in PENTEST_TOP_TTPS_SET:
                seen.add(t)
                deduped.append(t)
        ttps_for_row = deduped

        finding_rows.append({
            "text": r["description"],
            "cvss_score": r["cvss_score"],
            "attack_vector": r.get("attack_vector", ""),
            "exploit_type": "",
            "platform": "",
            "risk_level": r["risk_level"],
            "attack_phase": r["attack_phase"],
            "asset_category": r["asset_category"],
            "mitre_ttps": ttps_for_row,
            "cwe_primary": r.get("cwe_primary", ""),
            "vendor": r.get("vendor", ""),
        })

    # Add ATT&CK technique descriptions as additional finding samples for
    # phase/category training. Each technique only contributes a single sample
    # so we ensure they all carry their own TTP id (if it's in the top-K).
    tactic_to_phase = {
        "reconnaissance": "reconnaissance",
        "resource-development": "reconnaissance",
        "initial-access": "exploitation",
        "execution": "exploitation",
        "persistence": "post_exploitation",
        "privilege-escalation": "post_exploitation",
        "defense-evasion": "post_exploitation",
        "credential-access": "post_exploitation",
        "discovery": "scanning",
        "lateral-movement": "lateral_movement",
        "collection": "exfiltration",
        "exfiltration": "exfiltration",
        "command-and-control": "post_exploitation",
        "impact": "impact",
    }
    for tech in attack_data["techniques"]:
        if not tech["description"]:
            continue
        phase = "other"
        for t in tech.get("tactics", []):
            if t in tactic_to_phase:
                phase = tactic_to_phase[t]
                break
        ttp_id = tech["id"]
        finding_rows.append({
            "text": tech["name"] + ". " + tech["description"],
            "cvss_score": 7.0,
            "attack_vector": "NETWORK",
            "exploit_type": "",
            "platform": " ".join(tech.get("platforms", [])),
            "risk_level": "high",
            "attack_phase": phase,
            "asset_category": "service",
            "mitre_ttps": [ttp_id] if ttp_id in PENTEST_TOP_TTPS_SET else [],
            "cwe_primary": "",
            "vendor": "",
        })

    finding_df = pd.DataFrame(finding_rows)
    finding_df = finding_df.dropna(subset=["text", "risk_level"])
    finding_df["text"] = finding_df["text"].astype(str).str[:1000]

    # ── Exploit DataFrame ──────────────────────────────────────────────────
    # Label rules (strict — eliminates false-positive bias):
    #
    #   Curated MSF catalog (tier ≥ "good")        → 1
    #   Curated MSF catalog (tier ≤ "average")     → 0   (DoS, handler, brute aux, manual)
    #   etype == "dos"                             → 0   (cannot yield a shell)
    #   etype == "shellcode" / file-format-only    → 0
    #   KEV ∩ verified MSF                         → 1
    #   EPSS ≥ 0.7 AND verified MSF                → 1
    #   EPSS ≥ 0.85 alone                          → 1
    #   else                                       → 0
    #
    # We deliberately drop soft positives (EPSS 0.1-0.5 + remote + verified)
    # that an earlier version used — they were the main source of the
    # "high score on failed exploits" bias because ~30% of remote PoCs ended
    # up labeled success despite being version-locked or environment-specific.
    exploit_rows: list[dict] = []

    # 1. Curated MSF catalog — ground-truth labels from module reliability tier
    catalog_rows = load_msf_catalog()
    catalog_modules: set[str] = set()
    for r in catalog_rows:
        module = r["module"]
        catalog_modules.add(module)
        text = f"{module} {extract_module_tokens(module)}"
        exploit_rows.append({
            "text":          text,
            "module_path":   module,
            "exploit_type":  r["exploit_type"],
            "platform":      r["platform"],
            "cvss_score":    r["cvss_score"],
            "attack_vector": r["attack_vector"],
            "epss_score":    r["epss_score"],
            "in_kev":        r["in_kev"],
            "has_msf_module": r["has_msf_module"],
            "verified":      r["verified"],
            "tier_score":    r["tier_score"],
            "success_label": r["success_label"],
            "source":        "msf_catalog",
        })

    # 2. EDB rows — strict label rules
    for r in exploitdb_records:
        any_kev = any(c in kev_cves for c in r["cve_ids"])
        max_epss = max((epss_scores.get(c, 0.0) for c in r["cve_ids"]), default=0.0)
        has_msf = bool(r["has_msf_module"])
        verified = bool(r["verified"])
        etype = r["exploit_type"]

        # Hard negatives (cannot yield a shell)
        if etype in ("dos", "shellcode", "tool"):
            success = 0
        # Hard positives — KEV + verified MSF, or very-high EPSS, or KEV + EDB verified
        elif any_kev and verified:
            success = 1
        elif max_epss >= 0.85:
            success = 1
        elif any_kev and has_msf:
            success = 1
        elif max_epss >= 0.7 and verified and etype in ("remote", "webapps"):
            success = 1
        else:
            # Everything else: PoC quality, environment-specific, untrusted
            success = 0

        exploit_rows.append({
            "text":          (r["description"] + " ").lower()[:500],
            "module_path":   "",
            "exploit_type":  etype,
            "platform":      r["platform"],
            "cvss_score":    r["cvss_score"],
            "attack_vector": r["attack_vector"],
            "epss_score":    float(max_epss),
            "in_kev":        int(any_kev),
            "has_msf_module": int(has_msf),
            "verified":      int(verified),
            "tier_score":    0.0,
            "success_label": success,
            "source":        "edb",
        })

    # 3. NVD rows — strict label rules (used as additional negatives + KEV positives)
    for r in nvd_records:
        cve = r["cve_id"]
        in_kev = cve in kev_cves
        epss = epss_scores.get(cve, 0.0)
        is_net = r["attack_vector"] in ("NETWORK", "ADJACENT_NETWORK")
        etype = "remote" if is_net else "local"

        # KEV alone is a strong real-world signal; EPSS ≥ 0.85 = high real-world likelihood
        if in_kev:
            success = 1
        elif epss >= 0.85:
            success = 1
        else:
            # All other CVEs without strong real-world signal = negative.
            # We deliberately drop the soft positive (EPSS 0.1-0.6 + CVSS ≥ 8)
            # an earlier version used — it caused the model to label every
            # high-CVSS remote CVE as success.
            success = 0

        exploit_rows.append({
            "text":          r["description"].lower()[:500],
            "module_path":   "",
            "exploit_type":  etype,
            "platform":      "",
            "cvss_score":    r["cvss_score"],
            "attack_vector": r["attack_vector"],
            "epss_score":    float(epss),
            "in_kev":        int(in_kev),
            "has_msf_module": 0,
            "verified":      0,
            "tier_score":    0.0,
            "success_label": success,
            "source":        "nvd",
        })

    exploit_df = pd.DataFrame(exploit_rows)
    exploit_df = exploit_df.dropna(subset=["text"])
    exploit_df["text"] = exploit_df["text"].astype(str).str[:500]

    n_pos = int(exploit_df["success_label"].sum())
    by_source = exploit_df.groupby("source")["success_label"].agg(["sum", "count"]).to_dict()
    logger.info(
        "Built DataFrames: finding=%d rows, exploit=%d rows (success=%d, fail=%d)",
        len(finding_df), len(exploit_df), n_pos, len(exploit_df) - n_pos,
    )
    logger.info("Exploit DF by source: %s", by_source)
    return finding_df, exploit_df, attack_data
