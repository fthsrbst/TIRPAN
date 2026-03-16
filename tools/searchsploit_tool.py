"""
Phase 4 — SearchSploit Tool

Searches for exploits for a service + version using the searchsploit CLI.
Security: DoS exploits are filtered out.
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
    def _read_exploit_description(path: str) -> str:
        """
        Read the comment header of an ExploitDB file to extract a description.

        Most ExploitDB files start with a comment block containing metadata:
          # Title: vsftpd 2.3.4 - Backdoor Command Execution
          # CVE : CVE-2011-2523
          # Description: ...

        Returns up to 300 chars of the most informative comment lines,
        or empty string if the file is unreadable.
        """
        try:
            p = Path(path)
            if not p.exists() or p.stat().st_size == 0:
                return ""
            lines: list[str] = []
            with p.open(encoding="utf-8", errors="replace") as f:
                for i, line in enumerate(f):
                    if i >= 30:
                        break
                    stripped = line.strip()
                    # Collect comment lines (Python/Ruby/Bash/C styles)
                    if stripped.startswith(("#", "//", "*", ";")):
                        # Skip shebang, empty comment lines, and separator lines
                        if stripped in ("#", "//", "") or stripped.startswith(("#!/", "#!/")):
                            continue
                        if re.match(r"^[#\-=*]{4,}$", stripped):
                            continue
                        lines.append(stripped.lstrip("#/*; ").strip())
                    elif lines:
                        # Stop at first non-comment line after we've collected some
                        break
            description = " | ".join(l for l in lines if l)[:300]
            return description
        except Exception:
            return ""

    def _parse_output(
        self,
        raw: dict,
        service: str,
        version: str,
        platform_filter: str,
    ) -> list[Vulnerability]:
        """Convert JSON output to a list of Vulnerability objects."""
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

            # --- Read description from exploit file header ---
            description = self._read_exploit_description(path)

            # If CVE not found in title, try to find it in the file header
            if not cve_id and description:
                cve_match2 = _CVE_PATTERN.search(description)
                if cve_match2:
                    cve_id = cve_match2.group(0).upper()

            vuln = Vulnerability(
                title=title,
                description=description,
                cve_id=cve_id,
                exploit_path=path,
                exploit_type=exploit_type,
                platform=platform,
                service=service,
                service_version=version,
            )
            results.append(vuln)

        return results
