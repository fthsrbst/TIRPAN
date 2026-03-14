"""
V2 — MissionBrief

Structured pre-session configuration carried by AgentContext.
Provides scope boundaries, known intelligence, permission flags, and credentials.

When not supplied, the agent uses conservative defaults:
  no exploitation, no lateral movement, speed_profile=normal.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SSHCredential:
    """SSH credential for authenticated scanning / auditing."""
    host_pattern: str            # IP, CIDR, or "*" for all hosts
    username: str
    password: str = ""           # empty if key-based auth
    private_key: str = ""        # PEM key text; empty if password auth
    port: int = 22
    escalation: str = "none"     # none | sudo | su | pbrun | dzdo | pfexec | doas
    escalation_user: str = ""    # target user for escalation (blank = root)
    escalation_password: str = ""


@dataclass
class SMBCredential:
    """Windows / SMB credential for authenticated scanning."""
    host_pattern: str
    username: str
    password: str = ""
    domain: str = ""
    auth_type: str = "ntlmv2"    # ntlmv2 | ntlmv1 | kerberos | lm_hash | ntlm_hash
    hash_value: str = ""         # LM:NT hash string (when auth_type is *_hash)


@dataclass
class SNMPCredential:
    """SNMP credential."""
    host_pattern: str
    version: str = "v2c"         # v1 | v2c | v3
    community: str = "public"    # v1/v2c community string
    # SNMPv3 fields
    username: str = ""
    auth_protocol: str = "md5"   # md5 | sha1
    auth_password: str = ""
    priv_protocol: str = "aes"   # aes | des | none
    priv_password: str = ""


@dataclass
class DatabaseCredential:
    """Database credential for authenticated scanning."""
    host_pattern: str
    db_type: str                 # mysql | postgresql | oracle | mssql | mongodb
    username: str
    password: str = ""
    database: str = ""
    port: int = 0                # 0 = use default for db_type


@dataclass
class WebCredential:
    """Web application credential."""
    url_pattern: str             # URL prefix or "*"
    username: str
    password: str = ""
    auth_type: str = "basic"     # basic | digest | form | cookie | bearer
    login_url: str = ""          # for form-based auth
    success_indicator: str = ""  # text present on successful login


@dataclass
class MissionBrief:
    """
    Operator-supplied intelligence and permission flags for a pentest session.

    Attached to AgentContext before the first ReAct iteration.
    All fields have safe defaults — nothing dangerous runs without explicit opt-in.
    """

    # ── Target classification ───────────────────────────────────────────
    target_type: str = "auto"
    # "ip" | "cidr" | "domain" | "webapp" | "auto"

    # ── Operator intelligence ───────────────────────────────────────────
    known_tech: list[str] = field(default_factory=list)
    # e.g. ["nginx/1.24", "php/8.1"] — skips redundant discovery steps

    scope_notes: str = ""
    # Free-text constraint block injected verbatim into every LLM system prompt

    # ── Credentials (resolved at session start, never logged) ───────────
    ssh_credentials: list[SSHCredential] = field(default_factory=list)
    smb_credentials: list[SMBCredential] = field(default_factory=list)
    snmp_credentials: list[SNMPCredential] = field(default_factory=list)
    db_credentials: list[DatabaseCredential] = field(default_factory=list)
    web_credentials: list[WebCredential] = field(default_factory=list)

    # ── Scope enforcement ───────────────────────────────────────────────
    excluded_targets: list[str] = field(default_factory=list)
    # IPs / CIDRs the agent must NEVER touch — hard-blocked by SafetyGuard

    # ── Speed / timing ──────────────────────────────────────────────────
    speed_profile: str = "normal"    # stealth | normal | aggressive

    # ── Permission flags (all False = safe default) ─────────────────────
    allow_exploitation: bool = False
    allow_post_exploitation: bool = False
    allow_lateral_movement: bool = False
    allow_docker_escape: bool = False
    allow_browser_recon: bool = False

    # ── Scan policy ─────────────────────────────────────────────────────
    port_range: str = "1-65535"
    scan_type: str = "syn"           # syn | connect | udp | full
    os_detection: bool = False
    version_detection: bool = True
    script_scan: bool = False
    nse_categories: list[str] = field(default_factory=list)

    def get_ssh_for_host(self, ip: str) -> SSHCredential | None:
        """Return the most specific SSH credential matching a given IP."""
        import ipaddress
        for cred in self.ssh_credentials:
            pat = cred.host_pattern.strip()
            if pat in ("*", ""):
                continue  # wildcard — lowest priority, checked last
            try:
                if "/" in pat:
                    if ipaddress.ip_address(ip) in ipaddress.ip_network(pat, strict=False):
                        return cred
                elif ip == pat:
                    return cred
            except ValueError:
                if ip == pat:
                    return cred

        # Fallback: wildcard
        for cred in self.ssh_credentials:
            if cred.host_pattern.strip() in ("*", ""):
                return cred
        return None
