"""
TIRPAN — Technique Playbook
============================
Persistent cross-session memory of what worked and what didn't.

Every time an exploit succeeds (shell opened, credential harvested, etc.),
the technique is saved to data/playbook.jsonl.

Next session, the Brain reads relevant entries and immediately knows
which techniques to try first — no need to rediscover what already works.

Storage: data/playbook.jsonl (one JSON object per line)

Usage:
    from core.playbook import Playbook
    pb = Playbook()

    # Save a success
    pb.record(
        service="ftp",
        version="vsftpd 2.3.4",
        technique="exploit/unix/ftp/vsftpd_234_backdoor",
        result="shell",
        cve="CVE-2011-2523",
        notes="Backdoor on port 6200, shell as root",
        session_id="abc-123",
        target_os="Linux",
    )

    # Find relevant techniques for current target
    entries = pb.find(service="ftp", version="vsftpd")
    prompt_section = pb.to_prompt_section(services=["ftp vsftpd 2.3.4", "smb samba 3.0"])
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).parent.parent / "data"
_PLAYBOOK_FILE = _DATA_DIR / "playbook.jsonl"

# Result outcome constants
RESULT_SHELL     = "shell"        # got interactive shell
RESULT_RCE       = "rce"          # arbitrary command execution (no shell)
RESULT_CRED      = "credential"   # harvested credentials
RESULT_INFO      = "info"         # useful information (user list, share list, etc.)
RESULT_FAIL      = "fail"         # tried, didn't work
RESULT_PARTIAL   = "partial"      # partial success (e.g. unauthenticated access, no shell)


class PlaybookEntry:
    __slots__ = (
        "timestamp", "service", "version", "technique",
        "result", "cve", "notes", "session_id", "target_os",
        "module", "payload", "options",
    )

    def __init__(
        self,
        service: str,
        version: str,
        technique: str,
        result: str,
        *,
        cve: str = "",
        notes: str = "",
        session_id: str = "",
        target_os: str = "",
        module: str = "",
        payload: str = "",
        options: dict | None = None,
        timestamp: str = "",
    ) -> None:
        self.service    = service.lower().strip()
        self.version    = version.strip()
        self.technique  = technique.strip()
        self.result     = result.lower().strip()
        self.cve        = cve.strip()
        self.notes      = notes.strip()
        self.session_id = session_id
        self.target_os  = target_os
        self.module     = module.strip()
        self.payload    = payload.strip()
        self.options    = options or {}
        self.timestamp  = timestamp or datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        return {
            "timestamp":  self.timestamp,
            "service":    self.service,
            "version":    self.version,
            "technique":  self.technique,
            "result":     self.result,
            "cve":        self.cve,
            "notes":      self.notes,
            "session_id": self.session_id,
            "target_os":  self.target_os,
            "module":     self.module,
            "payload":    self.payload,
            "options":    self.options,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "PlaybookEntry":
        return cls(
            service=d.get("service", ""),
            version=d.get("version", ""),
            technique=d.get("technique", ""),
            result=d.get("result", ""),
            cve=d.get("cve", ""),
            notes=d.get("notes", ""),
            session_id=d.get("session_id", ""),
            target_os=d.get("target_os", ""),
            module=d.get("module", ""),
            payload=d.get("payload", ""),
            options=d.get("options", {}),
            timestamp=d.get("timestamp", ""),
        )

    @property
    def succeeded(self) -> bool:
        return self.result in (RESULT_SHELL, RESULT_RCE, RESULT_CRED, RESULT_INFO, RESULT_PARTIAL)

    def __repr__(self) -> str:
        return (
            f"PlaybookEntry({self.service} {self.version!r} "
            f"→ {self.technique!r} [{self.result}])"
        )


class Playbook:
    """
    Persistent cross-session technique memory.

    Thread-safe for reads; uses append-only writes (JSONL) so no locking needed.
    """

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or _PLAYBOOK_FILE
        self._entries: list[PlaybookEntry] | None = None  # lazy-loaded

    # ── Write ────────────────────────────────────────────────────────────────

    def record(
        self,
        service: str,
        version: str,
        technique: str,
        result: str,
        *,
        cve: str = "",
        notes: str = "",
        session_id: str = "",
        target_os: str = "",
        module: str = "",
        payload: str = "",
        options: dict | None = None,
    ) -> PlaybookEntry:
        """
        Save a technique outcome to the playbook.
        Both successes (result=shell/rce/cred) and failures (result=fail) are recorded.
        """
        entry = PlaybookEntry(
            service=service,
            version=version,
            technique=technique,
            result=result,
            cve=cve,
            notes=notes,
            session_id=session_id,
            target_os=target_os,
            module=module,
            payload=payload,
            options=options,
        )
        self._append(entry)
        # Invalidate in-memory cache
        if self._entries is not None:
            self._entries.append(entry)
        logger.info("Playbook recorded: %s", entry)
        return entry

    def _append(self, entry: PlaybookEntry) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry.to_dict(), ensure_ascii=False) + "\n")
        except Exception as exc:
            logger.error("Failed to write playbook entry: %s", exc)

    # ── Read ─────────────────────────────────────────────────────────────────

    def load(self, force: bool = False) -> list[PlaybookEntry]:
        """Load all entries from disk. Cached after first load."""
        if self._entries is not None and not force:
            return self._entries
        entries = []
        if self._path.exists():
            with self._path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entries.append(PlaybookEntry.from_dict(json.loads(line)))
                    except Exception:
                        pass
        self._entries = entries
        return entries

    def find(
        self,
        service: str = "",
        version: str = "",
        result: str | None = None,
        limit: int = 20,
    ) -> list[PlaybookEntry]:
        """
        Find relevant playbook entries by service and/or version substring match.

        Examples:
            pb.find(service="ftp")
            pb.find(service="smb", version="samba 3")
            pb.find(service="http", result="shell")
        """
        entries = self.load()
        svc_lower = service.lower()
        ver_lower = version.lower()

        results = []
        for e in entries:
            if svc_lower and svc_lower not in e.service and svc_lower not in e.version:
                continue
            if ver_lower and ver_lower not in e.version.lower():
                continue
            if result and e.result != result:
                continue
            results.append(e)

        # Sort: successes first, then by timestamp desc
        results.sort(key=lambda e: (0 if e.succeeded else 1, e.timestamp), reverse=False)
        results.sort(key=lambda e: e.succeeded, reverse=True)
        return results[-limit:]

    def find_for_services(self, service_strings: list[str]) -> list[PlaybookEntry]:
        """
        Given a list of 'service version' strings from scan results,
        return all relevant playbook entries.

        Example:
            find_for_services(["vsftpd 2.3.4", "samba 3.0.20", "apache 2.2.8"])
        """
        all_hits: list[PlaybookEntry] = []
        seen: set[str] = set()
        for s in service_strings:
            parts = s.lower().split()
            svc = parts[0] if parts else ""
            ver = " ".join(parts[:2]) if len(parts) >= 2 else svc
            for e in self.find(service=svc, version=ver):
                key = f"{e.service}:{e.version}:{e.technique}"
                if key not in seen:
                    seen.add(key)
                    all_hits.append(e)
        return all_hits

    # ── Prompt injection ─────────────────────────────────────────────────────

    def to_prompt_section(
        self,
        services: list[str] | None = None,
        max_entries: int = 15,
    ) -> str:
        """
        Build a markdown section to inject into the brain system prompt.

        If services is provided, only show relevant entries.
        Otherwise show the most recent successes.
        """
        if services:
            entries = self.find_for_services(services)
        else:
            entries = [e for e in self.load() if e.succeeded][-max_entries:]

        if not entries:
            return ""

        lines = ["## YOUR PLAYBOOK (techniques you have used successfully before)\n"]
        lines.append(
            "These are PROVEN techniques from your past sessions. "
            "Try these FIRST before searching for new approaches.\n"
        )

        # Group by service for readability
        by_service: dict[str, list[PlaybookEntry]] = {}
        for e in entries:
            by_service.setdefault(e.service.upper(), []).append(e)

        for svc, svc_entries in by_service.items():
            lines.append(f"### {svc}")
            for e in svc_entries:
                icon = "✓" if e.succeeded else "✗"
                cve_part = f" [{e.cve}]" if e.cve else ""
                module_part = f" → `{e.module}`" if e.module else ""
                notes_part = f" | {e.notes}" if e.notes else ""
                lines.append(
                    f"- {icon} `{e.version}`{cve_part}{module_part}"
                    f" → **{e.result}**{notes_part}"
                )
            lines.append("")

        return "\n".join(lines)

    def stats(self) -> dict:
        entries = self.load()
        successes = [e for e in entries if e.succeeded]
        return {
            "total":     len(entries),
            "successes": len(successes),
            "failures":  len(entries) - len(successes),
            "services":  list({e.service for e in successes}),
        }


# ── Module-level singleton ────────────────────────────────────────────────────

_default_playbook: Playbook | None = None


def get_playbook() -> Playbook:
    """Return the module-level singleton Playbook instance."""
    global _default_playbook
    if _default_playbook is None:
        _default_playbook = Playbook()
    return _default_playbook
