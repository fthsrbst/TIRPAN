"""
SSHTool — Authenticated SSH command execution for post-exploitation auditing.

Allows the agent to:
  - Connect to a known host using stored credentials (password or private key)
  - Execute commands and retrieve output
  - Perform privilege escalation (sudo, su, pbrun, dzdo, pfexec, doas)
  - Run structured audit checks (users, services, network interfaces, etc.)

Requires: paramiko (pip install paramiko)
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from typing import Optional

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT = 15   # seconds
_CMD_TIMEOUT = 60       # seconds per command


class SSHTool(BaseTool):
    """
    Run authenticated SSH commands on a target host.

    The agent uses this after exploitation when post-exploitation is permitted,
    or when known SSH credentials are provided via MissionBrief.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="ssh_exec",
            description=(
                "Execute a command on a remote host via SSH. "
                "Use when you have valid SSH credentials for the target. "
                "Supports privilege escalation (sudo). "
                "action='command' runs a single command. "
                "action='audit' runs a structured system audit (users, services, network, files)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "description": "Target IP address or hostname",
                    },
                    "username": {
                        "type": "string",
                        "description": "SSH username",
                    },
                    "password": {
                        "type": "string",
                        "description": "SSH password (leave empty if using private_key)",
                        "default": "",
                    },
                    "private_key": {
                        "type": "string",
                        "description": "PEM private key text (leave empty if using password)",
                        "default": "",
                    },
                    "port": {
                        "type": "integer",
                        "description": "SSH port",
                        "default": 22,
                    },
                    "command": {
                        "type": "string",
                        "description": "Shell command to run (for action='command')",
                        "default": "",
                    },
                    "action": {
                        "type": "string",
                        "enum": ["command", "audit"],
                        "description": "command=run single command, audit=run full system audit",
                        "default": "command",
                    },
                    "escalation": {
                        "type": "string",
                        "enum": ["none", "sudo", "su", "pbrun", "dzdo", "pfexec", "doas"],
                        "description": "Privilege escalation method",
                        "default": "none",
                    },
                    "escalation_password": {
                        "type": "string",
                        "description": "Password for privilege escalation",
                        "default": "",
                    },
                },
                "required": ["host", "username"],
            },
            category="post-exploit",
            version="1.0.0",
        )

    async def health_check(self) -> ToolHealthStatus:
        try:
            import paramiko  # noqa: F401
            return ToolHealthStatus(available=True, message="paramiko available")
        except ImportError:
            return ToolHealthStatus(
                available=False,
                message="paramiko not installed",
                install_hint="pip install paramiko",
            )

    async def validate(self, params: dict) -> tuple[bool, str]:
        if not params.get("host"):
            return False, "Missing required parameter: host"
        if not params.get("username"):
            return False, "Missing required parameter: username"
        if params.get("action", "command") == "command" and not params.get("command", "").strip():
            return False, "Missing required parameter: command (for action='command')"
        return True, ""

    async def execute(self, params: dict) -> dict:
        ok, err = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": err}

        host = params["host"]
        username = params["username"]
        password = params.get("password", "")
        private_key_text = params.get("private_key", "")
        port = int(params.get("port", 22))
        action = params.get("action", "command")
        command = params.get("command", "")
        escalation = params.get("escalation", "none")
        escalation_password = params.get("escalation_password", "")

        try:
            result = await asyncio.to_thread(
                self._execute_sync,
                host, port, username, password, private_key_text,
                action, command, escalation, escalation_password,
            )
            return result
        except Exception as exc:
            logger.error("SSH execution failed: %s", exc)
            return {"success": False, "output": None, "error": str(exc)}

    # ── Sync execution (runs in thread pool) ──────────────────────────────────

    def _execute_sync(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        private_key_text: str,
        action: str,
        command: str,
        escalation: str,
        escalation_password: str,
    ) -> dict:
        try:
            import paramiko
        except ImportError:
            return {"success": False, "output": None, "error": "paramiko not installed — pip install paramiko"}

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            connect_kwargs: dict = {
                "hostname": host,
                "port": port,
                "username": username,
                "timeout": _CONNECT_TIMEOUT,
                "look_for_keys": False,
                "allow_agent": False,
            }

            if private_key_text.strip():
                import io
                pkey = paramiko.RSAKey.from_private_key(io.StringIO(private_key_text))
                connect_kwargs["pkey"] = pkey
            else:
                connect_kwargs["password"] = password

            client.connect(**connect_kwargs)

            if action == "audit":
                return self._run_audit(client, escalation, escalation_password)
            else:
                return self._run_command(client, command, escalation, escalation_password)

        except paramiko.AuthenticationException:
            return {"success": False, "output": None, "error": "SSH authentication failed — check credentials"}
        except paramiko.NoValidConnectionsError as e:
            return {"success": False, "output": None, "error": f"Cannot connect to {host}:{port} — {e}"}
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}
        finally:
            client.close()

    def _run_command(
        self,
        client,
        command: str,
        escalation: str,
        escalation_password: str,
    ) -> dict:
        full_command = self._apply_escalation(command, escalation, escalation_password)
        stdout_text, stderr_text, exit_code = self._exec(client, full_command, escalation_password)

        return {
            "success": exit_code == 0,
            "output": {
                "command": command,
                "stdout": stdout_text,
                "stderr": stderr_text,
                "exit_code": exit_code,
                "escalation_used": escalation,
            },
            "error": stderr_text if exit_code != 0 else None,
        }

    def _run_audit(self, client, escalation: str, escalation_password: str) -> dict:
        """Run a structured set of audit commands and return aggregated findings."""
        audit_commands = {
            "whoami":           "id",
            "hostname":         "hostname -f 2>/dev/null || hostname",
            "os_info":          "cat /etc/os-release 2>/dev/null || uname -a",
            "kernel":           "uname -r",
            "uptime":           "uptime",
            "users":            "cat /etc/passwd | grep -v nologin | grep -v false",
            "sudoers":          "sudo -l 2>/dev/null",
            "network":          "ip addr 2>/dev/null || ifconfig 2>/dev/null",
            "routes":           "ip route 2>/dev/null || route -n 2>/dev/null",
            "open_ports":       "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null",
            "processes":        "ps aux --sort=-%cpu 2>/dev/null | head -20",
            "suid_binaries":    "find / -perm -4000 -type f 2>/dev/null | head -20",
            "world_writable":   "find /etc /usr /var -writable -type f 2>/dev/null | head -20",
            "cron_jobs":        "crontab -l 2>/dev/null; ls -la /etc/cron* 2>/dev/null",
            "ssh_config":       "cat /etc/ssh/sshd_config 2>/dev/null | grep -v '^#' | grep -v '^$'",
            "docker":           "docker ps 2>/dev/null; cat /.dockerenv 2>/dev/null && echo 'IN_CONTAINER'",
            "env_vars":         "env 2>/dev/null | grep -iE 'pass|key|secret|token|api' | head -20",
        }

        results: dict[str, str] = {}
        errors: dict[str, str] = {}

        for key, cmd in audit_commands.items():
            full_cmd = self._apply_escalation(cmd, escalation, escalation_password)
            try:
                stdout, stderr, exit_code = self._exec(client, full_cmd, escalation_password)
                results[key] = stdout.strip()
                if stderr.strip() and exit_code != 0:
                    errors[key] = stderr.strip()
            except Exception as exc:
                errors[key] = str(exc)

        return {
            "success": True,
            "output": {
                "audit_results": results,
                "errors": errors,
                "total_checks": len(audit_commands),
                "successful_checks": len(results) - len(errors),
            },
            "error": None,
        }

    def _apply_escalation(self, command: str, escalation: str, escalation_password: str) -> str:
        """Wrap command with privilege escalation if requested."""
        if escalation == "none" or not escalation:
            return command
        if escalation == "sudo":
            if escalation_password:
                return f"echo '{escalation_password}' | sudo -S sh -c '{command}'"
            return f"sudo sh -c '{command}'"
        if escalation == "su":
            if escalation_password:
                return f"echo '{escalation_password}' | su -c '{command}'"
            return f"su -c '{command}'"
        if escalation == "pbrun":
            return f"pbrun sh -c '{command}'"
        if escalation == "dzdo":
            return f"dzdo sh -c '{command}'"
        if escalation == "pfexec":
            return f"pfexec sh -c '{command}'"
        if escalation == "doas":
            return f"doas sh -c '{command}'"
        return command

    def _exec(self, client, command: str, escalation_password: str = "") -> tuple[str, str, int]:
        """Execute a command via SSH and return (stdout, stderr, exit_code)."""
        stdin, stdout, stderr = client.exec_command(command, timeout=_CMD_TIMEOUT)

        # Write escalation password to stdin if needed (for su)
        if escalation_password and "echo" not in command:
            try:
                stdin.write(escalation_password + "\n")
                stdin.flush()
            except Exception:
                pass

        stdout_text = stdout.read().decode(errors="replace")
        stderr_text = stderr.read().decode(errors="replace")
        exit_code = stdout.channel.recv_exit_status()
        return stdout_text, stderr_text, exit_code
