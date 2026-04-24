"""
TIRPAN Defense — Detector Engine

Rule-based, fast-path detection (no LLM).
Fires defense_alert events when thresholds are crossed.
The LLM agent subscribes to these events for deeper analysis and response.

Detectors:
  - PortScanDetector:          > threshold unique ports/min from same src_ip
  - BruteForceDetector:        > threshold failed auth attempts/window from same src_ip
  - ARPSpoofDetector:          same IP announced by multiple MACs
  - DoSDetector:               packet rate spike to single dst_ip
  - LateralMovementDetector:   internal-to-internal connections on exploit ports
  - DataExfilDetector:         unusual outbound volume to external IP
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

logger = logging.getLogger(__name__)

# ── Alert callback type ────────────────────────────────────────────────────────
AlertCallback = Callable[[dict], None]


# ── Packet event structure (from monitor.py) ───────────────────────────────────

@dataclass
class PacketEvent:
    """Normalized network event fed into detectors."""
    src_ip: str
    dst_ip: str
    src_port: int = 0
    dst_port: int = 0
    protocol: str = "tcp"
    size_bytes: int = 0
    is_arp: bool = False
    arp_mac: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class AuthEvent:
    """Authentication log event (parsed from syslog/auth.log)."""
    src_ip: str
    dst_ip: str
    service: str
    username: str
    success: bool
    timestamp: float = field(default_factory=time.time)


# ── Base Detector ─────────────────────────────────────────────────────────────

class BaseDetector:
    def __init__(self, alert_callback: AlertCallback, enabled: bool = True):
        self._cb = alert_callback
        self.enabled = enabled

    def _fire(self, alert: dict) -> None:
        if self.enabled:
            logger.info(
                "[DETECTOR:%s] %s severity=%s src=%s",
                self.__class__.__name__,
                alert.get("alert_type"),
                alert.get("severity"),
                alert.get("src_ip"),
            )
            self._cb(alert)


# ── Port Scan Detector ────────────────────────────────────────────────────────

class PortScanDetector(BaseDetector):
    """
    Fires PORT_SCAN alert when a single source IP accesses more than
    `threshold` unique destination ports within `window_seconds`.
    """

    def __init__(
        self,
        alert_callback: AlertCallback,
        threshold: int = 15,
        window_seconds: float = 60.0,
        enabled: bool = True,
    ):
        super().__init__(alert_callback, enabled)
        self.threshold = threshold
        self.window = window_seconds
        # src_ip → {dst_port: first_seen_ts}
        self._port_hits: dict[str, dict[int, float]] = defaultdict(dict)
        self._alerted: dict[str, float] = {}  # src_ip → last alert ts

    def feed(self, event: PacketEvent) -> None:
        if not self.enabled or event.is_arp:
            return

        src = event.src_ip
        port = event.dst_port
        now = event.timestamp

        # Prune old entries
        self._port_hits[src] = {
            p: ts for p, ts in self._port_hits[src].items()
            if now - ts <= self.window
        }

        if port > 0:
            self._port_hits[src][port] = now

        unique_ports = len(self._port_hits[src])
        if unique_ports >= self.threshold:
            last_alert = self._alerted.get(src, 0)
            if now - last_alert > 30:  # cooldown: don't spam
                self._alerted[src] = now
                self._fire({
                    "alert_type": "PORT_SCAN",
                    "severity": "HIGH" if unique_ports > 50 else "MEDIUM",
                    "src_ip": src,
                    "dst_ip": event.dst_ip,
                    "details": {
                        "unique_ports_seen": unique_ports,
                        "window_seconds": self.window,
                        "sample_ports": sorted(self._port_hits[src].keys())[:20],
                    },
                    "mitre_tactic": "TA0043",
                    "mitre_technique": "T1046",
                    "timestamp": now,
                })


# ── Brute Force Detector ──────────────────────────────────────────────────────

class BruteForceDetector(BaseDetector):
    """
    Fires BRUTE_FORCE when > threshold failed auth events from same src_ip
    within window_seconds.
    """

    def __init__(
        self,
        alert_callback: AlertCallback,
        threshold: int = 5,
        window_seconds: float = 30.0,
        enabled: bool = True,
    ):
        super().__init__(alert_callback, enabled)
        self.threshold = threshold
        self.window = window_seconds
        # src_ip → list[timestamp]
        self._failures: dict[str, list[float]] = defaultdict(list)
        self._alerted: dict[str, float] = {}

    def feed(self, event: AuthEvent) -> None:
        if not self.enabled or event.success:
            return

        src = event.src_ip
        now = event.timestamp

        self._failures[src] = [
            ts for ts in self._failures[src] if now - ts <= self.window
        ]
        self._failures[src].append(now)

        count = len(self._failures[src])
        if count >= self.threshold:
            last_alert = self._alerted.get(src, 0)
            if now - last_alert > 60:
                self._alerted[src] = now
                self._fire({
                    "alert_type": "BRUTE_FORCE",
                    "severity": "HIGH" if count > 20 else "MEDIUM",
                    "src_ip": src,
                    "dst_ip": event.dst_ip,
                    "dst_port": self._service_port(event.service),
                    "protocol": "tcp",
                    "details": {
                        "attempts": count,
                        "window_seconds": self.window,
                        "service": event.service,
                        "last_username_tried": event.username,
                    },
                    "mitre_tactic": "TA0006",
                    "mitre_technique": "T1110",
                    "timestamp": now,
                })

    @staticmethod
    def _service_port(service: str) -> int:
        return {"ssh": 22, "ftp": 21, "http": 80, "rdp": 3389, "smtp": 25}.get(
            service.lower(), 0
        )


# ── ARP Spoof Detector ────────────────────────────────────────────────────────

class ARPSpoofDetector(BaseDetector):
    """
    Fires ARP_SPOOF when the same IP is announced by more than one MAC address.
    Classic indicator of ARP cache poisoning / MITM attack.
    """

    def __init__(self, alert_callback: AlertCallback, enabled: bool = True):
        super().__init__(alert_callback, enabled)
        # ip → set of MACs
        self._ip_to_macs: dict[str, set[str]] = defaultdict(set)
        self._alerted: set[str] = set()

    def feed(self, event: PacketEvent) -> None:
        if not self.enabled or not event.is_arp:
            return
        if not event.arp_mac:
            return

        ip = event.src_ip
        mac = event.arp_mac
        self._ip_to_macs[ip].add(mac)

        if len(self._ip_to_macs[ip]) > 1 and ip not in self._alerted:
            self._alerted.add(ip)
            self._fire({
                "alert_type": "ARP_SPOOF",
                "severity": "CRITICAL",
                "src_ip": event.src_ip,
                "dst_ip": "",
                "details": {
                    "ip": ip,
                    "macs_seen": list(self._ip_to_macs[ip]),
                    "note": "Same IP announced by multiple MACs — ARP poisoning suspected",
                },
                "mitre_tactic": "TA0006",
                "mitre_technique": "T1557.002",
                "timestamp": event.timestamp,
            })


# ── DoS Detector ──────────────────────────────────────────────────────────────

class DoSDetector(BaseDetector):
    """
    Fires DOS alert when packet rate to a single destination exceeds threshold.
    """

    def __init__(
        self,
        alert_callback: AlertCallback,
        threshold_pps: int = 1000,
        window_seconds: float = 5.0,
        enabled: bool = True,
    ):
        super().__init__(alert_callback, enabled)
        self.threshold = threshold_pps
        self.window = window_seconds
        # dst_ip → list[timestamp]
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._alerted: dict[str, float] = {}

    def feed(self, event: PacketEvent) -> None:
        if not self.enabled or event.is_arp:
            return

        dst = event.dst_ip
        now = event.timestamp

        self._hits[dst] = [ts for ts in self._hits[dst] if now - ts <= self.window]
        self._hits[dst].append(now)

        pps = len(self._hits[dst]) / self.window
        if pps >= self.threshold:
            last_alert = self._alerted.get(dst, 0)
            if now - last_alert > 10:
                self._alerted[dst] = now
                self._fire({
                    "alert_type": "DOS",
                    "severity": "CRITICAL" if pps > 5000 else "HIGH",
                    "src_ip": event.src_ip,
                    "dst_ip": dst,
                    "details": {
                        "packets_per_second": round(pps, 1),
                        "threshold": self.threshold,
                        "window_seconds": self.window,
                    },
                    "mitre_tactic": "TA0040",
                    "mitre_technique": "T1498",
                    "timestamp": now,
                })


# ── Lateral Movement Detector ─────────────────────────────────────────────────

class LateralMovementDetector(BaseDetector):
    """
    Fires LATERAL when internal hosts connect to other internal hosts
    on suspicious ports (SMB, WinRM, common exploit ports).
    """

    EXPLOIT_PORTS = {
        445, 135, 139,    # SMB / RPC
        5985, 5986,       # WinRM
        4444, 4445,       # Metasploit reverse shells
        1099,             # Java RMI
        3389,             # RDP
        22,               # SSH (internal → internal)
        6379, 27017,      # Redis, MongoDB (internal)
        2049,             # NFS
    }

    def __init__(
        self,
        alert_callback: AlertCallback,
        protected_network: str = "",
        enabled: bool = True,
    ):
        super().__init__(alert_callback, enabled)
        self._network = protected_network
        self._alerted: set[tuple] = set()  # (src, dst, port)

    def feed(self, event: PacketEvent) -> None:
        if not self.enabled or event.is_arp:
            return
        if event.dst_port not in self.EXPLOIT_PORTS:
            return

        # Both IPs should be "internal" (same /24 prefix heuristic)
        src = event.src_ip
        dst = event.dst_ip
        port = event.dst_port

        key = (src, dst, port)
        if key not in self._alerted and self._is_internal(src) and self._is_internal(dst):
            self._alerted.add(key)
            self._fire({
                "alert_type": "LATERAL",
                "severity": "HIGH",
                "src_ip": src,
                "dst_ip": dst,
                "dst_port": port,
                "protocol": event.protocol,
                "details": {
                    "note": f"Internal-to-internal connection on port {port} (exploit port)",
                    "port": port,
                },
                "mitre_tactic": "TA0008",
                "mitre_technique": "T1021",
                "timestamp": event.timestamp,
            })

    def _is_internal(self, ip: str) -> bool:
        # Simple RFC-1918 check
        return (ip.startswith("10.") or ip.startswith("192.168.") or
                ip.startswith("172.16.") or ip.startswith("172.17.") or
                ip.startswith("172.18.") or ip.startswith("172.19.") or
                any(ip.startswith(f"172.{i}.") for i in range(20, 32)))


# ── Data Exfil Detector ───────────────────────────────────────────────────────

class DataExfilDetector(BaseDetector):
    """
    Fires EXFIL when unusual outbound traffic volume is detected:
    > threshold bytes from an internal host to an external IP in window_seconds.
    """

    def __init__(
        self,
        alert_callback: AlertCallback,
        threshold_bytes: int = 50 * 1024 * 1024,  # 50 MB
        window_seconds: float = 60.0,
        enabled: bool = True,
    ):
        super().__init__(alert_callback, enabled)
        self.threshold = threshold_bytes
        self.window = window_seconds
        # (src_ip, dst_ip) → list[(timestamp, bytes)]
        self._flows: dict[tuple, list[tuple[float, int]]] = defaultdict(list)
        self._alerted: set[tuple] = set()

    def feed(self, event: PacketEvent) -> None:
        if not self.enabled or event.is_arp or event.size_bytes == 0:
            return
        if not self._is_internal(event.src_ip):
            return
        if self._is_internal(event.dst_ip):
            return  # internal-to-internal is handled by lateral detector

        key = (event.src_ip, event.dst_ip)
        now = event.timestamp
        self._flows[key] = [
            (ts, sz) for ts, sz in self._flows[key] if now - ts <= self.window
        ]
        self._flows[key].append((now, event.size_bytes))

        total = sum(sz for _, sz in self._flows[key])
        if total >= self.threshold and key not in self._alerted:
            self._alerted.add(key)
            self._fire({
                "alert_type": "EXFIL",
                "severity": "CRITICAL",
                "src_ip": event.src_ip,
                "dst_ip": event.dst_ip,
                "details": {
                    "bytes_transferred": total,
                    "threshold_bytes": self.threshold,
                    "window_seconds": self.window,
                    "megabytes": round(total / 1024 / 1024, 2),
                },
                "mitre_tactic": "TA0010",
                "mitre_technique": "T1048",
                "timestamp": now,
            })

    def _is_internal(self, ip: str) -> bool:
        return (ip.startswith("10.") or ip.startswith("192.168.") or
                ip.startswith("172.16.") or ip.startswith("172.17."))


# ── Detector Engine (orchestrates all detectors) ──────────────────────────────

class DetectorEngine:
    """
    Orchestrates all rule-based detectors.
    Call feed_packet(event) for network events,
    feed_auth(event) for authentication events.
    """

    def __init__(
        self,
        alert_callback: AlertCallback,
        protected_network: str = "",
        config: dict | None = None,
    ):
        cfg = config or {}
        self.port_scan = PortScanDetector(
            alert_callback,
            threshold=cfg.get("port_scan_threshold", 15),
            window_seconds=cfg.get("port_scan_window", 60),
            enabled=cfg.get("port_scan_enabled", True),
        )
        self.brute_force = BruteForceDetector(
            alert_callback,
            threshold=cfg.get("brute_force_threshold", 5),
            window_seconds=cfg.get("brute_force_window", 30),
            enabled=cfg.get("brute_force_enabled", True),
        )
        self.arp_spoof = ARPSpoofDetector(
            alert_callback,
            enabled=cfg.get("arp_spoof_enabled", True),
        )
        self.dos = DoSDetector(
            alert_callback,
            threshold_pps=cfg.get("dos_threshold_pps", 1000),
            window_seconds=cfg.get("dos_window", 5),
            enabled=cfg.get("dos_enabled", True),
        )
        self.lateral = LateralMovementDetector(
            alert_callback,
            protected_network=protected_network,
            enabled=cfg.get("lateral_enabled", True),
        )
        self.exfil = DataExfilDetector(
            alert_callback,
            threshold_bytes=cfg.get("exfil_threshold_bytes", 50 * 1024 * 1024),
            window_seconds=cfg.get("exfil_window", 60),
            enabled=cfg.get("exfil_enabled", True),
        )

        self._all = [
            self.port_scan, self.brute_force, self.arp_spoof,
            self.dos, self.lateral, self.exfil,
        ]

    def feed_packet(self, event: PacketEvent) -> None:
        """Feed a network packet event to all packet-based detectors."""
        self.port_scan.feed(event)
        self.arp_spoof.feed(event)
        self.dos.feed(event)
        self.lateral.feed(event)
        self.exfil.feed(event)

    def feed_auth(self, event: AuthEvent) -> None:
        """Feed an authentication event to auth-based detectors."""
        self.brute_force.feed(event)

    def status(self) -> dict:
        """Return current detector state (for UI display)."""
        return {
            "port_scan": self.port_scan.enabled,
            "brute_force": self.brute_force.enabled,
            "arp_spoof": self.arp_spoof.enabled,
            "dos": self.dos.enabled,
            "lateral": self.lateral.enabled,
            "exfil": self.exfil.enabled,
        }

    def set_enabled(self, detector_name: str, enabled: bool) -> None:
        mapping = {
            "port_scan": self.port_scan,
            "brute_force": self.brute_force,
            "arp_spoof": self.arp_spoof,
            "dos": self.dos,
            "lateral": self.lateral,
            "exfil": self.exfil,
        }
        if detector_name in mapping:
            mapping[detector_name].enabled = enabled
