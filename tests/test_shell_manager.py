"""Tests for core/shell_manager.py — ShellManager service layer."""

from __future__ import annotations

import asyncio
import pytest

from core.shell_manager import ShellManager, ShellSession


# ── Helpers ───────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class FakeShellTool:
    """Minimal fake of ShellSessionTool for testing."""

    def __init__(self, connect_ok: bool = True, exec_ok: bool = True):
        self.connect_ok = connect_ok
        self.exec_ok = exec_ok
        self.calls: list[dict] = []

    async def execute(self, params: dict) -> dict:
        self.calls.append(params)
        action = params.get("action")
        if action == "connect":
            if self.connect_ok:
                return {"status": "success", "session_key": "tool-key-001"}
            return {"status": "error", "error": "connection refused"}
        if action == "exec":
            if self.exec_ok:
                return {"status": "success", "output": f"output of {params.get('command')}"}
            return {"status": "error", "error": "exec failed"}
        if action == "exec_script":
            return {"status": "success", "outputs": ["ok1", "ok2"]}
        if action == "close":
            return {"status": "success"}
        return {"status": "error", "error": "unknown action"}


class FakeMsfTool:
    """Minimal fake of MetasploitTool."""

    def __init__(self, exploit_ok: bool = True, session_exec_ok: bool = True):
        self.exploit_ok = exploit_ok
        self.session_exec_ok = session_exec_ok
        self.calls: list[dict] = []

    async def execute(self, params: dict) -> dict:
        self.calls.append(params)
        action = params.get("action")
        if action == "run":
            if self.exploit_ok:
                return {"status": "success", "session_id": 1,
                        "output": "exploit succeeded", "session_opened": 1}
            return {"status": "error", "error": "exploit failed"}
        if action == "session_exec":
            if self.session_exec_ok:
                return {"status": "success", "output": "uid=0(root)"}
            return {"status": "error", "error": "session dead"}
        if action == "sessions":
            return {"sessions": {"1": {"type": "meterpreter", "info": "root@host"}}}
        return {"status": "error", "error": "unknown action"}


def make_manager(connect_ok=True, exec_ok=True, exploit_ok=True, msf_exec_ok=True):
    shell_tool = FakeShellTool(connect_ok=connect_ok, exec_ok=exec_ok)
    msf_tool = FakeMsfTool(exploit_ok=exploit_ok, session_exec_ok=msf_exec_ok)
    mgr = ShellManager(shell_tool=shell_tool, msf_tool=msf_tool)
    return mgr, shell_tool, msf_tool


# ── ShellSession dataclass ────────────────────────────────────────────────────

class TestShellSession:
    def test_defaults(self):
        s = ShellSession(shell_key="k1", session_type="ssh", host_ip="10.0.0.1")
        assert s.status == "active"
        assert s.privilege_level == 0
        assert s.closed_at is None

    def test_to_dict(self):
        s = ShellSession(shell_key="k1", session_type="ssh",
                          host_ip="10.0.0.1", username="root", privilege_level=1)
        d = s.to_dict()
        assert d["shell_key"] == "k1"
        assert d["session_type"] == "ssh"
        assert d["username"] == "root"
        assert d["privilege_level"] == 1
        # Internal fields not exposed
        assert "_tool_key" not in d
        assert "_msf_session_id" not in d


# ── open_shell ────────────────────────────────────────────────────────────────

class TestOpenShell:
    def test_open_ssh_success(self):
        mgr, shell_tool, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1", username="root", password="x"))
        assert key is not None
        assert len(key) == 36  # UUID
        assert mgr.get_session(key) is not None
        assert mgr.get_session(key).session_type == "ssh"

    def test_open_shell_registers_in_sessions(self):
        mgr, _, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        assert key in [s.shell_key for s in mgr.list_sessions()]

    def test_open_shell_failure_raises(self):
        mgr, _, _ = make_manager(connect_ok=False)
        with pytest.raises(RuntimeError, match="Failed to open"):
            run(mgr.open_shell("bind", "10.0.0.1", port=4444))

    def test_open_shell_no_tool_raises(self):
        mgr = ShellManager(shell_tool=None)
        with pytest.raises(RuntimeError, match="ShellSessionTool not configured"):
            run(mgr.open_shell("ssh", "10.0.0.1"))

    def test_multiple_sessions_different_keys(self):
        mgr, _, _ = make_manager()
        k1 = run(mgr.open_shell("ssh", "10.0.0.1"))
        k2 = run(mgr.open_shell("ssh", "10.0.0.2"))
        assert k1 != k2

    def test_open_shell_passes_params_to_tool(self):
        mgr, shell_tool, _ = make_manager()
        run(mgr.open_shell("ssh", "10.0.0.1", port=22, username="admin", password="pw"))
        call = shell_tool.calls[-1]
        assert call["action"] == "connect"
        assert call["method"] == "ssh"
        assert call["host"] == "10.0.0.1"
        assert call["username"] == "admin"


# ── adopt_msf_session ────────────────────────────────────────────────────────

class TestAdoptMsfSession:
    def test_adopt_registers_session(self):
        mgr, _, _ = make_manager()
        key = run(mgr.adopt_msf_session(1, "10.0.0.1", username="root", privilege_level=1))
        s = mgr.get_session(key)
        assert s is not None
        assert s.session_type == "meterpreter"
        assert s._msf_session_id == 1
        assert s.privilege_level == 1

    def test_adopt_multiple_sessions(self):
        mgr, _, _ = make_manager()
        k1 = run(mgr.adopt_msf_session(1, "10.0.0.1"))
        k2 = run(mgr.adopt_msf_session(2, "10.0.0.2"))
        assert k1 != k2
        assert len(mgr.list_sessions()) == 2


# ── exec ──────────────────────────────────────────────────────────────────────

class TestExec:
    def test_exec_ssh_success(self):
        mgr, _, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        result = run(mgr.exec(key, "whoami"))
        assert result["status"] == "success"
        assert "whoami" in result["output"]

    def test_exec_meterpreter_success(self):
        mgr, _, msf_tool = make_manager()
        key = run(mgr.adopt_msf_session(1, "10.0.0.1"))
        result = run(mgr.exec(key, "getuid"))
        assert result["status"] == "success"
        assert "root" in result["output"]
        assert any(c["action"] == "session_exec" for c in msf_tool.calls)

    def test_exec_unknown_key_returns_error(self):
        mgr, _, _ = make_manager()
        result = run(mgr.exec("nonexistent-key", "whoami"))
        assert result["status"] == "error"
        assert "Unknown shell_key" in result["error"]

    def test_exec_failed_shell_returns_error(self):
        mgr, _, _ = make_manager(exec_ok=False)
        key = run(mgr.open_shell("bind", "10.0.0.1"))
        result = run(mgr.exec(key, "id"))
        assert result["status"] == "error"

    def test_exec_closed_session_returns_error(self):
        mgr, _, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        run(mgr.close(key))
        # Session was removed on close
        result = run(mgr.exec(key, "id"))
        assert result["status"] == "error"

    def test_exec_msf_no_tool_returns_error(self):
        mgr = ShellManager(shell_tool=None, msf_tool=None)
        # Manually inject a session
        import uuid
        key = str(uuid.uuid4())
        mgr._sessions[key] = ShellSession(
            shell_key=key, session_type="meterpreter",
            host_ip="10.0.0.1", _msf_session_id=1
        )
        result = run(mgr.exec(key, "id"))
        assert result["status"] == "error"
        assert "not configured" in result["error"]


# ── exec_script ───────────────────────────────────────────────────────────────

class TestExecScript:
    def test_exec_script_runs_all_commands(self):
        mgr, _, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        results = run(mgr.exec_script(key, ["id", "whoami", "hostname"]))
        assert len(results) == 3
        assert all(r["status"] == "success" for r in results)

    def test_exec_script_stops_on_failure(self):
        mgr, _, _ = make_manager(exec_ok=False)
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        results = run(mgr.exec_script(key, ["id", "whoami", "hostname"]))
        # Should stop after first failure
        assert len(results) == 1
        assert results[0]["status"] == "error"

    def test_exec_script_includes_command_in_result(self):
        mgr, _, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        results = run(mgr.exec_script(key, ["uname -a"]))
        assert results[0]["command"] == "uname -a"


# ── run_exploit ───────────────────────────────────────────────────────────────

class TestRunExploit:
    def test_run_exploit_success(self):
        mgr, _, msf_tool = make_manager()
        result = run(mgr.run_exploit(
            "exploit/unix/ftp/vsftpd_234_backdoor",
            "10.0.0.1", 21,
        ))
        assert result["status"] == "success"
        assert any(c["action"] == "run" for c in msf_tool.calls)

    def test_run_exploit_no_tool_returns_error(self):
        mgr = ShellManager(msf_tool=None)
        result = run(mgr.run_exploit("exploit/test", "10.0.0.1", 80))
        assert result["status"] == "error"
        assert "not configured" in result["error"]

    def test_run_exploit_failure_returned(self):
        mgr, _, _ = make_manager(exploit_ok=False)
        result = run(mgr.run_exploit("exploit/test", "10.0.0.1", 80))
        assert result["status"] == "error"

    def test_run_exploit_serialised(self):
        """Two concurrent exploit calls should both complete (semaphore)."""
        mgr, _, _ = make_manager()

        async def do_both():
            r1, r2 = await asyncio.gather(
                mgr.run_exploit("exploit/a", "10.0.0.1", 21),
                mgr.run_exploit("exploit/b", "10.0.0.2", 22),
            )
            return r1, r2

        r1, r2 = run(do_both())
        assert r1["status"] == "success"
        assert r2["status"] == "success"


# ── list_msf_sessions ─────────────────────────────────────────────────────────

class TestListMsfSessions:
    def test_returns_sessions_dict(self):
        mgr, _, _ = make_manager()
        sessions = run(mgr.list_msf_sessions())
        assert isinstance(sessions, dict)
        assert "1" in sessions

    def test_no_tool_returns_empty(self):
        mgr = ShellManager(msf_tool=None)
        sessions = run(mgr.list_msf_sessions())
        assert sessions == {}


# ── close ─────────────────────────────────────────────────────────────────────

class TestClose:
    def test_close_removes_session(self):
        mgr, _, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        assert mgr.get_session(key) is not None
        result = run(mgr.close(key))
        assert result is True
        assert mgr.get_session(key) is None

    def test_close_unknown_key_returns_false(self):
        mgr, _, _ = make_manager()
        result = run(mgr.close("nonexistent"))
        assert result is False

    def test_close_all(self):
        mgr, _, _ = make_manager()
        run(mgr.open_shell("ssh", "10.0.0.1"))
        run(mgr.open_shell("ssh", "10.0.0.2"))
        assert len(mgr.list_sessions()) == 2
        run(mgr.close_all())
        assert len(mgr.list_sessions()) == 0

    def test_close_calls_shell_tool(self):
        mgr, shell_tool, _ = make_manager()
        key = run(mgr.open_shell("ssh", "10.0.0.1"))
        run(mgr.close(key))
        assert any(c["action"] == "close" for c in shell_tool.calls)

    def test_close_meterpreter_does_not_call_shell_tool(self):
        mgr, shell_tool, _ = make_manager()
        key = run(mgr.adopt_msf_session(1, "10.0.0.1"))
        run(mgr.close(key))
        # No close action should be sent to shell_tool for meterpreter sessions
        assert not any(c["action"] == "close" for c in shell_tool.calls)


# ── Query methods ─────────────────────────────────────────────────────────────

class TestQueries:
    def test_has_active_session(self):
        mgr, _, _ = make_manager()
        assert mgr.has_active_session("10.0.0.1") is False
        run(mgr.open_shell("ssh", "10.0.0.1"))
        assert mgr.has_active_session("10.0.0.1") is True

    def test_list_sessions_for_host(self):
        mgr, _, _ = make_manager()
        run(mgr.open_shell("ssh", "10.0.0.1"))
        run(mgr.open_shell("ssh", "10.0.0.2"))
        host_sessions = mgr.list_sessions_for_host("10.0.0.1")
        assert len(host_sessions) == 1
        assert host_sessions[0].host_ip == "10.0.0.1"

    def test_get_best_session_returns_highest_privilege(self):
        mgr, _, _ = make_manager()
        k1 = run(mgr.open_shell("ssh", "10.0.0.1"))
        k2 = run(mgr.open_shell("ssh", "10.0.0.1"))
        mgr._sessions[k1].privilege_level = 0
        mgr._sessions[k2].privilege_level = 1
        best = mgr.get_best_session("10.0.0.1")
        assert best.privilege_level == 1

    def test_get_best_session_no_sessions_returns_none(self):
        mgr, _, _ = make_manager()
        assert mgr.get_best_session("10.0.0.99") is None

    def test_stats(self):
        mgr, _, _ = make_manager()
        run(mgr.open_shell("ssh", "10.0.0.1"))
        run(mgr.adopt_msf_session(1, "10.0.0.2"))
        s = mgr.stats()
        assert s["total"] == 2
        assert s["active"] == 2
        assert s["by_type"]["ssh"] == 1
        assert s["by_type"]["meterpreter"] == 1
