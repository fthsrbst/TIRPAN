"""
AEGIS Session Manager

Lifecycle management for running PentestAgent instances.

Provides:
  - Registration of running tasks + SafetyGuard references
  - Kill switch relay to the running SafetyGuard
  - WebSocket event broadcasting to subscribed clients
  - Progress callback factory for the agent
"""

from __future__ import annotations

import asyncio
import logging
from typing import Callable, Dict, List, Optional

from core.safety import SafetyGuard

logger = logging.getLogger(__name__)

# ── In-memory state ────────────────────────────────────────────────────────────

# session_id → asyncio.Task
_tasks: Dict[str, asyncio.Task] = {}

# session_id → SafetyGuard (needed for kill-switch relay)
_guards: Dict[str, SafetyGuard] = {}

# session_id → PentestAgent (for pause/resume/inject)
_agents: Dict[str, object] = {}

# session_id → list of async send callables registered by WS connections
_subscribers: Dict[str, List[Callable]] = {}

# session_id → recent event buffer (for late-joining WS clients to replay)
_buffers: Dict[str, List[dict]] = {}

_BUFFER_MAX = 500


# ── Registration ───────────────────────────────────────────────────────────────

def register(session_id: str, task: asyncio.Task, guard: SafetyGuard, agent=None) -> None:
    """Called when a new agent task is started."""
    _tasks[session_id] = task
    _guards[session_id] = guard
    if agent is not None:
        _agents[session_id] = agent
    _subscribers.setdefault(session_id, [])
    _buffers.setdefault(session_id, [])
    logger.info("Session %s registered in manager", session_id)


def cleanup(session_id: str) -> None:
    """Called when the task finishes (success or error)."""
    _tasks.pop(session_id, None)
    _guards.pop(session_id, None)
    _agents.pop(session_id, None)
    # Keep subscribers and buffers briefly so late-arriving WS clients can read
    logger.info("Session %s task cleaned up", session_id)


# ── Kill switch ────────────────────────────────────────────────────────────────

def kill(session_id: str) -> bool:
    """Trigger emergency stop on the running agent. Returns True if found."""
    guard = _guards.get(session_id)
    if guard:
        guard.emergency_stop()
        logger.warning("Kill switch triggered for session %s", session_id)
        return True
    return False


# ── Status ─────────────────────────────────────────────────────────────────────

def is_running(session_id: str) -> bool:
    task = _tasks.get(session_id)
    return task is not None and not task.done()


def list_running() -> list[str]:
    return [sid for sid, task in _tasks.items() if not task.done()]


# ── WebSocket pub/sub ──────────────────────────────────────────────────────────

def subscribe(session_id: str, send_fn: Callable) -> list[dict]:
    """Register a WS send function. Returns buffered events for replay."""
    subs = _subscribers.setdefault(session_id, [])
    if send_fn not in subs:
        subs.append(send_fn)
    return list(_buffers.get(session_id, []))


def unsubscribe(session_id: str, send_fn: Callable) -> None:
    subs = _subscribers.get(session_id, [])
    try:
        subs.remove(send_fn)
    except ValueError:
        pass


async def broadcast(session_id: str, event: dict) -> None:
    """Push an event to all WS subscribers and append to the buffer."""
    buf = _buffers.setdefault(session_id, [])
    buf.append(event)
    if len(buf) > _BUFFER_MAX:
        del buf[0]

    for send_fn in list(_subscribers.get(session_id, [])):
        try:
            await send_fn(event)
        except Exception as exc:
            logger.debug("Subscriber send failed for session %s: %s", session_id, exc)


# ── Pause / Resume / Inject ────────────────────────────────────────────────────

def pause_session(session_id: str) -> bool:
    """Pause the running agent. Returns True if found and paused."""
    agent = _agents.get(session_id)
    if agent and is_running(session_id):
        agent.pause()
        logger.info("Session %s paused", session_id)
        return True
    return False


def resume_session(session_id: str) -> bool:
    """Resume a paused agent. Returns True if found."""
    agent = _agents.get(session_id)
    if agent:
        agent.resume()
        logger.info("Session %s resumed", session_id)
        return True
    return False


def inject_message(session_id: str, message: str) -> bool:
    """Inject an operator message into the agent's memory. Returns True if found."""
    agent = _agents.get(session_id)
    if agent and is_running(session_id):
        agent.inject_message(message)
        return True
    return False


# ── Progress callback factory ──────────────────────────────────────────────────

def make_progress_callback(session_id: str) -> Callable[[str, dict], None]:
    """
    Create a synchronous progress callback that schedules async broadcasts.

    The callback signature matches what PentestAgent expects:
        callback(event_type: str, data: dict) -> None
    """

    def callback(event_type: str, data: dict) -> None:
        event = {
            "type": "session_event",
            "session_id": session_id,
            "event": event_type,
            "data": data,
        }
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(broadcast(session_id, event))
        except RuntimeError:
            pass

    return callback
