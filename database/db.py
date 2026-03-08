"""
SQLite database layer — conversations, messages, settings.

DB path: data/aegis.db
"""

import json
import uuid
import time
import aiosqlite
from pathlib import Path
from config import settings

DB_PATH = settings.data_dir / "aegis.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,   -- 'user' | 'assistant' | 'system'
    content         TEXT NOT NULL,
    tokens_in       INTEGER DEFAULT 0,
    tokens_out      INTEGER DEFAULT 0,
    created_at      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL   -- JSON encoded
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
"""


async def init_db() -> None:
    """Create tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(_SCHEMA)
        await db.commit()


# ── Conversations ─────────────────────────────────────────────────────────────

async def create_conversation(title: str = "New Chat") -> dict:
    now = time.time()
    cid = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO conversations(id, title, created_at, updated_at) VALUES(?,?,?,?)",
            (cid, title, now, now),
        )
        await db.commit()
    return {"id": cid, "title": title, "created_at": now, "updated_at": now}


async def list_conversations() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_conversation(cid: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE id=?", (cid,)
        ) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def update_conversation_title(cid: str, title: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE conversations SET title=?, updated_at=? WHERE id=?",
            (title, time.time(), cid),
        )
        await db.commit()
        return db.total_changes > 0


async def delete_conversation(cid: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM conversations WHERE id=?", (cid,))
        await db.commit()
        return db.total_changes > 0


# ── Messages ──────────────────────────────────────────────────────────────────

async def add_message(
    conversation_id: str,
    role: str,
    content: str,
    tokens_in: int = 0,
    tokens_out: int = 0,
) -> dict:
    now = time.time()
    mid = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO messages(id, conversation_id, role, content, tokens_in, tokens_out, created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (mid, conversation_id, role, content, tokens_in, tokens_out, now),
        )
        # bump conversation updated_at
        await db.execute(
            "UPDATE conversations SET updated_at=? WHERE id=?", (now, conversation_id)
        )
        await db.commit()
    return {
        "id": mid,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "created_at": now,
    }


async def get_messages(conversation_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, conversation_id, role, content, tokens_in, tokens_out, created_at
               FROM messages WHERE conversation_id=? ORDER BY created_at ASC""",
            (conversation_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ── Settings ──────────────────────────────────────────────────────────────────

async def get_setting(key: str, default=None):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT value FROM app_settings WHERE key=?", (key,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return default
    return json.loads(row[0])


async def set_setting(key: str, value) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO app_settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value)),
        )
        await db.commit()


async def get_all_settings() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT key, value FROM app_settings") as cur:
            rows = await cur.fetchall()
    return {r["key"]: json.loads(r["value"]) for r in rows}
