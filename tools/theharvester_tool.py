"""V2 — theharvester_scan tool. Email/subdomain/IP OSINT gathering."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
HARVESTER_TIMEOUT = 120


class TheHarvesterTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="theharvester_scan",
            category="recon",
            description=(
                "Harvest emails, subdomains, IPs from public sources "
                "(Google, Bing, LinkedIn, Shodan, etc.)"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "domain":  {"type": "string", "description": "Target domain"},
                    "sources": {"type": "string", "default": "google,bing,yahoo,baidu",
                                "description": "Comma-separated data sources"},
                    "limit":   {"type": "integer", "default": 100},
                },
                "required": ["domain"],
            },
        )

    async def execute(self, params: dict) -> dict:
        domain = params.get("domain", "")
        sources = params.get("sources", "google,bing,yahoo,baidu")
        limit = int(params.get("limit", 100))

        binary = shutil.which("theHarvester") or shutil.which("theharvester")
        if not binary:
            return {"success": False,
                    "error": "theHarvester not found — install with: apt install theharvester"}

        cmd = [binary, "-d", domain, "-b", sources, "-l", str(limit)]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=HARVESTER_TIMEOUT)
        except asyncio.TimeoutError:
            return {"success": False, "error": "theHarvester timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        return self._parse_output(output, domain)

    def _parse_output(self, output: str, domain: str) -> dict:
        emails = list(set(re.findall(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", output, re.IGNORECASE)))
        subdomains = []
        ip_addresses = []
        for line in output.splitlines():
            line = line.strip()
            if line.endswith(f".{domain}") or line == domain:
                subdomains.append(line)
            elif re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", line):
                ip_addresses.append(line)
        return {
            "success": True,
            "output": {
                "domain": domain,
                "emails": emails,
                "subdomains": list(set(subdomains)),
                "ip_addresses": list(set(ip_addresses)),
            },
        }

    async def health_check(self) -> ToolHealthStatus:
        binary = shutil.which("theHarvester") or shutil.which("theharvester")
        if binary:
            return ToolHealthStatus(available=True, message="theharvester_scan")
        return ToolHealthStatus(available=False, message="theHarvester not found")
