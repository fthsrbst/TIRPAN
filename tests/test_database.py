"""
Phase 10 — Database Tests

All tests use an in-memory (temporary file) SQLite database so they
never touch the real tirpan.db and run fully isolated.
"""

import asyncio
import pytest
import pytest_asyncio
import tempfile
import os
from pathlib import Path

from database.db import init_db
from database.repositories import (
    SessionRepository,
    ScanResultRepository,
    VulnerabilityRepository,
    ExploitResultRepository,
    AuditLogRepository,
)
from database.knowledge_base import KnowledgeBase


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_path(tmp_path):
    """Provide a fresh temporary SQLite file for each test."""
    path = tmp_path / "test_tirpan.db"
    await init_db(path)
    return path


@pytest_asyncio.fixture
async def session_repo(db_path):
    return SessionRepository(db_path)


@pytest_asyncio.fixture
async def scan_repo(db_path):
    return ScanResultRepository(db_path)


@pytest_asyncio.fixture
async def vuln_repo(db_path):
    return VulnerabilityRepository(db_path)


@pytest_asyncio.fixture
async def exploit_repo(db_path):
    return ExploitResultRepository(db_path)


@pytest_asyncio.fixture
async def audit_repo(db_path):
    return AuditLogRepository(db_path)


@pytest_asyncio.fixture
async def kb(db_path):
    return KnowledgeBase(db_path)


# ── 10.2-10.3 DB init and migration ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_init_db_creates_file(tmp_path):
    path = tmp_path / "new_test.db"
    await init_db(path)
    assert path.exists()


@pytest.mark.asyncio
async def test_init_db_idempotent(tmp_path):
    path = tmp_path / "idem_test.db"
    await init_db(path)
    await init_db(path)  # second call must not raise or corrupt
    assert path.exists()


@pytest.mark.asyncio
async def test_migration_v2_applied(db_path):
    import aiosqlite
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT version FROM schema_migrations WHERE version=2"
        ) as cur:
            row = await cur.fetchone()
    assert row is not None
    assert row[0] == 2


@pytest.mark.asyncio
async def test_all_pentest_tables_exist(db_path):
    import aiosqlite
    expected = {
        "pentest_sessions", "scan_results", "vulnerabilities",
        "exploit_results", "knowledge_base", "audit_log",
    }
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ) as cur:
            tables = {row[0] for row in await cur.fetchall()}
    assert expected.issubset(tables)


# ── 10.4 SessionRepository ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_session_create_returns_dict(session_repo):
    s = await session_repo.create(target="10.0.0.0/24", mode="full_auto")
    assert s["id"] is not None
    assert s["target"] == "10.0.0.0/24"
    assert s["mode"] == "full_auto"
    assert s["status"] == "idle"


@pytest.mark.asyncio
async def test_session_get_returns_created(session_repo):
    s = await session_repo.create("192.168.1.0/24", "scan_only")
    fetched = await session_repo.get(s["id"])
    assert fetched is not None
    assert fetched["id"] == s["id"]
    assert fetched["target"] == "192.168.1.0/24"


@pytest.mark.asyncio
async def test_session_get_nonexistent_returns_none(session_repo):
    result = await session_repo.get("does-not-exist")
    assert result is None


@pytest.mark.asyncio
async def test_session_list_all(session_repo):
    await session_repo.create("10.0.0.1")
    await session_repo.create("10.0.0.2")
    sessions = await session_repo.list_all()
    assert len(sessions) >= 2


@pytest.mark.asyncio
async def test_session_update_status(session_repo):
    s = await session_repo.create("10.0.0.5")
    ok = await session_repo.update_status(s["id"], "running")
    assert ok is True
    updated = await session_repo.get(s["id"])
    assert updated["status"] == "running"


@pytest.mark.asyncio
async def test_session_update_status_done_sets_finished_at(session_repo):
    s = await session_repo.create("10.0.0.5")
    await session_repo.update_status(s["id"], "done")
    updated = await session_repo.get(s["id"])
    assert updated["finished_at"] is not None


@pytest.mark.asyncio
async def test_session_update_stats(session_repo):
    s = await session_repo.create("10.0.0.5")
    await session_repo.update_stats(s["id"], hosts_found=3, ports_found=12, vulns_found=2, exploits_run=1)
    updated = await session_repo.get(s["id"])
    assert updated["hosts_found"] == 3
    assert updated["ports_found"] == 12
    assert updated["vulns_found"] == 2
    assert updated["exploits_run"] == 1


@pytest.mark.asyncio
async def test_session_save_memory(session_repo):
    s = await session_repo.create("10.0.0.5")
    ok = await session_repo.save_memory(s["id"], '{"messages": []}')
    assert ok is True
    updated = await session_repo.get(s["id"])
    assert updated["memory_json"] == '{"messages": []}'


@pytest.mark.asyncio
async def test_session_delete(session_repo):
    s = await session_repo.create("10.0.0.5")
    ok = await session_repo.delete(s["id"])
    assert ok is True
    assert await session_repo.get(s["id"]) is None


@pytest.mark.asyncio
async def test_session_custom_id(session_repo):
    s = await session_repo.create("10.0.0.5", session_id="custom-id-001")
    assert s["id"] == "custom-id-001"


# ── 10.5 ScanResultRepository ──────────────────────────────────────────────────

@pytest_asyncio.fixture
async def session_id(session_repo):
    s = await session_repo.create("10.0.0.0/24")
    return s["id"]


@pytest.mark.asyncio
async def test_scan_result_save(scan_repo, session_id):
    hosts = [{"ip": "10.0.0.5", "state": "up", "ports": []}]
    r = await scan_repo.save(session_id, "10.0.0.0/24", "ping", hosts, 1.5)
    assert r["id"] is not None
    assert r["scan_type"] == "ping"
    assert r["hosts"] == hosts
    assert r["duration_seconds"] == 1.5


@pytest.mark.asyncio
async def test_scan_result_get_for_session(scan_repo, session_id):
    hosts = [{"ip": "10.0.0.5", "state": "up", "ports": []}]
    await scan_repo.save(session_id, "10.0.0.0/24", "ping", hosts)
    await scan_repo.save(session_id, "10.0.0.5", "service", hosts)
    results = await scan_repo.get_for_session(session_id)
    assert len(results) == 2


@pytest.mark.asyncio
async def test_scan_result_hosts_deserialized(scan_repo, session_id):
    hosts = [{"ip": "10.0.0.5", "state": "up", "ports": [{"number": 21, "state": "open"}]}]
    saved = await scan_repo.save(session_id, "10.0.0.5", "service", hosts)
    fetched = await scan_repo.get(saved["id"])
    assert fetched["hosts"][0]["ip"] == "10.0.0.5"
    assert fetched["hosts"][0]["ports"][0]["number"] == 21


@pytest.mark.asyncio
async def test_scan_result_get_nonexistent(scan_repo):
    result = await scan_repo.get("no-such-id")
    assert result is None


# ── 10.6 VulnerabilityRepository ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vuln_save(vuln_repo, session_id):
    vuln = {
        "title": "vsftpd 2.3.4 Backdoor",
        "cve_id": "CVE-2011-2523",
        "cvss_score": 10.0,
        "service": "ftp",
        "service_version": "vsftpd 2.3.4",
        "host_ip": "10.0.0.5",
    }
    saved = await vuln_repo.save(session_id, vuln)
    assert saved["id"] is not None
    assert saved["title"] == "vsftpd 2.3.4 Backdoor"
    assert saved["cvss_score"] == 10.0


@pytest.mark.asyncio
async def test_vuln_get_for_session(vuln_repo, session_id):
    await vuln_repo.save(session_id, {"title": "Vuln A", "cvss_score": 9.0})
    await vuln_repo.save(session_id, {"title": "Vuln B", "cvss_score": 5.0})
    vulns = await vuln_repo.get_for_session(session_id)
    assert len(vulns) == 2
    # Should be sorted by CVSS descending
    assert vulns[0]["cvss_score"] >= vulns[1]["cvss_score"]


@pytest.mark.asyncio
async def test_vuln_get_by_min_cvss(vuln_repo, session_id):
    await vuln_repo.save(session_id, {"title": "Critical", "cvss_score": 9.8})
    await vuln_repo.save(session_id, {"title": "Medium", "cvss_score": 5.5})
    await vuln_repo.save(session_id, {"title": "Low", "cvss_score": 2.0})
    high = await vuln_repo.get_by_min_cvss(session_id, 7.0)
    assert len(high) == 1
    assert high[0]["title"] == "Critical"


@pytest.mark.asyncio
async def test_vuln_get_by_min_cvss_empty(vuln_repo, session_id):
    result = await vuln_repo.get_by_min_cvss(session_id, 7.0)
    assert result == []


@pytest.mark.asyncio
async def test_vuln_get_by_id(vuln_repo, session_id):
    saved = await vuln_repo.save(session_id, {"title": "Test", "cvss_score": 8.0})
    fetched = await vuln_repo.get(saved["id"])
    assert fetched["title"] == "Test"


@pytest.mark.asyncio
async def test_vuln_delete(vuln_repo, session_id):
    saved = await vuln_repo.save(session_id, {"title": "Delete me", "cvss_score": 5.0})
    ok = await vuln_repo.delete(saved["id"])
    assert ok is True
    assert await vuln_repo.get(saved["id"]) is None


# ── 10.7 ExploitResultRepository ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_exploit_save(exploit_repo, session_id):
    data = {
        "host_ip": "10.0.0.5",
        "port": 21,
        "module": "exploit/unix/ftp/vsftpd_234_backdoor",
        "payload": "cmd/unix/interact",
        "success": True,
        "session_opened": 1,
        "output": "uid=0(root)",
        "error": "",
    }
    saved = await exploit_repo.save(session_id, data)
    assert saved["id"] is not None
    assert saved["success"] is True
    assert saved["session_opened"] == 1


@pytest.mark.asyncio
async def test_exploit_get_for_session(exploit_repo, session_id):
    await exploit_repo.save(session_id, {"host_ip": "10.0.0.5", "module": "m1", "success": True})
    await exploit_repo.save(session_id, {"host_ip": "10.0.0.6", "module": "m2", "success": False})
    results = await exploit_repo.get_for_session(session_id)
    assert len(results) == 2


@pytest.mark.asyncio
async def test_exploit_get_successful_only(exploit_repo, session_id):
    await exploit_repo.save(session_id, {"host_ip": "10.0.0.5", "module": "m1", "success": True})
    await exploit_repo.save(session_id, {"host_ip": "10.0.0.6", "module": "m2", "success": False})
    successful = await exploit_repo.get_successful(session_id)
    assert len(successful) == 1
    assert successful[0]["success"] is True


@pytest.mark.asyncio
async def test_exploit_success_flag_deserialized_as_bool(exploit_repo, session_id):
    await exploit_repo.save(session_id, {"host_ip": "10.0.0.5", "module": "m1", "success": True})
    results = await exploit_repo.get_for_session(session_id)
    assert isinstance(results[0]["success"], bool)


# ── 10.8 AuditLogRepository ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_appends(audit_repo, session_id):
    row_id = await audit_repo.log(
        event_type="action",
        session_id=session_id,
        tool_name="nmap_scan",
        target="10.0.0.0/24",
        details={"scan_type": "ping"},
    )
    assert isinstance(row_id, int)
    assert row_id > 0


@pytest.mark.asyncio
async def test_audit_log_get_for_session(audit_repo, session_id):
    await audit_repo.log("action", session_id=session_id, tool_name="nmap_scan")
    await audit_repo.log("safety_block", session_id=session_id, tool_name="metasploit_run")
    entries = await audit_repo.get_for_session(session_id)
    assert len(entries) == 2


@pytest.mark.asyncio
async def test_audit_log_details_deserialized(audit_repo, session_id):
    await audit_repo.log("info", session_id=session_id, details={"key": "value", "count": 3})
    entries = await audit_repo.get_for_session(session_id)
    assert entries[0]["details"]["key"] == "value"
    assert entries[0]["details"]["count"] == 3


@pytest.mark.asyncio
async def test_audit_log_get_recent(audit_repo, session_id):
    await audit_repo.log("action", session_id=session_id)
    await audit_repo.log("action", session_id="other-session")
    recent = await audit_repo.get_recent(limit=10)
    assert len(recent) >= 2


@pytest.mark.asyncio
async def test_audit_log_no_delete_method():
    """Audit log is append-only — no delete method should exist."""
    assert not hasattr(AuditLogRepository, "delete")
    assert not hasattr(AuditLogRepository, "update")


# ── 10.9-10.11 KnowledgeBase ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_kb_remember_success_inserts(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
    count = await kb.count()
    assert count == 1


@pytest.mark.asyncio
async def test_kb_remember_success_increments_count(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
    await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
    await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
    entries = await kb.get_all()
    assert entries[0]["success_count"] == 3
    assert await kb.count() == 1  # still one unique triplet


@pytest.mark.asyncio
async def test_kb_different_triplets_are_separate(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
    await kb.remember_success("smb", "Windows XP", "exploit/windows/smb/ms17_010_eternalblue")
    assert await kb.count() == 2


@pytest.mark.asyncio
async def test_kb_suggest_exploits_returns_results(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
    hints = await kb.suggest_exploits("ftp", "vsftpd 2.3.4")
    assert len(hints) == 1
    assert hints[0]["exploit_module"] == "exploit/unix/ftp/vsftpd_234_backdoor"
    assert hints[0]["success_count"] == 1


@pytest.mark.asyncio
async def test_kb_suggest_exploits_ordered_by_count(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "module_a")
    await kb.remember_success("ftp", "vsftpd 2.3.4", "module_b")
    await kb.remember_success("ftp", "vsftpd 2.3.4", "module_b")  # module_b now has 2
    hints = await kb.suggest_exploits("ftp", "vsftpd 2.3.4")
    assert hints[0]["exploit_module"] == "module_b"
    assert hints[0]["success_count"] == 2


@pytest.mark.asyncio
async def test_kb_suggest_exploits_empty_when_no_match(kb):
    hints = await kb.suggest_exploits("ftp", "vsftpd 2.3.4")
    assert hints == []


@pytest.mark.asyncio
async def test_kb_suggest_exploits_fallback_to_service_only(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "exploit/unix/ftp/vsftpd_234_backdoor")
    # Different version — should still show in service-only fallback
    hints = await kb.suggest_exploits("ftp", "")
    assert len(hints) >= 1


@pytest.mark.asyncio
async def test_kb_suggest_exploits_limit(kb):
    for i in range(10):
        await kb.remember_success("ftp", "vsftpd 2.3.4", f"module_{i}")
    hints = await kb.suggest_exploits("ftp", "vsftpd 2.3.4", limit=3)
    assert len(hints) == 3


@pytest.mark.asyncio
async def test_kb_remember_success_saves_notes(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "some_module", notes="lab only")
    entries = await kb.get_all()
    assert entries[0]["notes"] == "lab only"


@pytest.mark.asyncio
async def test_kb_clear(kb):
    await kb.remember_success("ftp", "vsftpd 2.3.4", "module_a")
    await kb.clear()
    assert await kb.count() == 0


@pytest.mark.asyncio
async def test_kb_get_all_returns_most_used_first(kb):
    await kb.remember_success("smb", "", "module_z")
    await kb.remember_success("ftp", "", "module_a")
    await kb.remember_success("ftp", "", "module_a")  # module_a: 2
    entries = await kb.get_all()
    assert entries[0]["success_count"] >= entries[-1]["success_count"]
