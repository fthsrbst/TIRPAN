"""
Phase 4 — SearchSploitTool testleri

Tüm testler gerçek searchsploit CLI olmadan çalışır (mock).
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tools.searchsploit_tool import SearchSploitTool


# ------------------------------------------------------------------
# Fixture: örnek searchsploit JSON çıktısı
# ------------------------------------------------------------------

SAMPLE_OUTPUT = {
    "RESULTS_EXPLOIT": [
        {
            "Title": "vsftpd 2.3.4 - Backdoor Command Execution (CVE-2011-2523)",
            "Path": "/usr/share/exploitdb/exploits/unix/remote/17491.rb",
            "Type": "remote",
            "Platform": "linux",
        },
        {
            "Title": "vsftpd 2.3.4 - DoS (Denial of Service)",
            "Path": "/usr/share/exploitdb/exploits/unix/dos/99999.txt",
            "Type": "dos",
            "Platform": "linux",
        },
        {
            "Title": "vsftpd 3.0.3 - Heap Buffer Overflow",
            "Path": "/usr/share/exploitdb/exploits/unix/remote/12345.py",
            "Type": "remote",
            "Platform": "linux",
        },
    ],
    "RESULTS_SHELLCODE": [],
}

WINDOWS_OUTPUT = {
    "RESULTS_EXPLOIT": [
        {
            "Title": "Apache 2.4.49 - Path Traversal (CVE-2021-41773)",
            "Path": "/usr/share/exploitdb/exploits/multiple/webapps/50406.sh",
            "Type": "webapps",
            "Platform": "windows",
        },
        {
            "Title": "Apache 2.4.50 - Remote Code Execution",
            "Path": "/usr/share/exploitdb/exploits/multiple/webapps/50512.py",
            "Type": "webapps",
            "Platform": "linux",
        },
    ],
    "RESULTS_SHELLCODE": [],
}


# ------------------------------------------------------------------
# Yardımcı: mock _run_searchsploit
# ------------------------------------------------------------------

def make_tool_with_mock(output: dict) -> SearchSploitTool:
    tool = SearchSploitTool()
    tool._run_searchsploit = AsyncMock(return_value=output)
    return tool


# ------------------------------------------------------------------
# 4.1 — Metadata
# ------------------------------------------------------------------

class TestMetadata:
    def test_name(self):
        assert SearchSploitTool().metadata.name == "searchsploit_search"

    def test_category(self):
        assert SearchSploitTool().metadata.category == "exploit-search"

    def test_parameters_has_required(self):
        params = SearchSploitTool().metadata.parameters
        assert "service" in params["required"]


# ------------------------------------------------------------------
# 4.2 / 4.3 / 4.4 — JSON parsing + sonuç yapısı
# ------------------------------------------------------------------

class TestExecute:
    @pytest.mark.asyncio
    async def test_success_returns_correct_structure(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        result = await tool.execute({"service": "vsftpd", "version": "2.3.4"})

        assert result["success"] is True
        assert result["error"] is None
        assert "vulnerabilities" in result["output"]
        assert "query" in result["output"]
        assert "total_found" in result["output"]

    @pytest.mark.asyncio
    async def test_query_combines_service_and_version(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        await tool.execute({"service": "vsftpd", "version": "2.3.4"})

        tool._run_searchsploit.assert_called_once_with("vsftpd 2.3.4")

    @pytest.mark.asyncio
    async def test_query_service_only(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        await tool.execute({"service": "vsftpd"})

        tool._run_searchsploit.assert_called_once_with("vsftpd")

    @pytest.mark.asyncio
    async def test_exploit_fields_present(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        result = await tool.execute({"service": "vsftpd", "version": "2.3.4"})

        vuln = result["output"]["vulnerabilities"][0]
        assert "title" in vuln
        assert "exploit_path" in vuln
        assert "exploit_type" in vuln
        assert "platform" in vuln


# ------------------------------------------------------------------
# 4.5 — CVE ID çıkarma
# ------------------------------------------------------------------

class TestCveExtraction:
    @pytest.mark.asyncio
    async def test_cve_extracted_from_title(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        result = await tool.execute({"service": "vsftpd"})

        vulns = result["output"]["vulnerabilities"]
        first = vulns[0]
        assert first["cve_id"] == "CVE-2011-2523"

    @pytest.mark.asyncio
    async def test_no_cve_returns_none(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        result = await tool.execute({"service": "vsftpd"})

        # İkinci exploit (DoS olmayan) CVE içermiyor
        vulns = result["output"]["vulnerabilities"]
        second = next(v for v in vulns if "Heap" in v["title"])
        assert second["cve_id"] is None


# ------------------------------------------------------------------
# 4.6 — DoS filtresi (güvenlik kuralı)
# ------------------------------------------------------------------

class TestDosFilter:
    @pytest.mark.asyncio
    async def test_dos_exploits_excluded(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        result = await tool.execute({"service": "vsftpd"})

        titles = [v["title"] for v in result["output"]["vulnerabilities"]]
        assert not any("DoS" in t or "Denial" in t for t in titles)

    @pytest.mark.asyncio
    async def test_non_dos_exploits_included(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        result = await tool.execute({"service": "vsftpd"})

        # SAMPLE_OUTPUT'ta 3 exploit var, 1'i DoS → 2 kalmalı
        assert result["output"]["total_found"] == 2


# ------------------------------------------------------------------
# 4.7 — Vulnerability modeline eşleme
# ------------------------------------------------------------------

class TestVulnerabilityMapping:
    @pytest.mark.asyncio
    async def test_service_and_version_stored(self):
        tool = make_tool_with_mock(SAMPLE_OUTPUT)
        result = await tool.execute({"service": "vsftpd", "version": "2.3.4"})

        vuln = result["output"]["vulnerabilities"][0]
        assert vuln["service"] == "vsftpd"
        assert vuln["service_version"] == "2.3.4"

    @pytest.mark.asyncio
    async def test_platform_filter(self):
        tool = make_tool_with_mock(WINDOWS_OUTPUT)
        result = await tool.execute({"service": "apache", "platform": "windows"})

        vulns = result["output"]["vulnerabilities"]
        assert all("windows" in v["platform"] for v in vulns)
        assert result["output"]["total_found"] == 1


# ------------------------------------------------------------------
# Validate + hata senaryoları
# ------------------------------------------------------------------

class TestValidation:
    @pytest.mark.asyncio
    async def test_empty_service_fails(self):
        tool = SearchSploitTool()
        result = await tool.execute({"service": ""})
        assert result["success"] is False
        assert "service" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_searchsploit_not_found(self):
        tool = SearchSploitTool()
        tool._run_searchsploit = AsyncMock(side_effect=FileNotFoundError)
        result = await tool.execute({"service": "vsftpd"})

        assert result["success"] is False
        assert "searchsploit" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_empty_results(self):
        tool = make_tool_with_mock({"RESULTS_EXPLOIT": [], "RESULTS_SHELLCODE": []})
        result = await tool.execute({"service": "nonexistent_service_xyz"})

        assert result["success"] is True
        assert result["output"]["total_found"] == 0
