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

import aiosqlite

from database.db import DB_PATH

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
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
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
