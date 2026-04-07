"""
Shared tool-registry bootstrap.

This module centralizes tool registration for both terminal mode (main.py)
and web mode (web/app.py) so the available tool set is consistent.
"""

from __future__ import annotations

from pathlib import Path

from core.tool_registry import ToolRegistry
from tools.nmap_tool import NmapTool
from tools.searchsploit_tool import SearchSploitTool
from tools.metasploit_tool import MetasploitTool
from tools.ssh_tool import SSHTool
from tools.shell_session_tool import ShellSessionTool
from tools.local_exec_tool import LocalExecTool


def build_tool_registry(
    *,
    include_extended: bool = True,
    load_plugins: bool = True,
    plugins_dir: Path | None = None,
) -> ToolRegistry:
    """
    Build and return a ToolRegistry with the standard TIRPAN toolset.

    Parameters
    ----------
    include_extended:
        When True, registers the full V2 extended toolset.
    load_plugins:
        When True, load plugin tools from plugins_dir.
    plugins_dir:
        Optional plugin directory override.
    """
    registry = ToolRegistry()

    # Core tools
    registry.register(NmapTool())
    registry.register(SearchSploitTool())
    registry.register(MetasploitTool())
    registry.register(SSHTool())
    registry.register(ShellSessionTool())
    registry.register(LocalExecTool())

    if include_extended:
        from tools.masscan_tool import MasscanTool
        from tools.nuclei_tool import NucleiTool
        from tools.ffuf_tool import FfufTool
        from tools.whatweb_tool import WhatWebTool
        from tools.nikto_tool import NiktoTool
        from tools.theharvester_tool import TheHarvesterTool
        from tools.subfinder_tool import SubfinderTool
        from tools.whois_tool import WhoisTool
        from tools.dns_tool import DnsTool
        from tools.crackmapexec_tool import CrackMapExecTool
        from tools.impacket_tool import ImpacketTool
        from tools.report_finding_tool import ReportFindingTool
        from tools.generate_report_tool import GenerateReportTool
        from tools.rsh_tool import RshTool
        from tools.distcc_tool import DistccTool
        from tools.webdav_tool import WebDavTool
        from tools.smb_enum_tool import SmbEnumTool
        from tools.telnet_tool import TelnetTool
        # Web pentest & brute-force tools
        from tools.hydra_tool import HydraTool
        from tools.sqlmap_tool import SqlmapTool
        from tools.wpscan_tool import WPScanTool
        from tools.hashcat_tool import HashcatTool
        from tools.commix_tool import CommixTool
        from tools.john_tool import JohnTool
        from tools.gobuster_tool import GobusterTool
        from tools.arjun_tool import ArjunTool

        for tool in (
            MasscanTool(),
            NucleiTool(),
            FfufTool(),
            WhatWebTool(),
            NiktoTool(),
            TheHarvesterTool(),
            SubfinderTool(),
            WhoisTool(),
            DnsTool(),
            CrackMapExecTool(),
            ImpacketTool(),
            ReportFindingTool(),
            GenerateReportTool(),
            RshTool(),
            DistccTool(),
            WebDavTool(),
            SmbEnumTool(),
            TelnetTool(),
            HydraTool(),
            SqlmapTool(),
            WPScanTool(),
            HashcatTool(),
            CommixTool(),
            JohnTool(),
            GobusterTool(),
            ArjunTool(),
        ):
            registry.register(tool)

    if load_plugins:
        registry.load_plugins(plugins_dir or Path("plugins/"))

    return registry
