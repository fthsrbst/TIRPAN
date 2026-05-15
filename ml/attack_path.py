"""
TIRPAN ML — Attack Path Suggester (Model 3)
============================================
Suggests the next MITRE ATT&CK techniques to try given:
  - Current attack phase
  - Discovered services / platforms
  - Already used TTPs
  - Environment size (1 host vs many)
  - Foothold state (shell opened?)

Design vs. previous version:
  * Curated service→TTP map (~80 services) instead of relying only on keywords
    that happen to appear in ATT&CK technique descriptions (which gave us 23).
  * Platform-aware filtering: Windows-only TTPs are filtered out when the
    discovered platform is unix/linux/macos, and vice versa.
  * Strict phase logic: scanning never suggests lateral-movement; recon
    only proposes recon/discovery; etc. Old code suggested T1021 on a fresh
    scan, which is nonsense.
  * Confidence scoring rebalanced to reward (a) service-match specificity and
    (b) phase-correctness over generic tactic-transition weight.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "models" / "attack_path.pkl"

# ATT&CK Enterprise kill-chain ordered list
_KILL_CHAIN_ORDER = [
    "reconnaissance", "resource-development", "initial-access",
    "execution", "persistence", "privilege-escalation",
    "defense-evasion", "credential-access", "discovery",
    "lateral-movement", "collection", "command-and-control",
    "exfiltration", "impact",
]

# Map TIRPAN phase → ATT&CK tactic *allow-list* (strict — only these tactics
# may appear in suggestions for the given phase).
_PHASE_ALLOWED_TACTICS: dict[str, set[str]] = {
    "reconnaissance":    {"reconnaissance", "discovery"},
    "scanning":          {"reconnaissance", "discovery"},
    "exploitation":      {"initial-access", "execution", "credential-access"},
    "post_exploitation": {
        "persistence", "privilege-escalation", "credential-access",
        "defense-evasion", "discovery", "collection", "execution",
    },
    "lateral_movement":  {"lateral-movement", "credential-access", "discovery"},
    "exfiltration":      {"exfiltration", "collection", "command-and-control"},
    "impact":            {"impact"},
    "other":             {"execution", "discovery"},
}

# High-value TTP IDs (used to bias score, NOT to filter)
_PRIORITY_TTPS = {
    "T1190", "T1133", "T1210", "T1078", "T1059", "T1059.001",
    "T1021", "T1021.001", "T1021.002", "T1021.004", "T1021.005",
    "T1003", "T1003.001", "T1003.008",
    "T1046", "T1018", "T1110", "T1110.001", "T1110.003",
    "T1071", "T1071.001",
    "T1041", "T1048",
    "T1068", "T1548", "T1548.002",
    "T1098", "T1505", "T1505.003",
}

# Map an ATT&CK platform string → coarse platform class
_PLATFORM_NORMALIZE = {
    "windows": "windows",
    "linux": "linux", "ubuntu": "linux", "debian": "linux", "rhel": "linux",
    "redhat": "linux", "centos": "linux", "kali": "linux", "android": "linux",
    "macos": "macos", "osx": "macos", "darwin": "macos",
    "unix": "linux", "freebsd": "linux", "solaris": "linux",
    "network": "network",
    "containers": "container", "container": "container",
    "azure": "cloud", "aws": "cloud", "gcp": "cloud", "cloud": "cloud",
    "office 365": "office", "office365": "office", "saas": "saas",
}


def _classify_platform(raw: str) -> str:
    raw_l = (raw or "").lower()
    for needle, cls in _PLATFORM_NORMALIZE.items():
        if needle in raw_l:
            return cls
    return ""


@dataclass
class TTPSuggestion:
    ttp_id: str
    ttp_name: str
    tactic: str
    confidence: float
    url: str = field(default="")
    rationale: str = field(default="")

    def to_dict(self) -> dict:
        return {
            "ttp_id":     self.ttp_id,
            "ttp_name":   self.ttp_name,
            "tactic":     self.tactic,
            "confidence": self.confidence,
            "url":        self.url or f"https://attack.mitre.org/techniques/{self.ttp_id.replace('.', '/')}",
            "rationale":  self.rationale,
        }


class AttackPathSuggester:
    def __init__(self) -> None:
        self._techniques: list[dict] = []
        self._service_ttp_map: dict[str, list[str]] = {}
        self._tactic_transitions: dict[str, dict[str, float]] = {}
        self._ttp_by_id: dict[str, dict] = {}
        self._built = False

    # ── Build / Save / Load ────────────────────────────────────────────────

    def build(self, attack_data: dict) -> None:
        self._techniques = attack_data.get("techniques", [])
        self._service_ttp_map = attack_data.get("service_ttp_map", {})
        self._tactic_transitions = attack_data.get("tactic_transitions", {})
        self._ttp_by_id = {t["id"]: t for t in self._techniques}
        self._built = True
        logger.info(
            "AttackPathSuggester built: %d techniques, %d service keywords",
            len(self._techniques), len(self._service_ttp_map),
        )

    def save(self, path: str | Path = MODEL_PATH) -> None:
        import joblib
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "techniques":         self._techniques,
            "service_ttp_map":    self._service_ttp_map,
            "tactic_transitions": self._tactic_transitions,
        }, path)
        logger.info("AttackPathSuggester saved to %s", path)

    @classmethod
    def load(cls, path: str | Path = MODEL_PATH) -> "AttackPathSuggester":
        import joblib
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Model not found: {path}")
        obj = cls()
        bundle = joblib.load(path)
        obj._techniques = bundle["techniques"]
        obj._service_ttp_map = bundle["service_ttp_map"]
        obj._tactic_transitions = bundle["tactic_transitions"]
        obj._ttp_by_id = {t["id"]: t for t in obj._techniques}
        obj._built = True
        logger.info("AttackPathSuggester loaded from %s", path)
        return obj

    # ── Core suggestion logic ──────────────────────────────────────────────

    def suggest(
        self,
        current_phase: str = "scanning",
        services: list[str] | None = None,
        used_ttps: list[str] | None = None,
        top_n: int = 8,
        host_count: int = 1,
        has_shell: bool = False,
        platforms: list[str] | None = None,
    ) -> list[TTPSuggestion]:
        """
        Suggest top-N TTPs for the current attack context.

        Parameters
        ----------
        current_phase : TIRPAN phase name
        services      : discovered service keywords (e.g. ["ftp", "ssh"])
        used_ttps     : TTP IDs already used/observed (will be deduplicated out)
        top_n         : suggestions to return
        host_count    : number of live hosts in scope
        has_shell     : True once at least one foothold is established
        platforms     : discovered OS platforms (e.g. ["linux", "windows"])
                        Filters out platform-incompatible TTPs.
        """
        if not self._built:
            return _fallback_suggestions(current_phase, top_n, host_count, has_shell, platforms)

        services = [s.lower() for s in (services or [])]
        used_ttps = set(used_ttps or [])
        platforms = [p.lower() for p in (platforms or [])]
        platform_classes = {_classify_platform(p) for p in platforms} - {""}

        # ── Phase-driven tactic allow-list ────────────────────────────────
        allowed_tactics = set(_PHASE_ALLOWED_TACTICS.get(current_phase, {"execution"}))

        # ── Environment-driven exclusions ─────────────────────────────────
        if host_count <= 1:
            # No second host = no lateral movement is meaningful
            allowed_tactics.discard("lateral-movement")
        if not has_shell and current_phase in ("reconnaissance", "scanning"):
            # No foothold means persistence/collection/exfil/C2 are premature
            for t in ("persistence", "command-and-control", "collection", "exfiltration"):
                allowed_tactics.discard(t)

        # ── Service-keyword scoring (specificity bonus) ───────────────────
        service_scores: dict[str, float] = {}
        for svc in services:
            for kw, ttp_list in self._service_ttp_map.items():
                if kw == svc or kw in svc or (len(kw) >= 4 and kw in svc):
                    for tid in ttp_list:
                        service_scores[tid] = service_scores.get(tid, 0.0) + 1.0
        # Normalize
        max_svc = max(service_scores.values(), default=1.0)
        for k in list(service_scores.keys()):
            service_scores[k] = service_scores[k] / max_svc

        # ── Phase-forward tactic weights ──────────────────────────────────
        # Slight forward bias inside the allowed tactic set
        phase_centroid = _PHASE_ALLOWED_TACTICS.get(current_phase, {"execution"})
        tactic_weights: dict[str, float] = {t: 1.0 for t in phase_centroid}
        for t in allowed_tactics:
            if t not in tactic_weights:
                tactic_weights[t] = 0.6

        # ── Score every technique ─────────────────────────────────────────
        scored: list[tuple[float, dict, str]] = []
        for tech in self._techniques:
            tid = tech["id"]
            if tid in used_ttps:
                continue
            if tid.split(".")[0] in used_ttps:
                # If parent technique was used, deprioritise its subtechs
                continue

            tactics = tech.get("tactics", [])
            tac = tactics[0] if tactics else ""
            if tac not in allowed_tactics:
                continue

            # Platform compatibility
            tech_platforms = [p.lower() for p in tech.get("platforms", [])]
            tech_classes = {_classify_platform(p) for p in tech_platforms} - {""}
            if platform_classes and tech_classes:
                # If specific platforms are known, require overlap
                if not (platform_classes & tech_classes) and "network" not in tech_classes:
                    continue

            tac_score = tactic_weights.get(tac, 0.0)
            svc_score = service_scores.get(tid, 0.0)
            priority  = 0.20 if tid in _PRIORITY_TTPS else 0.0
            sub_pen   = -0.05 if "." in tid else 0.0

            # Final score: 45% tactic-correctness, 40% service-fit, 15% priority
            total = (tac_score * 0.45) + (svc_score * 0.40) + priority + sub_pen

            # Boost when the tech also has a service match (specificity)
            if svc_score > 0.0 and tac_score > 0.0:
                total += 0.10

            if total <= 0:
                continue
            rationale_bits = []
            if svc_score > 0.0:
                rationale_bits.append(f"matches discovered service(s)")
            if priority > 0:
                rationale_bits.append("priority TTP")
            rationale = ", ".join(rationale_bits) or f"fits {current_phase} phase"

            scored.append((total, tech, rationale))

        scored.sort(key=lambda x: -x[0])

        results: list[TTPSuggestion] = []
        seen_bases: set[str] = set()
        for score, tech, rationale in scored:
            if len(results) >= top_n:
                break
            tid = tech["id"]
            base = tid.split(".")[0]
            # Deduplicate: skip sub-tech if its parent is already in results
            if base in seen_bases and "." in tid:
                continue
            seen_bases.add(base)
            tac = (tech.get("tactics") or ["unknown"])[0]
            results.append(TTPSuggestion(
                ttp_id     = tid,
                ttp_name   = tech["name"],
                tactic     = tac,
                confidence = round(min(score, 1.0), 3),
                rationale  = rationale,
            ))

        if not results:
            return _fallback_suggestions(current_phase, top_n, host_count, has_shell, platforms)
        return results

    def suggest_from_session(self, session: dict, top_n: int = 8) -> list[TTPSuggestion]:
        """Convenience wrapper that extracts context from a TIRPAN session dict."""
        import json as _json

        mc = session.get("mission_context") or {}
        if isinstance(mc, str):
            try:
                mc = _json.loads(mc)
            except Exception:
                mc = {}
        phase = mc.get("current_phase", "scanning")

        services: list[str] = []
        host_ips: set[str] = set()
        platforms_acc: list[str] = []
        for sr in session.get("scan_results", []):
            hosts_raw = sr.get("hosts_json", [])
            if isinstance(hosts_raw, str):
                try:
                    hosts_raw = _json.loads(hosts_raw)
                except Exception:
                    hosts_raw = []
            for host in hosts_raw:
                ip = host.get("ip") or host.get("host_ip", "")
                if ip:
                    host_ips.add(ip)
                os_info = host.get("os") or host.get("os_match") or host.get("osfamily", "")
                if os_info:
                    platforms_acc.append(str(os_info).lower())
                for port in host.get("ports", []):
                    svc = port.get("service", "")
                    if svc:
                        services.append(svc.lower())
        host_count = max(len(host_ips), 1)

        used_ttps: list[str] = []
        for vuln in session.get("vulnerabilities", []):
            cls = vuln.get("_cls", {})
            used_ttps.extend(cls.get("mitre_ttps", []))

        has_shell = any(
            e.get("session_opened") or e.get("success")
            for e in session.get("exploits", [])
        )

        return self.suggest(
            current_phase = phase,
            services      = list(set(services)),
            used_ttps     = used_ttps,
            top_n         = top_n,
            host_count    = host_count,
            has_shell     = has_shell,
            platforms     = list(set(platforms_acc)),
        )

    @property
    def is_built(self) -> bool:
        return self._built


# ── Fallback (used when no model is loaded or no candidates pass filters) ─────

_PHASE_FALLBACK_TTPS: dict[str, list[tuple[str, str, str, str]]] = {
    # (ttp_id, name, tactic, platform_class — empty = all)
    "reconnaissance":   [
        ("T1595", "Active Scanning",            "reconnaissance",  ""),
        ("T1590", "Gather Victim Network Info", "reconnaissance",  ""),
        ("T1046", "Network Service Discovery",  "discovery",       ""),
        ("T1018", "Remote System Discovery",    "discovery",       ""),
    ],
    "scanning":         [
        ("T1046", "Network Service Discovery",  "discovery",       ""),
        ("T1018", "Remote System Discovery",    "discovery",       ""),
        ("T1595", "Active Scanning",            "reconnaissance",  ""),
        ("T1135", "Network Share Discovery",    "discovery",       "windows"),
    ],
    "exploitation":     [
        ("T1190", "Exploit Public-Facing Application", "initial-access",   ""),
        ("T1133", "External Remote Services",          "initial-access",   ""),
        ("T1110", "Brute Force",                       "credential-access", ""),
        ("T1059", "Command and Scripting Interpreter", "execution",        ""),
        ("T1078", "Valid Accounts",                    "initial-access",   ""),
    ],
    "post_exploitation":[
        ("T1003",   "OS Credential Dumping",                "credential-access", ""),
        ("T1083",   "File and Directory Discovery",         "discovery",          ""),
        ("T1057",   "Process Discovery",                    "discovery",          ""),
        ("T1068",   "Exploitation for Privilege Escalation","privilege-escalation",""),
        ("T1053",   "Scheduled Task/Job",                   "persistence",        ""),
        ("T1059",   "Command and Scripting Interpreter",    "execution",          ""),
    ],
    "lateral_movement": [
        ("T1021",       "Remote Services",            "lateral-movement", ""),
        ("T1021.001",   "Remote Desktop Protocol",    "lateral-movement", "windows"),
        ("T1021.002",   "SMB/Windows Admin Shares",   "lateral-movement", "windows"),
        ("T1021.004",   "SSH",                        "lateral-movement", "linux"),
        ("T1570",       "Lateral Tool Transfer",      "lateral-movement", ""),
    ],
    "exfiltration":     [
        ("T1041", "Exfiltration Over C2 Channel",          "exfiltration", ""),
        ("T1048", "Exfiltration Over Alternative Protocol","exfiltration", ""),
        ("T1005", "Data from Local System",                "collection",   ""),
    ],
    "impact":           [
        ("T1485", "Data Destruction",            "impact", ""),
        ("T1486", "Data Encrypted for Impact",   "impact", ""),
        ("T1498", "Network Denial of Service",   "impact", ""),
    ],
}


def _fallback_suggestions(
    phase: str,
    top_n: int,
    host_count: int = 1,
    has_shell: bool = False,
    platforms: list[str] | None = None,
) -> list[TTPSuggestion]:
    """Static, environment-aware fallback when the model isn't loaded."""
    ttps = _PHASE_FALLBACK_TTPS.get(phase, _PHASE_FALLBACK_TTPS["exploitation"])
    platform_classes = {_classify_platform(p) for p in (platforms or [])} - {""}
    results: list[TTPSuggestion] = []
    for i, (tid, name, tactic, plat_req) in enumerate(ttps[:top_n * 2]):
        if tactic == "lateral-movement" and host_count <= 1:
            continue
        if tactic in ("persistence", "command-and-control", "collection", "exfiltration") \
                and not has_shell and phase in ("reconnaissance", "scanning"):
            continue
        if plat_req and platform_classes and plat_req not in platform_classes:
            continue
        if len(results) >= top_n:
            break
        conf = round(0.7 - i * 0.05, 2)
        results.append(TTPSuggestion(
            ttp_id     = tid,
            ttp_name   = name,
            tactic     = tactic,
            confidence = conf,
            rationale  = f"fallback for {phase}",
        ))
    return results


# ── Module-level singleton ────────────────────────────────────────────────────

_instance: AttackPathSuggester | None = None


def get_attack_path_suggester() -> AttackPathSuggester | None:
    global _instance
    if _instance is not None:
        return _instance
    if MODEL_PATH.exists():
        try:
            _instance = AttackPathSuggester.load(MODEL_PATH)
            return _instance
        except Exception as exc:
            logger.warning("Could not load AttackPathSuggester: %s", exc)
    return None


def invalidate_cache() -> None:
    global _instance
    _instance = None
