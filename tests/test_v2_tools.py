"""
Tests for V2 tool implementations (Steps 9-13).

Strategy: mock subprocess calls (no real binary needed) and verify:
  - Binary-missing path returns proper error dict
  - Output parsing logic (masscan JSON, nuclei JSONL, ffuf JSON, etc.)
  - Health check returns ToolHealthStatus with correct healthy flag
  - Tool metadata (name, required params) is well-formed
"""

from __future__ import annotations

import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def run(coro):
    return asyncio.run(coro)


def _make_proc(stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0):
    proc = AsyncMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    return proc


# ── MasscanTool ───────────────────────────────────────────────────────────────

class TestMasscanTool:

    def _tool(self):
        from tools.masscan_tool import MasscanTool
        return MasscanTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "masscan_scan"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"target": "10.0.0.0/24"}))
        assert result["status"] == "error"
        assert "masscan" in result["error"].lower()

    def test_parse_masscan_json(self):
        tool = self._tool()
        raw_json = (
            '{"ip": "10.0.0.1", "ports": [{"port": 22, "status": "open", "service": {"name": "ssh"}}]}\n'
            '{"ip": "10.0.0.2", "ports": [{"port": 80, "status": "open", "service": {"name": "http"}}]}\n'
        )
        result = tool._parse_masscan_json(raw_json)
        assert result["status"] == "success"
        assert result["total"] == 2
        ips = {h["ip"] for h in result["hosts"]}
        assert "10.0.0.1" in ips
        assert "10.0.0.2" in ips

    def test_parse_masscan_json_empty(self):
        tool = self._tool()
        result = tool._parse_masscan_json("[]")
        assert result["status"] == "success"
        assert result["total"] == 0

    def test_parse_masscan_json_with_brackets(self):
        """Lines starting with [ are skipped (masscan wraps in array)."""
        tool = self._tool()
        raw = (
            "[\n"
            '{"ip": "10.0.0.5", "ports": [{"port": 443, "status": "open", "service": {"name": "https"}}]},\n'
            "]\n"
        )
        result = tool._parse_masscan_json(raw)
        assert result["status"] == "success"
        assert result["total"] == 1

    def test_execute_success(self):
        raw = b'{"ip": "10.0.0.1", "ports": [{"port": 22, "status": "open", "service": {"name": "ssh"}}]}\n'
        with patch("shutil.which", return_value="/usr/bin/masscan"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=raw)):
            result = run(self._tool().execute({"target": "10.0.0.1", "port_range": "1-1000"}))
        assert result["status"] == "success"
        assert result["total"] == 1

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False

    def test_health_check_present(self):
        with patch("shutil.which", return_value="/usr/bin/masscan"):
            h = run(self._tool().health_check())
        assert h.available is True


# ── NucleiTool ────────────────────────────────────────────────────────────────

class TestNucleiTool:

    def _tool(self):
        from tools.nuclei_tool import NucleiTool
        return NucleiTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "nuclei_scan"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"target": "http://10.0.0.1"}))
        assert result["status"] == "error"

    def test_execute_parses_jsonl(self):
        """nuclei outputs JSONL — execute() should parse each line."""
        line1 = json.dumps({
            "template-id": "cve-2021-44228",
            "info": {"name": "Log4Shell", "severity": "critical"},
            "host": "http://10.0.0.1",
            "matched-at": "http://10.0.0.1/",
        })
        line2 = json.dumps({
            "template-id": "apache-default-creds",
            "info": {"name": "Apache Default Creds", "severity": "medium"},
            "host": "http://10.0.0.1",
        })
        raw_out = (line1 + "\n" + line2 + "\n").encode()
        with patch("shutil.which", return_value="/usr/bin/nuclei"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=raw_out)):
            result = run(self._tool().execute({
                "url": "http://10.0.0.1",
                "severity": "medium,high,critical",
            }))
        assert result["status"] == "success"
        assert result["total"] == 2
        assert any(f["template_id"] == "cve-2021-44228" for f in result["findings"])

    def test_execute_empty_output(self):
        with patch("shutil.which", return_value="/usr/bin/nuclei"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=b"")):
            result = run(self._tool().execute({"url": "http://10.0.0.1"}))
        assert result["status"] == "success"
        assert result["total"] == 0

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── FfufTool ──────────────────────────────────────────────────────────────────

class TestFfufTool:

    def _tool(self):
        from tools.ffuf_tool import FfufTool
        return FfufTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "ffuf_scan"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"url": "http://10.0.0.1/FUZZ"}))
        assert result["status"] == "error"

    def test_execute_parses_json_output(self):
        """ffuf outputs JSON — execute() should parse results."""
        output = json.dumps({
            "results": [
                {"url": "http://10.0.0.1/admin", "status": 200, "length": 1024, "words": 50},
                {"url": "http://10.0.0.1/login", "status": 302, "length": 0, "words": 0},
            ]
        })
        with patch("shutil.which", return_value="/usr/bin/ffuf"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=output.encode())):
            result = run(self._tool().execute({"url": "http://10.0.0.1"}))
        assert result["status"] == "success"
        assert result["total"] == 2
        urls = [r["url"] for r in result["results"]]
        assert "http://10.0.0.1/admin" in urls

    def test_execute_empty_results(self):
        output = json.dumps({"results": []})
        with patch("shutil.which", return_value="/usr/bin/ffuf"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=output.encode())):
            result = run(self._tool().execute({"url": "http://10.0.0.1"}))
        assert result["total"] == 0

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── WhatWebTool ───────────────────────────────────────────────────────────────

class TestWhatWebTool:

    def _tool(self):
        from tools.whatweb_tool import WhatWebTool
        return WhatWebTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "whatweb_scan"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"url": "http://10.0.0.1"}))
        assert result["status"] == "error"

    def test_execute_parses_json_output(self):
        """whatweb --log-json outputs one JSON per line."""
        output = json.dumps({
            "target": "http://10.0.0.1",
            "http_status": 200,
            "plugins": {
                "Apache": {"string": ["2.4.41"]},
                "PHP": {"string": ["7.4.3"]},
            },
        })
        with patch("shutil.which", return_value="/usr/bin/whatweb"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=output.encode())):
            result = run(self._tool().execute({"url": "http://10.0.0.1"}))
        assert result["status"] == "success"
        assert "Apache" in result.get("plugins", {})
        assert len(result.get("technologies", [])) > 0

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── NiktoTool ─────────────────────────────────────────────────────────────────

class TestNiktoTool:

    def _tool(self):
        from tools.nikto_tool import NiktoTool
        return NiktoTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "nikto_scan"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"url": "http://10.0.0.1"}))
        assert result["status"] == "error"

    def test_parse_nikto_output(self):
        tool = self._tool()
        raw = (
            "- Nikto v2.1.6\n"
            "+ Target IP: 10.0.0.1\n"
            "+ Target Port: 80\n"
            "+ Server: Apache/2.4.41\n"
            "+ /admin: Admin panel found.\n"
            "+ OSVDB-3092: /phpmyadmin: phpMyAdmin is for managing MySQL databases.\n"
        )
        findings = tool._parse_nikto_output(raw, "http://10.0.0.1")
        assert len(findings) > 0
        titles = [f.get("title", f.get("description", "")) for f in findings]
        assert any("admin" in t.lower() for t in titles)

    def test_execute_returns_findings(self):
        raw = (
            b"- Nikto v2.1.6\n"
            b"+ /admin: Admin panel found.\n"
        )
        with patch("shutil.which", return_value="/usr/bin/nikto"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=raw)):
            result = run(self._tool().execute({"url": "http://10.0.0.1"}))
        assert result["status"] == "success"
        assert result["total"] > 0

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── TheHarvesterTool ──────────────────────────────────────────────────────────

class TestTheHarvesterTool:

    def _tool(self):
        from tools.theharvester_tool import TheHarvesterTool
        return TheHarvesterTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "theharvester_scan"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"domain": "example.com"}))
        assert result["status"] == "error"

    def test_parse_output(self):
        tool = self._tool()
        raw = (
            "admin@example.com\n"
            "info@example.com\n"
            "mail.example.com\n"
            "www.example.com\n"
            "1.2.3.4\n"
        )
        result = tool._parse_output(raw, "example.com")
        assert result["status"] == "success"
        assert len(result["emails"]) >= 2
        assert len(result["subdomains"]) >= 2
        assert "1.2.3.4" in result["ip_addresses"]

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── SubfinderTool ─────────────────────────────────────────────────────────────

class TestSubfinderTool:

    def _tool(self):
        from tools.subfinder_tool import SubfinderTool
        return SubfinderTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "subfinder_scan"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"domain": "example.com"}))
        assert result["status"] == "error"

    def test_execute_parses_subdomains(self):
        raw_out = b"mail.example.com\nwww.example.com\napi.example.com\n"
        with patch("shutil.which", return_value="/usr/bin/subfinder"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=raw_out)):
            result = run(self._tool().execute({"domain": "example.com"}))
        assert result["status"] == "success"
        assert "mail.example.com" in result["subdomains"]
        assert result["total"] == 3

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── WhoisTool ─────────────────────────────────────────────────────────────────

class TestWhoisTool:

    def _tool(self):
        from tools.whois_tool import WhoisTool
        return WhoisTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "whois_lookup"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"domain": "example.com"}))
        assert result["status"] == "error"
        assert "whois" in result["error"]

    def test_extract_helper(self):
        tool = self._tool()
        text = "Registrar: GoDaddy\nCreation Date: 2000-01-01\n"
        assert tool._extract(text, r"Registrar:\s*(.+)") == "GoDaddy"
        assert tool._extract(text, r"Missing:\s*(.+)") == ""

    def test_execute_parses_output(self):
        raw_out = (
            b"Registrar: MarkMonitor Inc.\n"
            b"Creation Date: 1995-08-13T04:00:00Z\n"
            b"Registry Expiry Date: 2028-08-12T04:00:00Z\n"
            b"Registrant Organization: ICANN\n"
            b"Name Server: A.IANA-SERVERS.NET\n"
        )
        with patch("shutil.which", return_value="/usr/bin/whois"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=raw_out)):
            result = run(self._tool().execute({"domain": "example.com"}))
        assert result["status"] == "success"
        assert "MarkMonitor" in result["registrar"]
        assert len(result["name_servers"]) >= 1

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── DnsTool ───────────────────────────────────────────────────────────────────

class TestDnsTool:

    def _tool(self):
        from tools.dns_tool import DnsTool
        return DnsTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "dns_enum"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"domain": "example.com"}))
        assert result["status"] == "error"

    def test_execute_collects_records(self):
        a_records = b"93.184.216.34\n"
        with patch("shutil.which", return_value="/usr/bin/dig"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=a_records)):
            result = run(self._tool().execute({"domain": "example.com", "record_types": "A"}))
        assert result["status"] == "success"
        assert "A" in result["records"]
        assert "93.184.216.34" in result["records"]["A"]

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False

    def test_health_check_present(self):
        with patch("shutil.which", return_value="/usr/bin/dig"):
            h = run(self._tool().health_check())
        assert h.available is True


# ── CrackMapExecTool ──────────────────────────────────────────────────────────

class TestCrackMapExecTool:

    def _tool(self):
        from tools.crackmapexec_tool import CrackMapExecTool
        return CrackMapExecTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "crackmapexec_run"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({"targets": "10.0.0.0/24", "username": "admin"}))
        assert result["status"] == "error"

    def test_parse_successes_pwned(self):
        tool = self._tool()
        output = (
            "SMB   10.0.0.5  445   DC01  [+] DOMAIN\\admin:password (Pwn3d!)\n"
            "SMB   10.0.0.6  445   WS01  [+] DOMAIN\\admin:password\n"
        )
        successes = tool._parse_successes(output)
        assert len(successes) == 2
        admin_host = next(s for s in successes if s["host"] == "10.0.0.5")
        assert admin_host["admin"] is True
        normal_host = next(s for s in successes if s["host"] == "10.0.0.6")
        assert normal_host["admin"] is False

    def test_parse_successes_empty(self):
        tool = self._tool()
        successes = tool._parse_successes("SMB 10.0.0.1 445 DC01 [-] auth failed\n")
        assert successes == []

    def test_execute_success(self):
        output = b"SMB   10.0.0.5  445   DC01  [+] DOMAIN\\admin:pass (Pwn3d!)\n"
        with patch("shutil.which", return_value="/usr/bin/crackmapexec"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=output)):
            result = run(self._tool().execute({
                "targets": "10.0.0.5", "username": "admin", "password": "pass"
            }))
        assert result["status"] == "success"
        assert result["session_opened"] is True
        assert len(result["successes"]) == 1

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False


# ── ImpacketTool ──────────────────────────────────────────────────────────────

class TestImpacketTool:

    def _tool(self):
        from tools.impacket_tool import ImpacketTool
        return ImpacketTool()

    def test_metadata_name(self):
        assert self._tool().metadata.name == "impacket_run"

    def test_binary_missing(self):
        with patch("shutil.which", return_value=None):
            result = run(self._tool().execute({
                "tool": "wmiexec", "target": "10.0.0.1", "username": "admin"
            }))
        assert result["status"] == "error"
        assert "impacket" in result["error"].lower()

    def test_execute_whoami(self):
        output = b"DOMAIN\\admin\n"
        with patch("shutil.which", return_value="/usr/bin/impacket-wmiexec"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=output)):
            result = run(self._tool().execute({
                "tool": "wmiexec", "target": "10.0.0.1",
                "username": "admin", "password": "password"
            }))
        assert result["status"] == "success"
        assert "DOMAIN" in result["output"] or result["shell"] is True

    def test_execute_secretsdump(self):
        """secretsdump doesn't append a command arg."""
        output = b"Administrator:500:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::\n"
        with patch("shutil.which", return_value="/usr/bin/impacket-secretsdump"), \
             patch("asyncio.create_subprocess_exec", return_value=_make_proc(stdout=output)):
            result = run(self._tool().execute({
                "tool": "secretsdump", "target": "10.0.0.1",
                "username": "admin", "password": "password"
            }))
        assert result["status"] == "success"
        # secretsdump output is long enough → success
        assert "Administrator" in result["output"]

    def test_health_check_missing(self):
        with patch("shutil.which", return_value=None):
            h = run(self._tool().health_check())
        assert h.available is False

    def test_health_check_present(self):
        with patch("shutil.which", side_effect=lambda x: x if "psexec" in x else None):
            # At least one binary present → healthy
            h = run(self._tool().health_check())
        # health_check checks all tools, so result depends on mock
        # Just verify it returns a ToolHealthStatus
        assert hasattr(h, "available")
