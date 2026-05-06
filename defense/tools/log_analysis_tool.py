"""
Defense Tool — analyze_logs

Parses local and remote system logs to extract security-relevant patterns.
Supports: /var/log/auth.log, /var/log/syslog, /var/log/kern.log,
          and custom log paths on remote hosts via SSH.
"""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

# Patterns extracted during log analysis
_PATTERNS = {
    "ssh_fail": re.compile(
        r"Failed (password|publickey) for (?:invalid user )?(\S+) from (\d+\.\d+\.\d+\.\d+) port \d+"
    ),
    "ssh_accept": re.compile(
        r"Accepted (password|publickey) for (\S+) from (\d+\.\d+\.\d+\.\d+) port \d+"
    ),
    "sudo": re.compile(r"sudo:\s+(\S+) : .* COMMAND=(.+)$"),
    "oom": re.compile(r"Out of memory: Kill process (\d+) \((\S+)\)"),
    "iptables_drop": re.compile(r"IN=\S* OUT=\S* SRC=(\d+\.\d+\.\d+\.\d+) DST=(\d+\.\d+\.\d+\.\d+)"),
    "cron_exec": re.compile(r"CRON\[.+\]: \((\S+)\) CMD \((.+)\)"),
    "useradd": re.compile(r"useradd\[.+\]: new user: name=(\S+)"),
    "su_fail": re.compile(r"su: FAILED su for (\S+) by (\S+)"),
}

_DEFAULT_LOGS = [
    "/var/log/auth.log",
    "/var/log/syslog",
    "/var/log/kern.log",
    "/var/log/messages",
]

_MAX_LINES = 2000  # Read last N lines per log file


class AnalyzeLogsTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="analyze_logs",
            description=(
                "Analyze system logs to find security events: SSH failures, sudo abuse, "
                "new user creation, OOM kills, iptables drops, and more. "
                "Can analyze local logs or logs on a remote host via SSH. "
                "Returns structured findings: failed_logins (with counts per IP), "
                "successful_logins, suspicious_commands, and raw_matches."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "log_files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Log file paths to analyze. "
                            "Defaults to ['/var/log/auth.log', '/var/log/syslog']"
                        ),
                    },
                    "ssh_host": {
                        "type": "string",
                        "description": "Optional: analyze logs on a remote host via SSH"
                    },
                    "ssh_user": {
                        "type": "string",
                        "description": "SSH username for remote log analysis"
                    },
                    "ssh_key": {
                        "type": "string",
                        "description": "SSH key path for remote access"
                    },
                    "tail_lines": {
                        "type": "integer",
                        "description": f"Number of lines from end of file to analyze (default {_MAX_LINES})"
                    },
                    "pattern_filter": {
                        "type": "string",
                        "description": (
                            "Optional grep pattern to pre-filter log lines before analysis. "
                            "Speeds up analysis on large logs."
                        )
                    },
                },
                "required": [],
            },
            category="response",
        )

    async def health_check(self) -> ToolHealthStatus:
        for path in _DEFAULT_LOGS:
            if Path(path).exists():
                return ToolHealthStatus(available=True, message="OK")
        return ToolHealthStatus(
            available=True,
            degraded=True,
            message="No standard log files found — will return empty results for missing files",
        )

    async def execute(self, params: dict) -> dict:
        log_files = params.get("log_files") or _DEFAULT_LOGS
        ssh_host = params.get("ssh_host", "").strip()
        ssh_user = params.get("ssh_user", "root").strip()
        ssh_key = params.get("ssh_key", "").strip()
        tail_lines = int(params.get("tail_lines") or _MAX_LINES)
        pattern_filter = params.get("pattern_filter", "").strip()

        try:
            if ssh_host:
                return await self._analyze_remote(
                    ssh_host, ssh_user, ssh_key, log_files, tail_lines, pattern_filter
                )
            return await self._analyze_local(log_files, tail_lines, pattern_filter)

        except Exception as exc:
            logger.exception("analyze_logs error")
            return {"success": False, "output": None, "error": str(exc)}

    async def _analyze_local(
        self, log_files: list[str], tail_lines: int, pattern_filter: str
    ) -> dict:
        all_lines: list[str] = []
        files_read: list[str] = []
        files_missing: list[str] = []

        for path_str in log_files:
            p = Path(path_str)
            if not p.exists():
                files_missing.append(path_str)
                continue
            try:
                # Use tail to get last N lines efficiently
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "tail", "-n", str(tail_lines), str(p),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
                lines = stdout.decode(errors="replace").splitlines()
                if pattern_filter:
                    lines = [l for l in lines if pattern_filter.lower() in l.lower()]
                all_lines.extend(lines)
                files_read.append(path_str)
            except Exception as exc:
                logger.warning("Could not read %s: %s", path_str, exc)
                files_missing.append(path_str)

        findings = self._parse_lines(all_lines)
        findings["files_read"] = files_read
        findings["files_missing"] = files_missing
        findings["total_lines"] = len(all_lines)

        return {"success": True, "output": findings, "error": None}

    async def _analyze_remote(
        self, host: str, user: str, key: str, log_files: list[str],
        tail_lines: int, pattern_filter: str
    ) -> dict:
        files_str = " ".join(f"'{f}'" for f in log_files)
        cmd_inner = f"tail -n {tail_lines} {files_str} 2>/dev/null"
        if pattern_filter:
            cmd_inner += f" | grep -i '{pattern_filter}'"

        ssh_cmd = ["ssh", "-o", "StrictHostKeyChecking=no",
                   "-o", "ConnectTimeout=10", "-o", "BatchMode=yes"]
        if key:
            ssh_cmd += ["-i", key]
        ssh_cmd += [f"{user}@{host}", cmd_inner]

        proc = await asyncio.create_subprocess_exec(
            *ssh_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode not in (0, 1):  # grep returns 1 if no matches
            return {
                "success": False,
                "output": None,
                "error": f"SSH failed: {stderr.decode(errors='replace')[:500]}",
            }

        lines = stdout.decode(errors="replace").splitlines()
        findings = self._parse_lines(lines)
        findings["remote_host"] = host
        findings["total_lines"] = len(lines)
        return {"success": True, "output": findings, "error": None}

    def _parse_lines(self, lines: list[str]) -> dict:
        failed_logins: dict[str, int] = {}   # src_ip → count
        successful_logins: list[dict] = []
        suspicious_cmds: list[str] = []
        iptables_drops: dict[str, int] = {}   # src_ip → count
        new_users: list[str] = []
        raw_matches: list[str] = []

        for line in lines:
            m = _PATTERNS["ssh_fail"].search(line)
            if m:
                src_ip = m.group(3)
                failed_logins[src_ip] = failed_logins.get(src_ip, 0) + 1
                raw_matches.append(line.strip())
                continue

            m = _PATTERNS["ssh_accept"].search(line)
            if m:
                successful_logins.append({
                    "method": m.group(1), "user": m.group(2), "src_ip": m.group(3)
                })
                continue

            m = _PATTERNS["sudo"].search(line)
            if m:
                suspicious_cmds.append(f"SUDO: {m.group(1)} ran: {m.group(2).strip()}")
                continue

            m = _PATTERNS["iptables_drop"].search(line)
            if m:
                src = m.group(1)
                iptables_drops[src] = iptables_drops.get(src, 0) + 1
                continue

            m = _PATTERNS["useradd"].search(line)
            if m:
                new_users.append(m.group(1))
                raw_matches.append(line.strip())
                continue

            m = _PATTERNS["su_fail"].search(line)
            if m:
                suspicious_cmds.append(f"SU_FAIL: {m.group(2)} tried su to {m.group(1)}")

        # Top attackers
        top_attackers = sorted(
            [{"ip": ip, "attempts": cnt} for ip, cnt in failed_logins.items()],
            key=lambda x: x["attempts"], reverse=True,
        )[:20]

        return {
            "failed_logins": failed_logins,
            "top_attackers": top_attackers,
            "successful_logins": successful_logins[:10],
            "suspicious_commands": suspicious_cmds[:20],
            "iptables_drops": iptables_drops,
            "new_users": new_users,
            "raw_matches": raw_matches[:50],
        }
