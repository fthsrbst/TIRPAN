"""
TIRPAN Session Manager

Lifecycle management for running PentestAgent instances.

Provides:
  - Registration of running tasks + SafetyGuard references
  - Kill switch relay to the running SafetyGuard
  - WebSocket event broadcasting to subscribed clients
  - Progress callback factory for the agent
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional

from config import settings
from core.safety import SafetyGuard

logger = logging.getLogger(__name__)

# ── In-memory state ────────────────────────────────────────────────────────────

# session_id → asyncio.Task
_tasks: Dict[str, asyncio.Task] = {}

# session_id → SafetyGuard (needed for kill-switch relay)
_guards: Dict[str, SafetyGuard] = {}

# session_id → PentestAgent (for pause/resume/inject)
_agents: Dict[str, object] = {}

# session_id values marked as emergency-stopped (task paused, resumable)
_soft_stopped: set[str] = set()

# session_id → list of async send callables registered by WS connections
_subscribers: Dict[str, List[Callable]] = {}

# session_id → recent event buffer (for late-joining WS clients to replay)
_buffers: Dict[str, List[dict]] = {}
_buffer_expires_at: Dict[str, float] = {}
_cleanup_handles: Dict[str, asyncio.TimerHandle] = {}

_BUFFER_MAX = 500
_AGENT_LOG_SKIP_EVENTS = frozenset({"llm_token"})


def _session_agents_dir(session_id: str) -> Path:
    d = Path("data/sessions") / session_id / "agents"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_agent_filename(agent_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", agent_id or "system").strip("._")
    if not safe:
        safe = "system"
    return f"{safe}.md"


def _append_agent_log(session_id: str, event_type: str, data: dict) -> None:
    if event_type in _AGENT_LOG_SKIP_EVENTS:
        return
    payload = data if isinstance(data, dict) else {"value": data}
    agent_id = str(payload.get("agent_id") or "system")
    agent_type = str(payload.get("agent_type") or "system")
    ts = datetime.now(timezone.utc).isoformat()
    path = _session_agents_dir(session_id) / _safe_agent_filename(agent_id)

    try:
        is_new = not path.exists()
        with path.open("a", encoding="utf-8") as f:
            if is_new:
                f.write(f"# Agent Log\n\n- `session_id`: `{session_id}`\n- `agent_id`: `{agent_id}`\n- `agent_type`: `{agent_type}`\n\n")
            f.write(f"## {ts} `{event_type}`\n")
            f.write("```json\n")
            f.write(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
            f.write("\n```\n\n")
    except Exception as exc:
        logger.debug("Agent log append failed for session %s agent %s: %s", session_id, agent_id, exc)


# ── Registration ───────────────────────────────────────────────────────────────

def register(session_id: str, task: asyncio.Task, guard: SafetyGuard, agent=None) -> None:
    """Called when a new agent task is started."""
    _tasks[session_id] = task
    _guards[session_id] = guard
    if agent is not None:
        _agents[session_id] = agent
    _soft_stopped.discard(session_id)
    _subscribers.setdefault(session_id, [])
    _buffers.setdefault(session_id, [])
    logger.info("Session %s registered in manager", session_id)


def cleanup(session_id: str) -> None:
    """Called when the task finishes (success or error)."""
    _tasks.pop(session_id, None)
    _guards.pop(session_id, None)
    _agents.pop(session_id, None)
    _soft_stopped.discard(session_id)
    _schedule_cleanup(session_id)
    logger.info("Session %s task cleaned up", session_id)


def _drop_session_buffers(session_id: str) -> None:
    _subscribers.pop(session_id, None)
    _buffers.pop(session_id, None)
    _buffer_expires_at.pop(session_id, None)
    handle = _cleanup_handles.pop(session_id, None)
    if handle is not None:
        handle.cancel()


def _schedule_cleanup(session_id: str) -> None:
    # Skip while task is still active.
    task = _tasks.get(session_id)
    if task is not None and not task.done():
        return

    subs = _subscribers.get(session_id, [])
    if not subs:
        _drop_session_buffers(session_id)
        return

    ttl = max(0, int(settings.ws_buffer_ttl_seconds))
    _buffer_expires_at[session_id] = time.time() + ttl

    old = _cleanup_handles.pop(session_id, None)
    if old is not None:
        old.cancel()

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        _drop_session_buffers(session_id)
        return

    _cleanup_handles[session_id] = loop.call_later(ttl, lambda: _drop_session_buffers(session_id))


# ── Kill switch ────────────────────────────────────────────────────────────────

def kill(session_id: str) -> bool:
    """Trigger emergency stop on the running agent. Returns True if found."""
    return bool(kill_with_details(session_id).get("killed"))


def kill_with_details(session_id: str) -> dict:
    """Trigger emergency stop and return deterministic stop metadata."""
    started = time.perf_counter()
    guard = _guards.get(session_id)
    task = _tasks.get(session_id)
    agent = _agents.get(session_id)

    if session_id in _soft_stopped:
        return {
            "killed": False,
            "message": "Session already stopped",
            "killed_in_ms": 0,
            "task_cancelled": False,
            "child_agents_cancelled": 0,
            "resumable": True,
        }

    if not guard and (task is None or task.done()) and agent is None:
        return {
            "killed": False,
            "message": "Session not running or already stopped",
            "killed_in_ms": 0,
            "task_cancelled": False,
            "child_agents_cancelled": 0,
            "resumable": False,
        }

    child_agents_cancelled = 0
    task_soft_stopped = False
    if agent is not None and task is not None and not task.done():
        try:
            agent.pause()
            _soft_stopped.add(session_id)
            task_soft_stopped = True
        except Exception as exc:
            logger.debug("Agent pause() raised for session %s: %s", session_id, exc)

    # Fallback: if we cannot soft-stop, use the old hard-cancel behavior.
    if not task_soft_stopped and agent is not None:
        try:
            agent_result = agent.kill()
            if isinstance(agent_result, dict):
                child_agents_cancelled = int(agent_result.get("children_cancelled", 0) or 0)
        except Exception as exc:
            logger.debug("Agent kill() raised for session %s: %s", session_id, exc)

    if guard and not task_soft_stopped:
        guard.emergency_stop()

    task_cancelled = False
    if task and not task.done() and not task_soft_stopped:
        task.cancel()
        task_cancelled = True

    killed_in_ms = int((time.perf_counter() - started) * 1000)
    logger.warning(
        "Kill switch triggered for session %s (task_cancelled=%s child_agents_cancelled=%d resumable=%s killed_in_ms=%d)",
        session_id,
        task_cancelled,
        child_agents_cancelled,
        task_soft_stopped,
        killed_in_ms,
    )
    return {
        "killed": True,
        "killed_in_ms": killed_in_ms,
        "task_cancelled": task_cancelled,
        "child_agents_cancelled": child_agents_cancelled,
        "resumable": task_soft_stopped,
    }


# ── Status ─────────────────────────────────────────────────────────────────────

def is_running(session_id: str) -> bool:
    task = _tasks.get(session_id)
    return task is not None and not task.done() and session_id not in _soft_stopped


def list_running() -> list[str]:
    return [sid for sid, task in _tasks.items() if not task.done() and sid not in _soft_stopped]


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
    _schedule_cleanup(session_id)


async def broadcast(session_id: str, event: dict) -> None:
    """Push an event to all WS subscribers and append to the buffer."""
    exp = _buffer_expires_at.get(session_id)
    if exp is not None and exp <= time.time():
        _drop_session_buffers(session_id)

    buf = _buffers.setdefault(session_id, [])
    buf.append(event)
    if len(buf) > _BUFFER_MAX:
        del buf[0]

    for send_fn in list(_subscribers.get(session_id, [])):
        try:
            await send_fn(event)
        except Exception as exc:
            logger.debug("Subscriber send failed for session %s: %s", session_id, exc)


async def _broadcast_no_buffer(session_id: str, event: dict) -> None:
    """Push an event to subscribers WITHOUT adding to the replay buffer.

    Used for high-frequency streaming events (llm_token) that would saturate
    the 500-event buffer and prevent late-joining clients from seeing real events.
    """
    for send_fn in list(_subscribers.get(session_id, [])):
        try:
            await send_fn(event)
        except Exception as exc:
            logger.debug("Subscriber send (no-buffer) failed for session %s: %s", session_id, exc)


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
    task = _tasks.get(session_id)
    if agent and task is not None and not task.done():
        agent.resume()
        _soft_stopped.discard(session_id)
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


def get_agent(session_id: str):
    """Return the agent instance for a session, or None if not found."""
    return _agents.get(session_id)


def clear_buffer(session_id: str) -> None:
    """Clear the replay buffer for a session (e.g. before restarting it)."""
    _buffers[session_id] = []
    _buffer_expires_at.pop(session_id, None)


# ── Progress callback factory ──────────────────────────────────────────────────

def make_progress_callback(session_id: str) -> Callable[[str, dict], None]:
    """
    Create a synchronous progress callback that schedules async broadcasts
    and persists events to the database.

    The callback signature matches what PentestAgent expects:
        callback(event_type: str, data: dict) -> None
    """
    from database.repositories import SessionEventRepository
    _event_repo = SessionEventRepository()

    _STREAM_EVENTS = frozenset({"llm_token", "llm_thinking_start", "llm_reflecting_start"})

    def callback(event_type: str, data: dict) -> None:
        event = {
            "type": "session_event",
            "session_id": session_id,
            "event": event_type,
            "data": data,
        }
        _append_agent_log(session_id, event_type, data)
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                # Streaming token events are high-frequency — don't buffer them
                if event_type in _STREAM_EVENTS:
                    loop.create_task(_broadcast_no_buffer(session_id, event))
                else:
                    loop.create_task(broadcast(session_id, event))
                    # Persist non-streaming events to DB for replay
                    loop.create_task(_event_repo.save(session_id, event_type, data))
        except RuntimeError:
            pass

    return callback
