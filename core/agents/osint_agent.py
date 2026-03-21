"""
V2 — OSINTAgent

Open-source intelligence gathering for domain targets.
Brain spawns this at the start of domain-based engagements.

Tools: theHarvester, subfinder, whois, dns_enum

Findings reported:
  - subdomain (type="subdomain")
  - email     (type="email")
  - ip_range  (type="host")
"""

from __future__ import annotations

import logging

from core.agents.base_specialized import BaseSpecializedAgent
from core.brain_agent import _register_agent_type

logger = logging.getLogger(__name__)

_TOOLS_DESC = """\
Available tools:
  theharvester_scan(domain, sources, limit) — harvest emails, subdomains, IPs from public sources
  subfinder_scan(domain, timeout)            — passive subdomain enumeration
  whois_lookup(domain)                       — WHOIS registration data
  dns_enum(domain, record_types)             — DNS record enumeration (A, MX, NS, TXT, CNAME)
  report_finding(finding_type, data)         — report subdomain, email, or IP finding

Workflow:
  1. whois_lookup → registration info, registrar, name servers
  2. dns_enum → A, MX, NS, TXT records
  3. subfinder_scan → passive subdomain discovery
  4. theharvester_scan → emails, additional subdomains from search engines
  5. report_finding for each unique subdomain/email found
  6. {"action": "done"}
"""


class OSINTAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        tools = ["report_finding"]
        for tool_name in ("theharvester_scan", "subfinder_scan",
                          "whois_lookup", "dns_enum"):
            if self._registry and self._registry.get(tool_name):
                tools.append(tool_name)
        return tools

    def build_messages(self) -> list[dict]:
        system = self._base_system("OSINTAgent", _TOOLS_DESC)
        msgs = [{"role": "system", "content": system}]
        for m in self.memory._messages:
            msgs.append({"role": m.role, "content": m.content})
        return msgs

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "report_finding":
            await self._process_report_finding(action_dict)
            return
        if not result.get("success"):
            return
        data = result.get("output") or result
        # Extract subdomains
        for subdomain in data.get("subdomains", data.get("hosts", [])):
            s = subdomain if isinstance(subdomain, str) else subdomain.get("host", "")
            if s:
                finding = {"type": "subdomain", "domain": self.target, "subdomain": s}
                self._add_finding(finding)
                await self.publish_finding(finding)
        # Extract emails
        for email in data.get("emails", []):
            finding = {"type": "email", "email": email, "domain": self.target}
            self._add_finding(finding)
            await self.publish_finding(finding)
        # Extract IPs
        for ip in data.get("ips", data.get("ip_addresses", [])):
            finding = {"type": "host", "ip": ip, "hostname": "",
                       "ports": [], "source": "osint"}
            self._add_finding(finding)
            await self.publish_finding(finding)

    async def _process_report_finding(self, action_dict: dict) -> None:
        params = action_dict.get("parameters", action_dict)
        finding = {"type": params.get("finding_type", "unknown"), **params.get("data", {})}
        self._add_finding(finding)
        await self.publish_finding(finding)


_register_agent_type("osint", "core.agents.osint_agent", "OSINTAgent")
