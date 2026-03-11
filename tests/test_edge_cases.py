"""
Phase 14.8 — Edge Case Tests

Covers:
  - Target host is offline (nmap returns no results)
  - LLM call times out (asyncio.TimeoutError)
  - LLM returns malformed / non-JSON response
  - LLM raises a generic network error (connection refused)
  - Safety guard blocks the action (scope violation)
  - Kill switch mid-run halts the agent immediately
  - Max iterations guard prevents infinite loops
  - Tool raises an unexpected exception during execution
  - Empty tool output (success=False, output=None)
  - Agent reaches generate_report immediately with no findings
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config import SafetyConfig
from core.agent import AgentContext, AgentState, PentestAgent
from core.safety import SafetyGuard
from core.tool_registry import ToolRegistry
from models.session import Session


# ── Helpers ────────────────────────────────────────────────────────────────────

def _session(mode: str = "scan_only") -> Session:
    return Session(id="edge-test-001", target="10.0.0.5", mode=mode)


def _safety(allow_exploit: bool = False, cidr: str = "10.0.0.0/8") -> SafetyGuard:
    return SafetyGuard(SafetyConfig(allowed_cidr=cidr, allow_exploit=allow_exploit))


def _registry() -> ToolRegistry:
    registry = ToolRegistry()
    for name in ("nmap_scan", "searchsploit_search", "metasploit_run"):
        tool = MagicMock()
        meta = MagicMock()
        meta.name = name
        meta.description = f"Mock {name}"
        meta.parameters = {"type": "object", "properties": {}}
        tool.metadata = meta
        tool.execute = AsyncMock(return_value={"success": True, "output": {}, "error": None})
        tool.validate = AsyncMock(return_value=(True, ""))
        # to_llm_dict must return a plain dict — not a MagicMock
        tool.to_llm_dict = MagicMock(return_value={
            "name": name,
            "description": f"Mock {name}",
            "parameters": {"type": "object", "properties": {}},
        })
        registry.register(tool)
    return registry


def _action(tool: str = "nmap_scan", params: dict | None = None) -> str:
    return json.dumps({
        "thought": "test thought",
        "reasoning": "test reasoning",
        "action": tool,
        "parameters": params or {"target": "10.0.0.5", "scan_type": "ping"},
    })


def _report_action() -> str:
    return json.dumps({
        "thought": "done",
        "reasoning": "wrapping up",
        "action": "generate_report",
        "parameters": {},
    })


def _llm_sequence(*responses) -> MagicMock:
    """Return a mock LLM router that yields responses in order, then repeats the last."""
    resp_list = list(responses)
    idx = {"i": 0}

    async def _chat(messages, stream=False):
        pos = min(idx["i"], len(resp_list) - 1)
        idx["i"] += 1
        val = resp_list[pos]
        if isinstance(val, Exception):
            raise val
        return val

    router = MagicMock()
    router.chat = _chat
    return router


# ── Edge Case: target offline ──────────────────────────────────────────────────

class TestTargetOffline:
    async def test_no_hosts_discovered(self):
        """Nmap returns empty hosts list — agent should continue gracefully."""
        registry = _registry()
        nmap = registry.get("nmap_scan")
        nmap.execute = AsyncMock(return_value={
            "success": True,
            "output": {"hosts": []},
            "error": None,
        })

        llm = _llm_sequence(
            _action("nmap_scan", {"target": "10.0.0.5", "scan_type": "ping"}),
            _report_action(),
        )

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=_safety(),
            llm=llm,
            max_iterations=5,
        )
        ctx = await agent.run()

        assert len(ctx.discovered_hosts) == 0
        assert ctx.total_vulns == 0

    async def test_nmap_returns_error(self):
        """Nmap tool returns success=False — agent should handle without crashing."""
        registry = _registry()
        nmap = registry.get("nmap_scan")
        nmap.execute = AsyncMock(return_value={
            "success": False,
            "output": None,
            "error": "Host unreachable",
        })

        llm = _llm_sequence(
            _action("nmap_scan", {"target": "10.0.0.5", "scan_type": "ping"}),
            _report_action(),
        )

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=_safety(),
            llm=llm,
            max_iterations=5,
        )
        ctx = await agent.run()
        assert ctx.iteration >= 1


# ── Edge Case: LLM failures ────────────────────────────────────────────────────

class TestLLMFailures:
    async def test_llm_timeout_then_recover(self):
        """Agent skips the iteration and retries when LLM raises TimeoutError."""
        registry = _registry()
        call_count = {"n": 0}

        async def flaky_chat(messages, stream=False):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise asyncio.TimeoutError("LLM timed out")
            return _report_action()

        llm = MagicMock()
        llm.chat = flaky_chat

        with patch("core.agent.asyncio.sleep", new_callable=AsyncMock):
            agent = PentestAgent(
                session=_session(),
                target="10.0.0.5",
                mode="scan_only",
                registry=registry,
                safety=_safety(),
                llm=llm,
                max_iterations=5,
            )
            await agent.run()
        assert call_count["n"] >= 2

    async def test_llm_returns_malformed_json(self):
        """Agent skips the iteration when LLM returns non-JSON content."""
        registry = _registry()
        call_count = {"n": 0}

        async def bad_json_chat(messages, stream=False):
            call_count["n"] += 1
            if call_count["n"] <= 2:
                return "Sorry, I cannot help with that."
            return _report_action()

        llm = MagicMock()
        llm.chat = bad_json_chat

        with patch("core.agent.asyncio.sleep", new_callable=AsyncMock):
            agent = PentestAgent(
                session=_session(),
                target="10.0.0.5",
                mode="scan_only",
                registry=registry,
                safety=_safety(),
                llm=llm,
                max_iterations=10,
            )
            await agent.run()
        assert agent.state in (AgentState.DONE, AgentState.ERROR)

    async def test_llm_connection_refused(self):
        """Agent retries when LLM raises a connection error."""
        registry = _registry()
        call_count = {"n": 0}

        async def conn_refused_chat(messages, stream=False):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise ConnectionRefusedError("Connection refused")
            return _report_action()

        llm = MagicMock()
        llm.chat = conn_refused_chat

        with patch("core.agent.asyncio.sleep", new_callable=AsyncMock):
            agent = PentestAgent(
                session=_session(),
                target="10.0.0.5",
                mode="scan_only",
                registry=registry,
                safety=_safety(),
                llm=llm,
                max_iterations=5,
            )
            await agent.run()
        assert call_count["n"] >= 2

    async def test_llm_always_fails_hits_max_iterations(self):
        """When LLM always fails, agent should stop at max_iterations."""
        registry = _registry()

        async def always_fail(messages, stream=False):
            raise RuntimeError("LLM unavailable")

        llm = MagicMock()
        llm.chat = always_fail

        events: list[str] = []

        def cb(event, data):
            events.append(event)

        with patch("core.agent.asyncio.sleep", new_callable=AsyncMock):
            agent = PentestAgent(
                session=_session(),
                target="10.0.0.5",
                mode="scan_only",
                registry=registry,
                safety=_safety(),
                llm=llm,
                max_iterations=3,
                progress_callback=cb,
            )
            await agent.run()
        assert "max_iterations" in events or agent.state == AgentState.DONE


# ── Edge Case: safety blocks ──────────────────────────────────────────────────

class TestSafetyBlocks:
    async def test_out_of_scope_target_blocked(self):
        """Safety guard blocks tool call when target is outside allowed CIDR."""
        registry = _registry()
        events: list[tuple[str, dict]] = []

        def cb(event, data):
            events.append((event, data))

        # Allow only 192.168.0.0/24, agent tries to scan 10.0.0.5 (plain IP, no slash)
        safety = _safety(cidr="192.168.0.0/24")

        llm = _llm_sequence(
            _action("nmap_scan", {"target": "10.0.0.5", "scan_type": "ping"}),
            _report_action(),
        )

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=safety,
            llm=llm,
            max_iterations=5,
            progress_callback=cb,
        )
        await agent.run()

        event_names = [e[0] for e in events]
        # Target 10.0.0.5 is outside 192.168.0.0/24 — must be blocked
        assert "safety_block" in event_names

    async def test_exploit_blocked_in_scan_only_mode(self):
        """Safety guard blocks exploitation when allow_exploit=False."""
        registry = _registry()
        events: list[tuple[str, dict]] = []

        def cb(event, data):
            events.append((event, data))

        safety = _safety(allow_exploit=False, cidr="10.0.0.0/8")

        # Agent tries to run metasploit against an in-scope target
        llm = _llm_sequence(
            json.dumps({
                "thought": "trying exploit",
                "reasoning": "found vuln",
                "action": "metasploit_run",
                "parameters": {
                    "module": "exploit/multi/handler",
                    "target": "10.0.0.5",
                    "target_ip": "10.0.0.5",
                    "port": 445,
                },
            }),
            _report_action(),
        )

        agent = PentestAgent(
            session=_session("full_auto"),
            target="10.0.0.5",
            mode="full_auto",
            registry=registry,
            safety=safety,
            llm=llm,
            max_iterations=5,
            progress_callback=cb,
        )
        await agent.run()

        event_names = [e[0] for e in events]
        assert "safety_block" in event_names


# ── Edge Case: kill switch ────────────────────────────────────────────────────

class TestKillSwitch:
    async def test_kill_switch_stops_immediately(self):
        """Triggering the kill switch mid-run stops the agent at the next iteration."""
        registry = _registry()
        events: list[str] = []
        agent_ref: list[PentestAgent] = []

        call_count = {"n": 0}

        async def trigger_kill_on_second(messages, stream=False):
            call_count["n"] += 1
            if call_count["n"] == 2 and agent_ref:
                agent_ref[0]._safety.emergency_stop()
            return _action("nmap_scan", {"target": "10.0.0.5", "scan_type": "ping"})

        llm = MagicMock()
        llm.chat = trigger_kill_on_second

        def cb(event, data):
            events.append(event)

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=_safety(),
            llm=llm,
            max_iterations=20,
            progress_callback=cb,
        )
        agent_ref.append(agent)

        await agent.run()
        assert "kill_switch" in events
        assert agent.state == AgentState.ERROR


# ── Edge Case: max iterations ─────────────────────────────────────────────────

class TestMaxIterations:
    async def test_max_iterations_prevents_infinite_loop(self):
        """Agent must stop after max_iterations regardless of LLM output."""
        registry = _registry()
        events: list[str] = []

        def cb(event, data):
            events.append(event)

        # LLM always returns nmap — never generate_report
        llm = _llm_sequence(
            *[_action("nmap_scan", {"target": "10.0.0.5", "scan_type": "ping"})] * 100
        )

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=_safety(),
            llm=llm,
            max_iterations=3,
            progress_callback=cb,
        )
        ctx = await agent.run()
        assert ctx.iteration <= 4  # at most max_iterations + 1 due to check order
        assert "max_iterations" in events


# ── Edge Case: tool raises unexpected exception ───────────────────────────────

class TestToolException:
    async def test_tool_exception_does_not_crash_agent(self):
        """If a tool raises an unexpected exception, the agent should handle it gracefully."""
        registry = _registry()
        nmap = registry.get("nmap_scan")
        nmap.execute = AsyncMock(side_effect=RuntimeError("Tool crashed unexpectedly"))

        llm = _llm_sequence(
            _action("nmap_scan", {"target": "10.0.0.5", "scan_type": "ping"}),
            _report_action(),
        )

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=_safety(),
            llm=llm,
            max_iterations=5,
        )
        ctx = await agent.run()
        # Should complete rather than propagate the exception
        assert agent.state in (AgentState.DONE, AgentState.ERROR)

    async def test_unknown_tool_name_handled(self):
        """If LLM hallucinates a tool name, the agent emits safety_block or error and continues."""
        registry = _registry()
        events: list[str] = []

        def cb(event, data):
            events.append(event)

        llm = _llm_sequence(
            _action("nonexistent_tool_xyz", {"target": "10.0.0.5"}),
            _report_action(),
        )

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=_safety(),
            llm=llm,
            max_iterations=5,
            progress_callback=cb,
        )
        await agent.run()
        assert agent.state in (AgentState.DONE, AgentState.ERROR)


# ── Edge Case: immediate generate_report with no findings ─────────────────────

class TestNoFindings:
    async def test_generate_report_with_zero_findings(self):
        """Agent can complete successfully with no hosts, no vulns, no exploits."""
        registry = _registry()

        llm = _llm_sequence(_report_action())

        agent = PentestAgent(
            session=_session(),
            target="10.0.0.5",
            mode="scan_only",
            registry=registry,
            safety=_safety(),
            llm=llm,
            max_iterations=5,
        )
        ctx = await agent.run()
        assert ctx.total_vulns == 0
        assert ctx.total_exploits == 0
        assert agent.state == AgentState.DONE
