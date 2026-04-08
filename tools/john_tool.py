"""V2 — john_crack tool. John the Ripper password hash cracker."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import tempfile
from pathlib import Path

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 600
_WORDLIST_DEFAULT = "/usr/share/wordlists/rockyou.txt"


class JohnTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="john_crack",
            category="post-exploit",
            description=(
                "Password hash cracker using John the Ripper. "
                "Supports Linux shadow (sha512crypt/md5crypt), NTLM, MD5, SHA1, "
                "ZIP/PDF/SSH private key passphrases, and many more.\n"
                "Actions:\n"
                "  crack   — crack hashes with a wordlist\n"
                "  show    — display already-cracked passwords from john.pot\n"
                "  formats — list all supported hash formats\n"
                "Parameters:\n"
                "  hash_file — path to file containing hashes (supports /etc/shadow format)\n"
                "  hashes    — list of hash strings (alternative to hash_file)\n"
                "  format    — hash format: auto (default), nt, md5, sha512crypt, "
                "zip, ssh, pdf, bcrypt\n"
                "  wordlist  — path to wordlist (default: /usr/share/wordlists/rockyou.txt)\n"
                "  rules     — enable mangling rules: jumbo (default), best64, all\n"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "hash_file": {"type": "string", "description": "Path to hash file"},
                    "hashes":    {"type": "array", "items": {"type": "string"}},
                    "action":    {"type": "string", "description": "crack|show|formats", "default": "crack"},
                    "format":    {"type": "string", "default": "auto"},
                    "wordlist":  {"type": "string"},
                    "rules":     {"type": "string", "default": ""},
                    "timeout":   {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
            },
        )

    async def execute(self, params: dict) -> dict:
        if not shutil.which("john"):
            return {
                "success": False,
                "error": "john not found — install with: apt install john",
            }

        action  = params.get("action", "crack").lower()
        timeout = int(params.get("timeout", _DEFAULT_TIMEOUT))

        if action == "formats":
            return await self._list_formats()

        # Resolve hash file
        hash_file_param = params.get("hash_file")
        hashes_list     = params.get("hashes", [])

        with tempfile.TemporaryDirectory() as tmpdir:
            if hash_file_param and Path(hash_file_param).exists():
                hash_file = hash_file_param
            elif hashes_list:
                hash_file = str(Path(tmpdir) / "hashes.txt")
                Path(hash_file).write_text("\n".join(hashes_list) + "\n")
            else:
                return {"success": False, "error": "Provide 'hash_file' or 'hashes'"}

            pot_file = str(Path(tmpdir) / "john.pot")

            if action == "show":
                return await self._show(hash_file, pot_file)

            fmt      = params.get("format", "auto")
            wordlist = params.get("wordlist", _WORDLIST_DEFAULT)
            rules    = params.get("rules", "")

            cmd = [
                "john",
                f"--pot={pot_file}",
                "--no-log",
            ]

            if fmt and fmt != "auto":
                cmd.append(f"--format={fmt}")

            if wordlist and Path(wordlist).exists():
                cmd += [f"--wordlist={wordlist}"]
                if rules:
                    cmd.append(f"--rules={rules}")
            else:
                # Fallback to incremental if wordlist not found
                cmd.append("--incremental=digits")

            cmd.append(hash_file)

            logger.info("john cmd: %s", " ".join(cmd))

            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd="/tmp",
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                # Still try to show results from pot file
                cracked = self._read_pot(pot_file)
                return {
                    "success": True,
                    "output": {"cracked": cracked, "status": "timeout"},
                }
            except Exception as e:
                return {"success": False, "error": str(e)}

            raw     = stdout.decode(errors="replace")
            cracked = self._read_pot(pot_file)

        return {
            "success": True,
            "output": {
                "cracked": cracked,
                "total_cracked": len(cracked),
                "status": "done",
                "raw_output": raw[:2048],
            },
        }

    def _read_pot(self, pot_file: str) -> list[dict]:
        cracked = []
        try:
            for line in Path(pot_file).read_text(errors="replace").splitlines():
                if ":" in line:
                    parts = line.split(":", 1)
                    cracked.append({"hash": parts[0], "password": parts[1]})
        except FileNotFoundError:
            pass
        return cracked

    async def _show(self, hash_file: str, pot_file: str) -> dict:
        cmd = ["john", "--show", f"--pot={pot_file}", hash_file]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        except Exception as e:
            return {"success": False, "error": str(e)}
        raw = stdout.decode(errors="replace")
        cracked = []
        for line in raw.splitlines():
            m = re.match(r"(\S+):(\S+)\s", line)
            if m:
                cracked.append({"username": m.group(1), "password": m.group(2)})
        return {"success": True, "output": {"cracked": cracked, "total": len(cracked)}}

    async def _list_formats(self) -> dict:
        cmd = ["john", "--list=formats"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        except Exception as e:
            return {"success": False, "error": str(e)}
        formats = stdout.decode(errors="replace").strip()
        return {"success": True, "output": {"formats": formats[:2000]}}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("john"):
            return ToolHealthStatus(available=True, message="john_crack ready")
        return ToolHealthStatus(
            available=False,
            message="john not found",
            install_hint="apt install john",
        )
