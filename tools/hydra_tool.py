"""V2 — hydra_bruteforce tool. Network login brute-force via Hydra."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 300


class HydraTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="hydra_bruteforce",
            category="exploit-brute",
            description=(
                "Network login brute-force tool. Supports SSH, FTP, HTTP-form, HTTP-basic, "
                "SMB, RDP, Telnet, VNC, MySQL, PostgreSQL, IMAP, SMTP, and more.\n"
                "Parameters:\n"
                "  target        — IP or hostname\n"
                "  port          — target port (optional, uses service default)\n"
                "  service       — service type: ssh, ftp, telnet, smb, rdp, vnc, mysql, "
                "postgres, imap, smtp, http-get, http-head, http-post-form\n"
                "  username      — single username (mutually exclusive with userlist)\n"
                "  userlist      — path to username file\n"
                "  password      — single password (mutually exclusive with passlist)\n"
                "  passlist      — path to password file (default: /usr/share/wordlists/rockyou.txt)\n"
                "  form_path     — for http-post-form: path (e.g. /login.php)\n"
                "  form_body     — for http-post-form: POST body with ^USER^ and ^PASS^ placeholders\n"
                "  form_fail     — for http-post-form: string present in FAILED response\n"
                "  tasks         — parallel tasks (default: 4, reduce to 1 to avoid lockouts)\n"
                "  delay         — wait between attempts in seconds (default: 0)\n"
                "  stop_on_first — stop after first valid credential (default: true)"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "target":        {"type": "string", "description": "Target host"},
                    "port":          {"type": "integer", "description": "Target port (optional)"},
                    "service":       {"type": "string", "description": "Service type (ssh/ftp/http-post-form/etc.)"},
                    "username":      {"type": "string"},
                    "userlist":      {"type": "string"},
                    "password":      {"type": "string"},
                    "passlist":      {"type": "string"},
                    "form_path":     {"type": "string", "description": "URL path for http-post-form"},
                    "form_body":     {"type": "string", "description": "POST body with ^USER^ ^PASS^"},
                    "form_fail":     {"type": "string", "description": "Failure indicator string"},
                    "tasks":         {"type": "integer", "default": 4},
                    "delay":         {"type": "integer", "default": 0},
                    "stop_on_first": {"type": "boolean", "default": True},
                    "timeout":       {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
                "required": ["target", "service"],
            },
        )

    async def execute(self, params: dict) -> dict:
        if not shutil.which("hydra"):
            return {"success": False, "error": "hydra not found — install with: apt install hydra"}

        target    = params["target"]
        service   = params["service"].lower()
        port      = params.get("port")
        username  = params.get("username")
        userlist  = params.get("userlist")
        password  = params.get("password")
        passlist  = params.get("passlist", "/usr/share/wordlists/rockyou.txt")
        tasks     = int(params.get("tasks", 4))
        delay     = int(params.get("delay", 0))
        stop_first = bool(params.get("stop_on_first", True))
        timeout   = int(params.get("timeout", _DEFAULT_TIMEOUT))

        if not username and not userlist:
            return {"success": False, "error": "Either 'username' or 'userlist' must be provided"}

        cmd = ["hydra", "-t", str(tasks), "-V"]

        if username:
            cmd += ["-l", username]
        else:
            cmd += ["-L", userlist]

        if password:
            cmd += ["-p", password]
        else:
            cmd += ["-P", passlist]

        if delay:
            cmd += ["-w", str(delay)]

        if stop_first:
            cmd += ["-f"]

        if port:
            cmd += ["-s", str(port)]

        # Build service target string
        if service == "http-post-form":
            form_path = params.get("form_path", "/login")
            form_body = params.get("form_body", "user=^USER^&pass=^PASS^")
            form_fail = params.get("form_fail", "Invalid")
            service_str = f"http-post-form://{target}/{form_path.lstrip('/')}:{form_body}:{form_fail}"
            cmd.append(service_str)
        elif service == "http-get":
            form_path = params.get("form_path", "/")
            cmd.append(f"http-get://{target}{form_path}")
        else:
            cmd += [target, service]

        logger.info("hydra cmd: %s", " ".join(cmd))

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd="/tmp",
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": f"hydra timeout after {timeout}s"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        err    = stderr.decode(errors="replace")
        credentials = self._parse_credentials(output)

        return {
            "success": True,
            "output": {
                "target": target,
                "service": service,
                "credentials_found": credentials,
                "total_found": len(credentials),
                "raw_output": output[:4096],
                "stderr": err[:512] if err else "",
            },
        }

    def _parse_credentials(self, output: str) -> list[dict]:
        """Extract login:password pairs from hydra output."""
        found = []
        # Hydra outputs lines like: [21][ftp] host: 10.0.0.1   login: admin   password: 1234
        pattern = re.compile(
            r"\[\d+\]\[(\w[\w-]*)\]\s+host:\s+(\S+)\s+login:\s+(\S+)\s+password:\s+(.*)",
            re.IGNORECASE,
        )
        for line in output.splitlines():
            m = pattern.search(line)
            if m:
                found.append({
                    "service":  m.group(1),
                    "host":     m.group(2),
                    "username": m.group(3),
                    "password": m.group(4).strip(),
                })
        return found

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("hydra"):
            return ToolHealthStatus(available=True, message="hydra_bruteforce ready")
        return ToolHealthStatus(
            available=False,
            message="hydra not found",
            install_hint="apt install hydra",
        )
