"""
Phase 11 — Report Generator

Pulls session data from the database and renders an HTML or PDF report
using Jinja2 + WeasyPrint.

Output files go to:  reports/{session_id}_{timestamp}.html / .pdf

WeasyPrint is optional — if not installed, generate_pdf() raises ImportError
with a helpful message. HTML generation always works.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from database.db import DB_PATH
from database.repositories import (
    ExploitResultRepository,
    ScanResultRepository,
    SessionRepository,
    VulnerabilityRepository,
)
from reporting.cvss import cvss

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_REPORTS_DIR = Path(__file__).parent.parent / "reports"

_RECOMMENDATIONS: dict[str, str] = {
    "CRITICAL": (
        "Apply vendor patches immediately. Isolate the affected host from the network "
        "until remediation is confirmed. Review for signs of prior exploitation."
    ),
    "HIGH": (
        "Schedule patching within 24-72 hours. Apply compensating controls "
        "(firewall rules, WAF) as a short-term measure."
    ),
    "MEDIUM": (
        "Plan remediation within the next patch cycle (< 30 days). "
        "Monitor for exploitation attempts in the meantime."
    ),
    "LOW": (
        "Address during the next scheduled maintenance window. "
        "Low risk of active exploitation."
    ),
    "NONE": "No immediate action required.",
}


def _parse_cvss_vector_static(vector_string: str | None) -> dict:
    """
    Parse a CVSS v3.1 vector string into human-readable metric labels for the template.
    """
    _AV = {"N": "Network", "A": "Adjacent", "L": "Local", "P": "Physical"}
    _AC = {"L": "Low", "H": "High"}
    _PR = {"N": "None", "L": "Low", "H": "High"}
    _UI = {"N": "None", "R": "Required"}
    _S  = {"U": "Unchanged", "C": "Changed"}
    _CI = {"N": "None", "L": "Low", "H": "High"}

    defaults = {
        "cvss_vector": "",
        "cvss_av": "Network", "cvss_ac": "Low",
        "cvss_pr": "None",    "cvss_ui": "None",
        "cvss_scope": "Unchanged",
        "cvss_conf": "High",  "cvss_integ": "High", "cvss_avail": "High",
    }

    if not vector_string:
        return defaults

    s = vector_string.strip()
    if s.upper().startswith("CVSS:3"):
        s = s[9:]

    result: dict = {"cvss_vector": vector_string}
    for part in s.split("/"):
        if ":" not in part:
            continue
        key, val = part.split(":", 1)
        key = key.upper()
        val = val.upper()
        if key == "AV":
            result["cvss_av"] = _AV.get(val, val)
        elif key == "AC":
            result["cvss_ac"] = _AC.get(val, val)
        elif key == "PR":
            result["cvss_pr"] = _PR.get(val, val)
        elif key == "UI":
            result["cvss_ui"] = _UI.get(val, val)
        elif key == "S":
            result["cvss_scope"] = _S.get(val, val)
        elif key == "C":
            result["cvss_conf"] = _CI.get(val, val)
        elif key == "I":
            result["cvss_integ"] = _CI.get(val, val)
        elif key == "A":
            result["cvss_avail"] = _CI.get(val, val)

    for k, v in defaults.items():
        result.setdefault(k, v)
    return result


def _service_recommendation(service: str, severity: str) -> str:
    """
    Return a specific recommendation based on service type.
    Falls back to the generic severity-based recommendation.
    """
    service_lower = service.lower()
    specific = {
        "ftp":   "Disable FTP if not required. Upgrade to SFTP. If FTP is needed, restrict to authenticated users only.",
        "smb":   "Apply MS17-010 / EternalBlue patches. Disable SMBv1. Restrict SMB access to trusted hosts only.",
        "ssh":   "Disable password authentication, enforce key-based auth. Restrict SSH to specific source IPs.",
        "http":  "Update the web server and CMS to the latest version. Disable directory listing and unused modules.",
        "https": "Ensure TLS 1.2+ only. Disable weak cipher suites. Update SSL/TLS certificates.",
        "rdp":   "Restrict RDP access via VPN or firewall rules. Enable Network Level Authentication (NLA).",
        "mysql": "Restrict DB port to localhost or internal network only. Enforce strong authentication.",
        "mssql": "Patch to the latest service pack. Disable SA account if not required. Use Windows Authentication.",
    }
    for key, rec in specific.items():
        if key in service_lower:
            return rec
    return _RECOMMENDATIONS.get(severity, _RECOMMENDATIONS["NONE"])


# ── ReportGenerator ────────────────────────────────────────────────────────────

class ReportGenerator:
    """
    Generates HTML and PDF pentest reports from database data.

    Usage:
        rg = ReportGenerator()
        html = await rg.generate_html("session-id-here")
        pdf  = await rg.generate_pdf("session-id-here")   # requires WeasyPrint
        path = await rg.save_report("session-id-here")    # saves both HTML + PDF
    """

    def __init__(self, db_path: Path | str | None = None):
        self._db_path = db_path or DB_PATH
        self._jinja = Environment(
            loader=FileSystemLoader(str(_TEMPLATES_DIR)),
            autoescape=select_autoescape(["html"]),
        )
        _REPORTS_DIR.mkdir(exist_ok=True)

    # ── Public API ────────────────────────────────────────────────────────────

    async def generate_html(self, session_id: str) -> str:
        """Render and return the full HTML report as a string."""
        context = await self._build_context(session_id)
        template = self._jinja.get_template("report.html")
        return template.render(**context)

    async def generate_pdf(self, session_id: str) -> bytes:
        """
        Render the report as PDF bytes using WeasyPrint.

        Raises ImportError if WeasyPrint is not installed.
        """
        try:
            from weasyprint import HTML as WeasyHTML  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "WeasyPrint is required for PDF generation. "
                "Install it with: pip install weasyprint"
            ) from exc

        html_str = await self.generate_html(session_id)
        doc = WeasyHTML(string=html_str, base_url=str(_TEMPLATES_DIR))
        pdf_bytes: bytes = doc.write_pdf(presentational_hints=True)
        return pdf_bytes

    async def save_report(
        self,
        session_id: str,
        formats: list[str] | None = None,
    ) -> dict[str, Path]:
        """
        Save HTML (and optionally PDF) to the reports/ directory.

        Returns a dict of {format: path}.
        Default formats: ["html"] — add "pdf" if WeasyPrint is available.
        """
        if formats is None:
            formats = ["html"]

        timestamp = int(time.time())
        safe_sid = session_id.replace("-", "")[:16]
        base_name = f"{safe_sid}_{timestamp}"

        saved: dict[str, Path] = {}

        if "html" in formats:
            html_str = await self.generate_html(session_id)
            html_path = _REPORTS_DIR / f"{base_name}.html"
            html_path.write_text(html_str, encoding="utf-8")
            saved["html"] = html_path
            logger.info("HTML report saved: %s", html_path)

        if "pdf" in formats:
            try:
                pdf_bytes = await self.generate_pdf(session_id)
                pdf_path = _REPORTS_DIR / f"{base_name}.pdf"
                pdf_path.write_bytes(pdf_bytes)
                saved["pdf"] = pdf_path
                logger.info("PDF report saved: %s", pdf_path)
            except ImportError as exc:
                logger.warning("PDF skipped: %s", exc)

        return saved

    # ── Context builder ───────────────────────────────────────────────────────

    async def _build_context(self, session_id: str) -> dict:
        """Fetch all data and build the Jinja2 template context."""
        session = await SessionRepository(self._db_path).get(session_id)
        if session is None:
            raise ValueError(f"Session not found: {session_id!r}")

        raw_scans = await ScanResultRepository(self._db_path).get_for_session(session_id)
        raw_vulns = await VulnerabilityRepository(self._db_path).get_for_session(session_id)
        raw_exploits = await ExploitResultRepository(self._db_path).get_for_session(session_id)

        scan_rows = self._flatten_scan_results(raw_scans)
        vuln_rows = self._enrich_vulns(raw_vulns, raw_exploits)
        exploit_rows = list(raw_exploits)

        critical_count = sum(1 for v in vuln_rows if v["severity"] == "CRITICAL")
        high_count     = sum(1 for v in vuln_rows if v["severity"] == "HIGH")
        medium_count   = sum(1 for v in vuln_rows if v["severity"] == "MEDIUM")
        low_count      = sum(1 for v in vuln_rows if v["severity"] == "LOW")
        exploits_success = sum(1 for e in exploit_rows if e.get("success"))
        sessions_opened = sum(
            1 for e in exploit_rows if e.get("session_opened") and e["session_opened"] > 0
        )

        overall_risk, risk_color = self._overall_risk(critical_count, high_count, medium_count, low_count)

        stats = {
            "hosts_found":      session.get("hosts_found", 0) or len({r["ip"] for r in scan_rows}),
            "ports_found":      session.get("ports_found", 0) or len(scan_rows),
            "vulns_found":      session.get("vulns_found", 0) or len(vuln_rows),
            "critical_count":   critical_count,
            "high_count":       high_count,
            "medium_count":     medium_count,
            "low_count":        low_count,
            "exploits_run":     session.get("exploits_run", 0) or len(exploit_rows),
            "exploits_success": exploits_success,
            "sessions_opened":  sessions_opened,
            "overall_risk":     overall_risk,
            "risk_color":       risk_color,
        }

        # Add zfill filter for zero-padded numbers in the template
        self._jinja.filters["zfill"] = lambda val, width=2: str(val).zfill(width)

        return {
            "session":         session,
            "stats":           stats,
            "scan_results":    scan_rows,
            "vulnerabilities": vuln_rows,
            "exploit_results": exploit_rows,
            "generated_at":    datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        }

    # ── Data processing ───────────────────────────────────────────────────────

    @staticmethod
    def _overall_risk(critical: int, high: int, medium: int, low: int) -> tuple[str, str]:
        """Determine overall engagement risk level and colour."""
        if critical > 0:
            return "CRITICAL", "#ff4444"
        if high > 0:
            return "HIGH", "#ff8c42"
        if medium > 0:
            return "MEDIUM", "#ffd43b"
        if low > 0:
            return "LOW", "#69db7c"
        return "NONE", "#8b949e"

    @staticmethod
    def _flatten_scan_results(raw_scans: list[dict]) -> list[dict]:
        """
        Flatten scan_result rows (each containing a hosts list) into
        individual port rows for the findings table.
        """
        rows: list[dict] = []
        seen: set[str] = set()
        for scan in raw_scans:
            for host in scan.get("hosts", []):
                if host.get("state") != "up":
                    continue
                ip = host.get("ip", "")
                for port in host.get("ports", []):
                    if port.get("state") != "open":
                        continue
                    key = f"{ip}:{port.get('number')}:{port.get('protocol','tcp')}"
                    if key in seen:
                        continue
                    seen.add(key)
                    rows.append({
                        "ip":       ip,
                        "port":     port.get("number", 0),
                        "protocol": port.get("protocol", "tcp"),
                        "service":  port.get("service", ""),
                        "version":  port.get("version", ""),
                        "state":    port.get("state", "open"),
                    })
        rows.sort(key=lambda r: (r["ip"], r["port"]))
        return rows

    @staticmethod
    def _enrich_vulns(raw_vulns: list[dict], exploit_results: list[dict]) -> list[dict]:
        """
        Add severity label, colour, CVSS vector decomposition,
        exploit port, and recommendation to each vulnerability.
        Sort by CVSS score descending.
        """
        # Build a quick lookup: (host_ip, port) → exploit module
        exploit_map: dict[tuple, dict] = {}
        for e in exploit_results:
            key = (e.get("host_ip") or e.get("target_ip", ""), str(e.get("port", "")))
            if key not in exploit_map:
                exploit_map[key] = e

        enriched = []
        for v in raw_vulns:
            score    = float(v.get("cvss_score") or 0.0)
            severity = cvss.severity_label(score)
            color    = cvss.severity_color(score)
            service  = v.get("service", "")
            host_ip  = v.get("host_ip", "")

            # Try to find matching exploit data for PoC port
            matched_exploit = exploit_map.get((host_ip, str(v.get("port", ""))))
            exploit_port = (
                matched_exploit.get("port")
                if matched_exploit
                else v.get("port")
            )

            vector_data = _parse_cvss_vector_static(v.get("cvss_vector"))

            enriched.append({
                **v,
                **vector_data,
                "severity":       severity,
                "color":          color,
                "recommendation": _service_recommendation(service, severity),
                "exploit_port":   exploit_port,
            })

        # Sort by CVSS score descending
        enriched.sort(key=lambda x: float(x.get("cvss_score") or 0), reverse=True)
        return enriched
