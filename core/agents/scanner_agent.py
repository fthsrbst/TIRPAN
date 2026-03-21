"""
V2 — ScannerAgent

Specialized agent for network discovery and port scanning.
Uses nmap_scan (existing) + masscan_scan (new, optional).

Brain spawns this when it needs to:
  - Discover live hosts in a subnet
  - Enumerate open ports on a known host
  - Identify services and versions

Findings reported:
  - host_discovered  (type="host")
  - port_open        (type="host" with ports list)
"""

from __future__ import annotations

import json
import logging

from core.agents.base_specialized import BaseSpecializedAgent
from core.brain_agent import _register_agent_type
from core.mission_context import HostInfo, PortInfo

logger = logging.getLogger(__name__)

_TOOLS_DESC = """\
Available tools:
  nmap_scan(target, scan_type, port_range, version_detection, os_detection, nse_categories)
    scan_type: "ping" | "service" | "os" | "full"
  masscan_scan(target, port_range, rate)   [optional — falls back to nmap if unavailable]
  report_finding(finding_type, data)       [report a discovery to Brain]

Workflow:
  1. ping scan → discover live hosts
  2. service scan on live hosts → enumerate ports/versions
  3. Report each host with open ports using report_finding
  4. {"action": "done"} when finished
"""


class ScannerAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        tools = ["nmap_scan", "report_finding"]
        if self._registry and self._registry.get("masscan_scan"):
            tools.append("masscan_scan")
        return tools

    def build_messages(self) -> list[dict]:
        system = self._base_system("ScannerAgent", _TOOLS_DESC)
        msgs = [{"role": "system", "content": system}]
        for m in self.memory._messages:
            msgs.append({"role": m.role, "content": m.content})
        return msgs

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name in ("nmap_scan", "masscan_scan"):
            await self._process_scan_result(result, action_dict)
        elif tool_name == "report_finding":
            await self._process_report_finding(action_dict)

    async def _process_scan_result(self, result: dict, action_dict: dict) -> None:
        if not result.get("success"):
            return
        data = result.get("output") or result
        hosts_raw = data.get("hosts", [])
        for host_data in hosts_raw:
            ip = host_data.get("ip") or host_data.get("address", "")
            if not ip:
                continue
            ports = []
            for port_data in host_data.get("ports", []):
                if port_data.get("state") == "open":
                    ports.append(PortInfo(
                        number=int(port_data.get("port", port_data.get("portid", 0))),
                        state="open",
                        service=port_data.get("service", port_data.get("name", "")),
                        version=port_data.get("version", ""),
                    ))
            host = HostInfo(
                ip=ip,
                hostname=host_data.get("hostname", ""),
                os_type=host_data.get("os", {}).get("name", "") if isinstance(host_data.get("os"), dict) else "",
                ports=ports,
            )
            finding = {
                "type": "host",
                "ip": ip,
                "hostname": host.hostname,
                "os_type": host.os_type,
                "ports": [{"number": p.number, "service": p.service,
                            "version": p.version, "state": p.state}
                           for p in ports],
            }
            self._add_finding(finding)
            await self.publish_finding(finding)

    async def _process_report_finding(self, action_dict: dict) -> None:
        params = action_dict.get("parameters", action_dict)
        finding_type = params.get("finding_type", "unknown")
        data = params.get("data", {})
        finding = {"type": finding_type, **data}
        self._add_finding(finding)
        await self.publish_finding(finding)


# Register with BrainAgent registry
_register_agent_type("scanner", "core.agents.scanner_agent", "ScannerAgent")
