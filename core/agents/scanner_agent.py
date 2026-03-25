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
from typing import Any

from core.agents.base_specialized import BaseSpecializedAgent
from core.brain_agent import _register_agent_type
from core.mission_context import HostInfo, PortInfo

logger = logging.getLogger(__name__)

_TOOLS_DESC = """\
Available tools:
  nmap_scan(target, scan_type, port_range, scripts, excluded_ports)
    scan_type: "ping" | "service" | "os" | "full"
    NOTE: service/os/full scans use -Pn (skip ping), so they work even if ICMP is blocked.
  masscan_scan(target, port_range, rate)   [optional — falls back to nmap if unavailable]
  report_finding(finding_type, data)       [report a discovery to Brain]

Workflow:
  1. Start with a service scan (NOT ping) → this discovers hosts AND enumerates ports/versions
  2. If service scan shows open ports, optionally do an OS or full scan for more detail
  3. Report each host with open ports using report_finding
  4. {"action": "done"} when finished

CRITICAL RULES:
- ONLY report findings that actually appear in scan results. NEVER fabricate or assume port data.
- If a scan returns "NO HOSTS FOUND" or empty hosts list, report the host as unreachable — do NOT invent open ports.
- Do NOT repeat the same scan more than once. If a scan returned no results, try a different scan_type or port_range, then move on.
- Maximum 5 scan attempts total. After that, report what you found (even if nothing) and call done.
"""


class ScannerAgent(BaseSpecializedAgent):

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._scan_count = 0
        self._max_scans = 5
        self._completed_scans: set[str] = set()  # "scan_type:port_range" dedup

    def get_available_tools(self) -> list[str]:
        tools = ["nmap_scan", "report_finding"]
        if self._registry and self._registry.has("masscan_scan"):
            tools.append("masscan_scan")
        return tools

    def build_messages(self) -> list[dict]:
        system = self._base_system("ScannerAgent", _TOOLS_DESC)
        return [{"role": "system", "content": system}] + self._build_memory_messages()

    def _summarize_tool_output(self, tool_name: str, raw_output: Any, success: bool) -> str:
        """Override: produce a clear, LLM-friendly summary instead of raw XML."""
        if tool_name in ("nmap_scan", "masscan_scan") and isinstance(raw_output, dict):
            # Strip raw_output XML to prevent hallucination from truncated XML
            summary_parts = []
            target = raw_output.get("target", "?")
            scan_type = raw_output.get("scan_type", "?")
            duration = raw_output.get("duration_seconds", 0)
            hosts = raw_output.get("hosts", [])

            summary_parts.append(f"Scan: {scan_type} on {target} ({duration:.1f}s)")

            if not hosts:
                summary_parts.append("Result: NO HOSTS FOUND. Target may be down or unreachable.")
                summary_parts.append("IMPORTANT: Do NOT fabricate or assume any open ports. Report host as unreachable.")
            else:
                for h in hosts:
                    state = h.get("state", "unknown")
                    ip = h.get("ip", "?")
                    os_info = h.get("os", "")
                    open_ports = [p for p in h.get("ports", []) if p.get("state") == "open"]
                    summary_parts.append(f"Host: {ip} (state={state})")
                    if os_info:
                        summary_parts.append(f"  OS: {os_info}")
                    if open_ports:
                        for p in open_ports:
                            svc = p.get("service", "")
                            ver = p.get("version", "")
                            summary_parts.append(f"  Port {p['number']}/{p.get('protocol','tcp')}: {svc} {ver}".strip())
                    elif state == "up":
                        summary_parts.append("  No open ports found in scanned range.")

            return "\n".join(summary_parts)
        return super()._summarize_tool_output(tool_name, raw_output, success)

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name in ("nmap_scan", "masscan_scan"):
            self._scan_count += 1
            # Track completed scan signatures for dedup
            params = action_dict.get("parameters", {})
            scan_sig = f"{params.get('scan_type', 'service')}:{params.get('port_range', '1-1024')}"
            self._completed_scans.add(scan_sig)

            await self._process_scan_result(result, action_dict)

            # Enforce scan limit
            if self._scan_count >= self._max_scans:
                self.memory.add_tool_result(
                    f"[SYSTEM] You have reached the maximum of {self._max_scans} scans. "
                    f"You MUST now report your findings and call done. No more scans allowed.",
                    pinned=True,
                )
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
            os_raw = host_data.get("os", "")
            os_type = os_raw.get("name", "") if isinstance(os_raw, dict) else str(os_raw)
            host = HostInfo(
                ip=ip,
                hostname=host_data.get("hostname", ""),
                os_type=os_type,
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


# Register with BrainAgent registry
_register_agent_type("scanner", "core.agents.scanner_agent", "ScannerAgent")
