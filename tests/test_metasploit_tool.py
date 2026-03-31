"""
Phase 5 — MetasploitTool tests

All tests run without a real msfrpcd (mocked).
pymetasploit3 import is also mocked.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tools.metasploit_tool import MetasploitTool


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def make_mock_client(session_id=1, payloads=None, modules=None):
    """Fake MsfRpcClient."""
    client = MagicMock()

    known_modules = set(modules or [
        "exploit/unix/ftp/vsftpd_234_backdoor",
        "exploit/multi/handler",
        "exploit/multi/samba/usermap_script",
        "exploit/slow/module",
        "exploit/test",
        "exploit/foo",
    ])

    exploit_mod = MagicMock()
    exploit_mod.targetpayloads.return_value = payloads or ["cmd/unix/interact"]
    exploit_mod.execute.return_value = {"job_id": 1, "session_id": session_id}
    client._exploit_mod = exploit_mod

    def _use(kind, name):
        if kind == "exploit":
            return exploit_mod
        payload_mod = MagicMock()
        payload_mod.name = name
        return payload_mod

    def _search(query):
        if isinstance(query, str) and query.startswith("fullname:"):
            mod = query.split("fullname:", 1)[1].strip()
            return [{"fullname": mod}] if mod in known_modules else []
        return [{"fullname": mod, "name": mod, "rank": "excellent"} for mod in sorted(known_modules)]

    client.modules.use.side_effect = _use
    client.modules.search.side_effect = _search
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

        exploit_mod = client._exploit_mod
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

        exploit_mod = client._exploit_mod
        set_calls = {c[0][0]: c[0][1] for c in exploit_mod.__setitem__.call_args_list}
        assert set_calls.get("LHOST") == "10.0.0.100"

    @pytest.mark.asyncio
    async def test_no_session_returns_failure(self):
        client = make_mock_client(session_id=None)
        client._exploit_mod.execute.return_value = {"job_id": 1, "session_id": None}
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

    @pytest.mark.asyncio
    async def test_module_alias_is_canonicalized_before_run(self):
        client = make_mock_client(modules=["exploit/multi/samba/usermap_script"])
        tool = make_tool(client)

        result = await tool.execute({
            "action": "run",
            "module": "exploit/unix/smb/usermap_script",
            "target_ip": "192.168.1.10",
            "target_port": 139,
        })

        assert result["success"] is True
        assert result["output"]["module"] == "exploit/multi/samba/usermap_script"
        exploit_calls = [c for c in client.modules.use.call_args_list if c[0][0] == "exploit"]
        assert exploit_calls
        assert exploit_calls[0][0][1] == "exploit/multi/samba/usermap_script"

    @pytest.mark.asyncio
    async def test_unknown_module_fails_fast(self):
        client = make_mock_client(modules=["exploit/unix/ftp/vsftpd_234_backdoor"])
        tool = make_tool(client)

        result = await tool.execute({
            "action": "run",
            "module": "exploit/does/not_exist",
            "target_ip": "10.0.0.5",
            "target_port": 445,
        })

        assert result["success"] is False
        assert "not found/unsupported" in result["error"]
        assert result["output"]["reason"] == "module_not_found"

    @pytest.mark.asyncio
    async def test_session_polling_used_when_session_id_missing(self):
        client = make_mock_client(session_id=None)
        client._exploit_mod.execute.return_value = {"job_id": 77, "session_id": None}
        tool = make_tool(client)

        poll_meta = {
            "attempts": 3,
            "timeout_seconds": 15.0,
            "interval_seconds": 0.5,
            "matched": True,
            "reason": "session_matched",
        }
        with patch.object(tool, "_poll_for_session", return_value=(7, poll_meta)) as poll_mock:
            result = await tool.execute({
                "action": "run",
                "module": "exploit/unix/ftp/vsftpd_234_backdoor",
                "target_ip": "192.168.1.10",
                "target_port": 21,
            })

        assert result["success"] is True
        assert result["output"]["session_id"] == 7
        assert result["output"]["session_polling"]["attempts"] == 3
        poll_mock.assert_called_once()

    @pytest.mark.asyncio
    async def test_invalid_payload_falls_back_to_compatible_candidate(self):
        client = make_mock_client(
            session_id=5,
            payloads=["cmd/unix/interact", "cmd/unix/bind_perl"],
        )
        original_use = client.modules.use.side_effect

        def _use(kind, name):
            if kind == "payload" and name == "bad/payload":
                raise RuntimeError("Invalid payload")
            return original_use(kind, name)

        client.modules.use.side_effect = _use
        tool = make_tool(client)

        result = await tool.execute({
            "action": "run",
            "module": "exploit/unix/ftp/vsftpd_234_backdoor",
            "target_ip": "192.168.1.10",
            "target_port": 21,
            "payload": "bad/payload",
        })

        assert result["success"] is True
        assert result["output"]["payload"] != "bad/payload"
        assert any(
            a.get("payload") == "bad/payload" and a.get("error")
            for a in result["output"]["payload_attempts"]
        )

    @pytest.mark.asyncio
    async def test_post_commands_are_included_in_rpc_run_output(self):
        client = make_mock_client(session_id=9)
        tool = make_tool(client)

        with patch.object(
            tool,
            "_run_post_commands_rpc",
            return_value=("$ whoami\nroot\n\n$ id\nuid=0(root)", []),
        ) as post_mock:
            result = await tool.execute({
                "action": "run",
                "module": "exploit/unix/ftp/vsftpd_234_backdoor",
                "target_ip": "192.168.1.10",
                "target_port": 21,
                "post_commands": ["whoami", "id"],
            })

        assert result["success"] is True
        assert "post_command_output" in result["output"]
        assert "uid=0(root)" in result["output"]["post_command_output"]
        post_mock.assert_called_once()


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


class TestMsfconsoleCancellation:
    @pytest.mark.asyncio
    async def test_cancelled_run_terminates_subprocess(self):
        class FakeProc:
            def __init__(self):
                self.terminated = False
                self.killed = False

            async def communicate(self):
                raise asyncio.CancelledError()

            async def wait(self):
                return 0

            def terminate(self):
                self.terminated = True

            def kill(self):
                self.killed = True

        proc = FakeProc()
        tool = MetasploitTool()
        with patch(
            "tools.metasploit_tool.asyncio.create_subprocess_exec",
            new=AsyncMock(return_value=proc),
        ):
            with pytest.raises(asyncio.CancelledError):
                await tool._run_msfconsole(["search vsftpd"], timeout=5)
        assert proc.terminated is True


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
