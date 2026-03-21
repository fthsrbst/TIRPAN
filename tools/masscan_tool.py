"""V2 — masscan_scan tool. Fast port scanner (much faster than nmap for large ranges)."""

from __future__ import annotations

import asyncio
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
MASSCAN_TIMEOUT = 300


class MasscanTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="masscan_scan",
            category="recon",
            description=(
                "Fast port scanner using masscan. Best for large CIDR ranges. "
                "Returns list of open ports per host."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "target":     {"type": "string", "description": "IP or CIDR range"},
                    "port_range": {"type": "string", "default": "1-65535"},
                    "rate":       {"type": "integer", "default": 1000,
                                   "description": "packets/sec (1000=safe, 10000=fast)"},
                },
                "required": ["target"],
            },
        )

    async def execute(self, params: dict) -> dict:
        target = params.get("target", "")
        port_range = params.get("port_range", "1-65535")
        rate = int(params.get("rate", 1000))

        if not shutil.which("masscan"):
            return {"status": "error", "error": "masscan not found — install with: apt install masscan"}

        cmd = ["sudo", "masscan", target, f"-p{port_range}", f"--rate={rate}", "-oJ", "-"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=MASSCAN_TIMEOUT
            )
        except asyncio.TimeoutError:
            return {"status": "error", "error": "masscan timeout"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

        if proc.returncode not in (0, None):
            return {"status": "error", "error": stderr.decode(errors="replace")[:500]}

        return self._parse_masscan_json(stdout.decode(errors="replace"))

    def _parse_masscan_json(self, raw: str) -> dict:
        import json
        hosts: dict[str, dict] = {}
        lines = [l.strip().rstrip(",") for l in raw.splitlines()
                 if l.strip() and not l.strip().startswith("[")]
        for line in lines:
            try:
                entry = json.loads(line)
            except Exception:
                continue
            ip = entry.get("ip", "")
            if not ip:
                continue
            if ip not in hosts:
                hosts[ip] = {"ip": ip, "ports": []}
            for p in entry.get("ports", []):
                hosts[ip]["ports"].append({
                    "port":    p.get("port", 0),
                    "portid":  p.get("port", 0),
                    "state":   p.get("status", "open"),
                    "service": p.get("service", {}).get("name", ""),
                    "name":    p.get("service", {}).get("name", ""),
                })
        return {"status": "success", "hosts": list(hosts.values()), "total": len(hosts)}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("masscan"):
            return ToolHealthStatus(available=True, message="masscan_scan")
        return ToolHealthStatus(available=False, message="masscan binary not found")
