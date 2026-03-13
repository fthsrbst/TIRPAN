"""
Phase 6 — Safety System

A 10-rule security pipeline. Runs before every agent action.
If any rule is violated, returns (False, "reason").
"""

import ipaddress
import logging
import time
from dataclasses import dataclass, field

from config import SafetyConfig, settings

logger = logging.getLogger(__name__)

# DoS / destructive keywords
_DOS_KEYWORDS = frozenset({"dos", "ddos", "flood", "denial", "amplification"})
_DESTRUCTIVE_KEYWORDS = frozenset({"format", "wipe", "destroy", "ransomware", "encrypt_disk"})


@dataclass
class AgentAction:
    """Describes an agent action — SafetyGuard evaluates this."""
    tool_name: str                          # "nmap_scan" | "metasploit_run" | ...
    target_ip: str = ""
    target_port: int = 0
    exploit_module: str = ""               # metasploit module path
    exploit_category: str = ""             # "dos" | "remote" | "local" | ...
    cvss_score: float = 0.0
    timestamp: float = field(default_factory=time.time)
    extra: dict = field(default_factory=dict)


class SafetyGuard:
    """
    10-rule security pipeline.

    Usage:
        guard = SafetyGuard(config)
        ok, reason = guard.validate_action(action)
    """

    def __init__(self, config: SafetyConfig | None = None):
        self.config = config or settings.safety
        self._kill_switch = False
        self._session_start: float = time.time()
        self._request_timestamps: list[float] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def validate_action(self, action: AgentAction) -> tuple[bool, str]:
        """Run all rules in order. Returns the first failing rule."""
        if self._kill_switch:
            return False, "Kill switch active — all actions are blocked"

        rules = [
            self._rule1_target_scope,
            self._rule2_port_scope,
            self._rule3_excluded_ips,
            self._rule4_excluded_ports,
            self._rule5_exploit_allowed,
            self._rule6_no_dos,
            self._rule7_no_destructive,
            self._rule8_max_severity,
            self._rule9_time_limit,
            self._rule10_rate_limit,
        ]

        for rule in rules:
            ok, reason = rule(action)
            if not ok:
                logger.warning("Security rule violation [%s]: %s", rule.__name__, reason)
                return False, reason

        self._record_request()
        return True, ""

    def emergency_stop(self) -> None:
        """Activate kill switch — block all future actions."""
        self._kill_switch = True
        logger.critical("AEGIS EMERGENCY STOP — kill switch activated")

    def reset_kill_switch(self) -> None:
        """Reset kill switch (for testing/administration purposes)."""
        self._kill_switch = False

    @property
    def kill_switch_triggered(self) -> bool:
        return self._kill_switch

    # ------------------------------------------------------------------
    # Rule 1: Target CIDR scope
    # ------------------------------------------------------------------

    def _rule1_target_scope(self, action: AgentAction) -> tuple[bool, str]:
        if not action.target_ip:
            return True, ""  # No IP → this rule does not apply
        try:
            target = ipaddress.ip_address(action.target_ip)
        except ValueError:
            # Not a valid IP address — treat as hostname/domain.
            # CIDR range checks don't apply to hostnames; the operator
            # already authorized this target by setting it as the session target.
            return True, ""
        try:
            allowed = ipaddress.ip_network(self.config.allowed_cidr, strict=False)
        except ValueError:
            # allowed_cidr is not a valid network (e.g. it's a hostname) — skip range check.
            return True, ""
        if target not in allowed:
            return False, (
                f"Target IP {action.target_ip} is outside the allowed range "
                f"({self.config.allowed_cidr})"
            )
        return True, ""

    # ------------------------------------------------------------------
    # Rule 2: Port scope
    # ------------------------------------------------------------------

    def _rule2_port_scope(self, action: AgentAction) -> tuple[bool, str]:
        if action.target_port == 0:
            return True, ""
        lo, hi = self.config.allowed_port_min, self.config.allowed_port_max
        if not (lo <= action.target_port <= hi):
            return False, f"Port {action.target_port} is outside the allowed range ({lo}-{hi})"
        return True, ""

    # ------------------------------------------------------------------
    # Rule 3: Excluded IPs
    # ------------------------------------------------------------------

    def _rule3_excluded_ips(self, action: AgentAction) -> tuple[bool, str]:
        if not action.target_ip:
            return True, ""
        if action.target_ip in self.config.excluded_ips:
            return False, f"Target IP {action.target_ip} is in the excluded list"
        return True, ""

    # ------------------------------------------------------------------
    # Rule 4: Excluded ports
    # ------------------------------------------------------------------

    def _rule4_excluded_ports(self, action: AgentAction) -> tuple[bool, str]:
        if action.target_port in self.config.excluded_ports:
            return False, f"Port {action.target_port} is in the excluded list"
        return True, ""

    # ------------------------------------------------------------------
    # Rule 5: Exploit allowed (scan-only mode)
    # ------------------------------------------------------------------

    def _rule5_exploit_allowed(self, action: AgentAction) -> tuple[bool, str]:
        exploit_tools = {"metasploit_run"}
        if action.tool_name in exploit_tools and not self.config.allow_exploit:
            return False, "Exploit blocked — scan-only mode is active"
        return True, ""

    # ------------------------------------------------------------------
    # Rule 6: No DoS exploits
    # ------------------------------------------------------------------

    def _rule6_no_dos(self, action: AgentAction) -> tuple[bool, str]:
        if not self.config.block_dos_exploits:
            return True, ""
        category = action.exploit_category.lower()
        module = action.exploit_module.lower()
        if any(kw in category for kw in _DOS_KEYWORDS):
            return False, f"DoS exploit blocked: category='{action.exploit_category}'"
        if any(kw in module for kw in _DOS_KEYWORDS):
            return False, f"DoS exploit blocked: module='{action.exploit_module}'"
        return True, ""

    # ------------------------------------------------------------------
    # Rule 7: No destructive actions
    # ------------------------------------------------------------------

    def _rule7_no_destructive(self, action: AgentAction) -> tuple[bool, str]:
        if not self.config.block_destructive:
            return True, ""
        module = action.exploit_module.lower()
        if any(kw in module for kw in _DESTRUCTIVE_KEYWORDS):
            return False, f"Destructive module blocked: '{action.exploit_module}'"
        return True, ""

    # ------------------------------------------------------------------
    # Rule 8: CVSS score cap
    # ------------------------------------------------------------------

    def _rule8_max_severity(self, action: AgentAction) -> tuple[bool, str]:
        if action.cvss_score > self.config.max_cvss_score:
            return False, (
                f"CVSS score too high: {action.cvss_score} > {self.config.max_cvss_score}"
            )
        return True, ""

    # ------------------------------------------------------------------
    # Rule 9: Session time limit
    # ------------------------------------------------------------------

    def _rule9_time_limit(self, action: AgentAction) -> tuple[bool, str]:
        elapsed = time.time() - self._session_start
        if elapsed > self.config.session_max_seconds:
            return False, (
                f"Session time limit exceeded: {elapsed:.0f}s > {self.config.session_max_seconds}s"
            )
        return True, ""

    # ------------------------------------------------------------------
    # Rule 10: Rate limit
    # ------------------------------------------------------------------

    def _rule10_rate_limit(self, action: AgentAction) -> tuple[bool, str]:
        now = time.time()
        # Count requests in the last 1 second
        self._request_timestamps = [t for t in self._request_timestamps if now - t < 1.0]
        if len(self._request_timestamps) >= self.config.max_requests_per_second:
            return False, (
                f"Rate limit exceeded: {len(self._request_timestamps)} requests/s "
                f"(max {self.config.max_requests_per_second})"
            )
        return True, ""

    def _record_request(self) -> None:
        self._request_timestamps.append(time.time())
