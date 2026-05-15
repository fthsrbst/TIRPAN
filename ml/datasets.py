"""
TIRPAN ML — Dataset Downloader & Preprocessor
===============================================
Downloads and preprocesses training data from three public sources:

1. NVD CVE JSON (fkie-cad mirror) — ~150k CVEs with CVSS + CWE + description
2. MITRE ATT&CK STIX v19          — technique descriptions, kill-chain, platforms
3. Exploit-DB CSV                  — exploit type, platform, application

Usage:
    from ml.datasets import load_nvd, load_attack, load_exploitdb, build_training_df
    df = build_training_df(cache_dir="ml/data")
"""

from __future__ import annotations

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
_NVD_YEARS = ["2022", "2023", "2024"]  # ~150k CVEs

_MITRE_URL = (
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data"
    "/master/enterprise-attack/enterprise-attack.json"
)

_EXPLOITDB_CSV_URL = (
    "https://gitlab.com/exploit-database/exploitdb/-/raw/main/files_exploits.csv"
)

# ── CWE → asset_category mapping ─────────────────────────────────────────────

CWE_TO_ASSET: dict[str, str] = {
    # Web application
    "CWE-79": "web_application",   # XSS
    "CWE-80": "web_application",   # Basic XSS
    "CWE-83": "web_application",   # XSS in URI
    "CWE-87": "web_application",   # XSS bypass
    "CWE-116": "web_application",  # encoding
    "CWE-352": "web_application",  # CSRF
    "CWE-601": "web_application",  # Open redirect
    "CWE-918": "web_application",  # SSRF
    "CWE-611": "web_application",  # XXE
    "CWE-74": "web_application",   # Injection
    # Data / SQL
    "CWE-89": "data",              # SQL injection
    "CWE-90": "data",              # LDAP injection
    "CWE-943": "data",             # NoSQL injection
    "CWE-209": "data",             # Info exposure via error
    "CWE-200": "data",             # Info exposure
    "CWE-540": "data",             # Info in source
    "CWE-312": "data",             # Cleartext storage
    "CWE-311": "data",             # Missing encryption
    # Authentication
    "CWE-287": "authentication",   # Improper auth
    "CWE-306": "authentication",   # Missing auth
    "CWE-307": "authentication",   # Brute force
    "CWE-521": "authentication",   # Weak password
    "CWE-522": "authentication",   # Insufficiently protected creds
    "CWE-620": "authentication",   # Unverified password change
    "CWE-640": "authentication",   # Weak password recovery
    "CWE-384": "authentication",   # Session fixation
    "CWE-613": "authentication",   # Insufficient session expiry
    # Operating system / memory
    "CWE-119": "operating_system", # Buffer overflow
    "CWE-120": "operating_system", # Classic buffer overflow
    "CWE-121": "operating_system", # Stack overflow
    "CWE-122": "operating_system", # Heap overflow
    "CWE-125": "operating_system", # OOB read
    "CWE-787": "operating_system", # OOB write
    "CWE-416": "operating_system", # Use after free
    "CWE-415": "operating_system", # Double free
    "CWE-190": "operating_system", # Integer overflow
    "CWE-362": "operating_system", # Race condition
    "CWE-269": "operating_system", # Privilege escalation
    "CWE-732": "operating_system", # Incorrect permission
    # Network
    "CWE-400": "network",          # Resource exhaustion / DoS
    "CWE-770": "network",          # Allocation without limits
    "CWE-369": "network",          # Divide by zero
    "CWE-20": "network",           # Improper input validation
    "CWE-400": "network",          # DoS
}

_DEFAULT_ASSET = "service"

# ── CVSS → risk_level mapping ─────────────────────────────────────────────────

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

_PHASE_KEYWORDS: list[tuple[str, str]] = [
    ("exfiltrat", "exfiltration"),
    ("lateral movement", "lateral_movement"),
    ("privilege escalat", "post_exploitation"),
    ("credential dump", "post_exploitation"),
    ("remote code exec", "exploitation"),
    ("arbitrary code", "exploitation"),
    ("command inject", "exploitation"),
    ("sql inject", "exploitation"),
    ("cross-site", "exploitation"),
    ("buffer overflow", "exploitation"),
    ("heap overflow", "exploitation"),
    ("use-after-free", "exploitation"),
    ("denial of service", "impact"),
    ("denial-of-service", "impact"),
    (" dos ", "impact"),
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


# ── Downloader helpers ────────────────────────────────────────────────────────

def _download(url: str, dest: Path, retries: int = 3) -> Path:
    """Download url to dest with retry/resume support."""
    if dest.exists() and dest.stat().st_size > 0:
        logger.info("Cache hit: %s", dest.name)
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            logger.info("Downloading %s (attempt %d)…", url, attempt)
            resp = requests.get(url, timeout=120, stream=True)
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


# ── NVD loader ────────────────────────────────────────────────────────────────

def load_nvd(cache_dir: str | Path = "ml/data") -> list[dict]:
    """
    Load CVE records from NVD JSON feeds (fkie-cad mirror).

    Returns list of dicts with keys:
        cve_id, description, cvss_score, attack_vector,
        cwe_ids, risk_level, asset_category, attack_phase
    """
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
    """Parse a single NVD CVE item into a flat training record.

    Handles two formats:
    - fkie-cad release feed: items are top-level dicts with id/descriptions/metrics/weaknesses
    - Legacy NVD feed: items have a "cve" wrapper key
    """
    try:
        # Detect format: if item has "id" or "CVE_data_meta" at top level → direct format
        # If item has "cve" key → wrapper format
        if "cve" in item and isinstance(item["cve"], dict):
            cve_node = item["cve"]
        else:
            cve_node = item

        # CVE ID
        cve_id = (
            cve_node.get("id")
            or cve_node.get("CVE_data_meta", {}).get("ID", "")
        )
        if not cve_id:
            return None

        # Description (English)
        desc = ""
        descs = cve_node.get("descriptions", [])
        if not descs:
            # Legacy format
            descs = cve_node.get("description", {}).get("description_data", [])
        for d in descs:
            lang = d.get("lang", "en")
            if lang in ("en", "en-US"):
                val = d.get("value", "")
                if val and len(val) >= 20:
                    desc = val
                    break

        if not desc or len(desc) < 20:
            return None

        # CVSS score
        cvss_score: float | None = None
        attack_vector = ""
        metrics = cve_node.get("metrics", {})
        for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            entries = metrics.get(key, [])
            if entries:
                entry = entries[0]
                # Try cvssData sub-dict first (NVD 2.0 format)
                cvss_data = entry.get("cvssData", entry)
                score = cvss_data.get("baseScore")
                if score is not None:
                    cvss_score = float(score)
                    attack_vector = str(cvss_data.get("attackVector", cvss_data.get("accessVector", "")))
                    break

        # Legacy CVSS (some older feeds)
        if cvss_score is None:
            impact = item.get("impact", {})
            for k in ("baseMetricV3", "baseMetricV2"):
                node = impact.get(k, {})
                cv = node.get("cvssV3", node.get("cvssV2", {}))
                if cv:
                    cvss_score = float(cv.get("baseScore", 0))
                    attack_vector = str(cv.get("attackVector", cv.get("accessVector", "")))
                    break

        # CWE IDs
        cwe_ids: list[str] = []
        weaknesses = cve_node.get("weaknesses", [])
        for w in weaknesses:
            for d in w.get("description", []):
                val = d.get("value", "")
                if val.startswith("CWE-"):
                    cwe_ids.append(val)
        if not cwe_ids:
            prob_type = cve_node.get("problemtype", {})
            for pt in prob_type.get("problemtype_data", []):
                for d in pt.get("description", []):
                    val = d.get("value", "")
                    if val.startswith("CWE-"):
                        cwe_ids.append(val)

        # Derive labels
        risk_level = cvss_to_risk(cvss_score)
        asset_category = _DEFAULT_ASSET
        for cwe in cwe_ids:
            if cwe in CWE_TO_ASSET:
                asset_category = CWE_TO_ASSET[cwe]
                break
        attack_phase = description_to_phase(desc)

        return {
            "cve_id": cve_id,
            "description": desc,
            "cvss_score": cvss_score or 0.0,
            "attack_vector": attack_vector,
            "cwe_ids": cwe_ids,
            "risk_level": risk_level,
            "asset_category": asset_category,
            "attack_phase": attack_phase,
        }
    except Exception:
        return None


# ── MITRE ATT&CK loader ───────────────────────────────────────────────────────

def load_attack(cache_dir: str | Path = "ml/data") -> dict:
    """
    Load MITRE ATT&CK Enterprise STIX bundle.

    Returns:
        {
          "techniques": [{"id", "name", "description", "tactics", "platforms", "keywords"}, ...],
          "tactic_order": ["reconnaissance", "resource-development", ...],
          "service_ttp_map": {"ftp": ["T1021.004", ...], ...},
          "tactic_transitions": {"reconnaissance": {"initial-access": 0.8, ...}, ...},
        }
    """
    cache = Path(cache_dir)
    dest = cache / "enterprise-attack.json"
    _download(_MITRE_URL, dest)

    logger.info("Parsing MITRE ATT&CK STIX…")
    with open(dest, encoding="utf-8") as fh:
        bundle = json.load(fh)

    objects = bundle.get("objects", [])

    # Extract tactic ordering from x-mitre-collection or x-mitre-tactic
    tactic_order: list[str] = []
    tactic_short_names: dict[str, str] = {}  # tactic_ref → short_name
    for obj in objects:
        if obj.get("type") == "x-mitre-tactic":
            sn = obj.get("x_mitre_shortname", "")
            tactic_short_names[obj.get("id", "")] = sn

    # ATT&CK kill-chain tactic order (Enterprise)
    _KILL_CHAIN_ORDER = [
        "reconnaissance", "resource-development", "initial-access",
        "execution", "persistence", "privilege-escalation",
        "defense-evasion", "credential-access", "discovery",
        "lateral-movement", "collection", "command-and-control",
        "exfiltration", "impact",
    ]

    # Extract techniques
    techniques: list[dict] = []
    service_ttp_map: dict[str, list[str]] = {}

    for obj in objects:
        if obj.get("type") != "attack-pattern":
            continue
        if obj.get("x_mitre_is_subtechnique") and not obj.get("x_mitre_deprecated"):
            pass  # include subtechniques

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

        # Build keyword list from name + description for service mapping
        keywords = _extract_keywords(name + " " + desc)
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

    # Build tactic transition matrix from kill-chain ordering
    tactic_transitions: dict[str, dict[str, float]] = {}
    for i, tactic in enumerate(_KILL_CHAIN_ORDER):
        nexts: dict[str, float] = {}
        # Strong forward transitions (next 1-3 tactics in chain)
        for j in range(i + 1, min(i + 4, len(_KILL_CHAIN_ORDER))):
            weight = 1.0 / (j - i)  # 1.0, 0.5, 0.33…
            nexts[_KILL_CHAIN_ORDER[j]] = round(weight, 3)
        tactic_transitions[tactic] = nexts

    # Map TIRPAN phase names to ATT&CK tactic names
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

    logger.info("ATT&CK: loaded %d techniques, %d service keywords", len(techniques), len(service_ttp_map))
    return {
        "techniques": techniques,
        "tactic_order": _KILL_CHAIN_ORDER,
        "service_ttp_map": service_ttp_map,
        "tactic_transitions": tactic_transitions,
        "phase_to_tactic": phase_to_tactic,
    }


_SERVICE_KEYWORDS = [
    "ftp", "ssh", "telnet", "smtp", "dns", "http", "https", "smb", "rdp",
    "mysql", "postgresql", "oracle", "mssql", "mongodb", "redis",
    "vnc", "snmp", "nfs", "ldap", "kerberos", "winrm", "iis",
    "apache", "nginx", "tomcat", "jboss", "websphere",
    "windows", "linux", "macos", "android",
]


def _extract_keywords(text: str) -> list[str]:
    lower = text.lower()
    return [kw for kw in _SERVICE_KEYWORDS if kw in lower]


# ── Exploit-DB loader ─────────────────────────────────────────────────────────

def load_exploitdb(cache_dir: str | Path = "ml/data") -> list[dict]:
    """
    Load Exploit-DB CSV file.

    Returns list of dicts with keys:
        edb_id, description, exploit_type, platform, cvss_score (estimated),
        success_label (1 = likely successful, 0 = not)
    """
    cache = Path(cache_dir)
    dest = cache / "files_exploits.csv"
    try:
        _download(_EXPLOITDB_CSV_URL, dest)
    except RuntimeError as e:
        logger.warning("Exploit-DB download failed: %s — using empty dataset", e)
        return []

    logger.info("Parsing Exploit-DB CSV…")
    import csv
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

        desc_lower = desc.lower()

        # CVSS estimate based on exploit type
        if etype in ("remote", "webapps"):
            cvss_est = 8.0
        elif etype == "dos":
            cvss_est = 6.5
        else:
            cvss_est = 5.0

        attack_vector = "NETWORK" if etype in ("remote", "webapps") else "LOCAL"

        # Realistic success labeling: only mark as success=1 for exploits that
        # are highly likely to succeed in a real pentest.
        # EDB has ~50k entries but most are PoCs, not weaponised — real success
        # rate in actual engagements is ~25-35% for remote, lower for others.
        #
        # Heuristic: success=1 when the exploit targets a well-known, reliable
        # vulnerability class (not just "is remote"). This creates a ~30% success
        # rate in the training set, matching empirical pentest data.
        HIGH_RELIABILITY_PATTERNS = [
            "backdoor", "buffer overflow", "remote code exec", "rce",
            "command inject", "sql injection", "arbitrary code",
            "metasploit", "vsftpd", "samba", "unrealircd", "eternalblue",
            "ms17-010", "distcc", "jboss", "struts", "shellshock",
        ]
        is_reliable = any(p in desc_lower for p in HIGH_RELIABILITY_PATTERNS)

        if etype in ("remote", "webapps"):
            # Only ~30% of remote exploits succeed: require a reliable pattern
            success = 1 if is_reliable else 0
        elif etype == "local":
            # Local exploits require pre-existing access; rarely succeed standalone
            success = 1 if (is_reliable and "privilege" in desc_lower) else 0
        else:
            success = 0

        return {
            "edb_id": row.get("id", ""),
            "description": desc.strip(),
            "exploit_type": etype,
            "platform": platform,
            "cvss_score": cvss_est,
            "attack_vector": attack_vector,
            "success_label": success,
        }
    except Exception:
        return None


# ── Combined training DataFrame builder ──────────────────────────────────────

def build_training_df(cache_dir: str | Path = "ml/data"):
    """
    Download all datasets and return two DataFrames:
        - finding_df: for FindingClassifier training
        - exploit_df: for ExploitPredictor training

    Returns: (finding_df, exploit_df, attack_data)
    """
    try:
        import pandas as pd
    except ImportError:
        raise ImportError("pandas is required: pip install pandas")

    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Load all datasets
    nvd_records = load_nvd(cache_dir)
    attack_data = load_attack(cache_dir)
    exploitdb_records = load_exploitdb(cache_dir)

    # ── Finding DataFrame ──────────────────────────────────────────────────
    finding_rows = []
    for r in nvd_records:
        finding_rows.append({
            "text": r["description"],
            "cvss_score": r["cvss_score"],
            "attack_vector": r.get("attack_vector", ""),
            "exploit_type": "",
            "platform": "",
            "risk_level": r["risk_level"],
            "attack_phase": r["attack_phase"],
            "asset_category": r["asset_category"],
            "mitre_ttps": [],  # NVD doesn't have TTPs directly
        })

    # Add ATT&CK technique descriptions to finding_df (for TTP classification)
    for tech in attack_data["techniques"]:
        if not tech["description"]:
            continue
        phase = "other"
        tactics = tech.get("tactics", [])
        # Map ATT&CK tactic to TIRPAN phase
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
        for t in tactics:
            if t in tactic_to_phase:
                phase = tactic_to_phase[t]
                break

        finding_rows.append({
            "text": tech["name"] + " " + tech["description"],
            "cvss_score": 7.0,  # techniques are typically high-severity
            "attack_vector": "NETWORK",
            "exploit_type": "",
            "platform": " ".join(tech.get("platforms", [])),
            "risk_level": "high",
            "attack_phase": phase,
            "asset_category": "service",
            "mitre_ttps": [tech["id"]],
        })

    finding_df = pd.DataFrame(finding_rows)
    finding_df = finding_df.dropna(subset=["text", "risk_level"])
    finding_df["text"] = finding_df["text"].astype(str).str[:1000]

    # ── Exploit DataFrame ──────────────────────────────────────────────────
    exploit_rows = []
    for r in exploitdb_records:
        exploit_rows.append({
            "text": r["description"],
            "exploit_type": r["exploit_type"],
            "platform": r["platform"],
            "cvss_score": r["cvss_score"],
            "attack_vector": r["attack_vector"],
            "success_label": r["success_label"],
        })
    # NVD records: CVSS alone does NOT predict exploit success.
    # A CVE with CVSS 9.0 + NETWORK vector still only succeeds ~35% of the
    # time in real engagements (wrong version, patched, firewall, etc.).
    # Only label success=1 for CVEs that describe a clearly exploitable,
    # weaponisable vulnerability class (not just a theoretical vuln).
    _NVD_EXPLOIT_PHRASES = [
        "remote code execution", "arbitrary code execution",
        "command injection", "buffer overflow", "heap overflow",
        "use-after-free", "sql injection", "allows an attacker to execute",
        "unauthenticated", "no authentication", "backdoor",
    ]
    for r in nvd_records:
        if r["cvss_score"] > 0:
            is_net = r["attack_vector"] in ("NETWORK", "ADJACENT_NETWORK")
            etype = "remote" if is_net else "local"
            desc_lower = r["description"].lower()
            is_weaponisable = any(p in desc_lower for p in _NVD_EXPLOIT_PHRASES)
            # success=1 only for network vulns with a clearly weaponisable description
            # AND sufficiently high CVSS — keeps positive rate around 25-30%
            success = 1 if (is_net and r["cvss_score"] >= 8.0 and is_weaponisable) else 0
            exploit_rows.append({
                "text": r["description"],
                "exploit_type": etype,
                "platform": "",
                "cvss_score": r["cvss_score"],
                "attack_vector": r["attack_vector"],
                "success_label": success,
            })

    exploit_df = pd.DataFrame(exploit_rows)
    exploit_df = exploit_df.dropna(subset=["text"])
    exploit_df["text"] = exploit_df["text"].astype(str).str[:500]

    logger.info(
        "Built DataFrames: finding=%d rows, exploit=%d rows",
        len(finding_df), len(exploit_df),
    )
    return finding_df, exploit_df, attack_data
