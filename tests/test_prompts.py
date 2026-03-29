"""
Phase 9 — Prompt Engineering Tests

Tests for PromptBuilder: structure, token estimation, format enforcement,
few-shot inclusion logic, context rendering, and tool schema formatting.
"""

import pytest
from core.prompts import PromptBuilder
from core.agent import AgentContext
from core.memory import SessionMemory


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def builder() -> PromptBuilder:
    return PromptBuilder(include_examples=True)


@pytest.fixture
def builder_no_examples() -> PromptBuilder:
    return PromptBuilder(include_examples=False)


@pytest.fixture
def empty_context() -> AgentContext:
    return AgentContext(target="10.0.0.0/24", mode="full_auto")


@pytest.fixture
def rich_context() -> AgentContext:
    ctx = AgentContext(target="192.168.1.0/24", mode="full_auto")
    ctx.discovered_hosts = ["192.168.1.5", "192.168.1.10"]
    ctx.scan_results = [
        "192.168.1.5:21 ftp vsftpd 2.3.4",
        "192.168.1.5:22 ssh OpenSSH 7.4",
        "192.168.1.10:80 http Apache 2.2.8",
    ]
    ctx.vulnerabilities = [
        "vsftpd 2.3.4 Backdoor Command Execution [CVE-2011-2523]",
    ]
    ctx.exploit_results = [
        "192.168.1.5 | exploit/unix/ftp/vsftpd_234_backdoor | session_id=1"
    ]
    ctx.attack_phase = "EXPLOITATION"
    ctx.iteration = 5
    return rich_context


@pytest.fixture
def sample_tools() -> list[dict]:
    return [
        {
            "name": "nmap_scan",
            "description": "Run an Nmap scan on a target.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {"type": "string"},
                    "scan_type": {"type": "string"},
                },
                "required": ["target"],
            },
        },
        {
            "name": "searchsploit_search",
            "description": "Search exploit-db via searchsploit.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    ]


@pytest.fixture
def memory_with_history() -> SessionMemory:
    mem = SessionMemory()
    mem.add_user("Scan 10.0.0.1")
    mem.add_assistant('{"action": "nmap_scan", "parameters": {"target": "10.0.0.1", "scan_type": "ping"}, "thought": "t", "reasoning": "r"}')
    mem.add_tool_result("TOOL_RESULT: nmap_scan\nSUCCESS: True\nOUTPUT: hosts found")
    return mem


# ── 9.1 PromptBuilder instantiation ───────────────────────────────────────────

def test_prompt_builder_instantiates(builder):
    assert builder is not None
    assert isinstance(builder, PromptBuilder)


def test_prompt_builder_no_examples_flag(builder_no_examples):
    assert builder_no_examples._include_examples is False


# ── 9.2 System prompt content ─────────────────────────────────────────────────

def test_system_prompt_contains_tirpan_identity(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "TIRPAN" in system


def test_system_prompt_contains_constraints(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "DoS" in system
    assert "destructive" in system
    assert "scan_only" in system


def test_system_prompt_contains_attack_phases(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "DISCOVERY" in system
    assert "PORT_SCAN" in system
    assert "EXPLOIT_SEARCH" in system
    assert "EXPLOITATION" in system


def test_system_prompt_enforces_json_output(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "JSON" in system
    assert '"thought"' in system
    assert '"action"' in system
    assert '"parameters"' in system
    assert '"reasoning"' in system


# ── 9.3 Context prompt ────────────────────────────────────────────────────────

def test_context_prompt_shows_target(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    user_msg = messages[-1]["content"]
    assert "10.0.0.0/24" in user_msg


def test_context_prompt_shows_mode(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    user_msg = messages[-1]["content"]
    assert "full_auto" in user_msg


def test_context_prompt_shows_attack_phase(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    user_msg = messages[-1]["content"]
    assert "DISCOVERY" in user_msg


def test_context_prompt_shows_discovered_hosts(builder, sample_tools):
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    ctx.discovered_hosts = ["10.0.0.5", "10.0.0.6"]
    messages = builder.build_full_prompt(ctx, SessionMemory(), sample_tools)
    user_msg = messages[-1]["content"]
    assert "10.0.0.5" in user_msg
    assert "10.0.0.6" in user_msg


def test_context_prompt_shows_vulnerabilities(builder, sample_tools):
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    ctx.vulnerabilities = ["vsftpd 2.3.4 Backdoor [CVE-2011-2523]"]
    messages = builder.build_full_prompt(ctx, SessionMemory(), sample_tools)
    user_msg = messages[-1]["content"]
    assert "CVE-2011-2523" in user_msg


def test_scan_only_warning_shown(builder, sample_tools):
    ctx = AgentContext(target="10.0.0.0/24", mode="scan_only")
    messages = builder.build_full_prompt(ctx, SessionMemory(), sample_tools)
    user_msg = messages[-1]["content"]
    assert "Exploitation is DISABLED" in user_msg


def test_scan_only_warning_not_shown_in_full_auto(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    user_msg = messages[-1]["content"]
    assert "Exploitation is DISABLED" not in user_msg


# ── 9.4 Tool descriptions ─────────────────────────────────────────────────────

def test_tool_names_in_system_prompt(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "nmap_scan" in system
    assert "searchsploit_search" in system


def test_tool_parameter_schema_in_system_prompt(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    # JSON schema fields should appear
    assert "scan_type" in system
    assert "query" in system


def test_empty_tools_handled(builder, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), [])
    system = messages[0]["content"]
    assert "none" in system.lower()


# ── 9.5 Action selection prompt ───────────────────────────────────────────────

def test_action_prompt_instructs_json(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    last_user = messages[-1]["content"]
    assert "JSON" in last_user


def test_messages_list_has_correct_roles(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    # First must be system, last must be user
    assert messages[0]["role"] == "system"
    assert messages[-1]["role"] == "user"


# ── 9.6 Few-shot examples ─────────────────────────────────────────────────────

def test_few_shot_examples_in_early_phase(builder, sample_tools, empty_context):
    # DISCOVERY phase with iteration 1 should include examples
    empty_context.iteration = 1
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "Example 1" in system
    assert "nmap_scan" in system


def test_few_shot_examples_excluded_when_flag_off(builder_no_examples, sample_tools, empty_context):
    messages = builder_no_examples.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "Example 1" not in system


def test_few_shot_examples_dropped_in_exploitation_phase(builder, sample_tools):
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    ctx.attack_phase = "EXPLOITATION"
    ctx.iteration = 5
    messages = builder.build_full_prompt(ctx, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    # Examples should be suppressed for token savings
    assert "Example 1" not in system


def test_few_shot_examples_dropped_after_many_iterations(builder, sample_tools, empty_context):
    empty_context.iteration = 25  # > 20 threshold
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    assert "Example 1" not in system


# ── 9.7 Reflection prompt ─────────────────────────────────────────────────────

def test_reflection_messages_has_system_and_user(builder, empty_context):
    msgs = builder.build_reflection_messages(empty_context, SessionMemory())
    assert msgs[0]["role"] == "system"
    assert msgs[-1]["role"] == "user"


def test_reflection_system_prompt_is_concise(builder, empty_context):
    msgs = builder.build_reflection_messages(empty_context, SessionMemory())
    system = msgs[0]["content"]
    assert "reflection" in system.lower()
    assert "tactical" in system.lower()


def test_reflection_user_prompt_includes_stats(builder):
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    ctx.discovered_hosts = ["10.0.0.5"]
    ctx.vulnerabilities = ["some-vuln"]
    msgs = builder.build_reflection_messages(ctx, SessionMemory())
    user = msgs[-1]["content"]
    assert "EXPLOITATION" in user or "DISCOVERY" in user  # attack phase
    assert "1" in user  # host count or vuln count


def test_reflection_includes_memory_history(builder, memory_with_history):
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    msgs = builder.build_reflection_messages(ctx, memory_with_history)
    # Should have system + history + user
    assert len(msgs) >= 3


# ── 9.8 Output format enforcement ─────────────────────────────────────────────

def test_output_format_fields_listed(builder, sample_tools, empty_context):
    messages = builder.build_full_prompt(empty_context, SessionMemory(), sample_tools)
    system = messages[0]["content"]
    # All 4 required JSON keys must be described
    for key in ('"thought"', '"action"', '"parameters"', '"reasoning"'):
        assert key in system, f"Missing key in system prompt: {key}"


# ── 9.9 Dynamic prompt assembly ───────────────────────────────────────────────

def test_memory_history_included_in_full_prompt(builder, sample_tools, memory_with_history):
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    messages = builder.build_full_prompt(ctx, memory_with_history, sample_tools)
    # Message count should be > 2 (system + at least some history + user)
    assert len(messages) > 2


def test_full_prompt_always_ends_with_user_message(builder, sample_tools):
    ctx = AgentContext(target="10.0.0.0/24", mode="full_auto")
    for phase in ("DISCOVERY", "PORT_SCAN", "EXPLOIT_SEARCH", "EXPLOITATION"):
        ctx.attack_phase = phase
        messages = builder.build_full_prompt(ctx, SessionMemory(), sample_tools)
        assert messages[-1]["role"] == "user"


# ── 9.10 Token estimation ──────────────────────────────────────────────────────

def test_token_estimation_returns_positive_int():
    assert PromptBuilder.estimate_tokens("hello world") > 0


def test_token_estimation_empty_string():
    # Even empty string should return at least 1
    assert PromptBuilder.estimate_tokens("") == 1


def test_token_estimation_scales_with_length():
    short = PromptBuilder.estimate_tokens("hi")
    long = PromptBuilder.estimate_tokens("hi " * 100)
    assert long > short


def test_token_estimation_rough_ratio():
    # 400 chars → ~100 tokens (chars/4 heuristic)
    text = "a" * 400
    tokens = PromptBuilder.estimate_tokens(text)
    assert 90 <= tokens <= 110
