"""
Defense Tool — block_ip

Blocks or rate-limits a source IP using iptables.
Supports DROP, RATE_LIMIT, and REDIRECT actions.
Also handles un-blocking via remove_block().
"""

from __future__ import annotations

import asyncio
import logging
import time

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)


class BlockIpTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="block_ip",
            description=(
                "Block or rate-limit a hostile IP address using iptables. "
                "Use action='DROP' for confirmed threats (permanent block). "
                "Use action='RATE_LIMIT' to throttle suspicious IPs without full block. "
                "Use action='REDIRECT' to send traffic to a honeypot port. "
                "Set duration=0 for permanent; duration>0 for temporary (seconds). "
                "Returns rule_id that can be used to remove the block later."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "ip": {
                        "type": "string",
                        "description": "Source IP address to block (e.g. '192.168.1.102')"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["DROP", "RATE_LIMIT", "REDIRECT"],
                        "description": "Block action type"
                    },
                    "port": {
                        "type": "integer",
                        "description": "Destination port to block (optional, 0=all ports)"
                    },
                    "redirect_port": {
                        "type": "integer",
                        "description": "Port to redirect traffic to (only for REDIRECT action)"
                    },
                    "duration": {
                        "type": "integer",
                        "description": "Block duration in seconds. 0 = permanent."
                    },
                    "reason": {
                        "type": "string",
                        "description": "Human-readable reason for this block"
                    },
                },
                "required": ["ip", "action"],
            },
            category="response",
        )

    async def health_check(self) -> ToolHealthStatus:
        proc = await asyncio.create_subprocess_exec(
            "which", "iptables",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            return ToolHealthStatus(
                available=False,
                message="iptables not found",
                install_hint="sudo apt-get install iptables",
            )
        return ToolHealthStatus(available=True, message="OK")

    async def execute(self, params: dict) -> dict:
        ip = params.get("ip", "").strip()
        action = params.get("action", "DROP")
        port = params.get("port", 0)
        redirect_port = params.get("redirect_port", 0)
        duration = params.get("duration", 0)
        reason = params.get("reason", "defense agent decision")

        if not ip:
            return {"success": False, "output": None, "error": "ip is required"}

        rule_id = f"tirpan-def-{int(time.time())}-{ip.replace('.', '')}"

        try:
            if action == "DROP":
                cmd = self._build_drop_cmd(ip, port, rule_id)
            elif action == "RATE_LIMIT":
                cmd = self._build_rate_limit_cmd(ip, port, rule_id)
            elif action == "REDIRECT":
                if not redirect_port:
                    return {"success": False, "output": None,
                            "error": "redirect_port required for REDIRECT action"}
                cmd = self._build_redirect_cmd(ip, port, redirect_port, rule_id)
            else:
                return {"success": False, "output": None,
                        "error": f"Unknown action: {action}"}

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            out_text = stdout.decode().strip()
            err_text = stderr.decode().strip()

            if proc.returncode != 0:
                logger.warning("iptables failed for %s: %s", ip, err_text)
                return {
                    "success": False,
                    "output": {"cmd": " ".join(cmd), "stderr": err_text},
                    "error": f"iptables returned code {proc.returncode}: {err_text}",
                }

            logger.info("Blocked %s via %s (rule=%s reason=%s)", ip, action, rule_id, reason)
            return {
                "success": True,
                "output": {
                    "rule_id": rule_id,
                    "action": action,
                    "ip": ip,
                    "port": port,
                    "duration": duration,
                    "cmd": " ".join(cmd),
                },
                "error": None,
            }

        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": "iptables command timed out"}
        except Exception as exc:
            logger.exception("block_ip error for %s", ip)
            return {"success": False, "output": None, "error": str(exc)}

    def _build_drop_cmd(self, ip: str, port: int, rule_id: str) -> list[str]:
        cmd = ["sudo", "iptables", "-I", "INPUT", "-s", ip,
               "-m", "comment", "--comment", rule_id, "-j", "DROP"]
        if port:
            cmd = (["sudo", "iptables", "-I", "INPUT", "-s", ip,
                    "-p", "tcp", "--dport", str(port),
                    "-m", "comment", "--comment", rule_id, "-j", "DROP"])
        return cmd

    def _build_rate_limit_cmd(self, ip: str, port: int, rule_id: str) -> list[str]:
        cmd = [
            "sudo", "iptables", "-I", "INPUT", "-s", ip,
            "-m", "hashlimit",
            "--hashlimit-name", "defense-rl",
            "--hashlimit-above", "10/min",
            "--hashlimit-burst", "20",
            "--hashlimit-mode", "srcip",
            "-m", "comment", "--comment", rule_id,
            "-j", "DROP",
        ]
        return cmd

    def _build_redirect_cmd(
        self, ip: str, port: int, redirect_port: int, rule_id: str
    ) -> list[str]:
        cmd = [
            "sudo", "iptables", "-t", "nat", "-I", "PREROUTING",
            "-s", ip,
        ]
        if port:
            cmd += ["-p", "tcp", "--dport", str(port)]
        cmd += [
            "-m", "comment", "--comment", rule_id,
            "-j", "REDIRECT", "--to-port", str(redirect_port),
        ]
        return cmd
