"""
TIRPAN — SMB Enumeration Tool
================================
Enumerates SMB/Samba targets using null sessions and anonymous access.
Reveals shares, users, groups, OS info, and policies without credentials.

Uses smbclient and rpcclient (part of samba-client package).
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_TIMEOUT = 30


class SmbEnumTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="smb_enum",
            category="recon",
            description=(
                "SMB/Samba enumeration via null sessions. Reveals shares, users, "
                "groups, OS version, and domain info without credentials. "
                "Actions:\n"
                "  shares  — list all SMB shares (null session)\n"
                "  users   — enumerate local users via RPC\n"
                "  info    — OS version, domain, workgroup info\n"
                "  full    — run all of the above"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "target_ip": {
                        "type": "string",
                        "description": "Target IP address",
                    },
                    "action": {
                        "type": "string",
                        "description": "'shares' | 'users' | 'info' | 'full'",
                        "default": "full",
                    },
                    "username": {
                        "type": "string",
                        "description": "Username (default: empty for null session)",
                        "default": "",
                    },
                    "password": {
                        "type": "string",
                        "description": "Password (default: empty for null session)",
                        "default": "",
                    },
                },
                "required": ["target_ip"],
            },
        )

    async def execute(self, params: dict) -> dict:
        target_ip = params.get("target_ip", "").strip()
        action    = params.get("action", "full")
        username  = params.get("username", "")
        password  = params.get("password", "")

        if not target_ip:
            return {"success": False, "output": None, "error": "target_ip is required"}

        results: dict = {}
        errors:  list = []

        actions_to_run = (
            ["shares", "users", "info"] if action == "full"
            else [action]
        )

        for act in actions_to_run:
            if act == "shares":
                r = await self._list_shares(target_ip, username, password)
            elif act == "users":
                r = await self._enum_users(target_ip, username, password)
            elif act == "info":
                r = await self._get_info(target_ip, username, password)
            else:
                r = {"error": f"Unknown action: {act}"}

            if "error" in r and r["error"]:
                errors.append(f"{act}: {r['error']}")
            else:
                results[act] = r

        overall_success = bool(results)
        return {
            "success": overall_success,
            "output": {
                "target": target_ip,
                "results": results,
                "errors":  errors,
                "note": self._build_note(results),
            },
            "error": "; ".join(errors) if errors and not overall_success else None,
        }

    # ── smbclient — list shares ───────────────────────────────────────────────

    async def _list_shares(self, ip: str, user: str, pw: str) -> dict:
        cmd = ["smbclient", "-N", "-L", f"//{ip}"]
        if user:
            cmd += ["-U", f"{user}%{pw}"]

        out, err = await self._run(cmd)
        if not out and err and "NT_STATUS" in err.upper():
            return {"error": err.strip()}

        shares = []
        for line in out.splitlines():
            m = re.match(r"\s+(\S+)\s+(Disk|IPC|Printer)\s*(.*)", line)
            if m:
                shares.append({
                    "name":    m.group(1),
                    "type":    m.group(2),
                    "comment": m.group(3).strip(),
                })

        return {
            "shares":     shares,
            "raw_output": out[:2000],
            "null_session_works": bool(shares) or "Sharename" in out,
        }

    # ── rpcclient — enumerate users ───────────────────────────────────────────

    async def _enum_users(self, ip: str, user: str, pw: str) -> dict:
        creds = f"{user}%{pw}" if user else "%"
        cmd = ["rpcclient", "-U", creds, "-N", ip, "-c", "enumdomusers"]

        out, err = await self._run(cmd)
        if "NT_STATUS" in (out + err).upper() and not out.strip():
            return {"error": (err or out).strip()}

        users = []
        for m in re.finditer(r"user:\[([^\]]+)\]\s+rid:\[([^\]]+)\]", out):
            users.append({"username": m.group(1), "rid": m.group(2)})

        return {
            "users":       users,
            "user_count":  len(users),
            "raw_output":  out[:2000],
        }

    # ── rpcclient — server info ───────────────────────────────────────────────

    async def _get_info(self, ip: str, user: str, pw: str) -> dict:
        creds = f"{user}%{pw}" if user else "%"
        cmd = ["rpcclient", "-U", creds, "-N", ip, "-c", "srvinfo"]

        out, err = await self._run(cmd)

        info: dict[str, str] = {}
        for line in out.splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                info[k.strip().lower().replace(" ", "_")] = v.strip()

        # Also try to get domain SID
        sid_cmd = ["rpcclient", "-U", creds, "-N", ip, "-c", "lsaquery"]
        sid_out, _ = await self._run(sid_cmd)
        for line in sid_out.splitlines():
            m = re.search(r"Domain Sid:\s+(\S+)", line)
            if m:
                info["domain_sid"] = m.group(1)
            m = re.search(r"Domain Name:\s+(\S+)", line)
            if m:
                info["domain_name"] = m.group(1)

        return {
            "server_info": info,
            "raw_output":  out[:1000],
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _run(self, cmd: list) -> tuple[str, str]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=_TIMEOUT)
            return (
                stdout.decode(errors="replace"),
                stderr.decode(errors="replace"),
            )
        except asyncio.TimeoutError:
            return "", "timeout"
        except Exception as e:
            return "", str(e)

    def _build_note(self, results: dict) -> str:
        notes = []
        shares = results.get("shares", {})
        if shares.get("null_session_works"):
            notes.append("Null session SMB access confirmed.")
        if shares.get("shares"):
            writable = [s["name"] for s in shares["shares"]
                        if s["type"] == "Disk" and s["name"] not in ("IPC$", "ADMIN$")]
            if writable:
                notes.append(f"Accessible disk shares: {', '.join(writable)}")

        users = results.get("users", {})
        if users.get("users"):
            unames = [u["username"] for u in users["users"][:5]]
            notes.append(f"Enumerated {users['user_count']} users: {', '.join(unames)}")

        info = results.get("info", {}).get("server_info", {})
        if info.get("domain_name"):
            notes.append(f"Domain: {info['domain_name']}")

        return " | ".join(notes) if notes else "No significant SMB findings."

    async def health_check(self) -> ToolHealthStatus:
        has_smbclient = shutil.which("smbclient")
        has_rpcclient = shutil.which("rpcclient")
        if has_smbclient and has_rpcclient:
            return ToolHealthStatus(available=True, message="smbclient + rpcclient found")
        if has_smbclient:
            return ToolHealthStatus(
                available=True, degraded=True,
                message="smbclient found but rpcclient missing — user enum unavailable",
                install_hint="apt install samba-client",
            )
        return ToolHealthStatus(
            available=False,
            message="smbclient not found",
            install_hint="apt install samba-client",
        )
