"""
WebSocket handler — real-time streaming between browser and backend.

Message protocol (client → server):
  {"type": "chat", "content": "...", "session_id": "..."}

Message protocol (server → client):
  {"type": "token",         "content": "...", "msg_id": "..."}
  {"type": "message_end",   "msg_id": "..."}
  {"type": "error",         "content": "..."}
  {"type": "status",        "content": "..."}
"""

import asyncio
import json
import logging
import uuid
import httpx
from fastapi import WebSocket, WebSocketDisconnect
import re
from config import settings
from core.secure_store import async_get_secret, get_secret
from web.stats_state import token_counter
from database import db as database

logger = logging.getLogger(__name__)


def _get_openrouter_key_sync(saved: dict) -> str:
    """Resolve OpenRouter key: keychain → DB → settings. Strips control chars."""
    key = get_secret("openrouter_api_key")
    if not key:
        key = saved.get("openrouter_api_key", "") or settings.llm.api_key
    return re.sub(r"[\s\x00-\x1f\x7f]", "", key or "")


def _get_opencode_go_key_sync(saved: dict) -> str:
    """Resolve OpenCode Go key: keychain → DB → settings. Strips control chars."""
    key = get_secret("opencode_go_api_key")
    if not key:
        key = saved.get("opencode_go_api_key", "") or settings.opencode_go.api_key
    return re.sub(r"[\s\x00-\x1f\x7f]", "", key or "")


async def stream_ollama(
    websocket: WebSocket,
    user_message: str,
    history: list[dict],
    conversation_id: str | None = None,
) -> str:
    """Stream Ollama response tokens to the websocket client. Returns full assistant text."""
    msg_id = str(uuid.uuid4())[:8]

    messages = history + [{"role": "user", "content": user_message}]
    full_response = ""

    payload = {
        "model": settings.ollama.model,
        "messages": messages,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.ollama.timeout) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama.base_url}/api/chat",
                json=payload,
            ) as response:
                if response.status_code != 200:
                    await websocket.send_json({
                        "type": "error",
                        "content": f"Ollama returned HTTP {response.status_code}. Is it running?"
                    })
                    return full_response

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        full_response += token
                        await websocket.send_json({
                            "type": "token",
                            "content": token,
                            "msg_id": msg_id,
                        })

                    if chunk.get("done"):
                        tokens_in = chunk.get("prompt_eval_count", 0)
                        tokens_out = chunk.get("eval_count", 0)
                        # Track token usage from Ollama's final chunk
                        token_counter.add(
                            prompt_tokens=tokens_in,
                            eval_tokens=tokens_out,
                        )
                        # Persist messages to DB
                        if conversation_id:
                            await database.add_message(conversation_id, "user", user_message)
                            await database.add_message(
                                conversation_id, "assistant", full_response,
                                tokens_in=tokens_in, tokens_out=tokens_out,
                            )
                        await websocket.send_json({
                            "type": "message_end",
                            "msg_id": msg_id,
                            "tokens_in": tokens_in,
                            "tokens_out": tokens_out,
                        })
                        break

    except httpx.ConnectError:
        await websocket.send_json({
            "type": "error",
            "content": (
                f"Cannot connect to Ollama at {settings.ollama.base_url}. "
                "Make sure Ollama is running: `ollama serve`"
            ),
        })
    except Exception as e:
        await websocket.send_json({"type": "error", "content": str(e)})

    return full_response


async def stream_lmstudio(
    websocket: WebSocket,
    user_message: str,
    history: list[dict],
    model: str,
    conversation_id: str | None = None,
) -> str:
    """Stream LM Studio response tokens (OpenAI-compatible API) to the websocket client."""
    msg_id = str(uuid.uuid4())[:8]
    messages = history + [{"role": "user", "content": user_message}]
    full_response = ""

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.lmstudio.timeout) as client:
            async with client.stream(
                "POST",
                f"{settings.lmstudio.base_url}/v1/chat/completions",
                json=payload,
            ) as response:
                if response.status_code != 200:
                    await websocket.send_json({
                        "type": "error",
                        "content": f"LM Studio returned HTTP {response.status_code}. Is it running?"
                    })
                    return full_response

                async for line in response.aiter_lines():
                    if not line.strip() or line.strip() == "data: [DONE]":
                        continue
                    if line.startswith("data: "):
                        line = line[6:]
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    token = delta.get("content", "")
                    if token:
                        full_response += token
                        await websocket.send_json({
                            "type": "token",
                            "content": token,
                            "msg_id": msg_id,
                        })

                    finish = chunk.get("choices", [{}])[0].get("finish_reason")
                    if finish is not None and finish != "null":
                        if conversation_id:
                            await database.add_message(conversation_id, "user", user_message)
                            await database.add_message(conversation_id, "assistant", full_response)
                        await websocket.send_json({
                            "type": "message_end",
                            "msg_id": msg_id,
                            "tokens_in": 0,
                            "tokens_out": 0,
                        })
                        break

    except httpx.ConnectError:
        await websocket.send_json({
            "type": "error",
            "content": (
                f"Cannot connect to LM Studio at {settings.lmstudio.base_url}. "
                "Make sure LM Studio is running and the server is started."
            ),
        })
    except Exception as e:
        await websocket.send_json({"type": "error", "content": str(e)})

    return full_response


async def stream_openrouter(
    websocket: WebSocket,
    user_message: str,
    history: list[dict],
    model: str,
    api_key: str,
    conversation_id: str | None = None,
) -> str:
    """Stream OpenRouter response tokens (OpenAI-compatible SSE) to the websocket client."""
    msg_id = str(uuid.uuid4())[:8]
    messages = history + [{"role": "user", "content": user_message}]
    full_response = ""

    if not api_key:
        await websocket.send_json({
            "type": "error",
            "content": "OpenRouter API key is not configured. Go to Settings and enter your API key.",
        })
        return full_response

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://github.com/tirpan-pentest",
        "X-Title": "TIRPAN",
    }
    payload = {"model": model, "messages": messages, "stream": True}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    await websocket.send_json({
                        "type": "error",
                        "content": f"OpenRouter HTTP {response.status_code}: {body.decode()[:300]}",
                    })
                    return full_response

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    if line.strip() == "data: [DONE]":
                        break
                    if line.startswith("data: "):
                        line = line[6:]
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    choice = chunk.get("choices", [{}])[0]
                    token = choice.get("delta", {}).get("content", "")
                    if token:
                        full_response += token
                        await websocket.send_json({"type": "token", "content": token, "msg_id": msg_id})

                    if choice.get("finish_reason") and choice["finish_reason"] != "null":
                        usage = chunk.get("usage", {})
                        tokens_in = usage.get("prompt_tokens", 0)
                        tokens_out = usage.get("completion_tokens", 0)
                        token_counter.add(prompt_tokens=tokens_in, eval_tokens=tokens_out)
                        if conversation_id:
                            await database.add_message(conversation_id, "user", user_message)
                            await database.add_message(
                                conversation_id, "assistant", full_response,
                                tokens_in=tokens_in, tokens_out=tokens_out,
                            )
                        await websocket.send_json({
                            "type": "message_end",
                            "msg_id": msg_id,
                            "tokens_in": tokens_in,
                            "tokens_out": tokens_out,
                        })
                        break

    except httpx.ConnectError:
        await websocket.send_json({
            "type": "error",
            "content": "Cannot connect to OpenRouter. Check your internet connection.",
        })
    except Exception as e:
        await websocket.send_json({"type": "error", "content": str(e)})

    return full_response


class _ChatReplyStreamParser:
    """
    State machine that extracts the 'message' value from a streaming JSON
    chat_reply response, yielding content characters as they arrive.

    Expected JSON shape (thought → action → parameters order):
      {"thought": "...", "action": "chat_reply", "parameters": {"message": "actual text"}}

    Call feed(token) with each raw JSON token. It returns any new message
    content ready to emit (already JSON-unescaped), or '' if nothing yet.
    Reset via reset() at the start of each new reasoning iteration.
    """

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._buf = ""
        # States: SCANNING → FOUND_ACTION → IN_MESSAGE → DONE
        self._state = "SCANNING"
        self._msg_start = -1   # index in _buf where message content begins
        self._emitted = 0      # how many buf chars we've already processed

    @property
    def started(self) -> bool:
        return self._state in ("IN_MESSAGE", "DONE")

    def feed(self, token: str) -> str:
        if self._state == "DONE":
            return ""
        prev_len = len(self._buf)
        self._buf += token

        if self._state == "SCANNING":
            if '"action"' in self._buf and "chat_reply" in self._buf:
                self._state = "FOUND_ACTION"
                return self._try_find_message()

        elif self._state == "FOUND_ACTION":
            return self._try_find_message()

        elif self._state == "IN_MESSAGE":
            return self._extract(prev_len)

        return ""

    def _try_find_message(self) -> str:
        idx = self._buf.find('"message"')
        if idx < 0:
            return ""
        after = self._buf[idx + len('"message"'):]
        i = 0
        # skip whitespace then ':'
        while i < len(after) and after[i] in " \t\n\r":
            i += 1
        if i >= len(after) or after[i] != ":":
            return ""
        i += 1
        # skip whitespace then opening '"'
        while i < len(after) and after[i] in " \t\n\r":
            i += 1
        if i >= len(after) or after[i] != '"':
            return ""
        i += 1  # skip opening quote
        self._msg_start = idx + len('"message"') + i
        self._emitted = self._msg_start
        self._state = "IN_MESSAGE"
        return self._extract(self._msg_start)

    def _extract(self, _from: int) -> str:
        result: list[str] = []
        i = self._emitted
        buf = self._buf
        while i < len(buf):
            c = buf[i]
            if c == "\\":
                if i + 1 >= len(buf):
                    break  # wait for next token
                nc = buf[i + 1]
                if nc == '"':
                    result.append('"')
                elif nc == "\\":
                    result.append("\\")
                elif nc == "n":
                    result.append("\n")
                elif nc == "r":
                    result.append("\r")
                elif nc == "t":
                    result.append("\t")
                elif nc == "u":
                    if i + 6 > len(buf):
                        break  # wait for full \uXXXX
                    hex_str = buf[i + 2 : i + 6]
                    try:
                        result.append(chr(int(hex_str, 16)))
                    except ValueError:
                        result.append(f"\\u{hex_str}")
                    i += 6
                    self._emitted = i
                    continue
                else:
                    result.append(nc)
                i += 2
                self._emitted = i
            elif c == '"':
                self._state = "DONE"
                self._emitted = i + 1
                break
            else:
                result.append(c)
                i += 1
                self._emitted = i
        return "".join(result)


def _make_chat_progress_callback(
    websocket: WebSocket,
    loop: asyncio.AbstractEventLoop,
    msg_id: str,
):
    """
    Sync progress_callback → async WebSocket bridge for ChatAgent.

    What gets shown to the user:
      llm_token    → real-time streaming of chat_reply message content
      reasoning    → status bubble: "💭 thought..." (only when using a tool)
      tool_call    → status bubble: "⚙ Running: tool_name(params)"
      tool_result  → status bubble: "✓/✗ tool_name: output preview"
      safety_block → status bubble: "⛔ Blocked: reason"
      error        → error message

    Returns (callback, streaming_state) where streaming_state is a dict:
      {"started": bool, "tasks": list[Task]}
    """
    parser = _ChatReplyStreamParser()
    streaming_state: dict = {"started": False, "tasks": [], "logs": []}

    async def _safe_send(msg: dict) -> None:
        try:
            await websocket.send_json(msg)
        except Exception:
            pass  # WebSocket closed during shutdown — discard silently

    def _task(msg: dict) -> None:
        try:
            t = loop.create_task(_safe_send(msg))
            streaming_state["tasks"].append(t)
        except RuntimeError:
            pass  # event loop already closed during shutdown

    def callback(event_type: str, data: dict) -> None:
        nonlocal parser

        if event_type == "llm_thinking_start":
            # New reasoning iteration — reset parser for fresh JSON
            parser.reset()

        elif event_type == "llm_token":
            content = parser.feed(data.get("token", ""))
            if content:
                streaming_state["started"] = True
                _task({"type": "token", "content": content, "msg_id": msg_id})

        elif event_type == "reasoning":
            # Only show thinking when the agent is about to call a tool,
            # not when it's about to reply (action == chat_reply).
            action = data.get("action", "")
            thought = data.get("thought", "").strip()
            if thought and action and action not in ("chat_reply", "done"):
                preview = thought[:200] + ("…" if len(thought) > 200 else "")
                text = f"💭 {preview}"
                _task({"type": "status", "content": text, "msg_id": msg_id})
                streaming_state["logs"].append(text)

        elif event_type == "tool_call":
            tool_name = data.get("tool", "")
            params = data.get("params", {})
            if isinstance(params, dict):
                params_str = ", ".join(
                    f"{k}={str(v)!r}" for k, v in list(params.items())[:4]
                )
            else:
                params_str = str(params)[:120]
            text = f"⚙ Running: {tool_name}({params_str})"
            _task({"type": "status", "content": text, "msg_id": msg_id})
            streaming_state["logs"].append(text)

        elif event_type == "tool_result":
            tool_name = data.get("tool", "")
            success = data.get("success", False)
            output = str(data.get("output") or data.get("error") or "")
            preview = output.strip()[:400]
            if len(output.strip()) > 400:
                preview += "…"
            icon = "✓" if success else "✗"
            text = f"{icon} {tool_name}: {preview}"
            _task({"type": "status", "content": text, "msg_id": msg_id})
            streaming_state["logs"].append(text)

        elif event_type == "safety_block":
            reason = data.get("reason", data.get("error", ""))
            text = f"⛔ Blocked: {reason}"
            _task({"type": "status", "content": text, "msg_id": msg_id})
            streaming_state["logs"].append(text)

        elif event_type == "error":
            err = data.get("error", str(data))
            _task({"type": "error", "content": err})

    return callback, streaming_state


def _make_approval_callback(
    websocket: WebSocket,
    loop: asyncio.AbstractEventLoop,
    pending_approvals: dict,
):
    """
    Return an async approval_callback for ChatAgent.

    When the agent wants to run a tool:
      1. Sends {"type": "approval_request", "approval_id": ..., "tool": ..., "params": ...}
      2. Suspends until the operator sends {"type": "approval_response", "approval_id": ..., "approved": true/false}
      3. Returns True (approved) or False (denied)

    Times out after 120s and defaults to denied.
    """
    async def callback(action: dict) -> bool:
        approval_id = str(uuid.uuid4())[:8]
        fut: asyncio.Future = loop.create_future()
        pending_approvals[approval_id] = fut

        await websocket.send_json({
            "type": "approval_request",
            "approval_id": approval_id,
            "tool": action.get("tool", ""),
            "params": action.get("params", {}),
        })

        try:
            return await asyncio.wait_for(asyncio.shield(fut), timeout=120.0)
        except asyncio.TimeoutError:
            pending_approvals.pop(approval_id, None)
            await websocket.send_json({
                "type": "status",
                "content": "⏱ Approval timed out — action denied.",
            })
            return False
        finally:
            pending_approvals.pop(approval_id, None)

    return callback


async def _run_chat_agent(
    websocket: WebSocket,
    user_message: str,
    agent,
    conversation_id: str | None,
    msg_id: str,
    pending_approvals: dict,
) -> str:
    """
    Run ChatAgent for one user message with real-time token streaming.

    Event ordering guarantee:
      1. Status bubbles (tool calls, reasoning) — sent via create_task during run()
      2. chat_reply tokens — streamed in real-time as the LLM generates them
      3. message_end       — sent after all tokens are flushed

    The _ChatReplyStreamParser intercepts llm_token events and extracts the
    'message' value from the JSON response, streaming it token-by-token.
    If streaming didn't activate (unexpected action format), the full reply
    is sent at once as a fallback.
    """
    agent.inject_user_message(user_message)

    loop = asyncio.get_event_loop()
    progress_cb, streaming_state = _make_chat_progress_callback(websocket, loop, msg_id)
    agent._progress_cb = progress_cb
    agent._approval_cb = _make_approval_callback(websocket, loop, pending_approvals)

    result = await agent.run()

    # Flush all pending streaming token tasks before sending message_end
    pending_tasks = streaming_state["tasks"]
    if pending_tasks:
        await asyncio.gather(*pending_tasks, return_exceptions=True)

    final_reply = agent.get_final_reply()
    if not final_reply:
        # Fallback: try to extract the last assistant message from memory.
        # This covers cases where the LLM used an unexpected terminal action
        # or hit max_iterations without calling chat_reply/done.
        for m in reversed(list(agent.memory._messages)):
            if m.role == "assistant" and m.content and m.content.strip():
                import json as _json
                try:
                    parsed = _json.loads(m.content)
                    p = parsed.get("parameters") or {}
                    final_reply = (
                        p.get("message")
                        or p.get("narrative")
                        or p.get("findings_summary")
                        or p.get("summary")
                        or parsed.get("thought")
                        or ""
                    )
                except Exception:
                    pass
                if final_reply:
                    break

    if not final_reply:
        if result.status == "failed":
            final_reply = "I encountered an error while processing your request."
        else:
            final_reply = "(No reply generated. Try rephrasing your message.)"

    if not streaming_state["started"]:
        # Streaming parser didn't activate — send the full reply at once (fallback)
        await websocket.send_json({"type": "token", "content": final_reply, "msg_id": msg_id})

    await websocket.send_json({"type": "message_end", "msg_id": msg_id})
    return final_reply, streaming_state["logs"]


async def handle_websocket(websocket: WebSocket) -> None:
    """Main WebSocket connection handler."""
    await websocket.accept()
    conversation_id: str | None = None
    chat_history: list[dict] = []

    # ChatAgent instance — created lazily on first agent-mode message,
    # reset on new_conversation
    _chat_agent = None

    # Pending approval futures: approval_id → asyncio.Future[bool]
    _pending_approvals: dict = {}

    # Session subscriptions — list of session IDs this WS is watching
    watched_sessions: list[str] = []

    # Native terminal sessions bound to this websocket
    terminal_ids: set[str] = set()
    terminal_tasks: dict[str, asyncio.Task] = {}

    async def _send(event: dict) -> None:
        await websocket.send_json(event)

    async def _close_terminal_local(terminal_id: str, reason: str) -> None:
        task = terminal_tasks.pop(terminal_id, None)
        if task is not None and task is not asyncio.current_task():
            task.cancel()

        try:
            from web import app_state
            mgr = getattr(app_state, "pty_manager", None)
            if mgr is not None:
                await mgr.close_terminal(terminal_id, reason=reason)
        except Exception as exc:
            logger.debug("Terminal close failed for %s: %s", terminal_id, exc)

        terminal_ids.discard(terminal_id)

    async def _terminal_stream_loop(terminal_id: str) -> None:
        try:
            from web import app_state
            mgr = getattr(app_state, "pty_manager", None)
            if mgr is None:
                await websocket.send_json({
                    "type": "terminal_error",
                    "terminal_id": terminal_id,
                    "message": "PTY manager unavailable",
                })
                return

            while True:
                output = await mgr.read_terminal(terminal_id, timeout=0.08)
                if output:
                    await websocket.send_json({
                        "type": "terminal_output",
                        "terminal_id": terminal_id,
                        "data": output,
                    })

                exit_code = mgr.get_exit_code(terminal_id)
                if exit_code is not None:
                    await websocket.send_json({
                        "type": "terminal_exit",
                        "terminal_id": terminal_id,
                        "exit_code": exit_code,
                        "reason": "shell_exit",
                    })
                    await _close_terminal_local(terminal_id, reason="shell_exit")
                    break

                await asyncio.sleep(0.01)

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("Terminal stream loop error for %s: %s", terminal_id, exc)
            try:
                await websocket.send_json({
                    "type": "terminal_error",
                    "terminal_id": terminal_id,
                    "message": str(exc),
                })
            except Exception:
                pass
            await _close_terminal_local(terminal_id, reason="stream_error")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "content": "Invalid JSON"})
                continue

            msg_type = msg.get("type")

            if msg_type == "load_conversation":
                cid = msg.get("conversation_id")
                if cid:
                    messages = await database.get_messages(cid)
                    # Only user/assistant roles go into agent memory; tool_log is UI-only
                    chat_history = [
                        {"role": m["role"], "content": m["content"]}
                        for m in messages if m["role"] in ("user", "assistant")
                    ]
                    conversation_id = cid
                    await websocket.send_json({"type": "conversation_loaded", "messages": messages})

            elif msg_type == "chat":
                content = msg.get("content", "").strip()
                if not content:
                    continue

                if not conversation_id:
                    title = content[:60] + ("…" if len(content) > 60 else "")
                    conv = await database.create_conversation(title)
                    conversation_id = conv["id"]
                    await websocket.send_json({"type": "conversation_created", "conversation": conv})

                await websocket.send_json({"type": "user_echo", "content": content})

                # ── Sync LLM provider from frontend so ChatAgent uses the right backend ──
                provider = msg.get("provider", "ollama")
                model_override = msg.get("model", "")

                if provider == "openrouter":
                    settings.llm.provider = "openrouter"
                    if model_override:
                        settings.llm.cloud_model = model_override
                    else:
                        # Resolve from DB if not overridden
                        saved = await database.get_all_settings()
                        or_model = saved.get("cloud_model", settings.llm.cloud_model)
                        if or_model:
                            settings.llm.cloud_model = or_model
                        # Sync API key into settings so LLMRouter's OpenRouterClient picks it up
                        api_key = _get_openrouter_key_sync(saved)
                        if api_key:
                            settings.llm.api_key = api_key
                elif provider == "opencode_go":
                    settings.llm.provider = "opencode_go"
                    if model_override:
                        settings.opencode_go.model = model_override
                    else:
                        saved = await database.get_all_settings()
                        ocg_model = saved.get("opencode_go_model", settings.opencode_go.model)
                        if ocg_model:
                            settings.opencode_go.model = ocg_model
                        api_key = _get_opencode_go_key_sync(saved)
                        if api_key:
                            settings.opencode_go.api_key = api_key
                elif provider == "lmstudio":
                    settings.llm.provider = "lmstudio"
                    if model_override:
                        settings.lmstudio.model = model_override
                else:  # ollama
                    settings.llm.provider = "ollama"
                    if model_override:
                        settings.ollama.model = model_override

                # ── Quick provider reachability check before spinning up agent ──
                from core.llm_client import llm_router
                _prov_ok = await llm_router._primary().is_available()
                if not _prov_ok:
                    _pname = type(llm_router._primary()).__name__.replace("Client", "")
                    _hint = ""
                    if provider == "lmstudio":
                        _hint = f" (configured URL: {settings.lmstudio.base_url})"
                    elif provider == "opencode_go":
                        _hint = " — check your API key and subscription status at https://opencode.ai/auth"
                    elif provider == "ollama":
                        _hint = f" (configured URL: {settings.ollama.base_url})"
                    elif provider == "openrouter":
                        _hint = " — check your API key and network connectivity"
                    await websocket.send_json({
                        "type": "error",
                        "content": (
                            f"Cannot reach {_pname}{_hint}. "
                            "Make sure the service is running and the URL is correct in Settings."
                        ),
                    })
                    continue

                # ── Always use ChatAgent (souls + direct tool access) ──────────
                from core.chat_agent import ChatAgent
                from core.safety import SafetyGuard
                from web.app_state import tool_registry

                msg_id = str(uuid.uuid4())[:8]

                if _chat_agent is None:
                    _chat_agent = ChatAgent(
                        mission_id=conversation_id or str(uuid.uuid4()),
                        tool_registry=tool_registry,
                        safety=SafetyGuard(),
                    )
                    # Replay existing chat history into agent memory
                    for entry in chat_history:
                        if entry["role"] == "user":
                            _chat_agent.memory.add_user(entry["content"])
                        elif entry["role"] == "assistant":
                            _chat_agent.memory.add_assistant(entry["content"])

                # Run the agent as a background task so the WebSocket loop
                # stays alive to receive approval_response messages while the
                # agent is suspended waiting for operator approval.
                agent_task = asyncio.create_task(_run_chat_agent(
                    websocket, content, _chat_agent, conversation_id, msg_id,
                    _pending_approvals,
                ))

                while not agent_task.done():
                    try:
                        raw2 = await asyncio.wait_for(
                            websocket.receive_text(), timeout=1.0
                        )
                        inner = json.loads(raw2)
                        inner_type = inner.get("type")
                        if inner_type == "approval_response":
                            aid = inner.get("approval_id", "")
                            appr = bool(inner.get("approved", False))
                            fut2 = _pending_approvals.get(aid)
                            if fut2 and not fut2.done():
                                fut2.set_result(appr)
                        elif inner_type == "ping":
                            await websocket.send_json({"type": "pong"})
                        # Other message types while agent is running are ignored
                    except asyncio.TimeoutError:
                        continue
                    except json.JSONDecodeError:
                        pass

                assistant_text, tool_logs = await agent_task

                # Persist the conversation turn to the database
                if conversation_id:
                    await database.add_message(conversation_id, "user", content)
                    # Save tool activity logs so they can be replayed when loading history
                    if tool_logs:
                        await database.add_message(
                            conversation_id, "tool_log", "\n".join(tool_logs)
                        )
                    if assistant_text:
                        await database.add_message(conversation_id, "assistant", assistant_text)

                chat_history.append({"role": "user", "content": content})
                if assistant_text:
                    chat_history.append({"role": "assistant", "content": assistant_text})

            elif msg_type == "approval_response":
                # Operator approved or denied a pending tool execution
                # (also handled in the inner loop above while agent is running)
                approval_id = msg.get("approval_id", "")
                approved = bool(msg.get("approved", False))
                fut = _pending_approvals.get(approval_id)
                if fut and not fut.done():
                    fut.set_result(approved)

            elif msg_type == "new_conversation":
                conversation_id = None
                chat_history = []
                _chat_agent = None  # reset agent so next session starts fresh
                # Cancel any pending approvals
                for fut in _pending_approvals.values():
                    if not fut.done():
                        fut.set_result(False)
                _pending_approvals.clear()
                await websocket.send_json({"type": "conversation_reset"})

            elif msg_type == "subscribe_session":
                # Client wants real-time events for a pentest session
                from web import session_manager
                sid = msg.get("session_id", "")
                if sid:
                    if sid not in watched_sessions:
                        watched_sessions.append(sid)
                    # Always replay the buffer so switching back to a session
                    # reconstructs the feed even if already subscribed
                    buffered = session_manager.subscribe(sid, _send)
                    for event in buffered:
                        await websocket.send_json(event)
                    await websocket.send_json({
                        "type": "session_subscribed",
                        "session_id": sid,
                        "replayed": len(buffered),
                    })

            elif msg_type == "unsubscribe_session":
                from web import session_manager
                sid = msg.get("session_id", "")
                if sid in watched_sessions:
                    watched_sessions.remove(sid)
                    session_manager.unsubscribe(sid, _send)

            elif msg_type == "terminal_open":
                sid = str(msg.get("session_id", "") or "").strip()
                if sid and sid != "operator-local" and sid not in watched_sessions:
                    await websocket.send_json({
                        "type": "terminal_error",
                        "message": "Subscribe to a session before opening terminal",
                    })
                    continue
                if not sid:
                    sid = "operator-local"

                if terminal_ids:
                    await websocket.send_json({
                        "type": "terminal_error",
                        "message": "A native terminal is already open for this client",
                    })
                    continue

                from web import app_state
                mgr = getattr(app_state, "pty_manager", None)
                if mgr is None:
                    await websocket.send_json({
                        "type": "terminal_error",
                        "message": "PTY backend is not initialized",
                    })
                    continue

                rows = int(msg.get("rows", 24) or 24)
                cols = int(msg.get("cols", 80) or 80)
                shell = str(msg.get("shell", "bash") or "bash")

                try:
                    term = await mgr.open_terminal(
                        session_id=sid,
                        shell=shell,
                        rows=rows,
                        cols=cols,
                    )
                except Exception as exc:
                    await websocket.send_json({
                        "type": "terminal_error",
                        "message": str(exc),
                    })
                    continue

                terminal_ids.add(term.terminal_id)
                terminal_tasks[term.terminal_id] = asyncio.create_task(_terminal_stream_loop(term.terminal_id))

                await websocket.send_json({
                    "type": "terminal_opened",
                    "terminal_id": term.terminal_id,
                    "shell": shell,
                    "rows": rows,
                    "cols": cols,
                    "session_id": sid,
                })

            elif msg_type == "terminal_input":
                terminal_id = str(msg.get("terminal_id", "") or "")
                if terminal_id not in terminal_ids:
                    await websocket.send_json({
                        "type": "terminal_error",
                        "message": "Unknown or closed terminal session",
                    })
                    continue

                from web import app_state
                mgr = getattr(app_state, "pty_manager", None)
                if mgr is None:
                    await websocket.send_json({
                        "type": "terminal_error",
                        "terminal_id": terminal_id,
                        "message": "PTY backend is not initialized",
                    })
                    continue

                data = str(msg.get("data", "") or "")
                try:
                    await mgr.write_terminal(terminal_id, data)
                except Exception as exc:
                    await websocket.send_json({
                        "type": "terminal_error",
                        "terminal_id": terminal_id,
                        "message": str(exc),
                    })

            elif msg_type == "terminal_resize":
                terminal_id = str(msg.get("terminal_id", "") or "")
                if terminal_id not in terminal_ids:
                    continue

                from web import app_state
                mgr = getattr(app_state, "pty_manager", None)
                if mgr is None:
                    continue

                rows = int(msg.get("rows", 24) or 24)
                cols = int(msg.get("cols", 80) or 80)
                try:
                    await mgr.resize_terminal(terminal_id, rows=rows, cols=cols)
                    await websocket.send_json({
                        "type": "terminal_resized",
                        "terminal_id": terminal_id,
                        "rows": rows,
                        "cols": cols,
                    })
                except Exception:
                    pass

            elif msg_type == "terminal_ping":
                terminal_id = str(msg.get("terminal_id", "") or "")
                from web import app_state
                mgr = getattr(app_state, "pty_manager", None)
                if mgr is not None and terminal_id:
                    try:
                        mgr.touch_terminal(terminal_id)
                    except Exception:
                        pass
                await websocket.send_json({"type": "terminal_pong", "terminal_id": terminal_id})

            elif msg_type == "terminal_close":
                terminal_id = str(msg.get("terminal_id", "") or "")
                if terminal_id in terminal_ids:
                    await _close_terminal_local(terminal_id, reason="operator_close")
                    await websocket.send_json({
                        "type": "terminal_closed",
                        "terminal_id": terminal_id,
                        "reason": "operator_close",
                    })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                await websocket.send_json({
                    "type": "error",
                    "content": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
        except Exception:
            pass
    finally:
        # Clean up terminal sessions bound to this websocket
        try:
            for terminal_id in list(terminal_ids):
                await _close_terminal_local(terminal_id, reason="connection_lost")
        except Exception:
            pass

        for task in list(terminal_tasks.values()):
            try:
                task.cancel()
            except Exception:
                pass
        terminal_tasks.clear()

        # Clean up all session subscriptions
        try:
            from web import session_manager
            for sid in watched_sessions:
                session_manager.unsubscribe(sid, _send)
        except Exception:
            pass
