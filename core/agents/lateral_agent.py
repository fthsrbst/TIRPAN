"""
V2 — LateralMovementAgent

Lateral movement from a compromised host to internal targets.
Requires allow_lateral_movement=True in mission permissions.

Tools: crackmapexec, impacket (psexec/smbexec/wmiexec)

Findings reported:
  - session  (type="session" on a new host)
  - lateral_edge (type="lateral_edge" in attack graph)
"""

from __future__ import annotations

import logging

from core.agents.base_specialized import BaseSpecializedAgent
from core.brain_agent import _register_agent_type

logger = logging.getLogger(__name__)

_TOOLS_DESC = """\
Available tools:
  crackmapexec_run(protocol, targets, username, password, hash, command)
                                              — SMB/WMI/SSH credential spray + command exec
  impacket_run(tool, target, username, password, hash, command)
                                              — psexec/smbexec/wmiexec/secretsdump
  shell_exec(shell_key, command, timeout)    — execute on existing pivot shell
  report_finding(finding_type, data)         — report new session or lateral_edge

Lateral movement workflow:
  1. crackmapexec_run(protocol="smb", targets=subnet) → identify live SMB hosts
  2. For each live host → spray harvested credentials
  3. Successful login → impacket_run(psexec/smbexec) for shell
  4. report_finding(type="session") for new shells
  5. report_finding(type="lateral_edge") for each hop
  6. {"action": "done"}
"""


class LateralMovementAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        if self.ctx and not self.ctx.allow_lateral_movement:
            return []  # Hard block — no tools if not permitted
        tools = ["report_finding", "shell_exec"]
        for tool_name in ("crackmapexec_run", "impacket_run"):
            if self._registry and self._registry.get(tool_name):
                tools.append(tool_name)
        return tools

    def build_messages(self) -> list[dict]:
        system = self._base_system("LateralMovementAgent", _TOOLS_DESC)
        msgs = [{"role": "system", "content": system}]
        for m in self.memory._messages:
            msgs.append({"role": m.role, "content": m.content})
        return msgs

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "report_finding":
            await self._process_report_finding(action_dict)
            return
        if result.get("status") != "success":
            return
        params = action_dict.get("parameters", action_dict)
        target_host = params.get("target", params.get("targets", self.target))
        if isinstance(target_host, list):
            target_host = target_host[0] if target_host else self.target

        if result.get("session_opened") or result.get("shell"):
            finding = {
                "type": "session",
                "host_ip": target_host,
                "session_type": "shell",
                "privilege_level": 1 if "SYSTEM" in result.get("output", "") else 0,
                "username": params.get("username", ""),
                "source": "lateral",
            }
            self._add_finding(finding)
            await self.publish_finding(finding)

            edge_finding = {
                "type": "lateral_edge",
                "from_ip": self.target,
                "to_ip": target_host,
                "description": f"{tool_name} via {params.get('username', '?')}",
            }
            self._add_finding(edge_finding)
            await self.publish_finding(edge_finding)

    async def _process_report_finding(self, action_dict: dict) -> None:
        params = action_dict.get("parameters", action_dict)
        finding = {"type": params.get("finding_type", "unknown"), **params.get("data", {})}
        self._add_finding(finding)
        await self.publish_finding(finding)


_register_agent_type("lateral", "core.agents.lateral_agent", "LateralMovementAgent")
