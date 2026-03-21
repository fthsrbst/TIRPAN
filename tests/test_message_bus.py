"""Tests for core/message_bus.py — AgentMessageBus, AgentMessage, TaskPayload."""

from __future__ import annotations

import asyncio
import pytest
import time

from core.message_bus import (
    AgentMessage,
    AgentMessageBus,
    MessageType,
    TaskPayload,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def make_bus() -> AgentMessageBus:
    bus = AgentMessageBus()
    bus.register_agent("brain")
    bus.register_agent("scanner-1")
    bus.register_agent("exploit-1")
    return bus


def make_msg(
    msg_type: str = MessageType.EVENT,
    sender_id: str = "brain",
    recipient_id: str | None = None,
    payload: dict | None = None,
) -> AgentMessage:
    return AgentMessage(
        msg_type=msg_type,
        sender_id=sender_id,
        recipient_id=recipient_id,
        payload=payload or {},
    )


# ── AgentMessage ──────────────────────────────────────────────────────────────

class TestAgentMessage:
    def test_default_fields(self):
        msg = AgentMessage(msg_type=MessageType.EVENT, sender_id="brain")
        assert msg.recipient_id is None
        assert msg.correlation_id is None
        assert msg.payload == {}
        assert msg.msg_id != ""
        assert msg.timestamp <= time.time()

    def test_unique_msg_ids(self):
        m1 = AgentMessage(msg_type=MessageType.EVENT, sender_id="brain")
        m2 = AgentMessage(msg_type=MessageType.EVENT, sender_id="brain")
        assert m1.msg_id != m2.msg_id

    def test_reply_creates_correct_message(self):
        original = AgentMessage(msg_type=MessageType.TASK, sender_id="brain",
                                 recipient_id="scanner-1", payload={"target": "10.0.0.1"})
        reply = original.reply(payload={"result": "done"}, sender_id="scanner-1")
        assert reply.msg_type == MessageType.RESULT
        assert reply.sender_id == "scanner-1"
        assert reply.recipient_id == "brain"
        assert reply.correlation_id == original.msg_id
        assert reply.payload == {"result": "done"}

    def test_to_dict_keys(self):
        msg = AgentMessage(msg_type=MessageType.FINDING, sender_id="scanner-1",
                           recipient_id="brain", payload={"host": "10.0.0.1"})
        d = msg.to_dict()
        for key in ("msg_id", "msg_type", "sender_id", "recipient_id",
                    "correlation_id", "payload", "timestamp"):
            assert key in d

    def test_to_dict_values(self):
        msg = AgentMessage(msg_type=MessageType.FINDING, sender_id="scanner-1",
                           payload={"x": 1})
        d = msg.to_dict()
        assert d["msg_type"] == MessageType.FINDING
        assert d["payload"] == {"x": 1}


# ── TaskPayload ───────────────────────────────────────────────────────────────

class TestTaskPayload:
    def test_defaults(self):
        t = TaskPayload(target="10.0.0.1", task_type="scan")
        assert t.priority == 5
        assert t.timeout == 3600
        assert t.parameters == {}
        assert t.parent_task_id is None

    def test_to_dict(self):
        t = TaskPayload(target="10.0.0.0/24", task_type="scan",
                        parameters={"ports": "1-1024"}, priority=1)
        d = t.to_dict()
        assert d["target"] == "10.0.0.0/24"
        assert d["priority"] == 1
        assert d["parameters"] == {"ports": "1-1024"}

    def test_from_dict_roundtrip(self):
        t = TaskPayload(target="10.0.0.1", task_type="exploit",
                        parameters={"cve": "CVE-2021-44228"}, priority=2,
                        timeout=600, parent_task_id="task-001")
        restored = TaskPayload.from_dict(t.to_dict())
        assert restored.target == t.target
        assert restored.task_type == t.task_type
        assert restored.parameters == t.parameters
        assert restored.priority == t.priority
        assert restored.timeout == t.timeout
        assert restored.parent_task_id == t.parent_task_id

    def test_from_dict_minimal(self):
        t = TaskPayload.from_dict({"target": "10.0.0.1", "task_type": "scan"})
        assert t.target == "10.0.0.1"
        assert t.priority == 5


# ── Registration ──────────────────────────────────────────────────────────────

class TestBusRegistration:
    def test_register_agent(self):
        bus = AgentMessageBus()
        bus.register_agent("brain")
        assert "brain" in bus.registered_agents()

    def test_register_idempotent(self):
        bus = AgentMessageBus()
        bus.register_agent("brain")
        bus.register_agent("brain")
        assert bus.registered_agents().count("brain") == 1

    def test_unregister_agent(self):
        bus = AgentMessageBus()
        bus.register_agent("scanner-1")
        bus.unregister_agent("scanner-1")
        assert "scanner-1" not in bus.registered_agents()

    def test_unregister_nonexistent_is_noop(self):
        bus = AgentMessageBus()
        bus.unregister_agent("does-not-exist")  # no exception


# ── Unicast ───────────────────────────────────────────────────────────────────

class TestUnicast:
    def test_unicast_delivers_to_recipient(self):
        bus = make_bus()
        msg = make_msg(recipient_id="scanner-1", payload={"cmd": "scan"})
        run(bus.send(msg))
        received = bus.receive_nowait("scanner-1")
        assert received is not None
        assert received.payload == {"cmd": "scan"}

    def test_unicast_does_not_deliver_to_others(self):
        bus = make_bus()
        msg = make_msg(recipient_id="scanner-1")
        run(bus.send(msg))
        assert bus.receive_nowait("brain") is None
        assert bus.receive_nowait("exploit-1") is None

    def test_unicast_to_unknown_agent_is_noop(self):
        bus = make_bus()
        msg = make_msg(recipient_id="ghost-agent")
        run(bus.send(msg))  # no exception

    def test_unicast_does_not_deliver_to_sender(self):
        bus = make_bus()
        # brain sends to scanner-1, should not appear in brain's queue
        msg = make_msg(sender_id="brain", recipient_id="scanner-1")
        run(bus.send(msg))
        assert bus.receive_nowait("brain") is None


# ── Broadcast ─────────────────────────────────────────────────────────────────

class TestBroadcast:
    def test_broadcast_delivers_to_all_except_sender(self):
        bus = make_bus()
        msg = make_msg(sender_id="brain")
        run(bus.broadcast(msg))
        assert bus.receive_nowait("scanner-1") is not None
        assert bus.receive_nowait("exploit-1") is not None

    def test_broadcast_skips_sender(self):
        bus = make_bus()
        msg = make_msg(sender_id="brain")
        run(bus.broadcast(msg))
        assert bus.receive_nowait("brain") is None

    def test_broadcast_sets_recipient_none(self):
        bus = make_bus()
        msg = make_msg(recipient_id="scanner-1")  # will be overridden
        run(bus.broadcast(msg))
        assert msg.recipient_id is None


# ── Async receive ─────────────────────────────────────────────────────────────

class TestAsyncReceive:
    def test_receive_blocks_then_returns(self):
        bus = make_bus()

        async def deliver_after_delay():
            await asyncio.sleep(0.01)
            await bus.send(make_msg(recipient_id="scanner-1", payload={"x": 42}))

        async def receiver():
            asyncio.ensure_future(deliver_after_delay())
            return await bus.receive("scanner-1", timeout=1.0)

        result = run(receiver())
        assert result is not None
        assert result.payload == {"x": 42}

    def test_receive_timeout_returns_none(self):
        bus = make_bus()
        result = run(bus.receive("scanner-1", timeout=0.01))
        assert result is None

    def test_receive_unregistered_returns_none(self):
        bus = AgentMessageBus()
        result = run(bus.receive("ghost", timeout=0.01))
        assert result is None


# ── Subscriptions ─────────────────────────────────────────────────────────────

class TestSubscriptions:
    def test_subscribe_fires_on_delivery(self):
        bus = make_bus()
        received = []

        async def cb(msg: AgentMessage):
            received.append(msg)

        bus.subscribe("scanner-1", cb)
        msg = make_msg(recipient_id="scanner-1")
        run(bus.send(msg))
        assert len(received) == 1
        assert received[0].msg_id == msg.msg_id

    def test_global_subscribe_fires_for_all(self):
        bus = make_bus()
        received = []

        async def cb(msg: AgentMessage):
            received.append(msg)

        bus.subscribe_global(cb)
        run(bus.send(make_msg(recipient_id="scanner-1")))
        run(bus.send(make_msg(recipient_id="exploit-1")))
        assert len(received) == 2

    def test_subscribe_exception_does_not_propagate(self):
        bus = make_bus()

        async def bad_cb(msg):
            raise RuntimeError("subscriber error")

        bus.subscribe("scanner-1", bad_cb)
        run(bus.send(make_msg(recipient_id="scanner-1")))  # no exception


# ── wait_for_result ───────────────────────────────────────────────────────────

class TestWaitForResult:
    def test_resolves_with_matching_correlation(self):
        bus = make_bus()
        task_msg = make_msg(msg_type=MessageType.TASK, sender_id="brain",
                             recipient_id="scanner-1")
        correlation_id = task_msg.msg_id

        async def scanner_replies():
            await asyncio.sleep(0.01)
            reply = AgentMessage(
                msg_type=MessageType.RESULT,
                sender_id="scanner-1",
                recipient_id="brain",
                payload={"hosts": ["10.0.0.1"]},
                correlation_id=correlation_id,
            )
            await bus.send(reply)

        async def brain_waits():
            asyncio.ensure_future(scanner_replies())
            return await bus.wait_for_result(correlation_id, timeout=2.0)

        result = run(brain_waits())
        assert result is not None
        assert result.payload == {"hosts": ["10.0.0.1"]}

    def test_returns_none_on_timeout(self):
        bus = make_bus()
        result = run(bus.wait_for_result("nonexistent-correlation", timeout=0.01))
        assert result is None


# ── wait_for_agent_done ───────────────────────────────────────────────────────

class TestWaitForAgentDone:
    def test_resolves_on_agent_done(self):
        bus = make_bus()

        async def scanner_finishes():
            await asyncio.sleep(0.01)
            done_msg = AgentMessage(
                msg_type=MessageType.AGENT_DONE,
                sender_id="scanner-1",
                payload={"agent_id": "scanner-1", "status": "done"},
            )
            await bus.send(done_msg)

        async def brain_waits():
            asyncio.ensure_future(scanner_finishes())
            return await bus.wait_for_agent_done("scanner-1", timeout=2.0)

        result = run(brain_waits())
        assert result is not None
        assert result.msg_type == MessageType.AGENT_DONE

    def test_resolves_on_agent_error(self):
        bus = make_bus()

        async def scanner_errors():
            await asyncio.sleep(0.01)
            err_msg = AgentMessage(
                msg_type=MessageType.AGENT_ERROR,
                sender_id="scanner-1",
                payload={"agent_id": "scanner-1", "error": "timeout"},
            )
            await bus.send(err_msg)

        async def brain_waits():
            asyncio.ensure_future(scanner_errors())
            return await bus.wait_for_agent_done("scanner-1", timeout=2.0)

        result = run(brain_waits())
        assert result is not None
        assert result.msg_type == MessageType.AGENT_ERROR

    def test_timeout_returns_none(self):
        bus = make_bus()
        result = run(bus.wait_for_agent_done("scanner-1", timeout=0.01))
        assert result is None


# ── History ───────────────────────────────────────────────────────────────────

class TestHistory:
    def test_records_messages(self):
        bus = make_bus()
        run(bus.send(make_msg(msg_type=MessageType.FINDING, sender_id="scanner-1")))
        run(bus.send(make_msg(msg_type=MessageType.FINDING, sender_id="scanner-1")))
        history = bus.get_history()
        assert len(history) == 2

    def test_filter_by_type(self):
        bus = make_bus()
        run(bus.send(make_msg(msg_type=MessageType.FINDING, sender_id="scanner-1")))
        run(bus.send(make_msg(msg_type=MessageType.EVENT, sender_id="brain")))
        history = bus.get_history(msg_type=MessageType.FINDING)
        assert all(m.msg_type == MessageType.FINDING for m in history)

    def test_filter_by_sender(self):
        bus = make_bus()
        run(bus.send(make_msg(sender_id="scanner-1")))
        run(bus.send(make_msg(sender_id="brain")))
        history = bus.get_history(sender_id="scanner-1")
        assert all(m.sender_id == "scanner-1" for m in history)

    def test_limit(self):
        bus = AgentMessageBus(history_limit=5)
        bus.register_agent("brain")
        bus.register_agent("scanner-1")
        for _ in range(10):
            run(bus.send(make_msg()))
        assert len(bus.get_history()) <= 5

    def test_clear_history(self):
        bus = make_bus()
        run(bus.send(make_msg()))
        bus.clear_history()
        assert bus.get_history() == []

    def test_get_history_dicts(self):
        bus = make_bus()
        run(bus.send(make_msg(msg_type=MessageType.FINDING, sender_id="scanner-1")))
        dicts = bus.get_history_dicts()
        assert isinstance(dicts[0], dict)
        assert "msg_id" in dicts[0]


# ── Stats ─────────────────────────────────────────────────────────────────────

class TestStats:
    def test_stats_keys(self):
        bus = make_bus()
        s = bus.stats()
        assert "registered_agents" in s
        assert "history_count" in s
        assert "pending_futures" in s
        assert "queue_sizes" in s

    def test_queue_size(self):
        bus = make_bus()
        run(bus.send(make_msg(recipient_id="scanner-1")))
        run(bus.send(make_msg(recipient_id="scanner-1")))
        assert bus.queue_size("scanner-1") == 2

    def test_queue_size_unknown_agent(self):
        bus = AgentMessageBus()
        assert bus.queue_size("ghost") == 0


# ── Message types constant ────────────────────────────────────────────────────

class TestMessageType:
    def test_all_types_are_strings(self):
        for attr in dir(MessageType):
            if not attr.startswith("_"):
                val = getattr(MessageType, attr)
                assert isinstance(val, str), f"MessageType.{attr} is not a string"
