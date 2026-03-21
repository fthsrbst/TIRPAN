"""
V2 — ShellManager

Unified service layer for persistent shell sessions across all specialized agents.

Design:
  - Thin wrapper over existing ShellSessionTool (bind/reverse/ssh) and
    MetasploitTool (meterpreter sessions).
  - asyncio.Semaphore(1) serializes ALL Metasploit RPC calls — only one
    msf action runs at a time to avoid RPC race conditions.
  - Sessions are tracked in-memory (ShellSessionEntry) and optionally
    persisted to the DB via ShellSessionRepository (future Step 9).
  - Agents request shells by calling open_shell() — get back a shell_key.
  - All exec() calls go through this manager, not directly to tools.

Multi-agent usage:
    mgr = ShellManager(shell_tool, msf_tool)
    key = await mgr.open_shell("ssh", "10.0.0.1", username="root", password="x")
    result = await mgr.exec(key, "id")
    await mgr.close(key)
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ── Session record ─────────────────────────────────────────────────────────

@dataclass
class ShellSession:
    shell_key:      str
    session_type:   str      # "ssh" | "bind" | "reverse" | "meterpreter"
    host_ip:        str
    username:       str = ""
    privilege_level: int = 0  # 0=user 1=root/SYSTEM
    status:         str = "active"  # active | closed | lost
    opened_at:      float = field(default_factory=time.time)
    closed_at:      float | None = None
    notes:          str = ""
    # Internal: tool-specific session key / MSF session ID
    _tool_key:      str = ""
    _msf_session_id: int | None = None

    def to_dict(self) -> dict:
        return {
            "shell_key":       self.shell_key,
            "session_type":    self.session_type,
            "host_ip":         self.host_ip,
            "username":        self.username,
            "privilege_level": self.privilege_level,
            "status":          self.status,
            "opened_at":       self.opened_at,
            "closed_at":       self.closed_at,
            "notes":           self.notes,
        }


# ── Manager ────────────────────────────────────────────────────────────────

class ShellManager:
    """
    Service façade for shell sessions — used by all specialized agents.

    Construction:
        mgr = ShellManager(shell_tool=ShellSessionTool(), msf_tool=MetasploitTool())

    Both tool arguments are optional — if omitted, only the corresponding
    session types are unavailable (graceful degradation).
    """

    def __init__(
        self,
        shell_tool=None,       # tools.shell_session_tool.ShellSessionTool
        msf_tool=None,         # tools.metasploit_tool.MetasploitTool
    ):
        self._shell_tool = shell_tool
        self._msf_tool = msf_tool
        # Serialise ALL Metasploit RPC calls — only one at a time
        self._msf_sem = asyncio.Semaphore(1)
        # Active sessions indexed by shell_key
        self._sessions: dict[str, ShellSession] = {}

    # ── Opening sessions ───────────────────────────────────────────────────

    async def open_shell(
        self,
        session_type: str,
        host_ip: str,
        port: int = 0,
        username: str = "",
        password: str = "",
        private_key: str = "",
        bind_timeout: int = 20,
        reverse_wait: int = 120,
        **extra,
    ) -> str:
        """
        Open a new shell session.

        session_type: "ssh" | "bind" | "reverse"

        Returns shell_key (str) that identifies this session.
        Raises RuntimeError if connection fails.
        """
        if not self._shell_tool:
            raise RuntimeError("ShellSessionTool not configured in ShellManager")

        # Build params for ShellSessionTool
        params: dict[str, Any] = {
            "action": "connect",
            "method": session_type,
            "host": host_ip,
        }
        if port:
            params["port"] = port
        if username:
            params["username"] = username
        if password:
            params["password"] = password
        if private_key:
            params["private_key"] = private_key
        params.update(extra)

        result = await self._shell_tool.execute(params)
        if result.get("status") != "success":
            raise RuntimeError(
                f"Failed to open {session_type} shell on {host_ip}: "
                f"{result.get('error', result.get('message', 'unknown error'))}"
            )

        tool_key: str = result.get("session_key", "")
        shell_key = str(uuid.uuid4())

        session = ShellSession(
            shell_key=shell_key,
            session_type=session_type,
            host_ip=host_ip,
            username=username,
            privilege_level=0,
            status="active",
            _tool_key=tool_key,
        )
        self._sessions[shell_key] = session
        logger.info("ShellManager: opened %s shell %s → %s", session_type, shell_key, host_ip)
        return shell_key

    async def adopt_msf_session(
        self,
        msf_session_id: int,
        host_ip: str,
        username: str = "",
        privilege_level: int = 0,
    ) -> str:
        """
        Register an already-open Metasploit session so agents can exec through it.
        Called by ExploitAgent after a successful msf_run.
        """
        shell_key = str(uuid.uuid4())
        session = ShellSession(
            shell_key=shell_key,
            session_type="meterpreter",
            host_ip=host_ip,
            username=username,
            privilege_level=privilege_level,
            status="active",
            _msf_session_id=msf_session_id,
        )
        self._sessions[shell_key] = session
        logger.info("ShellManager: adopted MSF session %d as %s", msf_session_id, shell_key)
        return shell_key

    # ── Executing commands ─────────────────────────────────────────────────

    async def exec(self, shell_key: str, command: str, timeout: int = 60) -> dict:
        """
        Run a command on an open session.

        Returns:
            {"status": "success", "output": str}
            {"status": "error", "error": str}
        """
        session = self._sessions.get(shell_key)
        if session is None:
            return {"status": "error", "error": f"Unknown shell_key: {shell_key}"}
        if session.status != "active":
            return {"status": "error", "error": f"Session {shell_key} is {session.status}"}

        if session.session_type == "meterpreter":
            return await self._exec_msf(session, command, timeout)
        else:
            return await self._exec_shell(session, command, timeout)

    async def _exec_shell(self, session: ShellSession, command: str, timeout: int) -> dict:
        if not self._shell_tool:
            return {"status": "error", "error": "ShellSessionTool not configured"}
        result = await self._shell_tool.execute({
            "action": "exec",
            "session_key": session._tool_key,
            "command": command,
            "timeout": timeout,
        })
        if result.get("status") == "success":
            return {"status": "success", "output": result.get("output", "")}
        return {"status": "error", "error": result.get("error", result.get("message", "exec failed"))}

    async def _exec_msf(self, session: ShellSession, command: str, timeout: int) -> dict:
        if not self._msf_tool:
            return {"status": "error", "error": "MetasploitTool not configured"}
        async with self._msf_sem:
            result = await self._msf_tool.execute({
                "action": "session_exec",
                "session_id": session._msf_session_id,
                "command": command,
                "timeout": timeout,
            })
        if result.get("status") == "success":
            return {"status": "success", "output": result.get("output", "")}
        return {"status": "error", "error": result.get("error", result.get("message", "msf exec failed"))}

    async def exec_script(
        self,
        shell_key: str,
        commands: list[str],
        timeout_per_cmd: int = 30,
    ) -> list[dict]:
        """Run a list of commands sequentially. Returns one result per command."""
        results = []
        for cmd in commands:
            r = await self.exec(shell_key, cmd, timeout=timeout_per_cmd)
            results.append({"command": cmd, **r})
            if r["status"] != "success":
                break
        return results

    # ── Metasploit exploit runner (serialised) ────────────────────────────

    async def run_exploit(
        self,
        module: str,
        rhosts: str,
        rport: int,
        payload: str = "",
        options: dict | None = None,
        timeout: int = 90,
    ) -> dict:
        """
        Run a Metasploit exploit module (serialised via semaphore).
        Returns the raw MetasploitTool result dict.
        """
        if not self._msf_tool:
            return {"status": "error", "error": "MetasploitTool not configured"}
        params = {
            "action": "run",
            "module": module,
            "rhosts": rhosts,
            "rport": rport,
            "payload": payload,
            "timeout": timeout,
        }
        if options:
            params["options"] = options
        async with self._msf_sem:
            return await self._msf_tool.execute(params)

    async def list_msf_sessions(self) -> dict:
        """Return active Metasploit sessions (serialised)."""
        if not self._msf_tool:
            return {}
        async with self._msf_sem:
            result = await self._msf_tool.execute({"action": "sessions"})
        return result.get("sessions", {})

    # ── Closing sessions ───────────────────────────────────────────────────

    async def close(self, shell_key: str) -> bool:
        """Close and remove a session."""
        session = self._sessions.get(shell_key)
        if session is None:
            return False

        if session.session_type in ("ssh", "bind", "reverse") and self._shell_tool:
            await self._shell_tool.execute({
                "action": "close",
                "session_key": session._tool_key,
            })
        # Meterpreter sessions are left open for MSF to manage

        session.status = "closed"
        session.closed_at = time.time()
        self._sessions.pop(shell_key, None)
        logger.info("ShellManager: closed session %s (%s@%s)",
                    shell_key, session.username or "?", session.host_ip)
        return True

    async def close_all(self) -> None:
        """Close every active session (called at mission teardown)."""
        keys = list(self._sessions.keys())
        for key in keys:
            await self.close(key)

    # ── Queries ────────────────────────────────────────────────────────────

    def get_session(self, shell_key: str) -> ShellSession | None:
        return self._sessions.get(shell_key)

    def list_sessions(self) -> list[ShellSession]:
        return list(self._sessions.values())

    def list_sessions_for_host(self, host_ip: str) -> list[ShellSession]:
        return [s for s in self._sessions.values() if s.host_ip == host_ip]

    def has_active_session(self, host_ip: str) -> bool:
        return any(
            s.host_ip == host_ip and s.status == "active"
            for s in self._sessions.values()
        )

    def get_best_session(self, host_ip: str) -> ShellSession | None:
        """Return highest-privilege active session for a host."""
        candidates = [
            s for s in self._sessions.values()
            if s.host_ip == host_ip and s.status == "active"
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda s: s.privilege_level)

    def stats(self) -> dict:
        active = [s for s in self._sessions.values() if s.status == "active"]
        return {
            "total": len(self._sessions),
            "active": len(active),
            "by_type": {
                t: sum(1 for s in active if s.session_type == t)
                for t in ("ssh", "bind", "reverse", "meterpreter")
            },
        }
