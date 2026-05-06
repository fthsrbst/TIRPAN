"""
Defense Tool — update_attacker_profile

Meta-tool that allows the defense agent to explicitly update its
knowledge about a specific attacker: TTPs observed, hosts discovered,
deceptions they fell for, and actor hypothesis.
"""

from __future__ import annotations

import logging
from typing import Callable

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)


class UpdateAttackerProfileTool(BaseTool):

    def __init__(
        self,
        defense_sid: str,
        profile_repo,
        event_callback: Callable[[str, dict], None] | None = None,
    ):
        self._defense_sid = defense_sid
        self._profile_repo = profile_repo
        self._event_cb = event_callback

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="update_attacker_profile",
            description=(
                "Update the attacker profile for a specific source IP. "
                "Call this after observing new TTPs, discovering what the attacker knows, "
                "or when a deception tricks the attacker. "
                "Profiles accumulate over time — TTPs and known hosts are merged, not replaced. "
                "actor_guess should be a threat actor name or category: "
                "'APT28', 'APT41', 'Lazarus Group', 'Script Kiddie', "
                "'Ransomware Operator', 'Insider Threat', 'Unknown'. "
                "actor_conf is your confidence 0.0-1.0."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "src_ip": {
                        "type": "string",
                        "description": "Attacker's source IP address"
                    },
                    "ttps": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "MITRE ATT&CK technique IDs observed (e.g. ['T1046', 'T1190'])"
                    },
                    "known_hosts": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Hosts/IPs the attacker has discovered in our network"
                    },
                    "known_ports": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Port:service pairs the attacker enumerated (e.g. '22:ssh', '80:http')"
                    },
                    "deceived_with": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Deception IDs or descriptions the attacker fell for"
                    },
                    "actor_guess": {
                        "type": "string",
                        "description": "Threat actor hypothesis (e.g. 'APT28', 'Script Kiddie')"
                    },
                    "actor_conf": {
                        "type": "number",
                        "description": "Confidence in actor_guess (0.0 to 1.0)"
                    },
                    "next_move": {
                        "type": "string",
                        "description": "Your prediction of attacker's next likely action"
                    },
                    "next_move_conf": {
                        "type": "number",
                        "description": "Confidence in next_move prediction (0.0 to 1.0)"
                    },
                },
                "required": ["src_ip"],
            },
            category="response",
        )

    async def execute(self, params: dict) -> dict:
        src_ip = params.get("src_ip", "").strip()
        if not src_ip:
            return {"success": False, "output": None, "error": "src_ip is required"}

        try:
            profile = await self._profile_repo.upsert(
                defense_sid=self._defense_sid,
                src_ip=src_ip,
                ttps=params.get("ttps"),
                known_hosts=params.get("known_hosts"),
                known_ports=params.get("known_ports"),
                deceived_with=params.get("deceived_with"),
                actor_guess=params.get("actor_guess"),
                actor_conf=params.get("actor_conf"),
                next_move=params.get("next_move"),
                next_move_conf=params.get("next_move_conf"),
            )

            if self._event_cb:
                self._event_cb("attacker_profile", {
                    "src_ip": src_ip,
                    "ttps": profile.get("ttps", []),
                    "known_hosts": profile.get("known_hosts", []),
                    "actor_guess": profile.get("actor_guess"),
                    "actor_conf": profile.get("actor_conf", 0.0),
                    "next_move": profile.get("next_move"),
                    "next_move_conf": profile.get("next_move_conf", 0.0),
                })

            logger.info(
                "Attacker profile updated: %s TTPs=%s actor=%s next=%s",
                src_ip, profile.get("ttps"), profile.get("actor_guess"), profile.get("next_move")
            )
            return {
                "success": True,
                "output": {"profile": profile},
                "error": None,
            }

        except Exception as exc:
            logger.exception("update_attacker_profile error for %s", src_ip)
            return {"success": False, "output": None, "error": str(exc)}
