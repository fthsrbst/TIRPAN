"""
Phase 1 — Model validation tests.
Run: python -m pytest tests/test_models.py -v
"""
import pytest
from pydantic import ValidationError

from models.target import Target
from models.scan_result import Port, Host, ScanResult
from models.vulnerability import Vulnerability
from models.exploit_result import ExploitResult
from models.session import Session


# ── Target ────────────────────────────────────────────────────────────────────

class TestTarget:
    def test_valid_ip(self):
        t = Target(ip="192.168.1.1")
        assert t.ip == "192.168.1.1"
        assert t.is_cidr is False

    def test_valid_cidr(self):
        t = Target(ip="10.0.0.0/24")
        assert t.is_cidr is True
        assert t.network is not None

    def test_invalid_ip(self):
        with pytest.raises(ValidationError):
            Target(ip="999.999.999.999")

    def test_invalid_cidr(self):
        with pytest.raises(ValidationError):
            Target(ip="not-an-ip")

    def test_valid_port_range(self):
        t = Target(ip="192.168.1.1", port_range="80-443")
        assert t.port_range == "80-443"

    def test_invalid_port_range(self):
        with pytest.raises(ValidationError):
            Target(ip="192.168.1.1", port_range="0-99999")

    def test_defaults(self):
        t = Target(ip="10.0.0.1")
        assert t.scan_only is False
        assert t.excluded_ports == []
        assert t.excluded_ips == []


# ── Port & Host & ScanResult ───────────────────────────────────────────────────

class TestScanResult:
    def test_port_defaults(self):
        p = Port(number=80)
        assert p.protocol == "tcp"
        assert p.state == "open"

    def test_host_open_ports(self):
        h = Host(
            ip="10.0.0.1",
            ports=[
                Port(number=80, state="open"),
                Port(number=22, state="closed"),
                Port(number=443, state="open"),
            ],
        )
        assert len(h.open_ports) == 2

    def test_scan_result_live_hosts(self):
        result = ScanResult(
            target="10.0.0.0/24",
            scan_type="ping",
            hosts=[
                Host(ip="10.0.0.1", state="up"),
                Host(ip="10.0.0.2", state="down"),
            ],
        )
        assert len(result.live_hosts) == 1
        assert result.live_hosts[0].ip == "10.0.0.1"

    def test_empty_scan(self):
        result = ScanResult(target="10.0.0.1", scan_type="service")
        assert result.hosts == []
        assert result.live_hosts == []


# ── Vulnerability ─────────────────────────────────────────────────────────────

class TestVulnerability:
    def test_severity_critical(self):
        v = Vulnerability(title="EternalBlue", cvss_score=9.8)
        assert v.severity == "CRITICAL"

    def test_severity_high(self):
        v = Vulnerability(title="Test", cvss_score=7.5)
        assert v.severity == "HIGH"

    def test_severity_medium(self):
        v = Vulnerability(title="Test", cvss_score=5.0)
        assert v.severity == "MEDIUM"

    def test_severity_low(self):
        v = Vulnerability(title="Test", cvss_score=2.0)
        assert v.severity == "LOW"

    def test_severity_none(self):
        v = Vulnerability(title="Test", cvss_score=0.0)
        assert v.severity == "NONE"

    def test_invalid_cvss_above(self):
        with pytest.raises(ValidationError):
            Vulnerability(title="Test", cvss_score=10.1)

    def test_invalid_cvss_below(self):
        with pytest.raises(ValidationError):
            Vulnerability(title="Test", cvss_score=-1.0)

    def test_cve_optional(self):
        v = Vulnerability(title="Test", cve_id="CVE-2017-0144")
        assert v.cve_id == "CVE-2017-0144"


# ── ExploitResult ─────────────────────────────────────────────────────────────

class TestExploitResult:
    def test_success(self):
        r = ExploitResult(success=True, module="exploit/multi/handler", session_id=1)
        assert r.success is True
        assert r.session_id == 1

    def test_failure(self):
        r = ExploitResult(success=False, error="Connection refused")
        assert r.success is False
        assert r.error == "Connection refused"
        assert r.session_id is None


# ── Session ───────────────────────────────────────────────────────────────────

class TestSession:
    def test_valid_session(self):
        s = Session(id="abc-123", target="10.0.0.1")
        assert s.status == "idle"
        assert s.mode == "scan_only"
        assert s.created_at > 0

    def test_invalid_mode(self):
        with pytest.raises(ValidationError):
            Session(id="abc-123", target="10.0.0.1", mode="hack_everything")

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            Session(id="abc-123", target="10.0.0.1", status="unknown")

    def test_counters_default_zero(self):
        s = Session(id="abc-123", target="10.0.0.1")
        assert s.hosts_found == 0
        assert s.ports_found == 0
        assert s.vulns_found == 0
        assert s.exploits_run == 0
