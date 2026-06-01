"""Tests for core/operation_signature.py — coverage signatures.

Replays the session test1 repetition to prove the signature collapses
zero-information-gain repeats while keeping genuinely distinct work distinct.
Pure functions — no event loop needed.
"""

from __future__ import annotations

from core.operation_signature import (
    ACTION,
    CHARACTERIZATION,
    PROGRESSIVE,
    derive_signature,
)


def sig(**kw) -> str:
    return derive_signature(**kw).signature


# ── test1 repetition: same (host,port) re-enumerated under renamed tasks ──────

def test_exact_duplicate_collapses():
    """smb_enum_445 spawned twice verbatim → identical signature (the bug)."""
    a = derive_signature(
        agent_type="scanner", target="192.168.1.4", task_type="smb_enum_445",
        options={"ports": "445", "nse_scripts": "smb-enum-shares,smb-enum-users"},
    )
    b = derive_signature(
        agent_type="scanner", target="192.168.1.4", task_type="smb_enum_445",
        options={"ports": "445", "nse_scripts": "smb-enum-shares,smb-enum-users"},
    )
    assert a.signature == b.signature
    assert a.op_class == CHARACTERIZATION


def test_renamed_same_coverage_collapses():
    """Different task_type, identical scripts/port → same signature."""
    a = sig(agent_type="scanner", target="192.168.1.4", task_type="smb_enum_445",
            options={"ports": "445", "nse_scripts": "smb-enum-shares"})
    b = sig(agent_type="scanner", target="192.168.1.4", task_type="smb_shares_445_v2",
            options={"ports": "445", "nse_scripts": "smb-enum-shares"})
    assert a == b


def test_enum_vs_version_are_distinct():
    """enum and version are both characterization but different info → distinct."""
    enum = derive_signature(agent_type="scanner", target="192.168.1.4",
                            task_type="smb_enum_445", options={"ports": "445"})
    ver = derive_signature(agent_type="scanner", target="192.168.1.4",
                           task_type="smb_version_445", options={"ports": "445"})
    assert enum.signature != ver.signature
    assert enum.kind == "service_enum"
    assert ver.kind == "version_detect"


def test_brute_is_action_not_characterization():
    """vnc_brute / ssh_brute must classify as ACTION (own lane, bounded)."""
    for tt, port, script in [
        ("vnc_brute_5900", "5900", "vnc-brute"),
        ("ssh_brute_22", "22", "ssh-brute"),
    ]:
        s = derive_signature(agent_type="scanner", target="192.168.1.4",
                             task_type=tt, options={"ports": port, "nse_scripts": script})
        assert s.kind == "cred_bruteforce", tt
        assert s.op_class == ACTION, tt


def test_different_ports_are_distinct():
    """VNC:5900 vs SMB:445 on the same host → different signatures."""
    vnc = sig(agent_type="scanner", target="192.168.1.4", task_type="vnc_enum_5900",
              options={"ports": "5900"})
    smb = sig(agent_type="scanner", target="192.168.1.4", task_type="smb_enum_445",
              options={"ports": "445"})
    assert vnc != smb


def test_different_hosts_are_distinct():
    a = sig(agent_type="scanner", target="192.168.1.4", task_type="smb_enum_445",
            options={"ports": "445"})
    b = sig(agent_type="scanner", target="192.168.1.1", task_type="smb_enum_445",
            options={"ports": "445"})
    assert a != b


# ── hybrid: structured operation field overrides parsing ──────────────────────

def test_structured_operation_wins():
    s = derive_signature(
        agent_type="scanner", target="192.168.1.4", task_type="anything_here",
        options={},
        operation={"kind": "vuln_scan", "port": 445, "scripts": ["smb-vuln-ms17-010"]},
    )
    assert s.kind == "vuln_scan"
    assert s.op_class == CHARACTERIZATION
    assert s.port == 445
    assert "smb-vuln-ms17-010" in s.scripts


# ── URL / CIDR targets ────────────────────────────────────────────────────────

def test_url_target_resolves_host_and_port():
    s = derive_signature(agent_type="webapp", target="http://192.168.1.4:53734",
                         task_type="web_scan_53734", options={"port": 53734})
    assert s.host == "192.168.1.4"
    assert s.port == 53734
    assert s.op_class == CHARACTERIZATION


def test_exploit_is_action():
    s = derive_signature(agent_type="exploit", target="192.168.1.4",
                         task_type="exploit_tomcat_53734",
                         options={"port": 53734, "module": "exploit/multi/http/tomcat"})
    assert s.op_class == ACTION
    assert s.kind == "exploit"


def test_subnet_portscan_is_characterization():
    s = derive_signature(agent_type="scanner", target="192.168.1.0/24",
                         task_type="tcp_scan", options={"ports": "top1000"})
    assert s.host == "192.168.1.0/24"
    assert s.op_class == CHARACTERIZATION
