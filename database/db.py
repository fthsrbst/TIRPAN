"""
SQLite database layer — chat UI tables + pentest tables.

DB path: data/aegis.db

Migration versions:
  v1 — conversations, messages, app_settings (chat UI)
  v2 — pentest_sessions, scan_results, vulnerabilities,
        exploit_results, knowledge_base, audit_log
  v9 — V2 multi-agent tables: agent_instances, agent_messages,
        shell_sessions, harvested_credentials, loot,
        mission_phases, network_nodes, network_edges;
        mission_brief_json + mission_context_json on pentest_sessions
"""

import json
import logging
import time
import uuid
from pathlib import Path

import aiosqlite

from config import settings

logger = logging.getLogger(__name__)

DB_PATH = settings.data_dir / "aegis.db"

# ── Schema v1: chat UI tables ──────────────────────────────────────────────────

_SCHEMA_V1 = """
CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    tokens_in       INTEGER DEFAULT 0,
    tokens_out      INTEGER DEFAULT 0,
    created_at      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
"""

# ── Schema v2: pentest tables ──────────────────────────────────────────────────

_SCHEMA_V2_FILE = Path(__file__).parent / "schema.sql"


async def _read_pentest_schema() -> str:
    return _SCHEMA_V2_FILE.read_text(encoding="utf-8")


# ── Migration runner ───────────────────────────────────────────────────────────

async def _get_schema_version(db: aiosqlite.Connection) -> int:
    """Return the highest applied migration version (0 if none)."""
    try:
        async with db.execute(
            "SELECT MAX(version) FROM schema_migrations"
        ) as cur:
            row = await cur.fetchone()
            return row[0] if row and row[0] is not None else 0
    except Exception:
        return 0


async def _apply_migration(
    db: aiosqlite.Connection, version: int, sql: str, description: str
) -> None:
    await db.executescript(sql)
    await db.execute(
        "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
        (version, time.time(), description),
    )
    await db.commit()
    logger.info("DB migration v%d applied: %s", version, description)


async def init_db(db_path: Path | None = None) -> None:
    """
    Initialise the database and run pending migrations.

    Accepts an optional db_path for testing with in-memory or temp DBs.
    """
    path = db_path or DB_PATH
    async with aiosqlite.connect(path) as db:
        # Enable WAL mode and busy timeout to avoid "database is locked" on startup
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA busy_timeout=5000")
        # Always ensure v1 base tables exist first
        await db.executescript(_SCHEMA_V1)
        await db.commit()

        version = await _get_schema_version(db)

        if version < 2:
            pentest_sql = await _read_pentest_schema()
            await _apply_migration(db, 2, pentest_sql, "pentest tables")

        if version < 3:
            # Add name column to pentest_sessions for user-friendly mission labels
            try:
                await db.execute(
                    "ALTER TABLE pentest_sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''"
                )
            except Exception:
                pass  # Column may already exist on partial migrations
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
                (3, time.time(), "add session name"),
            )
            await db.commit()
            logger.info("DB migration v3 applied: add session name")

        if version < 4:
            # Add session_events table to store the full agent event stream
            try:
                await db.executescript("""
                    CREATE TABLE IF NOT EXISTS session_events (
                        id         INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT    NOT NULL,
                        event_type TEXT    NOT NULL,
                        data_json  TEXT    NOT NULL DEFAULT '{}',
                        created_at REAL    NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_session_events_sid
                        ON session_events(session_id, created_at);
                """)
            except Exception:
                pass
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
                (4, time.time(), "session_events table"),
            )
            await db.commit()
            logger.info("DB migration v4 applied: session_events table")

        if version < 5:
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS credentials (
                    id           TEXT PRIMARY KEY,
                    name         TEXT NOT NULL,
                    cred_type    TEXT NOT NULL,
                    host_pattern TEXT NOT NULL DEFAULT '',
                    data_enc     TEXT NOT NULL DEFAULT '{}',
                    created_at   REAL NOT NULL,
                    updated_at   REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS scan_profiles (
                    id           TEXT PRIMARY KEY,
                    name         TEXT NOT NULL UNIQUE,
                    description  TEXT NOT NULL DEFAULT '',
                    config_json  TEXT NOT NULL DEFAULT '{}',
                    created_at   REAL NOT NULL,
                    updated_at   REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS never_scan (
                    id         TEXT PRIMARY KEY,
                    value      TEXT NOT NULL UNIQUE,
                    reason     TEXT NOT NULL DEFAULT '',
                    created_at REAL NOT NULL
                );
            """)
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
                (5, time.time(), "credentials, scan_profiles, never_scan tables"),
            )
            await db.commit()
            logger.info("DB migration v5 applied: credentials / scan_profiles / never_scan")

        if version < 6:
            # Add poc_output column to exploit_results for PoC evidence in reports
            try:
                await db.execute(
                    "ALTER TABLE exploit_results ADD COLUMN poc_output TEXT NOT NULL DEFAULT ''"
                )
            except Exception:
                pass  # Column may already exist
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
                (6, time.time(), "add poc_output to exploit_results"),
            )
            await db.commit()
            logger.info("DB migration v6 applied: poc_output column in exploit_results")

        if version < 7:
            # Store per-session safety config so rollback can restore original settings
            try:
                await db.execute(
                    "ALTER TABLE pentest_sessions ADD COLUMN safety_cfg_json TEXT NOT NULL DEFAULT '{}'"
                )
            except Exception:
                pass  # Column may already exist
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
                (7, time.time(), "add safety_cfg_json to pentest_sessions"),
            )
            await db.commit()
            logger.info("DB migration v7 applied: safety_cfg_json column in pentest_sessions")

        if version < 8:
            # Track pivot source IP for lateral movement visualization
            try:
                await db.execute(
                    "ALTER TABLE exploit_results ADD COLUMN source_ip TEXT NOT NULL DEFAULT ''"
                )
            except Exception:
                pass  # Column may already exist
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
                (8, time.time(), "add source_ip to exploit_results for lateral movement tracking"),
            )
            await db.commit()
            logger.info("DB migration v8 applied: source_ip column in exploit_results")

        if version < 9:
            await db.executescript("""
                -- ── agent_instances ─────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS agent_instances (
                    id            TEXT    PRIMARY KEY,
                    session_id    TEXT    NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    agent_type    TEXT    NOT NULL,  -- scanner|exploit|post_exploit|webapp|osint|lateral|reporting|brain
                    status        TEXT    NOT NULL DEFAULT 'spawning',  -- spawning|running|paused|done|failed
                    target        TEXT    NOT NULL DEFAULT '',
                    started_at    REAL    NOT NULL,
                    finished_at   REAL,
                    iterations    INTEGER NOT NULL DEFAULT 0,
                    findings_json TEXT    NOT NULL DEFAULT '[]',
                    error         TEXT    NOT NULL DEFAULT '',
                    result_json   TEXT    NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_agent_instances_session
                    ON agent_instances(session_id, status);

                -- ── agent_messages ───────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS agent_messages (
                    id             TEXT    PRIMARY KEY,
                    session_id     TEXT    NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    msg_type       TEXT    NOT NULL,
                    sender_id      TEXT    NOT NULL,
                    recipient_id   TEXT,
                    correlation_id TEXT,
                    payload_json   TEXT    NOT NULL DEFAULT '{}',
                    created_at     REAL    NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_messages_session
                    ON agent_messages(session_id, created_at);

                -- ── shell_sessions ───────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS shell_sessions (
                    id            TEXT    PRIMARY KEY,
                    session_id    TEXT    NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    host_ip       TEXT    NOT NULL,
                    shell_type    TEXT    NOT NULL DEFAULT 'bash',  -- bash|cmd|powershell|meterpreter
                    status        TEXT    NOT NULL DEFAULT 'active',  -- active|closed|lost
                    username      TEXT    NOT NULL DEFAULT '',
                    privilege_lvl INTEGER NOT NULL DEFAULT 0,   -- 0=user 1=root/SYSTEM
                    opened_at     REAL    NOT NULL,
                    closed_at     REAL,
                    notes         TEXT    NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_shell_sessions_session
                    ON shell_sessions(session_id, status);

                -- ── harvested_credentials ────────────────────────────────────
                CREATE TABLE IF NOT EXISTS harvested_credentials (
                    id              TEXT PRIMARY KEY,
                    session_id      TEXT NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    source_host     TEXT NOT NULL,
                    credential_type TEXT NOT NULL DEFAULT 'plaintext',  -- plaintext|hash|key|token
                    username        TEXT NOT NULL DEFAULT '',
                    secret_enc      TEXT NOT NULL DEFAULT '',  -- encrypted; never stored plaintext
                    hash_type       TEXT NOT NULL DEFAULT '',  -- ntlm|sha512|bcrypt|...
                    service         TEXT NOT NULL DEFAULT '',
                    valid_on_json   TEXT NOT NULL DEFAULT '[]',
                    harvested_at    REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_harvcreds_session
                    ON harvested_credentials(session_id, source_host);

                -- ── loot ─────────────────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS loot (
                    id           TEXT PRIMARY KEY,
                    session_id   TEXT NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    source_host  TEXT NOT NULL,
                    loot_type    TEXT NOT NULL DEFAULT 'file',  -- file|data|screenshot|config|key
                    description  TEXT NOT NULL DEFAULT '',
                    source_path  TEXT NOT NULL DEFAULT '',
                    local_path   TEXT NOT NULL DEFAULT '',  -- path in loot storage dir
                    content_preview TEXT NOT NULL DEFAULT '',  -- first 500 chars
                    collected_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_loot_session
                    ON loot(session_id, source_host);

                -- ── mission_phases ───────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS mission_phases (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id  TEXT    NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    phase       TEXT    NOT NULL,
                    transitioned_at REAL NOT NULL,
                    notes       TEXT    NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_mission_phases_session
                    ON mission_phases(session_id, transitioned_at);

                -- ── network_nodes ────────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS network_nodes (
                    id                TEXT    PRIMARY KEY,
                    session_id        TEXT    NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    node_id           TEXT    NOT NULL,
                    ip                TEXT    NOT NULL,
                    hostname          TEXT    NOT NULL DEFAULT '',
                    os_type           TEXT    NOT NULL DEFAULT '',
                    compromise_level  INTEGER NOT NULL DEFAULT 0,
                    node_type         TEXT    NOT NULL DEFAULT 'host',
                    updated_at        REAL    NOT NULL,
                    UNIQUE(session_id, node_id)
                );
                CREATE INDEX IF NOT EXISTS idx_network_nodes_session
                    ON network_nodes(session_id);

                -- ── network_edges ────────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS network_edges (
                    id          TEXT PRIMARY KEY,
                    session_id  TEXT NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
                    from_node   TEXT NOT NULL,
                    to_node     TEXT NOT NULL,
                    edge_type   TEXT NOT NULL DEFAULT 'scan',  -- scan|exploit|lateral|pivot
                    description TEXT NOT NULL DEFAULT '',
                    created_at  REAL NOT NULL,
                    UNIQUE(session_id, from_node, to_node, edge_type)
                );
                CREATE INDEX IF NOT EXISTS idx_network_edges_session
                    ON network_edges(session_id);
            """)
            # mission_brief_json + mission_context_json on pentest_sessions
            for col, default in [
                ("mission_brief_json", "'{}'"),
                ("mission_context_json", "'{}'"),
            ]:
                try:
                    await db.execute(
                        f"ALTER TABLE pentest_sessions ADD COLUMN {col} TEXT NOT NULL DEFAULT {default}"
                    )
                except Exception:
                    pass  # Column may already exist
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES(?,?,?)",
                (9, time.time(), "V2 multi-agent tables: agent_instances, agent_messages, shell_sessions, harvested_credentials, loot, mission_phases, network_nodes, network_edges"),
            )
            await db.commit()
            logger.info("DB migration v9 applied: V2 multi-agent tables")

    logger.info("Database ready: %s", path)


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
    async with aiosqlite.connect(DB_PATH) as db, db.execute(
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


# ── Credentials ───────────────────────────────────────────────────────────────

async def create_credential(name: str, cred_type: str, host_pattern: str, data_enc: str) -> dict:
    now = time.time()
    cid = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO credentials(id, name, cred_type, host_pattern, data_enc, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
            (cid, name, cred_type, host_pattern, data_enc, now, now),
        )
        await db.commit()
    return {"id": cid, "name": name, "cred_type": cred_type, "host_pattern": host_pattern, "created_at": now}


async def list_credentials() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, name, cred_type, host_pattern, created_at, updated_at FROM credentials ORDER BY created_at DESC"
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_credential(cid: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM credentials WHERE id=?", (cid,)) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def delete_credential(cid: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM credentials WHERE id=?", (cid,))
        await db.commit()
        return db.total_changes > 0


# ── Scan Profiles ─────────────────────────────────────────────────────────────

async def create_scan_profile(name: str, description: str, config_json: str) -> dict:
    now = time.time()
    pid = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO scan_profiles(id, name, description, config_json, created_at, updated_at) VALUES(?,?,?,?,?,?)",
            (pid, name, description, config_json, now, now),
        )
        await db.commit()
    return {"id": pid, "name": name, "description": description, "created_at": now}


async def list_scan_profiles() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, name, description, config_json, created_at, updated_at FROM scan_profiles ORDER BY name ASC"
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_scan_profile(pid: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM scan_profiles WHERE id=?", (pid,)) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def delete_scan_profile(pid: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM scan_profiles WHERE id=?", (pid,))
        await db.commit()
        return db.total_changes > 0


async def upsert_scan_profile(name: str, description: str, config_json: str) -> dict:
    """Create or update a profile by name."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id FROM scan_profiles WHERE name=?", (name,)) as cur:
            row = await cur.fetchone()
        now = time.time()
        if row:
            pid = row["id"]
            await db.execute(
                "UPDATE scan_profiles SET description=?, config_json=?, updated_at=? WHERE id=?",
                (description, config_json, now, pid),
            )
            await db.commit()
            return {"id": pid, "name": name, "description": description, "updated_at": now}
        return await create_scan_profile(name, description, config_json)


# ── Never-Scan List ───────────────────────────────────────────────────────────

async def add_never_scan(value: str, reason: str = "") -> dict:
    now = time.time()
    nid = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO never_scan(id, value, reason, created_at) VALUES(?,?,?,?)",
            (nid, value, reason, now),
        )
        await db.commit()
    return {"id": nid, "value": value, "reason": reason, "created_at": now}


async def list_never_scan() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, value, reason, created_at FROM never_scan ORDER BY created_at DESC") as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def delete_never_scan(nid: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM never_scan WHERE id=?", (nid,))
        await db.commit()
        return db.total_changes > 0
