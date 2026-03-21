"""
Phase 8 — Agent Core (ReAct Loop) Tests

Covers: AgentState enum, AgentContext, PentestAgent initialisation,
reason/act/observe/reflect steps, run() loop, kill switch,
max iterations, ask-before-exploit gate, progress callbacks,
and a full end-to-end mocked ReAct cycle.
"""

import json
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from core.agent import AgentContext, AgentState, PentestAgent
from core.memory import SessionMemory
from core.safety import SafetyGuard
from core.tool_registry import ToolRegistry
from models.session import Session
from config import SafetyConfig


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_session(mode: str = "full_auto") -> Session:
    return Session(id="test-session-001", target="10.0.0.0/24", mode=mode)


def _make_safety(allow_exploit: bool = True) -> SafetyGuard:
    cfg = SafetyConfig(
        allowed_cidr="10.0.0.0/8",
        allow_exploit=allow_exploit,
    )
    return SafetyGuard(cfg)


def _make_registry() -> ToolRegistry:
    registry = ToolRegistry()

    nmap_tool = MagicMock()
    nmap_tool.metadata.name = "nmap_scan"
    nmap_tool.metadata.description = "Nmap scanner"
    nmap_tool.metadata.parameters = {}
    nmap_tool.to_llm_dict.return_value = {
        "name": "nmap_scan",
        "description": "Nmap scanner",
        "parameters": {},
    }
    nmap_tool.execute = AsyncMock(return_value={
        "success": True,
        "output": {
            "hosts": [{"ip": "10.0.0.5", "state": "up", "ports": []}],
        },
        "error": None,
    })
    registry.register(nmap_tool)

    ss_tool = MagicMock()
    ss_tool.metadata.name = "searchsploit_search"
    ss_tool.metadata.description = "SearchSploit"
    ss_tool.metadata.parameters = {}
    ss_tool.to_llm_dict.return_value = {
        "name": "searchsploit_search",
        "description": "SearchSploit",
        "parameters": {},
    }
    ss_tool.execute = AsyncMock(return_value={
        "success": True,
        "output": [{"title": "vsftpd 2.3.4 Backdoor", "cve_id": "CVE-2011-2523"}],
        "error": None,
    })
    registry.register(ss_tool)

    msf_tool = MagicMock()
    msf_tool.metadata.name = "metasploit_run"
    msf_tool.metadata.description = "Metasploit"
    msf_tool.metadata.parameters = {}
    msf_tool.to_llm_dict.return_value = {
        "name": "metasploit_run",
        "description": "Metasploit",
        "parameters": {},
    }
    msf_tool.execute = AsyncMock(return_value={
        "success": True,
        "output": {"session_id": 1, "output": "shell opened"},
        "error": None,
    })
    registry.register(msf_tool)

    return registry


def _make_llm(responses: list[str]) -> MagicMock:
    """Return a mock LLMRouter that cycles through the given JSON response strings."""
    llm = MagicMock()
    llm.chat = AsyncMock(side_effect=responses)
    return llm


def _action_json(action: str, params: dict | None = None, thought: str = "t") -> str:
    return json.dumps({
        "thought": thought,
        "action": action,
        "parameters": params or {},
        "reasoning": "test reasoning",
    })


# ── 8.1 AgentState enum ────────────────────────────────────────────────────────

def test_agent_state_has_all_states():
    # WAITING_FOR_OPERATOR added in V2 BaseAgent for Brain's ask_operator flow
    expected = {
        "IDLE", "REASONING", "ACTING", "OBSERVING",
        "REFLECTING", "DONE", "ERROR", "WAITING_FOR_OPERATOR",
    }
    actual = {s.name for s in AgentState}
    assert expected == actual


def test_agent_state_done_and_error_are_terminal():
    terminal = {AgentState.DONE, AgentState.ERROR}
    assert AgentState.DONE in terminal
    assert AgentState.ERROR in terminal


# ── 8.2 AgentContext ───────────────────────────────────────────────────────────

def test_agent_context_initialises():
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    assert ctx.target == "10.0.0.0/24"
    assert ctx.mode == "full_auto"
    assert ctx.discovered_hosts == []
    assert ctx.attack_phase == "DISCOVERY"
    assert ctx.iteration == 0


def test_agent_context_computed_properties():
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    ctx.scan_results = ["a", "b"]
    ctx.vulnerabilities = ["v1"]
    ctx.exploit_results = ["e1", "e2", "e3"]
    assert ctx.total_ports == 2
    assert ctx.total_vulns == 1
    assert ctx.total_exploits == 3


# ── 8.2 PentestAgent instantiation ────────────────────────────────────────────

def test_pentest_agent_instantiates():
    session = _make_session()
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=_make_registry(),
    )
    assert agent.state == AgentState.IDLE
    assert agent.context.target == "10.0.0.0/24"
    assert isinstance(agent.memory, SessionMemory)


def test_pentest_agent_default_mode_is_full_auto():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    assert agent.context.mode == "full_auto"


# ── 8.4 reason() ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reason_returns_action_dict():
    session = _make_session()
    llm = _make_llm([_action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"})])
    agent = PentestAgent(session=session, target="10.0.0.0/24", llm=llm)
    result = await agent.reason()
    assert result is not None
    assert result["action"] == "nmap_scan"


@pytest.mark.asyncio
async def test_reason_adds_to_memory():
    session = _make_session()
    llm = _make_llm([_action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"})])
    agent = PentestAgent(session=session, target="10.0.0.0/24", llm=llm)
    await agent.reason()
    assert agent.memory.message_count >= 1


@pytest.mark.asyncio
async def test_reason_returns_none_on_invalid_json():
    session = _make_session()
    llm = _make_llm(["this is not json at all"])
    agent = PentestAgent(session=session, target="10.0.0.0/24", llm=llm)
    result = await agent.reason()
    assert result is None


@pytest.mark.asyncio
async def test_reason_returns_none_on_llm_exception():
    session = _make_session()
    llm = MagicMock()
    llm.chat = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
    agent = PentestAgent(session=session, target="10.0.0.0/24", llm=llm)
    result = await agent.reason()
    assert result is None


# ── 8.5 act() ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_act_calls_tool_and_returns_result():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()
    agent = PentestAgent(session=session, target="10.0.0.0/24", registry=registry, safety=safety)

    action = {"action": "nmap_scan", "parameters": {"target": "10.0.0.5", "scan_type": "ping"}}
    result = await agent.act(action)

    assert result["success"] is True


@pytest.mark.asyncio
async def test_act_returns_error_for_unknown_tool():
    session = _make_session()
    registry = _make_registry()
    agent = PentestAgent(session=session, target="10.0.0.0/24", registry=registry)

    action = {"action": "nonexistent_tool", "parameters": {}}
    result = await agent.act(action)

    assert result["success"] is False
    assert "Unknown tool" in result["error"]


@pytest.mark.asyncio
async def test_act_blocked_by_safety_scan_only():
    session = _make_session(mode="scan_only")
    registry = _make_registry()
    safety = _make_safety(allow_exploit=False)
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
    )

    action = {
        "action": "metasploit_run",
        "parameters": {"target_ip": "10.0.0.5", "module": "exploit/unix/ftp/vsftpd_234_backdoor"},
    }
    result = await agent.act(action)
    assert result["success"] is False
    assert "Safety" in result["error"]


@pytest.mark.asyncio
async def test_act_blocked_by_kill_switch():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()
    safety.emergency_stop()
    agent = PentestAgent(session=session, target="10.0.0.0/24", registry=registry, safety=safety)

    action = {"action": "nmap_scan", "parameters": {"target": "10.0.0.5"}}
    result = await agent.act(action)
    assert result["success"] is False


# ── 8.6 observe() ─────────────────────────────────────────────────────────────

def test_observe_adds_tool_result_to_memory():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    action = {"action": "nmap_scan", "parameters": {}}
    result = {"success": True, "output": {"hosts": []}, "error": None}
    agent.observe(result, action)
    assert agent.memory.message_count == 1


def test_observe_pins_searchsploit_success():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    action = {"action": "searchsploit_search", "parameters": {}}
    result = {"success": True, "output": [{"title": "vsftpd", "cve_id": "CVE-2011-2523"}], "error": None}
    agent.observe(result, action)
    assert agent.memory.pinned_count == 1


def test_observe_does_not_pin_failed_result():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    action = {"action": "searchsploit_search", "parameters": {}}
    result = {"success": False, "output": None, "error": "not found"}
    agent.observe(result, action)
    assert agent.memory.pinned_count == 0


# ── 8.6 observe() — context updates ──────────────────────────────────────────

def test_observe_nmap_ping_populates_discovered_hosts():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    action = {"action": "nmap_scan", "parameters": {"target": "10.0.0.0/24", "scan_type": "ping"}}
    result = {
        "success": True,
        "output": {
            "hosts": [
                {"ip": "10.0.0.5", "state": "up", "ports": []},
                {"ip": "10.0.0.6", "state": "down", "ports": []},
            ]
        },
        "error": None,
    }
    agent.observe(result, action)
    assert "10.0.0.5" in agent.context.discovered_hosts
    assert "10.0.0.6" not in agent.context.discovered_hosts


def test_observe_nmap_ping_advances_phase_to_port_scan():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    action = {"action": "nmap_scan", "parameters": {"target": "10.0.0.0/24", "scan_type": "ping"}}
    result = {
        "success": True,
        "output": {"hosts": [{"ip": "10.0.0.5", "state": "up", "ports": []}]},
        "error": None,
    }
    agent.observe(result, action)
    assert agent.context.attack_phase == "PORT_SCAN"


def test_observe_nmap_service_populates_scan_results():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    agent.context.discovered_hosts = ["10.0.0.5"]
    agent.context.attack_phase = "PORT_SCAN"

    action = {"action": "nmap_scan", "parameters": {"target": "10.0.0.5", "scan_type": "service"}}
    result = {
        "success": True,
        "output": {
            "hosts": [{
                "ip": "10.0.0.5",
                "state": "up",
                "ports": [
                    {"number": 21, "state": "open", "service": "ftp", "version": "vsftpd 2.3.4"},
                ],
            }]
        },
        "error": None,
    }
    agent.observe(result, action)
    assert any("vsftpd" in s for s in agent.context.scan_results)


def test_observe_searchsploit_populates_vulnerabilities():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    agent.context.attack_phase = "EXPLOIT_SEARCH"

    action = {"action": "searchsploit_search", "parameters": {"query": "vsftpd 2.3.4"}}
    result = {
        "success": True,
        "output": [{"title": "vsftpd 2.3.4 Backdoor", "cve_id": "CVE-2011-2523"}],
        "error": None,
    }
    agent.observe(result, action)
    assert any("CVE-2011-2523" in v for v in agent.context.vulnerabilities)


def test_observe_metasploit_populates_exploit_results():
    session = _make_session()
    agent = PentestAgent(session=session, target="10.0.0.0/24")
    action = {
        "action": "metasploit_run",
        "parameters": {
            "target_ip": "10.0.0.5",
            "module": "exploit/unix/ftp/vsftpd_234_backdoor",
        },
    }
    result = {"success": True, "output": {"session_id": 1}, "error": None}
    agent.observe(result, action)
    assert len(agent.context.exploit_results) == 1
    assert "10.0.0.5" in agent.context.exploit_results[0]


# ── 8.7 reflect() ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reflect_adds_to_memory():
    session = _make_session()
    llm = MagicMock()
    llm.chat = AsyncMock(return_value="Port scan complete. Focus on vsftpd exploit next.")
    agent = PentestAgent(session=session, target="10.0.0.0/24", llm=llm)
    await agent.reflect()
    assert agent.memory.message_count >= 1


@pytest.mark.asyncio
async def test_reflect_survives_llm_failure():
    session = _make_session()
    llm = MagicMock()
    llm.chat = AsyncMock(side_effect=RuntimeError("LLM down"))
    agent = PentestAgent(session=session, target="10.0.0.0/24", llm=llm)
    # Should not raise
    await agent.reflect()


# ── 8.8 run() — basic ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_terminates_on_generate_report():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()

    # Agent receives one reasoning step then immediately wants to report
    llm = _make_llm([
        _action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"}),
        "tactical update",  # reflect call
        _action_json("generate_report"),
        "final reflection",  # reflect call after
    ])

    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
        max_iterations=10,
    )
    ctx = await agent.run()
    assert agent.state == AgentState.DONE


@pytest.mark.asyncio
async def test_run_returns_agent_context():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()

    llm = _make_llm([_action_json("generate_report")])
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
    )
    ctx = await agent.run()
    assert isinstance(ctx, AgentContext)


# ── 8.14 Kill switch ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_stops_on_kill_switch():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()
    safety.emergency_stop()  # trigger BEFORE run

    llm = _make_llm([_action_json("nmap_scan", {"target": "10.0.0.0/24"})])
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
    )
    ctx = await agent.run()
    assert agent.state == AgentState.ERROR


@pytest.mark.asyncio
async def test_run_emits_kill_switch_event():
    session = _make_session()
    safety = _make_safety()
    safety.emergency_stop()

    events: list[str] = []

    def cb(event, data):
        events.append(event)

    llm = _make_llm([_action_json("nmap_scan")])
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        safety=safety,
        llm=llm,
        progress_callback=cb,
    )
    await agent.run()
    assert "kill_switch" in events


# ── 8.15 Max iterations guard ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_stops_at_max_iterations():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()

    # Always return nmap_scan — never generate_report → should hit max_iterations
    nmap_resp = _action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"})
    reflect_resp = "still scanning..."
    # Alternate: reason, reflect, reason, reflect, ...
    llm = _make_llm([nmap_resp, reflect_resp] * 10)

    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
        max_iterations=2,
    )
    ctx = await agent.run()
    assert agent.state == AgentState.DONE
    assert ctx.iteration >= 2


@pytest.mark.asyncio
async def test_run_emits_max_iterations_event():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()

    events: list[str] = []

    def cb(event, data):
        events.append(event)

    nmap_resp = _action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"})
    llm = _make_llm([nmap_resp, "reflect"] * 5)

    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
        max_iterations=1,
        progress_callback=cb,
    )
    await agent.run()
    assert "max_iterations" in events


# ── 8.16 Ask-before-exploit mode ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ask_before_exploit_denied_skips_action():
    session = _make_session(mode="ask_before_exploit")
    registry = _make_registry()
    safety = _make_safety()

    exploit_action = _action_json(
        "metasploit_run",
        {"target_ip": "10.0.0.5", "module": "exploit/unix/ftp/vsftpd_234_backdoor"},
    )
    # When denied, there is no reflect() call, so the next LLM call is another reason()
    llm = _make_llm([
        exploit_action,                   # reason() call 1 → denied, skip
        "not valid json for reason",      # reason() call 2 → JSON error → None
        _action_json("generate_report"),  # reason() call 3 → DONE
    ])

    async def deny_all(_action_dict):
        return False

    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        mode="ask_before_exploit",   # mode must be passed directly to the agent
        registry=registry,
        safety=safety,
        llm=llm,
        approval_callback=deny_all,
        max_iterations=5,
    )
    ctx = await agent.run()
    # metasploit_run should NOT have been called
    msf_tool = registry.get("metasploit_run")
    msf_tool.execute.assert_not_called()


@pytest.mark.asyncio
async def test_ask_before_exploit_approved_runs_action():
    session = _make_session(mode="ask_before_exploit")
    registry = _make_registry()
    safety = _make_safety()

    exploit_action = _action_json(
        "metasploit_run",
        {"target_ip": "10.0.0.5", "module": "exploit/unix/ftp/vsftpd_234_backdoor"},
    )
    llm = _make_llm([
        exploit_action,          # reason() call 1
        "reflecting post-exploit",  # reflect() call
        _action_json("generate_report"),  # reason() call 2
    ])

    async def approve_all(_action_dict):
        return True

    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        mode="ask_before_exploit",  # mode must be passed directly to the agent
        registry=registry,
        safety=safety,
        llm=llm,
        approval_callback=approve_all,
        max_iterations=5,
    )
    await agent.run()
    msf_tool = registry.get("metasploit_run")
    msf_tool.execute.assert_called_once()


@pytest.mark.asyncio
async def test_ask_before_exploit_auto_approves_with_no_callback():
    session = _make_session(mode="ask_before_exploit")
    registry = _make_registry()
    safety = _make_safety()

    exploit_action = _action_json(
        "metasploit_run",
        {"target_ip": "10.0.0.5", "module": "exploit/unix/ftp/vsftpd_234_backdoor"},
    )
    llm = _make_llm([
        exploit_action,         # reason() call 1
        "reflection",           # reflect() call
        _action_json("generate_report"),  # reason() call 2
    ])

    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        mode="ask_before_exploit",  # mode must be passed directly to the agent
        registry=registry,
        safety=safety,
        llm=llm,
        approval_callback=None,  # no callback → auto-approve
        max_iterations=5,
    )
    await agent.run()
    msf_tool = registry.get("metasploit_run")
    msf_tool.execute.assert_called_once()


# ── 8.17 Progress callbacks ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_progress_callback_receives_start_event():
    session = _make_session()
    safety = _make_safety()

    events: list[tuple] = []

    def cb(event, data):
        events.append((event, data))

    llm = _make_llm([_action_json("generate_report")])
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        safety=safety,
        llm=llm,
        progress_callback=cb,
    )
    await agent.run()

    event_names = [e[0] for e in events]
    assert "start" in event_names
    assert "done" in event_names


@pytest.mark.asyncio
async def test_progress_callback_receives_reasoning_event():
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()

    events: list[tuple] = []

    def cb(event, data):
        events.append((event, data))

    llm = _make_llm([
        _action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"}),
        "reflection",
        _action_json("generate_report"),
    ])
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
        progress_callback=cb,
        max_iterations=5,
    )
    await agent.run()

    event_names = [e[0] for e in events]
    assert "reasoning" in event_names


@pytest.mark.asyncio
async def test_progress_callback_does_not_crash_agent_on_error():
    session = _make_session()
    safety = _make_safety()

    def bad_cb(event, data):
        raise RuntimeError("callback exploded")

    llm = _make_llm([_action_json("generate_report")])
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        safety=safety,
        llm=llm,
        progress_callback=bad_cb,
    )
    # Should not raise even though callback throws
    ctx = await agent.run()
    assert ctx is not None


# ── 8.18 End-to-end ReAct loop ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_react_cycle_discovery_to_report():
    """
    Simulates: discovery → port scan → exploit search → exploitation → report
    All tools are mocked. LLM is scripted.
    """
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()

    # Script the LLM responses: each reason() call returns a specific action
    llm_responses = [
        # Step 1: ping sweep
        _action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"}),
        "reflection: found a live host",
        # Step 2: service scan
        _action_json("nmap_scan", {"target": "10.0.0.5", "scan_type": "service"}),
        "reflection: found vsftpd 2.3.4",
        # Step 3: searchsploit
        _action_json("searchsploit_search", {"query": "vsftpd 2.3.4"}),
        "reflection: found a backdoor exploit",
        # Step 4: exploit
        _action_json(
            "metasploit_run",
            {
                "target_ip": "10.0.0.5",
                "target_port": 21,
                "module": "exploit/unix/ftp/vsftpd_234_backdoor",
            },
        ),
        "reflection: got a session",
        # Step 5: report
        _action_json("generate_report"),
    ]

    # Inject nmap service scan output into the nmap tool mock
    nmap_tool = registry.get("nmap_scan")
    nmap_tool.execute = AsyncMock(side_effect=[
        # First call: ping sweep → 10.0.0.5 is up
        {
            "success": True,
            "output": {"hosts": [{"ip": "10.0.0.5", "state": "up", "ports": []}]},
            "error": None,
        },
        # Second call: service scan → vsftpd
        {
            "success": True,
            "output": {
                "hosts": [{
                    "ip": "10.0.0.5",
                    "state": "up",
                    "ports": [
                        {
                            "number": 21,
                            "state": "open",
                            "service": "ftp",
                            "version": "vsftpd 2.3.4",
                        }
                    ],
                }]
            },
            "error": None,
        },
    ])

    llm = _make_llm(llm_responses)
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
        max_iterations=10,
    )
    ctx = await agent.run()

    assert agent.state == AgentState.DONE
    assert "10.0.0.5" in ctx.discovered_hosts
    assert any("vsftpd" in s for s in ctx.scan_results)
    assert len(ctx.vulnerabilities) >= 1
    assert len(ctx.exploit_results) >= 1


@pytest.mark.asyncio
async def test_scan_only_mode_never_calls_metasploit():
    session = _make_session(mode="scan_only")
    registry = _make_registry()
    safety = _make_safety(allow_exploit=False)

    llm_responses = [
        _action_json("nmap_scan", {"target": "10.0.0.0/24", "scan_type": "ping"}),
        "reflection: found host",
        _action_json("searchsploit_search", {"query": "vsftpd 2.3.4"}),
        "reflection: found vuln but scan_only",
        _action_json("generate_report"),
    ]

    llm = _make_llm(llm_responses)
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
        max_iterations=10,
    )
    await agent.run()

    msf_tool = registry.get("metasploit_run")
    msf_tool.execute.assert_not_called()


@pytest.mark.asyncio
async def test_state_transitions_during_run():
    """Verify that states transition in the correct order."""
    session = _make_session()
    registry = _make_registry()
    safety = _make_safety()

    state_log: list[str] = []

    def cb(event, data):
        if event == "reasoning":
            state_log.append("REASONING")
        elif event in ("tool_call", "action"):
            state_log.append("ACTING")
        elif event == "observation":
            state_log.append("OBSERVING")
        elif event == "reflection":
            state_log.append("REFLECTING")
        elif event == "done":
            state_log.append("DONE")

    # Use a single IP target so the safety guard passes Rule 1
    llm = _make_llm([
        _action_json("nmap_scan", {"target": "10.0.0.5", "scan_type": "service"}),
        "reflection text",           # reflect() call after act+observe
        _action_json("generate_report"),
    ])
    agent = PentestAgent(
        session=session,
        target="10.0.0.0/24",
        registry=registry,
        safety=safety,
        llm=llm,
        max_iterations=5,
        progress_callback=cb,
    )
    await agent.run()

    # Verify core ReAct sequence present
    assert "REASONING" in state_log
    assert "ACTING" in state_log
    assert "OBSERVING" in state_log
