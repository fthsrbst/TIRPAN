"""V2 — ffuf_scan tool. Fast web directory/file brute-forcer."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
FFUF_TIMEOUT = 180
DEFAULT_WORDLIST = "/usr/share/wordlists/dirb/common.txt"


class FfufTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="ffuf_scan",
            category="recon",
            description=(
                "Fast web fuzzer for directory and file discovery. "
                "Requires a wordlist on the target system."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":        {"type": "string", "description": "Base URL (FUZZ appended)"},
                    "wordlist":   {"type": "string", "default": DEFAULT_WORDLIST},
                    "extensions": {"type": "string", "default": ".php,.txt,.html,.bak",
                                   "description": "File extensions to test"},
                    "timeout":    {"type": "integer", "default": 180},
                    "filter_codes": {"type": "string", "default": "404,403",
                                     "description": "HTTP status codes to filter out"},
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        url = params.get("url", "").rstrip("/")
        wordlist = params.get("wordlist", DEFAULT_WORDLIST)
        extensions = params.get("extensions", ".php,.txt,.html,.bak")
        timeout = int(params.get("timeout", FFUF_TIMEOUT))
        filter_codes = params.get("filter_codes", "404,403")

        if not shutil.which("ffuf"):
            return {"success": False, "error": "ffuf not found — install with: apt install ffuf"}

        fuzz_url = f"{url}/FUZZ"
        cmd = [
            "ffuf", "-u", fuzz_url, "-w", wordlist,
            "-e", extensions, "-fc", filter_codes,
            "-json", "-s",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": "ffuf timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        try:
            data = json.loads(stdout.decode(errors="replace"))
            results = [
                {"url": r.get("url", ""), "status": r.get("status", 0),
                 "length": r.get("length", 0), "words": r.get("words", 0)}
                for r in data.get("results", [])
            ]
        except Exception:
            results = []

        return {"success": True, "output": {"results": results, "total": len(results), "base_url": url}}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("ffuf"):
            return ToolHealthStatus(available=True, message="ffuf_scan")
        return ToolHealthStatus(available=False, message="ffuf not found")
