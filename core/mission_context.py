"""
TIRPAN V2 — MissionContext

Shared read-only view of the entire mission state.

Design rules:
  - All agents READ from MissionContext at any time (no lock needed for reads)
  - Only BrainAgent WRITES to MissionContext (via update_* methods under asyncio.Lock)
  - Specialized agents PROPOSE updates via the MessageBus; Brain decides what to integrate
  - to_summary() produces the compact string BrainAgent injects into its LLM prompt
  - to_dict() / from_dict() for API responses and DB persistence

Permission flags flow: MissionBrief → MissionContext (single source of truth is MissionBrief)
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.mission import MissionBrief


# ── Supporting dataclasses ────────────────────────────────────────────────────

@dataclass
class PortInfo:
    number: int
    state: str = "open"
    service: str = ""
    version: str = ""
    scripts: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "state": self.state,
            "service": self.service,
            "version": self.version,
            "scripts": self.scripts,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "PortInfo":
        return cls(
            number=d.get("number", 0),
            state=d.get("state", "open"),
            service=d.get("service", ""),
            version=d.get("version", ""),
            scripts=d.get("scripts", {}),
        )


@dataclass
class HostInfo:
    ip: str
    hostname: str = ""
    os_type: str = ""
    os_version: str = ""
    domain: str = ""
    ports: list[PortInfo] = field(default_factory=list)
    # 0=none, 1=access, 2=user, 3=root/SYSTEM
    compromise_level: int = 0
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)

    def open_ports(self) -> list[PortInfo]:
        return [p for p in self.ports if p.state == "open"]

    def get_port(self, number: int) -> PortInfo | None:
        for p in self.ports:
            if p.number == number:
                return p
        return None

    def upsert_port(self, port: PortInfo) -> None:
        """Add or update a port entry."""
        for i, p in enumerate(self.ports):
            if p.number == port.number:
                self.ports[i] = port
                return
        self.ports.append(port)

    def to_dict(self) -> dict:
        return {
            "ip": self.ip,
            "hostname": self.hostname,
            "os_type": self.os_type,
            "os_version": self.os_version,
            "domain": self.domain,
            "ports": [p.to_dict() for p in self.ports],
            "compromise_level": self.compromise_level,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "HostInfo":
        obj = cls(
            ip=d.get("ip", ""),
            hostname=d.get("hostname", ""),
            os_type=d.get("os_type", ""),
            os_version=d.get("os_version", ""),
            domain=d.get("domain", ""),
            compromise_level=d.get("compromise_level", 0),
            first_seen=d.get("first_seen", time.time()),
            last_seen=d.get("last_seen", time.time()),
        )
        obj.ports = [PortInfo.from_dict(p) for p in d.get("ports", [])]
        return obj


@dataclass
class VulnInfo:
    title: str
    host_ip: str
    port: int = 0
    service: str = ""
    cve_id: str = ""
    cvss: float = 0.0
    exploit_path: str = ""
    description: str = ""

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "host_ip": self.host_ip,
            "port": self.port,
            "service": self.service,
            "cve_id": self.cve_id,
            "cvss": self.cvss,
            "exploit_path": self.exploit_path,
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "VulnInfo":
        return cls(**{k: d.get(k, v) for k, v in cls.__dataclass_fields__.items()})  # type: ignore[attr-defined]


@dataclass
class SessionInfo:
    session_id: str
    host_ip: str
    session_type: str   # "meterpreter" | "shell" | "ssh" | "web_shell"
    privilege_level: int = 0
    username: str = ""
    status: str = "active"

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "host_ip": self.host_ip,
            "session_type": self.session_type,
            "privilege_level": self.privilege_level,
            "username": self.username,
            "status": self.status,
        }


@dataclass
class HarvestedCredential:
    source_host: str
    username: str = ""
    password: str = ""
    hash: str = ""
    hash_type: str = ""       # "ntlm" | "sha512" | "bcrypt" | ...
    private_key: str = ""
    credential_type: str = "plaintext"  # "plaintext" | "hash" | "key" | "token"
    service: str = ""
    valid_on: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "source_host": self.source_host,
            "username": self.username,
            "password": self.password,
            "hash": self.hash,
            "hash_type": self.hash_type,
            "credential_type": self.credential_type,
            "service": self.service,
            "valid_on": self.valid_on,
        }


@dataclass
class LootItem:
    source_host: str
    loot_type: str          # "file" | "data" | "screenshot" | "config" | "key"
    description: str = ""
    content: str = ""
    file_path: str = ""
    source_path: str = ""

    def to_dict(self) -> dict:
        return {
            "source_host": self.source_host,
            "loot_type": self.loot_type,
            "description": self.description,
            "content": self.content[:500] if self.content else "",  # truncate for API
            "file_path": self.file_path,
            "source_path": self.source_path,
        }


@dataclass
class AgentStatus:
    agent_id: str
    agent_type: str
    status: str = "running"   # "spawning" | "running" | "paused" | "done" | "failed"
    current_task: str = ""
    started_at: float = field(default_factory=time.time)
    progress: int = 0         # 0-100

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "status": self.status,
            "current_task": self.current_task,
            "started_at": self.started_at,
            "progress": self.progress,
        }


@dataclass
class AttackNode:
    id: str                   # usually the IP address
    ip: str
    hostname: str = ""
    compromise_level: int = 0  # 0=unknown, 1=discovered, 2=user, 3=root
    node_type: str = "host"   # "host" | "attacker" | "pivot"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ip": self.ip,
            "hostname": self.hostname,
            "compromise_level": self.compromise_level,
            "node_type": self.node_type,
        }


@dataclass
class AttackEdge:
    from_node: str
    to_node: str
    edge_type: str = "scan"   # "scan" | "exploit" | "lateral" | "pivot" | "discovered_from"
    description: str = ""
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "from_node": self.from_node,
            "to_node": self.to_node,
            "edge_type": self.edge_type,
            "description": self.description,
            "timestamp": self.timestamp,
        }


@dataclass
class AttackGraph:
    nodes: list[AttackNode] = field(default_factory=list)
    edges: list[AttackEdge] = field(default_factory=list)

    def get_node(self, node_id: str) -> AttackNode | None:
        for n in self.nodes:
            if n.id == node_id:
                return n
        return None

    def upsert_node(self, node: AttackNode) -> None:
        for i, n in enumerate(self.nodes):
            if n.id == node.id:
                self.nodes[i] = node
                return
        self.nodes.append(node)

    def add_edge(self, edge: AttackEdge) -> None:
        # Deduplicate: same from/to/type
        for e in self.edges:
            if e.from_node == edge.from_node and e.to_node == edge.to_node and e.edge_type == edge.edge_type:
                return
        self.edges.append(edge)

    def to_dict(self) -> dict:
        return {
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
        }


# ── MissionContext ────────────────────────────────────────────────────────────

class MissionContext:
    """
    Shared mission state — the Brain's living model of the engagement.

    Thread safety:
      - Reads are lock-free (eventual consistency is fine for LLM prompts)
      - Writes go through asyncio.Lock to prevent data races when multiple
        agent results arrive concurrently
      - Brain is the only writer; specialized agents propose updates via MessageBus
    """

    def __init__(
        self,
        mission_id: str,
        target: str | list[str],
        scope: list[str],
        mode: str,
        operator_notes: str = "",
        environment_type: str = "unknown",
        # Permission flags — sourced from MissionBrief, single source of truth
        allow_exploitation: bool = False,
        allow_post_exploitation: bool = False,
        allow_lateral_movement: bool = False,
        allow_persistence: bool = False,
        allow_credential_harvest: bool = False,
        allow_data_exfil: bool = False,
        allow_docker_escape: bool = False,
        allow_browser_recon: bool = False,
    ):
        self.mission_id = mission_id
        self.target = target
        self.scope = scope
        self.mode = mode
        self.operator_notes = operator_notes
        self.environment_type = environment_type

        # Permission flags
        self.allow_exploitation = allow_exploitation
        self.allow_post_exploitation = allow_post_exploitation
        self.allow_lateral_movement = allow_lateral_movement
        self.allow_persistence = allow_persistence
        self.allow_credential_harvest = allow_credential_harvest
        self.allow_data_exfil = allow_data_exfil
        self.allow_docker_escape = allow_docker_escape
        self.allow_browser_recon = allow_browser_recon

        # OSINT / discovery
        self.domains: list[str] = []
        self.subdomains: list[str] = []
        self.ip_addresses: list[str] = []
        self.emails: list[str] = []

        # Scan results: ip → HostInfo
        self.hosts: dict[str, HostInfo] = {}

        # Findings
        self.vulnerabilities: list[VulnInfo] = []
        self.active_sessions: list[SessionInfo] = []
        self.credentials: list[HarvestedCredential] = []
        self.loot: list[LootItem] = []

        # Progress
        self.phase: str = "OSINT"
        self.completed_tasks: list[str] = []
        self.active_agents: dict[str, AgentStatus] = {}

        # Attack graph
        self.attack_graph: AttackGraph = AttackGraph()
        # Add attacker node by default
        self.attack_graph.upsert_node(AttackNode(id="attacker", ip="attacker", node_type="attacker"))

        # Write lock — only Brain acquires this
        self._lock = asyncio.Lock()

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_mission_brief(
        cls,
        mission_id: str,
        brief: "MissionBrief",
        target: str,
        scope: list[str] | None = None,
    ) -> "MissionContext":
        """
        Build MissionContext from a MissionBrief.
        Permission flags are copied directly — MissionBrief is the single source of truth.
        """
        return cls(
            mission_id=mission_id,
            target=target,
            scope=scope or [target],
            mode="full_auto",
            operator_notes=brief.scope_notes,
            allow_exploitation=brief.allow_exploitation,
            allow_post_exploitation=brief.allow_post_exploitation,
            allow_lateral_movement=brief.allow_lateral_movement,
            allow_persistence=brief.allow_persistence,
            allow_credential_harvest=brief.allow_credential_harvest,
            allow_data_exfil=brief.allow_data_exfil,
            allow_docker_escape=brief.allow_docker_escape,
            allow_browser_recon=brief.allow_browser_recon,
        )

    # ── Write helpers (Brain calls these under lock) ──────────────────────────

    async def update_host(self, host: HostInfo) -> None:
        async with self._lock:
            existing = self.hosts.get(host.ip)
            if existing:
                # Merge: keep highest compromise level, merge ports
                host.compromise_level = max(host.compromise_level, existing.compromise_level)
                for p in existing.ports:
                    if not host.get_port(p.number):
                        host.ports.append(p)
            self.hosts[host.ip] = host
            if host.ip not in self.ip_addresses:
                self.ip_addresses.append(host.ip)
            # Sync attack graph node
            self.attack_graph.upsert_node(AttackNode(
                id=host.ip,
                ip=host.ip,
                hostname=host.hostname,
                compromise_level=host.compromise_level,
            ))

    async def add_vulnerability(self, vuln: VulnInfo) -> None:
        async with self._lock:
            # Deduplicate by title + host
            for v in self.vulnerabilities:
                if v.title == vuln.title and v.host_ip == vuln.host_ip:
                    return
            self.vulnerabilities.append(vuln)

    async def add_session(self, session: SessionInfo) -> None:
        async with self._lock:
            # Replace if same host + type already tracked
            for i, s in enumerate(self.active_sessions):
                if s.host_ip == session.host_ip and s.session_type == session.session_type:
                    self.active_sessions[i] = session
                    return
            self.active_sessions.append(session)
            # Update host compromise level
            if session.host_ip in self.hosts:
                lvl = max(self.hosts[session.host_ip].compromise_level, session.privilege_level)
                self.hosts[session.host_ip].compromise_level = lvl
                self.attack_graph.upsert_node(AttackNode(
                    id=session.host_ip,
                    ip=session.host_ip,
                    compromise_level=lvl,
                ))
            # Add exploit edge: attacker → host
            self.attack_graph.add_edge(AttackEdge(
                from_node="attacker",
                to_node=session.host_ip,
                edge_type="exploit",
                description=f"{session.session_type} session opened",
            ))

    async def remove_session(self, session_id: str) -> None:
        async with self._lock:
            self.active_sessions = [
                s for s in self.active_sessions if s.session_id != session_id
            ]

    async def add_credential(self, cred: HarvestedCredential) -> None:
        async with self._lock:
            self.credentials.append(cred)

    async def add_loot(self, item: LootItem) -> None:
        async with self._lock:
            self.loot.append(item)

    async def add_domain(self, domain: str) -> None:
        async with self._lock:
            if domain not in self.domains:
                self.domains.append(domain)

    async def add_subdomain(self, subdomain: str) -> None:
        async with self._lock:
            if subdomain not in self.subdomains:
                self.subdomains.append(subdomain)

    async def add_email(self, email: str) -> None:
        async with self._lock:
            if email not in self.emails:
                self.emails.append(email)

    async def set_phase(self, phase: str) -> None:
        async with self._lock:
            self.phase = phase

    async def mark_task_done(self, task: str) -> None:
        async with self._lock:
            if task not in self.completed_tasks:
                self.completed_tasks.append(task)

    async def update_agent_status(self, status: AgentStatus) -> None:
        async with self._lock:
            self.active_agents[status.agent_id] = status

    async def remove_agent(self, agent_id: str) -> None:
        async with self._lock:
            self.active_agents.pop(agent_id, None)

    async def set_environment_type(self, env_type: str) -> None:
        async with self._lock:
            self.environment_type = env_type

    async def add_lateral_edge(self, from_ip: str, to_ip: str, description: str = "") -> None:
        async with self._lock:
            self.attack_graph.add_edge(AttackEdge(
                from_node=from_ip,
                to_node=to_ip,
                edge_type="lateral",
                description=description,
            ))

    # ── Serialization ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        """Full serialization — for DB persistence and API responses."""
        return {
            "mission_id": self.mission_id,
            "target": self.target,
            "scope": self.scope,
            "mode": self.mode,
            "environment_type": self.environment_type,
            "operator_notes": self.operator_notes,
            "permissions": {
                "allow_exploitation": self.allow_exploitation,
                "allow_post_exploitation": self.allow_post_exploitation,
                "allow_lateral_movement": self.allow_lateral_movement,
                "allow_persistence": self.allow_persistence,
                "allow_credential_harvest": self.allow_credential_harvest,
                "allow_data_exfil": self.allow_data_exfil,
            },
            "domains": self.domains,
            "subdomains": self.subdomains,
            "ip_addresses": self.ip_addresses,
            "emails": self.emails,
            "hosts": {ip: h.to_dict() for ip, h in self.hosts.items()},
            "vulnerabilities": [v.to_dict() for v in self.vulnerabilities],
            "active_sessions": [s.to_dict() for s in self.active_sessions],
            "credentials_count": len(self.credentials),  # don't expose passwords in API
            "loot_count": len(self.loot),
            "phase": self.phase,
            "completed_tasks": self.completed_tasks,
            "active_agents": {aid: a.to_dict() for aid, a in self.active_agents.items()},
            "attack_graph": self.attack_graph.to_dict(),
        }

    def to_summary(self) -> str:
        """
        Compact text summary for injection into Brain's LLM prompt.
        Keeps token count low while conveying the current engagement state.
        """
        lines = [
            f"TARGET: {self.target}",
            f"PHASE: {self.phase} | ENV: {self.environment_type} | MODE: {self.mode}",
        ]

        if self.domains:
            lines.append(f"DOMAINS: {', '.join(self.domains[:5])}")
        if self.subdomains:
            lines.append(f"SUBDOMAINS: {len(self.subdomains)} discovered")
        if self.emails:
            lines.append(f"EMAILS: {len(self.emails)} harvested")

        if self.hosts:
            host_lines = []
            for ip, h in list(self.hosts.items())[:10]:
                open_ports = h.open_ports()
                port_str = ", ".join(
                    f"{p.number}/{p.service}" for p in open_ports[:5]
                )
                lvl_str = ["", "access", "user", "root"][min(h.compromise_level, 3)]
                host_lines.append(
                    f"  {ip} [{h.os_type or '?'}] ports=[{port_str}]"
                    + (f" COMPROMISED({lvl_str})" if h.compromise_level > 0 else "")
                )
            lines.append(f"HOSTS ({len(self.hosts)}):")
            lines.extend(host_lines)

        if self.vulnerabilities:
            high = [v for v in self.vulnerabilities if v.cvss >= 7.0]
            lines.append(
                f"VULNS: {len(self.vulnerabilities)} total, "
                f"{len(high)} high/critical (CVSS≥7)"
            )

        if self.active_sessions:
            sess_lines = [
                f"  {s.host_ip} [{s.session_type}] priv={s.privilege_level} user={s.username}"
                for s in self.active_sessions[:5]
            ]
            lines.append(f"ACTIVE SESSIONS ({len(self.active_sessions)}):")
            lines.extend(sess_lines)

        if self.credentials:
            lines.append(f"HARVESTED CREDENTIALS: {len(self.credentials)}")

        if self.loot:
            lines.append(f"LOOT: {len(self.loot)} items collected")

        if self.active_agents:
            running = [
                f"{a.agent_type}({a.status})"
                for a in self.active_agents.values()
                if a.status in ("running", "spawning")
            ]
            if running:
                lines.append(f"ACTIVE AGENTS: {', '.join(running)}")

        perms = []
        if self.allow_exploitation:
            perms.append("exploitation")
        if self.allow_lateral_movement:
            perms.append("lateral")
        if self.allow_persistence:
            perms.append("persistence")
        if self.allow_credential_harvest:
            perms.append("cred-harvest")
        if perms:
            lines.append(f"ALLOWED: {', '.join(perms)}")

        if self.completed_tasks:
            lines.append(f"COMPLETED TASKS: {len(self.completed_tasks)}")

        return "\n".join(lines)
