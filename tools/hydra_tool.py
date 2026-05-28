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
        # Wordlist resolution cascade (test6 regression: rockyou.txt not
        # installed → hydra failed silently with `File for passwords not found`).
        # Order: explicit param → app_settings.default_password_wordlist →
        # first existing common path → embedded micro-list.
        passlist  = params.get("passlist") or self._resolve_passlist()
        tasks     = int(params.get("tasks", 4))
        delay     = int(params.get("delay", 0))
        stop_first = bool(params.get("stop_on_first", True))
        timeout   = int(params.get("timeout", _DEFAULT_TIMEOUT))

        if not username and not userlist:
            # Default to a small username wordlist so the LLM doesn't have to specify one explicitly.
            import os
            for default_list in (
                "/usr/share/metasploit-framework/data/wordlists/unix_users.txt",
                "/usr/share/seclists/Usernames/top-usernames-shortlist.txt",
                "/usr/share/wordlists/usernames.txt",
            ):
                if os.path.exists(default_list):
                    userlist = default_list
                    logger.info("hydra: no username/userlist provided — defaulting to %s", default_list)
                    break
            if not userlist:
                return {"success": False, "error": (
                    "Either 'username' or 'userlist' must be provided. "
                    "Try username='root' (single) or userlist='/path/to/list.txt'."
                )}

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

    def _resolve_passlist(self) -> str:
        """Pick a password wordlist that actually exists on disk.

        Resolution order:
          1. app_settings.default_password_wordlist (if file exists)
          2. First existing common path on the system
          3. An embedded micro-list of the top 50 ~ universally tested
             passwords, written to /tmp once and reused. This way hydra
             ALWAYS has something to throw — no more silent
             `File for passwords not found` failures.
        """
        import os
        # 1. Settings override
        try:
            from database.db import get_setting
            import asyncio as _aio
            try:
                # We're in a sync helper but called from async execute(),
                # so loop is running — schedule and short-block.
                loop = _aio.get_event_loop()
                if loop.is_running():
                    # Use the cached value if we've fetched before; otherwise
                    # fall through to detect on disk. Avoid blocking I/O here.
                    cached = getattr(self, "_cached_passlist_setting", None)
                    if cached and os.path.exists(cached):
                        return cached
                    # Schedule the fetch for next call; meanwhile use fallback.
                    _aio.ensure_future(self._refresh_passlist_setting())
            except Exception:
                pass
        except Exception:
            pass

        # 2. Common system paths
        candidates = [
            "/usr/share/wordlists/rockyou.txt",
            "/usr/share/wordlists/rockyou.txt.gz",  # tested below — auto-decompressed
            "/usr/share/seclists/Passwords/Common-Credentials/10-million-password-list-top-1000.txt",
            "/usr/share/seclists/Passwords/probable-v2-top1575.txt",
            "/usr/share/wordlists/fasttrack.txt",
            "/usr/share/wordlists/dirb/common.txt",  # last-ditch — not great
            "/usr/share/metasploit-framework/data/wordlists/unix_passwords.txt",
            "/usr/share/metasploit-framework/data/wordlists/common_passwords.txt",
        ]
        for c in candidates:
            if c.endswith(".gz") and os.path.exists(c) and not os.path.exists(c[:-3]):
                # rockyou.txt.gz ships compressed on Kali; decompress once.
                try:
                    import gzip, shutil as _sh
                    with gzip.open(c, "rb") as fin, open(c[:-3], "wb") as fout:
                        _sh.copyfileobj(fin, fout)
                    logger.info("hydra: decompressed %s → %s", c, c[:-3])
                    return c[:-3]
                except Exception as exc:
                    logger.warning("hydra: rockyou decompress failed: %s", exc)
                    continue
            if os.path.exists(c):
                return c

        # 3. Embedded micro-list
        emb_path = "/tmp/tirpan_top_passwords.txt"
        if not os.path.exists(emb_path):
            try:
                with open(emb_path, "w") as f:
                    f.write("\n".join([
                        "", "password", "123456", "12345678", "qwerty", "abc123",
                        "monkey", "letmein", "dragon", "111111", "baseball",
                        "iloveyou", "trustno1", "1234567", "sunshine", "master",
                        "123123", "welcome", "shadow", "ashley", "football",
                        "jesus", "michael", "ninja", "mustang", "password1",
                        "admin", "admin123", "root", "toor", "user", "test",
                        "guest", "default", "1234", "12345", "1qaz2wsx",
                        "qwerty123", "Password1", "P@ssw0rd", "Welcome1",
                        "msfadmin", "raspberry", "pi", "ubuntu", "kali",
                        "metasploitable", "vagrant", "tomcat", "manager",
                        "changeme",
                    ]) + "\n")
                logger.warning(
                    "hydra: no wordlist found on system — using embedded "
                    "50-password fallback at %s. Set "
                    "app_settings.default_password_wordlist for better coverage.",
                    emb_path,
                )
            except Exception as exc:
                logger.error("hydra: cannot write embedded wordlist: %s", exc)
        return emb_path

    async def _refresh_passlist_setting(self) -> None:
        """Background fetch of the operator-configured wordlist path."""
        try:
            from database.db import get_setting
            val = await get_setting("default_password_wordlist", "")
            if val and isinstance(val, str):
                self._cached_passlist_setting = val
        except Exception:
            pass

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
