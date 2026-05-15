"""
TIRPAN ML — Attack Path Suggester (Model 3)
============================================
Lightweight attack path suggestion engine built on:
  1. MITRE ATT&CK kill-chain tactic transition matrix (Markov probabilities)
  2. Service → TTP lookup table (keyword matching from ATT&CK descriptions)
  3. Phase-aware scoring: re-ranks suggestions based on current attack phase

No neural network — just a probability matrix + lookup dict.
Model size: <500 KB (Python dicts serialised with joblib).

Usage:
    from ml.attack_path import AttackPathSuggester
    suggester = AttackPathSuggester()
    suggester.build(attack_data)   # attack_data from datasets.load_attack()
    suggester.save("ml/models/attack_path.pkl")

    suggestions = suggester.suggest(
        current_phase="scanning",
        services=["ftp", "ssh", "smb"],
        used_ttps=["T1046"],
        top_n=5,
    )
    # → [{"ttp_id": "T1190", "ttp_name": "Exploit Public-Facing App",
    #      "tactic": "initial-access", "confidence": 0.84, "url": "..."}, ...]
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

# Map TIRPAN phase → ATT&CK tactics (1-to-many)
_TIRPAN_TO_ATTACK_TACTICS: dict[str, list[str]] = {
    "reconnaissance":   ["reconnaissance", "discovery"],
    "scanning":         ["reconnaissance", "discovery"],
    "exploitation":     ["initial-access", "execution"],
    "post_exploitation":["persistence", "privilege-escalation", "credential-access", "defense-evasion"],
    "lateral_movement": ["lateral-movement", "command-and-control"],
    "exfiltration":     ["collection", "exfiltration"],
    "impact":           ["impact"],
    "other":            ["execution"],
}

# High-value TTP IDs with known detection value for pentest
_PRIORITY_TTPS = {
    "T1190", "T1133", "T1210",   # exploitation
    "T1021", "T1021.001", "T1021.002", "T1021.004",  # lateral
    "T1003", "T1003.001",        # cred dump
    "T1059", "T1059.001", "T1059.003",  # script exec
    "T1046",                     # port scan
    "T1018",                     # remote system discovery
    "T1110",                     # brute force
    "T1071", "T1071.001",        # C2
    "T1041", "T1048",            # exfil
}


@dataclass
class TTPSuggestion:
    ttp_id: str
    ttp_name: str
    tactic: str
    confidence: float
    url: str = field(default="")

    def to_dict(self) -> dict:
        return {
            "ttp_id":     self.ttp_id,
            "ttp_name":   self.ttp_name,
            "tactic":     self.tactic,
            "confidence": self.confidence,
            "url":        self.url or f"https://attack.mitre.org/techniques/{self.ttp_id.replace('.', '/')}",
        }


class AttackPathSuggester:
    """
    Suggest next MITRE ATT&CK techniques given current attack context.
    """

    def __init__(self) -> None:
        self._techniques: list[dict] = []
        self._service_ttp_map: dict[str, list[str]] = {}
        self._tactic_transitions: dict[str, dict[str, float]] = {}
        self._ttp_by_id: dict[str, dict] = {}
        self._built = False

    # ── Build / Save / Load ────────────────────────────────────────────────

    def build(self, attack_data: dict) -> None:
        """
        Build the suggester from datasets.load_attack() output.
        """
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
    ) -> list[TTPSuggestion]:
        """
        Return top-N TTP suggestions for the current attack context.

        Parameters
        ----------
        current_phase : TIRPAN phase name (e.g. "scanning", "exploitation")
        services      : list of discovered service keywords (e.g. ["ftp", "ssh"])
        used_ttps     : list of TTP IDs already used/observed
        top_n         : number of suggestions to return
        host_count    : number of live hosts discovered in scope
        has_shell     : whether at least one shell/session has been opened
        """
        if not self._built:
            return _fallback_suggestions(current_phase, top_n, host_count, has_shell)

        services = [s.lower() for s in (services or [])]
        used_ttps = set(used_ttps or [])

        # ── Environment-aware tactic exclusions ────────────────────────────
        # Lateral movement requires multiple hosts; suggesting it with 1 host
        # misleads the agent and wastes time.
        excluded_tactics: set[str] = set()
        if host_count <= 1:
            excluded_tactics.add("lateral-movement")
        # Post-exploitation TTPs (persistence, C2, collection) only make sense
        # once a foothold exists.
        if not has_shell and current_phase in ("reconnaissance", "scanning"):
            excluded_tactics.update({"persistence", "command-and-control", "collection", "exfiltration"})

        # ── Step 1: candidate TTPs from service keyword lookup ─────────────
        service_ttps: dict[str, float] = {}
        for svc in services:
            for kw, ttp_list in self._service_ttp_map.items():
                if kw in svc or svc in kw:
                    for tid in ttp_list:
                        service_ttps[tid] = service_ttps.get(tid, 0.0) + 1.0

        # Normalise service match scores
        max_svc = max(service_ttps.values(), default=1.0)
        service_scores: dict[str, float] = {
            tid: v / max_svc for tid, v in service_ttps.items()
        }

        # ── Step 2: phase-forward TTPs from tactic transitions ─────────────
        current_tactics = _TIRPAN_TO_ATTACK_TACTICS.get(current_phase, ["execution"])
        forward_tactic_weights: dict[str, float] = {}

        for ct in current_tactics:
            transitions = self._tactic_transitions.get(ct, {})
            for tactic, weight in transitions.items():
                forward_tactic_weights[tactic] = max(
                    forward_tactic_weights.get(tactic, 0.0), weight
                )

        # Also include current tactics themselves
        for ct in current_tactics:
            forward_tactic_weights[ct] = max(forward_tactic_weights.get(ct, 0.0), 1.0)

        # ── Step 3: score all techniques ───────────────────────────────────
        scored: list[tuple[float, dict]] = []
        for tech in self._techniques:
            tid = tech["id"]
            if tid in used_ttps:
                continue

            tactics = tech.get("tactics", [])
            tac = tactics[0] if tactics else ""

            # Skip tactics excluded by environment context
            if tac in excluded_tactics:
                continue

            # Tactic-forward score
            tac_score = forward_tactic_weights.get(tac, 0.0)
            if tac_score == 0.0:
                continue  # Not relevant for current phase

            # Service match score
            svc_score = service_scores.get(tid, 0.0)

            # Priority boost
            priority_boost = 0.15 if tid in _PRIORITY_TTPS else 0.0

            # Sub-technique penalty (prefer parent techniques in suggestion)
            sub_penalty = -0.05 if "." in tid else 0.0

            total = (tac_score * 0.5) + (svc_score * 0.35) + priority_boost + sub_penalty
            scored.append((total, tech))

        # Sort descending by score
        scored.sort(key=lambda x: -x[0])

        results: list[TTPSuggestion] = []
        seen_bases: set[str] = set()
        for score, tech in scored:
            if len(results) >= top_n:
                break
            tid = tech["id"]
            base = tid.split(".")[0]
            # Deduplicate: skip subtechnique if parent already included
            if base in seen_bases and "." in tid:
                continue
            seen_bases.add(base)
            tac = (tech.get("tactics") or ["unknown"])[0]
            results.append(TTPSuggestion(
                ttp_id=tid,
                ttp_name=tech["name"],
                tactic=tac,
                confidence=round(min(score, 1.0), 3),
            ))

        # Fallback: if no results, use phase-based defaults
        if not results:
            return _fallback_suggestions(current_phase, top_n, host_count, has_shell)

        return results

    def suggest_from_session(self, session: dict, top_n: int = 8) -> list[TTPSuggestion]:
        """
        Convenience wrapper — extracts context from a TIRPAN session dict.
        """
        import json as _json

        # Extract current phase from mission context
        mc = session.get("mission_context") or {}
        if isinstance(mc, str):
            try:
                mc = _json.loads(mc)
            except Exception:
                mc = {}

        phase = mc.get("current_phase", "scanning")

        # Extract services and host count from scan results
        services: list[str] = []
        host_ips: set[str] = set()
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
                for port in host.get("ports", []):
                    svc = port.get("service", "")
                    if svc:
                        services.append(svc.lower())

        host_count = max(len(host_ips), 1)

        # Extract used TTPs from vulnerabilities _cls
        used_ttps: list[str] = []
        for vuln in session.get("vulnerabilities", []):
            cls = vuln.get("_cls", {})
            used_ttps.extend(cls.get("mitre_ttps", []))

        # Check whether a shell exists
        has_shell = any(
            e.get("session_opened") or e.get("success")
            for e in session.get("exploits", [])
        )

        return self.suggest(
            current_phase=phase,
            services=list(set(services)),
            used_ttps=used_ttps,
            top_n=top_n,
            host_count=host_count,
            has_shell=has_shell,
        )

    @property
    def is_built(self) -> bool:
        return self._built


# ── Fallback ──────────────────────────────────────────────────────────────────

_PHASE_FALLBACK_TTPS: dict[str, list[tuple[str, str, str]]] = {
    "reconnaissance":   [
        ("T1595", "Active Scanning", "reconnaissance"),
        ("T1590", "Gather Victim Network Info", "reconnaissance"),
        ("T1046", "Network Service Discovery", "discovery"),
    ],
    "scanning":         [
        ("T1046", "Network Service Discovery", "discovery"),
        ("T1595", "Active Scanning", "reconnaissance"),
        ("T1133", "External Remote Services", "initial-access"),
    ],
    "exploitation":     [
        ("T1190", "Exploit Public-Facing Application", "initial-access"),
        ("T1210", "Exploitation of Remote Services", "lateral-movement"),
        ("T1059", "Command and Scripting Interpreter", "execution"),
        ("T1110", "Brute Force", "credential-access"),
    ],
    "post_exploitation":[
        ("T1003", "OS Credential Dumping", "credential-access"),
        ("T1059", "Command and Scripting Interpreter", "execution"),
        ("T1053", "Scheduled Task/Job", "persistence"),
        ("T1083", "File and Directory Discovery", "discovery"),
    ],
    "lateral_movement": [
        ("T1021", "Remote Services", "lateral-movement"),
        ("T1021.001", "Remote Desktop Protocol", "lateral-movement"),
        ("T1021.002", "SMB/Windows Admin Shares", "lateral-movement"),
        ("T1021.004", "SSH", "lateral-movement"),
    ],
    "exfiltration":     [
        ("T1041", "Exfiltration Over C2 Channel", "exfiltration"),
        ("T1048", "Exfiltration Over Alternative Protocol", "exfiltration"),
        ("T1005", "Data from Local System", "collection"),
    ],
    "impact":           [
        ("T1485", "Data Destruction", "impact"),
        ("T1486", "Data Encrypted for Impact", "impact"),
        ("T1498", "Network Denial of Service", "impact"),
    ],
}


def _fallback_suggestions(
    phase: str,
    top_n: int,
    host_count: int = 1,
    has_shell: bool = False,
) -> list[TTPSuggestion]:
    ttps = _PHASE_FALLBACK_TTPS.get(phase, _PHASE_FALLBACK_TTPS["exploitation"])
    results = []
    for i, (tid, name, tactic) in enumerate(ttps[:top_n]):
        # Apply same environment-aware filtering as the main path
        if tactic == "lateral-movement" and host_count <= 1:
            continue
        if tactic in ("persistence", "command-and-control", "collection", "exfiltration") \
                and not has_shell and phase in ("reconnaissance", "scanning"):
            continue
        conf = round(0.7 - i * 0.05, 2)
        results.append(TTPSuggestion(ttp_id=tid, ttp_name=name, tactic=tactic, confidence=conf))
    return results


# ── Module-level singleton ────────────────────────────────────────────────────

_instance: AttackPathSuggester | None = None


def get_attack_path_suggester() -> AttackPathSuggester | None:
    """Return loaded suggester or None if model file missing."""
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
