"""V2 — gobuster_scan tool. Directory, DNS subdomain, and virtual host brute-forcing."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 300

_WORDLIST_DIR  = "/usr/share/wordlists/dirb/common.txt"
_WORDLIST_DNS  = "/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt"
_WORDLIST_VHOST = "/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt"


class GobusterTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="gobuster_scan",
            category="recon",
            description=(
                "Directory, DNS subdomain, and virtual host brute-force tool.\n"
                "Modes:\n"
                "  dir   — web directory/file brute force (alternative to ffuf)\n"
                "  dns   — DNS subdomain enumeration\n"
                "  vhost — virtual host discovery (finds hidden vhosts on shared IPs)\n"
                "Parameters:\n"
                "  url        — target URL (for dir/vhost mode): http://target\n"
                "  domain     — target domain (for dns mode): example.com\n"
                "  mode       — dir | dns | vhost (default: dir)\n"
                "  wordlist   — path to wordlist (default: system wordlist per mode)\n"
                "  extensions — file extensions for dir mode (e.g. php,html,txt,bak)\n"
                "  threads    — number of threads (default: 10)\n"
                "  status_codes — show only these HTTP status codes (default: 200,204,301,302,307,401,403)\n"
                "  follow_redirect — follow redirects (default: false)\n"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":             {"type": "string"},
                    "domain":          {"type": "string"},
                    "mode":            {"type": "string", "default": "dir"},
                    "wordlist":        {"type": "string"},
                    "extensions":      {"type": "string"},
                    "threads":         {"type": "integer", "default": 10},
                    "status_codes":    {"type": "string", "default": "200,204,301,302,307,401,403"},
                    "follow_redirect": {"type": "boolean", "default": False},
                    "timeout":         {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
                "required": ["mode"],
            },
        )

    async def execute(self, params: dict) -> dict:
        if not shutil.which("gobuster"):
            return {
                "success": False,
                "error": "gobuster not found — install with: apt install gobuster",
            }

        mode    = params.get("mode", "dir").lower()
        threads = int(params.get("threads", 10))
        timeout = int(params.get("timeout", _DEFAULT_TIMEOUT))

        if mode == "dir":
            url = params.get("url")
            if not url:
                return {"success": False, "error": "mode=dir requires 'url'"}
            wordlist = params.get("wordlist", _WORDLIST_DIR)
            extensions = params.get("extensions", "")
            status_codes = params.get("status_codes", "200,204,301,302,307,401,403")
            follow_redirect = bool(params.get("follow_redirect", False))

            cmd = [
                "gobuster", "dir",
                "-u", url,
                "-w", wordlist,
                "-t", str(threads),
                "--no-error",
                "-s", status_codes,
            ]
            if extensions:
                cmd += ["-x", extensions]
            if follow_redirect:
                cmd.append("-r")

        elif mode == "dns":
            domain = params.get("domain")
            if not domain:
                return {"success": False, "error": "mode=dns requires 'domain'"}
            wordlist = params.get("wordlist", _WORDLIST_DNS)
            cmd = [
                "gobuster", "dns",
                "-d", domain,
                "-w", wordlist,
                "-t", str(threads),
                "--no-error",
            ]

        elif mode == "vhost":
            url = params.get("url")
            if not url:
                return {"success": False, "error": "mode=vhost requires 'url'"}
            wordlist = params.get("wordlist", _WORDLIST_VHOST)
            cmd = [
                "gobuster", "vhost",
                "-u", url,
                "-w", wordlist,
                "-t", str(threads),
                "--no-error",
            ]
        else:
            return {"success": False, "error": f"Unknown mode: {mode}. Use dir, dns, or vhost"}

        logger.info("gobuster cmd: %s", " ".join(cmd))

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd="/tmp",
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": f"gobuster timeout after {timeout}s"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        output = stdout.decode(errors="replace")
        err    = stderr.decode(errors="replace")
        parsed = self._parse_output(output, mode)

        return {
            "success": True,
            "output": {
                "mode": mode,
                "results": parsed,
                "total": len(parsed),
                "raw_output": output[:6000],
                "stderr": err[:512] if err else "",
            },
        }

    def _parse_output(self, output: str, mode: str) -> list[dict]:
        results = []
        for line in output.splitlines():
            line = line.strip()
            if not line or line.startswith("=") or line.startswith("["):
                continue
            if mode == "dir":
                # "/.git/config           (Status: 200) [Size: 92]"
                m = re.match(r"(/\S*)\s+\(Status:\s*(\d+)\)(?:\s+\[Size:\s*(\d+)\])?", line)
                if m:
                    results.append({
                        "path":   m.group(1),
                        "status": int(m.group(2)),
                        "size":   int(m.group(3)) if m.group(3) else None,
                    })
            elif mode == "dns":
                m = re.match(r"Found:\s+(\S+)", line)
                if m:
                    results.append({"subdomain": m.group(1)})
            elif mode == "vhost":
                m = re.match(r"Found:\s+(\S+)\s+\(Status:\s*(\d+)\)", line)
                if m:
                    results.append({"vhost": m.group(1), "status": int(m.group(2))})
        return results

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("gobuster"):
            return ToolHealthStatus(available=True, message="gobuster_scan ready")
        return ToolHealthStatus(
            available=False,
            message="gobuster not found",
            install_hint="apt install gobuster",
        )
