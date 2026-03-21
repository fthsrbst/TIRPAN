"""
Tests for V2 specialized agents (Steps 6–13).

Tests cover:
  - BaseSpecializedAgent constructor kwarg stripping
  - publish_finding() / publish_done() bus integration
  - ScannerAgent.process_result() host/port parsing
  - ExploitAgent.process_result() session/fail detection
  - PostExploitAgent.process_result() root detection
  - LateralMovementAgent permission gating (allow_lateral_movement)
  - All agents: get_available_tools() returns correct tool list
  - All agents: build_messages() includes system + memory
  - _register_agent_type() self-registration into BrainAgent registry
"""

from __future__ import annotations

import asyncio
import sys
import os

# Make sure AEGIS root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest

from unittest.mock import AsyncMock, MagicMock, patch

from core.message_bus import AgentMessage, AgentMessageBus, MessageType
from core.mission_context import MissionContext


# ── helpers ──────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.run(coro)


def _make_bus():
    return AgentMessageBus()


def _make_ctx(allow_lateral=True, allow_data_exfil=False):
    ctx = MissionContext(
        mission_id="test-001",
        target="10.0.0.1",
        scope=["10.0.0.0/24"],
        mode="full_auto",
        allow_lateral_movement=allow_lateral,
        allow_data_exfil=allow_data_exfil,
    )
    return ctx


def _minimal_kwargs(**extra):
    """Minimal kwargs needed to construct a BaseSpecializedAgent subclass."""
    from core.tool_registry import ToolRegistry
    from core.safety import SafetyGuard
    from config import SafetyConfig

    safety = SafetyGuard(SafetyConfig())
    registry = ToolRegistry()
    return {
        "agent_id": "test-agent-001",
        "agent_type": "scanner",
        "mission_id": "mission-test-001",
        "tool_registry": registry,
        "safety": safety,
        **extra,
    }


# ── BaseSpecializedAgent ──────────────────────────────────────────────────────

class TestBaseSpecializedAgent:

    def test_kwargs_stripped(self):
        """V2-specific kwargs must be consumed before passing to BaseAgent."""
        from core.agents.base_specialized import BaseSpecializedAgent

        # Create a minimal concrete subclass
        class MinimalAgent(BaseSpecializedAgent):
            def get_available_tools(self): return []
            def build_messages(self): return []
            async def process_result(self, *a): pass

        bus = _make_bus()
        ctx = _make_ctx()
        agent = MinimalAgent(
            message_bus=bus,
            mission_context=ctx,
            target="192.168.1.1",
            task_type="scan",
            **_minimal_kwargs(agent_type="scanner"),
        )
        assert agent.bus is bus
        assert agent.ctx is ctx
        assert agent.target == "192.168.1.1"
        assert agent.task_type == "scan"

    def test_no_bus_defaults(self):
        """Bus and ctx are optional — should default to None."""
        from core.agents.base_specialized import BaseSpecializedAgent

        class MinimalAgent(BaseSpecializedAgent):
            def get_available_tools(self): return []
            def build_messages(self): return []
            async def process_result(self, *a): pass

        agent = MinimalAgent(**_minimal_kwargs(agent_type="scanner"))
        assert agent.bus is None
        assert agent.ctx is None
        assert agent.target == ""

    def test_publish_finding_no_bus(self):
        """publish_finding is a no-op when bus is None."""
        from core.agents.base_specialized import BaseSpecializedAgent

        class MinimalAgent(BaseSpecializedAgent):
            def get_available_tools(self): return []
            def build_messages(self): return []
            async def process_result(self, *a): pass

        agent = MinimalAgent(**_minimal_kwargs(agent_type="scanner"))
        # Must not raise
        run(agent.publish_finding({"type": "host", "ip": "1.2.3.4"}))

    def test_publish_finding_with_bus(self):
        """publish_finding sends FINDING message with agent metadata."""
        from core.agents.base_specialized import BaseSpecializedAgent

        class MinimalAgent(BaseSpecializedAgent):
            def get_available_tools(self): return []
            def build_messages(self): return []
            async def process_result(self, *a): pass

        bus = _make_bus()
        received = []

        async def collect(msg):
            received.append(msg)

        agent = MinimalAgent(
            message_bus=bus,
            target="10.0.0.5",
            **_minimal_kwargs(agent_type="scanner"),
        )

        async def _run():
            bus.subscribe_global(collect)
            await agent.publish_finding({"type": "host", "ip": "10.0.0.5"})

        run(_run())
        assert len(received) == 1
        assert received[0].msg_type == MessageType.FINDING
        assert received[0].payload["type"] == "host"
        assert received[0].payload["agent_id"] == agent.agent_id

    def test_publish_done_sends_agent_done(self):
        """publish_done sends AGENT_DONE with result fields."""
        from core.agents.base_specialized import BaseSpecializedAgent
        from core.base_agent import AgentResult

        class MinimalAgent(BaseSpecializedAgent):
            def get_available_tools(self): return []
            def build_messages(self): return []
            async def process_result(self, *a): pass

        bus = _make_bus()
        received = []

        async def collect(msg):
            received.append(msg)

        agent = MinimalAgent(
            message_bus=bus,
            **_minimal_kwargs(agent_type="scanner"),
        )
        result = AgentResult(agent_id="test-agent-001", agent_type="scanner", status="success", findings=[{"type": "host"}], iterations=3)

        async def _run():
            bus.subscribe_global(collect)
            await agent.publish_done(result)

        run(_run())
        assert received[0].msg_type == MessageType.AGENT_DONE
        assert received[0].payload["status"] == "success"
        assert received[0].payload["iterations"] == 3

    def test_base_system_prompt_includes_target(self):
        """_base_system() must include target and task_type in system prompt."""
        from core.agents.base_specialized import BaseSpecializedAgent

        class MinimalAgent(BaseSpecializedAgent):
            def get_available_tools(self): return []
            def build_messages(self): return []
            async def process_result(self, *a): pass

        agent = MinimalAgent(
            target="172.16.0.0/24",
            task_type="discovery",
            **_minimal_kwargs(agent_type="scanner"),
        )
        prompt = agent._base_system("TestAgent", "TOOLS HERE")
        assert "172.16.0.0/24" in prompt
        assert "discovery" in prompt
        assert "TOOLS HERE" in prompt


# ── ScannerAgent ─────────────────────────────────────────────────────────────

class TestScannerAgent:

    def _make_agent(self, **kw):
        from core.agents.scanner_agent import ScannerAgent
        return ScannerAgent(
            target="10.0.0.1",
            **_minimal_kwargs(agent_type="scanner"),
            **kw,
        )

    def test_get_available_tools_base(self):
        agent = self._make_agent()
        tools = agent.get_available_tools()
        assert "nmap_scan" in tools
        assert "report_finding" in tools

    def test_build_messages_has_system(self):
        agent = self._make_agent()
        msgs = agent.build_messages()
        assert msgs[0]["role"] == "system"
        assert "ScannerAgent" in msgs[0]["content"]

    def test_process_scan_result_creates_finding(self):
        """A successful nmap result with open ports should produce a host finding."""
        agent = self._make_agent()
        bus = _make_bus()
        agent.bus = bus
        received = []

        async def collect(msg):
            received.append(msg)

        result = {
            "status": "success",
            "hosts": [{
                "ip": "10.0.0.1",
                "hostname": "target.local",
                "ports": [
                    {"port": 22, "state": "open", "service": "ssh", "version": "OpenSSH 8.0"},
                    {"port": 80, "state": "open", "service": "http"},
                    {"port": 3306, "state": "closed", "service": "mysql"},
                ],
            }],
        }

        async def _run():
            bus.subscribe_global(collect)
            await agent.process_result("nmap_scan", result, {})

        run(_run())

        assert len(received) == 1
        finding = received[0].payload
        assert finding["type"] == "host"
        assert finding["ip"] == "10.0.0.1"
        assert any(p["number"] == 22 for p in finding["ports"])
        # closed port must NOT appear
        assert not any(p["number"] == 3306 for p in finding["ports"])
        assert len(agent._findings) == 1

    def test_process_scan_result_empty_hosts(self):
        """Empty hosts list produces no findings."""
        agent = self._make_agent()
        run(agent.process_result("nmap_scan", {"status": "success", "hosts": []}, {}))
        assert agent._findings == []

    def test_process_scan_result_error_status(self):
        """Error result must be silently ignored."""
        agent = self._make_agent()
        run(agent.process_result("nmap_scan", {"status": "error", "error": "timeout"}, {}))
        assert agent._findings == []

    def test_process_report_finding(self):
        """report_finding action must create a finding."""
        agent = self._make_agent()
        action = {"parameters": {"finding_type": "service", "data": {"service": "ftp", "port": 21}}}
        run(agent.process_result("report_finding", {}, action))
        assert len(agent._findings) == 1
        assert agent._findings[0]["type"] == "service"
        assert agent._findings[0]["port"] == 21

    def test_registered_in_brain(self):
        """ScannerAgent must self-register as 'scanner' in BrainAgent registry."""
        import core.agents.scanner_agent  # noqa: ensure registration
        from core.brain_agent import _AGENT_REGISTRY
        assert "scanner" in _AGENT_REGISTRY
        assert _AGENT_REGISTRY["scanner"][1] == "ScannerAgent"


# ── ExploitAgent ──────────────────────────────────────────────────────────────

class TestExploitAgent:

    def _make_agent(self, **kw):
        from core.agents.exploit_agent import ExploitAgent
        return ExploitAgent(
            target="10.0.0.1",
            **_minimal_kwargs(agent_type="exploit"),
            **kw,
        )

    def test_get_available_tools(self):
        agent = self._make_agent()
        tools = agent.get_available_tools()
        assert "searchsploit" in tools
        assert "metasploit_run" in tools
        assert "report_finding" in tools

    def test_process_msf_session_opened(self):
        """session_id in MSF result → session finding."""
        agent = self._make_agent()
        result = {"session_id": 1, "status": "success", "output": "meterpreter >"}
        action = {"parameters": {"module": "exploit/multi/handler", "rhosts": "10.0.0.1"}}
        run(agent.process_result("metasploit_run", result, action))
        assert len(agent._findings) == 1
        f = agent._findings[0]
        assert f["type"] == "session"
        assert f["host_ip"] == "10.0.0.1"
        assert f["msf_session_id"] == 1

    def test_process_msf_session_bool(self):
        """session_opened=True (bool) in MSF result → session finding."""
        agent = self._make_agent()
        result = {"session_opened": True, "status": "success"}
        action = {"parameters": {"module": "exploit/linux/local/foo", "rhosts": "10.0.0.1"}}
        run(agent.process_result("metasploit_run", result, action))
        assert agent._findings[0]["type"] == "session"

    def test_process_msf_failed(self):
        """No session → exploit_attempt finding with success=False."""
        agent = self._make_agent()
        result = {"status": "error", "error": "No session created"}
        action = {"parameters": {"module": "exploit/foo", "rhosts": "10.0.0.1"}}
        run(agent.process_result("metasploit_run", result, action))
        assert agent._findings[0]["type"] == "exploit_attempt"
        assert agent._findings[0]["success"] is False

    def test_registered_in_brain(self):
        import core.agents.exploit_agent  # noqa
        from core.brain_agent import _AGENT_REGISTRY
        assert "exploit" in _AGENT_REGISTRY


# ── PostExploitAgent ──────────────────────────────────────────────────────────

class TestPostExploitAgent:

    def _make_agent(self, allow_data_exfil=False, **kw):
        from core.agents.postexploit_agent import PostExploitAgent
        ctx = _make_ctx(allow_data_exfil=allow_data_exfil)
        return PostExploitAgent(
            target="10.0.0.1",
            mission_context=ctx,
            **_minimal_kwargs(agent_type="post_exploit"),
            **kw,
        )

    def test_tools_without_exfil(self):
        agent = self._make_agent(allow_data_exfil=False)
        tools = agent.get_available_tools()
        assert "shell_exec" in tools
        assert "report_finding" in tools
        assert "file_read" not in tools

    def test_tools_with_exfil(self):
        agent = self._make_agent(allow_data_exfil=True)
        assert "file_read" in agent.get_available_tools()

    def test_root_detection_from_id(self):
        """id command output with uid=0 → session finding with privilege_level=3."""
        agent = self._make_agent()
        result = {"status": "success", "output": "uid=0(root) gid=0(root) groups=0(root)"}
        action = {"parameters": {"command": "id"}}
        run(agent.process_result("shell_exec", result, action))
        assert agent._findings[0]["type"] == "session"
        assert agent._findings[0]["privilege_level"] == 3

    def test_no_finding_for_non_root(self):
        """Non-root id output → no automatic finding."""
        agent = self._make_agent()
        result = {"status": "success", "output": "uid=1000(user) gid=1000(user)"}
        action = {"parameters": {"command": "id"}}
        run(agent.process_result("shell_exec", result, action))
        assert agent._findings == []

    def test_report_finding_passthrough(self):
        agent = self._make_agent()
        action = {"parameters": {"finding_type": "credential", "data": {"username": "root", "password": "toor"}}}
        run(agent.process_result("report_finding", {}, action))
        assert agent._findings[0]["type"] == "credential"
        assert agent._findings[0]["username"] == "root"

    def test_registered_in_brain(self):
        import core.agents.postexploit_agent  # noqa
        from core.brain_agent import _AGENT_REGISTRY
        assert "post_exploit" in _AGENT_REGISTRY


# ── LateralMovementAgent ──────────────────────────────────────────────────────

class TestLateralMovementAgent:

    def _make_agent(self, allow_lateral=True, **kw):
        from core.agents.lateral_agent import LateralMovementAgent
        ctx = _make_ctx(allow_lateral=allow_lateral)
        return LateralMovementAgent(
            target="10.0.0.2",
            mission_context=ctx,
            **_minimal_kwargs(agent_type="lateral"),
            **kw,
        )

    def test_tools_permitted(self):
        agent = self._make_agent(allow_lateral=True)
        tools = agent.get_available_tools()
        assert "report_finding" in tools
        assert "shell_exec" in tools

    def test_tools_blocked_when_not_permitted(self):
        """When allow_lateral_movement=False, get_available_tools returns []."""
        agent = self._make_agent(allow_lateral=False)
        assert agent.get_available_tools() == []

    def test_process_cme_session_opened(self):
        """crackmapexec with session_opened=True → session + lateral_edge findings."""
        agent = self._make_agent()
        result = {"status": "success", "session_opened": True, "output": "..."}
        action = {"parameters": {"targets": "10.0.0.5", "username": "admin", "password": "pass"}}
        run(agent.process_result("crackmapexec_run", result, action))
        types = [f["type"] for f in agent._findings]
        assert "session" in types
        assert "lateral_edge" in types

    def test_process_impacket_session(self):
        """impacket with shell=True → session + lateral_edge findings."""
        agent = self._make_agent()
        result = {"status": "success", "shell": True, "output": "C:\\>"}
        action = {"parameters": {"target": "10.0.0.10", "username": "Administrator"}}
        run(agent.process_result("impacket_run", result, action))
        types = [f["type"] for f in agent._findings]
        assert "session" in types

    def test_no_finding_on_failure(self):
        """Failed tool call → no findings."""
        agent = self._make_agent()
        result = {"status": "error", "error": "auth failed"}
        action = {"parameters": {"targets": "10.0.0.5", "username": "admin"}}
        run(agent.process_result("crackmapexec_run", result, action))
        assert agent._findings == []

    def test_registered_in_brain(self):
        import core.agents.lateral_agent  # noqa
        from core.brain_agent import _AGENT_REGISTRY
        assert "lateral" in _AGENT_REGISTRY


# ── WebAppAgent ───────────────────────────────────────────────────────────────

class TestWebAppAgent:

    def _make_agent(self, **kw):
        from core.agents.webapp_agent import WebAppAgent
        from core.tool_registry import ToolRegistry
        from tools.whatweb_tool import WhatWebTool
        from tools.nikto_tool import NiktoTool
        from tools.nuclei_tool import NucleiTool
        from tools.ffuf_tool import FfufTool
        registry = ToolRegistry()
        registry.register(WhatWebTool())
        registry.register(NiktoTool())
        registry.register(NucleiTool())
        registry.register(FfufTool())
        kw_merged = {**_minimal_kwargs(agent_type="webapp"), **kw}
        kw_merged["tool_registry"] = registry
        return WebAppAgent(target="http://10.0.0.1", **kw_merged)

    def test_tools_present(self):
        agent = self._make_agent()
        tools = agent.get_available_tools()
        assert "whatweb_scan" in tools
        assert "nikto_scan" in tools
        assert "nuclei_scan" in tools
        assert "ffuf_scan" in tools
        assert "report_finding" in tools

    def test_build_messages_system_prompt(self):
        agent = self._make_agent()
        msgs = agent.build_messages()
        assert msgs[0]["role"] == "system"
        assert "WebAppAgent" in msgs[0]["content"]

    def test_registered_in_brain(self):
        import core.agents.webapp_agent  # noqa
        from core.brain_agent import _AGENT_REGISTRY
        assert "webapp" in _AGENT_REGISTRY


# ── OsintAgent ────────────────────────────────────────────────────────────────

class TestOsintAgent:

    def _make_agent(self, **kw):
        from core.agents.osint_agent import OSINTAgent
        from core.tool_registry import ToolRegistry
        from tools.theharvester_tool import TheHarvesterTool
        from tools.subfinder_tool import SubfinderTool
        from tools.whois_tool import WhoisTool
        from tools.dns_tool import DnsTool
        registry = ToolRegistry()
        registry.register(TheHarvesterTool())
        registry.register(SubfinderTool())
        registry.register(WhoisTool())
        registry.register(DnsTool())
        kw_merged = {**_minimal_kwargs(agent_type="osint"), **kw}
        kw_merged["tool_registry"] = registry
        return OSINTAgent(target="example.com", **kw_merged)

    def test_tools_present(self):
        agent = self._make_agent()
        tools = agent.get_available_tools()
        assert "theharvester_scan" in tools
        assert "subfinder_scan" in tools
        assert "whois_lookup" in tools
        assert "dns_enum" in tools
        assert "report_finding" in tools

    def test_registered_in_brain(self):
        import core.agents.osint_agent  # noqa
        from core.brain_agent import _AGENT_REGISTRY
        assert "osint" in _AGENT_REGISTRY


# ── ReportingAgent ────────────────────────────────────────────────────────────

class TestReportingAgent:

    def _make_agent(self, **kw):
        from core.agents.reporting_agent import ReportingAgent
        ctx = _make_ctx()
        return ReportingAgent(
            target="10.0.0.0/24",
            mission_context=ctx,
            **_minimal_kwargs(agent_type="reporting"),
            **kw,
        )

    def test_tools_present(self):
        agent = self._make_agent()
        assert "generate_report" in agent.get_available_tools()
        assert "report_finding" in agent.get_available_tools()

    def test_process_report_generated(self):
        """generate_report success → report_generated finding."""
        agent = self._make_agent()
        result = {"status": "success", "path": "/tmp/report.html", "size": 4096}
        action = {"parameters": {"format": "html"}}
        run(agent.process_result("generate_report", result, action))
        assert agent._findings[0]["type"] == "report_generated"
        assert agent._findings[0]["format"] == "html"

    def test_build_context_report(self):
        """_build_context_report returns dict with ctx stats."""
        agent = self._make_agent()
        result = run(agent._build_context_report())
        assert result["status"] == "success"
        assert "hosts" in result

    def test_registered_in_brain(self):
        import core.agents.reporting_agent  # noqa
        from core.brain_agent import _AGENT_REGISTRY
        assert "reporting" in _AGENT_REGISTRY


# ── Registry completeness ─────────────────────────────────────────────────────

class TestAgentRegistry:

    def test_all_expected_types_registered(self):
        """After importing all agents, registry must contain all 7 types."""
        import core.agents.scanner_agent      # noqa
        import core.agents.exploit_agent      # noqa
        import core.agents.postexploit_agent  # noqa
        import core.agents.webapp_agent       # noqa
        import core.agents.osint_agent        # noqa
        import core.agents.lateral_agent      # noqa
        import core.agents.reporting_agent    # noqa

        from core.brain_agent import _AGENT_REGISTRY
        expected = {"scanner", "exploit", "post_exploit", "webapp", "osint", "lateral", "reporting"}
        assert expected.issubset(set(_AGENT_REGISTRY.keys()))

    def test_registry_entries_have_module_and_class(self):
        from core.brain_agent import _AGENT_REGISTRY
        for agent_type, (module_path, class_name) in _AGENT_REGISTRY.items():
            assert "." in module_path, f"{agent_type}: module_path must contain dot"
            assert class_name[0].isupper(), f"{agent_type}: class_name must be capitalized"
