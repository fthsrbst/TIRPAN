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
  shell_exec(action, shell_key, command)     — execute on existing pivot shell
    action MUST be "exec". Example:
    {"thought": "Run id", "action": "shell_exec",
     "parameters": {"action": "exec", "shell_key": "<KEY>", "command": "id"}}
  report_finding(finding_type, data)         — report new session or lateral_edge

Lateral movement workflow:
  1. crackmapexec_run(protocol="smb", targets=subnet) → identify live SMB hosts
  2. For each live host → spray harvested credentials
  3. Successful login → impacket_run(psexec/smbexec) for shell
  4. report_finding(type="session") for new shells
  5. report_finding(type="lateral_edge") for each hop
  6. {"thought": "...", "action": "done", "parameters": {"findings_summary": "..."}}
"""


class LateralMovementAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        if self.ctx and not self.ctx.allow_lateral_movement:
            return []  # Hard block — no tools if not permitted
        tools = ["report_finding", "shell_exec"]
        for tool_name in ("crackmapexec_run", "impacket_run"):
            if self._registry and self._registry.has(tool_name):
                tools.append(tool_name)
        return tools

    def build_messages(self) -> list[dict]:
        system = self._base_system("LateralMovementAgent", _TOOLS_DESC)
        return [{"role": "system", "content": system}] + self._build_memory_messages()

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "report_finding":
            await self._process_report_finding(action_dict)
            return
        if not result.get("success"):
            return
        data = result.get("output") or result
        params = action_dict.get("parameters", action_dict)
        target_host = params.get("target", params.get("targets", self.target))
        if isinstance(target_host, list):
            target_host = target_host[0] if target_host else self.target

        if data.get("session_opened") or data.get("shell"):
            finding = {
                "type": "session",
                "host_ip": target_host,
                "session_type": "shell",
                "privilege_level": 1 if "SYSTEM" in data.get("raw_output", "") else 0,
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



_register_agent_type("lateral", "core.agents.lateral_agent", "LateralMovementAgent")
