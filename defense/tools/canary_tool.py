"""
Defense Tool — deploy_canary

Plants canary tokens (tripwires) as files or URLs.
When an attacker accesses the canary, an alert fires.

Canary types:
  - file: Creates a file with a unique token embedded in content.
          Monitors the file for unexpected access via inotify (best-effort).
  - url:  Registers a URL path that will trigger an alert if accessed.
          The HTTP listener is separate (defense agent's internal endpoint).
  - env:  Fake credential in /etc/environment or similar config.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Callable

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)

# Track active canaries: canary_id → metadata
_ACTIVE_CANARIES: dict[str, dict] = {}


class DeployCanaryTool(BaseTool):

    def __init__(self, event_callback: Callable[[str, dict], None] | None = None):
        self._event_cb = event_callback

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="deploy_canary",
            description=(
                "Plant a canary token (tripwire) to detect unauthorized access. "
                "Canary types: "
                "'file' — creates a file with a unique token; alerts if the file is read. "
                "'url' — registers a URL that alerts when accessed by an attacker. "
                "'env' — plants a fake API key or credential in a config location. "
                "Returns canary_id and the token value to watch for. "
                "Canaries are powerful: place them where attackers look but legitimate users don't."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "canary_type": {
                        "type": "string",
                        "enum": ["file", "url", "env"],
                        "description": "Type of canary to deploy"
                    },
                    "path": {
                        "type": "string",
                        "description": (
                            "For 'file': file path to create (e.g. '/etc/passwd.bak'). "
                            "For 'url': URL path (e.g. '/admin/config'). "
                            "For 'env': environment variable name (e.g. 'AWS_SECRET_KEY')"
                        )
                    },
                    "fake_content": {
                        "type": "string",
                        "description": "Realistic-looking content for the canary (e.g. fake AWS key)"
                    },
                    "description": {
                        "type": "string",
                        "description": "What this canary represents (for your records)"
                    },
                },
                "required": ["canary_type", "path"],
            },
            category="response",
        )

    async def execute(self, params: dict) -> dict:
        canary_type = params.get("canary_type", "file")
        path = params.get("path", "").strip()
        fake_content = params.get("fake_content", "")
        description = params.get("description", f"Canary {canary_type} at {path}")

        if not path:
            return {"success": False, "output": None, "error": "path is required"}

        canary_id = f"canary-{uuid.uuid4().hex[:8]}"
        token = uuid.uuid4().hex

        try:
            if canary_type == "file":
                return await self._deploy_file_canary(
                    canary_id, token, path, fake_content, description
                )
            elif canary_type == "url":
                return self._deploy_url_canary(canary_id, token, path, description)
            elif canary_type == "env":
                return await self._deploy_env_canary(
                    canary_id, token, path, fake_content, description
                )
            else:
                return {"success": False, "output": None,
                        "error": f"Unknown canary_type: {canary_type}"}

        except Exception as exc:
            logger.exception("deploy_canary error")
            return {"success": False, "output": None, "error": str(exc)}

    async def _deploy_file_canary(
        self, canary_id: str, token: str, path: str, content: str, description: str
    ) -> dict:
        if not content:
            content = (
                f"# Internal configuration — DO NOT SHARE\n"
                f"# Generated: {time.strftime('%Y-%m-%d')}\n"
                f"token={token}\n"
                f"# canary_id={canary_id}\n"
            )

        # Write the canary file
        proc = await asyncio.create_subprocess_exec(
            "sudo", "bash", "-c",
            f"echo {repr(content)} > {repr(path)} && chmod 644 {repr(path)}",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = stderr.decode(errors="replace")
            return {"success": False, "output": None,
                    "error": f"Could not create canary file: {err}"}

        # Start inotify watch in background (best-effort)
        asyncio.create_task(
            self._watch_file(canary_id, path, token)
        )

        _ACTIVE_CANARIES[canary_id] = {
            "canary_type": "file", "path": path, "token": token,
            "description": description, "created_at": time.time(),
        }

        logger.info("File canary deployed: %s at %s", canary_id, path)
        return {
            "success": True,
            "output": {
                "canary_id": canary_id,
                "canary_type": "file",
                "path": path,
                "token": token,
                "description": description,
            },
            "error": None,
        }

    async def _watch_file(self, canary_id: str, path: str, token: str) -> None:
        """Background task: use inotifywait to detect file reads."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "inotifywait", "-m", "-e", "access,open", path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                event_line = line.decode(errors="replace").strip()
                logger.warning("CANARY TRIGGERED: %s → %s", canary_id, event_line)
                if self._event_cb:
                    self._event_cb("canary_triggered", {
                        "canary_id": canary_id,
                        "path": path,
                        "token": token,
                        "event": event_line,
                        "timestamp": time.time(),
                    })
        except Exception as exc:
            logger.debug("inotifywait not available or error: %s", exc)

    def _deploy_url_canary(
        self, canary_id: str, token: str, url_path: str, description: str
    ) -> dict:
        """Register a URL canary (HTTP listener handles triggering separately)."""
        _ACTIVE_CANARIES[canary_id] = {
            "canary_type": "url",
            "path": url_path,
            "token": token,
            "description": description,
            "created_at": time.time(),
        }
        logger.info("URL canary registered: %s → %s", canary_id, url_path)
        return {
            "success": True,
            "output": {
                "canary_id": canary_id,
                "canary_type": "url",
                "url_path": url_path,
                "token": token,
                "description": description,
                "note": "Alert fires when this URL is accessed",
            },
            "error": None,
        }

    async def _deploy_env_canary(
        self, canary_id: str, token: str, var_name: str, content: str, description: str
    ) -> dict:
        fake_val = content or f"AKIA{token[:16].upper()}"
        entry = f'\nexport {var_name}="{fake_val}"  # canary:{canary_id}\n'

        proc = await asyncio.create_subprocess_exec(
            "sudo", "bash", "-c",
            f"echo {repr(entry)} >> /etc/environment",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = stderr.decode(errors="replace")
            return {"success": False, "output": None,
                    "error": f"Could not write env canary: {err}"}

        _ACTIVE_CANARIES[canary_id] = {
            "canary_type": "env", "path": f"/etc/environment:{var_name}",
            "token": token, "value": fake_val,
            "description": description, "created_at": time.time(),
        }
        logger.info("Env canary deployed: %s=%s", var_name, fake_val)
        return {
            "success": True,
            "output": {
                "canary_id": canary_id,
                "canary_type": "env",
                "var_name": var_name,
                "fake_value": fake_val,
                "token": token,
            },
            "error": None,
        }


def get_url_canary(url_path: str) -> dict | None:
    """Look up a URL canary by path (called by HTTP handler)."""
    for cid, meta in _ACTIVE_CANARIES.items():
        if meta.get("canary_type") == "url" and meta.get("path") == url_path:
            return {**meta, "canary_id": cid}
    return None


def list_canaries() -> list[dict]:
    return [{"canary_id": cid, **meta} for cid, meta in _ACTIVE_CANARIES.items()]
