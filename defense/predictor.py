"""
TIRPAN Defense — Kill Chain Predictor

Wraps the AttackerProfiler's prediction logic with:
  - Pre-emptive hardening recommendations
  - Confidence-gated auto-actions
  - Human-readable prediction summaries
"""

from __future__ import annotations

import logging
from typing import Callable

from defense.attacker_profiler import AttackerProfile, AttackerProfiler

logger = logging.getLogger(__name__)

# Prediction confidence thresholds
THRESHOLD_HARDEN = 0.60    # Auto-harden predicted target
THRESHOLD_HONEYPOT = 0.75  # Deploy honeypot on predicted attack vector
THRESHOLD_ALERT_OP = 0.85  # Alert operator with high-confidence prediction


# TTP → recommended pre-emptive actions
PREEMPTIVE_ACTIONS: dict[str, list[dict]] = {
    "T1190": [  # Exploit Public-Facing App
        {"tool": "network_survey", "description": "Scan for exposed web services",
         "params": {"scan_type": "quick"}},
        {"tool": "deploy_honeypot", "description": "Deploy fake web service",
         "params": {"fake_service": "http", "port": 8080}},
    ],
    "T1110": [  # Brute Force
        {"tool": "deploy_honeypot", "description": "Deploy fake SSH honeypot",
         "params": {"fake_service": "ssh", "port": 2222}},
        {"tool": "analyze_logs", "description": "Check current auth.log for early failures",
         "params": {}},
    ],
    "T1021": [  # Remote Services / Lateral Movement
        {"tool": "harden_service", "description": "Restrict SMB access",
         "params": {"action": "restrict_ip", "port": 445, "protocol": "tcp"}},
        {"tool": "analyze_logs", "description": "Check for new SSH sessions",
         "params": {}},
    ],
    "T1003": [  # Credential Dumping
        {"tool": "deploy_canary", "description": "Plant fake credentials",
         "params": {"canary_type": "file", "path": "/etc/shadow.bak"}},
    ],
    "T1048": [  # Exfiltration
        {"tool": "capture_pcap", "description": "Start capture for exfil evidence",
         "params": {"action": "start", "filter": ""}},
        {"tool": "block_ip", "description": "Rate-limit suspicious outbound",
         "params": {"action": "RATE_LIMIT"}},
    ],
    "T1486": [  # Data Encrypted / Ransomware
        {"tool": "harden_service", "description": "Block SMB access",
         "params": {"action": "block_port", "port": 445}},
        {"tool": "ssh_remote_cmd", "description": "Check for encryption activity",
         "params": {"command": "ps aux | grep -E 'encrypt|ransom|cipher'"}},
    ],
    "T1053": [  # Scheduled Task / Persistence
        {"tool": "ssh_remote_cmd", "description": "Check crontab and systemd",
         "params": {"command": "crontab -l; systemctl list-units --type=service --state=running"}},
        {"tool": "analyze_logs", "description": "Check for new user accounts",
         "params": {}},
    ],
}


class KillChainPredictor:
    """
    High-level predictor that wraps AttackerProfiler predictions
    and translates them into actionable defense recommendations.
    """

    def __init__(self, profiler: AttackerProfiler):
        self._profiler = profiler

    def predict(
        self, src_ip: str, llm_prediction: str = "", llm_conf: float = 0.0
    ) -> dict:
        """
        Generate a complete prediction for the given attacker IP.

        Returns:
            {
                "src_ip": ...,
                "next_ttp": ...,
                "confidence": ...,
                "actor": ...,
                "actor_conf": ...,
                "recommendations": [...],
                "alert_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
                "summary": "human-readable summary",
            }
        """
        profile = self._profiler.get_or_create(src_ip)

        # Update actor classification
        actor, actor_conf = self._profiler.classify_actor(profile)
        profile.actor_guess = actor
        profile.actor_conf = actor_conf

        # Predict next move
        next_ttp, confidence = self._profiler.predict_next_move(
            profile, llm_prediction, llm_conf
        )
        profile.next_move = next_ttp
        profile.next_move_conf = confidence

        # Generate recommendations
        recommendations = self._get_recommendations(next_ttp, confidence, profile)

        # Alert level
        alert_level = self._alert_level(confidence, actor, profile)

        summary = self._build_summary(profile, next_ttp, confidence, alert_level)

        return {
            "src_ip": src_ip,
            "next_ttp": next_ttp,
            "confidence": confidence,
            "actor": actor,
            "actor_conf": actor_conf,
            "recommendations": recommendations,
            "alert_level": alert_level,
            "summary": summary,
            "mental_model": profile.mental_model_summary(),
        }

    def _get_recommendations(
        self, next_ttp: str, confidence: float, profile: AttackerProfile
    ) -> list[dict]:
        """Map predicted TTP to pre-emptive action recommendations."""
        recs = []

        # Get TTP-specific actions
        for ttp_key, actions in PREEMPTIVE_ACTIONS.items():
            if ttp_key in next_ttp or next_ttp.startswith(ttp_key):
                for action in actions:
                    recs.append({
                        **action,
                        "confidence": confidence,
                        "triggered_by": next_ttp,
                        "priority": "HIGH" if confidence >= THRESHOLD_ALERT_OP else "MEDIUM",
                    })
                break

        # Always recommend profiling
        recs.insert(0, {
            "tool": "update_attacker_profile",
            "description": "Update attacker profile with prediction",
            "params": {
                "src_ip": profile.src_ip,
                "next_move": next_ttp,
                "next_move_conf": confidence,
                "actor_guess": profile.actor_guess,
                "actor_conf": profile.actor_conf,
            },
            "confidence": 1.0,
            "priority": "HIGH",
        })

        return recs

    def _alert_level(self, confidence: float, actor: str, profile: AttackerProfile) -> str:
        if actor in ("Targeted APT", "Ransomware Operator") and confidence > 0.6:
            return "CRITICAL"
        if len(profile.ttps) >= 4 or confidence > 0.80:
            return "HIGH"
        if confidence > 0.50 or len(profile.ttps) >= 2:
            return "MEDIUM"
        return "LOW"

    def _build_summary(
        self,
        profile: AttackerProfile,
        next_ttp: str,
        confidence: float,
        alert_level: str,
    ) -> str:
        ttps_str = ", ".join(profile.ttps[-5:]) if profile.ttps else "none"
        deception_str = (
            f"Fell for: {', '.join(profile.deceived_with)}"
            if profile.deceived_with else "No deceptions triggered yet"
        )
        return (
            f"[{alert_level}] {profile.src_ip} classified as {profile.actor_guess} "
            f"({profile.actor_conf:.0%} confidence). "
            f"Observed TTPs: {ttps_str}. "
            f"Predicted next: {next_ttp} ({confidence:.0%} confidence). "
            f"{deception_str}. "
            f"Known targets: {', '.join(profile.known_hosts) or 'none'}."
        )
