"""V2 — whatweb_scan tool. Web technology fingerprinting."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
WHATWEB_TIMEOUT = 60

# Matches "Name[detail]" tokens in WhatWeb's default plaintext line, e.g.
#   http://t/ [200 OK] HTTPServer[Apache/2.2.8] Title[Foo] X-Powered-By[PHP/5.2]
_WW_TOKEN_RE = re.compile(r"([A-Za-z0-9_\-]+)\[([^\]]*)\]")


class WhatWebTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="whatweb_scan",
            category="recon",
            description=(
                "Identifies web technologies: CMS, frameworks, server software, "
                "JavaScript libraries, analytics, and more."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":     {"type": "string", "description": "Target URL"},
                    "aggression": {"type": "integer", "default": 1,
                                   "description": "1=passive, 3=aggressive"},
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        url = params.get("url", "")
        aggression = int(params.get("aggression", 1))

        if not shutil.which("whatweb"):
            return {"success": False, "error": "whatweb not found — install with: apt install whatweb"}

        # Tool-variant tolerant: the canonical Ruby WhatWeb supports
        # `-a<n> --log-json=-`, but some environments ship a Python clone that
        # only accepts a bare `whatweb <url>` and prints a bracketed text line.
        # Try the JSON form first; if the binary rejects the flags (or returns
        # nothing), fall back to the plaintext form and parse that. A genuine
        # tool error (unknown flag, etc.) is surfaced as success=False instead of
        # being silently reported as "no technologies / no web service".
        rc, stdout, stderr = await self._run(
            ["whatweb", f"-a{aggression}", "--log-json=-", url]
        )
        if stdout is None:
            return {"success": False, "error": stderr or "whatweb failed to run"}

        plugins = self._parse_json(stdout)

        flag_err = "unrecognized arguments" in stderr.lower() or "unrecognized arguments" in stdout.lower()
        if not plugins and (rc != 0 or flag_err):
            # Fall back to the plaintext-only variant.
            rc2, stdout2, stderr2 = await self._run(["whatweb", url])
            if stdout2 is None:
                return {"success": False, "error": stderr2 or "whatweb failed to run"}
            plugins = self._parse_text(stdout2)
            if not plugins and rc2 != 0:
                return {"success": False,
                        "error": f"whatweb error (rc={rc2}): {(stderr2 or stdout2).strip()[:300]}"}
            rc, stdout, stderr = rc2, stdout2, stderr2

        if not plugins and rc != 0:
            return {"success": False,
                    "error": f"whatweb error (rc={rc}): {(stderr or stdout).strip()[:300]}"}

        tech = [{"name": k, "detail": v} for k, v in plugins.items()]
        return {"success": True, "output": {"url": url, "plugins": plugins, "technologies": tech}}

    async def _run(self, cmd: list[str]):
        """Run a subprocess; return (returncode, stdout_str, stderr_str).

        stdout_str is None only when the process could not be started/awaited.
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, err = await asyncio.wait_for(proc.communicate(), timeout=WHATWEB_TIMEOUT)
        except asyncio.TimeoutError:
            return None, None, "whatweb timeout"
        except Exception as e:  # pragma: no cover - defensive
            return None, None, str(e)
        return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")

    @staticmethod
    def _parse_json(text: str) -> dict:
        plugins: dict = {}
        for line in text.splitlines():
            line = line.strip()
            if not line or (line[0] != "[" and line[0] != "{"):
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(entry, list):
                for item in entry:
                    if isinstance(item, dict):
                        plugins.update(item.get("plugins", {}))
            elif isinstance(entry, dict):
                plugins.update(entry.get("plugins", {}))
        return plugins

    @staticmethod
    def _parse_text(text: str) -> dict:
        """Parse WhatWeb's default plaintext line into a plugins dict."""
        plugins: dict = {}
        for line in text.splitlines():
            for name, detail in _WW_TOKEN_RE.findall(line):
                # Skip the leading "[200 OK]" status (not a Name[..] token anyway).
                plugins.setdefault(name, {"string": [detail]} if detail else {})
        return plugins

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("whatweb"):
            return ToolHealthStatus(available=True, message="whatweb_scan")
        return ToolHealthStatus(available=False, message="whatweb not found")
