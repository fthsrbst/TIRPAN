"""
TIRPAN Defense — Attacker Profiler

Builds and maintains a behavioral profile for each hostile IP.
Tracks:
  - MITRE ATT&CK TTPs observed
  - Network knowledge (hosts/ports the attacker has enumerated)
  - Deception effectiveness (which deceptions the attacker fell for)
  - Threat actor classification (Script Kiddie → APT)
  - Kill chain position prediction
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ── Actor signatures (behavior-based classification) ──────────────────────────

ACTOR_SIGNATURES: list[dict] = [
    {
        "name": "Script Kiddie",
        "confidence_boost": 0.30,
        "indicators": {
            "noisy_scan": True,          # many ports fast
            "uses_common_tools": True,   # Metasploit defaults
            "no_lateral": True,          # stays on one host
            "quick_abort": True,         # gives up fast
        },
        "ttp_patterns": ["T1046", "T1110"],
        "description": "Automated tooling, noisy behavior, no patience",
    },
    {
        "name": "Opportunist",
        "confidence_boost": 0.35,
        "indicators": {
            "targets_known_cves": True,
            "wide_subnet_scan": True,
            "drops_payload_on_first_hit": True,
        },
        "ttp_patterns": ["T1046", "T1190", "T1053"],
        "description": "Mass exploitation, ransomware dropper, botnet recruitment",
    },
    {
        "name": "Targeted APT",
        "confidence_boost": 0.40,
        "indicators": {
            "slow_patient_scan": True,
            "living_off_land": True,   # uses built-in tools
            "lateral_movement": True,
            "credential_focus": True,
        },
        "ttp_patterns": ["T1046", "T1078", "T1021", "T1003", "T1048"],
        "description": "Sophisticated, patient, targeted — nation-state level",
    },
    {
        "name": "Ransomware Operator",
        "confidence_boost": 0.45,
        "indicators": {
            "smb_focus": True,
            "backup_discovery": True,
            "mass_file_access": True,
        },
        "ttp_patterns": ["T1021.002", "T1490", "T1486"],
        "description": "SMB scanning, backup destruction, file encryption",
    },
    {
        "name": "Insider Threat",
        "confidence_boost": 0.35,
        "indicators": {
            "internal_src_ip": True,
            "unusual_hours": True,
            "accesses_sensitive_paths": True,
        },
        "ttp_patterns": ["T1078", "T1003", "T1048"],
        "description": "Legitimate credentials, unusual access patterns",
    },
]


# ── Kill chain transition table ────────────────────────────────────────────────

KILL_CHAIN_TRANSITIONS: dict[str, list[tuple[str, float]]] = {
    "T1046": [   # Network Service Scanning
        ("T1190", 0.75),   # Exploit Public-Facing App
        ("T1110", 0.65),   # Brute Force
        ("T1595", 0.40),   # Active Scanning (continued)
    ],
    "T1190": [   # Exploit Public-Facing Application
        ("T1059", 0.85),   # Command Execution
        ("T1068", 0.60),   # Privilege Escalation
        ("T1505", 0.45),   # Web Shell
    ],
    "T1110": [   # Brute Force
        ("T1078", 0.80),   # Valid Accounts (got creds)
        ("T1021", 0.50),   # Remote Services (lateral)
        ("T1556", 0.30),   # Modify Auth Process
    ],
    "T1059": [   # Command Execution
        ("T1053", 0.75),   # Scheduled Task (persistence)
        ("T1003", 0.65),   # Credential Dumping
        ("T1068", 0.55),   # Privilege Escalation
        ("T1105", 0.50),   # Ingress Tool Transfer
    ],
    "T1003": [   # Credential Dumping
        ("T1021", 0.85),   # Remote Services (lateral with creds)
        ("T1048", 0.55),   # Exfiltration
        ("T1078", 0.45),   # Valid Accounts (reuse creds)
    ],
    "T1021": [   # Remote Services (Lateral Movement)
        ("T1486", 0.60),   # Data Encrypted for Impact (ransomware)
        ("T1048", 0.55),   # Exfiltration
        ("T1003", 0.50),   # Credential Dumping (from new host)
        ("T1053", 0.40),   # Persistence on new host
    ],
    "T1078": [   # Valid Accounts
        ("T1021", 0.75),   # Remote Services
        ("T1003", 0.60),   # Credential Dumping
        ("T1048", 0.40),   # Exfiltration
    ],
    "T1557": [   # MITM / ARP Spoof
        ("T1040", 0.85),   # Network Sniffing
        ("T1539", 0.65),   # Steal Web Session Cookie
        ("T1110", 0.45),   # Brute Force
    ],
    "T1498": [   # DoS
        ("T1498", 0.70),   # Continue DoS
        ("T1190", 0.40),   # Exploit during distraction
    ],
    "T1053": [   # Scheduled Task (Persistence)
        ("T1048", 0.60),   # Exfiltration
        ("T1071", 0.55),   # C2 Communication
        ("T1021", 0.45),   # Lateral Movement
    ],
}


@dataclass
class AttackerProfile:
    """
    In-memory attacker profile built by the defense agent.
    Synchronized with the DB via AttackerProfileRepository.
    """
    src_ip: str
    ttps: list[str] = field(default_factory=list)
    known_hosts: list[str] = field(default_factory=list)
    known_ports: list[str] = field(default_factory=list)
    deceived_with: list[str] = field(default_factory=list)
    actor_guess: str = "Unknown"
    actor_conf: float = 0.0
    next_move: str = ""
    next_move_conf: float = 0.0
    last_seen: float = field(default_factory=time.time)
    created_at: float = field(default_factory=time.time)

    def mental_model_summary(self) -> str:
        """
        Human-readable summary of what this attacker knows and doesn't know.
        Used in the defense agent's context window.
        """
        lines = [
            f"Attacker {self.src_ip}:",
            f"  Actor:       {self.actor_guess} ({self.actor_conf:.0%} confidence)",
            f"  TTPs seen:   {', '.join(self.ttps) if self.ttps else 'none'}",
            f"  Knows hosts: {', '.join(self.known_hosts) if self.known_hosts else 'none'}",
            f"  Knows ports: {', '.join(self.known_ports) if self.known_ports else 'none'}",
            f"  Fell for:    {', '.join(self.deceived_with) if self.deceived_with else 'none (no deceptions yet)'}",
            f"  Next move:   {self.next_move or 'unknown'} ({self.next_move_conf:.0%} conf)",
        ]
        return "\n".join(lines)

    def observe_ttp(self, ttp: str) -> None:
        if ttp not in self.ttps:
            self.ttps.append(ttp)
        self.last_seen = time.time()

    def observe_host(self, host: str) -> None:
        if host not in self.known_hosts:
            self.known_hosts.append(host)

    def observe_port(self, port_service: str) -> None:
        if port_service not in self.known_ports:
            self.known_ports.append(port_service)

    def fell_for_deception(self, deception_desc: str) -> None:
        if deception_desc not in self.deceived_with:
            self.deceived_with.append(deception_desc)


class AttackerProfiler:
    """
    Classifies attacker behavior and maintains in-memory profiles.
    """

    def __init__(self):
        self._profiles: dict[str, AttackerProfile] = {}

    def get_or_create(self, src_ip: str) -> AttackerProfile:
        if src_ip not in self._profiles:
            self._profiles[src_ip] = AttackerProfile(src_ip=src_ip)
        return self._profiles[src_ip]

    def update_from_alert(self, alert: dict) -> AttackerProfile:
        """Update profile from a detector alert."""
        src_ip = alert.get("src_ip", "")
        if not src_ip:
            return None

        profile = self.get_or_create(src_ip)
        profile.last_seen = time.time()

        # Map alert type to TTP
        ttp = alert.get("mitre_technique", "")
        if ttp:
            profile.observe_ttp(ttp)

        # Update known hosts from dst
        dst = alert.get("dst_ip", "")
        if dst:
            profile.observe_host(dst)

        # Update known ports from alert
        dst_port = alert.get("dst_port", 0)
        if dst_port:
            profile.observe_port(str(dst_port))

        return profile

    def classify_actor(self, profile: AttackerProfile) -> tuple[str, float]:
        """
        Score the attacker against known actor signatures.
        Returns (actor_name, confidence) based on TTP matching.
        """
        if not profile.ttps:
            return "Unknown", 0.0

        best_actor = "Unknown"
        best_score = 0.0

        for sig in ACTOR_SIGNATURES:
            # Score based on TTP overlap
            sig_ttps = set(sig["ttp_patterns"])
            observed_ttps = set(profile.ttps)
            overlap = len(sig_ttps & observed_ttps)
            if not overlap:
                continue

            # Jaccard-like: overlap / union but weighted toward observed
            score = (overlap / len(sig_ttps)) * sig["confidence_boost"]

            # Bonus for specific behavioral indicators
            if "T1021" in observed_ttps and sig["name"] == "Targeted APT":
                score += 0.20  # lateral movement is a strong APT indicator
            if "T1110" in observed_ttps and "T1046" in observed_ttps and sig["name"] == "Script Kiddie":
                score += 0.15  # classic kiddie pattern

            if score > best_score:
                best_score = min(score, 0.95)
                best_actor = sig["name"]

        return best_actor, best_score

    def predict_next_move(
        self, profile: AttackerProfile, llm_prediction: str = "", llm_conf: float = 0.0
    ) -> tuple[str, float]:
        """
        Predict attacker's next TTP using kill chain transitions.
        Blends statistical model with LLM prediction if provided.

        Returns (predicted_ttp_description, confidence)
        """
        if not profile.ttps:
            return "T1046 Network Service Scanning", 0.30  # default: expect scanning

        # Find transitions from the most recently observed TTP
        latest_ttp = profile.ttps[-1]
        transitions = KILL_CHAIN_TRANSITIONS.get(latest_ttp, [])

        if not transitions:
            # No known transition — use LLM prediction if available
            if llm_prediction and llm_conf > 0.3:
                return llm_prediction, llm_conf
            return "Unknown (no transition model)", 0.10

        # Get the most likely next TTP from the statistical model
        best_next, stat_conf = transitions[0]
        # Filter out already-observed TTPs
        for ttp_next, conf in transitions:
            if ttp_next not in profile.ttps:
                best_next, stat_conf = ttp_next, conf
                break

        # Blend: 40% statistical, 60% LLM
        if llm_prediction and llm_conf > 0.3:
            # If LLM agrees with statistical model, boost confidence
            if llm_prediction == best_next or llm_prediction in best_next:
                final_conf = stat_conf * 0.4 + llm_conf * 0.6
                return best_next, min(final_conf, 0.95)
            else:
                # LLM disagrees — LLM wins if higher confidence
                if llm_conf > stat_conf:
                    return llm_prediction, llm_conf * 0.7
                return best_next, stat_conf * 0.7

        return best_next, stat_conf

    def all_profiles(self) -> list[AttackerProfile]:
        return list(self._profiles.values())

    def get_profile(self, src_ip: str) -> AttackerProfile | None:
        return self._profiles.get(src_ip)
