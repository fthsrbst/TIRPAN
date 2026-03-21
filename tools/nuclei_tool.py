"""V2 — nuclei_scan tool. Fast CVE/misconfiguration scanner."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
NUCLEI_TIMEOUT = 300


class NucleiTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="nuclei_scan",
            category="recon",
            description=(
                "Fast template-based vulnerability scanner. "
                "Detects CVEs, misconfigurations, exposed panels, default credentials."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url":       {"type": "string", "description": "Target URL or IP"},
                    "templates": {"type": "string", "default": "",
                                  "description": "Template path or tag (e.g. 'cves', 'exposures')"},
                    "severity":  {"type": "string", "default": "medium,high,critical"},
                    "timeout":   {"type": "integer", "default": 300},
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        url = params.get("url", "")
        templates = params.get("templates", "")
        severity = params.get("severity", "medium,high,critical")
        timeout = int(params.get("timeout", NUCLEI_TIMEOUT))

        if not shutil.which("nuclei"):
            return {"status": "error", "error": "nuclei not found — install from https://nuclei.projectdiscovery.io"}

        cmd = ["nuclei", "-u", url, "-severity", severity, "-json", "-silent", "-nc"]
        if templates:
            cmd += ["-t", templates]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"status": "error", "error": "nuclei timeout"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

        findings = []
        for line in stdout.decode(errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                findings.append({
                    "title":       entry.get("info", {}).get("name", entry.get("template-id", "")),
                    "cve_id":      entry.get("info", {}).get("classification", {}).get("cve-id", [""])[0],
                    "severity":    entry.get("info", {}).get("severity", "info"),
                    "cvss":        _severity_to_cvss(entry.get("info", {}).get("severity", "")),
                    "description": entry.get("info", {}).get("description", ""),
                    "matched_at":  entry.get("matched-at", ""),
                    "template_id": entry.get("template-id", ""),
                })
            except Exception:
                continue

        return {"status": "success", "findings": findings, "total": len(findings), "url": url}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("nuclei"):
            return ToolHealthStatus(available=True, message="nuclei_scan")
        return ToolHealthStatus(available=False, message="nuclei binary not found")


def _severity_to_cvss(severity: str) -> float:
    return {"critical": 9.5, "high": 7.5, "medium": 5.5, "low": 2.5, "info": 0.0}.get(
        severity.lower(), 0.0
    )
