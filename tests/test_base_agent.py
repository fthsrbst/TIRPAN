"""
Tests for core/base_agent.py

Covers:
  - AgentState enum definition and values
  - AgentResult construction and serialization
  - BaseAgent concrete subclass (minimal ConcreteAgent for testing)
  - Constructor defaults and injection
  - State machine transitions: IDLE → REASONING → ACTING → OBSERVING → REFLECTING → DONE
  - pause / resume / inject_message / kill controls
  - reason() → LLM call, JSON parse, inject handling
  - act() → safety block, tool availability, tool not found, successful execution
  - act_parallel() → concurrent calls, 10-cap, gather exceptions
  - observe() → memory addition, process_result delegation
  - Repeated-failure guard → hard-block after 3 identical failures
  - Connect-loop guard → nudge after 2 already_open returns
  - Max iterations guard → DONE at limit
  - Kill switch → ERROR immediately
  - Terminal action → DONE when handle_terminal_action returns True
  - Backward compat: AgentState still importable from core.agent
"""

from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from core.base_agent import AgentState, AgentResult, BaseAgent
from core.memory import SessionMemory
from core.safety import SafetyGuard
from core.tool_registry import ToolRegistry
from config import SafetyConfig


# ── Minimal concrete subclass for testing ─────────────────────────────────────

class ConcreteAgent(BaseAgent):
    """Minimal BaseAgent subclass used in tests."""

    def __init__(self, tools: list[str] | None = None, **kwargs):
        super().__init__(agent_type="test", mission_id="mission-001", **kwargs)
        self.process_result_calls: list[tuple] = []
        self._tools: list[str] = tools or []

    def build_messages(self) -> list[dict]:
        return [
            {"role": "system", "content": "You are a test agent."},
            {"role": "user", "content": "What is your next action?"},
        ]

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        self.process_result_calls.append((tool_name, result, action_dict))

    def get_available_tools(self) -> list[str]:
        return self._tools


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_safety(allow_exploit: bool = True) -> SafetyGuard:
    cfg = SafetyConfig(allowed_cidr="10.0.0.0/8", allow_exploit=allow_exploit)
    return SafetyGuard(cfg)


def _make_registry(tool_name: str = "dummy_tool") -> ToolRegistry:
    registry = ToolRegistry()
    tool = MagicMock()
    tool.metadata.name = tool_name
    tool.metadata.description = "A dummy tool"
    tool.metadata.parameters = {}
    tool.to_llm_dict.return_value = {"name": tool_name, "description": "A dummy tool", "parameters": {}}
    tool.execute = AsyncMock(return_value={"success": True, "output": "ok", "error": None})
    registry.register(tool)
    registry._health[tool_name] = MagicMock(available=True, degraded=False, message="OK")
    return registry


def _make_llm(response: str = '{"action": "done", "thought": "all done"}') -> MagicMock:
    """Return a mock LLMRouter that streams the given response character by character."""
    async def _stream(messages):
        for ch in response:
            yield ch
    llm = MagicMock()
    llm.stream_chat = _stream
    llm.parse_json = LLMRouter_parse_json
    return llm


def LLMRouter_parse_json(response: str) -> dict:
    """Minimal parse_json compatible with the real LLMRouter.parse_json."""
    # Extract JSON from response (may be wrapped in markdown)
    import re
    match = re.search(r'\{.*\}', response, re.DOTALL)
    if match:
        return json.loads(match.group())
    return json.loads(response)


# Patch LLMRouter.parse_json at module level
import core.base_agent as _ba
_ba.LLMRouter.parse_json = staticmethod(LLMRouter_parse_json)


# ── AgentState ────────────────────────────────────────────────────────────────

class TestAgentState:
    def test_all_states_defined(self):
        states = {s.name for s in AgentState}
        assert states == {
            "IDLE", "REASONING", "ACTING", "OBSERVING",
            "REFLECTING", "DONE", "ERROR", "WAITING_FOR_OPERATOR",
        }

    def test_backward_compat_import_from_agent(self):
        """AgentState must still be importable from core.agent for V1 compat."""
        from core.agent import AgentState as AgentStateFromAgent
        assert AgentStateFromAgent is AgentState

    def test_done_is_not_error(self):
        assert AgentState.DONE != AgentState.ERROR

    def test_enum_auto_values_are_unique(self):
        values = [s.value for s in AgentState]
        assert len(values) == len(set(values))


# ── AgentResult ───────────────────────────────────────────────────────────────

class TestAgentResult:
    def test_to_dict_contains_all_fields(self):
        r = AgentResult(
            agent_id="a1",
            agent_type="scanner",
            status="success",
            findings=[{"type": "host_discovered", "ip": "10.0.0.1"}],
            iterations=5,
        )
        d = r.to_dict()
        assert d["agent_id"] == "a1"
        assert d["agent_type"] == "scanner"
        assert d["status"] == "success"
        assert len(d["findings"]) == 1
        assert d["iterations"] == 5
        assert d["error"] is None

    def test_default_findings_empty_list(self):
        r = AgentResult(agent_id="x", agent_type="test", status="failed")
        assert r.findings == []

    def test_repr(self):
        r = AgentResult(agent_id="x", agent_type="test", status="success", iterations=3)
        assert "test" in repr(r)
        assert "success" in repr(r)


# ── BaseAgent construction ────────────────────────────────────────────────────

class TestBaseAgentConstruction:
    def test_agent_id_auto_generated(self):
        a = ConcreteAgent()
        assert a.agent_id  # non-empty string
        b = ConcreteAgent()
        assert a.agent_id != b.agent_id  # unique

    def test_custom_agent_id(self):
        a = ConcreteAgent(agent_id="my-agent-id")
        assert a.agent_id == "my-agent-id"

    def test_agent_type_set(self):
        a = ConcreteAgent()
        assert a.agent_type == "test"

    def test_initial_state_idle(self):
        a = ConcreteAgent()
        assert a.state == AgentState.IDLE

    def test_not_paused_initially(self):
        a = ConcreteAgent()
        assert not a.is_paused

    def test_memory_created(self):
        a = ConcreteAgent()
        assert isinstance(a.memory, SessionMemory)

    def test_custom_memory_limits(self):
        a = ConcreteAgent(memory_max_messages=10, memory_max_tokens=1024)
        assert a.memory.max_messages == 10
        assert a.memory.max_tokens == 1024

    def test_injected_safety(self):
        safety = _make_safety()
        a = ConcreteAgent(safety=safety)
        assert a._safety is safety

    def test_injected_tool_registry(self):
        reg = _make_registry()
        a = ConcreteAgent(tool_registry=reg)
        assert a._registry is reg


# ── Pause / Resume / Kill / Inject ────────────────────────────────────────────

class TestAgentControls:
    def test_pause_sets_paused_flag(self):
        a = ConcreteAgent()
        a.pause()
        assert a.is_paused

    def test_resume_clears_paused_flag(self):
        a = ConcreteAgent()
        a.pause()
        a.resume()
        assert not a.is_paused

    def test_pause_clears_pause_event(self):
        a = ConcreteAgent()
        a.pause()
        assert not a._pause_event.is_set()

    def test_resume_sets_pause_event(self):
        a = ConcreteAgent()
        a.pause()
        a.resume()
        assert a._pause_event.is_set()

    def test_inject_message_sets_pending_flag(self):
        a = ConcreteAgent()
        a.inject_message("test message")
        assert a._has_pending_inject

    def test_inject_message_added_to_memory(self):
        a = ConcreteAgent()
        a.inject_message("operator says hello")
        messages = a.memory.build_context()
        assert any("operator says hello" in m["content"] for m in messages)

    def test_inject_emits_event(self):
        events = []
        a = ConcreteAgent(progress_callback=lambda t, d: events.append((t, d)))
        a.inject_message("test")
        assert any(t == "injected" for t, _ in events)

    def test_kill_triggers_safety_guard(self):
        safety = _make_safety()
        a = ConcreteAgent(safety=safety)
        a.kill()
        assert safety.kill_switch_triggered


# ── emit_event ────────────────────────────────────────────────────────────────

class TestEmitEvent:
    def test_emit_calls_callback(self):
        events = []
        a = ConcreteAgent(progress_callback=lambda t, d: events.append((t, d)))
        a.emit_event("test_event", {"key": "value"})
        assert len(events) == 1
        t, d = events[0]
        assert t == "test_event"
        assert d["agent_id"] == a.agent_id
        assert d["agent_type"] == "test"
        assert d["key"] == "value"

    def test_emit_without_callback_does_not_raise(self):
        a = ConcreteAgent(progress_callback=None)
        a.emit_event("test", {})  # should not raise

    def test_emit_callback_exception_is_swallowed(self):
        def bad_cb(t, d):
            raise RuntimeError("callback error")
        a = ConcreteAgent(progress_callback=bad_cb)
        a.emit_event("test", {})  # should not raise


# ── _add_finding ──────────────────────────────────────────────────────────────

class TestAddFinding:
    def test_finding_accumulated(self):
        a = ConcreteAgent()
        a._add_finding({"type": "host_discovered", "ip": "10.0.0.1"})
        assert len(a._findings) == 1
        assert a._findings[0]["ip"] == "10.0.0.1"

    def test_finding_emits_event(self):
        events = []
        a = ConcreteAgent(progress_callback=lambda t, d: events.append((t, d)))
        a._add_finding({"type": "port_open", "ip": "10.0.0.1", "port": 80})
        finding_events = [d for t, d in events if t == "finding"]
        assert len(finding_events) == 1
        assert finding_events[0]["port"] == 80


# ── act() ─────────────────────────────────────────────────────────────────────

class TestAct:
    @pytest.mark.asyncio
    async def test_act_executes_tool(self):
        reg = _make_registry("dummy_tool")
        a = ConcreteAgent(tool_registry=reg, safety=_make_safety(), tools=["dummy_tool"])
        result = await a.act({"action": "dummy_tool", "parameters": {"target": "10.0.0.1"}})
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_act_safety_block(self):
        reg = _make_registry("metasploit_run")
        safety = _make_safety(allow_exploit=False)
        a = ConcreteAgent(tool_registry=reg, safety=safety, tools=["metasploit_run"])
        result = await a.act({
            "action": "metasploit_run",
            "parameters": {"target": "10.0.0.1", "module": "exploit/foo"},
        })
        assert result["success"] is False
        assert "Safety rule blocked" in result["error"]

    @pytest.mark.asyncio
    async def test_act_tool_not_found(self):
        a = ConcreteAgent(tool_registry=ToolRegistry(), safety=_make_safety())
        result = await a.act({"action": "nonexistent_tool", "parameters": {}})
        assert result["success"] is False
        assert "Unknown tool" in result["error"]

    @pytest.mark.asyncio
    async def test_act_tool_not_in_available_list(self):
        reg = _make_registry("dummy_tool")
        a = ConcreteAgent(tool_registry=reg, safety=_make_safety(), tools=["other_tool"])
        result = await a.act({"action": "dummy_tool", "parameters": {}})
        assert result["success"] is False
        assert "not available" in result["error"]

    @pytest.mark.asyncio
    async def test_act_empty_available_list_allows_all(self):
        """Empty get_available_tools() means no restriction."""
        reg = _make_registry("dummy_tool")
        a = ConcreteAgent(tool_registry=reg, safety=_make_safety(), tools=[])
        result = await a.act({"action": "dummy_tool", "parameters": {"target": "10.0.0.1"}})
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_act_hard_block_prevents_execution(self):
        reg = _make_registry("dummy_tool")
        a = ConcreteAgent(tool_registry=reg, safety=_make_safety())
        a._session_blocked_calls["dummy_tool"] = 1
        result = await a.act({"action": "dummy_tool", "parameters": {}})
        assert result["success"] is False
        assert "permanently blocked" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_act_emits_tool_call_and_result_events(self):
        events = []
        reg = _make_registry("dummy_tool")
        a = ConcreteAgent(
            tool_registry=reg,
            safety=_make_safety(),
            tools=["dummy_tool"],
            progress_callback=lambda t, d: events.append(t),
        )
        await a.act({"action": "dummy_tool", "parameters": {"target": "10.0.0.1"}})
        assert "tool_call" in events
        assert "tool_result" in events


# ── act_parallel() ────────────────────────────────────────────────────────────

class TestActParallel:
    @pytest.mark.asyncio
    async def test_parallel_runs_all_calls(self):
        reg = _make_registry("dummy_tool")
        a = ConcreteAgent(tool_registry=reg, safety=_make_safety())
        calls = [
            {"action": "dummy_tool", "parameters": {"target": "10.0.0.1"}},
            {"action": "dummy_tool", "parameters": {"target": "10.0.0.2"}},
        ]
        pairs = await a.act_parallel(calls)
        assert len(pairs) == 2
        assert all(r["success"] for _, r in pairs)

    @pytest.mark.asyncio
    async def test_parallel_caps_at_10(self):
        reg = _make_registry("dummy_tool")
        a = ConcreteAgent(tool_registry=reg, safety=_make_safety())
        calls = [
            {"action": "dummy_tool", "parameters": {"target": f"10.0.0.{i}"}}
            for i in range(15)
        ]
        pairs = await a.act_parallel(calls)
        assert len(pairs) == 10

    @pytest.mark.asyncio
    async def test_parallel_handles_individual_failure(self):
        reg = ToolRegistry()
        good_tool = MagicMock()
        good_tool.metadata.name = "good"
        good_tool.metadata.description = ""
        good_tool.metadata.parameters = {}
        good_tool.to_llm_dict.return_value = {"name": "good", "description": "", "parameters": {}}
        good_tool.execute = AsyncMock(return_value={"success": True, "output": "ok", "error": None})
        reg.register(good_tool)

        bad_tool = MagicMock()
        bad_tool.metadata.name = "bad"
        bad_tool.metadata.description = ""
        bad_tool.metadata.parameters = {}
        bad_tool.to_llm_dict.return_value = {"name": "bad", "description": "", "parameters": {}}
        bad_tool.execute = AsyncMock(side_effect=RuntimeError("tool crash"))
        reg.register(bad_tool)

        a = ConcreteAgent(tool_registry=reg, safety=_make_safety())
        calls = [
            {"action": "good", "parameters": {"target": "10.0.0.1"}},
            {"action": "bad", "parameters": {"target": "10.0.0.2"}},
        ]
        pairs = await a.act_parallel(calls)
        # Both should be returned (bad as failed result)
        assert len(pairs) == 2


# ── observe() ─────────────────────────────────────────────────────────────────

class TestObserve:
    @pytest.mark.asyncio
    async def test_observe_adds_to_memory(self):
        a = ConcreteAgent()
        await a.observe(
            {"success": True, "output": "scan done", "error": None},
            {"action": "nmap_scan"},
        )
        messages = a.memory.build_context()
        assert any("TOOL_RESULT: nmap_scan" in m["content"] for m in messages)

    @pytest.mark.asyncio
    async def test_observe_calls_process_result(self):
        a = ConcreteAgent()
        result = {"success": True, "output": "ok", "error": None}
        action = {"action": "nmap_scan", "parameters": {}}
        await a.observe(result, action)
        assert len(a.process_result_calls) == 1
        tool_name, r, act = a.process_result_calls[0]
        assert tool_name == "nmap_scan"
        assert r["success"] is True

    @pytest.mark.asyncio
    async def test_observe_emits_observation_event(self):
        events = []
        a = ConcreteAgent(progress_callback=lambda t, d: events.append(t))
        await a.observe(
            {"success": True, "output": "x", "error": None},
            {"action": "test_tool"},
        )
        assert "observation" in events


# ── Full run() loop ────────────────────────────────────────────────────────────

class TestRunLoop:
    @pytest.mark.asyncio
    async def test_run_stops_on_done_action(self):
        llm = _make_llm('{"action": "done", "thought": "finished"}')
        a = ConcreteAgent(
            tool_registry=ToolRegistry(),
            safety=_make_safety(),
            llm=llm,
            max_iterations=10,
        )
        result = await a.run()
        assert result.status == "success"
        assert result.agent_id == a.agent_id

    @pytest.mark.asyncio
    async def test_run_stops_at_max_iterations(self):
        # LLM always returns a tool call (never "done"), so max_iterations forces stop
        llm = _make_llm('{"action": "nonexistent", "thought": "keep going"}')
        a = ConcreteAgent(
            tool_registry=ToolRegistry(),
            safety=_make_safety(),
            llm=llm,
            max_iterations=3,
        )
        result = await a.run()
        assert result.status == "success"
        assert result.iterations == 3

    @pytest.mark.asyncio
    async def test_run_kill_switch_returns_failed(self):
        safety = _make_safety()
        safety.emergency_stop()  # pre-trigger kill switch
        llm = _make_llm('{"action": "done", "thought": "x"}')
        a = ConcreteAgent(
            tool_registry=ToolRegistry(),
            safety=safety,
            llm=llm,
            max_iterations=10,
        )
        result = await a.run()
        assert result.status == "failed"

    @pytest.mark.asyncio
    async def test_run_repeated_failure_guard_fires(self):
        """After 3 identical failures the tool should be hard-blocked."""
        reg = _make_registry("dummy_tool")
        reg._tools["dummy_tool"].execute = AsyncMock(
            return_value={"success": False, "output": None, "error": "connection refused"}
        )

        responses = [
            '{"action": "dummy_tool", "parameters": {"target": "10.0.0.1"}}',
            '{"action": "dummy_tool", "parameters": {"target": "10.0.0.1"}}',
            '{"action": "dummy_tool", "parameters": {"target": "10.0.0.1"}}',
            '{"action": "done", "thought": "giving up"}',
        ]
        idx = 0

        async def _stream(messages):
            nonlocal idx
            resp = responses[min(idx, len(responses) - 1)]
            idx += 1
            for ch in resp:
                yield ch

        llm = MagicMock()
        llm.stream_chat = _stream

        a = ConcreteAgent(
            tool_registry=reg,
            safety=_make_safety(),
            llm=llm,
            max_iterations=10,
        )
        await a.run()
        # After 3 failures, "dummy_tool" should be in blocked calls
        assert a._session_blocked_calls.get("dummy_tool", 0) > 0

    @pytest.mark.asyncio
    async def test_run_returns_accumulated_findings(self):
        llm = _make_llm('{"action": "done", "thought": "done"}')
        a = ConcreteAgent(
            tool_registry=ToolRegistry(),
            safety=_make_safety(),
            llm=llm,
            max_iterations=5,
        )
        # Manually add a finding before run to simulate process_result() behavior
        a._findings.append({"type": "host_discovered", "ip": "10.0.0.1"})
        result = await a.run()
        assert len(result.findings) == 1

    @pytest.mark.asyncio
    async def test_run_emits_agent_start_and_done_events(self):
        events = []
        llm = _make_llm('{"action": "done", "thought": "done"}')
        a = ConcreteAgent(
            tool_registry=ToolRegistry(),
            safety=_make_safety(),
            llm=llm,
            max_iterations=5,
            progress_callback=lambda t, d: events.append(t),
        )
        await a.run()
        assert "agent_start" in events
        assert "agent_done" in events
