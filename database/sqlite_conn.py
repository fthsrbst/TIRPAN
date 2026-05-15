"""
Shared SQLite connection helpers.

All connections apply the same pragmas to reduce lock contention and keep
foreign-key behavior consistent.

A single shared connection is created at app startup via init_shared_connection()
and reused by every connect() call.  This avoids the cost of opening/closing a
connection (WAL check, pragma application, OS fd alloc) on every DB operation.
A per-connection asyncio.Lock serialises writes so no two coroutines touch the
same aiosqlite internal queue simultaneously.
"""

from __future__ import annotations

import asyncio
import contextvars
from contextlib import asynccontextmanager
from pathlib import Path
import logging

import aiosqlite
import sqlite3

_BUSY_TIMEOUT_MS = 30000
logger = logging.getLogger(__name__)

# Shared connection — set by init_shared_connection(), cleared by close_shared_connection()
_shared_conn: aiosqlite.Connection | None = None
_shared_lock: asyncio.Lock | None = None

# Tracks lock-hold depth for the current task so reentrant connect() calls
# (same coroutine chain) skip re-acquiring the lock and avoid deadlocks.
_lock_depth: contextvars.ContextVar[int] = contextvars.ContextVar("_sqlite_lock_depth", default=0)


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


async def init_shared_connection(path: Path | str) -> None:
    """Open the one shared connection used for the lifetime of the process."""
    global _shared_conn, _shared_lock
    db = await aiosqlite.connect(str(path), timeout=_BUSY_TIMEOUT_MS / 1000)
    await apply_pragmas(db)
    _shared_conn = db
    _shared_lock = asyncio.Lock()
    logger.info("sqlite_conn: shared connection opened (%s)", path)


async def close_shared_connection() -> None:
    """Close the shared connection on app shutdown."""
    global _shared_conn, _shared_lock
    if _shared_conn is not None:
        try:
            await _shared_conn.close()
        except Exception as exc:
            logger.debug("sqlite_conn: error closing shared connection: %s", exc)
        finally:
            _shared_conn = None
            _shared_lock = None
    logger.info("sqlite_conn: shared connection closed")


@asynccontextmanager
async def connect(path: Path | str, *, row_factory: bool = False):
    """
    Yield a DB connection.

    When a shared connection is available (normal runtime) it is reused and
    protected by a per-connection lock so concurrent coroutines are serialised.
    Reentrant calls from the same task (iç içe connect()) skip re-acquiring
    the lock to prevent deadlocks — safe because asyncio is single-threaded.
    Falls back to opening a fresh connection (used by init_db migrations and
    tests that run before init_shared_connection is called).
    """
    if _shared_conn is not None and _shared_lock is not None:
        depth = _lock_depth.get()
        if depth > 0:
            # Reentrant call within the same task — lock already held, yield directly.
            old_rf = _shared_conn.row_factory
            if row_factory:
                _shared_conn.row_factory = aiosqlite.Row
            try:
                yield _shared_conn
            finally:
                _shared_conn.row_factory = old_rf
        else:
            async with _shared_lock:
                token = _lock_depth.set(1)
                old_rf = _shared_conn.row_factory
                if row_factory:
                    _shared_conn.row_factory = aiosqlite.Row
                try:
                    yield _shared_conn
                finally:
                    _shared_conn.row_factory = old_rf
                    _lock_depth.reset(token)
    else:
        async with aiosqlite.connect(str(path), timeout=_BUSY_TIMEOUT_MS / 1000) as db:
            await apply_pragmas(db)
            if row_factory:
                db.row_factory = aiosqlite.Row
            yield db
