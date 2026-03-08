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

import json
import uuid
import httpx
from fastapi import WebSocket, WebSocketDisconnect
from config import settings
from web.stats_state import token_counter
from database import db as database


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


async def handle_websocket(websocket: WebSocket) -> None:
    """Main WebSocket connection handler."""
    await websocket.accept()
    conversation_id: str | None = None
    chat_history: list[dict] = []

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
                # Client wants to load an existing conversation
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

                # Create a new conversation if none active
                if not conversation_id:
                    # Use first message as title (truncated)
                    title = content[:60] + ("…" if len(content) > 60 else "")
                    conv = await database.create_conversation(title)
                    conversation_id = conv["id"]
                    await websocket.send_json({"type": "conversation_created", "conversation": conv})

                # Echo user message back (so UI can confirm delivery)
                await websocket.send_json({"type": "user_echo", "content": content})

                # Stream AI response (also saves to DB)
                assistant_text = await stream_ollama(websocket, content, chat_history, conversation_id)

                # Update in-memory history for context
                chat_history.append({"role": "user", "content": content})
                if assistant_text:
                    chat_history.append({"role": "assistant", "content": assistant_text})

            elif msg_type == "new_conversation":
                conversation_id = None
                chat_history = []
                await websocket.send_json({"type": "conversation_reset"})

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
