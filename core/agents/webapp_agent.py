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

IMPORTANT: All tools require a full URL (not just an IP). Build it as:
  http://<TARGET>:<port>/  or  https://<TARGET>/

Workflow:
  1. whatweb_scan(url="http://TARGET/") → identify technology stack
  2. nikto_scan(url="http://TARGET/", timeout=300) → quick vulnerability check
  3. nuclei_scan(url="http://TARGET/", severity="medium,high,critical") → CVE check
  4. If interesting paths found → ffuf_scan(url="http://TARGET/") for directory enum
  5. report_finding(finding_type="vulnerability", data={...}) for each finding
  6. {"thought": "...", "action": "done", "parameters": {"findings_summary": "..."}}
"""


class WebAppAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        tools = ["report_finding"]
        for tool_name in ("whatweb_scan", "nikto_scan", "nuclei_scan", "ffuf_scan"):
            if self._registry and self._registry.has(tool_name):
                tools.append(tool_name)
        return tools

    def build_messages(self) -> list[dict]:
        port = self.options.get("port", 80) if self.options else 80
        try:
            port = int(port)
        except (TypeError, ValueError):
            port = 80
        scheme = "https" if port == 443 else "http"
        port_suffix = f":{port}" if port not in (80, 443) else ""
        base_url = f"{scheme}://{self.target}{port_suffix}/"

        tools_desc = _TOOLS_DESC.replace("<TARGET>", self.target).replace(
            "<TARGET>:<port>", f"{self.target}:{port}"
        )
        tools_desc += f"\nYour target URL is: {base_url}\n"
        system = self._base_system("WebAppAgent", tools_desc)
        return [{"role": "system", "content": system}] + self._build_memory_messages()

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "report_finding":
            await self._process_report_finding(action_dict)
        elif result.get("success"):
            await self._process_scan_result(tool_name, result, action_dict)

    async def _process_scan_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        data = result.get("output") or result
        findings_raw = data.get("findings", data.get("vulnerabilities", []))
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

        if tool_name == "whatweb_scan" and data.get("plugins"):
            finding = {
                "type": "webapp_info",
                "host_ip": self.target,
                "tech": data.get("plugins", {}),
                "url": action_dict.get("parameters", action_dict).get("url", self.target),
            }
            self._add_finding(finding)
            await self.publish_finding(finding)



_register_agent_type("webapp", "core.agents.webapp_agent", "WebAppAgent")
