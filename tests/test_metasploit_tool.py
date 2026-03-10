"""
Phase 5 — MetasploitTool tests

All tests run without a real msfrpcd (mocked).
pymetasploit3 import is also mocked.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

from tools.metasploit_tool import MetasploitTool
from models.exploit_result import ExploitResult


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def make_mock_client(session_id=1, payloads=None):
    """Fake MsfRpcClient."""
    client = MagicMock()

    exploit_mod = MagicMock()
    exploit_mod.targetpayloads.return_value = payloads or ["cmd/unix/interact"]
    exploit_mod.execute.return_value = {"job_id": 1, "session_id": session_id}
    client.modules.use.return_value = exploit_mod

    client.modules.search.return_value = [
        {"name": "exploit/unix/ftp/vsftpd_234_backdoor", "rank": "excellent"}
    ]
    client.sessions.list = {1: {"type": "shell", "tunnel_peer": "192.168.1.1:21"}}
    return client


def make_tool(client=None, connected=True) -> MetasploitTool:
    tool = MetasploitTool()
    if connected:
        tool._client = client or make_mock_client()
    return tool


# ------------------------------------------------------------------
# 5.2 — Metadata
# ------------------------------------------------------------------

class TestMetadata:
    def test_name(self):
        assert MetasploitTool().metadata.name == "metasploit_run"

    def test_category(self):
        assert MetasploitTool().metadata.category == "exploit-exec"

    def test_actions_in_parameters(self):
        params = MetasploitTool().metadata.parameters
        assert "action" in params["properties"]


# ------------------------------------------------------------------
# 5.5 — Option setting + exploit execution
# ------------------------------------------------------------------

class TestRunExploit:
    @pytest.mark.asyncio
    async def test_successful_exploit_returns_session(self):
        client = make_mock_client(session_id=3)
        tool = make_tool(client)

        result = await tool.execute({
            "action": "run",
            "module": "exploit/unix/ftp/vsftpd_234_backdoor",
            "target_ip": "192.168.1.10",
            "target_port": 21,
            "payload": "cmd/unix/interact",
        })

        assert result["success"] is True
        assert result["output"]["session_id"] == 3
        assert result["error"] is None

    @pytest.mark.asyncio
    async def test_exploit_sets_rhosts_and_rport(self):
        client = make_mock_client()
        tool = make_tool(client)

        await tool.execute({
            "action": "run",
            "module": "exploit/unix/ftp/vsftpd_234_backdoor",
            "target_ip": "10.0.0.5",
            "target_port": 21,
        })

        exploit_mod = client.modules.use.return_value
        assert exploit_mod.__setitem__.call_args_list[0][0] == ("RHOSTS", "10.0.0.5")
        assert exploit_mod.__setitem__.call_args_list[1][0] == ("RPORT", 21)

    @pytest.mark.asyncio
    async def test_extra_options_applied(self):
        client = make_mock_client()
        tool = make_tool(client)

        await tool.execute({
            "action": "run",
            "module": "exploit/multi/handler",
            "target_ip": "10.0.0.1",
            "target_port": 4444,
            "options": {"LHOST": "10.0.0.100"},
        })

        exploit_mod = client.modules.use.return_value
        set_calls = {c[0][0]: c[0][1] for c in exploit_mod.__setitem__.call_args_list}
        assert set_calls.get("LHOST") == "10.0.0.100"

    @pytest.mark.asyncio
    async def test_no_session_returns_failure(self):
        client = make_mock_client(session_id=None)
        client.modules.use.return_value.execute.return_value = {"job_id": 1, "session_id": None}
        tool = make_tool(client)

        result = await tool.execute({
            "action": "run",
            "module": "exploit/unix/ftp/vsftpd_234_backdoor",
            "target_ip": "192.168.1.10",
            "target_port": 21,
        })

        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_auto_payload_selection(self):
        """If no payload is specified, the first compatible payload should be selected."""
        client = make_mock_client(payloads=["cmd/unix/interact", "generic/shell_reverse_tcp"])
        tool = make_tool(client)

        result = await tool.execute({
            "action": "run",
            "module": "exploit/unix/ftp/vsftpd_234_backdoor",
            "target_ip": "192.168.1.10",
            "target_port": 21,
        })

        assert result["success"] is True
        assert result["output"]["payload"] == "cmd/unix/interact"


# ------------------------------------------------------------------
# 5.4 — Module search
# ------------------------------------------------------------------

class TestSearchModules:
    @pytest.mark.asyncio
    async def test_search_returns_modules(self):
        tool = make_tool()

        result = await tool.execute({"action": "search", "query": "vsftpd"})

        assert result["success"] is True
        assert len(result["output"]["modules"]) >= 1
        assert result["output"]["query"] == "vsftpd"


# ------------------------------------------------------------------
# 5.7 — Session management
# ------------------------------------------------------------------

class TestSessions:
    @pytest.mark.asyncio
    async def test_list_sessions(self):
        tool = make_tool()

        result = await tool.execute({"action": "sessions"})

        assert result["success"] is True
        assert result["output"]["count"] == 1
        assert 1 in result["output"]["sessions"]


# ------------------------------------------------------------------
# 5.8 — Timeout
# ------------------------------------------------------------------

class TestTimeout:
    @pytest.mark.asyncio
    async def test_exploit_timeout(self):
        import asyncio as _asyncio
        client = make_mock_client()

        async def slow_run(*args, **kwargs):
            raise _asyncio.TimeoutError()

        tool = MetasploitTool()
        tool._client = client
        tool._run_exploit = slow_run

        result = await tool.execute({
            "action": "run",
            "module": "exploit/slow/module",
            "target_ip": "10.0.0.1",
            "target_port": 4444,
        })

        assert result["success"] is False
        assert "timed out" in result["error"].lower() or result["error"] is not None


# ------------------------------------------------------------------
# 5.9 — Connection error
# ------------------------------------------------------------------

class TestConnectionError:
    @pytest.mark.asyncio
    async def test_connection_failure(self):
        tool = MetasploitTool()

        async def fail_connect():
            raise ConnectionRefusedError("msfrpcd is not running")

        tool._get_client = fail_connect

        result = await tool.execute({
            "action": "run",
            "module": "exploit/test",
            "target_ip": "10.0.0.1",
            "target_port": 4444,
        })

        assert result["success"] is False
        assert result["error"] is not None

    @pytest.mark.asyncio
    async def test_is_available_false_when_no_server(self):
        tool = MetasploitTool()
        tool._connect = MagicMock(side_effect=ConnectionRefusedError)

        available = await tool.is_available()
        assert available is False


# ------------------------------------------------------------------
# Validation
# ------------------------------------------------------------------

class TestValidation:
    @pytest.mark.asyncio
    async def test_invalid_action_fails(self):
        tool = make_tool()
        result = await tool.execute({"action": "hack"})
        assert result["success"] is False
        assert "action" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_run_without_module_fails(self):
        tool = make_tool()
        result = await tool.execute({"action": "run", "target_ip": "10.0.0.1", "target_port": 21})
        assert result["success"] is False
        assert "module" in result["error"]

    @pytest.mark.asyncio
    async def test_run_without_target_fails(self):
        tool = make_tool()
        result = await tool.execute({"action": "run", "module": "exploit/test", "target_port": 21})
        assert result["success"] is False
