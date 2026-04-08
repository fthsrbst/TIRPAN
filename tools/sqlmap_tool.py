"""V2 — sqlmap_scan tool. Automated SQL injection detection and exploitation."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import tempfile
from pathlib import Path

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 300


class SqlmapTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="sqlmap_scan",
            category="exploit-web",
            description=(
                "Automated SQL injection scanner and exploitation tool.\n"
                "Actions:\n"
                "  detect        — test if URL/parameter is injectable (safe, level 1-2)\n"
                "  enumerate_dbs — list available databases\n"
                "  dump_table    — dump a specific table (requires db and table params)\n"
                "  os_shell      — attempt OS command execution via SQLi (requires stacked queries)\n"
                "  file_read     — read a file from the server via SQLi\n"
                "Parameters:\n"
                "  url     — full target URL with parameter (e.g. http://target/page.php?id=1)\n"
                "  data    — POST body (for POST-based injection)\n"
                "  cookie  — session cookie string\n"
                "  headers — dict of additional HTTP headers\n"
                "  dbms    — database type: mysql, mssql, postgresql, oracle, sqlite\n"
                "  level   — detection depth 1-5 (default: 2; use 3-5 only if needed)\n"
                "  risk    — risk level 1-3 (default: 1; 2-3 may modify data)\n"
                "  db      — target database name (for dump_table/file_read)\n"
                "  table   — target table name (for dump_table)\n"
                "  columns — comma-separated columns to dump (optional)\n"
                "  file_path — server-side file path (for file_read)\n"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":       {"type": "string", "description": "Target URL"},
                    "action":    {"type": "string", "description": "detect|enumerate_dbs|dump_table|os_shell|file_read"},
                    "data":      {"type": "string", "description": "POST body"},
                    "cookie":    {"type": "string"},
                    "headers":   {"type": "object"},
                    "dbms":      {"type": "string"},
                    "level":     {"type": "integer", "default": 2},
                    "risk":      {"type": "integer", "default": 1},
                    "db":        {"type": "string"},
                    "table":     {"type": "string"},
                    "columns":   {"type": "string"},
                    "file_path": {"type": "string"},
                    "timeout":   {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
                "required": ["url", "action"],
            },
        )

    async def execute(self, params: dict) -> dict:
        if not shutil.which("sqlmap"):
            return {"success": False, "error": "sqlmap not found — install with: pip install sqlmap OR apt install sqlmap"}

        url     = params["url"]
        action  = params.get("action", "detect").lower()
        data    = params.get("data")
        cookie  = params.get("cookie")
        headers = params.get("headers", {})
        dbms    = params.get("dbms")
        level   = int(params.get("level", 2))
        risk    = int(params.get("risk", 1))
        timeout = int(params.get("timeout", _DEFAULT_TIMEOUT))

        with tempfile.TemporaryDirectory() as tmpdir:
            cmd = [
                "sqlmap",
                "-u", url,
                "--batch",              # non-interactive
                "--output-dir", tmpdir,
                f"--level={level}",
                f"--risk={risk}",
                "--timeout=10",
                "--retries=1",
            ]

            if data:
                cmd += ["--data", data]
            if cookie:
                cmd += ["--cookie", cookie]
            if dbms:
                cmd += [f"--dbms={dbms}"]
            for k, v in headers.items():
                cmd += ["-H", f"{k}: {v}"]

            # Action-specific flags
            if action == "detect":
                pass  # basic test only
            elif action == "enumerate_dbs":
                cmd.append("--dbs")
            elif action == "dump_table":
                db    = params.get("db")
                table = params.get("table")
                cols  = params.get("columns")
                if db:
                    cmd += ["-D", db]
                if table:
                    cmd += ["-T", table]
                if cols:
                    cmd += ["-C", cols]
                cmd.append("--dump")
            elif action == "os_shell":
                cmd.append("--os-shell")
                cmd.append("--technique=S")  # stacked queries required
            elif action == "file_read":
                file_path = params.get("file_path", "/etc/passwd")
                cmd += ["--file-read", file_path]

            logger.info("sqlmap cmd: %s", " ".join(cmd))

            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd="/tmp",
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                return {"success": False, "error": f"sqlmap timeout after {timeout}s"}
            except Exception as e:
                return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        err    = stderr.decode(errors="replace")

        parsed = self._parse_output(output, action)
        return {
            "success": True,
            "output": {
                "url": url,
                "action": action,
                "injectable": parsed["injectable"],
                "parameter": parsed.get("parameter"),
                "technique": parsed.get("technique"),
                "dbms": parsed.get("dbms"),
                "databases": parsed.get("databases", []),
                "data": parsed.get("data", []),
                "raw_output": output[:6000],
                "stderr": err[:512] if err else "",
            },
        }

    def _parse_output(self, output: str, action: str) -> dict:
        result: dict = {"injectable": False}

        if "is vulnerable" in output or "Parameter:" in output and "is vulnerable" in output:
            result["injectable"] = True
        if "[INFO] GET parameter" in output or "[INFO] POST parameter" in output:
            result["injectable"] = True

        # Extract parameter name
        m = re.search(r"Parameter: ([^\s(]+)", output)
        if m:
            result["parameter"] = m.group(1)

        # Extract technique
        m = re.search(r"Type: (.+)", output)
        if m:
            result["technique"] = m.group(1).strip()

        # Extract DBMS
        m = re.search(r"back-end DBMS: (.+)", output, re.IGNORECASE)
        if m:
            result["dbms"] = m.group(1).strip()
            result["injectable"] = True

        # Extract databases
        if action == "enumerate_dbs":
            dbs = re.findall(r"\[\*\] (.+)", output)
            if not dbs:
                dbs = re.findall(r"available databases \[\d+\]:\r?\n((?:\[\*\] .+\r?\n)+)", output)
            result["databases"] = dbs

        # Extract dumped data (rough extraction)
        if action == "dump_table":
            rows = re.findall(r"\| (.+?) \|", output)
            result["data"] = rows[:50]  # cap to avoid huge output

        return result

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("sqlmap"):
            return ToolHealthStatus(available=True, message="sqlmap_scan ready")
        return ToolHealthStatus(
            available=False,
            message="sqlmap not found",
            install_hint="apt install sqlmap   OR   pip install sqlmap",
        )
