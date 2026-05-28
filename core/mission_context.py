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
    id: str                   # stable string id (ip, ip:port, agent_id, …)
    ip: str = ""
    hostname: str = ""
    compromise_level: int = 0  # 0=unknown, 1=discovered, 2=user, 3=root
    node_type: str = "host"   # host | attacker | pivot | service | agent
                              # | vulnerability | credential | loot
    label: str = ""           # human-friendly label for the UI
    status: str = ""          # agent status: spawning | running | done | failed
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ip": self.ip,
            "hostname": self.hostname,
            "compromise_level": self.compromise_level,
            "node_type": self.node_type,
            "label": self.label,
            "status": self.status,
            "metadata": dict(self.metadata),
        }


@dataclass
class AttackEdge:
    from_node: str
    to_node: str
    # scan | exploit | exploit_attempt | lateral | pivot | discovered_from
    # | targeting | spawned | credential_from | loot_from
    edge_type: str = "scan"
    description: str = ""
    success: bool | None = None     # True/False for exploit_attempt; None elsewhere
    timestamp: float = field(default_factory=time.time)
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "from_node": self.from_node,
            "to_node": self.to_node,
            "edge_type": self.edge_type,
            "description": self.description,
            "success": self.success,
            "timestamp": self.timestamp,
            "metadata": dict(self.metadata),
        }


@dataclass
class AttackGraph:
    nodes: list[AttackNode] = field(default_factory=list)
    edges: list[AttackEdge] = field(default_factory=list)
    # Optional sink callbacks for DB mirroring. MissionContext sets these to
    # fire-and-forget functions that schedule async writes to NetworkGraphRepository.
    # Sync callable so AttackGraph itself can stay sync; the sink schedules
    # the async DB call internally. Both signatures: (item) -> None.
    _on_node_upserted: "callable | None" = field(default=None, repr=False, compare=False)
    _on_edge_added:    "callable | None" = field(default=None, repr=False, compare=False)

    def get_node(self, node_id: str) -> AttackNode | None:
        for n in self.nodes:
            if n.id == node_id:
                return n
        return None

    def upsert_node(self, node: AttackNode) -> None:
        for i, n in enumerate(self.nodes):
            if n.id == node.id:
                # Preserve fields the caller didn't intend to overwrite — merge
                # known metadata so later updates don't blank earlier discoveries.
                merged_meta = dict(n.metadata)
                merged_meta.update(node.metadata or {})
                node.metadata = merged_meta
                if not node.label:
                    node.label = n.label
                if not node.hostname:
                    node.hostname = n.hostname
                if not node.status and n.status:
                    node.status = n.status
                # compromise_level only ratchets upward
                node.compromise_level = max(node.compromise_level, n.compromise_level)
                self.nodes[i] = node
                self._fire(self._on_node_upserted, node)
                return
        self.nodes.append(node)
        self._fire(self._on_node_upserted, node)

    def add_edge(self, edge: AttackEdge) -> None:
        # Deduplicate: same from/to/type — but allow many exploit_attempt edges
        # between the same pair so the graph reflects repeated tries with their
        # individual success/failure status.
        if edge.edge_type != "exploit_attempt":
            for e in self.edges:
                if (e.from_node == edge.from_node
                        and e.to_node == edge.to_node
                        and e.edge_type == edge.edge_type):
                    return
        self.edges.append(edge)
        self._fire(self._on_edge_added, edge)

    @staticmethod
    def _fire(cb, item) -> None:
        """Best-effort sink invocation — never lets a DB write break in-memory updates."""
        if cb is None:
            return
        try:
            cb(item)
        except Exception:
            # Sinks must be defensive; we deliberately swallow here so the
            # in-memory graph stays consistent even when DB is unreachable.
            pass

    def remove_node(self, node_id: str) -> None:
        self.nodes = [n for n in self.nodes if n.id != node_id]
        self.edges = [
            e for e in self.edges
            if e.from_node != node_id and e.to_node != node_id
        ]

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
        auto_targeting: bool = False,
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
        self.auto_targeting = auto_targeting

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

        # Mission objectives (operator-supplied)
        self.objectives: list[str] = []

        # Operator-supplied credentials (preset BEFORE the engagement starts).
        # Populated by from_mission_brief; otherwise empty. These are different
        # from `credentials` (which is the list of credentials HARVESTED during
        # the engagement). Brain renders these in its prompt so the LLM can
        # decide to use SSH/SMB/DB logins instead of brute-forcing.
        self.preset_ssh_credentials: list = []
        self.preset_smb_credentials: list = []
        self.preset_snmp_credentials: list = []
        self.preset_db_credentials: list = []
        self.preset_web_credentials: list = []
        # Optional back-reference to the original MissionBrief.
        self.mission_brief = None

        # Progress
        self.phase: str = "OSINT"
        self.completed_tasks: list[str] = []
        self.active_agents: dict[str, AgentStatus] = {}

        # Attack graph
        self.attack_graph: AttackGraph = AttackGraph()

        # ── DB sink for attack_graph (F: network_nodes/network_edges) ────────
        # MissionContext.mission_id is the same value as pentest_sessions.id,
        # so we can mirror every upsert/edge into the persistent graph tables.
        # The sink schedules an async task; AttackGraph._fire absorbs any error.
        # We bind it BEFORE inserting the attacker node so even that initial
        # write flows through to DB.
        self._attach_graph_sink()
        # Add attacker node by default
        self.attack_graph.upsert_node(AttackNode(id="attacker", ip="attacker", node_type="attacker"))

        # Write lock — only Brain acquires this
        self._lock = asyncio.Lock()

    def _attach_graph_sink(self) -> None:
        """Bridge AttackGraph upserts to NetworkGraphRepository.

        AttackGraph is a sync object; the repo writes are async, so we
        schedule them with asyncio.ensure_future. If no loop is running yet
        (very early construction) we drop the write — the in-memory state is
        still correct, and the recovery pass at session_done will pick it up.
        """
        try:
            from database.repositories import NetworkGraphRepository
            _repo = NetworkGraphRepository()
        except Exception:
            return

        sid = self.mission_id

        def _node_sink(node: AttackNode) -> None:
            try:
                loop = asyncio.get_event_loop()
                if not loop.is_running():
                    return
            except Exception:
                return
            asyncio.ensure_future(_repo.upsert_node(
                session_id=sid,
                node_id=node.id,
                ip=str(node.ip or ""),
                hostname=str(node.hostname or ""),
                os_type=str(node.metadata.get("os_type", "") if isinstance(node.metadata, dict) else ""),
                compromise_level=int(node.compromise_level or 0),
                node_type=str(node.node_type or "host"),
            ))

        def _edge_sink(edge: AttackEdge) -> None:
            try:
                loop = asyncio.get_event_loop()
                if not loop.is_running():
                    return
            except Exception:
                return
            asyncio.ensure_future(_repo.upsert_edge(
                session_id=sid,
                from_node=str(edge.from_node or ""),
                to_node=str(edge.to_node or ""),
                edge_type=str(edge.edge_type or "scan"),
                description=str(edge.description or "")[:500],
            ))

        self.attack_graph._on_node_upserted = _node_sink
        self.attack_graph._on_edge_added = _edge_sink

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_mission_brief(
        cls,
        mission_id: str,
        brief: "MissionBrief",
        target: str,
        scope: list[str] | None = None,
        auto_targeting: bool = False,
    ) -> "MissionContext":
        """
        Build MissionContext from a MissionBrief.
        Permission flags are copied directly — MissionBrief is the single source of truth.

        Also copies operator-supplied credentials (ssh/smb/snmp/db/web) and the
        objectives list onto the context so brain + children can see and use
        them. test6 regression: brain ignored an SSH credential the operator
        provided because from_mission_brief never propagated it.
        """
        ctx = cls(
            mission_id=mission_id,
            target=target,
            scope=scope or [target],
            mode="full_auto",
            operator_notes=brief.scope_notes,
            auto_targeting=auto_targeting,
            allow_exploitation=brief.allow_exploitation,
            allow_post_exploitation=brief.allow_post_exploitation,
            allow_lateral_movement=brief.allow_lateral_movement,
            allow_persistence=brief.allow_persistence,
            allow_credential_harvest=brief.allow_credential_harvest,
            allow_data_exfil=brief.allow_data_exfil,
            allow_docker_escape=brief.allow_docker_escape,
            allow_browser_recon=brief.allow_browser_recon,
        )
        ctx.objectives = list(brief.objectives or [])
        # Operator-provided creds — stored as the original dataclass instances
        # so children can pick the right one via host_pattern matching.
        ctx.preset_ssh_credentials  = list(getattr(brief, "ssh_credentials", []) or [])
        ctx.preset_smb_credentials  = list(getattr(brief, "smb_credentials", []) or [])
        ctx.preset_snmp_credentials = list(getattr(brief, "snmp_credentials", []) or [])
        ctx.preset_db_credentials   = list(getattr(brief, "db_credentials", []) or [])
        ctx.preset_web_credentials  = list(getattr(brief, "web_credentials", []) or [])
        # Keep a back-reference for agents that want the full brief.
        ctx.mission_brief = brief
        return ctx

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
                label=host.hostname or host.ip,
            ))
            # Edge: attacker -> host so a newly discovered host appears in the graph
            # even before any exploit attempt.
            self.attack_graph.add_edge(AttackEdge(
                from_node="attacker",
                to_node=host.ip,
                edge_type="discovered_from",
                description="host discovered",
            ))
            # Add a service node per open port so the graph reflects the actual
            # attack surface, not just compromise outcomes.
            for p in host.ports:
                if (p.state or "").lower() != "open":
                    continue
                node_id = f"{host.ip}:{p.number}"
                svc_label = (p.service or "unknown").lower()
                version = (p.version or "").strip()
                node_label = f"{svc_label}/{p.number}" + (f" ({version})" if version else "")
                self.attack_graph.upsert_node(AttackNode(
                    id=node_id,
                    ip=host.ip,
                    node_type="service",
                    label=node_label,
                    metadata={
                        "port": p.number,
                        "service": p.service or "",
                        "version": version,
                    },
                ))
                self.attack_graph.add_edge(AttackEdge(
                    from_node=host.ip,
                    to_node=node_id,
                    edge_type="discovered_from",
                    description=f"{svc_label} on port {p.number}",
                ))

    async def add_vulnerability(self, vuln: VulnInfo) -> None:
        async with self._lock:
            # Deduplicate by title + host
            for v in self.vulnerabilities:
                if v.title == vuln.title and v.host_ip == vuln.host_ip:
                    return
            self.vulnerabilities.append(vuln)
        # Reflect the vulnerability in the attack graph (runs outside the lock
        # — record_vulnerability_node takes its own lock).
        await self.record_vulnerability_node(vuln)

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
        await self.record_credential_node(
            host_ip=getattr(cred, "source_host", "") or "",
            username=getattr(cred, "username", "") or "",
            service=getattr(cred, "service", "") or "",
        )

    async def add_loot(self, item: LootItem) -> None:
        async with self._lock:
            self.loot.append(item)
        await self.record_loot_node(
            host_ip=getattr(item, "source_host", "") or "",
            loot_type=getattr(item, "loot_type", "") or "data",
            description=(
                getattr(item, "description", "")
                or getattr(item, "file_path", "")
                or ""
            ),
        )

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
            # Reflect agent presence + status in the attack graph so the operator
            # can see which sub-agents are running, which finished, and against
            # which host/service each one is working.
            self.attack_graph.upsert_node(AttackNode(
                id=status.agent_id,
                node_type="agent",
                label=f"{status.agent_type}:{status.agent_id[-6:]}",
                status=status.status,
                metadata={
                    "agent_type": status.agent_type,
                    "current_task": status.current_task,
                    "started_at": status.started_at,
                    "progress": status.progress,
                },
            ))
            self.attack_graph.add_edge(AttackEdge(
                from_node="attacker",
                to_node=status.agent_id,
                edge_type="spawned",
                description=f"{status.agent_type} agent",
            ))

    async def remove_agent(self, agent_id: str) -> None:
        async with self._lock:
            self.active_agents.pop(agent_id, None)
            # Keep the node but mark it terminated so the operator can still see
            # the historical attack graph; the UI can fade it out if it wants to.
            existing = self.attack_graph.get_node(agent_id)
            if existing is not None and existing.node_type == "agent":
                existing.status = existing.status or "done"

    async def link_agent_to_target(
        self, agent_id: str, target: str, port: int | None = None,
        task_type: str = "",
    ) -> None:
        """Connect an agent node to the host/service it is operating on."""
        if not agent_id or not target:
            return
        async with self._lock:
            target_id = f"{target}:{port}" if port else target
            # The target node may not exist yet — create a stub so the edge has
            # something to point at; it will be enriched later by update_host.
            if self.attack_graph.get_node(target_id) is None:
                if port:
                    self.attack_graph.upsert_node(AttackNode(
                        id=target_id, ip=target, node_type="service",
                        label=f"port {port}",
                        metadata={"port": port},
                    ))
                    if self.attack_graph.get_node(target) is None:
                        self.attack_graph.upsert_node(AttackNode(
                            id=target, ip=target, node_type="host", label=target,
                        ))
                    self.attack_graph.add_edge(AttackEdge(
                        from_node=target, to_node=target_id,
                        edge_type="discovered_from",
                    ))
                else:
                    self.attack_graph.upsert_node(AttackNode(
                        id=target_id, ip=target, node_type="host", label=target,
                    ))
            self.attack_graph.add_edge(AttackEdge(
                from_node=agent_id,
                to_node=target_id,
                edge_type="targeting",
                description=task_type or "",
            ))

    async def record_exploit_attempt(
        self, agent_id: str, host_ip: str, port: int | None,
        module: str, success: bool, error: str = "",
    ) -> None:
        """Record a single exploit attempt as a graph edge so the attack story
        is visible even when nothing succeeds."""
        if not host_ip:
            return
        async with self._lock:
            target_id = f"{host_ip}:{port}" if port else host_ip
            from_node = agent_id if agent_id else "attacker"
            if from_node != "attacker" and self.attack_graph.get_node(from_node) is None:
                # If the agent node wasn't registered (legacy path), fall back
                # to the attacker so the edge still appears.
                from_node = "attacker"
            if self.attack_graph.get_node(target_id) is None and port:
                self.attack_graph.upsert_node(AttackNode(
                    id=target_id, ip=host_ip, node_type="service",
                    label=f"port {port}", metadata={"port": port},
                ))
            self.attack_graph.add_edge(AttackEdge(
                from_node=from_node,
                to_node=target_id,
                edge_type="exploit_attempt",
                description=(module or "")[:200],
                success=bool(success),
                metadata={"module": module or "", "error": (error or "")[:300]},
            ))

    async def record_credential_node(
        self, host_ip: str, username: str, service: str = "",
    ) -> None:
        """Surface harvested credentials as nodes in the attack graph."""
        if not host_ip or not username:
            return
        async with self._lock:
            node_id = f"cred:{host_ip}:{service}:{username}"
            self.attack_graph.upsert_node(AttackNode(
                id=node_id,
                ip=host_ip,
                node_type="credential",
                label=f"{username}@{service or host_ip}",
                metadata={"service": service or "", "username": username},
            ))
            if self.attack_graph.get_node(host_ip) is None:
                self.attack_graph.upsert_node(AttackNode(
                    id=host_ip, ip=host_ip, node_type="host", label=host_ip,
                ))
            self.attack_graph.add_edge(AttackEdge(
                from_node=host_ip,
                to_node=node_id,
                edge_type="credential_from",
                description=service or "",
            ))

    async def record_loot_node(
        self, host_ip: str, loot_type: str, description: str = "",
    ) -> None:
        if not host_ip:
            return
        async with self._lock:
            node_id = f"loot:{host_ip}:{loot_type}:{description[:40]}"
            self.attack_graph.upsert_node(AttackNode(
                id=node_id,
                ip=host_ip,
                node_type="loot",
                label=f"{loot_type}: {description[:40]}",
                metadata={"loot_type": loot_type, "description": description},
            ))
            if self.attack_graph.get_node(host_ip) is None:
                self.attack_graph.upsert_node(AttackNode(
                    id=host_ip, ip=host_ip, node_type="host", label=host_ip,
                ))
            self.attack_graph.add_edge(AttackEdge(
                from_node=host_ip,
                to_node=node_id,
                edge_type="loot_from",
                description=loot_type,
            ))

    async def record_vulnerability_node(self, vuln: VulnInfo) -> None:
        if not vuln.host_ip:
            return
        async with self._lock:
            cve_or_title = vuln.cve_id or vuln.title or "vulnerability"
            node_id = f"vuln:{vuln.host_ip}:{cve_or_title[:60]}"
            self.attack_graph.upsert_node(AttackNode(
                id=node_id,
                ip=vuln.host_ip,
                node_type="vulnerability",
                label=cve_or_title[:80],
                metadata={
                    "cve_id": vuln.cve_id or "",
                    "cvss": float(getattr(vuln, "cvss", 0.0) or 0.0),
                    "service": vuln.service or "",
                    "service_version": getattr(vuln, "service_version", "") or "",
                },
            ))
            if self.attack_graph.get_node(vuln.host_ip) is None:
                self.attack_graph.upsert_node(AttackNode(
                    id=vuln.host_ip, ip=vuln.host_ip, node_type="host",
                    label=vuln.host_ip,
                ))
            self.attack_graph.add_edge(AttackEdge(
                from_node=vuln.host_ip,
                to_node=node_id,
                edge_type="discovered_from",
                description=cve_or_title[:80],
            ))

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
            "auto_targeting": self.auto_targeting,
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

        if self.scope:
            scope_preview = ", ".join(str(s) for s in self.scope[:8])
            if len(self.scope) > 8:
                scope_preview += ", ..."
            lines.append(f"SCOPE ({len(self.scope)}): {scope_preview}")

        if self.auto_targeting:
            lines.append("TARGET MODE: AUTO_DISCOVERY (enumerate full scope)")

        if self.operator_notes:
            lines.append(f"OPERATOR NOTES: {self.operator_notes[:280]}")

        if self.objectives:
            lines.append("MISSION OBJECTIVES (MUST ACHIEVE):")
            for obj in self.objectives:
                lines.append(f"  • {obj}")

        # Operator-provided credentials — rendered so the LLM knows it can
        # SSH/SMB/DB-login directly instead of brute-forcing.
        preset_total = (
            len(self.preset_ssh_credentials)
            + len(self.preset_smb_credentials)
            + len(self.preset_snmp_credentials)
            + len(self.preset_db_credentials)
            + len(self.preset_web_credentials)
        )
        if preset_total > 0:
            lines.append("OPERATOR-PROVIDED CREDENTIALS (use these FIRST — do not brute-force):")
            for c in self.preset_ssh_credentials[:6]:
                pw = "<password>" if getattr(c, "password", "") else (
                    "<private_key>" if getattr(c, "private_key", "") else "<empty>"
                )
                esc = getattr(c, "escalation", "none")
                esc_str = f" esc={esc}" if esc and esc != "none" else ""
                lines.append(
                    f"  SSH host={c.host_pattern} port={getattr(c, 'port', 22)} "
                    f"user={c.username} auth={pw}{esc_str}"
                )
            for c in self.preset_smb_credentials[:6]:
                dom = f"\\\\{c.domain}" if getattr(c, "domain", "") else ""
                lines.append(
                    f"  SMB host={c.host_pattern} user={dom}{c.username} "
                    f"auth_type={getattr(c, 'auth_type', 'ntlmv2')}"
                )
            for c in self.preset_snmp_credentials[:4]:
                lines.append(
                    f"  SNMP host={c.host_pattern} ver={getattr(c, 'version', 'v2c')} "
                    f"community={getattr(c, 'community', 'public')}"
                )
            for c in self.preset_db_credentials[:4]:
                lines.append(
                    f"  DB host={c.host_pattern} type={c.db_type} "
                    f"user={c.username} db={getattr(c, 'database', '*')}"
                )
            for c in self.preset_web_credentials[:4]:
                lines.append(
                    f"  WEB url={c.url_pattern} user={c.username} "
                    f"auth={getattr(c, 'auth_type', 'basic')}"
                )

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
