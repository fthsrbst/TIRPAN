"""
Phase 11 — Report Generator

Pulls session data from the database and renders an HTML or PDF report
using Jinja2 + WeasyPrint.

Output files go to:  reports/{session_id}_{timestamp}.html / .pdf

WeasyPrint is optional — if not installed, generate_pdf() raises ImportError
with a helpful message. HTML generation always works.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import time
from datetime import UTC, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from database import db as database
from database.db import DB_PATH
from database.sqlite_conn import connect as connect_db
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
_REPORT_LOGO_ALLOWED_EXTS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

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
        branding = await self._build_branding_context()

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

        service_inventory = self._build_service_inventory(scan_rows, vuln_rows)
        host_exposure = self._build_host_exposure(scan_rows, vuln_rows, exploit_rows)
        priority_actions = self._build_priority_actions(vuln_rows, host_exposure)
        evidence_timeline = self._build_evidence_timeline(raw_scans, raw_vulns, raw_exploits)

        assessment_start = float(session.get("created_at") or 0.0)
        assessment_end = float(session.get("finished_at") or session.get("updated_at") or assessment_start)
        duration_seconds = max(0, int(assessment_end - assessment_start)) if assessment_end and assessment_start else 0
        exploit_success_rate = round((exploits_success / max(len(exploit_rows), 1)) * 100) if exploit_rows else 0

        engagement = {
            "started_at": self._format_ts(assessment_start),
            "ended_at": self._format_ts(assessment_end),
            "duration": self._format_duration(duration_seconds),
            "unique_services": len(service_inventory),
            "vulnerable_hosts": sum(1 for h in host_exposure if h.get("vuln_count", 0) > 0),
            "exploited_hosts": sum(1 for h in host_exposure if h.get("exploited")),
            "exploit_success_rate": f"{exploit_success_rate}%",
        }

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
            "service_inventory": service_inventory,
            "host_exposure": host_exposure,
            "priority_actions": priority_actions,
            "evidence_timeline": evidence_timeline,
            "engagement":      engagement,
            "branding":        branding,
            "generated_at":    datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        }

    async def _build_branding_context(self) -> dict:
        """Resolve optional company branding (name + logo) for report templates."""
        company_name = ""
        logo_file = ""

        try:
            async with connect_db(self._db_path) as db:
                async with db.execute(
                    "SELECT value FROM app_settings WHERE key=?",
                    ("branding_company_name",),
                ) as cur:
                    row = await cur.fetchone()
                    if row and row[0] is not None:
                        company_name = str(json.loads(row[0]) or "").strip()

                async with db.execute(
                    "SELECT value FROM app_settings WHERE key=?",
                    ("branding_logo_file",),
                ) as cur:
                    row = await cur.fetchone()
                    if row and row[0] is not None:
                        logo_file = str(json.loads(row[0]) or "").strip()
        except Exception as exc:
            logger.warning("Branding settings load skipped: %s", exc)

        logo_data_url = ""

        if logo_file and re.fullmatch(r"[A-Za-z0-9_.-]+", logo_file):
            try:
                branding_dir = (Path(self._db_path).parent / "branding").resolve()
                logo_path = (branding_dir / logo_file).resolve()
                if branding_dir in logo_path.parents and logo_path.exists() and logo_path.is_file():
                    ext = logo_path.suffix.lower()
                    mime = _REPORT_LOGO_ALLOWED_EXTS.get(ext)
                    if mime:
                        raw = logo_path.read_bytes()
                        if raw:
                            encoded = base64.b64encode(raw).decode("ascii")
                            logo_data_url = f"data:{mime};base64,{encoded}"
            except Exception as exc:
                logger.warning("Branding logo load skipped: %s", exc)

        return {
            "company_name": company_name,
            "logo_file": logo_file,
            "logo_data_url": logo_data_url,
            "has_logo": bool(logo_data_url),
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
    def _enrich_vulns(raw_vulns: list[dict], exploit_results: list[dict] | None = None) -> list[dict]:
        """
        Add severity label, colour, CVSS vector decomposition,
        exploit port, and recommendation to each vulnerability.
        Sort by CVSS score descending.
        """
        # Build a quick lookup: (host_ip, port) → exploit module
        exploit_map: dict[tuple, dict] = {}
        for e in (exploit_results or []):
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

    @staticmethod
    def _format_ts(ts: float | int | None) -> str:
        if not ts:
            return "—"
        try:
            return datetime.fromtimestamp(float(ts), tz=UTC).strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            return "—"

    @staticmethod
    def _format_duration(seconds: int) -> str:
        if seconds <= 0:
            return "0m"
        days, rem = divmod(seconds, 86400)
        hours, rem = divmod(rem, 3600)
        mins, _ = divmod(rem, 60)
        parts: list[str] = []
        if days:
            parts.append(f"{days}d")
        if hours:
            parts.append(f"{hours}h")
        if mins or not parts:
            parts.append(f"{mins}m")
        return " ".join(parts)

    @staticmethod
    def _build_service_inventory(scan_rows: list[dict], vuln_rows: list[dict]) -> list[dict]:
        inventory: dict[str, dict] = {}

        def ensure(service_name: str) -> dict:
            raw_name = (service_name or "unknown").strip() or "unknown"
            key = raw_name.lower()
            if key not in inventory:
                inventory[key] = {
                    "service": raw_name,
                    "hosts": set(),
                    "ports": set(),
                    "versions": set(),
                    "vuln_count": 0,
                    "critical_count": 0,
                    "max_cvss": 0.0,
                }
            elif inventory[key]["service"] == "unknown" and raw_name != "unknown":
                inventory[key]["service"] = raw_name
            return inventory[key]

        for row in scan_rows:
            entry = ensure(str(row.get("service") or "unknown"))
            ip = row.get("ip") or ""
            if ip:
                entry["hosts"].add(ip)
            port = row.get("port")
            proto = row.get("protocol") or "tcp"
            if port:
                entry["ports"].add(f"{port}/{proto}")
            version = str(row.get("version") or "").strip()
            if version:
                entry["versions"].add(version)

        for vuln in vuln_rows:
            entry = ensure(str(vuln.get("service") or "unknown"))
            score = float(vuln.get("cvss_score") or 0.0)
            entry["vuln_count"] += 1
            entry["max_cvss"] = max(entry["max_cvss"], score)
            if score >= 9.0:
                entry["critical_count"] += 1
            host_ip = vuln.get("host_ip") or ""
            if host_ip:
                entry["hosts"].add(host_ip)
            version = str(vuln.get("service_version") or "").strip()
            if version:
                entry["versions"].add(version)

        rows = []
        for entry in inventory.values():
            rows.append(
                {
                    "service": entry["service"],
                    "host_count": len(entry["hosts"]),
                    "open_port_count": len(entry["ports"]),
                    "vuln_count": entry["vuln_count"],
                    "critical_count": entry["critical_count"],
                    "max_cvss": round(float(entry["max_cvss"]), 1),
                    "versions": ", ".join(sorted(entry["versions"])[:3]) if entry["versions"] else "—",
                }
            )

        rows.sort(
            key=lambda x: (
                int(x.get("vuln_count", 0)),
                float(x.get("max_cvss", 0.0)),
                int(x.get("host_count", 0)),
            ),
            reverse=True,
        )
        return rows

    @staticmethod
    def _build_host_exposure(scan_rows: list[dict], vuln_rows: list[dict], exploit_rows: list[dict]) -> list[dict]:
        hosts: dict[str, dict] = {}

        def ensure(ip: str) -> dict:
            key = ip or "unknown"
            if key not in hosts:
                hosts[key] = {
                    "ip": key,
                    "open_ports": set(),
                    "services": set(),
                    "vuln_count": 0,
                    "max_cvss": 0.0,
                    "exploit_attempts": 0,
                    "exploited": False,
                }
            return hosts[key]

        for row in scan_rows:
            ip = str(row.get("ip") or "")
            if not ip:
                continue
            entry = ensure(ip)
            port = row.get("port")
            proto = row.get("protocol") or "tcp"
            if port:
                entry["open_ports"].add(f"{port}/{proto}")
            service = str(row.get("service") or "").strip()
            if service:
                entry["services"].add(service)

        for vuln in vuln_rows:
            ip = str(vuln.get("host_ip") or "")
            if not ip:
                continue
            entry = ensure(ip)
            entry["vuln_count"] += 1
            entry["max_cvss"] = max(entry["max_cvss"], float(vuln.get("cvss_score") or 0.0))
            service = str(vuln.get("service") or "").strip()
            if service:
                entry["services"].add(service)

        for exploit in exploit_rows:
            ip = str(exploit.get("host_ip") or exploit.get("target_ip") or "")
            if not ip:
                continue
            entry = ensure(ip)
            entry["exploit_attempts"] += 1
            if exploit.get("success"):
                entry["exploited"] = True

        output = []
        for entry in hosts.values():
            max_cvss = float(entry["max_cvss"])
            if entry["exploited"]:
                risk_label = "COMPROMISED"
                risk_color = "#ff4444"
            elif max_cvss >= 9.0:
                risk_label = "CRITICAL"
                risk_color = "#ff4444"
            elif max_cvss >= 7.0:
                risk_label = "HIGH"
                risk_color = "#ff8c42"
            elif entry["vuln_count"] > 0:
                risk_label = "MEDIUM"
                risk_color = "#ffd43b"
            else:
                risk_label = "LOW"
                risk_color = "#69db7c"

            output.append(
                {
                    "ip": entry["ip"],
                    "open_port_count": len(entry["open_ports"]),
                    "services": ", ".join(sorted(entry["services"])[:4]) if entry["services"] else "—",
                    "vuln_count": entry["vuln_count"],
                    "max_cvss": round(max_cvss, 1),
                    "exploit_attempts": entry["exploit_attempts"],
                    "exploited": entry["exploited"],
                    "risk_label": risk_label,
                    "risk_color": risk_color,
                }
            )

        output.sort(
            key=lambda x: (
                1 if x.get("exploited") else 0,
                float(x.get("max_cvss") or 0.0),
                int(x.get("vuln_count") or 0),
                int(x.get("open_port_count") or 0),
            ),
            reverse=True,
        )
        return output

    @staticmethod
    def _build_priority_actions(vuln_rows: list[dict], host_exposure: list[dict]) -> list[dict]:
        if not vuln_rows:
            return []

        actions: list[dict] = []

        compromised_hosts = [h for h in host_exposure if h.get("exploited")]
        if compromised_hosts:
            actions.append(
                {
                    "priority": "IMMEDIATE",
                    "owner": "SOC / Incident Response",
                    "due_window": "0-24 hours",
                    "title": "Contain and investigate compromised hosts",
                    "rationale": (
                        f"{len(compromised_hosts)} host(s) had successful exploit attempts "
                        "and should be isolated and forensically reviewed."
                    ),
                    "recommendation": (
                        "Isolate affected hosts from production segments, rotate credentials, "
                        "and validate persistence mechanisms before returning systems to service."
                    ),
                }
            )

        owner_map = {
            "http": "Application Security",
            "https": "Application Security",
            "ssh": "Infrastructure Operations",
            "smb": "Endpoint / AD Team",
            "rdp": "Endpoint / AD Team",
            "mysql": "Database Operations",
            "mssql": "Database Operations",
        }
        due_map = {
            "CRITICAL": "0-24 hours",
            "HIGH": "24-72 hours",
            "MEDIUM": "< 30 days",
            "LOW": "Next maintenance window",
            "NONE": "Track",
        }
        priority_rank = {"IMMEDIATE": 0, "CRITICAL": 1, "HIGH": 2, "MEDIUM": 3, "LOW": 4, "NONE": 5}

        seen_services: set[str] = set()
        for vuln in vuln_rows:
            service = (str(vuln.get("service") or "unknown").strip().lower() or "unknown")
            if service in seen_services:
                continue
            seen_services.add(service)

            severity = str(vuln.get("severity") or "LOW")
            cve_id = str(vuln.get("cve_id") or "")
            title = f"Patch and harden {service.upper()} service"
            if cve_id:
                title = f"Remediate {cve_id} on {service.upper()}"

            actions.append(
                {
                    "priority": severity,
                    "owner": owner_map.get(service, "Infrastructure Operations"),
                    "due_window": due_map.get(severity, "< 30 days"),
                    "title": title,
                    "rationale": (
                        f"Highest observed CVSS for {service.upper()} is "
                        f"{float(vuln.get('cvss_score') or 0.0):.1f}."
                    ),
                    "recommendation": str(vuln.get("recommendation") or _RECOMMENDATIONS.get(severity, _RECOMMENDATIONS["LOW"])),
                }
            )

            if len(actions) >= 6:
                break

        actions.sort(key=lambda a: priority_rank.get(a.get("priority", "NONE"), 9))
        return actions[:6]

    @staticmethod
    def _build_evidence_timeline(raw_scans: list[dict], raw_vulns: list[dict], raw_exploits: list[dict]) -> list[dict]:
        events: list[dict] = []

        for scan in raw_scans:
            ts = float(scan.get("created_at") or 0.0)
            hosts_up = sum(1 for h in (scan.get("hosts") or []) if h.get("state") == "up")
            events.append(
                {
                    "ts": ts,
                    "kind": "scan",
                    "label": f"{str(scan.get('scan_type') or 'scan').upper()} completed",
                    "detail": f"{hosts_up} host(s) responded for target {scan.get('target') or 'scope'}.",
                }
            )

        for vuln in raw_vulns:
            ts = float(vuln.get("created_at") or 0.0)
            sev = cvss.severity_label(float(vuln.get("cvss_score") or 0.0))
            title = str(vuln.get("title") or "Unnamed finding")
            events.append(
                {
                    "ts": ts,
                    "kind": "vuln",
                    "label": f"{sev} finding identified",
                    "detail": f"{title} on {vuln.get('host_ip') or 'unknown host'}.",
                }
            )

        for exploit in raw_exploits:
            ts = float(exploit.get("created_at") or 0.0)
            success = bool(exploit.get("success"))
            result = "successful" if success else "failed"
            mod = exploit.get("module") or "unknown/module"
            host = exploit.get("host_ip") or exploit.get("target_ip") or "unknown host"
            events.append(
                {
                    "ts": ts,
                    "kind": "exploit",
                    "label": f"Exploit attempt {result}",
                    "detail": f"{mod} against {host}.",
                }
            )

        events.sort(key=lambda e: e.get("ts", 0.0))
        events = events[-30:]

        for ev in events:
            ts = float(ev.get("ts") or 0.0)
            if ts:
                ev["time"] = datetime.fromtimestamp(ts, tz=UTC).strftime("%H:%M:%S")
                ev["date"] = datetime.fromtimestamp(ts, tz=UTC).strftime("%Y-%m-%d")
            else:
                ev["time"] = "—"
                ev["date"] = "—"

        return events
