"""
Defense Tool — harden_service

Reduces attack surface by hardening specific services or ports:
  - Disabling unnecessary services via systemctl
  - Blocking ports with UFW or iptables
  - Changing default ports (e.g. SSH from 22 to custom)
  - Restricting access to specific source IPs
"""

from __future__ import annotations

import asyncio
import logging

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)


class HardenServiceTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="harden_service",
            description=(
                "Harden a service or port to reduce attack surface. "
                "Actions: "
                "'disable_service' — stop and disable a systemd service (e.g. telnet, rsh). "
                "'block_port' — add a firewall rule to block inbound access to a port. "
                "'restrict_ip' — allow only specific source IPs to access a port (allowlist). "
                "'close_port' — close a listening port immediately (blocks via iptables). "
                "Returns what was hardened and whether it succeeded."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["disable_service", "block_port", "restrict_ip", "close_port"],
                        "description": "Hardening action to perform"
                    },
                    "service_name": {
                        "type": "string",
                        "description": "Systemd service name (for disable_service action)"
                    },
                    "port": {
                        "type": "integer",
                        "description": "Port number to block/restrict/close"
                    },
                    "protocol": {
                        "type": "string",
                        "enum": ["tcp", "udp", "both"],
                        "description": "Protocol for port actions (default: tcp)"
                    },
                    "allowed_ip": {
                        "type": "string",
                        "description": "IP/CIDR to allow (for restrict_ip; all others blocked)"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why this hardening step is being applied"
                    },
                },
                "required": ["action"],
            },
            category="response",
        )

    async def execute(self, params: dict) -> dict:
        action = params.get("action", "")
        service_name = params.get("service_name", "").strip()
        port = params.get("port", 0)
        protocol = params.get("protocol", "tcp")
        allowed_ip = params.get("allowed_ip", "").strip()
        reason = params.get("reason", "defense agent hardening")

        try:
            if action == "disable_service":
                return await self._disable_service(service_name, reason)
            elif action == "block_port":
                return await self._block_port(port, protocol, reason)
            elif action == "restrict_ip":
                return await self._restrict_to_ip(port, protocol, allowed_ip, reason)
            elif action == "close_port":
                return await self._close_port(port, protocol, reason)
            else:
                return {"success": False, "output": None,
                        "error": f"Unknown hardening action: {action}"}

        except Exception as exc:
            logger.exception("harden_service error")
            return {"success": False, "output": None, "error": str(exc)}

    async def _run(self, cmd: list[str], timeout: int = 30) -> tuple[int, str, str]:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode, stdout.decode(errors="replace"), stderr.decode(errors="replace")

    async def _disable_service(self, service_name: str, reason: str) -> dict:
        if not service_name:
            return {"success": False, "output": None, "error": "service_name required"}

        rc1, out1, err1 = await self._run(["sudo", "systemctl", "stop", service_name])
        rc2, out2, err2 = await self._run(["sudo", "systemctl", "disable", service_name])

        success = rc1 == 0 or rc2 == 0
        logger.info("Hardening: disabled service %s (reason: %s)", service_name, reason)
        return {
            "success": success,
            "output": {
                "action": "disable_service",
                "service": service_name,
                "stop_rc": rc1,
                "disable_rc": rc2,
                "reason": reason,
            },
            "error": err1 or err2 if not success else None,
        }

    async def _block_port(self, port: int, protocol: str, reason: str) -> dict:
        if not port:
            return {"success": False, "output": None, "error": "port required"}

        protos = ["tcp", "udp"] if protocol == "both" else [protocol]
        cmds_run = []
        for proto in protos:
            cmd = ["sudo", "iptables", "-I", "INPUT", "-p", proto,
                   "--dport", str(port), "-j", "DROP"]
            rc, _, err = await self._run(cmd)
            cmds_run.append({"proto": proto, "rc": rc, "err": err})

        success = all(c["rc"] == 0 for c in cmds_run)
        logger.info("Hardening: blocked port %d/%s (reason: %s)", port, protocol, reason)
        return {
            "success": success,
            "output": {
                "action": "block_port",
                "port": port,
                "protocol": protocol,
                "commands": cmds_run,
                "reason": reason,
            },
            "error": None if success else str(cmds_run),
        }

    async def _restrict_to_ip(
        self, port: int, protocol: str, allowed_ip: str, reason: str
    ) -> dict:
        if not port or not allowed_ip:
            return {"success": False, "output": None,
                    "error": "port and allowed_ip required"}

        # Allow traffic from allowed_ip, then drop all others
        allow_cmd = ["sudo", "iptables", "-I", "INPUT", "-p", protocol,
                     "--dport", str(port), "-s", allowed_ip, "-j", "ACCEPT"]
        block_cmd = ["sudo", "iptables", "-A", "INPUT", "-p", protocol,
                     "--dport", str(port), "-j", "DROP"]

        rc1, _, err1 = await self._run(allow_cmd)
        rc2, _, err2 = await self._run(block_cmd)
        success = rc1 == 0 and rc2 == 0
        logger.info("Hardening: restricted port %d to %s", port, allowed_ip)
        return {
            "success": success,
            "output": {
                "action": "restrict_ip",
                "port": port, "protocol": protocol, "allowed_ip": allowed_ip,
                "allow_rc": rc1, "block_rc": rc2, "reason": reason,
            },
            "error": (err1 or err2) if not success else None,
        }

    async def _close_port(self, port: int, protocol: str, reason: str) -> dict:
        if not port:
            return {"success": False, "output": None, "error": "port required"}

        protos = ["tcp", "udp"] if protocol == "both" else [protocol]
        results = []
        for proto in protos:
            cmd = ["sudo", "iptables", "-I", "INPUT", "-p", proto,
                   "--dport", str(port), "-j", "REJECT"]
            rc, _, err = await self._run(cmd)
            results.append({"proto": proto, "rc": rc})

        success = all(r["rc"] == 0 for r in results)
        return {
            "success": success,
            "output": {"action": "close_port", "port": port, "protocol": protocol,
                       "reason": reason},
            "error": None if success else "iptables REJECT failed",
        }
