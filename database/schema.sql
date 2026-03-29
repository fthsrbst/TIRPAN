-- TIRPAN — Pentest Database Schema
-- Applied via migration version 2 (version 1 = chat tables in db.py)

-- ── Schema version tracking ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  REAL    NOT NULL,
    description TEXT    NOT NULL DEFAULT ''
);

-- ── Pentest sessions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pentest_sessions (
    id            TEXT    PRIMARY KEY,
    target        TEXT    NOT NULL,
    mode          TEXT    NOT NULL DEFAULT 'scan_only',  -- full_auto | ask_before_exploit | scan_only
    status        TEXT    NOT NULL DEFAULT 'idle',       -- idle | running | paused | done | error
    created_at    REAL    NOT NULL,
    updated_at    REAL    NOT NULL,
    finished_at   REAL,
    hosts_found   INTEGER NOT NULL DEFAULT 0,
    ports_found   INTEGER NOT NULL DEFAULT 0,
    vulns_found   INTEGER NOT NULL DEFAULT 0,
    exploits_run  INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    memory_json   TEXT    -- serialized SessionMemory (JSON)
);

-- ── Scan results ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scan_results (
    id               TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
    target           TEXT NOT NULL,
    scan_type        TEXT NOT NULL,          -- ping | service | os | full
    hosts_json       TEXT NOT NULL DEFAULT '[]',  -- JSON array of Host dicts
    duration_seconds REAL NOT NULL DEFAULT 0.0,
    created_at       REAL NOT NULL
);

-- ── Vulnerabilities ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    cve_id          TEXT,
    cvss_score      REAL NOT NULL DEFAULT 0.0,
    exploit_path    TEXT NOT NULL DEFAULT '',
    exploit_type    TEXT NOT NULL DEFAULT '',  -- remote | local | webapps
    platform        TEXT NOT NULL DEFAULT '',
    service         TEXT NOT NULL DEFAULT '',
    service_version TEXT NOT NULL DEFAULT '',
    host_ip         TEXT NOT NULL DEFAULT '',
    created_at      REAL NOT NULL
);

-- ── Exploit results ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exploit_results (
    id             TEXT    PRIMARY KEY,
    session_id     TEXT    NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
    host_ip        TEXT    NOT NULL,
    port           INTEGER NOT NULL DEFAULT 0,
    module         TEXT    NOT NULL,
    payload        TEXT    NOT NULL DEFAULT '',
    success        INTEGER NOT NULL DEFAULT 0,   -- 0 = false, 1 = true
    session_opened INTEGER NOT NULL DEFAULT 0,   -- Metasploit session ID (0 = none)
    output         TEXT    NOT NULL DEFAULT '',
    error          TEXT    NOT NULL DEFAULT '',
    poc_output     TEXT    NOT NULL DEFAULT '',
    source_ip      TEXT    NOT NULL DEFAULT '',  -- pivot origin IP; empty = direct from TIRPAN
    created_at     REAL    NOT NULL
);

-- ── Knowledge base (successful exploit memory) ─────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_base (
    id             TEXT PRIMARY KEY,
    service        TEXT NOT NULL,
    version        TEXT NOT NULL DEFAULT '',
    exploit_module TEXT NOT NULL,
    success_count  INTEGER NOT NULL DEFAULT 1,
    last_used_at   REAL    NOT NULL,
    notes          TEXT    NOT NULL DEFAULT '',
    UNIQUE(service, version, exploit_module)
);

-- ── Audit log (append-only) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL DEFAULT '',
    event_type TEXT    NOT NULL,   -- action | safety_block | kill_switch | error | info
    tool_name  TEXT    NOT NULL DEFAULT '',
    target     TEXT    NOT NULL DEFAULT '',
    details    TEXT    NOT NULL DEFAULT '{}',  -- JSON blob
    created_at REAL    NOT NULL
);

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_scan_results_session  ON scan_results(session_id);
CREATE INDEX IF NOT EXISTS idx_vulns_session         ON vulnerabilities(session_id);
CREATE INDEX IF NOT EXISTS idx_vulns_cvss            ON vulnerabilities(cvss_score DESC);
CREATE INDEX IF NOT EXISTS idx_exploits_session      ON exploit_results(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_session_time    ON audit_log(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kb_service_version    ON knowledge_base(service, version);
