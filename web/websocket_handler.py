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
import uuid
import httpx
from fastapi import WebSocket, WebSocketDisconnect
import re
from config import settings
from core.secure_store import async_get_secret, get_secret
from web.stats_state import token_counter
from database import db as database


def _get_openrouter_key_sync(saved: dict) -> str:
    """Resolve OpenRouter key: keychain → DB → settings. Strips control chars."""
    key = get_secret("openrouter_api_key")
    if not key:
        key = saved.get("openrouter_api_key", "") or settings.llm.api_key
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


def _make_chat_progress_callback(
    websocket: WebSocket,
    loop: asyncio.AbstractEventLoop,
    msg_id: str,
):
    """
    Sync progress_callback → async WebSocket bridge for ChatAgent.

    What gets shown to the user:
      reasoning    → status bubble: "💭 thought..." (only when using a tool)
      tool_call    → status bubble: "⚙ Running: tool_name(params)"
      tool_result  → status bubble: "✓/✗ tool_name: output preview"
      safety_block → status bubble: "⛔ Blocked: reason"
      error        → error message

    What is intentionally HIDDEN:
      llm_token    — raw JSON reasoning chunks (never show to user)
      chat_reply   — handled by _run_chat_agent after agent.run() returns
      agent_start/done, shell_io, finding, observation, parallel_* — not relevant to chat UI
    """
    def _task(msg: dict) -> None:
        try:
            loop.create_task(websocket.send_json(msg))
        except RuntimeError:
            pass  # loop closed during shutdown

    def callback(event_type: str, data: dict) -> None:
        if event_type == "reasoning":
            # Only show thinking when the agent is about to call a tool,
            # not when it's about to reply (action == chat_reply).
            action = data.get("action", "")
            thought = data.get("thought", "").strip()
            if thought and action and action not in ("chat_reply", "done"):
                preview = thought[:200] + ("…" if len(thought) > 200 else "")
                _task({"type": "status", "content": f"💭 {preview}", "msg_id": msg_id})

        elif event_type == "tool_call":
            tool_name = data.get("tool", "")
            params = data.get("params", {})
            if isinstance(params, dict):
                params_str = ", ".join(
                    f"{k}={str(v)!r}" for k, v in list(params.items())[:4]
                )
            else:
                params_str = str(params)[:120]
            _task({"type": "status", "content": f"⚙ Running: {tool_name}({params_str})", "msg_id": msg_id})

        elif event_type == "tool_result":
            tool_name = data.get("tool", "")
            success = data.get("success", False)
            output = str(data.get("output") or data.get("error") or "")
            # Show first 400 chars of output, strip leading/trailing whitespace
            preview = output.strip()[:400]
            if len(output.strip()) > 400:
                preview += "…"
            icon = "✓" if success else "✗"
            _task({"type": "status", "content": f"{icon} {tool_name}: {preview}", "msg_id": msg_id})

        elif event_type == "safety_block":
            reason = data.get("reason", data.get("error", ""))
            _task({"type": "status", "content": f"⛔ Blocked: {reason}", "msg_id": msg_id})

        elif event_type == "error":
            err = data.get("error", str(data))
            _task({"type": "error", "content": err})

        # llm_token → intentionally skipped (raw JSON, not user-visible)
        # chat_reply → handled after agent.run() returns in _run_chat_agent

    return callback


async def _run_chat_agent(
    websocket: WebSocket,
    user_message: str,
    agent,
    conversation_id: str | None,
    msg_id: str,
) -> str:
    """
    Run ChatAgent for one user message.

    Event ordering guarantee:
      1. Status bubbles (tool calls, reasoning) — sent via create_task during run()
      2. Final reply token  — sent via await AFTER run() completes
      3. message_end        — sent last

    This sequential await ensures the reply always appears after tool status messages.
    """
    agent.inject_user_message(user_message)

    loop = asyncio.get_event_loop()
    agent._progress_cb = _make_chat_progress_callback(websocket, loop, msg_id)

    result = await agent.run()

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

    # Send the final reply as a content token so the frontend renders it as text
    await websocket.send_json({"type": "token", "content": final_reply, "msg_id": msg_id})
    await websocket.send_json({"type": "message_end", "msg_id": msg_id})
    return final_reply


async def handle_websocket(websocket: WebSocket) -> None:
    """Main WebSocket connection handler."""
    await websocket.accept()
    conversation_id: str | None = None
    chat_history: list[dict] = []

    # ChatAgent instance — created lazily on first agent-mode message,
    # reset on new_conversation
    _chat_agent = None

    # Session subscriptions — list of session IDs this WS is watching
    watched_sessions: list[str] = []

    async def _send(event: dict) -> None:
        await websocket.send_json(event)

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
                    chat_history = [{"role": m["role"], "content": m["content"]} for m in messages]
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
                elif provider == "lmstudio":
                    settings.llm.provider = "lmstudio"
                    if model_override:
                        settings.lmstudio.model = model_override
                else:  # ollama
                    settings.llm.provider = "ollama"
                    if model_override:
                        settings.ollama.model = model_override

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

                assistant_text = await _run_chat_agent(
                    websocket, content, _chat_agent, conversation_id, msg_id
                )

                chat_history.append({"role": "user", "content": content})
                if assistant_text:
                    chat_history.append({"role": "assistant", "content": assistant_text})

            elif msg_type == "new_conversation":
                conversation_id = None
                chat_history = []
                _chat_agent = None  # reset agent so next session starts fresh
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
        # Clean up all session subscriptions
        try:
            from web import session_manager
            for sid in watched_sessions:
                session_manager.unsubscribe(sid, _send)
        except Exception:
            pass
