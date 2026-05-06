"""
Shared tool-registry bootstrap.

This module centralizes tool registration for both terminal mode (main.py)
and web mode (web/app.py) so the available tool set is consistent.
"""

from __future__ import annotations

import logging
from pathlib import Path

from core.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

try:
    from tools.nmap_tool import NmapTool
except ImportError as _e:
    logger.warning("Core tool NmapTool failed to import: %s", _e)
    NmapTool = None  # type: ignore[assignment,misc]

try:
    from tools.searchsploit_tool import SearchSploitTool
except ImportError as _e:
    logger.warning("Core tool SearchSploitTool failed to import: %s", _e)
    SearchSploitTool = None  # type: ignore[assignment,misc]

try:
    from tools.metasploit_tool import MetasploitTool
except ImportError as _e:
    logger.warning("Core tool MetasploitTool failed to import: %s", _e)
    MetasploitTool = None  # type: ignore[assignment,misc]

try:
    from tools.ssh_tool import SSHTool
except ImportError as _e:
    logger.warning("Core tool SSHTool failed to import: %s", _e)
    SSHTool = None  # type: ignore[assignment,misc]

try:
    from tools.shell_session_tool import ShellSessionTool
except ImportError as _e:
    logger.warning("Core tool ShellSessionTool failed to import: %s", _e)
    ShellSessionTool = None  # type: ignore[assignment,misc]

try:
    from tools.local_exec_tool import LocalExecTool
except ImportError as _e:
    logger.warning("Core tool LocalExecTool failed to import: %s", _e)
    LocalExecTool = None  # type: ignore[assignment,misc]


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
    for _cls in (NmapTool, SearchSploitTool, MetasploitTool, SSHTool, ShellSessionTool, LocalExecTool):
        if _cls is not None:
            registry.register(_cls())

    if include_extended:
        _extended_modules = [
            ("tools.masscan_tool", "MasscanTool"),
            ("tools.nuclei_tool", "NucleiTool"),
            ("tools.ffuf_tool", "FfufTool"),
            ("tools.whatweb_tool", "WhatWebTool"),
            ("tools.nikto_tool", "NiktoTool"),
            ("tools.theharvester_tool", "TheHarvesterTool"),
            ("tools.subfinder_tool", "SubfinderTool"),
            ("tools.whois_tool", "WhoisTool"),
            ("tools.dns_tool", "DnsTool"),
            ("tools.crackmapexec_tool", "CrackMapExecTool"),
            ("tools.impacket_tool", "ImpacketTool"),
            ("tools.report_finding_tool", "ReportFindingTool"),
            ("tools.generate_report_tool", "GenerateReportTool"),
            ("tools.rsh_tool", "RshTool"),
            ("tools.distcc_tool", "DistccTool"),
            ("tools.webdav_tool", "WebDavTool"),
            ("tools.smb_enum_tool", "SmbEnumTool"),
            ("tools.telnet_tool", "TelnetTool"),
            ("tools.hydra_tool", "HydraTool"),
            ("tools.sqlmap_tool", "SqlmapTool"),
            ("tools.wpscan_tool", "WPScanTool"),
            ("tools.hashcat_tool", "HashcatTool"),
            ("tools.commix_tool", "CommixTool"),
            ("tools.john_tool", "JohnTool"),
            ("tools.gobuster_tool", "GobusterTool"),
            ("tools.arjun_tool", "ArjunTool"),
            ("tools.ddos_tool", "DDoSTool"),
        ]
        import importlib as _importlib
        for _mod_name, _cls_name in _extended_modules:
            try:
                _mod = _importlib.import_module(_mod_name)
                _cls = getattr(_mod, _cls_name)
                registry.register(_cls())
            except ImportError as _e:
                logger.warning("Extended tool %s failed to import: %s", _cls_name, _e)
            except Exception as _e:
                logger.warning("Extended tool %s failed to load: %s", _cls_name, _e)

    if load_plugins:
        registry.load_plugins(plugins_dir or Path("plugins/"))

    return registry
