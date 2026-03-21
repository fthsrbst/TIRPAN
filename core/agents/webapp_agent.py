"""
V2 — WebAppAgent

Web application scanning and enumeration.
Brain spawns this when HTTP/HTTPS ports are found on a host.

Tools: whatweb → nikto → nuclei → ffuf (directory brute-force)

Findings reported:
  - vulnerability (type="vulnerability")
  - webapp_info   (type="webapp_info", tech stack, CMS, etc.)
"""

from __future__ import annotations

import logging

from core.agents.base_specialized import BaseSpecializedAgent
from core.brain_agent import _register_agent_type

logger = logging.getLogger(__name__)

_TOOLS_DESC = """\
Available tools:
  whatweb_scan(url)                          — identify web tech stack, CMS, frameworks
  nikto_scan(url, timeout)                   — web vulnerability scanner
  nuclei_scan(url, templates, severity)      — fast CVE/misconfiguration scanner
  ffuf_scan(url, wordlist, extensions)       — directory and file brute-force
  report_finding(finding_type, data)         — report vulnerability or webapp_info

Workflow:
  1. whatweb_scan → identify technology stack
  2. nikto_scan → quick vulnerability check
  3. nuclei_scan → CVE/misconfiguration check (severity: medium,high,critical)
  4. If interesting paths found → ffuf_scan for directory enumeration
  5. report_finding for each vulnerability found
  6. {"action": "done"}
"""


class WebAppAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        tools = ["report_finding"]
        for tool_name in ("whatweb_scan", "nikto_scan", "nuclei_scan", "ffuf_scan"):
            if self._registry and self._registry.get(tool_name):
                tools.append(tool_name)
        return tools

    def build_messages(self) -> list[dict]:
        system = self._base_system("WebAppAgent", _TOOLS_DESC)
        msgs = [{"role": "system", "content": system}]
        for m in self.memory._messages:
            msgs.append({"role": m.role, "content": m.content})
        return msgs

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "report_finding":
            await self._process_report_finding(action_dict)
        elif result.get("status") == "success":
            await self._process_scan_result(tool_name, result, action_dict)

    async def _process_scan_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        findings_raw = result.get("findings", result.get("vulnerabilities", []))
        for f in findings_raw:
            if isinstance(f, dict):
                finding = {
                    "type": "vulnerability",
                    "host_ip": self.target,
                    "title": f.get("title", f.get("name", f"[{tool_name}] finding")),
                    "description": f.get("description", f.get("detail", "")),
                    "cve_id": f.get("cve_id", f.get("cve", "")),
                    "cvss": float(f.get("cvss", f.get("severity_score", 0.0))),
                    "source_tool": tool_name,
                }
                self._add_finding(finding)
                await self.publish_finding(finding)

        if tool_name == "whatweb_scan" and result.get("plugins"):
            finding = {
                "type": "webapp_info",
                "host_ip": self.target,
                "tech": result.get("plugins", {}),
                "url": action_dict.get("parameters", action_dict).get("url", self.target),
            }
            self._add_finding(finding)
            await self.publish_finding(finding)

    async def _process_report_finding(self, action_dict: dict) -> None:
        params = action_dict.get("parameters", action_dict)
        finding = {"type": params.get("finding_type", "unknown"), **params.get("data", {})}
        self._add_finding(finding)
        await self.publish_finding(finding)


_register_agent_type("webapp", "core.agents.webapp_agent", "WebAppAgent")
