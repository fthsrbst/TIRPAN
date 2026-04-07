"""
V2 — WebAppAgent

Web application scanning and enumeration.
Brain spawns this when HTTP/HTTPS ports are found on a host.

Tools: whatweb → nikto → nuclei → ffuf → sqlmap / wpscan / commix / arjun (conditional)

Findings reported:
  - vulnerability (type="vulnerability")
  - webapp_info   (type="webapp_info", tech stack, CMS, etc.)
"""

from __future__ import annotations

import logging

from core.agents.base_specialized import BaseSpecializedAgent
from core.brain_agent import _register_agent_type

logger = logging.getLogger(__name__)

_MAX_SCAN_CALLS = 10  # increased for new tools

_TOOLS_DESC = """\
Available tools:
  whatweb_scan(url)                                    — identify web tech stack, CMS, frameworks
  nikto_scan(url, timeout)                             — web vulnerability scanner
  nuclei_scan(url, templates, severity)                — fast CVE/misconfiguration scanner
  ffuf_scan(url, wordlist, extensions)                 — directory and file brute-force
  gobuster_scan(url, mode, wordlist, extensions)       — dir/dns/vhost brute-force
  arjun_scan(url, method)                              — discover hidden HTTP parameters
  sqlmap_scan(url, action, data, cookie)               — SQL injection testing and exploitation
  wpscan_scan(url, action, enumerate)                  — WordPress vulnerability scanner
  commix_scan(url, action, data)                       — OS command injection testing
  report_finding(finding_type, data)                   — report vulnerability or webapp_info

IMPORTANT: All tools require a full URL (not just an IP). Build it as:
  http://<TARGET>:<port>/  or  https://<TARGET>/

STRICT LIMITS — MANDATORY:
  - Each scan tool may be called AT MOST ONCE per unique URL/parameter. Never repeat.
  - Total scan tool calls: maximum {max_calls}.
  - If a tool returns an error or empty results, do NOT retry — move to the next tool.
  - After {max_calls} scan calls, go directly to report_finding and done.

Workflow:
  1. whatweb_scan(url) → identify technology stack, CMS, frameworks
  2. nikto_scan(url) → quick vulnerability check
  3. nuclei_scan(url, severity="medium,high,critical") → CVE check
  4. ffuf_scan(url) → directory/file brute-force for hidden paths
  CONDITIONAL (based on findings):
  5a. If WordPress detected → wpscan_scan(url, action="scan", enumerate="vp,vt,u")
  5b. If parameters or forms found → arjun_scan(url) → then sqlmap_scan(url, action="detect")
  5c. If OS command-like parameters → commix_scan(url, action="detect")
  5d. If subdomain/vhost context → gobuster_scan(url, mode="vhost") or mode="dns"
  6. report_finding(finding_type="vulnerability", data={{...}}) for each finding
  7. {{"thought": "...", "action": "done", "parameters": {{"findings_summary": "..."}}}}

SQLMap action="detect" is safe (read-only). Use action="enumerate_dbs" or "dump_table" only
if SQLi is confirmed AND allow_exploitation permission is set.
""".format(max_calls=_MAX_SCAN_CALLS)

_SCAN_TOOLS = frozenset([
    "whatweb_scan", "nikto_scan", "nuclei_scan", "ffuf_scan",
    "gobuster_scan", "arjun_scan", "sqlmap_scan", "wpscan_scan", "commix_scan",
])


class WebAppAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        tools = ["report_finding"]
        for tool_name in (
            "whatweb_scan", "nikto_scan", "nuclei_scan", "ffuf_scan",
            "gobuster_scan", "arjun_scan", "sqlmap_scan", "wpscan_scan", "commix_scan",
        ):
            if self._registry and self._registry.has(tool_name):
                tools.append(tool_name)
        return tools

    def _count_scan_calls(self) -> int:
        """Count how many scan tool calls have been made so far (from memory)."""
        count = 0
        for msg in self.memory._messages:
            if msg.role == "assistant":
                content = msg.content or ""
                for tool in _SCAN_TOOLS:
                    if f'"{tool}"' in content or f"'{tool}'" in content:
                        count += 1
                        break
        return count

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

        msgs = [{"role": "system", "content": system}]

        # Runtime guard: inject stop message if scan call limit reached
        scan_calls = self._count_scan_calls()
        if scan_calls >= _MAX_SCAN_CALLS:
            msgs.extend(self._build_memory_messages())
            msgs.append({
                "role": "user",
                "content": (
                    f"[SYSTEM] You have reached the maximum of {_MAX_SCAN_CALLS} scan tool calls. "
                    "You MUST now call report_finding for any findings, then call done immediately. "
                    "Do NOT call any more scan tools."
                ),
            })
        else:
            msgs.extend(self._build_memory_messages())

        return msgs

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

        # SQLMap: report confirmed injection as a vulnerability
        if tool_name == "sqlmap_scan" and data.get("injectable"):
            finding = {
                "type": "vulnerability",
                "host_ip": self.target,
                "title": f"SQL Injection — {data.get('parameter', 'unknown parameter')}",
                "description": (
                    f"SQLi confirmed via {data.get('technique', 'unknown technique')}. "
                    f"DBMS: {data.get('dbms', 'unknown')}. "
                    f"URL: {data.get('url', '')}"
                ),
                "cvss": 9.8,
                "source_tool": "sqlmap_scan",
            }
            self._add_finding(finding)
            await self.publish_finding(finding)

        # WPScan: report WordPress vulnerabilities
        if tool_name == "wpscan_scan":
            for vuln in data.get("vulnerabilities", []):
                finding = {
                    "type": "vulnerability",
                    "host_ip": self.target,
                    "title": vuln.get("title", "[wpscan] WordPress vulnerability"),
                    "cve_id": vuln.get("cve", ""),
                    "cvss": 7.5,
                    "source_tool": "wpscan_scan",
                }
                self._add_finding(finding)
                await self.publish_finding(finding)
            for cred in data.get("credentials_found", []):
                finding = {
                    "type": "credential",
                    "host_ip": self.target,
                    "service": "wordpress",
                    "username": cred.get("username"),
                    "password": cred.get("password"),
                    "source_tool": "wpscan_scan",
                }
                self._add_finding(finding)
                await self.publish_finding(finding)

        # Commix: report command injection as critical
        if tool_name == "commix_scan" and data.get("injectable"):
            finding = {
                "type": "vulnerability",
                "host_ip": self.target,
                "title": f"OS Command Injection — {data.get('parameter', 'unknown parameter')}",
                "description": (
                    f"Command injection confirmed via {data.get('technique', 'unknown')}. "
                    f"URL: {data.get('url', '')}"
                ),
                "cvss": 9.8,
                "source_tool": "commix_scan",
            }
            self._add_finding(finding)
            await self.publish_finding(finding)


_register_agent_type("webapp", "core.agents.webapp_agent", "WebAppAgent")
