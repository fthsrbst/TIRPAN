"""Tests for core/mission_context.py — MissionContext and supporting dataclasses."""

from __future__ import annotations

import asyncio
import pytest

from core.mission_context import (
    MissionContext,
    HostInfo,
    PortInfo,
    VulnInfo,
    SessionInfo,
    HarvestedCredential,
    LootItem,
    AgentStatus,
    AttackGraph,
    AttackNode,
    AttackEdge,
)
from models.mission import MissionBrief


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_context(**kwargs) -> MissionContext:
    brief = MissionBrief(**kwargs)
    return MissionContext.from_mission_brief("test-mission-01", brief, target="10.0.0.1")


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def make_host(ip: str = "10.0.0.1", **kwargs) -> HostInfo:
    return HostInfo(ip=ip, **kwargs)


def make_vuln(title: str = "Test Vuln", host_ip: str = "10.0.0.1", **kwargs) -> VulnInfo:
    return VulnInfo(title=title, host_ip=host_ip, **kwargs)


def make_session(session_id: str = "msf-1", host_ip: str = "10.0.0.1", **kwargs) -> SessionInfo:
    return SessionInfo(session_id=session_id, host_ip=host_ip,
                       session_type=kwargs.pop("session_type", "meterpreter"), **kwargs)


# ── PortInfo ──────────────────────────────────────────────────────────────────

class TestPortInfo:
    def test_defaults(self):
        p = PortInfo(number=80)
        assert p.number == 80
        assert p.state == "open"
        assert p.service == ""
        assert p.version == ""
        assert p.scripts == {}

    def test_to_dict(self):
        p = PortInfo(number=443, state="open", service="https", version="OpenSSL 1.1")
        d = p.to_dict()
        assert d["number"] == 443
        assert d["service"] == "https"
        assert d["version"] == "OpenSSL 1.1"

    def test_from_dict_roundtrip(self):
        p = PortInfo(number=22, state="open", service="ssh", version="OpenSSH 8.9")
        restored = PortInfo.from_dict(p.to_dict())
        assert restored.number == p.number
        assert restored.service == p.service


# ── HostInfo ──────────────────────────────────────────────────────────────────

class TestHostInfo:
    def test_defaults(self):
        h = HostInfo(ip="10.0.0.1")
        assert h.ip == "10.0.0.1"
        assert h.hostname == ""
        assert h.os_type == ""
        assert h.ports == []
        assert h.compromise_level == 0

    def test_with_ports(self):
        p = PortInfo(number=80, service="http")
        h = HostInfo(ip="10.0.0.1", ports=[p])
        assert h.ports[0].number == 80

    def test_open_ports(self):
        h = HostInfo(ip="10.0.0.1", ports=[
            PortInfo(number=80, state="open"),
            PortInfo(number=8080, state="filtered"),
        ])
        assert len(h.open_ports()) == 1
        assert h.open_ports()[0].number == 80

    def test_get_port(self):
        h = HostInfo(ip="10.0.0.1", ports=[PortInfo(number=80)])
        assert h.get_port(80) is not None
        assert h.get_port(443) is None

    def test_upsert_port_adds(self):
        h = HostInfo(ip="10.0.0.1")
        h.upsert_port(PortInfo(number=80))
        assert len(h.ports) == 1

    def test_upsert_port_updates(self):
        h = HostInfo(ip="10.0.0.1", ports=[PortInfo(number=80, service="http")])
        h.upsert_port(PortInfo(number=80, service="nginx"))
        assert len(h.ports) == 1
        assert h.ports[0].service == "nginx"

    def test_to_dict(self):
        h = HostInfo(ip="10.0.0.1", hostname="web01", os_type="Linux")
        d = h.to_dict()
        assert d["ip"] == "10.0.0.1"
        assert d["hostname"] == "web01"
        assert d["os_type"] == "Linux"


# ── VulnInfo ──────────────────────────────────────────────────────────────────

class TestVulnInfo:
    def test_defaults(self):
        v = VulnInfo(title="Log4Shell", host_ip="10.0.0.1")
        assert v.cvss == 0.0
        assert v.cve_id == ""
        assert v.exploit_path == ""

    def test_to_dict(self):
        v = VulnInfo(title="Log4Shell", host_ip="10.0.0.1", cve_id="CVE-2021-44228", cvss=10.0)
        d = v.to_dict()
        assert d["cve_id"] == "CVE-2021-44228"
        assert d["cvss"] == 10.0


# ── SessionInfo ───────────────────────────────────────────────────────────────

class TestSessionInfo:
    def test_defaults(self):
        s = SessionInfo(session_id="msf-1", host_ip="10.0.0.1", session_type="meterpreter")
        assert s.privilege_level == 0
        assert s.username == ""
        assert s.status == "active"

    def test_to_dict(self):
        s = SessionInfo(session_id="msf-1", host_ip="10.0.0.1",
                        session_type="meterpreter", username="root", privilege_level=3)
        d = s.to_dict()
        assert d["session_id"] == "msf-1"
        assert d["privilege_level"] == 3


# ── MissionBrief new flags ────────────────────────────────────────────────────

class TestMissionBriefNewFlags:
    def test_new_flags_exist_and_default_false(self):
        brief = MissionBrief()
        assert hasattr(brief, "allow_persistence")
        assert hasattr(brief, "allow_credential_harvest")
        assert hasattr(brief, "allow_data_exfil")
        assert brief.allow_persistence is False
        assert brief.allow_credential_harvest is False
        assert brief.allow_data_exfil is False

    def test_new_flags_can_be_set(self):
        brief = MissionBrief(allow_persistence=True, allow_credential_harvest=True,
                              allow_data_exfil=True)
        assert brief.allow_persistence is True
        assert brief.allow_credential_harvest is True
        assert brief.allow_data_exfil is True


# ── MissionContext construction ───────────────────────────────────────────────

class TestMissionContextConstruction:
    def test_from_mission_brief_defaults(self):
        ctx = make_context()
        assert ctx.mission_id == "test-mission-01"
        assert ctx.allow_exploitation is False
        assert ctx.allow_post_exploitation is False
        assert ctx.allow_lateral_movement is False
        assert ctx.allow_persistence is False
        assert ctx.allow_credential_harvest is False
        assert ctx.allow_data_exfil is False

    def test_from_mission_brief_with_flags(self):
        ctx = make_context(
            allow_exploitation=True,
            allow_post_exploitation=True,
            allow_persistence=True,
            allow_credential_harvest=True,
            allow_data_exfil=True,
        )
        assert ctx.allow_exploitation is True
        assert ctx.allow_post_exploitation is True
        assert ctx.allow_persistence is True
        assert ctx.allow_credential_harvest is True
        assert ctx.allow_data_exfil is True

    def test_phase_defaults_to_osint(self):
        ctx = make_context()
        assert ctx.phase == "OSINT"

    def test_empty_collections(self):
        ctx = make_context()
        assert ctx.hosts == {}
        assert ctx.vulnerabilities == []
        assert ctx.active_sessions == []
        assert ctx.credentials == []
        assert ctx.loot == []
        assert ctx.domains == []

    def test_attack_graph_has_attacker_node(self):
        ctx = make_context()
        node = ctx.attack_graph.get_node("attacker")
        assert node is not None
        assert node.node_type == "attacker"


# ── Thread-safe writes ────────────────────────────────────────────────────────

class TestMissionContextWrites:
    def test_update_host_creates_new(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1", hostname="web01", os_type="Linux")))
        assert "10.0.0.1" in ctx.hosts
        assert ctx.hosts["10.0.0.1"].hostname == "web01"

    def test_update_host_merges_existing_keeps_higher_compromise(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1", compromise_level=2)))
        run(ctx.update_host(HostInfo(ip="10.0.0.1", compromise_level=1)))
        assert ctx.hosts["10.0.0.1"].compromise_level == 2

    def test_update_host_merges_ports(self):
        ctx = make_context()
        h1 = HostInfo(ip="10.0.0.1", ports=[PortInfo(number=80)])
        h2 = HostInfo(ip="10.0.0.1", ports=[PortInfo(number=443)])
        run(ctx.update_host(h1))
        run(ctx.update_host(h2))
        port_numbers = {p.number for p in ctx.hosts["10.0.0.1"].ports}
        assert 80 in port_numbers
        assert 443 in port_numbers

    def test_update_host_adds_to_ip_addresses(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1")))
        assert "10.0.0.1" in ctx.ip_addresses

    def test_update_host_syncs_attack_graph(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1", hostname="web01")))
        node = ctx.attack_graph.get_node("10.0.0.1")
        assert node is not None
        assert node.hostname == "web01"

    def test_add_vulnerability(self):
        ctx = make_context()
        v = VulnInfo(title="Log4Shell", host_ip="10.0.0.1", cve_id="CVE-2021-44228", cvss=10.0)
        run(ctx.add_vulnerability(v))
        assert len(ctx.vulnerabilities) == 1

    def test_add_vulnerability_deduplicates_by_title_and_host(self):
        ctx = make_context()
        v = VulnInfo(title="Log4Shell", host_ip="10.0.0.1")
        run(ctx.add_vulnerability(v))
        run(ctx.add_vulnerability(v))
        assert len(ctx.vulnerabilities) == 1

    def test_add_session(self):
        ctx = make_context()
        s = SessionInfo(session_id="msf-1", host_ip="10.0.0.1", session_type="meterpreter",
                        username="root", privilege_level=3)
        run(ctx.update_host(HostInfo(ip="10.0.0.1")))
        run(ctx.add_session(s))
        assert len(ctx.active_sessions) == 1

    def test_add_session_updates_host_compromise_level(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1", compromise_level=0)))
        s = SessionInfo(session_id="msf-1", host_ip="10.0.0.1",
                        session_type="meterpreter", privilege_level=3)
        run(ctx.add_session(s))
        assert ctx.hosts["10.0.0.1"].compromise_level == 3

    def test_add_session_replaces_same_host_type(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1")))
        s1 = SessionInfo(session_id="msf-1", host_ip="10.0.0.1", session_type="meterpreter")
        s2 = SessionInfo(session_id="msf-2", host_ip="10.0.0.1", session_type="meterpreter")
        run(ctx.add_session(s1))
        run(ctx.add_session(s2))
        assert len(ctx.active_sessions) == 1
        assert ctx.active_sessions[0].session_id == "msf-2"

    def test_add_session_creates_exploit_edge(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1")))
        run(ctx.add_session(SessionInfo(session_id="msf-1", host_ip="10.0.0.1",
                                        session_type="meterpreter")))
        edges = [e for e in ctx.attack_graph.edges
                 if e.from_node == "attacker" and e.to_node == "10.0.0.1"]
        assert len(edges) == 1

    def test_remove_session(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1")))
        run(ctx.add_session(SessionInfo(session_id="msf-1", host_ip="10.0.0.1",
                                        session_type="meterpreter")))
        run(ctx.remove_session("msf-1"))
        assert ctx.active_sessions == []

    def test_add_credential(self):
        ctx = make_context()
        c = HarvestedCredential(source_host="10.0.0.1", username="root",
                                 password="s3cr3t", credential_type="plaintext")
        run(ctx.add_credential(c))
        assert len(ctx.credentials) == 1

    def test_add_loot(self):
        ctx = make_context()
        item = LootItem(source_host="10.0.0.1", loot_type="file",
                        file_path="/etc/shadow", content="root:$6$...")
        run(ctx.add_loot(item))
        assert len(ctx.loot) == 1

    def test_add_domain(self):
        ctx = make_context()
        run(ctx.add_domain("example.com"))
        run(ctx.add_domain("example.com"))  # duplicate
        assert ctx.domains == ["example.com"]

    def test_add_subdomain(self):
        ctx = make_context()
        run(ctx.add_subdomain("www.example.com"))
        assert "www.example.com" in ctx.subdomains

    def test_add_email(self):
        ctx = make_context()
        run(ctx.add_email("admin@example.com"))
        assert "admin@example.com" in ctx.emails

    def test_set_phase(self):
        ctx = make_context()
        run(ctx.set_phase("exploitation"))
        assert ctx.phase == "exploitation"

    def test_mark_task_done(self):
        ctx = make_context()
        run(ctx.mark_task_done("scan-10.0.0.1"))
        run(ctx.mark_task_done("scan-10.0.0.1"))  # duplicate
        assert ctx.completed_tasks == ["scan-10.0.0.1"]

    def test_update_agent_status(self):
        ctx = make_context()
        status = AgentStatus(agent_id="scanner-1", agent_type="scanner",
                              status="running", current_task="10.0.0.1")
        run(ctx.update_agent_status(status))
        assert "scanner-1" in ctx.active_agents
        assert ctx.active_agents["scanner-1"].status == "running"

    def test_remove_agent(self):
        ctx = make_context()
        run(ctx.update_agent_status(AgentStatus(agent_id="scanner-1", agent_type="scanner")))
        run(ctx.remove_agent("scanner-1"))
        assert "scanner-1" not in ctx.active_agents

    def test_add_lateral_edge(self):
        ctx = make_context()
        run(ctx.add_lateral_edge("10.0.0.1", "10.0.0.2", "ssh pivot"))
        lateral_edges = [e for e in ctx.attack_graph.edges if e.edge_type == "lateral"]
        assert len(lateral_edges) == 1
        assert lateral_edges[0].from_node == "10.0.0.1"
        assert lateral_edges[0].to_node == "10.0.0.2"

    def test_set_environment_type(self):
        ctx = make_context()
        run(ctx.set_environment_type("corporate_ad"))
        assert ctx.environment_type == "corporate_ad"


# ── Attack graph ──────────────────────────────────────────────────────────────

class TestAttackGraph:
    def test_empty_graph(self):
        g = AttackGraph()
        assert g.nodes == []
        assert g.edges == []

    def test_upsert_node_adds(self):
        g = AttackGraph()
        g.upsert_node(AttackNode(id="10.0.0.1", ip="10.0.0.1"))
        assert len(g.nodes) == 1

    def test_upsert_node_updates(self):
        g = AttackGraph()
        g.upsert_node(AttackNode(id="10.0.0.1", ip="10.0.0.1", hostname=""))
        g.upsert_node(AttackNode(id="10.0.0.1", ip="10.0.0.1", hostname="web01"))
        assert len(g.nodes) == 1
        assert g.nodes[0].hostname == "web01"

    def test_get_node(self):
        g = AttackGraph()
        g.upsert_node(AttackNode(id="10.0.0.1", ip="10.0.0.1"))
        assert g.get_node("10.0.0.1") is not None
        assert g.get_node("10.0.0.2") is None

    def test_add_edge(self):
        g = AttackGraph()
        g.add_edge(AttackEdge(from_node="attacker", to_node="10.0.0.1", edge_type="exploit"))
        assert len(g.edges) == 1

    def test_add_edge_deduplicates(self):
        g = AttackGraph()
        e = AttackEdge(from_node="attacker", to_node="10.0.0.1", edge_type="exploit")
        g.add_edge(e)
        g.add_edge(e)
        assert len(g.edges) == 1

    def test_to_dict(self):
        g = AttackGraph()
        g.upsert_node(AttackNode(id="10.0.0.1", ip="10.0.0.1"))
        g.add_edge(AttackEdge(from_node="attacker", to_node="10.0.0.1", edge_type="exploit"))
        d = g.to_dict()
        assert len(d["nodes"]) == 1
        assert len(d["edges"]) == 1


# ── Serialization ─────────────────────────────────────────────────────────────

class TestMissionContextSerialization:
    def test_to_dict_keys(self):
        ctx = make_context()
        d = ctx.to_dict()
        for key in ("mission_id", "phase", "hosts", "vulnerabilities",
                    "active_sessions", "domains", "active_agents",
                    "attack_graph", "permissions"):
            assert key in d, f"Missing key: {key}"

    def test_to_dict_does_not_expose_raw_credentials(self):
        """credentials list must not appear in to_dict — only count."""
        ctx = make_context()
        c = HarvestedCredential(source_host="10.0.0.1", username="root",
                                 password="s3cr3t", credential_type="plaintext")
        run(ctx.add_credential(c))
        d = ctx.to_dict()
        # Should expose count only, not raw list
        assert "credentials" not in d
        assert d.get("credentials_count") == 1

    def test_to_dict_permissions_block(self):
        ctx = make_context(allow_exploitation=True, allow_credential_harvest=True)
        perms = ctx.to_dict()["permissions"]
        assert perms["allow_exploitation"] is True
        assert perms["allow_credential_harvest"] is True
        assert perms["allow_persistence"] is False

    def test_to_summary_is_string(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="10.0.0.1", hostname="web01")))
        s = ctx.to_summary()
        assert isinstance(s, str)
        assert "10.0.0.1" in s

    def test_to_summary_shows_vuln_info(self):
        ctx = make_context()
        run(ctx.add_vulnerability(VulnInfo(title="Test", host_ip="10.0.0.1", cvss=9.0)))
        s = ctx.to_summary()
        assert "VULN" in s.upper()

    def test_to_summary_shows_permissions(self):
        ctx = make_context(allow_exploitation=True, allow_persistence=True)
        s = ctx.to_summary()
        assert "exploitation" in s

    def test_to_dict_includes_hosts(self):
        ctx = make_context()
        run(ctx.update_host(HostInfo(ip="192.168.1.1", hostname="dc01")))
        d = ctx.to_dict()
        assert "192.168.1.1" in d["hosts"]

    def test_to_dict_attack_graph(self):
        ctx = make_context()
        run(ctx.add_lateral_edge("10.0.0.1", "10.0.0.2", "smb"))
        d = ctx.to_dict()
        lateral_edges = [e for e in d["attack_graph"]["edges"]
                         if e["edge_type"] == "lateral"]
        assert len(lateral_edges) == 1

    def test_to_dict_loot_count(self):
        ctx = make_context()
        run(ctx.add_loot(LootItem(source_host="10.0.0.1", loot_type="file")))
        run(ctx.add_loot(LootItem(source_host="10.0.0.1", loot_type="data")))
        d = ctx.to_dict()
        assert d["loot_count"] == 2


# ── Concurrency ───────────────────────────────────────────────────────────────

class TestMissionContextConcurrency:
    def test_concurrent_host_updates(self):
        """Multiple coroutines writing simultaneously must not corrupt state."""
        ctx = make_context()

        async def spam():
            for i in range(20):
                await ctx.update_host(HostInfo(ip=f"10.0.0.{i}", hostname=f"host{i}"))

        async def run_concurrent():
            await asyncio.gather(spam(), spam(), spam())

        asyncio.get_event_loop().run_until_complete(run_concurrent())
        assert len(ctx.hosts) == 20

    def test_concurrent_vuln_adds(self):
        ctx = make_context()

        async def add_vulns():
            for i in range(10):
                v = VulnInfo(title=f"Vuln-{i}", host_ip="10.0.0.1",
                              cve_id=f"CVE-2021-{i}")
                await ctx.add_vulnerability(v)

        async def run_concurrent():
            await asyncio.gather(add_vulns(), add_vulns())

        asyncio.get_event_loop().run_until_complete(run_concurrent())
        # Deduplication: 10 unique titles
        assert len(ctx.vulnerabilities) == 10
