"""V2 — whois_lookup tool. Domain/IP registration data."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)


class WhoisTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="whois_lookup",
            category="recon",
            description="WHOIS registration data for a domain or IP address.",
            parameters={
                "type": "object",
                "properties": {
                    "domain": {"type": "string", "description": "Domain name or IP address"},
                },
                "required": ["domain"],
            },
        )

    async def execute(self, params: dict) -> dict:
        domain = params.get("domain", "")
        if not shutil.which("whois"):
            return {"success": False, "error": "whois not found"}

        try:
            proc = await asyncio.create_subprocess_exec(
                "whois", domain,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        except asyncio.TimeoutError:
            return {"success": False, "error": "whois timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        raw = stdout.decode(errors="replace")
        return {
            "success": True,
            "output": {
                "domain": domain,
                "raw": raw[:4096],
                "registrar":    self._extract(raw, r"Registrar:\s*(.+)"),
                "name_servers": re.findall(r"Name Server:\s*(.+)", raw, re.IGNORECASE),
                "created":      self._extract(raw, r"Creation Date:\s*(.+)"),
                "expires":      self._extract(raw, r"(?:Expir\w+ Date|Registry Expiry Date):\s*(.+)"),
                "org":          self._extract(raw, r"Registrant Organization:\s*(.+)"),
            },
        }

    def _extract(self, text: str, pattern: str) -> str:
        m = re.search(pattern, text, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("whois"):
            return ToolHealthStatus(available=True, message="whois_lookup")
        return ToolHealthStatus(available=False, message="whois not found")
