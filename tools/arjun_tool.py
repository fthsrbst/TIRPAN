"""V2 — arjun_scan tool. HTTP parameter discovery (hidden/undocumented parameters)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 180


class ArjunTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="arjun_scan",
            category="recon",
            description=(
                "HTTP parameter discovery tool. Finds hidden GET/POST parameters "
                "that are not visible in the HTML but affect the server response.\n"
                "Use this before SQLMap or Commix to discover attack surface.\n"
                "Parameters:\n"
                "  url     — target URL\n"
                "  method  — HTTP method: GET or POST (default: GET)\n"
                "  headers — dict of additional headers (e.g. Authorization)\n"
                "  delay   — delay between requests in seconds (default: 0)\n"
                "  stable  — only include stable parameters (default: false)\n"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":     {"type": "string", "description": "Target URL"},
                    "method":  {"type": "string", "default": "GET"},
                    "headers": {"type": "object"},
                    "delay":   {"type": "number", "default": 0},
                    "stable":  {"type": "boolean", "default": False},
                    "timeout": {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        arjun_path = shutil.which("arjun")
        if not arjun_path:
            return {
                "success": False,
                "error": "arjun not found — install with: pip install arjun",
            }

        url     = params["url"]
        method  = params.get("method", "GET").upper()
        headers = params.get("headers", {})
        delay   = float(params.get("delay", 0))
        stable  = bool(params.get("stable", False))
        timeout = int(params.get("timeout", _DEFAULT_TIMEOUT))

        cmd = [
            "arjun",
            "-u", url,
            "-m", method,
            "--disable-redirects",
        ]

        for k, v in headers.items():
            cmd += ["-H", f"{k}: {v}"]

        if delay:
            cmd += ["--delay", str(delay)]

        if stable:
            cmd.append("--stable")

        # Output JSON for easier parsing
        cmd += ["-oJ", "/tmp/arjun_out.json"]

        logger.info("arjun cmd: %s", " ".join(cmd))

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd="/tmp",
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": f"arjun timeout after {timeout}s"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        err    = stderr.decode(errors="replace")

        parameters = self._parse_output(output)

        # Try to read JSON output file
        try:
            import os
            if os.path.exists("/tmp/arjun_out.json"):
                with open("/tmp/arjun_out.json") as f:
                    json_data = json.load(f)
                # arjun JSON: {"url": [...params...]}
                for _url, params_list in json_data.items():
                    if isinstance(params_list, list):
                        parameters = list(set(parameters + params_list))
                os.remove("/tmp/arjun_out.json")
        except Exception:
            pass

        return {
            "success": True,
            "output": {
                "url": url,
                "method": method,
                "parameters_found": parameters,
                "total": len(parameters),
                "raw_output": output[:3000],
                "next_steps": (
                    f"Discovered {len(parameters)} parameters. "
                    "Feed into sqlmap_scan or commix_scan for injection testing."
                    if parameters else "No hidden parameters found."
                ),
            },
        }

    def _parse_output(self, output: str) -> list[str]:
        params = []
        # Arjun outputs lines like: [*] Found 3 parameters: id, name, debug
        m = re.search(r"Found \d+ parameters?: (.+)", output, re.IGNORECASE)
        if m:
            raw = m.group(1)
            params = [p.strip() for p in raw.split(",") if p.strip()]

        # Also pick up individual parameter lines
        for line in output.splitlines():
            m2 = re.search(r"\[\+\] Parameter: (\S+)", line)
            if m2:
                p = m2.group(1)
                if p not in params:
                    params.append(p)

        return params

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("arjun"):
            return ToolHealthStatus(available=True, message="arjun_scan ready")
        return ToolHealthStatus(
            available=False,
            message="arjun not found",
            install_hint="pip install arjun",
        )
