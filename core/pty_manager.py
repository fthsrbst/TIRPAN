"""
Native PTY session manager for the web console terminal.

This manager is intentionally scoped to operator-facing interactive terminal
sessions and is independent from exploit shell orchestration.
"""

from __future__ import annotations

import asyncio
import errno
import fcntl
import logging
import os
import pty
import select
import signal
import struct
import subprocess
import termios
import time
import uuid
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class PTYSession:
    terminal_id: str
    session_id: str
    shell: str
    process: subprocess.Popen
    master_fd: int
    created_at: float = field(default_factory=time.time)
    last_active_at: float = field(default_factory=time.time)
    closed: bool = False
    close_reason: str = ""
    exit_code: int | None = None


class PTYManager:
    """Manages native PTY-backed shell sessions for the web terminal."""

    def __init__(self, idle_timeout_seconds: int = 900, max_sessions: int = 8):
        self._idle_timeout_seconds = max(60, int(idle_timeout_seconds))
        self._max_sessions = max(1, int(max_sessions))
        self._sessions: dict[str, PTYSession] = {}

    @property
    def idle_timeout_seconds(self) -> int:
        return self._idle_timeout_seconds

    def _resolve_shell(self, requested_shell: str) -> str:
        req = (requested_shell or "bash").strip().lower()
        if req in ("sh", "/bin/sh"):
            candidates = ["/bin/sh", "/usr/bin/sh"]
        else:
            candidates = ["/bin/bash", "/usr/bin/bash", "/bin/sh"]

        for candidate in candidates:
            if os.path.exists(candidate):
                return candidate
        raise RuntimeError("No suitable shell binary found on host")

    @staticmethod
    def _set_winsize(fd: int, rows: int, cols: int) -> None:
        rows = max(12, int(rows))
        cols = max(40, int(cols))
        packed = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)

    async def open_terminal(
        self,
        session_id: str,
        shell: str = "bash",
        rows: int = 24,
        cols: int = 80,
    ) -> PTYSession:
        if os.name != "posix":
            raise RuntimeError("Native PTY terminal is only supported on POSIX hosts")

        if len(self._sessions) >= self._max_sessions:
            raise RuntimeError("Maximum native terminal sessions reached")

        terminal_id = str(uuid.uuid4())
        shell_path = self._resolve_shell(shell)
        session = await asyncio.to_thread(
            self._open_terminal_sync,
            terminal_id,
            session_id,
            shell_path,
            rows,
            cols,
        )
        self._sessions[terminal_id] = session
        logger.info("PTY opened: %s (%s)", terminal_id, shell_path)
        return session

    def _open_terminal_sync(
        self,
        terminal_id: str,
        session_id: str,
        shell_path: str,
        rows: int,
        cols: int,
    ) -> PTYSession:
        master_fd, slave_fd = pty.openpty()
        self._set_winsize(slave_fd, rows, cols)

        env = os.environ.copy()
        env.setdefault("TERM", "xterm-256color")
        env.setdefault("COLORTERM", "truecolor")

        argv = [shell_path, "-i"] if shell_path.endswith("bash") else [shell_path]

        proc = subprocess.Popen(
            argv,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=os.path.expanduser("~"),
            env=env,
            start_new_session=True,
            close_fds=True,
        )

        try:
            os.set_blocking(master_fd, False)
        except Exception:
            pass

        try:
            os.close(slave_fd)
        except OSError:
            pass

        return PTYSession(
            terminal_id=terminal_id,
            session_id=session_id,
            shell=shell_path,
            process=proc,
            master_fd=master_fd,
        )

    def _get_session(self, terminal_id: str) -> PTYSession:
        session = self._sessions.get(terminal_id)
        if not session:
            raise RuntimeError(f"Unknown terminal_id: {terminal_id}")
        return session

    def touch_terminal(self, terminal_id: str) -> None:
        session = self._sessions.get(terminal_id)
        if session and not session.closed:
            session.last_active_at = time.time()

    async def write_terminal(self, terminal_id: str, data: str) -> None:
        session = self._get_session(terminal_id)
        if session.closed:
            raise RuntimeError("Terminal is already closed")

        payload = (data or "").encode("utf-8", errors="ignore")
        if not payload:
            return

        await asyncio.to_thread(os.write, session.master_fd, payload)
        session.last_active_at = time.time()

    async def resize_terminal(self, terminal_id: str, rows: int, cols: int) -> None:
        session = self._get_session(terminal_id)
        if session.closed:
            return

        await asyncio.to_thread(self._set_winsize, session.master_fd, rows, cols)
        try:
            os.killpg(os.getpgid(session.process.pid), signal.SIGWINCH)
        except Exception:
            pass

    async def read_terminal(self, terminal_id: str, timeout: float = 0.05) -> str:
        session = self._get_session(terminal_id)
        if session.closed:
            return ""
        return await asyncio.to_thread(self._read_terminal_sync, session, timeout)

    def _read_terminal_sync(self, session: PTYSession, timeout: float) -> str:
        try:
            ready, _, _ = select.select([session.master_fd], [], [], max(0.0, timeout))
        except Exception:
            return ""
        if not ready:
            return ""

        chunks: list[bytes] = []
        while True:
            try:
                chunk = os.read(session.master_fd, 65536)
                if not chunk:
                    break
                chunks.append(chunk)
                if len(chunk) < 65536:
                    break
            except BlockingIOError:
                break
            except OSError as exc:
                if exc.errno in (errno.EIO, errno.EBADF):
                    break
                raise

        if chunks:
            session.last_active_at = time.time()
            return b"".join(chunks).decode("utf-8", errors="replace")
        return ""

    def get_exit_code(self, terminal_id: str) -> int | None:
        session = self._sessions.get(terminal_id)
        if not session:
            return None
        if session.exit_code is None:
            session.exit_code = session.process.poll()
        return session.exit_code

    async def close_terminal(self, terminal_id: str, reason: str = "operator_close") -> bool:
        session = self._sessions.pop(terminal_id, None)
        if not session:
            return False
        await asyncio.to_thread(self._close_terminal_sync, session, reason)
        logger.info("PTY closed: %s (%s)", terminal_id, reason)
        return True

    def _close_terminal_sync(self, session: PTYSession, reason: str) -> None:
        if session.closed:
            return

        session.closed = True
        session.close_reason = reason

        try:
            if session.process.poll() is None:
                try:
                    os.killpg(os.getpgid(session.process.pid), signal.SIGTERM)
                except Exception:
                    session.process.terminate()
                try:
                    session.process.wait(timeout=1.5)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(os.getpgid(session.process.pid), signal.SIGKILL)
                    except Exception:
                        session.process.kill()
                    session.process.wait(timeout=1.0)
        except Exception:
            pass

        session.exit_code = session.process.poll()

        try:
            os.close(session.master_fd)
        except OSError:
            pass

    async def close_idle(self) -> list[str]:
        now = time.time()
        stale_ids: list[str] = []
        for terminal_id, session in list(self._sessions.items()):
            if now - session.last_active_at > self._idle_timeout_seconds:
                stale_ids.append(terminal_id)

        for terminal_id in stale_ids:
            await self.close_terminal(terminal_id, reason="idle_timeout")

        return stale_ids

    async def close_all(self) -> None:
        for terminal_id in list(self._sessions.keys()):
            await self.close_terminal(terminal_id, reason="shutdown")
