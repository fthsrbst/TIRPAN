"""V2 — dns_enum tool. DNS record enumeration."""

from __future__ import annotations

import asyncio
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)


class DnsTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="dns_enum",
            category="recon",
            description="DNS record enumeration — A, MX, NS, TXT, CNAME, SOA records.",
            parameters={
                "type": "object",
                "properties": {
                    "domain":       {"type": "string"},
                    "record_types": {"type": "string", "default": "A,MX,NS,TXT,CNAME"},
                },
                "required": ["domain"],
            },
        )

    async def execute(self, params: dict) -> dict:
        domain = params.get("domain", "")
        record_types = params.get("record_types", "A,MX,NS,TXT,CNAME").split(",")

        tool = "dig" if shutil.which("dig") else ("host" if shutil.which("host") else None)
        if not tool:
            return {"success": False, "error": "dig/host not found"}

        records: dict[str, list[str]] = {}
        for rtype in record_types:
            rtype = rtype.strip().upper()
            try:
                if tool == "dig":
                    cmd = ["dig", "+short", rtype, domain]
                else:
                    cmd = ["host", "-t", rtype, domain]
                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
                lines = [l.strip() for l in stdout.decode(errors="replace").splitlines() if l.strip()]
                if lines:
                    records[rtype] = lines
            except Exception:
                pass

        return {"success": True, "output": {"domain": domain, "records": records}}

    async def health_check(self) -> ToolHealthStatus:
        binary = shutil.which("dig") or shutil.which("host")
        if binary:
            return ToolHealthStatus(available=True, message="dns_enum")
        return ToolHealthStatus(available=False, message="dig/host not found")
