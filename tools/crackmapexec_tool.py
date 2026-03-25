"""V2 — crackmapexec_run tool. SMB/WMI credential spray and command execution."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
CME_TIMEOUT = 120


class CrackMapExecTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="crackmapexec_run",
            category="exploit-exec",
            description=(
                "Credential spray and remote command execution via SMB/WMI/SSH. "
                "Useful for lateral movement with harvested credentials."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "protocol": {"type": "string", "enum": ["smb", "wmi", "ssh", "winrm"],
                                 "default": "smb"},
                    "targets":  {"type": "string", "description": "IP, CIDR, or comma-separated IPs"},
                    "username": {"type": "string"},
                    "password": {"type": "string", "default": ""},
                    "hash":     {"type": "string", "default": "",
                                 "description": "NTLM hash LM:NT format"},
                    "command":  {"type": "string", "default": "",
                                 "description": "Command to execute after successful login"},
                    "timeout":  {"type": "integer", "default": 120},
                },
                "required": ["targets", "username"],
            },
        )

    async def execute(self, params: dict) -> dict:
        protocol = params.get("protocol", "smb")
        targets = params.get("targets", "")
        username = params.get("username", "")
        password = params.get("password", "")
        hash_val = params.get("hash", "")
        command = params.get("command", "")
        timeout = int(params.get("timeout", CME_TIMEOUT))

        binary = shutil.which("crackmapexec") or shutil.which("cme") or shutil.which("nxc")
        if not binary:
            return {"success": False,
                    "error": "crackmapexec/nxc not found — install with: apt install crackmapexec"}

        cmd = [binary, protocol, targets, "-u", username]
        if hash_val:
            cmd += ["-H", hash_val]
        elif password:
            cmd += ["-p", password]
        if command:
            cmd += ["-x", command]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": "crackmapexec timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        successes = self._parse_successes(output)
        return {
            "success": True,
            "output": {
                "raw_output": output[:4096],
                "successes": successes,
                "session_opened": len(successes) > 0,
            },
        }

    def _parse_successes(self, output: str) -> list[dict]:
        successes = []
        for line in output.splitlines():
            if "[+]" in line and ("Pwn3d" in line or "(Pwn3d!)" in line):
                ip_match = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", line)
                if ip_match:
                    successes.append({"host": ip_match.group(1), "admin": True})
            elif "[+]" in line:
                ip_match = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", line)
                if ip_match:
                    successes.append({"host": ip_match.group(1), "admin": False})
        return successes

    async def health_check(self) -> ToolHealthStatus:
        binary = shutil.which("crackmapexec") or shutil.which("cme") or shutil.which("nxc")
        if binary:
            return ToolHealthStatus(available=True, message="crackmapexec_run")
        return ToolHealthStatus(available=False, message="crackmapexec/nxc not found")
