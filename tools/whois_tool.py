"""V2 — whois_lookup tool. Domain/IP registration data."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_RE_REGISTRAR    = re.compile(r"Registrar:\s*(.+)", re.IGNORECASE)
_RE_CREATED      = re.compile(r"Creation Date:\s*(.+)", re.IGNORECASE)
_RE_EXPIRES      = re.compile(r"(?:Expir\w+ Date|Registry Expiry Date):\s*(.+)", re.IGNORECASE)
_RE_ORG          = re.compile(r"Registrant Organization:\s*(.+)", re.IGNORECASE)
_RE_NAME_SERVERS = re.compile(r"Name Server:\s*(.+)", re.IGNORECASE)


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
                "registrar":    self._extract(_RE_REGISTRAR, raw),
                "name_servers": [m.group(1).strip() for m in _RE_NAME_SERVERS.finditer(raw)],
                "created":      self._extract(_RE_CREATED, raw),
                "expires":      self._extract(_RE_EXPIRES, raw),
                "org":          self._extract(_RE_ORG, raw),
            },
        }

    @staticmethod
    def _extract(pattern: re.Pattern, text: str) -> str:
        m = pattern.search(text)
        return m.group(1).strip() if m else ""

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("whois"):
            return ToolHealthStatus(available=True, message="whois_lookup")
        return ToolHealthStatus(available=False, message="whois not found")
