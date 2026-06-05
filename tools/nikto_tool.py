"""V2 — nikto_scan tool. Web server vulnerability scanner."""

from __future__ import annotations

import asyncio
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
# 150s default (nikto self-limits via -maxtime): finds the bulk of issues on a
# legacy host without monopolising the webapp agent's wall-clock budget.
NIKTO_TIMEOUT = 150


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

        # NOTE: do NOT pass `-Format txt` without `-output <file>` — nikto 2.5.x
        # aborts with "Output file format specified without a name", which the old
        # code swallowed as an empty (but successful) scan. nikto prints its
        # findings to stdout by default, which _parse_nikto_output reads directly.
        cmd = [
            "nikto", "-h", url, "-nointeractive",
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
            # nikto self-limits to -maxtime=<timeout>s, then needs a few seconds
            # to print its summary and exit. The outer guard MUST exceed maxtime
            # or it kills nikto mid-flush (race → spurious "nikto timeout" with no
            # findings). Give it a buffer beyond nikto's own cap.
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout + 20)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            return {"success": False, "error": "nikto timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        err_text = stderr.decode(errors="replace")
        findings = self._parse_nikto_output(output, url)

        # nikto exits non-zero on the benign maxtime cap, so only treat it as a
        # failure when it produced no usable output at all — that means a real
        # tool/CLI error (bad flag, missing target) rather than a clean target.
        rc = proc.returncode
        if not findings and len(output.strip().splitlines()) <= 2 and rc not in (0, None):
            return {"success": False,
                    "error": f"nikto error (rc={rc}): {(err_text or output).strip()[:300]}"}

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
