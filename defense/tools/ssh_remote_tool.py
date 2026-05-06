"""
Defense Tool — ssh_remote_cmd

Execute defensive commands on remote hosts via SSH.
Used to: isolate compromised hosts, collect remote logs,
         run remote hardening, restart services, etc.
"""

from __future__ import annotations

import asyncio
import logging

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)

_SAFE_CMD_PREFIXES = (
    "systemctl", "netstat", "ss", "ps", "who", "last", "journalctl",
    "tail", "cat", "grep", "iptables -L", "iptables -n", "ip route",
    "ip addr", "ifconfig", "uname", "uptime", "df", "free", "id",
    "iptables -I", "iptables -A", "iptables -D", "ufw", "firewall-cmd",
    "systemctl stop", "systemctl disable", "systemctl restart",
)

_BLOCKED_CMDS = ("rm -rf", "mkfs", "dd if=", ":(){ :|:", "shutdown", "reboot",
                 "> /dev/sda", "wget http", "curl http")


class SshRemoteCmdTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="ssh_remote_cmd",
            description=(
                "Execute a defensive command on a remote host via SSH. "
                "Use this to: isolate a compromised host (add block rules remotely), "
                "collect logs from a remote machine, stop a malicious service, "
                "or check process/network state on a remote asset. "
                "Only defensive/read commands are permitted. "
                "Returns stdout and stderr from the remote command."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "description": "Remote host IP or hostname"
                    },
                    "command": {
                        "type": "string",
                        "description": (
                            "Shell command to run on the remote host. "
                            "Must be a defensive command: systemctl, netstat, iptables, "
                            "journalctl, tail, grep, ps, who, id, ip, etc."
                        )
                    },
                    "user": {
                        "type": "string",
                        "description": "SSH user (default: root)"
                    },
                    "ssh_key": {
                        "type": "string",
                        "description": "Path to SSH private key (default: ~/.ssh/id_rsa)"
                    },
                    "port": {
                        "type": "integer",
                        "description": "SSH port (default: 22)"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why you are running this remote command"
                    },
                },
                "required": ["host", "command"],
            },
            category="response",
        )

    async def execute(self, params: dict) -> dict:
        host = params.get("host", "").strip()
        command = params.get("command", "").strip()
        user = params.get("user", "root").strip()
        ssh_key = params.get("ssh_key", "").strip()
        port = int(params.get("port") or 22)
        reason = params.get("reason", "defense operation")

        if not host:
            return {"success": False, "output": None, "error": "host is required"}
        if not command:
            return {"success": False, "output": None, "error": "command is required"}

        # Safety check: block obviously destructive commands
        cmd_lower = command.lower()
        for blocked in _BLOCKED_CMDS:
            if blocked in cmd_lower:
                return {
                    "success": False,
                    "output": None,
                    "error": f"Command blocked by safety guard: contains '{blocked}'",
                }

        ssh_cmd = [
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=15",
            "-o", "BatchMode=yes",
            "-p", str(port),
        ]
        if ssh_key:
            ssh_cmd += ["-i", ssh_key]
        ssh_cmd += [f"{user}@{host}", command]

        logger.info("SSH remote cmd on %s@%s: %s (reason: %s)", user, host, command, reason)

        try:
            proc = await asyncio.create_subprocess_exec(
                *ssh_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            out_text = stdout.decode(errors="replace")
            err_text = stderr.decode(errors="replace")

            return {
                "success": proc.returncode == 0,
                "output": {
                    "host": host,
                    "user": user,
                    "command": command,
                    "returncode": proc.returncode,
                    "stdout": out_text[:4000],
                    "stderr": err_text[:1000],
                },
                "error": err_text if proc.returncode != 0 else None,
            }

        except asyncio.TimeoutError:
            return {"success": False, "output": None,
                    "error": f"SSH command timed out on {host}"}
        except Exception as exc:
            logger.exception("ssh_remote_cmd error for %s", host)
            return {"success": False, "output": None, "error": str(exc)}
