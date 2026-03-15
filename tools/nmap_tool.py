"""
Phase 3 — NmapTool

Scan types:
  ping    — host discovery (-sn)
  service — port + service detection (-sV)
  os      — OS detection (-O)
  full    — everything (-sV -O)

V2 additions:
  - health_check(): verifies nmap binary + sudo availability
  - Speed profile integration: timing flags from config.SPEED_PROFILES
  - NSE script support
  - OS detection and version intensity controls
"""

import asyncio
import logging
import shutil
import time
import xml.etree.ElementTree as ET

from models.scan_result import Host, Port, ScanResult
from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

SCAN_TIMEOUT = 600  # 10 minutes max (increased for large networks with stealth timing)


class NmapTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="nmap_scan",
            description=(
                "Runs an nmap scan against a target IP or CIDR range. "
                "Use scan_type='ping' for host discovery, 'service' for open ports and versions, "
                "'os' for OS detection, 'full' for everything. "
                "Timing is automatically controlled by the active speed profile."
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
                    "scripts": {
                        "type": "string",
                        "description": "NSE script categories or names (e.g. 'vuln,auth' or 'default'). Optional.",
                        "default": "",
                    },
                    "excluded_ports": {
                        "type": "string",
                        "description": "Comma-separated ports to exclude from scan (e.g. '23,25,5900'). Optional.",
                        "default": "",
                    },
                },
                "required": ["target"],
            },
            category="recon",
        )

    # ── Health Check (V2) ────────────────────────────────────────────────────

    async def health_check(self) -> ToolHealthStatus:
        import sys
        from core.platform_utils import IS_WINDOWS, is_elevated

        if not shutil.which("nmap"):
            if sys.platform == "linux":
                hint = "sudo apt install nmap   # Debian/Ubuntu/Kali"
            elif sys.platform == "darwin":
                hint = "brew install nmap"
            else:
                hint = "https://nmap.org/download.html"
            return ToolHealthStatus(available=False, message="nmap not found", install_hint=hint)

        # Verify version
        try:
            import subprocess
            result = subprocess.run(["nmap", "--version"], capture_output=True, text=True, timeout=5)
            version_line = result.stdout.splitlines()[0] if result.stdout else "nmap (version unknown)"
        except Exception:
            version_line = "nmap (version check failed)"

        if IS_WINDOWS:
            if is_elevated():
                return ToolHealthStatus(available=True, message=f"{version_line} — Administrator")
            return ToolHealthStatus(
                available=True,
                degraded=True,
                message=f"{version_line} — no admin privileges; SYN/OS scans unavailable",
            )

        # Linux / macOS
        from config import settings
        if is_elevated():
            return ToolHealthStatus(available=True, message=f"{version_line} — running as root")
        if settings.nmap_sudo:
            return ToolHealthStatus(
                available=True,
                degraded=False,
                message=f"{version_line} — sudo mode enabled",
            )
        return ToolHealthStatus(
            available=True,
            degraded=True,
            message=f"{version_line} — no sudo; SYN/OS scans unavailable (enable sudo in Config)",
        )

    # ── Validation ───────────────────────────────────────────────────────────

    async def validate(self, params: dict) -> tuple[bool, str]:
        if "target" not in params:
            return False, "Missing required parameter: target"
        scan_type = params.get("scan_type", "service")
        if scan_type not in ("ping", "service", "os", "full"):
            return False, f"Invalid scan_type: {scan_type}"
        return True, ""

    # ── Execute ──────────────────────────────────────────────────────────────

    async def execute(self, params: dict) -> dict:
        ok, err = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": err}

        target = params["target"]
        scan_type = params.get("scan_type", "service")
        port_range = params.get("port_range", "1-1024")
        scripts = params.get("scripts", "")
        excluded_ports = params.get("excluded_ports", "")

        cmd = self._build_command(target, scan_type, port_range, scripts, excluded_ports)

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
            logger.error("nmap failed: %s: %s", type(e).__name__, e)
            return {"success": False, "output": None, "error": str(e)}

    # ── Internals ─────────────────────────────────────────────────────────────

    def _build_command(
        self,
        target: str,
        scan_type: str,
        port_range: str,
        scripts: str = "",
        excluded_ports: str = "",
    ) -> list[str]:
        from config import settings, SPEED_PROFILES
        from core.platform_utils import IS_WINDOWS, is_elevated

        is_root = is_elevated()
        use_sudo = (not IS_WINDOWS) and settings.nmap_sudo and not is_root
        can_do_os = is_root or use_sudo

        # Speed profile timing
        profile = SPEED_PROFILES.get(settings.speed_profile, SPEED_PROFILES["normal"])
        timing_flags = [profile.nmap_timing] + profile.nmap_extra

        if use_sudo:
            if settings.sudo_password:
                base = ["sudo", "-S", "-k", "nmap", "-oX", "-"] + timing_flags
            else:
                base = ["sudo", "-n", "nmap", "-oX", "-"] + timing_flags
        else:
            base = ["nmap", "-oX", "-"] + timing_flags

        if scan_type == "ping":
            base += ["-sn"]
        elif scan_type == "service":
            base += (["-sS", "-sV", "-p", port_range] if can_do_os else ["-sV", "-p", port_range])
        elif scan_type == "os":
            base += (["-O", "-p", port_range] if can_do_os else ["-sV", "-p", port_range])
        elif scan_type == "full":
            base += (["-sS", "-sV", "-O", "-p", port_range] if can_do_os else ["-sV", "-p", port_range])

        # NSE scripts
        if scripts.strip() and scan_type != "ping":
            base += ["--script", scripts.strip()]

        # Port exclusions — merge tool param + global safety config
        all_excluded: list[str] = []
        if excluded_ports.strip():
            all_excluded += [p.strip() for p in excluded_ports.split(",") if p.strip()]
        global_exc = [str(p) for p in settings.safety.excluded_ports if p]
        all_excluded += [p for p in global_exc if p not in all_excluded]
        if all_excluded and scan_type != "ping":
            base += ["--exclude-ports", ",".join(all_excluded)]

        base.append(target)
        return base

    async def _run_nmap(self, cmd: list[str]) -> str:
        from config import settings

        stdin_data: bytes | None = None
        if cmd[0] == "sudo" and "-S" in cmd:
            stdin_data = (settings.sudo_password + "\n").encode()

        def _run_sync() -> tuple[int, bytes, bytes]:
            import subprocess as _sp
            try:
                result = _sp.run(
                    cmd,
                    input=stdin_data,
                    stdout=_sp.PIPE,
                    stderr=_sp.PIPE,
                    timeout=SCAN_TIMEOUT,
                )
                return result.returncode, result.stdout, result.stderr
            except _sp.TimeoutExpired:
                raise TimeoutError(f"nmap timed out after {SCAN_TIMEOUT}s")

        returncode, stdout, stderr = await asyncio.to_thread(_run_sync)

        if returncode != 0:
            err = stderr.decode().strip()
            out = stdout.decode().strip()
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
            status_el = host_el.find("status")
            state = status_el.get("state", "unknown") if status_el is not None else "unknown"

            ip = ""
            hostname = ""
            for addr in host_el.findall("address"):
                if addr.get("addrtype") == "ipv4":
                    ip = addr.get("addr", "")

            hostnames_el = host_el.find("hostnames")
            if hostnames_el is not None:
                hn = hostnames_el.find("hostname")
                if hn is not None:
                    hostname = hn.get("name", "")

            os_name = ""
            os_accuracy = 0
            os_el = host_el.find("os")
            if os_el is not None:
                match = os_el.find("osmatch")
                if match is not None:
                    os_name = match.get("name", "")
                    os_accuracy = int(match.get("accuracy", 0))

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
