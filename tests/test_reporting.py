"""
Phase 11 — Reporting Tests

Covers: CvssCalculator (v3.1), ReportGenerator (HTML generation,
executive summary, findings table, exploit results), and file saving.
PDF generation is tested only if WeasyPrint is available.
"""

import pytest
import pytest_asyncio
import tempfile
from pathlib import Path

from reporting.cvss import CvssCalculator, CvssVector, cvss
from reporting.report_generator import ReportGenerator
from database.db import init_db
from database.repositories import (
    SessionRepository,
    ScanResultRepository,
    VulnerabilityRepository,
    ExploitResultRepository,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_path(tmp_path):
    path = tmp_path / "report_test.db"
    await init_db(path)
    return path


@pytest_asyncio.fixture
async def populated_session(db_path):
    """Create a session with scan results, vulns, and exploit attempts."""
    s_repo   = SessionRepository(db_path)
    sc_repo  = ScanResultRepository(db_path)
    v_repo   = VulnerabilityRepository(db_path)
    e_repo   = ExploitResultRepository(db_path)

    # Session
    s = await s_repo.create("10.0.0.0/24", "full_auto", session_id="test-report-session-001")
    await s_repo.update_stats(
        s["id"], hosts_found=2, ports_found=4, vulns_found=2, exploits_run=1
    )

    # Scan results
    hosts = [
        {
            "ip": "10.0.0.5", "state": "up", "ports": [
                {"number": 21, "state": "open", "service": "ftp",  "version": "vsftpd 2.3.4", "protocol": "tcp"},
                {"number": 22, "state": "open", "service": "ssh",  "version": "OpenSSH 7.4",  "protocol": "tcp"},
            ],
        },
        {
            "ip": "10.0.0.10", "state": "up", "ports": [
                {"number": 80,  "state": "open", "service": "http",  "version": "Apache 2.2.8", "protocol": "tcp"},
                {"number": 445, "state": "open", "service": "microsoft-ds", "version": "", "protocol": "tcp"},
            ],
        },
        {"ip": "10.0.0.99", "state": "down", "ports": []},
    ]
    await sc_repo.save(s["id"], "10.0.0.0/24", "ping", hosts, 2.1)

    # Vulnerabilities
    await v_repo.save(s["id"], {
        "title":           "vsftpd 2.3.4 Backdoor Command Execution",
        "description":     "vsftpd 2.3.4 contains a backdoor that allows unauthenticated RCE.",
        "cve_id":          "CVE-2011-2523",
        "cvss_score":      10.0,
        "exploit_path":    "exploit/unix/ftp/vsftpd_234_backdoor",
        "exploit_type":    "remote",
        "service":         "ftp",
        "service_version": "vsftpd 2.3.4",
        "host_ip":         "10.0.0.5",
    })
    await v_repo.save(s["id"], {
        "title":       "Apache 2.2.8 mod_cgi Remote Code Execution",
        "description": "Apache mod_cgi allows shell injection via malformed HTTP headers.",
        "cve_id":      "CVE-2014-6271",
        "cvss_score":  9.3,
        "exploit_path": "exploit/multi/http/apache_mod_cgi_bash_env_exec",
        "exploit_type": "remote",
        "service":      "http",
        "service_version": "Apache 2.2.8",
        "host_ip":      "10.0.0.10",
    })

    # Exploit results
    await e_repo.save(s["id"], {
        "host_ip": "10.0.0.5", "port": 21,
        "module":  "exploit/unix/ftp/vsftpd_234_backdoor",
        "payload": "cmd/unix/interact",
        "success": True, "session_opened": 1, "output": "uid=0(root) gid=0(root)",
    })

    return s["id"], db_path


# ── 11.1 CVSS v3.1 Calculator ─────────────────────────────────────────────────

class TestCvssCalculator:

    def test_well_known_score_critical(self):
        # EternalBlue: AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H = 9.8
        v = CvssVector(
            attack_vector="N", attack_complexity="L",
            privileges_required="N", user_interaction="N",
            scope="U",
            confidentiality="H", integrity="H", availability="H",
        )
        score = cvss.calculate(v)
        assert score == 9.8

    def test_medium_severity_score(self):
        # Network, low complexity, low privileges, partial C+I → medium range
        # AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N = 5.4
        v = CvssVector(
            attack_vector="N", attack_complexity="L",
            privileges_required="L", user_interaction="N",
            scope="U",
            confidentiality="L", integrity="L", availability="N",
        )
        score = cvss.calculate(v)
        assert 4.0 <= score <= 6.9

    def test_zero_score_when_no_impact(self):
        # No CIA impact → score must be 0
        v = CvssVector(
            attack_vector="N", attack_complexity="L",
            privileges_required="N", user_interaction="N",
            scope="U",
            confidentiality="N", integrity="N", availability="N",
        )
        score = cvss.calculate(v)
        assert score == 0.0

    def test_scope_changed_raises_score(self):
        # Same metrics, Scope=C should produce higher score than S=U
        v_unchanged = CvssVector(
            attack_vector="N", attack_complexity="L",
            privileges_required="N", user_interaction="N",
            scope="U",
            confidentiality="H", integrity="L", availability="N",
        )
        v_changed = CvssVector(
            attack_vector="N", attack_complexity="L",
            privileges_required="N", user_interaction="N",
            scope="C",
            confidentiality="H", integrity="L", availability="N",
        )
        assert cvss.calculate(v_changed) >= cvss.calculate(v_unchanged)

    def test_from_vector_string_no_prefix(self):
        score = cvss.from_vector_string("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
        assert score == 9.8

    def test_from_vector_string_with_prefix(self):
        score = cvss.from_vector_string("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
        assert score == 9.8

    def test_parse_vector_string_returns_cvss_vector(self):
        v = CvssCalculator.parse_vector_string("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
        assert v.attack_vector == "N"
        assert v.scope == "U"
        assert v.confidentiality == "H"

    def test_severity_label_critical(self):
        assert CvssCalculator.severity_label(9.8)  == "CRITICAL"
        assert CvssCalculator.severity_label(9.0)  == "CRITICAL"

    def test_severity_label_high(self):
        assert CvssCalculator.severity_label(7.5)  == "HIGH"
        assert CvssCalculator.severity_label(7.0)  == "HIGH"

    def test_severity_label_medium(self):
        assert CvssCalculator.severity_label(5.0)  == "MEDIUM"
        assert CvssCalculator.severity_label(4.0)  == "MEDIUM"

    def test_severity_label_low(self):
        assert CvssCalculator.severity_label(2.0)  == "LOW"
        assert CvssCalculator.severity_label(0.1)  == "LOW"

    def test_severity_label_none(self):
        assert CvssCalculator.severity_label(0.0)  == "NONE"

    def test_severity_color_returns_hex(self):
        color = CvssCalculator.severity_color(9.8)
        assert color.startswith("#")
        assert len(color) == 7

    def test_cvss_vector_to_string(self):
        v = CvssVector(
            attack_vector="N", attack_complexity="L",
            privileges_required="N", user_interaction="N",
            scope="U",
            confidentiality="H", integrity="H", availability="H",
        )
        s = v.to_vector_string()
        assert "CVSS:3.1" in s
        assert "AV:N" in s

    def test_cvss_vector_display_dict(self):
        v = CvssVector()
        d = v.to_display_dict()
        assert "Attack Vector" in d
        assert "Privileges Required" in d

    def test_roundup_precision(self):
        # Roundup(3.011) = 3.1 (ceiling to 1 decimal)
        import math
        val = math.ceil(3.011 * 10) / 10
        assert val == 3.1

    def test_physical_access_vector_low_score(self):
        v = CvssVector(
            attack_vector="P", attack_complexity="H",
            privileges_required="H", user_interaction="R",
            scope="U",
            confidentiality="L", integrity="N", availability="N",
        )
        score = cvss.calculate(v)
        assert 0.0 < score < 4.0  # should be LOW


# ── 11.3-11.7 ReportGenerator ─────────────────────────────────────────────────

class TestReportGenerator:

    @pytest.mark.asyncio
    async def test_generate_html_returns_string(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert isinstance(html, str)
        assert len(html) > 100

    @pytest.mark.asyncio
    async def test_html_contains_target(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "10.0.0.0/24" in html

    @pytest.mark.asyncio
    async def test_html_contains_tirpan_title(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "TIRPAN" in html

    @pytest.mark.asyncio
    async def test_html_executive_summary_host_count(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        # stats.hosts_found = 2
        assert ">2<" in html or "2</div>" in html

    @pytest.mark.asyncio
    async def test_html_contains_cve(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "CVE-2011-2523" in html
        assert "CVE-2014-6271" in html

    @pytest.mark.asyncio
    async def test_html_contains_cvss_score(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "10.0" in html
        assert "9.3" in html

    @pytest.mark.asyncio
    async def test_html_contains_severity_badge(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "CRITICAL" in html

    @pytest.mark.asyncio
    async def test_html_contains_exploit_path_poc(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "vsftpd_234_backdoor" in html

    @pytest.mark.asyncio
    async def test_html_contains_recommendation(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        # ftp-specific recommendation
        assert "SFTP" in html or "FTP" in html

    @pytest.mark.asyncio
    async def test_html_contains_host_ips(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "10.0.0.5" in html
        assert "10.0.0.10" in html

    @pytest.mark.asyncio
    async def test_html_contains_service_names(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "ftp" in html.lower()
        assert "ssh" in html.lower()

    @pytest.mark.asyncio
    async def test_html_exploit_results_section(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "SUCCESS" in html or "FAILED" in html

    @pytest.mark.asyncio
    async def test_generate_html_raises_on_missing_session(self, db_path):
        rg = ReportGenerator(db_path)
        with pytest.raises(ValueError, match="Session not found"):
            await rg.generate_html("nonexistent-session-id")

    @pytest.mark.asyncio
    async def test_html_generated_at_timestamp(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        assert "UTC" in html  # generated_at contains UTC

    @pytest.mark.asyncio
    async def test_html_down_host_not_in_port_table(self, populated_session):
        session_id, db_path = populated_session
        rg = ReportGenerator(db_path)
        html = await rg.generate_html(session_id)
        # 10.0.0.99 is state=down, should not appear in port rows
        assert "10.0.0.99" not in html

    # ── 11.7 Executive summary stats ──────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_flatten_scan_results(self):
        raw = [{
            "hosts": [
                {"ip": "1.2.3.4", "state": "up", "ports": [
                    {"number": 80, "state": "open", "service": "http", "version": "", "protocol": "tcp"},
                    {"number": 443, "state": "closed", "service": "https", "version": "", "protocol": "tcp"},
                ]},
                {"ip": "1.2.3.5", "state": "down", "ports": []},
            ]
        }]
        rows = ReportGenerator._flatten_scan_results(raw)
        assert len(rows) == 1  # only open ports on up hosts
        assert rows[0]["ip"] == "1.2.3.4"
        assert rows[0]["port"] == 80

    @pytest.mark.asyncio
    async def test_enrich_vulns_adds_severity(self):
        raw = [{"title": "Test", "cvss_score": 9.8, "service": "ftp"}]
        enriched = ReportGenerator._enrich_vulns(raw)
        assert enriched[0]["severity"] == "CRITICAL"
        assert enriched[0]["color"].startswith("#")
        assert len(enriched[0]["recommendation"]) > 10

    @pytest.mark.asyncio
    async def test_enrich_vulns_ftp_specific_recommendation(self):
        raw = [{"title": "vsftpd", "cvss_score": 10.0, "service": "ftp"}]
        enriched = ReportGenerator._enrich_vulns(raw)
        assert "FTP" in enriched[0]["recommendation"] or "SFTP" in enriched[0]["recommendation"]

    @pytest.mark.asyncio
    async def test_enrich_vulns_smb_specific_recommendation(self):
        raw = [{"title": "EternalBlue", "cvss_score": 9.8, "service": "smb"}]
        enriched = ReportGenerator._enrich_vulns(raw)
        assert "SMB" in enriched[0]["recommendation"] or "EternalBlue" in enriched[0]["recommendation"]

    # ── 11.8 File saving ───────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_save_report_html_creates_file(self, populated_session, tmp_path):
        session_id, db_path = populated_session
        import reporting.report_generator as rg_module
        original = rg_module._REPORTS_DIR
        rg_module._REPORTS_DIR = tmp_path / "reports"
        rg_module._REPORTS_DIR.mkdir()
        try:
            rg = ReportGenerator(db_path)
            rg._jinja  # ensure templates loaded
            saved = await rg.save_report(session_id, formats=["html"])
            assert "html" in saved
            assert saved["html"].exists()
            assert saved["html"].stat().st_size > 100
        finally:
            rg_module._REPORTS_DIR = original

    @pytest.mark.asyncio
    async def test_save_report_html_content_is_valid(self, populated_session, tmp_path):
        session_id, db_path = populated_session
        import reporting.report_generator as rg_module
        original = rg_module._REPORTS_DIR
        rg_module._REPORTS_DIR = tmp_path / "reports"
        rg_module._REPORTS_DIR.mkdir()
        try:
            rg = ReportGenerator(db_path)
            saved = await rg.save_report(session_id, formats=["html"])
            content = saved["html"].read_text(encoding="utf-8")
            assert "<!DOCTYPE html>" in content
            assert "CVE-2011-2523" in content
        finally:
            rg_module._REPORTS_DIR = original

    @pytest.mark.asyncio
    async def test_pdf_raises_if_weasyprint_missing(self, populated_session, monkeypatch):
        session_id, db_path = populated_session
        import builtins
        real_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "weasyprint":
                raise ImportError("No module named 'weasyprint'")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", mock_import)
        rg = ReportGenerator(db_path)
        with pytest.raises(ImportError, match="WeasyPrint"):
            await rg.generate_pdf(session_id)
