"""V2 — subfinder_scan tool. Passive subdomain enumeration."""

from __future__ import annotations

import asyncio
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
SUBFINDER_TIMEOUT = 120


class SubfinderTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="subfinder_scan",
            category="recon",
            description="Fast passive subdomain discovery using certificate transparency and DNS sources.",
            parameters={
                "type": "object",
                "properties": {
                    "domain":  {"type": "string"},
                    "timeout": {"type": "integer", "default": 120},
                    "silent":  {"type": "boolean", "default": True},
                },
                "required": ["domain"],
            },
        )

    async def execute(self, params: dict) -> dict:
        domain = params.get("domain", "")
        timeout = int(params.get("timeout", SUBFINDER_TIMEOUT))

        if not shutil.which("subfinder"):
            return {"success": False, "error": "subfinder not found — install from github.com/projectdiscovery/subfinder"}

        cmd = ["subfinder", "-d", domain, "-silent"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": "subfinder timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        subdomains = [
            line.strip() for line in stdout.decode(errors="replace").splitlines()
            if line.strip()
        ]
        return {"success": True, "output": {"domain": domain, "subdomains": subdomains,
                                             "total": len(subdomains)}}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("subfinder"):
            return ToolHealthStatus(available=True, message="subfinder_scan")
        return ToolHealthStatus(available=False, message="subfinder not found")
