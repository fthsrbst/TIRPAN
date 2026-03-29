"""V2 — nikto_scan tool. Web server vulnerability scanner."""

from __future__ import annotations

import asyncio
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
NIKTO_TIMEOUT = 120


class NiktoTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="nikto_scan",
            category="recon",
            description=(
                "Web server scanner — detects dangerous files, outdated software, "
                "misconfigurations, and HTTP header issues."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":     {"type": "string", "description": "Target URL (http/https://host:port)"},
                    "timeout": {"type": "integer", "default": 300},
                    "tuning":  {"type": "string", "default": "",
                                "description": "Nikto tuning options (e.g. '1234578' for selective tests)"},
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        url = params.get("url", "")
        timeout = int(params.get("timeout", NIKTO_TIMEOUT))
        tuning = params.get("tuning", "")
        session_id = params.get("_session_id", "")

        if not shutil.which("nikto"):
            return {"success": False, "error": "nikto not found — install with: apt install nikto"}

        cmd = [
            "nikto", "-h", url, "-nointeractive", "-Format", "txt",
            f"-maxtime={timeout}s",
        ]
        if tuning:
            cmd += ["-Tuning", tuning]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd="/tmp",
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": "nikto timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        findings = self._parse_nikto_output(output, url)

        # Save raw output artifact
        if session_id and output:
            try:
                from core.artifact_store import get_store
                import re as _re
                safe_url = _re.sub(r"[^\w\-.]", "_", url)[:60]
                get_store().save(session_id, "nikto", f"nikto_{safe_url}.txt", output)
            except Exception as _ae:
                logger.debug("nikto artifact save failed: %s", _ae)

        return {"success": True, "output": {"url": url, "findings": findings,
                                             "total": len(findings), "raw_output": output[:4096]}}

    def _parse_nikto_output(self, output: str, url: str) -> list[dict]:
        findings = []
        for line in output.splitlines():
            line = line.strip()
            if line.startswith("+ ") and len(line) > 3:
                item = line[2:].strip()
                if item and not item.startswith("Target") and not item.startswith("Start Time"):
                    findings.append({
                        "title":       item[:120],
                        "description": item,
                        "source_tool": "nikto",
                        "url":         url,
                        "cvss":        0.0,
                    })
        return findings

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("nikto"):
            return ToolHealthStatus(available=True, message="nikto_scan")
        return ToolHealthStatus(available=False, message="nikto not found")
