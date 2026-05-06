"""
Defense Tool — deploy_honeypot

Deploys an asyncio-based TCP honeypot on a specified port.
The honeypot logs all connections and commands, then reports them
back as defense events. Fake banners mimic real services.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)

# Registry of active honeypot servers: port → asyncio.Server
_ACTIVE_HONEYPOTS: dict[int, asyncio.Server] = {}

# Fake service banners keyed by service name
_BANNERS = {
    "ssh":   b"SSH-2.0-OpenSSH_7.4\r\n",
    "ftp":   b"220 (vsFTPd 3.0.3)\r\n",
    "smtp":  b"220 mail.internal ESMTP Postfix (Ubuntu)\r\n",
    "http":  b"HTTP/1.1 200 OK\r\nServer: Apache/2.4.41 (Ubuntu)\r\nContent-Length: 0\r\n\r\n",
    "mysql": b"\x4a\x00\x00\x00\x0a\x35\x2e\x37\x2e\x33\x31\x00",  # MySQL handshake prefix
    "rdp":   b"\x03\x00\x00\x0b\x06\xd0\x00\x00\x12\x34\x00",
    "telnet": b"\xff\xfd\x18\xff\xfd\x20\xff\xfd\x23\xff\xfd\x27",
    "generic": b"Welcome to internal service. Authentication required.\r\n",
}


class DeployHoneypotTool(BaseTool):

    def __init__(self, event_callback: Callable[[str, dict], None] | None = None):
        """
        event_callback: called with (event_type, data) when attacker connects.
        Used by DefenseAgent to emit WebSocket events in real time.
        """
        self._event_cb = event_callback

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="deploy_honeypot",
            description=(
                "Deploy a fake TCP service (honeypot) on a local port to lure and identify attackers. "
                "The honeypot presents a realistic service banner, logs every connection and payload, "
                "and emits alerts when an attacker connects. "
                "Supported fake services: ssh, ftp, smtp, http, mysql, rdp, telnet, generic. "
                "Returns honeypot_id that can be used to stop it later."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "port": {
                        "type": "integer",
                        "description": "Local TCP port for the honeypot (e.g. 8022 for fake SSH)"
                    },
                    "fake_service": {
                        "type": "string",
                        "enum": ["ssh", "ftp", "smtp", "http", "mysql", "rdp", "telnet", "generic"],
                        "description": "Service to impersonate"
                    },
                    "honeypot_id": {
                        "type": "string",
                        "description": "Optional ID for this honeypot (auto-generated if omitted)"
                    },
                },
                "required": ["port", "fake_service"],
            },
            category="response",
        )

    async def execute(self, params: dict) -> dict:
        port = int(params.get("port", 0))
        fake_service = params.get("fake_service", "generic").lower()
        honeypot_id = params.get("honeypot_id") or f"hp-{fake_service}-{port}"

        if not port or port < 1 or port > 65535:
            return {"success": False, "output": None, "error": "Invalid port number"}

        if port in _ACTIVE_HONEYPOTS:
            return {
                "success": True,
                "output": {"honeypot_id": honeypot_id, "port": port, "status": "already_running"},
                "error": None,
            }

        banner = _BANNERS.get(fake_service, _BANNERS["generic"])
        event_cb = self._event_cb

        async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
            peer = writer.get_extra_info("peername", ("?", 0))
            src_ip = peer[0] if peer else "?"
            logger.warning(
                "[HONEYPOT:%s:%d] Connection from %s", fake_service, port, src_ip
            )

            try:
                writer.write(banner)
                await writer.drain()

                # Collect up to 1KB of attacker data
                data = b""
                try:
                    data = await asyncio.wait_for(reader.read(1024), timeout=30.0)
                except asyncio.TimeoutError:
                    pass

                payload_text = data.decode("utf-8", errors="replace").strip()
                logger.warning(
                    "[HONEYPOT:%s:%d] Payload from %s: %r", fake_service, port, src_ip, payload_text
                )

                if event_cb:
                    event_cb("honeypot_hit", {
                        "honeypot_id": honeypot_id,
                        "src_ip": src_ip,
                        "port": port,
                        "service": fake_service,
                        "payload": payload_text,
                        "timestamp": time.time(),
                    })

            except Exception as exc:
                logger.debug("Honeypot client error: %s", exc)
            finally:
                try:
                    writer.close()
                    await writer.wait_closed()
                except Exception:
                    pass

        try:
            server = await asyncio.start_server(handle_client, "0.0.0.0", port)
            _ACTIVE_HONEYPOTS[port] = server
            # Start serving in background (don't await)
            asyncio.create_task(server.serve_forever())
            logger.info("Honeypot deployed: %s on port %d", fake_service, port)
            return {
                "success": True,
                "output": {
                    "honeypot_id": honeypot_id,
                    "port": port,
                    "fake_service": fake_service,
                    "status": "active",
                    "bind": f"0.0.0.0:{port}",
                },
                "error": None,
            }
        except OSError as exc:
            return {
                "success": False,
                "output": None,
                "error": f"Could not bind port {port}: {exc}",
            }
        except Exception as exc:
            logger.exception("deploy_honeypot error")
            return {"success": False, "output": None, "error": str(exc)}


async def stop_honeypot(port: int) -> bool:
    """Stop a running honeypot. Returns True if stopped."""
    server = _ACTIVE_HONEYPOTS.pop(port, None)
    if server:
        server.close()
        await server.wait_closed()
        logger.info("Honeypot on port %d stopped", port)
        return True
    return False
