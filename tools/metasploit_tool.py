"""
Phase 5 — Metasploit RPC Tool

Connects to msfrpcd via pymetasploit3.
Runs exploits and manages sessions.
"""

import asyncio
import logging
import time
from typing import Optional

from config import settings
from models.exploit_result import ExploitResult
from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)

EXPLOIT_TIMEOUT = 60  # seconds


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

        try:
            client = await self._get_client()
        except Exception as exc:
            logger.error("Failed to connect to Metasploit: %s", exc, exc_info=True)
            return {
                "success": False,
                "output": None,
                "error": f"Failed to connect to Metasploit: {exc}",
            }

        if action == "search":
            return await self._search_modules(client, params.get("query", ""))
        if action == "sessions":
            return await self._list_sessions(client)
        try:
            return await self._run_exploit(client, params)
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": f"Exploit timed out ({EXPLOIT_TIMEOUT}s)"}

    # ------------------------------------------------------------------
    # Actions
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
        except asyncio.TimeoutError:
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

            # Select payload
            if payload:
                p = client.modules.use("payload", payload)
            else:
                # Use the first compatible payload from the module
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
            job_id = output.get("job_id")
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
                "output": {"query": query, "modules": modules[:50]},  # max 50
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
