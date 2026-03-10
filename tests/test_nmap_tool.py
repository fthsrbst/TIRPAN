"""
Phase 3 — NmapTool unit tests (mocked subprocess)
Run: python -m pytest tests/test_nmap_tool.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from tools.base_tool import ToolMetadata
from tools.nmap_tool import NmapTool

# ── Örnek nmap XML çıktıları ──────────────────────────────────────────────────

PING_XML = """<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.0.1" addrtype="ipv4"/>
    <hostnames><hostname name="router.local"/></hostnames>
    <ports/>
  </host>
  <host>
    <status state="down"/>
    <address addr="10.0.0.2" addrtype="ipv4"/>
    <hostnames/>
    <ports/>
  </host>
</nmaprun>"""

SERVICE_XML = """<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.0.5" addrtype="ipv4"/>
    <hostnames/>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open"/>
        <service name="ssh" product="OpenSSH" version="8.4"/>
      </port>
      <port protocol="tcp" portid="80">
        <state state="open"/>
        <service name="http" product="Apache" version="2.4.51"/>
      </port>
      <port protocol="tcp" portid="443">
        <state state="closed"/>
        <service name="https"/>
      </port>
    </ports>
  </host>
</nmaprun>"""

OS_XML = """<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.0.10" addrtype="ipv4"/>
    <hostnames/>
    <ports/>
    <os>
      <osmatch name="Linux 4.15" accuracy="95"/>
    </os>
  </host>
</nmaprun>"""

EMPTY_XML = """<?xml version="1.0"?>
<nmaprun>
</nmaprun>"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_proc(stdout: str, returncode: int = 0):
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout.encode(), b""))
    return proc


# ── BaseTool contract ─────────────────────────────────────────────────────────

class TestBaseTool:
    def test_metadata_type(self):
        tool = NmapTool()
        assert isinstance(tool.metadata, ToolMetadata)

    def test_metadata_fields(self):
        tool = NmapTool()
        m = tool.metadata
        assert m.name == "nmap_scan"
        assert m.category == "recon"
        assert "target" in m.parameters["properties"]

    def test_to_llm_dict(self):
        tool = NmapTool()
        d = tool.to_llm_dict()
        assert d["name"] == "nmap_scan"
        assert "description" in d
        assert "parameters" in d


# ── Validate ──────────────────────────────────────────────────────────────────

class TestNmapValidate:
    @pytest.mark.asyncio
    async def test_missing_target(self):
        tool = NmapTool()
        ok, msg = await tool.validate({})
        assert ok is False
        assert "target" in msg

    @pytest.mark.asyncio
    async def test_invalid_scan_type(self):
        tool = NmapTool()
        ok, msg = await tool.validate({"target": "10.0.0.1", "scan_type": "hack"})
        assert ok is False

    @pytest.mark.asyncio
    async def test_valid_params(self):
        tool = NmapTool()
        ok, msg = await tool.validate({"target": "10.0.0.1", "scan_type": "service"})
        assert ok is True


# ── Command builder ───────────────────────────────────────────────────────────

class TestBuildCommand:
    def test_ping_command(self):
        tool = NmapTool()
        cmd = tool._build_command("10.0.0.0/24", "ping", "1-1024")
        assert "-sn" in cmd
        assert "10.0.0.0/24" in cmd

    def test_service_command(self):
        tool = NmapTool()
        cmd = tool._build_command("10.0.0.1", "service", "1-1024")
        assert "-sV" in cmd
        assert "-p" in cmd

    def test_os_command(self):
        tool = NmapTool()
        cmd = tool._build_command("10.0.0.1", "os", "1-1024")
        assert "-O" in cmd

    def test_full_command(self):
        tool = NmapTool()
        cmd = tool._build_command("10.0.0.1", "full", "1-65535")
        assert "-sV" in cmd
        assert "-O" in cmd

    def test_xml_flag(self):
        tool = NmapTool()
        cmd = tool._build_command("10.0.0.1", "service", "80")
        assert "-oX" in cmd
        assert "-" in cmd  # stdout


# ── XML Parse ─────────────────────────────────────────────────────────────────

class TestParseXML:
    def test_ping_scan_parses_hosts(self):
        tool = NmapTool()
        result = tool._parse_xml(PING_XML, "10.0.0.0/24", "ping", 1.5)
        assert len(result.hosts) == 2
        assert result.live_hosts[0].ip == "10.0.0.1"
        assert result.live_hosts[0].hostname == "router.local"
        assert len(result.live_hosts) == 1

    def test_service_scan_parses_ports(self):
        tool = NmapTool()
        result = tool._parse_xml(SERVICE_XML, "10.0.0.5", "service", 2.0)
        host = result.hosts[0]
        assert host.ip == "10.0.0.5"
        assert len(host.ports) == 3
        assert len(host.open_ports) == 2
        ssh = next(p for p in host.open_ports if p.number == 22)
        assert ssh.service == "ssh"
        assert "OpenSSH" in ssh.version

    def test_os_scan_parses_os(self):
        tool = NmapTool()
        result = tool._parse_xml(OS_XML, "10.0.0.10", "os", 3.0)
        host = result.hosts[0]
        assert "Linux" in host.os
        assert host.os_accuracy == 95

    def test_empty_scan(self):
        tool = NmapTool()
        result = tool._parse_xml(EMPTY_XML, "10.0.0.1", "ping", 0.5)
        assert result.hosts == []

    def test_duration_stored(self):
        tool = NmapTool()
        result = tool._parse_xml(PING_XML, "10.0.0.0/24", "ping", 4.567)
        assert result.duration_seconds == 4.57


# ── Execute (mocked subprocess) ───────────────────────────────────────────────

class TestExecute:
    @pytest.mark.asyncio
    async def test_execute_success(self):
        tool = NmapTool()
        with patch("asyncio.create_subprocess_exec", return_value=make_proc(SERVICE_XML)):
            result = await tool.execute({"target": "10.0.0.5", "scan_type": "service"})

        assert result["success"] is True
        assert result["error"] is None
        assert len(result["output"]["hosts"]) == 1

    @pytest.mark.asyncio
    async def test_execute_missing_target(self):
        tool = NmapTool()
        result = await tool.execute({})
        assert result["success"] is False
        assert "target" in result["error"]

    @pytest.mark.asyncio
    async def test_execute_nmap_not_found(self):
        tool = NmapTool()
        with patch("asyncio.create_subprocess_exec", side_effect=FileNotFoundError):
            result = await tool.execute({"target": "10.0.0.1"})
        assert result["success"] is False
        assert "nmap not found" in result["error"]

    @pytest.mark.asyncio
    async def test_execute_timeout(self):
        import asyncio as _asyncio
        tool = NmapTool()
        with patch("asyncio.create_subprocess_exec", return_value=make_proc(SERVICE_XML)):
            with patch("asyncio.wait_for", side_effect=_asyncio.TimeoutError):
                result = await tool.execute({"target": "10.0.0.1"})
        assert result["success"] is False
        assert "timed out" in result["error"]
