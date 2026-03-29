"""
Shared pytest fixtures for the TIRPAN test suite.

Provides:
  - mock_llm_router       : LLMRouter stub that returns deterministic JSON
  - mock_registry         : ToolRegistry with three mocked tools
  - basic_safety          : SafetyGuard allowing all actions on 10.0.0.0/8
  - scan_only_safety      : SafetyGuard in scan-only mode
  - test_session          : Minimal Session fixture
  - tmp_db                : Temporary aiosqlite database path (cleaned up after test)
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from config import SafetyConfig
from core.safety import SafetyGuard
from core.tool_registry import ToolRegistry
from models.session import Session


# ── LLM stubs ─────────────────────────────────────────────────────────────────

_NMAP_ACTION = json.dumps({
    "thought": "No hosts found yet. Starting ping sweep.",
    "reasoning": "Host discovery is always the first step.",
    "action": "nmap_scan",
    "parameters": {"target": "10.0.0.1", "scan_type": "ping"},
})

_REPORT_ACTION = json.dumps({
    "thought": "Scan complete. Generating report.",
    "reasoning": "All phases finished.",
    "action": "generate_report",
    "parameters": {},
})


@pytest.fixture
def mock_llm_router():
    """LLMRouter that returns a deterministic nmap action then generate_report."""
    router = MagicMock()
    call_count = {"n": 0}

    async def _chat(messages, stream=False):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return _NMAP_ACTION
        return _REPORT_ACTION

    router.chat = _chat
    router.parse_json = staticmethod(json.loads)
    return router


# ── Tool Registry stub ─────────────────────────────────────────────────────────

def _make_tool_stub(name: str, description: str = "") -> MagicMock:
    tool = MagicMock()
    meta = MagicMock()
    meta.name = name
    meta.description = description or f"Mock tool: {name}"
    meta.parameters = {}
    tool.metadata = meta
    tool.execute = AsyncMock(return_value={"success": True, "output": {}, "error": None})
    tool.validate = AsyncMock(return_value=(True, ""))
    return tool


@pytest.fixture
def mock_registry() -> ToolRegistry:
    """ToolRegistry pre-loaded with mocked nmap, searchsploit and metasploit tools."""
    registry = ToolRegistry()
    registry.register(_make_tool_stub("nmap_scan", "Port scan via Nmap"))
    registry.register(_make_tool_stub("searchsploit_search", "Search ExploitDB"))
    registry.register(_make_tool_stub("metasploit_run", "Run Metasploit exploit"))
    return registry


# ── Safety fixtures ────────────────────────────────────────────────────────────

@pytest.fixture
def basic_safety() -> SafetyGuard:
    """SafetyGuard that allows all actions within 10.0.0.0/8."""
    return SafetyGuard(SafetyConfig(allowed_cidr="10.0.0.0/8", allow_exploit=True))


@pytest.fixture
def scan_only_safety() -> SafetyGuard:
    """SafetyGuard in scan-only mode (no exploitation)."""
    return SafetyGuard(SafetyConfig(allowed_cidr="0.0.0.0/0", allow_exploit=False))


# ── Session fixture ────────────────────────────────────────────────────────────

@pytest.fixture
def test_session() -> Session:
    return Session(id=str(uuid.uuid4()), target="10.0.0.1", mode="scan_only")


@pytest.fixture
def full_auto_session() -> Session:
    return Session(id=str(uuid.uuid4()), target="10.0.0.1", mode="full_auto")


# ── Database fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
async def tmp_db(tmp_path: Path):
    """
    Initialise a fresh SQLite DB in a temp directory and point the global
    DB_PATH at it for the duration of the test, then restore the original.
    """
    import database.db as db_module

    db_path = tmp_path / "test_tirpan.db"
    original = db_module.DB_PATH

    db_module.DB_PATH = db_path
    await db_module.init_db(db_path)

    yield db_path

    db_module.DB_PATH = original
    if db_path.exists():
        db_path.unlink()


# ── Misc helpers ───────────────────────────────────────────────────────────────

@pytest.fixture
def anyio_backend():
    return "asyncio"
