"""
Defense Tool — network_survey

Performs a defensive nmap scan of the protected network to:
  - Enumerate all live hosts and their open ports
  - Identify unexpected services that shouldn't be running
  - Build a baseline "what we own" map for the defense agent
"""

from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)


class NetworkSurveyTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="network_survey",
            description=(
                "Perform a defensive nmap scan of the protected network or a specific host. "
                "Use this to: (1) build an asset inventory of what hosts/ports exist in our network, "
                "(2) detect unexpected/rogue services that shouldn't be running, "
                "(3) identify which hosts are currently up. "
                "scan_type 'quick' = fast host discovery + top 100 ports. "
                "scan_type 'full' = all ports + version detection (slower). "
                "Returns structured list of hosts with open ports."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "IP, hostname, or CIDR range to scan (e.g. '192.168.1.0/24')"
                    },
                    "scan_type": {
                        "type": "string",
                        "enum": ["quick", "full", "ping_only"],
                        "description": "Scan depth: quick (fast), full (thorough), ping_only (live hosts only)"
                    },
                    "exclude": {
                        "type": "string",
                        "description": "Comma-separated IPs to exclude from scan"
                    },
                },
                "required": ["target"],
            },
            category="response",
        )

    async def health_check(self) -> ToolHealthStatus:
        proc = await asyncio.create_subprocess_exec(
            "which", "nmap",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            return ToolHealthStatus(
                available=False,
                message="nmap not found",
                install_hint="sudo apt-get install nmap",
            )
        return ToolHealthStatus(available=True, message="OK")

    async def execute(self, params: dict) -> dict:
        target = params.get("target", "").strip()
        scan_type = params.get("scan_type", "quick")
        exclude = params.get("exclude", "").strip()

        if not target:
            return {"success": False, "output": None, "error": "target is required"}

        cmd = self._build_cmd(target, scan_type, exclude)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            timeout = 300 if scan_type == "full" else 120
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)

            if proc.returncode != 0:
                err = stderr.decode(errors="replace")
                return {"success": False, "output": None, "error": f"nmap failed: {err[:500]}"}

            xml_output = stdout.decode(errors="replace")
            hosts = self._parse_xml(xml_output)

            return {
                "success": True,
                "output": {
                    "target": target,
                    "scan_type": scan_type,
                    "hosts": hosts,
                    "hosts_up": sum(1 for h in hosts if h.get("state") == "up"),
                    "total_hosts": len(hosts),
                },
                "error": None,
            }

        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": "nmap scan timed out"}
        except Exception as exc:
            logger.exception("network_survey error")
            return {"success": False, "output": None, "error": str(exc)}

    def _build_cmd(self, target: str, scan_type: str, exclude: str) -> list[str]:
        cmd = ["sudo", "nmap", "-oX", "-", "--open"]

        if scan_type == "ping_only":
            cmd += ["-sn"]
        elif scan_type == "quick":
            cmd += ["-sV", "--top-ports", "200", "-T4", "-Pn"]
        else:  # full
            cmd += ["-sV", "-p-", "-T4", "-Pn"]

        if exclude:
            cmd += ["--exclude", exclude]

        cmd.append(target)
        return cmd

    def _parse_xml(self, xml_text: str) -> list[dict]:
        hosts = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return hosts

        for host_el in root.findall("host"):
            state_el = host_el.find("status")
            state = state_el.get("state", "unknown") if state_el is not None else "unknown"

            addr_el = host_el.find("address[@addrtype='ipv4']")
            ip = addr_el.get("addr", "") if addr_el is not None else ""

            hostname = ""
            hostnames_el = host_el.find("hostnames")
            if hostnames_el is not None:
                hn = hostnames_el.find("hostname")
                if hn is not None:
                    hostname = hn.get("name", "")

            ports = []
            ports_el = host_el.find("ports")
            if ports_el is not None:
                for port_el in ports_el.findall("port"):
                    port_state = port_el.find("state")
                    if port_state is None or port_state.get("state") != "open":
                        continue
                    svc = port_el.find("service")
                    ports.append({
                        "number": int(port_el.get("portid", 0)),
                        "protocol": port_el.get("protocol", "tcp"),
                        "service": svc.get("name", "") if svc is not None else "",
                        "version": (
                            f"{svc.get('product','')} {svc.get('version','')}".strip()
                            if svc is not None else ""
                        ),
                    })

            hosts.append({
                "ip": ip,
                "hostname": hostname,
                "state": state,
                "open_ports": ports,
            })

        return hosts
