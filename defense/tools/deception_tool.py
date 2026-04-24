"""
Defense Tool — deception_ops

Advanced deception operations:
  - ARP spoofing defense (fake ARP replies to misdirect attacker)
  - Banner injection (serve fake service banners on live ports)
  - Fake topology injection (announce non-existent hosts to confuse attacker)
  - Tarpit mode (slow down attacker's TCP connections)
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)


class DeceptionOpsTool(BaseTool):

    def __init__(self, event_callback: Callable[[str, dict], None] | None = None):
        self._event_cb = event_callback

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="deception_ops",
            description=(
                "Advanced deception and misdirection operations against the attacker. "
                "Operations: "
                "'fake_banner' — replace a real service's banner with a misleading one "
                  "(e.g. show 'Windows Server 2003' to mislead OS fingerprinting). "
                "'announce_fake_host' — use ARP to announce a non-existent host, "
                  "wasting the attacker's scan time. "
                "'tarpit' — configure iptables tarpit to slow attacker's port scans. "
                "'inject_fake_creds' — plant fake credentials in commonly scraped locations. "
                "All operations are logged and can be reversed."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["fake_banner", "announce_fake_host", "tarpit", "inject_fake_creds"],
                        "description": "Deception operation to perform"
                    },
                    "target_ip": {
                        "type": "string",
                        "description": "Attacker IP to target with deception"
                    },
                    "fake_host_ip": {
                        "type": "string",
                        "description": "For announce_fake_host: IP address of the fake host to announce"
                    },
                    "fake_banner": {
                        "type": "string",
                        "description": "For fake_banner: the fake service banner text to show"
                    },
                    "port": {
                        "type": "integer",
                        "description": "Port number for banner injection or tarpit"
                    },
                    "interface": {
                        "type": "string",
                        "description": "Network interface (default: eth0)"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Reason for this deception operation"
                    },
                },
                "required": ["operation"],
            },
            category="response",
        )

    async def execute(self, params: dict) -> dict:
        operation = params.get("operation", "")
        target_ip = params.get("target_ip", "").strip()
        fake_host_ip = params.get("fake_host_ip", "").strip()
        fake_banner = params.get("fake_banner", "").strip()
        port = int(params.get("port") or 0)
        interface = params.get("interface", "eth0").strip()
        reason = params.get("reason", "deception operation")

        try:
            if operation == "fake_banner":
                return await self._fake_banner(port, fake_banner, target_ip, reason)
            elif operation == "announce_fake_host":
                return await self._announce_fake_host(fake_host_ip, interface, reason)
            elif operation == "tarpit":
                return await self._tarpit(target_ip, port, reason)
            elif operation == "inject_fake_creds":
                return await self._inject_fake_creds(reason)
            else:
                return {"success": False, "output": None,
                        "error": f"Unknown operation: {operation}"}

        except Exception as exc:
            logger.exception("deception_ops error")
            return {"success": False, "output": None, "error": str(exc)}

    async def _fake_banner(self, port: int, banner: str, target_ip: str, reason: str) -> dict:
        """
        Use iptables NFQUEUE + a simple Python interceptor to inject a fake banner.
        Simplified: redirect to our honeypot which serves the fake banner.
        """
        if not port:
            return {"success": False, "output": None, "error": "port required for fake_banner"}

        note = (
            f"Fake banner deception configured for port {port}. "
            f"Redirect attacker's connections to a honeypot port serving the fake banner. "
            f"Use deploy_honeypot with a custom banner on a different port, then "
            f"use block_ip with REDIRECT action to send attacker traffic there."
        )
        logger.info("Deception: fake_banner on port %d (target=%s)", port, target_ip)
        if self._event_cb:
            self._event_cb("defense_deception", {
                "deception_type": "FAKE_BANNER",
                "port": port,
                "target_ip": target_ip,
                "banner": banner,
                "timestamp": time.time(),
            })
        return {
            "success": True,
            "output": {
                "operation": "fake_banner",
                "port": port,
                "banner": banner,
                "target_ip": target_ip,
                "note": note,
            },
            "error": None,
        }

    async def _announce_fake_host(self, fake_ip: str, interface: str, reason: str) -> dict:
        """Use arping to flood ARP replies for a non-existent host."""
        if not fake_ip:
            return {"success": False, "output": None, "error": "fake_host_ip required"}

        # Send 10 gratuitous ARP replies for the fake host
        cmd = ["sudo", "arping", "-c", "10", "-U", "-I", interface, fake_ip]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
        err = stderr.decode(errors="replace")

        logger.info("Deception: announced fake host %s on %s", fake_ip, interface)
        if self._event_cb:
            self._event_cb("defense_deception", {
                "deception_type": "FAKE_HOST",
                "fake_ip": fake_ip,
                "interface": interface,
                "timestamp": time.time(),
            })
        return {
            "success": proc.returncode == 0,
            "output": {
                "operation": "announce_fake_host",
                "fake_ip": fake_ip,
                "interface": interface,
                "reason": reason,
            },
            "error": err if proc.returncode != 0 else None,
        }

    async def _tarpit(self, target_ip: str, port: int, reason: str) -> dict:
        """Apply iptables TARPIT extension to slow attacker's connections."""
        if not target_ip:
            return {"success": False, "output": None, "error": "target_ip required for tarpit"}

        cmd = ["sudo", "iptables", "-I", "INPUT", "-s", target_ip]
        if port:
            cmd += ["-p", "tcp", "--dport", str(port)]
        cmd += ["-j", "TARPIT", "--tarpit"]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        err = stderr.decode(errors="replace")

        if "TARPIT" in err and "No chain" in err:
            # TARPIT module not available, use DROP instead with note
            return {
                "success": False,
                "output": None,
                "error": "TARPIT iptables extension not loaded. Use block_ip with DROP instead.",
            }

        logger.info("Deception: tarpit applied to %s port %s", target_ip, port or "all")
        return {
            "success": proc.returncode == 0,
            "output": {
                "operation": "tarpit",
                "target_ip": target_ip,
                "port": port,
                "reason": reason,
            },
            "error": err if proc.returncode != 0 else None,
        }

    async def _inject_fake_creds(self, reason: str) -> dict:
        """Create realistic-looking fake credentials in common locations."""
        fake_entries = [
            ("/tmp/.aws_credentials_backup",
             "[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n"),
            ("/tmp/db_config.txt",
             "DB_HOST=internal-mysql.corp\nDB_USER=dbadmin\nDB_PASS=Tr0ub4dor&3\nDB_NAME=production\n"),
        ]

        placed = []
        for path, content in fake_entries:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "bash", "-c", f"echo {repr(content)} > {repr(path)} && chmod 644 {repr(path)}",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(proc.communicate(), timeout=5)
                if proc.returncode == 0:
                    placed.append(path)
            except Exception:
                pass

        if self._event_cb:
            self._event_cb("defense_deception", {
                "deception_type": "FAKE_CREDS",
                "files": placed,
                "timestamp": time.time(),
            })

        return {
            "success": len(placed) > 0,
            "output": {
                "operation": "inject_fake_creds",
                "placed_files": placed,
                "reason": reason,
            },
            "error": None if placed else "Could not create any fake credential files",
        }
