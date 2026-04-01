"""V2 — ffuf_scan tool. Fast web directory/file brute-forcer."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import time
from urllib.parse import urlparse

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
FFUF_TIMEOUT = 180
DEFAULT_WORDLIST = "/usr/share/wordlists/dirb/common.txt"
_EMPTY_RESULT_THRESHOLD = 4
_TARGET_COOLDOWN_SECONDS = 180
_COMBO_TTL_SECONDS = 300


class FfufTool(BaseTool):
    def __init__(self):
        self._state_lock = asyncio.Lock()
        self._empty_streaks: dict[str, int] = {}
        self._target_cooldowns: dict[str, float] = {}
        self._combo_last_attempt: dict[str, float] = {}

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="ffuf_scan",
            category="recon",
            description=(
                "Fast web fuzzer for directory and file discovery. "
                "Requires a wordlist on the target system."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":        {"type": "string", "description": "Base URL (FUZZ appended)"},
                    "wordlist":   {"type": "string", "default": DEFAULT_WORDLIST},
                    "extensions": {"type": "string", "default": ".php,.txt,.html,.bak",
                                   "description": "File extensions to test"},
                    "timeout":    {"type": "integer", "default": 180},
                    "filter_codes": {"type": "string", "default": "404,403",
                                     "description": "HTTP status codes to filter out"},
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        url = params.get("url", "").rstrip("/")
        wordlist = params.get("wordlist", DEFAULT_WORDLIST)
        extensions = params.get("extensions", ".php,.txt,.html,.bak")
        timeout = int(params.get("timeout", FFUF_TIMEOUT))
        filter_codes = params.get("filter_codes", "404,403")
        session_id = params.get("_session_id", "")
        parsed = urlparse(url)
        host = (parsed.hostname or "unknown").lower()
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        scope_key = f"{session_id or 'global'}|{host}:{port}"
        combo_key = f"{scope_key}|{url}|{wordlist}|{extensions}|{filter_codes}"
        now = time.monotonic()

        if not shutil.which("ffuf"):
            return {"success": False, "error": "ffuf not found — install with: apt install ffuf"}

        async with self._state_lock:
            cooldown_until = self._target_cooldowns.get(scope_key, 0.0)
            if cooldown_until > now:
                retry_after = max(1, int(cooldown_until - now))
                logger.info(
                    "ffuf circuit-breaker active for %s (retry_after=%ss)",
                    scope_key,
                    retry_after,
                )
                return {
                    "success": True,
                    "output": {
                        "results": [],
                        "total": 0,
                        "base_url": url,
                        "skipped": True,
                        "skip_reason": "circuit_breaker_active",
                        "retry_after_seconds": retry_after,
                    },
                    "error": None,
                }

            last_combo_ts = self._combo_last_attempt.get(combo_key, 0.0)
            if now - last_combo_ts < _COMBO_TTL_SECONDS:
                retry_after = max(1, int(_COMBO_TTL_SECONDS - (now - last_combo_ts)))
                logger.info(
                    "ffuf duplicate combo skipped for %s (retry_after=%ss)",
                    scope_key,
                    retry_after,
                )
                return {
                    "success": True,
                    "output": {
                        "results": [],
                        "total": 0,
                        "base_url": url,
                        "skipped": True,
                        "skip_reason": "duplicate_combo_cooldown",
                        "retry_after_seconds": retry_after,
                    },
                    "error": None,
                }

            self._combo_last_attempt[combo_key] = now
            if len(self._combo_last_attempt) > 2000:
                cutoff = now - _COMBO_TTL_SECONDS
                self._combo_last_attempt = {
                    k: ts for k, ts in self._combo_last_attempt.items() if ts >= cutoff
                }

        fuzz_url = f"{url}/FUZZ"
        cmd = [
            "ffuf", "-u", fuzz_url, "-w", wordlist,
            "-e", extensions, "-fc", filter_codes,
            "-json", "-s",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"success": False, "error": "ffuf timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        try:
            data = json.loads(stdout.decode(errors="replace"))
            results = [
                {"url": r.get("url", ""), "status": r.get("status", 0),
                 "length": r.get("length", 0), "words": r.get("words", 0)}
                for r in data.get("results", [])
            ]
        except Exception:
            results = []

        total_results = len(results)
        circuit_meta: dict[str, object] = {"activated": False}
        async with self._state_lock:
            if total_results == 0:
                streak = self._empty_streaks.get(scope_key, 0) + 1
                self._empty_streaks[scope_key] = streak
                if streak >= _EMPTY_RESULT_THRESHOLD:
                    cooldown_until = time.monotonic() + _TARGET_COOLDOWN_SECONDS
                    self._target_cooldowns[scope_key] = cooldown_until
                    circuit_meta = {
                        "activated": True,
                        "empty_streak": streak,
                        "cooldown_seconds": _TARGET_COOLDOWN_SECONDS,
                    }
                    logger.info(
                        "ffuf circuit-breaker activated for %s (empty_streak=%d cooldown=%ds)",
                        scope_key,
                        streak,
                        _TARGET_COOLDOWN_SECONDS,
                    )
                else:
                    self._target_cooldowns.pop(scope_key, None)
                    circuit_meta = {
                        "activated": False,
                        "empty_streak": streak,
                    }
            else:
                self._empty_streaks[scope_key] = 0
                self._target_cooldowns.pop(scope_key, None)
                circuit_meta = {
                    "activated": False,
                    "empty_streak": 0,
                }

        # Save raw JSON artifact
        if session_id:
            try:
                from core.artifact_store import get_store
                import re as _re
                raw_text = stdout.decode(errors="replace")
                safe_url = _re.sub(r"[^\w\-.]", "_", url)[:60]
                get_store().save(session_id, "ffuf", f"ffuf_{safe_url}.json", raw_text)
            except Exception as _ae:
                logger.debug("ffuf artifact save failed: %s", _ae)

        return {
            "success": True,
            "output": {
                "results": results,
                "total": total_results,
                "base_url": url,
                "circuit_breaker": circuit_meta,
            },
            "error": None,
        }

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("ffuf"):
            return ToolHealthStatus(available=True, message="ffuf_scan")
        return ToolHealthStatus(available=False, message="ffuf not found")
