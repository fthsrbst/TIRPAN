"""
Phase 5 — Metasploit RPC Tool

Primary: connects to msfrpcd via pymetasploit3.
Fallback: runs msfconsole subprocess when RPC is unavailable.
"""

import asyncio
import logging
import os
import re
import tempfile
import time

from config import settings
from models.exploit_result import ExploitResult
from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)

EXPLOIT_TIMEOUT = 90   # seconds for RPC
MSF_CONSOLE_TIMEOUT = 120  # seconds for msfconsole subprocess (slower to start)

# Patterns that indicate a session was opened in msfconsole output
_SESSION_PATTERNS = [
    re.compile(r"session\s+\d+\s+opened", re.IGNORECASE),
    re.compile(r"command shell session\s+\d+", re.IGNORECASE),
    re.compile(r"meterpreter session\s+\d+", re.IGNORECASE),
    re.compile(r"opened\s+.*->", re.IGNORECASE),
]


def _session_opened(text: str) -> bool:
    return any(p.search(text) for p in _SESSION_PATTERNS)


class MetasploitTool(BaseTool):

    def __init__(self):
        self._client = None   # pymetasploit3 MsfRpcClient — lazy connection

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="metasploit_run",
            description=(
                "Runs an exploit via Metasploit Framework. "
                "If successful, opens a session and returns the session ID."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "module": {
                        "type": "string",
                        "description": "Metasploit module path (e.g. 'exploit/unix/ftp/vsftpd_234_backdoor')",
                    },
                    "target_ip": {
                        "type": "string",
                        "description": "Target IP address",
                    },
                    "target_port": {
                        "type": "integer",
                        "description": "Target port",
                    },
                    "payload": {
                        "type": "string",
                        "description": "Payload to use (e.g. 'cmd/unix/interact')",
                        "default": "",
                    },
                    "options": {
                        "type": "object",
                        "description": "Extra module options (key-value)",
                        "default": {},
                    },
                    "action": {
                        "type": "string",
                        "description": "'run' | 'search' | 'sessions'",
                        "default": "run",
                    },
                    "query": {
                        "type": "string",
                        "description": "Query for module search (used with action='search')",
                        "default": "",
                    },
                },
                "required": ["action"],
            },
            category="exploit-exec",
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def validate(self, params: dict) -> tuple[bool, str]:
        action = params.get("action", "run")
        if action not in ("run", "search", "sessions"):
            return False, f"Invalid action: '{action}'. Options: run, search, sessions"
        if action == "run":
            for field in ("module", "target_ip", "target_port"):
                if not params.get(field):
                    return False, f"'{field}' is required for action='run'"
        return True, ""

    async def execute(self, params: dict) -> dict:
        ok, msg = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": msg}

        action = params.get("action", "run")

        # ── Try RPC first ─────────────────────────────────────────────
        try:
            client = await self._get_client()
            if action == "search":
                return await self._search_modules(client, params.get("query", ""))
            if action == "sessions":
                return await self._list_sessions(client)
            try:
                return await self._run_exploit(client, params)
            except TimeoutError:
                return {"success": False, "output": None, "error": f"Exploit timed out ({EXPLOIT_TIMEOUT}s)"}

        except Exception as exc:
            rpc_err = str(exc)
            logger.warning("Metasploit RPC unavailable (%s) — falling back to msfconsole", rpc_err)
            self._client = None  # reset so next call re-tries RPC

        # ── msfconsole fallback ───────────────────────────────────────
        if action == "run":
            return await self._run_via_msfconsole(params)
        if action == "search":
            return await self._search_via_msfconsole(params.get("query", ""))
        if action == "sessions":
            return await self._sessions_via_msfconsole()

        return {"success": False, "output": None, "error": "Unknown action"}

    # ------------------------------------------------------------------
    # RPC actions
    # ------------------------------------------------------------------

    async def _run_exploit(self, client, params: dict) -> dict:
        module_path: str = params["module"]
        target_ip: str = params["target_ip"]
        target_port: int = int(params["target_port"])
        payload: str = params.get("payload", "")
        extra_opts: dict = params.get("options", {})

        loop = asyncio.get_event_loop()
        start = time.monotonic()

        try:
            result: ExploitResult = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: self._blocking_run(
                        client, module_path, target_ip, target_port, payload, extra_opts
                    ),
                ),
                timeout=EXPLOIT_TIMEOUT,
            )
        except TimeoutError:
            return {
                "success": False,
                "output": None,
                "error": f"Exploit timed out ({EXPLOIT_TIMEOUT}s)",
            }
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}

        result.duration_seconds = time.monotonic() - start
        return {
            "success": result.success,
            "output": result.model_dump(),
            "error": result.error,
        }

    def _blocking_run(
        self,
        client,
        module_path: str,
        target_ip: str,
        target_port: int,
        payload: str,
        extra_opts: dict,
    ) -> ExploitResult:
        """Synchronous Metasploit exploit — runs in executor."""
        try:
            exploit = client.modules.use("exploit", module_path)
            exploit["RHOSTS"] = target_ip
            exploit["RPORT"] = target_port

            for key, val in extra_opts.items():
                exploit[key] = val

            if payload:
                p = client.modules.use("payload", payload)
            else:
                payloads = exploit.targetpayloads()
                if not payloads:
                    return ExploitResult(
                        success=False,
                        module=module_path,
                        target_ip=target_ip,
                        target_port=target_port,
                        error="No compatible payload found",
                    )
                p = client.modules.use("payload", payloads[0])
                payload = payloads[0]

            output = exploit.execute(payload=p)
            session_id = output.get("session_id")

            return ExploitResult(
                success=session_id is not None,
                module=module_path,
                target_ip=target_ip,
                target_port=target_port,
                payload=payload,
                session_id=session_id,
                output=str(output),
                error=None if session_id else "Session could not be opened",
            )
        except Exception as exc:
            return ExploitResult(
                success=False,
                module=module_path,
                target_ip=target_ip,
                target_port=target_port,
                error=str(exc),
            )

    async def _search_modules(self, client, query: str) -> dict:
        loop = asyncio.get_event_loop()
        try:
            modules = await loop.run_in_executor(
                None, lambda: client.modules.search(query)
            )
            return {
                "success": True,
                "output": {"query": query, "modules": modules[:50]},
                "error": None,
            }
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}

    async def _list_sessions(self, client) -> dict:
        loop = asyncio.get_event_loop()
        try:
            sessions = await loop.run_in_executor(
                None, lambda: dict(client.sessions.list)
            )
            return {
                "success": True,
                "output": {"sessions": sessions, "count": len(sessions)},
                "error": None,
            }
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}

    # ------------------------------------------------------------------
    # msfconsole subprocess fallback
    # ------------------------------------------------------------------

    async def _run_msfconsole(self, rc_commands: list[str], timeout: int = MSF_CONSOLE_TIMEOUT) -> str:
        """Write an .rc script and run msfconsole -q -r <file>. Returns stdout."""
        rc_content = "\n".join(rc_commands) + "\nexit -y\n"
        fd, rc_path = tempfile.mkstemp(suffix=".rc", prefix="aegis_msf_")
        try:
            with os.fdopen(fd, "w") as f:
                f.write(rc_content)

            proc = await asyncio.create_subprocess_exec(
                "msfconsole", "-q", "-r", rc_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                return stdout.decode("utf-8", errors="replace")
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return ""
        finally:
            try:
                os.unlink(rc_path)
            except OSError:
                pass

    async def _run_via_msfconsole(self, params: dict) -> dict:
        """Run exploit via msfconsole subprocess when RPC is unavailable."""
        module_path: str = params["module"]
        target_ip: str = params["target_ip"]
        target_port: int = int(params["target_port"])
        payload: str = params.get("payload", "")
        extra_opts: dict = params.get("options", {})

        commands = [
            f"use {module_path}",
            f"set RHOSTS {target_ip}",
            f"set RPORT {target_port}",
        ]
        if payload:
            commands.append(f"set PAYLOAD {payload}")
        for key, val in extra_opts.items():
            commands.append(f"set {key} {val}")
        commands.append("run -z")   # -z: do not interact with the session

        start = time.monotonic()
        logger.info("Running exploit via msfconsole: %s → %s:%s", module_path, target_ip, target_port)

        output = await self._run_msfconsole(commands)
        duration = time.monotonic() - start

        success = _session_opened(output)
        # Extract session id from output if present
        session_id = None
        m = re.search(r"session\s+(\d+)\s+opened", output, re.IGNORECASE)
        if m:
            session_id = int(m.group(1))

        result = ExploitResult(
            success=success,
            module=module_path,
            target_ip=target_ip,
            target_port=target_port,
            payload=payload,
            session_id=session_id,
            output=output[:3000],
            error=None if success else "No session opened",
            duration_seconds=duration,
        )
        return {
            "success": result.success,
            "output": result.model_dump(),
            "error": result.error,
        }

    async def _search_via_msfconsole(self, query: str) -> dict:
        """Search Metasploit modules via msfconsole subprocess."""
        if not query.strip():
            return {"success": False, "output": None, "error": "Query cannot be empty"}

        commands = [f"search {query}"]
        output = await self._run_msfconsole(commands, timeout=60)

        # Parse lines like:
        #   0  exploit/unix/ftp/vsftpd_234_backdoor  2011-07-03  excellent  ...
        modules = []
        for line in output.splitlines():
            line = line.strip()
            if re.match(r"^\d+\s+\S+/\S+", line):
                parts = line.split()
                if len(parts) >= 2:
                    modules.append(parts[1])

        return {
            "success": True,
            "output": {"query": query, "modules": modules[:50], "raw": output[:2000]},
            "error": None,
        }

    async def _sessions_via_msfconsole(self) -> dict:
        """List active sessions via msfconsole subprocess."""
        commands = ["sessions -l"]
        output = await self._run_msfconsole(commands, timeout=60)
        return {
            "success": True,
            "output": {"raw": output[:2000], "sessions": {}, "count": 0},
            "error": None,
        }

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    async def _get_client(self):
        """Lazy connection — connect on first call, then use cached client."""
        if self._client is not None:
            return self._client

        loop = asyncio.get_event_loop()
        self._client = await loop.run_in_executor(None, self._connect)
        return self._client

    def _connect(self):
        from pymetasploit3.msfrpc import MsfRpcClient  # noqa: PLC0415
        cfg = settings.msf
        try:
            return MsfRpcClient(
                cfg.password,
                server=cfg.host,
                port=cfg.port,
                ssl=cfg.ssl,
            )
        except Exception as exc:
            logger.error(
                "MsfRpcClient connection failed (host=%s port=%s ssl=%s): %s",
                cfg.host, cfg.port, cfg.ssl, exc, exc_info=True,
            )
            raise

    async def is_available(self) -> bool:
        """Is msfrpcd reachable?"""
        try:
            await self._get_client()
            return True
        except Exception:
            self._client = None
            return False

    def disconnect(self) -> None:
        self._client = None
