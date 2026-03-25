"""V2 — whatweb_scan tool. Web technology fingerprinting."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
WHATWEB_TIMEOUT = 60


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

        cmd = ["whatweb", f"-a{aggression}", "--log-json=-", url]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=WHATWEB_TIMEOUT)
        except asyncio.TimeoutError:
            return {"success": False, "error": "whatweb timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        plugins = {}
        for line in stdout.decode(errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if isinstance(entry, list) and entry:
                    for item in entry:
                        plugins.update(item.get("plugins", {}))
                elif isinstance(entry, dict):
                    plugins.update(entry.get("plugins", {}))
            except Exception:
                continue

        tech = [{"name": k, "detail": v} for k, v in plugins.items()]
        return {"success": True, "output": {"url": url, "plugins": plugins, "technologies": tech}}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("whatweb"):
            return ToolHealthStatus(available=True, message="whatweb_scan")
        return ToolHealthStatus(available=False, message="whatweb not found")
