"""
Phase 14 — Web API integration tests.

Uses FastAPI TestClient (synchronous) and AsyncClient (async) to exercise
the REST endpoints without starting a real server.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

# ── App fixture ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def app() -> FastAPI:
    """Build the FastAPI app with a real (temp) SQLite DB."""
    import asyncio
    import tempfile
    import database.db as db_module
    from core.tool_registry import ToolRegistry
    from web.app import create_app  # we'll add this helper below if missing

    tmp = tempfile.mkdtemp()
    db_path = Path(tmp) / "test.db"
    original = db_module.DB_PATH
    db_module.DB_PATH = db_path
    asyncio.run(db_module.init_db(db_path))

    with (
        patch("web.app._start_msfrpcd", new=AsyncMock(return_value=None)),
        patch("web.app.build_tool_registry", return_value=ToolRegistry()),
    ):
        application = create_app()
        yield application

    db_module.DB_PATH = original


@pytest.fixture(scope="module")
def client(app: FastAPI) -> TestClient:
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ── Health ─────────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_ok(self, client: TestClient):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert "version" in data


# ── Sessions ──────────────────────────────────────────────────────────────────

class TestSessions:
    def test_list_sessions_empty(self, client: TestClient):
        r = client.get("/api/v1/sessions")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_start_session_invalid_mode(self, client: TestClient):
        r = client.post(
            "/api/v1/sessions",
            json={"target": "10.0.0.1", "mode": "invalid_mode"},
        )
        assert r.status_code == 400

    def test_get_nonexistent_session(self, client: TestClient):
        r = client.get(f"/api/v1/sessions/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_start_and_get_session(self, client: TestClient):
        """Start a session and verify it appears in the list."""
        with (
            patch("web.routes._run_agent_task", new_callable=AsyncMock),
            patch("core.agent.PentestAgent"),
        ):
            r = client.post(
                "/api/v1/sessions",
                json={"target": "10.0.0.1", "mode": "scan_only"},
            )
        assert r.status_code in (200, 201)
        data = r.json()
        session_id = data.get("id") or data.get("session_id")
        assert session_id is not None

        # Should be in list
        r2 = client.get("/api/v1/sessions")
        assert any(s["id"] == session_id for s in r2.json())

        # Direct GET
        r3 = client.get(f"/api/v1/sessions/{session_id}")
        assert r3.status_code == 200
        assert r3.json()["id"] == session_id

    def test_kill_nonexistent_session(self, client: TestClient):
        r = client.post(f"/api/v1/sessions/{uuid.uuid4()}/kill")
        assert r.status_code == 404


# ── Config endpoints ──────────────────────────────────────────────────────────

class TestConfig:
    def test_get_safety_config(self, client: TestClient):
        r = client.get("/api/v1/config/safety")
        assert r.status_code == 200
        data = r.json()
        # Must have at least the core safety fields
        assert "allow_exploits" in data or "allow_exploit" in data or "scope" in data

    def test_post_safety_config(self, client: TestClient):
        payload = {
            "scope": "10.0.0.0/8",
            "port_min": 1,
            "port_max": 65535,
            "excluded_ips": "",
            "excluded_ports": "",
            "allow_exploits": False,
            "block_dos": True,
            "block_destructive": True,
            "max_severity": "CRITICAL",
            "time_limit": 0,
            "rate_limit": 10,
        }
        r = client.post("/api/v1/config/safety", json=payload)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_branding_config_roundtrip(self, client: TestClient):
        r = client.post("/api/v1/config/branding", json={"company_name": "Acme Security"})
        assert r.status_code == 200
        assert r.json().get("company_name") == "Acme Security"

        r2 = client.get("/api/v1/config/branding")
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("company_name") == "Acme Security"
        assert data.get("has_logo") is False

    def test_branding_upload_rejects_invalid_image(self, client: TestClient):
        files = {
            "file": ("bad.png", b"not-an-image", "image/png"),
        }
        r = client.post("/api/v1/config/branding/upload", files=files)
        assert r.status_code == 400

    def test_branding_logo_upload_and_delete(self, client: TestClient):
        # Valid PNG signature is enough for this route-level validation.
        png_bytes = b"\x89PNG\r\n\x1a\n" + (b"\x00" * 48)
        files = {
            "file": ("logo.png", png_bytes, "image/png"),
        }

        up = client.post("/api/v1/config/branding/upload", files=files)
        assert up.status_code == 200
        up_data = up.json()
        assert up_data.get("ok") is True
        assert up_data.get("logo_file")
        assert up_data.get("logo_url", "").startswith("/api/v1/branding/")

        cfg = client.get("/api/v1/config/branding")
        assert cfg.status_code == 200
        cfg_data = cfg.json()
        assert cfg_data.get("has_logo") is True
        assert cfg_data.get("logo_url", "").startswith("/api/v1/branding/")

        logo_resp = client.get(cfg_data["logo_url"])
        assert logo_resp.status_code == 200
        assert logo_resp.headers.get("content-type", "").startswith("image/png")

        rm = client.delete("/api/v1/config/branding/logo")
        assert rm.status_code == 200
        assert rm.json().get("ok") is True

        cfg2 = client.get("/api/v1/config/branding")
        assert cfg2.status_code == 200
        assert cfg2.json().get("has_logo") is False


# ── Audit log ─────────────────────────────────────────────────────────────────

class TestAudit:
    def test_audit_returns_list(self, client: TestClient):
        r = client.get("/api/v1/audit")
        assert r.status_code == 200
        data = r.json()
        assert "entries" in data
        assert isinstance(data["entries"], list)


# ── System stats ──────────────────────────────────────────────────────────────

class TestStats:
    def test_system_stats(self, client: TestClient):
        r = client.get("/api/v1/system/stats")
        assert r.status_code == 200
        data = r.json()
        assert "cpu_percent" in data or "cpu" in data or "ram" in data
