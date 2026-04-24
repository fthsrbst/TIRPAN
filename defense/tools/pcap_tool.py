"""
Defense Tool — capture_pcap

Starts or stops a tcpdump packet capture session.
Captured packets can be analyzed for forensics or evidence.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

# Active captures: capture_id → process
_ACTIVE_CAPTURES: dict[str, asyncio.subprocess.Process] = {}

_CAPTURE_DIR = Path("/tmp/tirpan_captures")


class CapturePcapTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="capture_pcap",
            description=(
                "Start or stop a network packet capture using tcpdump. "
                "Use action='start' to begin capturing traffic (specify filter for efficiency). "
                "Use action='stop' to end a capture and get the file path. "
                "Use action='list' to see active captures. "
                "Captures are saved to /tmp/tirpan_captures/ for forensic analysis. "
                "Example filters: 'host 192.168.1.102', 'port 80', 'tcp and src 10.0.0.5'. "
                "Returns capture_id that can be used to stop the capture later."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["start", "stop", "list"],
                        "description": "Capture action"
                    },
                    "capture_id": {
                        "type": "string",
                        "description": "Capture ID to stop (required for action='stop')"
                    },
                    "interface": {
                        "type": "string",
                        "description": "Network interface (default: any)"
                    },
                    "filter": {
                        "type": "string",
                        "description": "BPF filter expression (e.g. 'host 192.168.1.102')"
                    },
                    "max_packets": {
                        "type": "integer",
                        "description": "Stop after N packets (0 = unlimited, default 10000)"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why this capture is being started (for the record)"
                    },
                },
                "required": ["action"],
            },
            category="response",
        )

    async def health_check(self) -> ToolHealthStatus:
        proc = await asyncio.create_subprocess_exec(
            "which", "tcpdump",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            return ToolHealthStatus(
                available=False,
                message="tcpdump not found",
                install_hint="sudo apt-get install tcpdump",
            )
        return ToolHealthStatus(available=True, message="OK")

    async def execute(self, params: dict) -> dict:
        action = params.get("action", "list")

        if action == "list":
            return self._list_captures()
        elif action == "start":
            return await self._start_capture(params)
        elif action == "stop":
            return await self._stop_capture(params.get("capture_id", ""))
        else:
            return {"success": False, "output": None, "error": f"Unknown action: {action}"}

    def _list_captures(self) -> dict:
        captures = [{"capture_id": cid, "running": proc.returncode is None}
                    for cid, proc in _ACTIVE_CAPTURES.items()]
        return {"success": True, "output": {"active_captures": captures}, "error": None}

    async def _start_capture(self, params: dict) -> dict:
        interface = params.get("interface", "any")
        pcap_filter = params.get("filter", "")
        max_packets = int(params.get("max_packets") or 10000)
        reason = params.get("reason", "forensic capture")

        _CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
        capture_id = f"cap-{int(time.time())}"
        outfile = str(_CAPTURE_DIR / f"{capture_id}.pcap")

        cmd = ["sudo", "tcpdump", "-i", interface, "-w", outfile, "-n"]
        if max_packets > 0:
            cmd += ["-c", str(max_packets)]
        if pcap_filter:
            cmd.append(pcap_filter)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _ACTIVE_CAPTURES[capture_id] = proc
            logger.info("PCAP capture started: %s (filter=%r, reason=%s)", capture_id, pcap_filter, reason)

            return {
                "success": True,
                "output": {
                    "capture_id": capture_id,
                    "interface": interface,
                    "filter": pcap_filter,
                    "outfile": outfile,
                    "max_packets": max_packets,
                    "reason": reason,
                },
                "error": None,
            }

        except Exception as exc:
            logger.exception("capture_pcap start error")
            return {"success": False, "output": None, "error": str(exc)}

    async def _stop_capture(self, capture_id: str) -> dict:
        if not capture_id:
            return {"success": False, "output": None, "error": "capture_id required"}

        proc = _ACTIVE_CAPTURES.pop(capture_id, None)
        if not proc:
            return {"success": False, "output": None,
                    "error": f"No active capture with id: {capture_id}"}

        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=10)
        except asyncio.TimeoutError:
            proc.kill()

        outfile = str(_CAPTURE_DIR / f"{capture_id}.pcap")
        filesize = os.path.getsize(outfile) if os.path.exists(outfile) else 0

        return {
            "success": True,
            "output": {
                "capture_id": capture_id,
                "outfile": outfile,
                "filesize_bytes": filesize,
                "status": "stopped",
            },
            "error": None,
        }
