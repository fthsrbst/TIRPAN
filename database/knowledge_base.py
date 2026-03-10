"""
Phase 10 — Knowledge Base

Remembers which exploit modules succeeded against which services/versions.
Feeds hints back to the LLM so it can make smarter exploit choices in
future sessions against the same software stack.

Tables used: knowledge_base
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import Optional

import aiosqlite

from database.db import DB_PATH
from database.repositories import _connect  # reuse the same context manager

logger = logging.getLogger(__name__)


class KnowledgeBase:
    """
    Persistent "exploit success memory".

    Usage:
        kb = KnowledgeBase()
        await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
        hints = await kb.suggest_exploits("ftp", "vsftpd 2.3.4")
        # → [{"exploit_module": "...", "success_count": 3, ...}, ...]
    """

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    # ── Public API ────────────────────────────────────────────────────────────

    async def remember_success(
        self,
        service: str,
        version: str,
        exploit_module: str,
        notes: str = "",
    ) -> None:
        """
        Record a successful exploit.

        If the (service, version, module) triplet already exists, increments
        success_count and updates last_used_at.  Otherwise inserts a new row.
        """
        now = time.time()
        async with _connect(self._path) as db:
            # Try to update an existing row first
            await db.execute(
                """UPDATE knowledge_base
                   SET success_count = success_count + 1,
                       last_used_at  = ?,
                       notes         = CASE WHEN ? != '' THEN ? ELSE notes END
                   WHERE service=? AND version=? AND exploit_module=?""",
                (now, notes, notes, service, version, exploit_module),
            )
            if db.total_changes == 0:
                # No existing row — insert
                await db.execute(
                    """INSERT INTO knowledge_base
                       (id, service, version, exploit_module, success_count, last_used_at, notes)
                       VALUES (?,?,?,?,1,?,?)""",
                    (str(uuid.uuid4()), service, version, exploit_module, now, notes),
                )
            await db.commit()
        logger.info(
            "KnowledgeBase: recorded success — %s %s → %s",
            service, version, exploit_module,
        )

    async def suggest_exploits(
        self,
        service: str,
        version: str,
        limit: int = 5,
    ) -> list[dict]:
        """
        Return the top exploit modules that previously worked on this
        service/version, ordered by success_count descending.

        If version is empty, matches any version for the service.
        If no exact match, falls back to service-only matches.
        """
        async with _connect(self._path) as db:
            if version:
                async with db.execute(
                    """SELECT exploit_module, success_count, last_used_at, notes
                       FROM knowledge_base
                       WHERE service=? AND version=?
                       ORDER BY success_count DESC LIMIT ?""",
                    (service, version, limit),
                ) as cur:
                    rows = await cur.fetchall()
            else:
                rows = []

            # Fall back to service-only if no version match
            if not rows:
                async with db.execute(
                    """SELECT exploit_module, success_count, last_used_at, notes
                       FROM knowledge_base
                       WHERE service=?
                       ORDER BY success_count DESC LIMIT ?""",
                    (service, limit),
                ) as cur:
                    rows = await cur.fetchall()

        return [dict(r) for r in rows]

    async def get_all(self, limit: int = 100) -> list[dict]:
        """Return all knowledge base entries, most used first."""
        async with _connect(self._path) as db:
            async with db.execute(
                """SELECT * FROM knowledge_base
                   ORDER BY success_count DESC LIMIT ?""",
                (limit,),
            ) as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def clear(self) -> None:
        """Remove all entries (useful for testing)."""
        async with _connect(self._path) as db:
            await db.execute("DELETE FROM knowledge_base")
            await db.commit()
        logger.info("KnowledgeBase cleared")

    async def count(self) -> int:
        """Return the total number of knowledge base entries."""
        async with _connect(self._path) as db:
            async with db.execute("SELECT COUNT(*) FROM knowledge_base") as cur:
                row = await cur.fetchone()
        return row[0] if row else 0
