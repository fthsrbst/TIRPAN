"""
Phase 4 — SearchSploit Tool

searchsploit CLI'yi kullanarak servis + versiyon için exploit arar.
Güvenlik: DoS exploitleri filtrelenir.
"""

import asyncio
import json
import re
import subprocess
from typing import Optional

from models.vulnerability import Vulnerability
from tools.base_tool import BaseTool, ToolMetadata

# DoS / DDoS / Flood içeren başlıklar otomatik elenir (güvenlik kuralı)
_DOS_PATTERN = re.compile(r"\b(dos|ddos|denial.of.service|flood)\b", re.IGNORECASE)

# CVE-YYYY-NNNNN formatı
_CVE_PATTERN = re.compile(r"CVE-\d{4}-\d{4,7}", re.IGNORECASE)


class SearchSploitTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="searchsploit_search",
            description=(
                "ExploitDB'de servis ve versiyona göre exploit arar. "
                "Sonuçları Vulnerability listesi olarak döner."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Servis adı (örn: 'apache', 'openssh', 'vsftpd')",
                    },
                    "version": {
                        "type": "string",
                        "description": "Servis versiyonu (örn: '2.3.4', '7.4p1')",
                        "default": "",
                    },
                    "platform": {
                        "type": "string",
                        "description": "Platform filtresi (örn: 'linux', 'windows'). Boş = hepsi.",
                        "default": "",
                    },
                },
                "required": ["service"],
            },
            category="exploit-search",
        )

    async def validate(self, params: dict) -> tuple[bool, str]:
        if not params.get("service", "").strip():
            return False, "'service' parametresi boş olamaz"
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
                "error": "searchsploit bulunamadı. ExploitDB kurulu mu? (apt install exploitdb)",
            }
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": "searchsploit zaman aşımına uğradı (30s)"}

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
        """searchsploit -j <query> çalıştır ve JSON çıktısını döner."""
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

    def _parse_output(
        self,
        raw: dict,
        service: str,
        version: str,
        platform_filter: str,
    ) -> list[Vulnerability]:
        """JSON çıktısını Vulnerability listesine çevir."""
        exploits = raw.get("RESULTS_EXPLOIT", [])
        results: list[Vulnerability] = []

        for item in exploits:
            title: str = item.get("Title", "")
            path: str = item.get("Path", "")
            exploit_type: str = item.get("Type", "").lower()
            platform: str = item.get("Platform", "").lower()

            # --- Güvenlik filtresi: DoS exploitlerini ele ---
            if _DOS_PATTERN.search(title):
                continue

            # --- Platform filtresi ---
            if platform_filter and platform_filter.lower() not in platform:
                continue

            # --- CVE çıkar ---
            cve_match = _CVE_PATTERN.search(title)
            cve_id: Optional[str] = cve_match.group(0).upper() if cve_match else None

            vuln = Vulnerability(
                title=title,
                cve_id=cve_id,
                exploit_path=path,
                exploit_type=exploit_type,
                platform=platform,
                service=service,
                service_version=version,
            )
            results.append(vuln)

        return results
