"""V2 — wpscan_scan tool. WordPress vulnerability and enumeration scanner."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 300


class WPScanTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="wpscan_scan",
            category="recon",
            description=(
                "WordPress vulnerability scanner. Detects outdated core/plugins/themes, "
                "CVEs, user enumeration, and weak credentials.\n"
                "Actions:\n"
                "  scan       — enumerate plugins, themes, users, and known CVEs\n"
                "  bruteforce — brute-force WordPress login with a password list\n"
                "Parameters:\n"
                "  url           — WordPress site URL\n"
                "  enumerate     — what to enumerate: vp (vulnerable plugins), vt (vulnerable themes), "
                "u (users), ap (all plugins), at (all themes). Default: vp,vt,u\n"
                "  api_token     — WPVulnDB API token for CVE data (optional)\n"
                "  usernames     — comma-separated usernames for bruteforce\n"
                "  passwords_file — path to password list (default: /usr/share/wordlists/rockyou.txt)\n"
                "  throttle      — milliseconds between requests (default: 0 = fast)\n"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":            {"type": "string", "description": "WordPress URL"},
                    "action":         {"type": "string", "description": "scan|bruteforce", "default": "scan"},
                    "enumerate":      {"type": "string", "default": "vp,vt,u"},
                    "api_token":      {"type": "string"},
                    "usernames":      {"type": "string"},
                    "passwords_file": {"type": "string"},
                    "throttle":       {"type": "integer", "default": 0},
                    "timeout":        {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        if not shutil.which("wpscan"):
            return {
                "success": False,
                "error": "wpscan not found — install with: gem install wpscan",
            }

        url       = params["url"]
        action    = params.get("action", "scan").lower()
        enumerate = params.get("enumerate", "vp,vt,u")
        api_token = params.get("api_token")
        throttle  = int(params.get("throttle", 0))
        timeout   = int(params.get("timeout", _DEFAULT_TIMEOUT))

        cmd = ["wpscan", "--url", url, "--format", "json", "--no-banner", "--disable-tls-checks"]

        if api_token:
            cmd += ["--api-token", api_token]

        if action == "scan":
            cmd += ["--enumerate", enumerate]
            if throttle:
                cmd += ["--throttle", str(throttle)]
        elif action == "bruteforce":
            usernames = params.get("usernames", "admin")
            passwords_file = params.get("passwords_file", "/usr/share/wordlists/rockyou.txt")
            cmd += ["--usernames", usernames, "--passwords", passwords_file]

        logger.info("wpscan cmd: %s", " ".join(cmd))

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd="/tmp",
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": f"wpscan timeout after {timeout}s"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        raw = stdout.decode(errors="replace")
        parsed = self._parse_output(raw)

        return {
            "success": True,
            "output": {
                "url": url,
                "action": action,
                **parsed,
                "raw_output": raw[:6000],
            },
        }

    def _parse_output(self, raw: str) -> dict:
        result: dict = {
            "wordpress_version": None,
            "vulnerabilities": [],
            "plugins": [],
            "themes": [],
            "users": [],
            "credentials_found": [],
        }

        # Try JSON parse first (wpscan --format json)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: text parse
            return self._parse_text(raw, result)

        version_info = data.get("version", {})
        if version_info:
            result["wordpress_version"] = version_info.get("number")
            for vuln in version_info.get("vulnerabilities", []):
                result["vulnerabilities"].append({
                    "title": vuln.get("title"),
                    "cve":   ", ".join(vuln.get("references", {}).get("cve", [])),
                    "type":  "core",
                })

        for slug, plugin_data in (data.get("plugins") or {}).items():
            entry = {"slug": slug, "version": plugin_data.get("version", {}).get("number"), "vulns": []}
            for vuln in plugin_data.get("vulnerabilities", []):
                entry["vulns"].append(vuln.get("title"))
            result["plugins"].append(entry)

        for slug, theme_data in (data.get("themes") or {}).items():
            entry = {"slug": slug, "version": theme_data.get("version", {}).get("number"), "vulns": []}
            for vuln in theme_data.get("vulnerabilities", []):
                entry["vulns"].append(vuln.get("title"))
            result["themes"].append(entry)

        for username, user_data in (data.get("users") or {}).items():
            result["users"].append({"username": username, "id": user_data.get("id")})

        # Brute-force results
        for username, user_data in (data.get("users") or {}).items():
            password = user_data.get("password")
            if password:
                result["credentials_found"].append({"username": username, "password": password})

        return result

    def _parse_text(self, raw: str, result: dict) -> dict:
        # Fallback text parsing for non-JSON output
        for line in raw.splitlines():
            if "WordPress version" in line:
                m = re.search(r"WordPress version ([\d.]+)", line)
                if m:
                    result["wordpress_version"] = m.group(1)
            if "Username:" in line:
                m = re.search(r"Username: (\S+)", line)
                if m:
                    result["users"].append({"username": m.group(1)})
            if "| Password:" in line:
                m = re.search(r"\| Password: (\S+)", line)
                if m and result["users"]:
                    result["credentials_found"].append({
                        "username": result["users"][-1].get("username", "?"),
                        "password": m.group(1),
                    })
        return result

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("wpscan"):
            return ToolHealthStatus(available=True, message="wpscan_scan ready")
        return ToolHealthStatus(
            available=False,
            message="wpscan not found",
            install_hint="gem install wpscan",
        )
