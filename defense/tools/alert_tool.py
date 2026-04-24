"""
Defense Tool — create_alert

Creates a structured defense alert in the database and emits a
WebSocket event so the UI updates in real time.
"""

from __future__ import annotations

import logging
from typing import Callable

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)


class CreateAlertTool(BaseTool):
    """
    Allows the defense agent to formally record a threat alert.
    The alert is persisted to the DB and broadcast over WebSocket.
    """

    def __init__(
        self,
        defense_sid: str,
        alert_repo,
        event_callback: Callable[[str, dict], None] | None = None,
    ):
        self._defense_sid = defense_sid
        self._alert_repo = alert_repo
        self._event_cb = event_callback

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="create_alert",
            description=(
                "Record a formal threat alert for this defense session. "
                "Always call this when you detect a real threat — it creates a persistent "
                "record and notifies the operator. "
                "Alert types: PORT_SCAN, BRUTE_FORCE, ARP_SPOOF, DOS, LATERAL, EXFIL, "
                "WEB_EXPLOIT, MALWARE, RECON, CREDENTIAL_ATTACK, HONEYPOT_TRIGGERED, OTHER. "
                "Severity: LOW, MEDIUM, HIGH, CRITICAL. "
                "Include MITRE ATT&CK tactic (e.g. TA0043) and technique (e.g. T1046) when known."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "alert_type": {
                        "type": "string",
                        "enum": [
                            "PORT_SCAN", "BRUTE_FORCE", "ARP_SPOOF", "DOS", "LATERAL",
                            "EXFIL", "WEB_EXPLOIT", "MALWARE", "RECON",
                            "CREDENTIAL_ATTACK", "HONEYPOT_TRIGGERED", "OTHER",
                        ],
                        "description": "Category of threat detected"
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                        "description": "Severity level of the threat"
                    },
                    "src_ip": {
                        "type": "string",
                        "description": "Source IP address of the attacker"
                    },
                    "dst_ip": {
                        "type": "string",
                        "description": "Destination IP being attacked"
                    },
                    "dst_port": {
                        "type": "integer",
                        "description": "Destination port being attacked"
                    },
                    "protocol": {
                        "type": "string",
                        "description": "Protocol (TCP, UDP, ICMP, ARP, etc.)"
                    },
                    "details": {
                        "type": "object",
                        "description": "Additional structured details about the alert"
                    },
                    "mitre_tactic": {
                        "type": "string",
                        "description": "MITRE ATT&CK tactic ID (e.g. TA0043 Reconnaissance)"
                    },
                    "mitre_technique": {
                        "type": "string",
                        "description": "MITRE ATT&CK technique ID (e.g. T1046 Network Service Scanning)"
                    },
                },
                "required": ["alert_type", "severity"],
            },
            category="response",
        )

    async def execute(self, params: dict) -> dict:
        alert_type = params.get("alert_type", "OTHER")
        severity = params.get("severity", "MEDIUM")
        src_ip = params.get("src_ip")
        dst_ip = params.get("dst_ip")
        dst_port = params.get("dst_port")
        protocol = params.get("protocol")
        details = params.get("details") or {}
        mitre_tactic = params.get("mitre_tactic")
        mitre_technique = params.get("mitre_technique")

        try:
            alert = await self._alert_repo.create(
                defense_sid=self._defense_sid,
                alert_type=alert_type,
                severity=severity,
                src_ip=src_ip,
                dst_ip=dst_ip,
                dst_port=dst_port,
                protocol=protocol,
                details=details,
                mitre_tactic=mitre_tactic,
                mitre_technique=mitre_technique,
            )

            if self._event_cb:
                self._event_cb("defense_alert", {
                    "alert_id": alert["id"],
                    "alert_type": alert_type,
                    "severity": severity,
                    "src_ip": src_ip,
                    "dst_ip": dst_ip,
                    "dst_port": dst_port,
                    "mitre_tactic": mitre_tactic,
                    "mitre_technique": mitre_technique,
                    "details": details,
                })

            logger.info(
                "Defense alert created: [%s] %s from %s → %s:%s",
                severity, alert_type, src_ip, dst_ip, dst_port,
            )
            return {
                "success": True,
                "output": {"alert_id": alert["id"], "alert": alert},
                "error": None,
            }

        except Exception as exc:
            logger.exception("create_alert error")
            return {"success": False, "output": None, "error": str(exc)}
