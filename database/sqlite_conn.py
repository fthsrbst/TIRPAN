"""
Shared SQLite connection helpers.

All connections apply the same pragmas to reduce lock contention and keep
foreign-key behavior consistent.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
import logging

import aiosqlite
import sqlite3

_BUSY_TIMEOUT_MS = 30000
logger = logging.getLogger(__name__)


async def apply_pragmas(db: aiosqlite.Connection) -> None:
    # busy_timeout is per-connection, so enforce it on every open.
    await db.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
    await db.execute("PRAGMA foreign_keys=ON")
    # Prefer WAL for concurrency, but fall back to DELETE mode on environments
    # where WAL isn't supported reliably (for example some UNC/remote mounts).
    try:
        async with db.execute("PRAGMA journal_mode=WAL") as cur:
            row = await cur.fetchone()
        mode = str(row[0]).lower() if row else ""
        if mode != "wal":
            await db.execute("PRAGMA journal_mode=DELETE")
    except sqlite3.OperationalError as exc:
        logger.debug("sqlite_conn: WAL mode unavailable (%s), using DELETE mode", exc)
        try:
            await db.execute("PRAGMA journal_mode=DELETE")
        except Exception:
            pass


@asynccontextmanager
async def connect(path: Path | str, *, row_factory: bool = False):
    async with aiosqlite.connect(path, timeout=_BUSY_TIMEOUT_MS / 1000) as db:
        await apply_pragmas(db)
        if row_factory:
            db.row_factory = aiosqlite.Row
        yield db
