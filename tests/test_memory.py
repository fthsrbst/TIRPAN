"""
Phase 7 — SessionMemory tests

Covers: message types, bounded window, token estimation,
auto-truncation, pinning, serialization.
"""

import pytest
from core.memory import SessionMemory, Message


# ------------------------------------------------------------------
# 7.1 / 7.2 — Basic message history + bounded window
# ------------------------------------------------------------------

class TestMessageHistory:
    def test_add_message(self):
        mem = SessionMemory()
        mem.add("user", "hello")
        assert mem.message_count == 1

    def test_all_message_types(self):
        mem = SessionMemory()
        mem.add_system("You are TIRPAN.")
        mem.add_user("Scan 10.0.0.1")
        mem.add_assistant("Running nmap...")
        mem.add_tool_result('{"hosts": []}')
        assert mem.message_count == 4

    def test_bounded_window_drops_oldest(self):
        mem = SessionMemory(max_messages=3)
        mem.add("user", "msg1")
        mem.add("user", "msg2")
        mem.add("user", "msg3")
        mem.add("user", "msg4")  # should push out msg1
        assert mem.message_count == 3
        context = mem.build_context()
        contents = [m["content"] for m in context]
        assert "msg1" not in contents
        assert "msg4" in contents

    def test_clear(self):
        mem = SessionMemory()
        mem.add("user", "hello")
        mem.clear()
        assert mem.message_count == 0


# ------------------------------------------------------------------
# 7.3 — Message types
# ------------------------------------------------------------------

class TestMessageTypes:
    def test_system_role(self):
        mem = SessionMemory()
        mem.add_system("system prompt")
        ctx = mem.build_context()
        assert ctx[0]["role"] == "system"

    def test_tool_result_role(self):
        mem = SessionMemory()
        mem.add_tool_result('{"result": "ok"}')
        ctx = mem.build_context()
        assert ctx[0]["role"] == "tool_result"


# ------------------------------------------------------------------
# 7.4 — Context builder
# ------------------------------------------------------------------

class TestBuildContext:
    def test_returns_list_of_dicts(self):
        mem = SessionMemory()
        mem.add("user", "hello")
        ctx = mem.build_context()
        assert isinstance(ctx, list)
        assert all("role" in m and "content" in m for m in ctx)

    def test_context_preserves_order(self):
        mem = SessionMemory()
        for i in range(5):
            mem.add("user", f"msg{i}")
        ctx = mem.build_context()
        contents = [m["content"] for m in ctx]
        assert contents == ["msg0", "msg1", "msg2", "msg3", "msg4"]

    def test_empty_memory_returns_empty_list(self):
        mem = SessionMemory()
        assert mem.build_context() == []


# ------------------------------------------------------------------
# 7.5 — Token estimation
# ------------------------------------------------------------------

class TestTokenEstimation:
    def test_token_estimate_nonzero(self):
        mem = SessionMemory()
        mem.add("user", "a" * 100)
        assert mem.estimated_tokens > 0

    def test_token_estimate_scales_with_content(self):
        mem = SessionMemory()
        mem.add("user", "a" * 400)
        # 400 chars / 4 = 100 tokens
        assert mem.estimated_tokens == 100

    def test_single_char_min_one_token(self):
        msg = Message("user", "x")
        assert msg.estimated_tokens >= 1


# ------------------------------------------------------------------
# 7.6 — Auto-truncation (token budget)
# ------------------------------------------------------------------

class TestAutoTruncation:
    def test_truncation_respects_token_budget(self):
        # Each message is 100 chars = 25 tokens
        mem = SessionMemory(max_tokens=60)  # fits ~2 messages
        for i in range(5):
            mem.add("user", f"{'x' * 100} msg{i}")

        ctx = mem.build_context()
        total_tokens = sum(len(m["content"]) // 4 for m in ctx)
        assert total_tokens <= 60

    def test_truncation_keeps_most_recent(self):
        mem = SessionMemory(max_tokens=50)
        mem.add("user", "a" * 100)   # 25 tokens — old
        mem.add("user", "b" * 100)   # 25 tokens — recent

        ctx = mem.build_context()
        contents = [m["content"] for m in ctx]
        # Most recent should be present
        assert any("b" * 100 in c for c in contents)


# ------------------------------------------------------------------
# 7.7 — Pinning: critical findings always stay in context
# ------------------------------------------------------------------

class TestPinning:
    def test_pinned_message_survives_truncation(self):
        mem = SessionMemory(max_messages=3, max_tokens=30)
        mem.add("tool_result", "CRITICAL: CVE-2011-2523 found!", pinned=True)  # 7 tokens
        mem.add("user", "a" * 100)  # 25 tokens
        mem.add("user", "b" * 100)  # 25 tokens
        mem.add("user", "c" * 100)  # 25 tokens — pushes out oldest

        ctx = mem.build_context()
        contents = [m["content"] for m in ctx]
        assert any("CRITICAL" in c for c in contents)

    def test_non_pinned_message_dropped_on_truncation(self):
        mem = SessionMemory(max_tokens=30)
        mem.add("user", "old message " + "x" * 100)  # 28+ tokens — gets dropped
        mem.add("user", "new message " + "y" * 8)    # ~5 tokens

        ctx = mem.build_context()
        contents = [m["content"] for m in ctx]
        assert not any("old message" in c for c in contents)

    def test_pinned_count(self):
        mem = SessionMemory()
        mem.add("user", "normal")
        mem.add("tool_result", "critical finding", pinned=True)
        mem.add("tool_result", "another critical", pinned=True)
        assert mem.pinned_count == 2

    def test_pin_by_index(self):
        mem = SessionMemory()
        mem.add("user", "msg0")
        mem.add("user", "msg1")
        mem.pin(0)
        messages = list(mem._messages)
        assert messages[0].pinned is True
        assert messages[1].pinned is False

    def test_pinned_appears_in_context(self):
        mem = SessionMemory(max_tokens=10)
        mem.add("tool_result", "PINNED_FINDING", pinned=True)  # always included
        # Fill with large messages
        mem.add("user", "x" * 200)
        mem.add("user", "y" * 200)

        ctx = mem.build_context()
        contents = [m["content"] for m in ctx]
        assert any("PINNED_FINDING" in c for c in contents)


# ------------------------------------------------------------------
# 7.8 — Serialization
# ------------------------------------------------------------------

class TestSerialization:
    def test_to_dict_structure(self):
        mem = SessionMemory(max_messages=10, max_tokens=1000)
        mem.add("user", "hello")
        mem.add("tool_result", "critical", pinned=True)

        data = mem.to_dict()
        assert "max_messages" in data
        assert "max_tokens" in data
        assert "messages" in data
        assert len(data["messages"]) == 2

    def test_from_dict_restores_messages(self):
        mem = SessionMemory()
        mem.add("user", "hello")
        mem.add("assistant", "world")
        mem.add("tool_result", "finding", pinned=True)

        data = mem.to_dict()
        restored = SessionMemory.from_dict(data)

        assert restored.message_count == 3
        assert restored.pinned_count == 1

    def test_from_dict_preserves_pinned(self):
        mem = SessionMemory()
        mem.add("tool_result", "critical!", pinned=True)
        data = mem.to_dict()
        restored = SessionMemory.from_dict(data)

        messages = list(restored._messages)
        assert messages[0].pinned is True

    def test_round_trip_content(self):
        mem = SessionMemory()
        mem.add("user", "test content 123")
        data = mem.to_dict()
        restored = SessionMemory.from_dict(data)
        ctx = restored.build_context()
        assert ctx[0]["content"] == "test content 123"

    def test_from_dict_empty(self):
        data = {"max_messages": 50, "max_tokens": 4096, "messages": []}
        mem = SessionMemory.from_dict(data)
        assert mem.message_count == 0
