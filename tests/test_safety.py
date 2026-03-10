"""
Phase 6 — SafetyGuard tests

Pass/fail scenarios for each rule + edge cases.
"""

import time
import pytest
from config import SafetyConfig
from core.safety import SafetyGuard, AgentAction


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def make_guard(**kwargs) -> SafetyGuard:
    """Create a guard with a custom SafetyConfig."""
    config = SafetyConfig(**kwargs)
    return SafetyGuard(config)


def action(**kwargs) -> AgentAction:
    return AgentAction(**kwargs)


# ------------------------------------------------------------------
# Rule 1: Target CIDR scope
# ------------------------------------------------------------------

class TestRule1TargetScope:
    def test_ip_inside_cidr_allowed(self):
        guard = make_guard(allowed_cidr="10.0.0.0/8")
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", target_ip="10.1.2.3"))
        assert ok is True

    def test_ip_outside_cidr_blocked(self):
        guard = make_guard(allowed_cidr="10.0.0.0/8")
        ok, reason = guard.validate_action(action(tool_name="nmap_scan", target_ip="192.168.1.1"))
        assert ok is False
        assert "192.168.1.1" in reason

    def test_no_target_ip_skips_rule(self):
        guard = make_guard(allowed_cidr="10.0.0.0/8")
        ok, _ = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is True

    def test_invalid_ip_blocked(self):
        guard = make_guard(allowed_cidr="10.0.0.0/8")
        ok, reason = guard.validate_action(action(tool_name="nmap_scan", target_ip="999.x.y.z"))
        assert ok is False

    def test_cidr_edge_network_address(self):
        guard = make_guard(allowed_cidr="192.168.1.0/24")
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", target_ip="192.168.1.0"))
        assert ok is True

    def test_slash_zero_allows_all(self):
        """0.0.0.0/0 — allow every IP."""
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", target_ip="8.8.8.8"))
        assert ok is True


# ------------------------------------------------------------------
# Rule 2: Port scope
# ------------------------------------------------------------------

class TestRule2PortScope:
    def test_port_in_range_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", allowed_port_min=1, allowed_port_max=1024)
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", target_ip="10.0.0.1", target_port=80))
        assert ok is True

    def test_port_out_of_range_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", allowed_port_min=1, allowed_port_max=1024)
        ok, reason = guard.validate_action(action(tool_name="nmap_scan", target_ip="10.0.0.1", target_port=8080))
        assert ok is False
        assert "8080" in reason

    def test_port_zero_skips_rule(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", allowed_port_min=1, allowed_port_max=1024)
        ok, _ = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is True


# ------------------------------------------------------------------
# Rule 3: Excluded IPs
# ------------------------------------------------------------------

class TestRule3ExcludedIPs:
    def test_excluded_ip_blocked(self):
        guard = make_guard(allowed_cidr="10.0.0.0/8", excluded_ips=["10.0.0.1"])
        ok, reason = guard.validate_action(action(tool_name="nmap_scan", target_ip="10.0.0.1"))
        assert ok is False
        assert "10.0.0.1" in reason

    def test_non_excluded_ip_allowed(self):
        guard = make_guard(allowed_cidr="10.0.0.0/8", excluded_ips=["10.0.0.1"])
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", target_ip="10.0.0.2"))
        assert ok is True


# ------------------------------------------------------------------
# Rule 4: Excluded ports
# ------------------------------------------------------------------

class TestRule4ExcludedPorts:
    def test_excluded_port_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", excluded_ports=[22, 3389])
        ok, reason = guard.validate_action(action(tool_name="nmap_scan", target_port=22))
        assert ok is False
        assert "22" in reason

    def test_non_excluded_port_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", excluded_ports=[22])
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", target_port=80))
        assert ok is True


# ------------------------------------------------------------------
# Rule 5: Exploit allowed (scan-only mode)
# ------------------------------------------------------------------

class TestRule5ExploitAllowed:
    def test_exploit_blocked_in_scan_only(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", allow_exploit=False)
        ok, reason = guard.validate_action(action(tool_name="metasploit_run"))
        assert ok is False
        assert "scan-only" in reason.lower()

    def test_exploit_allowed_when_enabled(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", allow_exploit=True)
        ok, _ = guard.validate_action(action(tool_name="metasploit_run"))
        assert ok is True

    def test_nmap_allowed_in_scan_only(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", allow_exploit=False)
        ok, _ = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is True


# ------------------------------------------------------------------
# Rule 6: No DoS
# ------------------------------------------------------------------

class TestRule6NoDos:
    def test_dos_category_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, reason = guard.validate_action(action(tool_name="metasploit_run", exploit_category="dos"))
        assert ok is False
        assert "dos" in reason.lower()

    def test_dos_in_module_name_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, reason = guard.validate_action(
            action(tool_name="metasploit_run", exploit_module="exploit/dos/http/apache_dos")
        )
        assert ok is False

    def test_flood_keyword_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, _ = guard.validate_action(
            action(tool_name="metasploit_run", exploit_module="auxiliary/flood/synflood")
        )
        assert ok is False

    def test_remote_exploit_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, _ = guard.validate_action(
            action(tool_name="metasploit_run", exploit_category="remote",
                   exploit_module="exploit/unix/ftp/vsftpd_234_backdoor")
        )
        assert ok is True


# ------------------------------------------------------------------
# Rule 7: No destructive
# ------------------------------------------------------------------

class TestRule7NoDestructive:
    def test_destructive_module_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, reason = guard.validate_action(
            action(tool_name="metasploit_run", exploit_module="exploit/windows/wipe_disk")
        )
        assert ok is False
        assert "destructive" in reason.lower()

    def test_ransomware_module_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, _ = guard.validate_action(
            action(tool_name="metasploit_run", exploit_module="exploit/windows/ransomware_deploy")
        )
        assert ok is False

    def test_normal_module_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        ok, _ = guard.validate_action(
            action(tool_name="metasploit_run", exploit_module="exploit/unix/ftp/vsftpd_234_backdoor")
        )
        assert ok is True


# ------------------------------------------------------------------
# Rule 8: CVSS score cap
# ------------------------------------------------------------------

class TestRule8MaxSeverity:
    def test_cvss_above_cap_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", max_cvss_score=7.0)
        ok, reason = guard.validate_action(action(tool_name="metasploit_run", cvss_score=9.8))
        assert ok is False
        assert "9.8" in reason

    def test_cvss_at_cap_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", max_cvss_score=9.8)
        ok, _ = guard.validate_action(action(tool_name="metasploit_run", cvss_score=9.8))
        assert ok is True

    def test_zero_cvss_always_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", max_cvss_score=5.0)
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", cvss_score=0.0))
        assert ok is True

    def test_negative_cvss_allowed(self):
        """Negative CVSS edge case — should pass since max_cvss_score is greater than zero."""
        guard = make_guard(allowed_cidr="0.0.0.0/0", max_cvss_score=10.0)
        ok, _ = guard.validate_action(action(tool_name="nmap_scan", cvss_score=-1.0))
        assert ok is True


# ------------------------------------------------------------------
# Rule 9: Session time limit
# ------------------------------------------------------------------

class TestRule9TimeLimit:
    def test_action_within_time_limit_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", session_max_seconds=3600)
        ok, _ = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is True

    def test_action_after_time_limit_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", session_max_seconds=1)
        guard._session_start = time.time() - 5  # simulate 5 seconds in the past
        ok, reason = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is False
        assert "exceeded" in reason.lower() or "limit" in reason.lower()


# ------------------------------------------------------------------
# Rule 10: Rate limit
# ------------------------------------------------------------------

class TestRule10RateLimit:
    def test_below_rate_limit_allowed(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", max_requests_per_second=10)
        for _ in range(5):
            ok, _ = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is True

    def test_exceeding_rate_limit_blocked(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0", max_requests_per_second=3)
        results = []
        for _ in range(5):
            ok, reason = guard.validate_action(action(tool_name="nmap_scan"))
            results.append(ok)
        assert False in results  # at least one should be blocked


# ------------------------------------------------------------------
# Kill switch
# ------------------------------------------------------------------

class TestKillSwitch:
    def test_emergency_stop_blocks_all(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        guard.emergency_stop()

        ok, reason = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is False
        assert "kill switch" in reason.lower()

    def test_kill_switch_flag(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        assert guard.kill_switch_triggered is False
        guard.emergency_stop()
        assert guard.kill_switch_triggered is True

    def test_reset_kill_switch(self):
        guard = make_guard(allowed_cidr="0.0.0.0/0")
        guard.emergency_stop()
        guard.reset_kill_switch()
        ok, _ = guard.validate_action(action(tool_name="nmap_scan"))
        assert ok is True


# ------------------------------------------------------------------
# validate_action pipeline
# ------------------------------------------------------------------

class TestValidatePipeline:
    def test_all_rules_pass(self):
        guard = make_guard(allowed_cidr="10.0.0.0/8", allow_exploit=True)
        ok, reason = guard.validate_action(
            action(tool_name="metasploit_run", target_ip="10.0.0.5",
                   target_port=21, cvss_score=9.0)
        )
        assert ok is True
        assert reason == ""

    def test_first_failing_rule_stops_pipeline(self):
        """If IP is invalid, subsequent rules should not run."""
        guard = make_guard(allowed_cidr="10.0.0.0/8", excluded_ips=["10.0.0.5"])
        # IP out of range → Rule 1 should stop immediately
        ok, reason = guard.validate_action(
            action(tool_name="nmap_scan", target_ip="192.168.1.1")
        )
        assert ok is False
        assert "192.168.1.1" in reason
