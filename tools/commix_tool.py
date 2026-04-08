"""V2 — commix_scan tool. Automated OS command injection detection and exploitation."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 300


class CommixTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="commix_scan",
            category="exploit-web",
            description=(
                "Automated OS command injection scanner and exploitation tool.\n"
                "Use this when a web parameter is suspected of passing user input to "
                "OS commands (ping, traceroute, DNS lookup, filename processing, etc.).\n"
                "Actions:\n"
                "  detect  — test for command injection without executing commands\n"
                "  exploit — detect and attempt to obtain an OS shell\n"
                "Parameters:\n"
                "  url        — target URL with parameter (e.g. http://target/ping.php?ip=127.0.0.1)\n"
                "  data       — POST body (for POST-based injection)\n"
                "  cookie     — session cookie string\n"
                "  headers    — additional HTTP headers dict\n"
                "  level      — detection depth 1-3 (default: 1)\n"
                "  os         — target OS hint: unix or win (default: unix)\n"
                "  technique  — injection technique: classic, timing, file-based (default: all)\n"
                "  command    — specific OS command to run after shell obtained (default: id)\n"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":       {"type": "string", "description": "Target URL"},
                    "action":    {"type": "string", "description": "detect|exploit", "default": "detect"},
                    "data":      {"type": "string"},
                    "cookie":    {"type": "string"},
                    "headers":   {"type": "object"},
                    "level":     {"type": "integer", "default": 1},
                    "os":        {"type": "string", "default": "unix"},
                    "technique": {"type": "string", "default": ""},
                    "command":   {"type": "string", "default": "id"},
                    "timeout":   {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
                "required": ["url", "action"],
            },
        )

    async def execute(self, params: dict) -> dict:
        commix_path = shutil.which("commix")
        if not commix_path:
            return {
                "success": False,
                "error": "commix not found — install with: apt install commix OR git clone https://github.com/commixproject/commix",
            }

        url     = params["url"]
        action  = params.get("action", "detect").lower()
        data    = params.get("data")
        cookie  = params.get("cookie")
        headers = params.get("headers", {})
        level   = int(params.get("level", 1))
        os_hint = params.get("os", "unix")
        technique = params.get("technique", "")
        command = params.get("command", "id")
        timeout = int(params.get("timeout", _DEFAULT_TIMEOUT))

        cmd = [
            "commix",
            "--url", url,
            "--batch",
            "--no-logging",
            f"--level={level}",
        ]

        if data:
            cmd += ["--data", data]
        if cookie:
            cmd += ["--cookie", cookie]
        for k, v in headers.items():
            cmd += ["-H", f"{k}: {v}"]
        if technique:
            cmd += [f"--technique={technique}"]
        if os_hint == "win":
            cmd.append("--os=win")

        if action == "exploit":
            # Run a specific command after injection is confirmed
            cmd += ["--os-cmd", command]

        logger.info("commix cmd: %s", " ".join(cmd))

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd="/tmp",
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": f"commix timeout after {timeout}s"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        err    = stderr.decode(errors="replace")
        parsed = self._parse_output(output)

        return {
            "success": True,
            "output": {
                "url": url,
                "action": action,
                "injectable": parsed["injectable"],
                "parameter": parsed.get("parameter"),
                "technique": parsed.get("technique"),
                "command_output": parsed.get("command_output"),
                "raw_output": output[:4096],
                "stderr": err[:512] if err else "",
            },
        }

    def _parse_output(self, output: str) -> dict:
        result: dict = {"injectable": False}

        if "is vulnerable" in output.lower() or "is injectable" in output.lower():
            result["injectable"] = True
        if "[+] The" in output and "appears to be injectable" in output:
            result["injectable"] = True

        # Extract parameter
        m = re.search(r"The '(.+?)' parameter appears to be injectable", output)
        if m:
            result["parameter"] = m.group(1)
            result["injectable"] = True

        # Extract technique
        m = re.search(r"Technique: (.+)", output, re.IGNORECASE)
        if m:
            result["technique"] = m.group(1).strip()

        # Extract command output (lines after the command echo)
        m = re.search(r"\$ (?:id|whoami|.+?)\n(.+?)(?:\n\[|$)", output, re.DOTALL)
        if m:
            result["command_output"] = m.group(1).strip()[:500]

        return result

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("commix"):
            return ToolHealthStatus(available=True, message="commix_scan ready")
        return ToolHealthStatus(
            available=False,
            message="commix not found",
            install_hint="apt install commix   OR   git clone https://github.com/commixproject/commix",
        )
