"""
Phase 10 — Repository Pattern

Five repository classes covering all pentest data:
  SessionRepository      — pentest session CRUD
  ScanResultRepository   — nmap scan storage
  VulnerabilityRepository— vuln CRUD + CVSS query
  ExploitResultRepository— exploit attempt log
  AuditLogRepository     — append-only audit trail

Every method accepts an optional `db_path` (defaults to the global DB_PATH)
so tests can easily pass an in-memory ":memory:" path.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from database.db import DB_PATH
from database.sqlite_conn import connect as connect_db

logger = logging.getLogger(__name__)


# ── helpers ────────────────────────────────────────────────────────────────────

def _now() -> float:
    return time.time()


def _uid() -> str:
    return str(uuid.uuid4())


@asynccontextmanager
async def _connect(db_path: Path | str):
    """
    Async context manager that opens an aiosqlite connection with Row factory.

    Usage:
        async with _connect(path) as db:
            ...

    row_factory must be set AFTER the connection thread starts, which is why
    we wrap aiosqlite.connect() in a proper asynccontextmanager instead of
    setting it on the unconnected object.
    """
    async with connect_db(db_path, row_factory=True) as db:
        yield db


# ── SessionRepository ──────────────────────────────────────────────────────────

class SessionRepository:
    """CRUD for the pentest_sessions table."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def create(
        self,
        target: str,
        mode: str = "scan_only",
        session_id: str | None = None,
    ) -> dict:
        sid = session_id or _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO pentest_sessions
                   (id, target, mode, status, created_at, updated_at)
                   VALUES (?,?,?,?,?,?)""",
                (sid, target, mode, "idle", now, now),
            )
            await db.commit()
        return await self.get(sid)

    async def get(self, session_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM pentest_sessions WHERE id=?", (session_id,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def list_all(self, limit: int = 50) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM pentest_sessions ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def update_status(
        self,
        session_id: str,
        status: str,
        error_message: str | None = None,
    ) -> bool:
        now = _now()
        finished_at = now if status in ("done", "error", "stopped") else None
        async with _connect(self._path) as db:
            await db.execute(
                """UPDATE pentest_sessions
                   SET status=?, updated_at=?, finished_at=?, error_message=?
                   WHERE id=?""",
                (status, now, finished_at, error_message, session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def update_stats(
        self,
        session_id: str,
        hosts_found: int = 0,
        ports_found: int = 0,
        vulns_found: int = 0,
        exploits_run: int = 0,
    ) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                """UPDATE pentest_sessions
                   SET hosts_found=?, ports_found=?, vulns_found=?,
                       exploits_run=?, updated_at=?
                   WHERE id=?""",
                (hosts_found, ports_found, vulns_found, exploits_run, _now(), session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def save_safety_cfg(self, session_id: str, safety_cfg_json: str) -> bool:
        """Persist the SafetyConfig JSON for this session."""
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE pentest_sessions SET safety_cfg_json=?, updated_at=? WHERE id=?",
                (safety_cfg_json, _now(), session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def save_memory(self, session_id: str, memory_json: str) -> bool:
        """Persist the serialized SessionMemory JSON."""
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE pentest_sessions SET memory_json=?, updated_at=? WHERE id=?",
                (memory_json, _now(), session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def update_name(self, session_id: str, name: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE pentest_sessions SET name=?, updated_at=? WHERE id=?",
                (name, _now(), session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def delete(self, session_id: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "DELETE FROM pentest_sessions WHERE id=?", (session_id,)
            )
            await db.commit()
            return db.total_changes > 0


# ── ScanResultRepository ───────────────────────────────────────────────────────

class ScanResultRepository:
    """Save and retrieve nmap scan results."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save(
        self,
        session_id: str,
        target: str,
        scan_type: str,
        hosts: list[dict],
        duration_seconds: float = 0.0,
    ) -> dict:
        rid = _uid()
        now = _now()
        hosts_json = json.dumps(hosts, ensure_ascii=False)
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO scan_results
                   (id, session_id, target, scan_type, hosts_json, duration_seconds, created_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (rid, session_id, target, scan_type, hosts_json, duration_seconds, now),
            )
            await db.commit()
        return {
            "id": rid,
            "session_id": session_id,
            "target": target,
            "scan_type": scan_type,
            "hosts": hosts,
            "duration_seconds": duration_seconds,
            "created_at": now,
        }

    async def get_for_session(self, session_id: str, before: float | None = None) -> list[dict]:
        if before is not None:
            query = "SELECT * FROM scan_results WHERE session_id=? AND created_at<=? ORDER BY created_at ASC"
            params = (session_id, before)
        else:
            query = "SELECT * FROM scan_results WHERE session_id=? ORDER BY created_at ASC"
            params = (session_id,)
        async with _connect(self._path) as db, db.execute(query, params) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["hosts"] = json.loads(r.pop("hosts_json", "[]"))
            results.append(r)
        return results

    async def delete_after(self, session_id: str, timestamp: float) -> None:
        """Delete scan results created after the given timestamp."""
        async with _connect(self._path) as db:
            await db.execute(
                "DELETE FROM scan_results WHERE session_id=? AND created_at>?",
                (session_id, timestamp),
            )
            await db.commit()

    async def get(self, result_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM scan_results WHERE id=?", (result_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        r = dict(row)
        r["hosts"] = json.loads(r.pop("hosts_json", "[]"))
        return r


# ── VulnerabilityRepository ────────────────────────────────────────────────────

class VulnerabilityRepository:
    """CRUD for vulnerabilities with CVSS-score queries."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save(self, session_id: str, vuln: dict) -> dict:
        vid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO vulnerabilities
                   (id, session_id, title, description, cve_id, cvss_score,
                    exploit_path, exploit_type, platform, service, service_version,
                    host_ip, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    vid,
                    session_id,
                    vuln.get("title", ""),
                    vuln.get("description", ""),
                    vuln.get("cve_id"),
                    float(vuln.get("cvss_score", 0.0)),
                    vuln.get("exploit_path", ""),
                    vuln.get("exploit_type", ""),
                    vuln.get("platform", ""),
                    vuln.get("service", ""),
                    vuln.get("service_version", ""),
                    vuln.get("host_ip", ""),
                    now,
                ),
            )
            await db.commit()
        return {**vuln, "id": vid, "session_id": session_id, "created_at": now}

    async def get_for_session(self, session_id: str, before: float | None = None) -> list[dict]:
        if before is not None:
            query = "SELECT * FROM vulnerabilities WHERE session_id=? AND created_at<=? ORDER BY cvss_score DESC"
            params = (session_id, before)
        else:
            query = "SELECT * FROM vulnerabilities WHERE session_id=? ORDER BY cvss_score DESC"
            params = (session_id,)
        async with _connect(self._path) as db, db.execute(query, params) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get_by_min_cvss(self, session_id: str, min_cvss: float) -> list[dict]:
        """Return vulnerabilities with cvss_score >= min_cvss, sorted high-first."""
        async with _connect(self._path) as db, db.execute(
            """SELECT * FROM vulnerabilities
                   WHERE session_id=? AND cvss_score>=?
                   ORDER BY cvss_score DESC""",
            (session_id, min_cvss),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get(self, vuln_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM vulnerabilities WHERE id=?", (vuln_id,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def delete(self, vuln_id: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute("DELETE FROM vulnerabilities WHERE id=?", (vuln_id,))
            await db.commit()
            return db.total_changes > 0

    async def delete_after(self, session_id: str, timestamp: float) -> None:
        """Delete vulnerabilities created after the given timestamp."""
        async with _connect(self._path) as db:
            await db.execute(
                "DELETE FROM vulnerabilities WHERE session_id=? AND created_at>?",
                (session_id, timestamp),
            )
            await db.commit()


# ── ExploitResultRepository ────────────────────────────────────────────────────

class ExploitResultRepository:
    """Save and query exploit attempt records."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save(self, session_id: str, result: dict) -> dict:
        rid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO exploit_results
                   (id, session_id, host_ip, port, module, payload,
                    success, session_opened, output, error, poc_output, source_ip, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    rid,
                    session_id,
                    result.get("host_ip", ""),
                    int(result.get("port", 0)),
                    result.get("module", ""),
                    result.get("payload", ""),
                    1 if result.get("success") else 0,
                    int(result.get("session_opened") or 0),
                    result.get("output", ""),
                    result.get("error", ""),
                    result.get("poc_output", ""),
                    result.get("source_ip", ""),
                    now,
                ),
            )
            await db.commit()
        return {**result, "id": rid, "session_id": session_id, "created_at": now}

    async def get_for_session(self, session_id: str, before: float | None = None) -> list[dict]:
        if before is not None:
            query = "SELECT * FROM exploit_results WHERE session_id=? AND created_at<=? ORDER BY created_at ASC"
            params = (session_id, before)
        else:
            query = "SELECT * FROM exploit_results WHERE session_id=? ORDER BY created_at ASC"
            params = (session_id,)
        async with _connect(self._path) as db, db.execute(query, params) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["success"] = bool(r["success"])
            results.append(r)
        return results

    async def get_successful(self, session_id: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM exploit_results WHERE session_id=? AND success=1",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [{**dict(r), "success": True} for r in rows]

    async def delete_after(self, session_id: str, timestamp: float) -> None:
        """Delete exploit results created after the given timestamp."""
        async with _connect(self._path) as db:
            await db.execute(
                "DELETE FROM exploit_results WHERE session_id=? AND created_at>?",
                (session_id, timestamp),
            )
            await db.commit()


# ── SessionEventRepository ────────────────────────────────────────────────────

class SessionEventRepository:
    """Stores the full agent event stream for replay."""

    # Events that are too high-frequency or not worth persisting
    _SKIP = frozenset({"llm_token", "llm_thinking_start", "llm_reflecting_start"})

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save(self, session_id: str, event_type: str, data: dict) -> None:
        if event_type in self._SKIP:
            return
        now = _now()
        data_json = json.dumps(data, ensure_ascii=False)
        async with _connect(self._path) as db:
            await db.execute(
                "INSERT INTO session_events (session_id, event_type, data_json, created_at) VALUES (?,?,?,?)",
                (session_id, event_type, data_json, now),
            )
            await db.commit()

    async def get_for_session(self, session_id: str, limit: int = 2000) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT id, event_type, data_json, created_at FROM session_events WHERE session_id=? ORDER BY created_at ASC LIMIT ?",
            (session_id, limit),
        ) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            try:
                data = json.loads(row["data_json"])
            except Exception:
                data = {}
            results.append({
                "id": row["id"],
                "event_type": row["event_type"],
                "data": data,
                "created_at": row["created_at"],
            })
        return results

    async def delete_after(self, session_id: str, timestamp: float) -> None:
        """Delete session events created after the given timestamp."""
        async with _connect(self._path) as db:
            await db.execute(
                "DELETE FROM session_events WHERE session_id=? AND created_at>?",
                (session_id, timestamp),
            )
            await db.commit()

    async def get_up_to_iteration(self, session_id: str, iteration: int) -> list[dict]:
        """Return events up to (and including) the Nth reasoning iteration.

        Each 'reasoning' event marks a new iteration. Iteration 1 = first
        reasoning event through to just before the second one, etc.
        """
        all_events = await self.get_for_session(session_id)
        reasoning_count = 0
        cutoff_idx = len(all_events)
        for i, ev in enumerate(all_events):
            if ev["event_type"] == "reasoning":
                reasoning_count += 1
                if reasoning_count > iteration:
                    cutoff_idx = i
                    break
        return all_events[:cutoff_idx]


# ── AuditLogRepository ─────────────────────────────────────────────────────────

class AuditLogRepository:
    """Append-only audit trail — no update or delete methods."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def log(
        self,
        event_type: str,
        session_id: str = "",
        tool_name: str = "",
        target: str = "",
        details: dict | None = None,
    ) -> int:
        """Append one audit event. Returns the auto-incremented row ID."""
        now = _now()
        details_json = json.dumps(details or {}, ensure_ascii=False)
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO audit_log
                   (session_id, event_type, tool_name, target, details, created_at)
                   VALUES (?,?,?,?,?,?)""",
                (session_id, event_type, tool_name, target, details_json, now),
            )
            await db.commit()
            async with db.execute("SELECT last_insert_rowid()") as cur:
                row = await cur.fetchone()
                return row[0] if row else 0

    async def get_for_session(self, session_id: str, limit: int = 200) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            """SELECT * FROM audit_log
                   WHERE session_id=? ORDER BY created_at ASC LIMIT ?""",
            (session_id, limit),
        ) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            try:
                r["details"] = json.loads(r["details"])
            except (json.JSONDecodeError, TypeError):
                r["details"] = {}
            results.append(r)
        return results

    async def get_recent(self, limit: int = 100) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            try:
                r["details"] = json.loads(r["details"])
            except (json.JSONDecodeError, TypeError):
                r["details"] = {}
            results.append(r)
        return results


# ── V2 Multi-Agent Repositories ───────────────────────────────────────────────

class AgentInstanceRepository:
    """CRUD for agent_instances — tracks spawned agent lifecycle."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def create(
        self,
        session_id: str,
        agent_id: str,
        agent_type: str,
        target: str = "",
    ) -> dict:
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO agent_instances
                   (id, session_id, agent_type, status, target, started_at)
                   VALUES (?,?,?,?,?,?)""",
                (agent_id, session_id, agent_type, "spawning", target, now),
            )
            await db.commit()
        return {"id": agent_id, "session_id": session_id, "agent_type": agent_type,
                "status": "spawning", "target": target, "started_at": now}

    async def update_status(
        self,
        agent_id: str,
        status: str,
        iterations: int = 0,
        findings: list | None = None,
        error: str = "",
        result: dict | None = None,
    ) -> bool:
        finished_at = _now() if status in ("done", "failed") else None
        async with _connect(self._path) as db:
            await db.execute(
                """UPDATE agent_instances
                   SET status=?, finished_at=?, iterations=?,
                       findings_json=?, error=?, result_json=?
                   WHERE id=?""",
                (
                    status,
                    finished_at,
                    iterations,
                    json.dumps(findings or [], ensure_ascii=False),
                    error,
                    json.dumps(result or {}, ensure_ascii=False),
                    agent_id,
                ),
            )
            await db.commit()
            return db.total_changes > 0

    async def get(self, agent_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM agent_instances WHERE id=?", (agent_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        r = dict(row)
        r["findings"] = json.loads(r.pop("findings_json", "[]"))
        r["result"] = json.loads(r.pop("result_json", "{}"))
        return r

    async def get_for_session(self, session_id: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM agent_instances WHERE session_id=? ORDER BY started_at ASC",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["findings"] = json.loads(r.pop("findings_json", "[]"))
            r["result"] = json.loads(r.pop("result_json", "{}"))
            results.append(r)
        return results

    async def get_active(self, session_id: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM agent_instances WHERE session_id=? AND status IN ('spawning','running','paused')",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["findings"] = json.loads(r.pop("findings_json", "[]"))
            r["result"] = json.loads(r.pop("result_json", "{}"))
            results.append(r)
        return results


class AgentMessageRepository:
    """Persist AgentMessageBus messages for audit and replay."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save(
        self,
        session_id: str,
        msg_id: str,
        msg_type: str,
        sender_id: str,
        payload: dict,
        recipient_id: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT OR IGNORE INTO agent_messages
                   (id, session_id, msg_type, sender_id, recipient_id,
                    correlation_id, payload_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    msg_id,
                    session_id,
                    msg_type,
                    sender_id,
                    recipient_id,
                    correlation_id,
                    json.dumps(payload, ensure_ascii=False),
                    now,
                ),
            )
            await db.commit()

    async def get_for_session(self, session_id: str, limit: int = 500) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM agent_messages WHERE session_id=? ORDER BY created_at ASC LIMIT ?",
            (session_id, limit),
        ) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["payload"] = json.loads(r.pop("payload_json", "{}"))
            results.append(r)
        return results


class HarvestedCredentialRepository:
    """Store credentials collected during post-exploitation (secret encrypted by caller)."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save(
        self,
        session_id: str,
        source_host: str,
        credential_type: str,
        username: str,
        secret_enc: str,
        hash_type: str = "",
        service: str = "",
        valid_on: list | None = None,
    ) -> dict:
        cid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO harvested_credentials
                   (id, session_id, source_host, credential_type, username,
                    secret_enc, hash_type, service, valid_on_json, harvested_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    cid, session_id, source_host, credential_type,
                    username, secret_enc, hash_type, service,
                    json.dumps(valid_on or [], ensure_ascii=False), now,
                ),
            )
            await db.commit()
        return {"id": cid, "session_id": session_id, "source_host": source_host,
                "credential_type": credential_type, "username": username,
                "harvested_at": now}

    async def get_for_session(self, session_id: str) -> list[dict]:
        """Returns metadata only — secret_enc is omitted from results."""
        async with _connect(self._path) as db, db.execute(
            """SELECT id, session_id, source_host, credential_type, username,
                      hash_type, service, valid_on_json, harvested_at
               FROM harvested_credentials WHERE session_id=? ORDER BY harvested_at ASC""",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["valid_on"] = json.loads(r.pop("valid_on_json", "[]"))
            results.append(r)
        return results

    async def count(self, session_id: str) -> int:
        async with _connect(self._path) as db, db.execute(
            "SELECT COUNT(*) FROM harvested_credentials WHERE session_id=?", (session_id,)
        ) as cur:
            row = await cur.fetchone()
        return row[0] if row else 0


class LootRepository:
    """Store loot items collected during post-exploitation."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save(
        self,
        session_id: str,
        source_host: str,
        loot_type: str,
        description: str = "",
        source_path: str = "",
        local_path: str = "",
        content_preview: str = "",
    ) -> dict:
        lid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO loot
                   (id, session_id, source_host, loot_type, description,
                    source_path, local_path, content_preview, collected_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (lid, session_id, source_host, loot_type, description,
                 source_path, local_path, content_preview[:500], now),
            )
            await db.commit()
        return {"id": lid, "session_id": session_id, "source_host": source_host,
                "loot_type": loot_type, "description": description, "collected_at": now}

    async def get_for_session(self, session_id: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM loot WHERE session_id=? ORDER BY collected_at ASC",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def count(self, session_id: str) -> int:
        async with _connect(self._path) as db, db.execute(
            "SELECT COUNT(*) FROM loot WHERE session_id=?", (session_id,)
        ) as cur:
            row = await cur.fetchone()
        return row[0] if row else 0


class NetworkGraphRepository:
    """Persist attack graph nodes and edges (mirrors MissionContext.attack_graph)."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def upsert_node(
        self,
        session_id: str,
        node_id: str,
        ip: str,
        hostname: str = "",
        os_type: str = "",
        compromise_level: int = 0,
        node_type: str = "host",
    ) -> None:
        now = _now()
        nid = _uid()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO network_nodes
                   (id, session_id, node_id, ip, hostname, os_type,
                    compromise_level, node_type, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(session_id, node_id) DO UPDATE SET
                     ip=excluded.ip, hostname=excluded.hostname,
                     os_type=excluded.os_type,
                     compromise_level=MAX(compromise_level, excluded.compromise_level),
                     node_type=excluded.node_type, updated_at=excluded.updated_at""",
                (nid, session_id, node_id, ip, hostname, os_type,
                 compromise_level, node_type, now),
            )
            await db.commit()

    async def upsert_edge(
        self,
        session_id: str,
        from_node: str,
        to_node: str,
        edge_type: str = "scan",
        description: str = "",
    ) -> None:
        eid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT OR IGNORE INTO network_edges
                   (id, session_id, from_node, to_node, edge_type, description, created_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (eid, session_id, from_node, to_node, edge_type, description, now),
            )
            await db.commit()

    async def get_nodes(self, session_id: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM network_nodes WHERE session_id=? ORDER BY updated_at ASC",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get_edges(self, session_id: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM network_edges WHERE session_id=? ORDER BY created_at ASC",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get_graph(self, session_id: str) -> dict:
        nodes = await self.get_nodes(session_id)
        edges = await self.get_edges(session_id)
        return {"nodes": nodes, "edges": edges}


class MissionContextRepository:
    """Persist MissionBrief and MissionContext JSON on pentest_sessions."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def save_brief(self, session_id: str, brief_dict: dict) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE pentest_sessions SET mission_brief_json=?, updated_at=? WHERE id=?",
                (json.dumps(brief_dict, ensure_ascii=False), _now(), session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def save_context(self, session_id: str, context_dict: dict) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE pentest_sessions SET mission_context_json=?, updated_at=? WHERE id=?",
                (json.dumps(context_dict, ensure_ascii=False), _now(), session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def load_brief(self, session_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT mission_brief_json FROM pentest_sessions WHERE id=?", (session_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        try:
            return json.loads(row[0])
        except Exception:
            return None

    async def load_context(self, session_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT mission_context_json FROM pentest_sessions WHERE id=?", (session_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        try:
            return json.loads(row[0])
        except Exception:
            return None


# ── DefenseSessionRepository ───────────────────────────────────────────────────

class DefenseSessionRepository:
    """CRUD for defense_sessions table."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def create(
        self,
        network: str,
        name: str = "",
        mode: str = "manual",
        session_id: str | None = None,
    ) -> dict:
        sid = session_id or _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO defense_sessions
                   (id, name, network, mode, status, created_at)
                   VALUES (?,?,?,?,?,?)""",
                (sid, name or f"Defense-{network}", network, mode, "idle", now),
            )
            await db.commit()
        return await self.get(sid)

    async def get(self, session_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM defense_sessions WHERE id=?", (session_id,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def list_all(self, limit: int = 50) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM defense_sessions ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def update_status(
        self, session_id: str, status: str,
        started_at: float | None = None,
        stopped_at: float | None = None,
    ) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                """UPDATE defense_sessions
                   SET status=?, started_at=COALESCE(?,started_at),
                       stopped_at=COALESCE(?,stopped_at)
                   WHERE id=?""",
                (status, started_at, stopped_at, session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def update_mode(self, session_id: str, mode: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE defense_sessions SET mode=? WHERE id=?",
                (mode, session_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def delete(self, session_id: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute("DELETE FROM defense_sessions WHERE id=?", (session_id,))
            await db.commit()
            return db.total_changes > 0


# ── DefenseAlertRepository ─────────────────────────────────────────────────────

class DefenseAlertRepository:
    """CRUD for defense_alerts table."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def create(
        self,
        defense_sid: str,
        alert_type: str,
        severity: str,
        src_ip: str | None = None,
        dst_ip: str | None = None,
        dst_port: int | None = None,
        protocol: str | None = None,
        details: dict | None = None,
        mitre_tactic: str | None = None,
        mitre_technique: str | None = None,
    ) -> dict:
        aid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO defense_alerts
                   (id, defense_sid, alert_type, severity, src_ip, dst_ip,
                    dst_port, protocol, details, status, mitre_tactic,
                    mitre_technique, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    aid, defense_sid, alert_type, severity,
                    src_ip, dst_ip, dst_port, protocol,
                    json.dumps(details or {}),
                    "open", mitre_tactic, mitre_technique, now,
                ),
            )
            await db.commit()
        row = await self.get(aid)
        return row

    async def get(self, alert_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM defense_alerts WHERE id=?", (alert_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        r = dict(row)
        r["details"] = json.loads(r.get("details") or "{}")
        return r

    async def list_for_session(
        self, defense_sid: str, limit: int = 200, severity: str | None = None
    ) -> list[dict]:
        if severity:
            query = ("SELECT * FROM defense_alerts WHERE defense_sid=? AND severity=? "
                     "ORDER BY created_at DESC LIMIT ?")
            params = (defense_sid, severity, limit)
        else:
            query = ("SELECT * FROM defense_alerts WHERE defense_sid=? "
                     "ORDER BY created_at DESC LIMIT ?")
            params = (defense_sid, limit)
        async with _connect(self._path) as db, db.execute(query, params) as cur:
            rows = await cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["details"] = json.loads(d.get("details") or "{}")
            result.append(d)
        return result


# ── UserRepository ─────────────────────────────────────────────────────────────
# Adapts to the existing users table schema (migration v11):
#   id, email, full_name, hashed_password, role, is_active, is_verified,
#   created_at, last_login, org_id, avatar_color, failed_login_attempts, locked_until

class UserRepository:
    """CRUD for the users table."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def create(
        self,
        email: str,
        full_name: str,
        hashed_password: str,
        role: str = "viewer",
    ) -> dict:
        uid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO users
                   (id, email, full_name, hashed_password, role, is_active, is_verified, created_at)
                   VALUES (?,?,?,?,?,1,1,?)""",
                (uid, email.lower(), full_name, hashed_password, role, now),
            )
            await db.commit()
        return await self.get_by_id(uid)

    async def get_by_id(self, user_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM users WHERE id=?", (user_id,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def get_by_email(self, email: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM users WHERE email=?", (email.lower(),)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def list_all(self) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM users ORDER BY created_at DESC"
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def update_role(self, user_id: str, role: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE users SET role=? WHERE id=?",
                (role, user_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def update_active(self, user_id: str, is_active: bool) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE users SET is_active=? WHERE id=?",
                (1 if is_active else 0, user_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def update_last_login(self, user_id: str) -> None:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE users SET last_login=? WHERE id=?",
                (_now(), user_id),
            )
            await db.commit()

    async def email_exists(self, email: str) -> bool:
        async with _connect(self._path) as db, db.execute(
            "SELECT 1 FROM users WHERE email=?", (email.lower(),)
        ) as cur:
            return await cur.fetchone() is not None

    async def update_status(self, alert_id: str, status: str) -> bool:
        resolved_at = _now() if status == "resolved" else None
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE defense_alerts SET status=?, resolved_at=COALESCE(?,resolved_at) WHERE id=?",
                (status, resolved_at, alert_id),
            )
            await db.commit()
            return db.total_changes > 0

    async def update_mitre(
        self, alert_id: str, mitre_tactic: str, mitre_technique: str
    ) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE defense_alerts SET mitre_tactic=?, mitre_technique=? WHERE id=?",
                (mitre_tactic, mitre_technique, alert_id),
            )
            await db.commit()
            return db.total_changes > 0


# ── DefenseBlockRepository ─────────────────────────────────────────────────────

class DefenseBlockRepository:
    """CRUD for defense_blocks table."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def create(
        self,
        defense_sid: str,
        block_type: str,
        target_ip: str,
        reason: str,
        target_port: int | None = None,
        rule_id: str | None = None,
        alert_id: str | None = None,
    ) -> dict:
        bid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO defense_blocks
                   (id, defense_sid, block_type, target_ip, target_port,
                    rule_id, reason, alert_id, active, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (bid, defense_sid, block_type, target_ip, target_port,
                 rule_id, reason, alert_id, 1, now),
            )
            await db.commit()
        return await self.get(bid)

    async def get(self, block_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM defense_blocks WHERE id=?", (block_id,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def list_for_session(
        self, defense_sid: str, active_only: bool = False
    ) -> list[dict]:
        if active_only:
            query = ("SELECT * FROM defense_blocks WHERE defense_sid=? AND active=1 "
                     "ORDER BY created_at DESC")
        else:
            query = ("SELECT * FROM defense_blocks WHERE defense_sid=? "
                     "ORDER BY created_at DESC")
        async with _connect(self._path) as db, db.execute(query, (defense_sid,)) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def deactivate(self, block_id: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE defense_blocks SET active=0, removed_at=? WHERE id=?",
                (_now(), block_id),
            )
            await db.commit()
            return db.total_changes > 0


# ── DefenseDeceptionRepository ─────────────────────────────────────────────────

class DefenseDeceptionRepository:
    """CRUD for defense_deceptions table."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def create(
        self,
        defense_sid: str,
        deception_type: str,
        target_ip: str | None = None,
        bind_port: int | None = None,
        fake_service: str | None = None,
        details: dict | None = None,
    ) -> dict:
        did = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO defense_deceptions
                   (id, defense_sid, deception_type, target_ip, bind_port,
                    fake_service, details, triggered, status, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (did, defense_sid, deception_type, target_ip, bind_port,
                 fake_service, json.dumps(details or {}), 0, "active", now),
            )
            await db.commit()
        return await self.get(did)

    async def get(self, deception_id: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM defense_deceptions WHERE id=?", (deception_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["details"] = json.loads(d.get("details") or "{}")
        return d

    async def list_for_session(self, defense_sid: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM defense_deceptions WHERE defense_sid=? ORDER BY created_at DESC",
            (defense_sid,),
        ) as cur:
            rows = await cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["details"] = json.loads(d.get("details") or "{}")
            result.append(d)
        return result

    async def increment_triggered(self, deception_id: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE defense_deceptions SET triggered=triggered+1, status='triggered' WHERE id=?",
                (deception_id,),
            )
            await db.commit()
            return db.total_changes > 0

    async def remove(self, deception_id: str) -> bool:
        async with _connect(self._path) as db:
            await db.execute(
                "UPDATE defense_deceptions SET status='removed', removed_at=? WHERE id=?",
                (_now(), deception_id),
            )
            await db.commit()
            return db.total_changes > 0


# ── AttackerProfileRepository ──────────────────────────────────────────────────

class AttackerProfileRepository:
    """CRUD for attacker_profiles table (one row per src_ip per defense session)."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def upsert(
        self,
        defense_sid: str,
        src_ip: str,
        ttps: list[str] | None = None,
        known_ports: list | None = None,
        known_hosts: list[str] | None = None,
        deceived_with: list | None = None,
        actor_guess: str | None = None,
        actor_conf: float | None = None,
        next_move: str | None = None,
        next_move_conf: float | None = None,
    ) -> dict:
        now = _now()
        existing = await self.get_by_ip(defense_sid, src_ip)
        if existing:
            # Merge lists, overwrite scalars only if new value provided
            merged_ttps = list(set(existing.get("ttps", []) + (ttps or [])))
            merged_ports = list(set(
                [str(p) for p in existing.get("known_ports", [])] +
                [str(p) for p in (known_ports or [])]
            ))
            merged_hosts = list(set(existing.get("known_hosts", []) + (known_hosts or [])))
            merged_dec = list(set(existing.get("deceived_with", []) + (deceived_with or [])))
            async with _connect(self._path) as db:
                await db.execute(
                    """UPDATE attacker_profiles
                       SET ttps=?, known_ports=?, known_hosts=?, deceived_with=?,
                           actor_guess=COALESCE(?,actor_guess),
                           actor_conf=COALESCE(?,actor_conf),
                           next_move=COALESCE(?,next_move),
                           next_move_conf=COALESCE(?,next_move_conf),
                           last_seen=?
                       WHERE defense_sid=? AND src_ip=?""",
                    (
                        json.dumps(merged_ttps), json.dumps(merged_ports),
                        json.dumps(merged_hosts), json.dumps(merged_dec),
                        actor_guess, actor_conf, next_move, next_move_conf,
                        now, defense_sid, src_ip,
                    ),
                )
                await db.commit()
        else:
            pid = _uid()
            async with _connect(self._path) as db:
                await db.execute(
                    """INSERT INTO attacker_profiles
                       (id, defense_sid, src_ip, ttps, known_ports, known_hosts,
                        deceived_with, actor_guess, actor_conf, next_move,
                        next_move_conf, last_seen, created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        pid, defense_sid, src_ip,
                        json.dumps(ttps or []), json.dumps(known_ports or []),
                        json.dumps(known_hosts or []), json.dumps(deceived_with or []),
                        actor_guess, actor_conf or 0.0,
                        next_move, next_move_conf or 0.0,
                        now, now,
                    ),
                )
                await db.commit()
        return await self.get_by_ip(defense_sid, src_ip)

    def _decode(self, row: dict) -> dict:
        for field in ("ttps", "known_ports", "known_hosts", "deceived_with"):
            row[field] = json.loads(row.get(field) or "[]")
        return row

    async def get_by_ip(self, defense_sid: str, src_ip: str) -> dict | None:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM attacker_profiles WHERE defense_sid=? AND src_ip=?",
            (defense_sid, src_ip),
        ) as cur:
            row = await cur.fetchone()
        return self._decode(dict(row)) if row else None

    async def list_for_session(self, defense_sid: str) -> list[dict]:
        async with _connect(self._path) as db, db.execute(
            "SELECT * FROM attacker_profiles WHERE defense_sid=? ORDER BY last_seen DESC",
            (defense_sid,),
        ) as cur:
            rows = await cur.fetchall()
        return [self._decode(dict(r)) for r in rows]


# ── DefenseEventRepository ─────────────────────────────────────────────────────

class DefenseEventRepository:
    """Append-only store for defense agent event stream."""

    def __init__(self, db_path: Path | str | None = None):
        self._path = db_path or DB_PATH

    async def append(self, defense_sid: str, event_type: str, payload: dict) -> dict:
        eid = _uid()
        now = _now()
        async with _connect(self._path) as db:
            await db.execute(
                """INSERT INTO defense_events (id, defense_sid, event_type, payload, created_at)
                   VALUES (?,?,?,?,?)""",
                (eid, defense_sid, event_type, json.dumps(payload), now),
            )
            await db.commit()
        return {"id": eid, "defense_sid": defense_sid, "event_type": event_type,
                "payload": payload, "created_at": now}

    async def list_for_session(
        self, defense_sid: str, since: float | None = None, limit: int = 500
    ) -> list[dict]:
        if since is not None:
            query = ("SELECT * FROM defense_events WHERE defense_sid=? AND created_at>? "
                     "ORDER BY created_at ASC LIMIT ?")
            params = (defense_sid, since, limit)
        else:
            query = ("SELECT * FROM defense_events WHERE defense_sid=? "
                     "ORDER BY created_at ASC LIMIT ?")
            params = (defense_sid, limit)
        async with _connect(self._path) as db, db.execute(query, params) as cur:
            rows = await cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["payload"] = json.loads(d.get("payload") or "{}")
            result.append(d)
        return result
