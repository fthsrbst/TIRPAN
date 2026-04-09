"""Tests for event-based session data recovery helpers."""

from __future__ import annotations

import pytest

from core.session_data_recovery import (
    compute_session_stats,
    derive_session_data_from_events,
    recover_session_findings_from_events,
)
from database.db import init_db
from database.repositories import (
    ExploitResultRepository,
    ScanResultRepository,
    SessionEventRepository,
    SessionRepository,
    VulnerabilityRepository,
)


def test_derive_dedupes_findings_and_uses_port_hint() -> None:
    events = [
        {
            "event_type": "finding",
            "created_at": 1.0,
            "data": {
                "type": "host",
                "ip": "10.0.0.5",
                "ports": [
                    {"number": 21, "state": "open", "service": "ftp", "protocol": "tcp"},
                    {"number": 22, "state": "open", "service": "ssh", "protocol": "tcp"},
                    {"number": 445, "state": "open", "service": "smb", "protocol": "tcp"},
                ],
            },
        },
        {
            "event_type": "finding",
            "created_at": 1.1,
            "data": {
                "type": "host",
                "ip": "10.0.0.5",
                "target": "10.0.0.5",
                "ports": [
                    {"number": 21, "state": "open", "service": "ftp", "protocol": "tcp"},
                    {"number": 22, "state": "open", "service": "ssh", "protocol": "tcp"},
                    {"number": 445, "state": "open", "service": "smb", "protocol": "tcp"},
                ],
            },
        },
        {
            "event_type": "finding",
            "created_at": 1.2,
            "data": {
                "type": "port_scan",
                "host": "10.0.0.5",
                "open_ports": 2,
            },
        },
    ]

    derived = derive_session_data_from_events(events, target="10.0.0.5")
    assert len(derived["scan_results"]) == 1
    hosts = derived["scan_results"][0]["hosts"]
    assert len(hosts) == 1
    assert hosts[0]["ip"] == "10.0.0.5"
    assert len(hosts[0]["ports"]) == 3

    stats = compute_session_stats(
        derived["scan_results"],
        derived["vulnerabilities"],
        derived["exploit_results"],
        port_hint_total=derived["port_hint_total"],
        hinted_hosts=derived["hinted_hosts"],
    )
    # Hint says 2 open ports, raw host finding contains 3: use conservative hint.
    assert stats["ports_found"] == 2


@pytest.mark.asyncio
async def test_recover_persists_missing_rows_and_updates_stats(tmp_path) -> None:
    db_path = tmp_path / "recovery_test.db"
    await init_db(db_path)

    session_repo = SessionRepository(db_path)
    scan_repo = ScanResultRepository(db_path)
    vuln_repo = VulnerabilityRepository(db_path)
    exploit_repo = ExploitResultRepository(db_path)
    event_repo = SessionEventRepository(db_path)

    session = await session_repo.create("192.168.56.101", "v2_auto", session_id="recovery-session-001")
    sid = session["id"]

    await event_repo.save(sid, "finding", {
        "type": "host",
        "ip": "192.168.56.101",
        "ports": [
            {"number": 21, "state": "open", "service": "ftp", "protocol": "tcp"},
            {"number": 22, "state": "open", "service": "ssh", "protocol": "tcp"},
        ],
    })
    await event_repo.save(sid, "finding", {
        "type": "port_scan",
        "host": "192.168.56.101",
        "open_ports": 2,
    })
    await event_repo.save(sid, "finding", {
        "type": "vulnerability",
        "host_ip": "192.168.56.101",
        "title": "vsftpd 2.3.4 Backdoor",
        "service": "ftp",
        "cvss": 10.0,
        "cve_id": "CVE-2011-2523",
    })
    await event_repo.save(sid, "finding", {
        "type": "exploit_attempt",
        "host_ip": "192.168.56.101",
        "module": "exploit/unix/ftp/vsftpd_234_backdoor",
        "success": False,
        "error": "session not opened",
    })

    recovered = await recover_session_findings_from_events(
        session_id=sid,
        target="192.168.56.101",
        session_repo=session_repo,
        scan_repo=scan_repo,
        vuln_repo=vuln_repo,
        exploit_repo=exploit_repo,
        event_repo=event_repo,
        persist=True,
    )

    assert recovered["inserted"]["scan_results"] == 1
    assert recovered["inserted"]["vulnerabilities"] == 1
    assert recovered["inserted"]["exploit_results"] == 1

    stats = recovered["stats"]
    assert stats["hosts_found"] == 1
    assert stats["ports_found"] == 2
    assert stats["vulns_found"] == 1
    assert stats["exploits_run"] == 1

    updated = await session_repo.get(sid)
    assert int(updated["hosts_found"]) == 1
    assert int(updated["ports_found"]) == 2
    assert int(updated["vulns_found"]) == 1
    assert int(updated["exploits_run"]) == 1
