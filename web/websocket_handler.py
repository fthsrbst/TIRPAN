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


async def stream_ollama(websocket: WebSocket, user_message: str, history: list[dict]) -> None:
    """Stream Ollama response tokens to the websocket client."""
    msg_id = str(uuid.uuid4())[:8]

    messages = history + [{"role": "user", "content": user_message}]

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
                    return

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        await websocket.send_json({
                            "type": "token",
                            "content": token,
                            "msg_id": msg_id,
                        })

                    if chunk.get("done"):
                        await websocket.send_json({
                            "type": "message_end",
                            "msg_id": msg_id,
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


async def handle_websocket(websocket: WebSocket) -> None:
    """Main WebSocket connection handler."""
    await websocket.accept()
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

            if msg_type == "chat":
                content = msg.get("content", "").strip()
                if not content:
                    continue

                # Echo user message back (so UI can confirm delivery)
                await websocket.send_json({"type": "user_echo", "content": content})

                # Stream AI response
                await stream_ollama(websocket, content, chat_history)

                # Update history for context
                chat_history.append({"role": "user", "content": content})
                # (assistant reply is accumulated in UI; we track a placeholder here)
                # For simplicity we don't accumulate assistant text here yet

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
