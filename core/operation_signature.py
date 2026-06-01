"""Operation signatures for coverage-aware orchestration.

The brain re-derives its plan from MissionContext findings every iteration; with
no record of *what was already attempted*, it re-dispatches the same scans under
slightly renamed task_types (session test1: 192.168.1.4 scanned by ~10 scanner
agents; smb_enum_445 spawned twice verbatim). The 60s dedup window in
brain_agent could not catch repeats spaced minutes apart.

This module turns a spawn request into a stable, comparable **operation
signature** so the Coverage Ledger (see docs/13_ORCHESTRATION_EFFICIENCY_REDESIGN.md)
can decide whether the work is genuinely new.

Hybrid derivation (per design decision #1):
  1. If the caller supplies a structured ``operation`` dict, trust it.
  2. Otherwise parse it from (agent_type, target, task_type, options) using a
     small controlled vocabulary of action verbs.  Deterministic + rule-based —
     no LLM call on the hot path.

Three operation classes drive the coverage policy WITHOUT breaking thoroughness:
  - CHARACTERIZATION  idempotent (port/service/version/vuln/web/dir enum).
                      Same (host, port, scripts) twice = waste → block the 2nd.
  - ACTION            stateful attempts (brute, exploit). Bounded retries, not
                      blocked outright.
  - PROGRESSIVE       depends on a prior result (post-exploit, lateral, loot).
                      The signature already encodes the specific sub-op, so a
                      deeper step is naturally a different signature → never
                      blocked on the signature alone.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

# ── Operation kinds ──────────────────────────────────────────────────────────

CHARACTERIZATION = "characterization"
ACTION = "action"
PROGRESSIVE = "progressive"

# kind → op_class
_KIND_CLASS: dict[str, str] = {
    # characterization (idempotent)
    "port_scan": CHARACTERIZATION,
    "service_enum": CHARACTERIZATION,
    "version_detect": CHARACTERIZATION,
    "vuln_scan": CHARACTERIZATION,
    "web_scan": CHARACTERIZATION,
    "dir_enum": CHARACTERIZATION,
    "banner_grab": CHARACTERIZATION,
    # action (stateful, bounded retries)
    "cred_bruteforce": ACTION,
    "exploit": ACTION,
    # progressive (never blocked on signature alone)
    "post_exploit": PROGRESSIVE,
    "lateral": PROGRESSIVE,
    "loot": PROGRESSIVE,
    "other": PROGRESSIVE,
}

# task_type / nse-script verb tokens → kind.  Ordered by specificity: the first
# token found in the task_type (or nse scripts) wins.  "brute" must beat "enum"
# because vnc-brute/ssh-brute scripts also enumerate.
_VERB_KIND: list[tuple[tuple[str, ...], str]] = [
    (("brute", "bruteforce", "hydra", "medusa", "login", "passwd", "password"), "cred_bruteforce"),
    (("exploit", "rce", "payload", "shell", "backdoor"), "exploit"),
    (("vuln", "cve", "nikto", "sploit"), "vuln_scan"),
    (("dir", "dirb", "gobuster", "ffuf", "content", "fuzz", "wordlist"), "dir_enum"),
    (("version", "sV", "banner"), "version_detect"),
    (("enum", "share", "users", "discover", "smb", "snmp", "ldap", "rpc", "nse"), "service_enum"),
    (("ping", "portscan", "port_scan", "sweep", "tcp", "udp", "syn", "masscan"), "port_scan"),
    (("web", "http", "dirb", "nikto", "wpscan"), "web_scan"),
]

# agent_type → default kind when nothing more specific is found.
_AGENT_DEFAULT_KIND: dict[str, str] = {
    "scanner": "service_enum",
    "webapp": "web_scan",
    "exploit": "exploit",
    "cred_attack": "cred_bruteforce",
    "post_exploit": "post_exploit",
    "lateral": "lateral",
    "osint": "other",
    "reporting": "other",
}

# Tags the brain appends to task_type — stripped before tokenizing.
_TAG_RE = re.compile(r"\s*\[(?:ml_success_prob|has_cred)=[^\]]+\]")
_TOKEN_RE = re.compile(r"[a-zA-Z]+")


@dataclass(frozen=True)
class OpSignature:
    """Canonical, comparable description of one spawn request."""

    signature: str          # stable key — what the ledger compares on
    kind: str               # e.g. "service_enum"
    op_class: str           # CHARACTERIZATION | ACTION | PROGRESSIVE
    lane: str               # agent_type
    host: str               # IP / CIDR (URL host resolved)
    port: int | None
    scripts: tuple[str, ...] = field(default=())

    @property
    def is_characterization(self) -> bool:
        return self.op_class == CHARACTERIZATION

    @property
    def is_action(self) -> bool:
        return self.op_class == ACTION

    @property
    def is_progressive(self) -> bool:
        return self.op_class == PROGRESSIVE


def _host_from_target(target: str) -> str:
    """Resolve an IP/CIDR/URL target down to a stable host key."""
    t = (target or "").strip()
    if not t:
        return ""
    if "://" in t:                       # URL → netloc host (drop scheme/port/path)
        try:
            netloc = urlparse(t).hostname
            if netloc:
                return netloc
        except (ValueError, TypeError):
            pass
    # "host:port" without scheme — keep host only (CIDR keeps its slash).
    if "/" not in t and t.count(":") == 1:
        return t.split(":", 1)[0]
    return t


def _port_from(target: str, options: dict) -> int | None:
    """Single port if we can pin one down, else None (ranges/multi → None)."""
    # explicit single port wins
    raw = options.get("port")
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    # options.ports — only if it's a single port (not a range/list/keyword)
    ports = str(options.get("ports") or options.get("port_range") or "").strip()
    if ports and ports.isdigit():
        return int(ports)
    # URL :port  or  host:port
    if "://" in (target or ""):
        try:
            p = urlparse(target).port
            if p:
                return int(p)
        except (ValueError, TypeError):
            pass
    elif target and "/" not in target and target.count(":") == 1:
        tail = target.split(":", 1)[1]
        if tail.isdigit():
            return int(tail)
    # task_type suffix _<port> handled by caller via tokens; not here
    return None


def _scripts_from(options: dict) -> tuple[str, ...]:
    """Normalized, sorted NSE-script / wordlist / module discriminator."""
    raw = options.get("nse_scripts") or options.get("scripts") or ""
    if isinstance(raw, (list, tuple)):
        items = [str(s).strip().lower() for s in raw if str(s).strip()]
    else:
        items = [s.strip().lower() for s in str(raw).split(",") if s.strip()]
    return tuple(sorted(set(items)))


def _kind_from_tokens(task_type: str, scripts: tuple[str, ...], agent_type: str) -> str:
    """Infer the operation kind from task_type verbs + nse scripts."""
    blob = _TAG_RE.sub("", task_type or "").lower()
    tokens = set(_TOKEN_RE.findall(blob))
    tokens.update(t for s in scripts for t in _TOKEN_RE.findall(s.lower()))
    for verbs, kind in _VERB_KIND:
        if tokens.intersection(verbs):
            return kind
    return _AGENT_DEFAULT_KIND.get(agent_type, "other")


def _port_from_task_suffix(task_type: str) -> int | None:
    """Trailing _<port> in task_type, e.g. 'smb_enum_445' → 445."""
    m = re.search(r"_(\d{1,5})$", _TAG_RE.sub("", task_type or "").strip())
    if m:
        p = int(m.group(1))
        if 1 <= p <= 65535:
            return p
    return None


def derive_signature(
    *,
    agent_type: str,
    target: str,
    task_type: str = "",
    options: dict | None = None,
    operation: dict | None = None,
) -> OpSignature:
    """Build the canonical OpSignature for a spawn request (hybrid).

    Structured ``operation`` (if present and valid) takes priority; otherwise the
    signature is parsed from task_type/options.
    """
    options = dict(options or {})
    lane = (agent_type or "").strip().lower()
    host = _host_from_target(target)

    # ── 1. Structured operation field wins ───────────────────────────────────
    if operation and isinstance(operation, dict) and operation.get("kind"):
        kind = str(operation["kind"]).strip().lower()
        port = operation.get("port")
        try:
            port = int(port) if port is not None else _port_from(target, options)
        except (TypeError, ValueError):
            port = _port_from(target, options)
        raw_scripts = operation.get("scripts") or options.get("nse_scripts") or ()
        if isinstance(raw_scripts, str):
            raw_scripts = [s.strip() for s in raw_scripts.split(",") if s.strip()]
        scripts = tuple(sorted({str(s).strip().lower() for s in raw_scripts if str(s).strip()}))
    else:
        # ── 2. Parse from task_type + options ────────────────────────────────
        scripts = _scripts_from(options)
        kind = _kind_from_tokens(task_type, scripts, lane)
        port = _port_from(target, options)
        if port is None:
            port = _port_from_task_suffix(task_type)

    op_class = _KIND_CLASS.get(kind, PROGRESSIVE)

    # Discriminator: scripts (enum), else module (exploit), else scan_type.
    disc = "+".join(scripts) if scripts else str(
        options.get("module") or options.get("scan_type") or ""
    ).strip().lower()

    signature = f"{lane}:{kind}:{host}:{port if port is not None else '*'}:{disc}"
    return OpSignature(
        signature=signature,
        kind=kind,
        op_class=op_class,
        lane=lane,
        host=host,
        port=port,
        scripts=scripts,
    )
