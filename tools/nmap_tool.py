"""
Phase 3 — NmapTool

Scan tipleri:
  ping    — host discovery (-sn)
  service — port + servis tespiti (-sV)
  os      — OS tespiti (-O)
  full    — hepsi birden (-sV -O)

Çıktı: ScanResult modeli
"""

import asyncio
import logging
import time
import xml.etree.ElementTree as ET

from models.scan_result import Host, Port, ScanResult
from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)

SCAN_TIMEOUT = 300  # 5 dakika maks


class NmapTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="nmap_scan",
            description=(
                "Runs an nmap scan against a target IP or CIDR range. "
                "Use scan_type='ping' for host discovery, 'service' for open ports and versions, "
                "'os' for OS detection, 'full' for everything."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "IP address or CIDR range (e.g. 192.168.1.1 or 10.0.0.0/24)",
                    },
                    "scan_type": {
                        "type": "string",
                        "enum": ["ping", "service", "os", "full"],
                        "description": "Type of scan to perform",
                        "default": "service",
                    },
                    "port_range": {
                        "type": "string",
                        "description": "Port range to scan (e.g. '1-1024'). Ignored for ping scans.",
                        "default": "1-1024",
                    },
                },
                "required": ["target"],
            },
            category="recon",
        )

    async def validate(self, params: dict) -> tuple[bool, str]:
        if "target" not in params:
            return False, "Missing required parameter: target"
        scan_type = params.get("scan_type", "service")
        if scan_type not in ("ping", "service", "os", "full"):
            return False, f"Invalid scan_type: {scan_type}"
        return True, ""

    async def execute(self, params: dict) -> dict:
        ok, err = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": err}

        target = params["target"]
        scan_type = params.get("scan_type", "service")
        port_range = params.get("port_range", "1-1024")

        cmd = self._build_command(target, scan_type, port_range)

        logger.info("nmap cmd: %s", cmd)
        try:
            start = time.time()
            xml_output = await self._run_nmap(cmd)
            duration = time.time() - start

            result = self._parse_xml(xml_output, target, scan_type, duration)
            return {"success": True, "output": result.model_dump(), "error": None}

        except TimeoutError:
            return {"success": False, "output": None, "error": f"Nmap timed out after {SCAN_TIMEOUT}s"}
        except FileNotFoundError:
            return {"success": False, "output": None, "error": "nmap not found — install nmap first"}
        except Exception as e:
            logger.error("nmap execute failed: %s: %r", type(e).__name__, str(e))
            return {"success": False, "output": None, "error": str(e) or f"{type(e).__name__} (no message)"}

    # ── Internals ──────────────────────────────────────────────────────────────

    def _build_command(self, target: str, scan_type: str, port_range: str) -> list[str]:
        from config import settings
        from core.platform_utils import IS_WINDOWS, is_elevated

        is_root = is_elevated()
        # sudo only makes sense on Linux/macOS
        use_sudo = (not IS_WINDOWS) and settings.nmap_sudo and not is_root
        # OS/SYN scans need root; we have it either directly or via sudo
        can_do_os = is_root or use_sudo

        if use_sudo:
            if settings.sudo_password:
                # -S reads password from stdin; -k resets cached credentials first
                base = ["sudo", "-S", "-k", "nmap", "-oX", "-"]
            else:
                base = ["sudo", "-n", "nmap", "-oX", "-"]
        else:
            base = ["nmap", "-oX", "-"]

        if scan_type == "ping":
            base += ["-sn"]
        elif scan_type == "service":
            # With root we can do a fast SYN scan (-sS) instead of TCP connect (-sT)
            base += (["-sS", "-sV", "-p", port_range] if can_do_os else ["-sV", "-p", port_range])
        elif scan_type == "os":
            base += (["-O", "-p", port_range] if can_do_os else ["-sV", "-p", port_range])
        elif scan_type == "full":
            base += (["-sS", "-sV", "-O", "-p", port_range] if can_do_os else ["-sV", "-p", port_range])

        base.append(target)
        return base

    async def _run_nmap(self, cmd: list[str]) -> str:
        """Run nmap in a thread pool to avoid asyncio subprocess issues on Windows."""
        from config import settings

        stdin_data: bytes | None = None
        if cmd[0] == "sudo" and "-S" in cmd:
            stdin_data = (settings.sudo_password + "\n").encode()

        def _run_sync() -> tuple[int, bytes, bytes]:
            import subprocess as _sp
            result = _sp.run(
                cmd,
                input=stdin_data,
                stdout=_sp.PIPE,
                stderr=_sp.PIPE,
                timeout=SCAN_TIMEOUT,
            )
            return result.returncode, result.stdout, result.stderr

        returncode, stdout, stderr = await asyncio.to_thread(_run_sync)
        logger.debug("nmap returncode=%d stdout_len=%d", returncode, len(stdout))

        if returncode != 0:
            err = stderr.decode().strip()
            out = stdout.decode().strip()
            # sudo -n fails when no passwordless sudo is configured — retry without sudo
            if cmd[0] == "sudo" and ("password is required" in err or "a password is required" in err):
                settings.nmap_sudo = False
                cmd_no_sudo = [c for c in cmd if c not in ("sudo", "-n", "-S", "-k")]
                cmd_no_sudo.insert(0, "nmap")
                return await self._run_nmap(cmd_no_sudo)
            details = err or out or f"exit code {returncode}"
            raise RuntimeError(f"nmap failed (rc={returncode}): {details}")
        return stdout.decode()

    def _parse_xml(
        self,
        xml_output: str,
        target: str,
        scan_type: str,
        duration: float,
    ) -> ScanResult:
        root = ET.fromstring(xml_output)
        hosts: list[Host] = []

        for host_el in root.findall("host"):
            # state
            status_el = host_el.find("status")
            state = status_el.get("state", "unknown") if status_el is not None else "unknown"

            # IP
            ip = ""
            hostname = ""
            for addr in host_el.findall("address"):
                if addr.get("addrtype") == "ipv4":
                    ip = addr.get("addr", "")

            # hostname
            hostnames_el = host_el.find("hostnames")
            if hostnames_el is not None:
                hn = hostnames_el.find("hostname")
                if hn is not None:
                    hostname = hn.get("name", "")

            # OS
            os_name = ""
            os_accuracy = 0
            os_el = host_el.find("os")
            if os_el is not None:
                match = os_el.find("osmatch")
                if match is not None:
                    os_name = match.get("name", "")
                    os_accuracy = int(match.get("accuracy", 0))

            # Ports
            ports: list[Port] = []
            ports_el = host_el.find("ports")
            if ports_el is not None:
                for port_el in ports_el.findall("port"):
                    port_state_el = port_el.find("state")
                    port_state = port_state_el.get("state", "unknown") if port_state_el is not None else "unknown"

                    service_el = port_el.find("service")
                    service = ""
                    version = ""
                    if service_el is not None:
                        service = service_el.get("name", "")
                        product = service_el.get("product", "")
                        ver = service_el.get("version", "")
                        version = f"{product} {ver}".strip()

                    ports.append(Port(
                        number=int(port_el.get("portid", 0)),
                        protocol=port_el.get("protocol", "tcp"),
                        state=port_state,
                        service=service,
                        version=version,
                    ))

            hosts.append(Host(
                ip=ip,
                hostname=hostname,
                os=os_name,
                os_accuracy=os_accuracy,
                state=state,
                ports=ports,
            ))

        return ScanResult(
            target=target,
            scan_type=scan_type,
            hosts=hosts,
            duration_seconds=round(duration, 2),
            raw_output=xml_output,
        )
