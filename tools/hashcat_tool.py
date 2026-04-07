"""V2 — hashcat_crack tool. GPU-accelerated offline password hash cracking."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import tempfile
from pathlib import Path

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT = 600  # hash cracking can be slow

# Common hash type IDs
HASH_TYPES = {
    "md5":         0,
    "sha1":        100,
    "sha256":      1400,
    "sha512":      1700,
    "ntlm":        1000,
    "net-ntlmv2":  5600,
    "net-ntlmv1":  5500,
    "sha512crypt": 1800,    # Linux /etc/shadow $6$
    "sha256crypt": 7400,    # Linux /etc/shadow $5$
    "md5crypt":    500,     # Linux /etc/shadow $1$
    "bcrypt":      3200,
    "mysql":       300,
    "mssql":       131,
    "oracle":      112,
    "wpa":         22000,
    "lm":          3000,
}

_WORDLIST_DEFAULT = "/usr/share/wordlists/rockyou.txt"


class HashcatTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="hashcat_crack",
            category="post-exploit",
            description=(
                "Offline password hash cracking with hashcat.\n"
                "Actions:\n"
                "  crack  — crack hashes from a file or list using dictionary attack\n"
                "  show   — display previously cracked hashes from pot file\n"
                "  detect — attempt to auto-detect hash type and report\n"
                "Parameters:\n"
                "  hashes      — list of hash strings OR path to a hash file\n"
                "  hash_type   — type name: md5, sha1, ntlm, sha512crypt, bcrypt, etc. "
                "(or numeric hashcat -m value). Default: auto-detect.\n"
                "  wordlist    — path to wordlist (default: /usr/share/wordlists/rockyou.txt)\n"
                "  rules       — hashcat rule file (e.g. best64.rule)\n"
                "  attack_mode — 0=dictionary (default), 3=brute-force mask\n"
                "  mask        — brute-force mask (e.g. ?l?l?l?l?d?d) for attack_mode=3\n"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "hashes":      {"oneOf": [
                        {"type": "array", "items": {"type": "string"}},
                        {"type": "string"},
                    ]},
                    "action":      {"type": "string", "description": "crack|show|detect", "default": "crack"},
                    "hash_type":   {"type": "string", "description": "Hash type name or numeric -m value"},
                    "wordlist":    {"type": "string"},
                    "rules":       {"type": "string"},
                    "attack_mode": {"type": "integer", "default": 0},
                    "mask":        {"type": "string"},
                    "timeout":     {"type": "integer", "default": _DEFAULT_TIMEOUT},
                },
                "required": ["hashes"],
            },
        )

    async def execute(self, params: dict) -> dict:
        if not shutil.which("hashcat"):
            return {
                "success": False,
                "error": "hashcat not found — install with: apt install hashcat",
            }

        action  = params.get("action", "crack").lower()
        hashes  = params.get("hashes", [])
        timeout = int(params.get("timeout", _DEFAULT_TIMEOUT))

        # Normalise hashes to list
        if isinstance(hashes, str):
            if Path(hashes).exists():
                hash_file_path = hashes
            else:
                hash_file_path = None
                hashes = [hashes]
        else:
            hash_file_path = None

        with tempfile.TemporaryDirectory() as tmpdir:
            # Write hashes to temp file if not already a file
            if hash_file_path:
                hash_file = hash_file_path
            else:
                hash_file = str(Path(tmpdir) / "hashes.txt")
                Path(hash_file).write_text("\n".join(hashes) + "\n")

            if action == "detect":
                return await self._detect_type(hash_file)

            if action == "show":
                return await self._show_cracked(hash_file, timeout)

            # Resolve hash type
            hash_type_raw = params.get("hash_type", "")
            hash_mode = self._resolve_hash_mode(hash_type_raw, hashes[0] if hashes else "")

            wordlist    = params.get("wordlist", _WORDLIST_DEFAULT)
            rules       = params.get("rules")
            attack_mode = int(params.get("attack_mode", 0))
            mask        = params.get("mask", "?a?a?a?a?a?a?a?a")
            outfile     = str(Path(tmpdir) / "cracked.txt")

            cmd = [
                "hashcat",
                "-m", str(hash_mode),
                "-a", str(attack_mode),
                "--outfile", outfile,
                "--outfile-format", "2",  # hash:plain
                "--potfile-disable",
                "--force",
                hash_file,
            ]

            if attack_mode == 0:
                cmd.append(wordlist)
                if rules:
                    cmd += ["-r", rules]
            elif attack_mode == 3:
                cmd.append(mask)

            logger.info("hashcat cmd: %s", " ".join(cmd))

            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd="/tmp",
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                # Try to read partial results
                cracked = self._read_outfile(outfile)
                return {
                    "success": True,
                    "output": {"cracked": cracked, "status": "timeout", "note": f"Timed out after {timeout}s"},
                }
            except Exception as e:
                return {"success": False, "error": str(e)}

            cracked = self._read_outfile(outfile)
            raw     = stdout.decode(errors="replace")

        return {
            "success": True,
            "output": {
                "hash_mode":    hash_mode,
                "hash_type":    hash_type_raw or "auto",
                "cracked":      cracked,
                "total_cracked": len(cracked),
                "status":       "exhausted" if not cracked else "found",
                "raw_output":   raw[:2048],
            },
        }

    def _resolve_hash_mode(self, hash_type_raw: str, sample_hash: str) -> int:
        if hash_type_raw:
            if hash_type_raw.isdigit():
                return int(hash_type_raw)
            key = hash_type_raw.lower().replace("-", "").replace("_", "")
            for k, v in HASH_TYPES.items():
                if k.replace("-", "").replace("_", "") == key:
                    return v
        # Auto-detect from hash length / format
        h = sample_hash.strip()
        if h.startswith("$6$"):
            return 1800
        if h.startswith("$5$"):
            return 7400
        if h.startswith("$1$"):
            return 500
        if h.startswith("$2"):
            return 3200
        length = len(h)
        if length == 32:
            return 0    # MD5
        if length == 40:
            return 100  # SHA1
        if length == 64:
            return 1400 # SHA256
        if length == 128:
            return 1700 # SHA512
        return 0  # default MD5

    def _read_outfile(self, outfile: str) -> list[dict]:
        cracked = []
        try:
            content = Path(outfile).read_text(errors="replace")
            for line in content.splitlines():
                if ":" in line:
                    parts = line.split(":", 1)
                    cracked.append({"hash": parts[0], "password": parts[1]})
        except FileNotFoundError:
            pass
        return cracked

    async def _detect_type(self, hash_file: str) -> dict:
        try:
            h = Path(hash_file).read_text().strip().splitlines()[0].strip()
        except Exception:
            return {"success": False, "error": "Cannot read hash file"}

        candidates = []
        if h.startswith("$6$"):
            candidates.append({"type": "sha512crypt", "mode": 1800, "confidence": "high"})
        elif h.startswith("$5$"):
            candidates.append({"type": "sha256crypt", "mode": 7400, "confidence": "high"})
        elif h.startswith("$1$"):
            candidates.append({"type": "md5crypt", "mode": 500, "confidence": "high"})
        elif h.startswith("$2"):
            candidates.append({"type": "bcrypt", "mode": 3200, "confidence": "high"})
        else:
            length = len(h)
            if length == 32:
                candidates = [
                    {"type": "MD5", "mode": 0, "confidence": "medium"},
                    {"type": "NTLM", "mode": 1000, "confidence": "medium"},
                ]
            elif length == 40:
                candidates = [{"type": "SHA1", "mode": 100, "confidence": "medium"}]
            elif length == 64:
                candidates = [{"type": "SHA256", "mode": 1400, "confidence": "medium"}]
            elif length == 128:
                candidates = [{"type": "SHA512", "mode": 1700, "confidence": "medium"}]

        return {"success": True, "output": {"sample": h, "candidates": candidates}}

    async def _show_cracked(self, hash_file: str, timeout: int) -> dict:
        cmd = ["hashcat", "--show", "--potfile-disable", hash_file]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        except Exception as e:
            return {"success": False, "error": str(e)}
        lines = stdout.decode(errors="replace").strip().splitlines()
        cracked = []
        for line in lines:
            if ":" in line:
                parts = line.split(":", 1)
                cracked.append({"hash": parts[0], "password": parts[1]})
        return {"success": True, "output": {"cracked": cracked, "total": len(cracked)}}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("hashcat"):
            return ToolHealthStatus(available=True, message="hashcat_crack ready")
        return ToolHealthStatus(
            available=False,
            message="hashcat not found",
            install_hint="apt install hashcat",
        )
