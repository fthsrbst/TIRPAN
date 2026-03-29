"""
V2 — AgentMessageBus

asyncio.Queue-based pub/sub inter-agent communication layer.
Brain and all specialized agents communicate exclusively through this bus.

Message flow:
  sender.send(msg)  →  recipient queue  →  recipient.receive()
  sender.broadcast(msg)  →  ALL registered agent queues

Subscriptions allow agents to react to event types without polling.
wait_for_result() lets Brain block until a specific agent completes.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine


# ── Message types ────────────────────────────────────────────────────────────

class MessageType:
    # Control
    SPAWN_AGENT      = "spawn_agent"
    KILL_AGENT       = "kill_agent"
    PAUSE_AGENT      = "pause_agent"
    RESUME_AGENT     = "resume_agent"
    # Data / findings
    FINDING          = "finding"
    HOST_DISCOVERED  = "host_discovered"
    VULN_FOUND       = "vuln_found"
    SESSION_OPENED   = "session_opened"
    CREDENTIAL_FOUND = "credential_found"
    LOOT_COLLECTED   = "loot_collected"
    # Status
    AGENT_STARTED    = "agent_started"
    AGENT_DONE       = "agent_done"
    AGENT_ERROR      = "agent_error"
    PHASE_CHANGED    = "phase_changed"
    # Operator interaction
    ASK_OPERATOR     = "ask_operator"
    OPERATOR_REPLY   = "operator_reply"
    # Generic
    TASK             = "task"
    RESULT           = "result"
    EVENT            = "event"


@dataclass
class AgentMessage:
    """
    Envelope for all inter-agent communication.

    Routing:
      - recipient_id = None  → broadcast to all registered agents
      - recipient_id = str   → unicast to that agent
    """
    msg_type:     str
    sender_id:    str
    payload:      dict = field(default_factory=dict)
    recipient_id: str | None = None          # None = broadcast
    msg_id:       str = field(default_factory=lambda: str(uuid.uuid4()))
    correlation_id: str | None = None        # links request ↔ reply
    timestamp:    float = field(default_factory=time.time)

    def reply(self, payload: dict, sender_id: str) -> AgentMessage:
        """Create a reply message that mirrors sender/recipient and links correlation."""
        return AgentMessage(
            msg_type=MessageType.RESULT,
            sender_id=sender_id,
            recipient_id=self.sender_id,
            payload=payload,
            correlation_id=self.msg_id,
        )

    def to_dict(self) -> dict:
        return {
            "msg_id":         self.msg_id,
            "msg_type":       self.msg_type,
            "sender_id":      self.sender_id,
            "recipient_id":   self.recipient_id,
            "correlation_id": self.correlation_id,
            "payload":        self.payload,
            "timestamp":      self.timestamp,
        }


@dataclass
class TaskPayload:
    """
    Structured payload for SPAWN_AGENT / TASK messages.

    Brain constructs these when dispatching work to specialized agents.
    """
    target:          str                     # IP / CIDR / URL / hostname
    task_type:       str                     # "scan" | "exploit" | "post_exploit" | …
    parameters:      dict = field(default_factory=dict)
    priority:        int  = 5               # 1 (highest) … 10 (lowest)
    timeout:         int  = 3600            # seconds
    parent_task_id:  str | None = None

    def to_dict(self) -> dict:
        return {
            "target":         self.target,
            "task_type":      self.task_type,
            "parameters":     self.parameters,
            "priority":       self.priority,
            "timeout":        self.timeout,
            "parent_task_id": self.parent_task_id,
        }

    @classmethod
    def from_dict(cls, d: dict) -> TaskPayload:
        return cls(
            target=d["target"],
            task_type=d["task_type"],
            parameters=d.get("parameters", {}),
            priority=d.get("priority", 5),
            timeout=d.get("timeout", 3600),
            parent_task_id=d.get("parent_task_id"),
        )


# ── Bus ──────────────────────────────────────────────────────────────────────

# Subscriber callback type: async def on_message(msg: AgentMessage) -> None
SubscriberCallback = Callable[[AgentMessage], Coroutine[Any, Any, None]]


class AgentMessageBus:
    """
    Central message router for the multi-agent system.

    Usage:
        bus = AgentMessageBus()

        # Register agents (each gets its own queue)
        bus.register_agent("brain")
        bus.register_agent("scanner-1")

        # Unicast
        await bus.send(AgentMessage(MessageType.TASK, "brain",
                                    recipient_id="scanner-1", payload={...}))

        # Broadcast
        await bus.broadcast(AgentMessage(MessageType.PHASE_CHANGED, "brain",
                                         payload={"phase": "exploitation"}))

        # Receive (called by the agent itself)
        msg = await bus.receive("scanner-1")

        # Brain waits for scanner result
        result = await bus.wait_for_result("scanner-1", timeout=300)
    """

    def __init__(self, history_limit: int = 1000) -> None:
        self._queues:       dict[str, asyncio.Queue[AgentMessage]] = {}
        self._subscribers:  dict[str, list[SubscriberCallback]]    = {}
        # correlation_id → Future[AgentMessage] (for wait_for_result)
        self._pending:      dict[str, asyncio.Future[AgentMessage]] = {}
        # Completion futures keyed by agent_id (set when AGENT_DONE received)
        self._done_futures: dict[str, asyncio.Future[AgentMessage]] = {}
        self._history:      list[AgentMessage] = []
        self._history_limit = history_limit
        self._lock = asyncio.Lock()

    # ── Registration ─────────────────────────────────────────────────────────

    def register_agent(self, agent_id: str, queue_size: int = 256) -> None:
        """Create a dedicated queue for an agent. Idempotent."""
        if agent_id not in self._queues:
            self._queues[agent_id] = asyncio.Queue(maxsize=queue_size)

    def unregister_agent(self, agent_id: str) -> None:
        """Remove an agent's queue (called after agent completes)."""
        self._queues.pop(agent_id, None)
        self._subscribers.pop(agent_id, None)
        self._done_futures.pop(agent_id, None)

    def registered_agents(self) -> list[str]:
        return list(self._queues.keys())

    # ── Sending ──────────────────────────────────────────────────────────────

    async def send(self, msg: AgentMessage) -> None:
        """
        Route a message to its recipient.
        - If recipient_id is set → unicast.
        - If recipient_id is None → broadcast to all.
        Also fires subscriptions and updates history.
        """
        self._record(msg)
        await self._fire_subscriptions(msg)
        await self._resolve_pending(msg)
        await self._mark_done_if_applicable(msg)

        if msg.recipient_id is None:
            await self._broadcast_to_queues(msg)
        else:
            q = self._queues.get(msg.recipient_id)
            if q is not None:
                try:
                    q.put_nowait(msg)
                except asyncio.QueueFull:
                    # Drop with best-effort; caller should handle backpressure
                    pass

    async def broadcast(self, msg: AgentMessage) -> None:
        """Send to ALL registered agents (excluding sender)."""
        msg.recipient_id = None
        await self.send(msg)

    async def _broadcast_to_queues(self, msg: AgentMessage) -> None:
        for agent_id, q in self._queues.items():
            if agent_id == msg.sender_id:
                continue
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass

    # ── Receiving ────────────────────────────────────────────────────────────

    async def receive(self, agent_id: str, timeout: float | None = None) -> AgentMessage | None:
        """
        Block until a message arrives for agent_id, or timeout expires.
        Returns None on timeout.
        """
        q = self._queues.get(agent_id)
        if q is None:
            return None
        try:
            if timeout is not None:
                return await asyncio.wait_for(q.get(), timeout=timeout)
            return await q.get()
        except asyncio.TimeoutError:
            return None

    def receive_nowait(self, agent_id: str) -> AgentMessage | None:
        """Non-blocking receive. Returns None if queue is empty."""
        q = self._queues.get(agent_id)
        if q is None:
            return None
        try:
            return q.get_nowait()
        except asyncio.QueueEmpty:
            return None

    # ── Subscriptions ────────────────────────────────────────────────────────

    def subscribe(self, agent_id: str, callback: SubscriberCallback) -> None:
        """
        Register an async callback that fires for EVERY message delivered
        to agent_id (in addition to queue delivery).
        """
        self._subscribers.setdefault(agent_id, []).append(callback)

    def subscribe_global(self, callback: SubscriberCallback) -> None:
        """Fire callback for every message on the bus (useful for audit/UI)."""
        self._subscribers.setdefault("__global__", []).append(callback)

    async def _fire_subscriptions(self, msg: AgentMessage) -> None:
        # Global subscribers
        for cb in self._subscribers.get("__global__", []):
            try:
                await cb(msg)
            except Exception:
                pass
        # Per-recipient subscribers
        if msg.recipient_id:
            for cb in self._subscribers.get(msg.recipient_id, []):
                try:
                    await cb(msg)
                except Exception:
                    pass

    # ── wait_for_result ──────────────────────────────────────────────────────

    async def wait_for_result(
        self,
        correlation_id: str,
        timeout: float = 300.0,
    ) -> AgentMessage | None:
        """
        Brain calls this after sending a task.
        Blocks until a RESULT message with matching correlation_id arrives,
        or timeout expires.

        Returns the reply AgentMessage, or None on timeout.
        """
        loop = asyncio.get_event_loop()
        fut: asyncio.Future[AgentMessage] = loop.create_future()
        self._pending[correlation_id] = fut
        try:
            return await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            self._pending.pop(correlation_id, None)

    async def wait_for_agent_done(
        self,
        agent_id: str,
        timeout: float = 3600.0,
    ) -> AgentMessage | None:
        """
        Block until the agent emits AGENT_DONE or AGENT_ERROR.
        Brain uses this to join on spawned agents.
        """
        loop = asyncio.get_event_loop()
        fut = self._done_futures.get(agent_id)
        # Agent already completed before we started waiting — return immediately.
        # Previously this branch created a new empty future, causing a hang until timeout.
        if fut is not None and fut.done():
            return fut.result()
        if fut is None:
            fut = loop.create_future()
            self._done_futures[agent_id] = fut
        try:
            return await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    async def _resolve_pending(self, msg: AgentMessage) -> None:
        if msg.correlation_id and msg.correlation_id in self._pending:
            fut = self._pending[msg.correlation_id]
            if not fut.done():
                fut.set_result(msg)

    async def _mark_done_if_applicable(self, msg: AgentMessage) -> None:
        if msg.msg_type in (MessageType.AGENT_DONE, MessageType.AGENT_ERROR):
            agent_id = msg.payload.get("agent_id", msg.sender_id)
            fut = self._done_futures.get(agent_id)
            if fut is not None and not fut.done():
                fut.set_result(msg)
            else:
                # Pre-create resolved future for late wait_for_agent_done calls
                loop = asyncio.get_event_loop()
                f: asyncio.Future[AgentMessage] = loop.create_future()
                f.set_result(msg)
                self._done_futures[agent_id] = f

    # ── History ──────────────────────────────────────────────────────────────

    def _record(self, msg: AgentMessage) -> None:
        self._history.append(msg)
        if len(self._history) > self._history_limit:
            self._history = self._history[-self._history_limit :]

    def get_history(
        self,
        msg_type: str | None = None,
        sender_id: str | None = None,
        limit: int = 100,
    ) -> list[AgentMessage]:
        """Return recent messages, optionally filtered by type or sender."""
        msgs = self._history
        if msg_type:
            msgs = [m for m in msgs if m.msg_type == msg_type]
        if sender_id:
            msgs = [m for m in msgs if m.sender_id == sender_id]
        return msgs[-limit:]

    def get_history_dicts(
        self,
        msg_type: str | None = None,
        sender_id: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        return [m.to_dict() for m in self.get_history(msg_type, sender_id, limit)]

    # ── Helpers ──────────────────────────────────────────────────────────────

    def queue_size(self, agent_id: str) -> int:
        q = self._queues.get(agent_id)
        return q.qsize() if q else 0

    def clear_history(self) -> None:
        self._history.clear()

    def stats(self) -> dict:
        return {
            "registered_agents": list(self._queues.keys()),
            "history_count":     len(self._history),
            "pending_futures":   len(self._pending),
            "done_futures":      len(self._done_futures),
            "queue_sizes":       {aid: q.qsize() for aid, q in self._queues.items()},
        }
