"""
Phase 4 — SearchSploit Tool

Searches for exploits for a service + version using the searchsploit CLI.
Security: DoS exploits are filtered out.
CVSS enrichment: static table for well-known CVEs + file-header parsing.
"""

import asyncio
import json
import re
import subprocess
from pathlib import Path

from models.vulnerability import Vulnerability
from tools.base_tool import BaseTool, ToolMetadata

# Titles containing DoS / DDoS / Flood are automatically excluded (security rule)
_DOS_PATTERN = re.compile(r"\b(dos|ddos|denial.of.service|flood)\b", re.IGNORECASE)

# CVE-YYYY-NNNNN format
_CVE_PATTERN = re.compile(r"CVE-\d{4}-\d{4,7}", re.IGNORECASE)

# CVSS v3.x score from exploit file header (e.g. "# CVSS: 10.0" or "CVSS Score: 9.8")
_CVSS_HEADER_PATTERN = re.compile(r"cvss[:\s]+([0-9]+\.?[0-9]*)", re.IGNORECASE)

# Static CVSS 3.x scores for well-known CVEs that ExploitDB doesn't annotate.
# Scores sourced from NVD / NIST. Update as needed.
_KNOWN_CVE_CVSS: dict[str, float] = {
    # vsftpd
    "CVE-2011-2523": 9.8,   # vsftpd 2.3.4 backdoor
    # Samba
    "CVE-2007-2447": 6.0,   # Samba usermap_script (NVD v3 recalc)
    "CVE-2012-1182": 10.0,  # Samba heap overflow RCE
    "CVE-2017-7494": 9.8,   # SambaCry / EternalRed
    # Apache
    "CVE-2021-41773": 9.8,  # Apache path traversal / RCE
    "CVE-2021-42013": 9.8,  # Apache RCE
    "CVE-2017-9798": 5.3,   # Apache Optionsbleed
    "CVE-2014-6271": 9.8,   # Shellshock (bash CGI)
    # OpenSSL
    "CVE-2014-0160": 7.5,   # Heartbleed
    "CVE-2016-0800": 5.9,   # DROWN
    # OpenSSH
    "CVE-2016-0777": 6.5,   # OpenSSH UseRoaming
    "CVE-2018-10933": 9.1,  # libssh auth bypass
    "CVE-2023-38408": 9.8,  # OpenSSH agent RCE
    # Distccd
    "CVE-2004-2687": 9.3,   # distccd RCE
    # ProFTPD
    "CVE-2010-4221": 10.0,  # ProFTPD mod_sql
    "CVE-2011-4130": 9.0,   # ProFTPD mod_copy
    # Tomcat
    "CVE-2017-12617": 8.1,  # Tomcat RCE via PUT
    "CVE-2019-0232":  9.8,  # Tomcat CGI enableCmdLineArguments
    "CVE-2020-1938":  9.8,  # GhostCat AJP
    # MySQL
    "CVE-2012-2122": 7.5,   # MySQL auth bypass
    # PostgreSQL
    "CVE-2019-9193": 7.2,   # PostgreSQL COPY FROM PROGRAM
    # Java RMI
    "CVE-2011-3556": 7.5,   # Java RMI server
    # PHP
    "CVE-2012-1823": 7.5,   # PHP-CGI RCE
    "CVE-2019-11043": 9.8,  # PHP-FPM RCE
    # UnrealIRCd
    "CVE-2010-2075": 7.5,   # UnrealIRCd backdoor
    # ISC BIND
    "CVE-2014-8500": 7.8,   # BIND remote DoS (kept; not classified as DoS exploit)
    "CVE-2015-5477": 7.8,   # BIND TKEY query
    # Drupal
    "CVE-2018-7600": 9.8,   # Drupalgeddon2
    # WordPress
    "CVE-2019-8942": 8.8,   # WordPress RCE via image crop
    # SMB / EternalBlue
    "CVE-2017-0144": 8.1,   # EternalBlue MS17-010
    "CVE-2017-0145": 8.1,   # EternalBlue variant
    # VNC
    "CVE-2006-2369": 7.5,   # RealVNC auth bypass
    "CVE-2008-4770": 10.0,  # RealVNC 4.1 auth bypass
}


def _cvss_from_title_keywords(title: str) -> float | None:
    """Infer a rough CVSS tier from keywords when no score is available."""
    t = title.lower()
    # Backdoor / RCE / command exec → critical
    if any(k in t for k in ("backdoor", "remote code execution", "command execution",
                             "code exec", "rce", "shell upload", "buffer overflow")):
        return 9.3
    # Auth bypass → high
    if any(k in t for k in ("auth bypass", "authentication bypass", "unauthenticated")):
        return 8.0
    # Privilege escalation → high
    if any(k in t for k in ("privilege escalation", "privesc", "local privilege")):
        return 7.8
    # Information disclosure / traversal → medium
    if any(k in t for k in ("traversal", "path traversal", "information disclosure",
                             "directory traversal")):
        return 5.3
    return None


class SearchSploitTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="searchsploit_search",
            description=(
                "Searches ExploitDB for exploits by service and version. "
                "Returns results as a list of Vulnerability objects."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Service name (e.g. 'apache', 'openssh', 'vsftpd')",
                    },
                    "version": {
                        "type": "string",
                        "description": "Service version (e.g. '2.3.4', '7.4p1')",
                        "default": "",
                    },
                    "platform": {
                        "type": "string",
                        "description": "Platform filter (e.g. 'linux', 'windows'). Empty = all.",
                        "default": "",
                    },
                },
                "required": ["service"],
            },
            category="exploit-search",
        )

    async def validate(self, params: dict) -> tuple[bool, str]:
        if not params.get("service", "").strip():
            return False, "'service' parameter cannot be empty"
        return True, ""

    async def execute(self, params: dict) -> dict:
        ok, msg = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": msg}

        service = params["service"].strip()
        version = params.get("version", "").strip()
        platform = params.get("platform", "").strip()

        query = f"{service} {version}".strip()

        try:
            raw = await self._run_searchsploit(query)
        except FileNotFoundError:
            return {
                "success": False,
                "output": None,
                "error": "searchsploit not found. Is ExploitDB installed? (apt install exploitdb)",
            }
        except TimeoutError:
            return {"success": False, "output": None, "error": "searchsploit timed out (30s)"}

        vulnerabilities = self._parse_output(raw, service, version, platform)

        return {
            "success": True,
            "output": {
                "query": query,
                "total_found": len(vulnerabilities),
                "vulnerabilities": [v.model_dump() for v in vulnerabilities],
            },
            "error": None,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _run_searchsploit(self, query: str) -> dict:
        """Run searchsploit -j <query> and return the JSON output."""
        cmd = ["searchsploit", "--json", query]

        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )),
            timeout=35,
        )

        if not result.stdout.strip():
            return {"RESULTS_EXPLOIT": [], "RESULTS_SHELLCODE": []}

        return json.loads(result.stdout)

    @staticmethod
    def _read_exploit_header(path: str) -> tuple[str, float | None]:
        """
        Read the comment header of an ExploitDB file.

        Returns (description, cvss_score_or_None).

        Most ExploitDB files start with a comment block containing metadata:
          # Title: vsftpd 2.3.4 - Backdoor Command Execution
          # CVE : CVE-2011-2523
          # CVSS: 10.0
          # Description: ...
        """
        try:
            p = Path(path)
            if not p.exists() or p.stat().st_size == 0:
                return "", None
            lines: list[str] = []
            cvss: float | None = None
            with p.open(encoding="utf-8", errors="replace") as f:
                for i, line in enumerate(f):
                    if i >= 40:
                        break
                    stripped = line.strip()
                    # Collect comment lines (Python/Ruby/Bash/C styles)
                    if stripped.startswith(("#", "//", "*", ";")):
                        # Skip shebang, empty comment lines, and separator lines
                        if stripped in ("#", "//", "") or stripped.startswith("#!/"):
                            continue
                        if re.match(r"^[#\-=*]{4,}$", stripped):
                            continue
                        clean = stripped.lstrip("#/*; ").strip()
                        lines.append(clean)
                        # Try to extract CVSS score from header
                        if cvss is None:
                            m = _CVSS_HEADER_PATTERN.search(clean)
                            if m:
                                try:
                                    score = float(m.group(1))
                                    if 0.0 <= score <= 10.0:
                                        cvss = score
                                except ValueError:
                                    pass
                    elif lines:
                        break
            description = " | ".join(ln for ln in lines if ln)[:300]
            return description, cvss
        except Exception:
            return "", None

    def _parse_output(
        self,
        raw: dict,
        service: str,
        version: str,
        platform_filter: str,
    ) -> list[Vulnerability]:
        """Convert JSON output to a list of Vulnerability objects with CVSS enrichment."""
        exploits = raw.get("RESULTS_EXPLOIT", [])
        results: list[Vulnerability] = []

        for item in exploits:
            title: str = item.get("Title", "")
            path: str = item.get("Path", "")
            exploit_type: str = item.get("Type", "").lower()
            platform: str = item.get("Platform", "").lower()

            # --- Security filter: exclude DoS exploits ---
            if _DOS_PATTERN.search(title):
                continue

            # --- Platform filter ---
            if platform_filter and platform_filter.lower() not in platform:
                continue

            # --- Extract CVE (from title first, then file header) ---
            cve_match = _CVE_PATTERN.search(title)
            cve_id: str | None = cve_match.group(0).upper() if cve_match else None

            # --- Read description + CVSS from exploit file header ---
            description, header_cvss = self._read_exploit_header(path)

            # If CVE not found in title, try to find it in the file header
            if not cve_id and description:
                cve_match2 = _CVE_PATTERN.search(description)
                if cve_match2:
                    cve_id = cve_match2.group(0).upper()

            # --- CVSS enrichment (priority: static table > file header > keyword heuristic) ---
            cvss_score: float = 0.0
            if cve_id and cve_id.upper() in _KNOWN_CVE_CVSS:
                cvss_score = _KNOWN_CVE_CVSS[cve_id.upper()]
            elif header_cvss is not None:
                cvss_score = header_cvss
            else:
                inferred = _cvss_from_title_keywords(title)
                if inferred is not None:
                    cvss_score = inferred

            vuln = Vulnerability(
                title=title,
                description=description,
                cve_id=cve_id,
                cvss_score=cvss_score,
                exploit_path=path,
                exploit_type=exploit_type,
                platform=platform,
                service=service,
                service_version=version,
            )
            results.append(vuln)

        return results
