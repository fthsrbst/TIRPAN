"""
TIRPAN V2 — Artifact Store
===========================
Saves raw tool outputs (nmap XML, nikto txt, ffuf JSON, etc.) to a
per-session directory: data/sessions/{session_id}/artifacts/

Design:
  - Every tool gets session_id injected by BaseAgent.act() as params["_session_id"]
  - Tools optionally call artifact_store.save() with their raw output
  - Artifacts are queryable via API: GET /sessions/{sid}/artifacts
  - Reporting agent reads artifacts from disk for richer context

Directory layout:
  data/
    sessions/
      {session_id}/
        artifacts/
          nmap_192.168.1.1_service.xml
          nikto_http_192.168.1.1_80.txt
          ffuf_http_192.168.1.1_80.json
          ...
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path("data/sessions")


def _session_artifacts_dir(session_id: str) -> Path:
    """Return (and create) the artifacts directory for a session."""
    d = _DATA_DIR / session_id / "artifacts"
    d.mkdir(parents=True, exist_ok=True)
    return d


class ArtifactStore:
    """
    Thread-safe artifact persistence for TIRPAN sessions.

    All methods are synchronous (fast file I/O — no async overhead needed).
    """

    def save(
        self,
        session_id: str,
        tool_name: str,
        filename: str,
        content: bytes | str,
    ) -> Path:
        """
        Write artifact to disk.

        Parameters
        ----------
        session_id : session identifier
        tool_name  : which tool produced this (used in index only)
        filename   : final filename (e.g. "nmap_10.0.0.1_service.xml")
        content    : raw bytes or string

        Returns the full Path where the file was saved.
        """
        artifacts_dir = _session_artifacts_dir(session_id)
        dest = artifacts_dir / filename

        try:
            if isinstance(content, str):
                dest.write_text(content, encoding="utf-8")
            else:
                dest.write_bytes(content)
        except OSError as exc:
            logger.warning("ArtifactStore: failed to write %s: %s", dest, exc)
            return dest

        # Update the index
        self._update_index(session_id, tool_name, filename, dest)
        logger.debug("Artifact saved: %s", dest)
        return dest

    def list_artifacts(self, session_id: str) -> list[dict]:
        """
        Return metadata for all artifacts in a session.

        Reads the index file if present; falls back to scanning the directory.
        """
        index_path = _session_artifacts_dir(session_id) / "_index.json"
        if index_path.exists():
            try:
                return json.loads(index_path.read_text(encoding="utf-8"))
            except Exception:
                pass

        # Fallback: scan directory
        artifacts_dir = _session_artifacts_dir(session_id)
        result = []
        for f in sorted(artifacts_dir.glob("*")):
            if f.name.startswith("_"):
                continue
            stat = f.stat()
            result.append({
                "filename":   f.name,
                "tool":       _guess_tool(f.name),
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(
                    stat.st_ctime, tz=timezone.utc
                ).isoformat(),
            })
        return result

    def read(self, session_id: str, filename: str) -> bytes | None:
        """Read artifact content; returns None if not found."""
        path = _session_artifacts_dir(session_id) / filename
        if not path.exists():
            return None
        return path.read_bytes()

    def artifact_path(self, session_id: str, filename: str) -> Path:
        """Return the full path to an artifact (does not check existence)."""
        return _session_artifacts_dir(session_id) / filename

    def _update_index(
        self, session_id: str, tool_name: str, filename: str, dest: Path
    ) -> None:
        """Append/update entry in _index.json."""
        index_path = dest.parent / "_index.json"
        try:
            index: list[dict] = []
            if index_path.exists():
                index = json.loads(index_path.read_text(encoding="utf-8"))
            # Remove stale entry for same filename if present
            index = [e for e in index if e.get("filename") != filename]
            stat = dest.stat()
            index.append({
                "filename":   filename,
                "tool":       tool_name,
                "size_bytes": stat.st_size,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            index_path.write_text(json.dumps(index, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.debug("ArtifactStore: index update failed: %s", exc)


def _guess_tool(filename: str) -> str:
    """Infer tool name from filename prefix."""
    for prefix in ("nmap_", "nikto_", "ffuf_", "masscan_", "whatweb_",
                   "nuclei_", "theharvester_", "subfinder_"):
        if filename.startswith(prefix):
            return prefix.rstrip("_")
    return "unknown"


# Module-level singleton
_store: ArtifactStore | None = None


def get_store() -> ArtifactStore:
    global _store
    if _store is None:
        _store = ArtifactStore()
    return _store
