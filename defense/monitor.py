"""
TIRPAN Defense — Network Monitor

Network-wide monitoring strategy:
  1. Local: scapy AsyncSniffer on all interfaces (if available)
  2. Remote hosts: SSH poll of netstat + auth.log every poll_interval seconds
  3. Auth log polling: parse /var/log/auth.log for brute-force / lateral movement
  4. ARP watching: dedicated ARP packet listener

All events are fed into the DetectorEngine which fires alert callbacks.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import Callable
from typing import Any

from defense.detector import AuthEvent, DetectorEngine, PacketEvent

logger = logging.getLogger(__name__)

AlertCallback = Callable[[dict], None]


# ── Log parsers ───────────────────────────────────────────────────────────────

_SSH_FAIL_RE = re.compile(
    r"Failed (?:password|publickey) for (?:invalid user )?(\S+) "
    r"from (\d+\.\d+\.\d+\.\d+) port \d+"
)
_SSH_OK_RE = re.compile(
    r"Accepted (?:password|publickey) for (\S+) "
    r"from (\d+\.\d+\.\d+\.\d+) port \d+"
)
_AUTH_LOG_PATHS = ["/var/log/auth.log", "/var/log/secure"]


class AuthLogPoller:
    """
    Tails auth.log to generate AuthEvents for the BruteForceDetector.
    Works for both local and remote hosts.
    """

    def __init__(
        self,
        detector: DetectorEngine,
        local_ip: str = "127.0.0.1",
        log_paths: list[str] | None = None,
    ):
        self._detector = detector
        self._local_ip = local_ip
        self._log_paths = log_paths or _AUTH_LOG_PATHS
        self._last_pos: dict[str, int] = {}
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self, poll_interval: float = 5.0) -> None:
        self._running = True
        self._task = asyncio.create_task(self._poll_loop(poll_interval))
        logger.info("AuthLogPoller started (interval=%.1fs)", poll_interval)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _poll_loop(self, interval: float) -> None:
        while self._running:
            try:
                await self._check_logs()
            except Exception as exc:
                logger.debug("AuthLogPoller error: %s", exc)
            await asyncio.sleep(interval)

    async def _check_logs(self) -> None:
        for path in self._log_paths:
            try:
                await self._read_new_lines(path)
            except (FileNotFoundError, PermissionError):
                pass

    async def _read_new_lines(self, path: str) -> None:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "cat", path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        content = stdout.decode(errors="replace")
        lines = content.splitlines()

        last = self._last_pos.get(path, 0)
        new_lines = lines[last:]
        self._last_pos[path] = len(lines)

        for line in new_lines:
            m = _SSH_FAIL_RE.search(line)
            if m:
                username, src_ip = m.group(1), m.group(2)
                self._detector.feed_auth(AuthEvent(
                    src_ip=src_ip,
                    dst_ip=self._local_ip,
                    service="ssh",
                    username=username,
                    success=False,
                ))
                continue

            m = _SSH_OK_RE.search(line)
            if m:
                username, src_ip = m.group(1), m.group(2)
                self._detector.feed_auth(AuthEvent(
                    src_ip=src_ip,
                    dst_ip=self._local_ip,
                    service="ssh",
                    username=username,
                    success=True,
                ))


# ── Scapy sniffer (optional, requires root + scapy) ───────────────────────────

class ScapySniffer:
    """
    Async wrapper around scapy's AsyncSniffer.
    Requires: pip install scapy && root privileges.
    Falls back gracefully if scapy is unavailable.
    """

    def __init__(self, detector: DetectorEngine, interface: str = "any"):
        self._detector = detector
        self._interface = interface
        self._sniffer: Any = None
        self._available = False

    async def start(self) -> bool:
        try:
            from scapy.all import AsyncSniffer, IP, TCP, UDP, ARP, Ether
            self._scapy_modules = (IP, TCP, UDP, ARP, Ether)

            def _pkt_callback(pkt):
                try:
                    self._process_packet(pkt)
                except Exception:
                    pass

            self._sniffer = AsyncSniffer(
                iface=self._interface,
                prn=_pkt_callback,
                store=False,
            )
            self._sniffer.start()
            self._available = True
            logger.info("ScapySniffer started on interface: %s", self._interface)
            return True

        except ImportError:
            logger.warning(
                "scapy not installed — local packet sniffing disabled. "
                "Install with: pip install scapy"
            )
            return False
        except Exception as exc:
            logger.warning("ScapySniffer failed to start: %s", exc)
            return False

    def stop(self) -> None:
        if self._sniffer and self._available:
            try:
                self._sniffer.stop()
            except Exception:
                pass
        self._available = False

    def _process_packet(self, pkt: Any) -> None:
        from scapy.all import IP, TCP, UDP, ARP

        if ARP in pkt:
            event = PacketEvent(
                src_ip=pkt[ARP].psrc,
                dst_ip=pkt[ARP].pdst,
                is_arp=True,
                arp_mac=pkt[ARP].hwsrc,
                timestamp=time.time(),
            )
            self._detector.feed_packet(event)
            return

        if IP not in pkt:
            return

        src = pkt[IP].src
        dst = pkt[IP].dst
        size = len(pkt)

        if TCP in pkt:
            event = PacketEvent(
                src_ip=src, dst_ip=dst,
                src_port=pkt[TCP].sport, dst_port=pkt[TCP].dport,
                protocol="tcp", size_bytes=size,
            )
        elif UDP in pkt:
            event = PacketEvent(
                src_ip=src, dst_ip=dst,
                src_port=pkt[UDP].sport, dst_port=pkt[UDP].dport,
                protocol="udp", size_bytes=size,
            )
        else:
            event = PacketEvent(src_ip=src, dst_ip=dst, size_bytes=size)

        self._detector.feed_packet(event)


# ── Remote SSH Poller ─────────────────────────────────────────────────────────

class RemoteHostPoller:
    """
    Polls remote hosts via SSH to collect:
    - Active connections (netstat/ss)
    - Recent auth.log entries
    - Generates PacketEvents and AuthEvents from remote data
    """

    def __init__(
        self,
        detector: DetectorEngine,
        host: str,
        user: str = "root",
        ssh_key: str = "",
        ssh_port: int = 22,
    ):
        self._detector = detector
        self._host = host
        self._user = user
        self._ssh_key = ssh_key
        self._ssh_port = ssh_port
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_auth_line = 0

    async def start(self, poll_interval: float = 30.0) -> None:
        self._running = True
        self._task = asyncio.create_task(self._poll_loop(poll_interval))
        logger.info("RemoteHostPoller started for %s", self._host)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _poll_loop(self, interval: float) -> None:
        while self._running:
            try:
                await self._poll_host()
            except Exception as exc:
                logger.debug("RemotePoller error for %s: %s", self._host, exc)
            await asyncio.sleep(interval)

    async def _run_ssh(self, cmd: str, timeout: float = 30) -> str | None:
        ssh_cmd = [
            "ssh", "-o", "StrictHostKeyChecking=no",
            "-o", f"ConnectTimeout={int(timeout)}",
            "-o", "BatchMode=yes",
            "-p", str(self._ssh_port),
        ]
        if self._ssh_key:
            ssh_cmd += ["-i", self._ssh_key]
        ssh_cmd += [f"{self._user}@{self._host}", cmd]

        proc = await asyncio.create_subprocess_exec(
            *ssh_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return stdout.decode(errors="replace")
        except asyncio.TimeoutError:
            proc.kill()
            return None

    async def _poll_host(self) -> None:
        # Poll netstat for active connections
        netstat_out = await self._run_ssh(
            "ss -tnp 2>/dev/null | grep ESTAB || netstat -tnp 2>/dev/null | grep ESTABLISHED"
        )
        if netstat_out:
            self._parse_netstat(netstat_out)

        # Poll auth.log for new failures
        auth_out = await self._run_ssh(
            f"tail -n 200 /var/log/auth.log 2>/dev/null || tail -n 200 /var/log/secure 2>/dev/null"
        )
        if auth_out:
            self._parse_remote_auth(auth_out)

    def _parse_netstat(self, output: str) -> None:
        # Very rough ss/netstat parse — extract src:port → dst:port pairs
        for line in output.splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                local = parts[3] if "ss" in line or len(parts) >= 6 else parts[3]
                remote = parts[4] if len(parts) >= 5 else ""
                if ":" not in remote:
                    continue
                remote_ip, remote_port = remote.rsplit(":", 1)
                local_ip, local_port = local.rsplit(":", 1)
                event = PacketEvent(
                    src_ip=remote_ip,
                    dst_ip=local_ip,
                    src_port=int(remote_port) if remote_port.isdigit() else 0,
                    dst_port=int(local_port) if local_port.isdigit() else 0,
                    protocol="tcp",
                )
                self._detector.feed_packet(event)
            except Exception:
                pass

    def _parse_remote_auth(self, output: str) -> None:
        lines = output.splitlines()
        for line in lines:
            m = _SSH_FAIL_RE.search(line)
            if m:
                self._detector.feed_auth(AuthEvent(
                    src_ip=m.group(2),
                    dst_ip=self._host,
                    service="ssh",
                    username=m.group(1),
                    success=False,
                ))


# ── NetworkMonitor (orchestrates all monitors) ────────────────────────────────

class NetworkMonitor:
    """
    Main network-wide monitoring orchestrator.

    Starts:
    - ScapySniffer (local packet capture)
    - AuthLogPoller (local auth.log tail)
    - RemoteHostPoller per remote host

    All events flow through DetectorEngine → alert_callback.
    """

    def __init__(
        self,
        alert_callback: AlertCallback,
        network: str,
        config: dict | None = None,
    ):
        self._network = network
        self._config = config or {}
        self._running = False

        self.detector = DetectorEngine(
            alert_callback=alert_callback,
            protected_network=network,
            config=self._config,
        )

        self._sniffer = ScapySniffer(
            self.detector,
            interface=self._config.get("interface", "any"),
        )
        self._auth_poller = AuthLogPoller(
            self.detector,
            local_ip=self._config.get("local_ip", "127.0.0.1"),
        )
        self._remote_pollers: list[RemoteHostPoller] = []

    async def start(self, remote_hosts: list[dict] | None = None) -> None:
        """
        Start all monitors.

        remote_hosts: list of dicts with keys:
            host, user (default 'root'), ssh_key (optional), port (default 22)
        """
        self._running = True

        # Try scapy sniffer (may fail if not root)
        await self._sniffer.start()

        # Auth log poller
        await self._auth_poller.start(
            poll_interval=self._config.get("auth_poll_interval", 5.0)
        )

        # Remote host pollers
        for host_cfg in (remote_hosts or []):
            poller = RemoteHostPoller(
                self.detector,
                host=host_cfg["host"],
                user=host_cfg.get("user", "root"),
                ssh_key=host_cfg.get("ssh_key", ""),
                ssh_port=int(host_cfg.get("port", 22)),
            )
            await poller.start(
                poll_interval=self._config.get("remote_poll_interval", 30.0)
            )
            self._remote_pollers.append(poller)

        logger.info(
            "NetworkMonitor started: network=%s remote_hosts=%d",
            self._network, len(self._remote_pollers),
        )

    async def stop(self) -> None:
        self._running = False
        self._sniffer.stop()
        await self._auth_poller.stop()
        for poller in self._remote_pollers:
            await poller.stop()
        self._remote_pollers.clear()
        logger.info("NetworkMonitor stopped")

    def inject_packet_event(self, event: PacketEvent) -> None:
        """Directly inject a packet event (used by battle mode from pentest events)."""
        self.detector.feed_packet(event)

    def inject_auth_event(self, event: AuthEvent) -> None:
        """Directly inject an auth event (used by battle mode)."""
        self.detector.feed_auth(event)
