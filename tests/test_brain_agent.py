"""Tests for core/brain_agent.py — BrainAgent meta-coordinator."""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.base_agent import AgentResult, BaseAgent
from core.brain_agent import BrainAgent, _AGENT_REGISTRY, _register_agent_type
from core.message_bus import AgentMessage, AgentMessageBus, MessageType
from core.mission_context import MissionContext, HostInfo
from models.mission import MissionBrief


# ── Helpers ───────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def make_ctx() -> MissionContext:
    brief = MissionBrief(allow_exploitation=True, allow_post_exploitation=True)
    return MissionContext.from_mission_brief("test-brain-01", brief, target="10.0.0.1")


def make_bus() -> AgentMessageBus:
    return AgentMessageBus()


def make_brain(**kwargs) -> BrainAgent:
    ctx = kwargs.pop("ctx", make_ctx())
    bus = kwargs.pop("bus", make_bus())
    progress_callback = kwargs.pop("progress_callback", None)
    mock_llm = MagicMock()
    mock_llm.chat = AsyncMock(return_value='{"tool": "mission_done", "parameters": {"summary": "done"}}')
    mock_safety = MagicMock()
    mock_safety.check = MagicMock(return_value=MagicMock(allowed=True))
    mock_tool_registry = MagicMock()
    mock_tool_registry.get = MagicMock(return_value=None)
    mock_audit = MagicMock()
    mock_audit.log = AsyncMock()

    return BrainAgent(
        mission_context=ctx,
        message_bus=bus,
        mission_id="test-brain-01",
        tool_registry=mock_tool_registry,
        safety=mock_safety,
        llm=mock_llm,
        progress_callback=progress_callback,
        audit_repo=mock_audit,
        session_id="sess-001",
        **kwargs,
    )


class FakeChildAgent(BaseAgent):
    """Minimal specialized agent for spawning tests."""

    def __init__(self, **kwargs):
        # Strip V2 kwargs that BaseAgent doesn't understand
        kwargs.pop("message_bus", None)
        kwargs.pop("mission_context", None)
        kwargs.pop("target", None)
        kwargs.pop("task_type", None)
        super().__init__(**kwargs)
        self.ran = False

    def get_available_tools(self) -> list[str]:
        return []

    def build_messages(self) -> list[dict]:
        return [{"role": "system", "content": "fake agent"}]

    async def process_result(self, tool_name, result, action_dict) -> None:
        pass

    async def run(self) -> AgentResult:
        self.ran = True
        return AgentResult(
            agent_id=self.agent_id,
            agent_type=self.agent_type,
            status="done",
            findings=[{"host": "10.0.0.1"}],
        )


# ── Construction ──────────────────────────────────────────────────────────────

class TestBrainAgentConstruction:
    def test_agent_type_is_brain(self):
        brain = make_brain()
        assert brain.agent_type == "brain"

    def test_registers_on_bus(self):
        bus = make_bus()
        brain = make_brain(bus=bus)
        assert brain.agent_id in bus.registered_agents()

    def test_ctx_and_bus_stored(self):
        ctx = make_ctx()
        bus = make_bus()
        brain = make_brain(ctx=ctx, bus=bus)
        assert brain.ctx is ctx
        assert brain.bus is bus

    def test_available_tools_are_meta_tools(self):
        brain = make_brain()
        tools = brain.get_available_tools()
        assert "spawn_agent" in tools
        assert "wait_for_agents" in tools
        assert "kill_agent" in tools
        assert "set_phase" in tools
        assert "mission_done" in tools
        assert "ask_operator" in tools
        assert "update_context" in tools

    def test_build_messages_returns_system_and_memory(self):
        brain = make_brain()
        msgs = brain.build_messages()
        assert len(msgs) >= 1
        assert msgs[0]["role"] == "system"
        assert "BrainAgent" in msgs[0]["content"]

    def test_system_prompt_includes_context_summary(self):
        ctx = make_ctx()
        run(ctx.update_host(HostInfo(ip="10.0.0.1", hostname="web01")))
        brain = make_brain(ctx=ctx)
        msgs = brain.build_messages()
        system = msgs[0]["content"]
        assert "10.0.0.1" in system

    def test_system_prompt_includes_permission_flags(self):
        ctx = make_ctx()
        brain = make_brain(ctx=ctx)
        msgs = brain.build_messages()
        system = msgs[0]["content"]
        assert "allow_exploitation" in system


# ── _spawn_agent ──────────────────────────────────────────────────────────────

class TestSpawnAgent:
    def test_spawn_unknown_type_returns_error(self):
        brain = make_brain()
        result = run(brain._spawn_agent({"agent_type": "ghost", "target": "10.0.0.1"}))
        assert result["status"] == "error"
        assert "ghost" in result["error"]

    def test_spawn_registered_agent(self):
        # Register FakeChildAgent
        _register_agent_type("fake", "tests.test_brain_agent", "FakeChildAgent")
        brain = make_brain()
        result = run(brain._spawn_agent({
            "agent_type": "fake",
            "target": "10.0.0.1",
            "task_type": "scan",
        }))
        assert result["status"] == "spawned"
        assert result["agent_type"] == "fake"
        assert "agent_id" in result
        # Cleanup
        _AGENT_REGISTRY.pop("fake", None)

    def test_spawn_registers_child_on_bus(self):
        _register_agent_type("fake2", "tests.test_brain_agent", "FakeChildAgent")
        bus = make_bus()
        brain = make_brain(bus=bus)
        result = run(brain._spawn_agent({
            "agent_type": "fake2",
            "target": "10.0.0.1",
        }))
        assert result["agent_id"] in bus.registered_agents()
        _AGENT_REGISTRY.pop("fake2", None)

    def test_spawn_emits_agent_spawned_event(self):
        _register_agent_type("fake3", "tests.test_brain_agent", "FakeChildAgent")
        events = []
        brain = make_brain(progress_callback=lambda t, d: events.append((t, d)))
        run(brain._spawn_agent({
            "agent_type": "fake3",
            "target": "10.0.0.1",
        }))
        assert any(t == "agent_spawned" for t, _ in events)
        _AGENT_REGISTRY.pop("fake3", None)


# ── _wait_for_agents ──────────────────────────────────────────────────────────

class TestWaitForAgents:
    def test_empty_list_returns_immediately(self):
        brain = make_brain()
        result = run(brain._wait_for_agents({"agent_ids": []}))
        assert result["status"] == "ok"
        assert result["completed"] == []

    def test_waits_for_done_message(self):
        bus = make_bus()
        brain = make_brain(bus=bus)
        bus.register_agent("scanner-001")

        async def send_done():
            await asyncio.sleep(0.01)
            await bus.send(AgentMessage(
                msg_type=MessageType.AGENT_DONE,
                sender_id="scanner-001",
                payload={"agent_id": "scanner-001", "status": "done"},
            ))

        async def do():
            asyncio.ensure_future(send_done())
            return await brain._wait_for_agents({
                "agent_ids": ["scanner-001"],
                "timeout": 2.0,
            })

        result = run(do())
        assert "scanner-001" in result["completed"]

    def test_timeout_reported(self):
        brain = make_brain()
        result = run(brain._wait_for_agents({
            "agent_ids": ["never-completes"],
            "timeout": 0.01,
        }))
        assert "never-completes" in result["timed_out"]


# ── _kill_agent ───────────────────────────────────────────────────────────────

class TestKillAgent:
    def test_kill_running_task(self):
        brain = make_brain()

        async def long_task():
            await asyncio.sleep(9999)

        loop = asyncio.get_event_loop()
        task = loop.create_task(long_task())
        brain._child_tasks["scanner-x"] = task

        result = brain._kill_agent({"agent_id": "scanner-x"})
        assert result["status"] == "killed"
        assert "scanner-x" not in brain._child_tasks

    def test_kill_nonexistent_returns_not_found(self):
        brain = make_brain()
        result = brain._kill_agent({"agent_id": "ghost"})
        assert result["status"] == "not_found"


# ── update_context ────────────────────────────────────────────────────────────

class TestUpdateContext:
    def test_update_host(self):
        ctx = make_ctx()
        brain = make_brain(ctx=ctx)
        run(brain._handle_update_context(
            {},
            {"item": {"type": "host", "ip": "10.0.0.5", "hostname": "db01",
                      "ports": [{"number": 5432, "service": "postgresql"}]}}
        ))
        assert "10.0.0.5" in ctx.hosts
        assert ctx.hosts["10.0.0.5"].hostname == "db01"

    def test_update_vulnerability(self):
        ctx = make_ctx()
        brain = make_brain(ctx=ctx)
        run(brain._handle_update_context(
            {},
            {"item": {"type": "vulnerability", "title": "Log4Shell",
                      "host_ip": "10.0.0.1", "cve_id": "CVE-2021-44228", "cvss": 10.0}}
        ))
        assert len(ctx.vulnerabilities) == 1
        assert ctx.vulnerabilities[0].cve_id == "CVE-2021-44228"

    def test_update_session(self):
        ctx = make_ctx()
        run(ctx.update_host(HostInfo(ip="10.0.0.1")))
        brain = make_brain(ctx=ctx)
        run(brain._handle_update_context(
            {},
            {"item": {"type": "session", "host_ip": "10.0.0.1",
                      "session_type": "meterpreter", "privilege_level": 3}}
        ))
        assert len(ctx.active_sessions) == 1
        assert ctx.active_sessions[0].privilege_level == 3

    def test_update_lateral_edge(self):
        ctx = make_ctx()
        brain = make_brain(ctx=ctx)
        run(brain._handle_update_context(
            {},
            {"item": {"type": "lateral_edge", "from_ip": "10.0.0.1",
                      "to_ip": "10.0.0.2", "description": "ssh"}}
        ))
        lateral = [e for e in ctx.attack_graph.edges if e.edge_type == "lateral"]
        assert len(lateral) == 1

    def test_update_loot(self):
        ctx = make_ctx()
        brain = make_brain(ctx=ctx)
        run(brain._handle_update_context(
            {},
            {"item": {"type": "loot", "source_host": "10.0.0.1",
                      "loot_type": "file", "file_path": "/etc/shadow"}}
        ))
        assert len(ctx.loot) == 1


# ── ask_operator ──────────────────────────────────────────────────────────────

class TestAskOperator:
    def test_timeout_returns_empty_answer(self):
        brain = make_brain()
        result = run(brain._ask_operator({"question": "Continue?", "timeout": 0.01}))
        assert result["status"] == "timeout"
        assert result["answer"] == ""

    def test_operator_reply_received(self):
        bus = make_bus()
        brain = make_brain(bus=bus)

        async def send_reply():
            await asyncio.sleep(0.01)
            await bus.send(AgentMessage(
                msg_type=MessageType.OPERATOR_REPLY,
                sender_id="operator",
                recipient_id=brain.agent_id,
                payload={"answer": "yes"},
            ))

        async def do():
            asyncio.ensure_future(send_reply())
            return await brain._ask_operator({"question": "Proceed?", "timeout": 2.0})

        result = run(do())
        assert result["status"] == "answered"
        assert result["answer"] == "yes"


# ── set_phase ─────────────────────────────────────────────────────────────────

class TestSetPhase:
    def test_set_phase_updates_context(self):
        ctx = make_ctx()
        brain = make_brain(ctx=ctx)
        run(brain.process_result("set_phase", {}, {"parameters": {"phase": "exploitation"}}))
        assert ctx.phase == "exploitation"

    def test_set_phase_emits_event(self):
        events = []
        brain = make_brain(progress_callback=lambda t, d: events.append(t))
        run(brain.process_result("set_phase", {}, {"parameters": {"phase": "post_exploitation"}}))
        assert "phase_changed" in events


# ── terminal action ───────────────────────────────────────────────────────────

class TestTerminalAction:
    def test_mission_done_is_terminal(self):
        brain = make_brain()
        assert run(brain.handle_terminal_action({"tool": "mission_done"})) is True

    def test_other_tools_not_terminal(self):
        brain = make_brain()
        assert run(brain.handle_terminal_action({"tool": "spawn_agent"})) is False

    def test_done_action_is_terminal(self):
        brain = make_brain()
        assert run(brain.handle_terminal_action({"action": "done"})) is True


# ── Bus event handler ─────────────────────────────────────────────────────────

class TestBusEventHandler:
    def test_finding_message_accumulates_finding(self):
        brain = make_brain()
        msg = AgentMessage(
            msg_type=MessageType.FINDING,
            sender_id="scanner-001",
            payload={"host": "10.0.0.1", "port": 80},
        )
        run(brain._on_bus_message(msg))
        assert len(brain._findings) == 1
        assert brain._findings[0]["host"] == "10.0.0.1"

    def test_non_finding_does_not_accumulate(self):
        brain = make_brain()
        msg = AgentMessage(
            msg_type=MessageType.EVENT,
            sender_id="scanner-001",
            payload={"data": "x"},
        )
        run(brain._on_bus_message(msg))
        assert len(brain._findings) == 0

    def test_agent_done_emits_event(self):
        events = []
        brain = make_brain(progress_callback=lambda t, d: events.append(t))
        msg = AgentMessage(
            msg_type=MessageType.AGENT_DONE,
            sender_id="scanner-001",
            payload={"agent_id": "scanner-001", "findings": [1, 2]},
        )
        run(brain._on_bus_message(msg))
        assert "child_agent_done" in events


# ── on_run_end ────────────────────────────────────────────────────────────────

class TestOnRunEnd:
    def test_cancels_running_tasks(self):
        brain = make_brain()

        async def long_task():
            await asyncio.sleep(9999)

        loop = asyncio.get_event_loop()
        t1 = loop.create_task(long_task())
        t2 = loop.create_task(long_task())
        brain._child_tasks["a1"] = t1
        brain._child_tasks["a2"] = t2

        run(brain.on_run_end(None))
        assert t1.cancelled()
        assert t2.cancelled()
        assert brain._child_tasks == {}

    def test_unregisters_from_bus(self):
        bus = make_bus()
        brain = make_brain(bus=bus)
        agent_id = brain.agent_id
        assert agent_id in bus.registered_agents()
        run(brain.on_run_end(None))
        assert agent_id not in bus.registered_agents()


# ── _register_agent_type ──────────────────────────────────────────────────────

class TestRegisterAgentType:
    def test_register_adds_to_registry(self):
        _register_agent_type("test_type_x", "some.module", "SomeClass")
        assert "test_type_x" in _AGENT_REGISTRY
        assert _AGENT_REGISTRY["test_type_x"] == ("some.module", "SomeClass")
        del _AGENT_REGISTRY["test_type_x"]
