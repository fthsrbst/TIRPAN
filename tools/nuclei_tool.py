"""V2 — nuclei_scan tool. Fast CVE/misconfiguration scanner."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)
# 150s default: nuclei streams findings as it goes (partial results are kept on
# the cap), so a tighter budget still surfaces the high-severity hits without
# letting one tool consume the whole webapp-agent wall-clock.
NUCLEI_TIMEOUT = 150


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
            return {"success": False, "error": "nuclei not found — install from https://nuclei.projectdiscovery.io"}

        # nuclei v3 renamed -json → -jsonl (the old -json errors with "flag
        # provided but not defined"). Try the modern flag first and fall back to
        # the legacy one so the wrapper works across versions. The old code's bare
        # -json silently produced zero findings on v3.
        extra = ["-t", templates] if templates else []

        async def _run(json_flag: str):
            # Stream JSONL findings as nuclei emits them and stop at the deadline,
            # KEEPING whatever was found so far. A full template run takes minutes;
            # the old communicate()+wait_for discarded all partial output on
            # timeout, so a bounded agent run always saw zero findings.
            cmd = ["nuclei", "-u", url, "-severity", severity, json_flag, "-silent", "-nc", "-duc", *extra]
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            except Exception as e:  # pragma: no cover
                return "ERR", "", str(e)

            buf = bytearray()

            async def _drain():
                # Chunked read (NOT readline): nuclei JSONL lines can exceed
                # asyncio's 64 KB readline limit and raise LimitOverrunError.
                while True:
                    chunk = await proc.stdout.read(65536)
                    if not chunk:
                        break
                    buf.extend(chunk)

            partial = False
            try:
                await asyncio.wait_for(_drain(), timeout=timeout)
                await asyncio.wait_for(proc.wait(), timeout=5)
                rc = proc.returncode
            except asyncio.TimeoutError:
                partial = True
                try:
                    proc.kill()
                except Exception:
                    pass
                rc = None  # partial-but-usable
            try:
                err_bytes = await asyncio.wait_for(proc.stderr.read(), timeout=3)
                err = err_bytes.decode(errors="replace")
            except Exception:
                err = ""
            out = buf.decode(errors="replace")
            # No findings AND no time spent streaming → a hard failure worth
            # reporting (bad flag, missing templates). Partial timeouts are fine.
            if partial and not out.strip():
                rc = "TIMEOUT_EMPTY"
            return rc, out, err

        rc, out, err = await _run("-jsonl")
        if rc == "TIMEOUT_EMPTY":
            return {"success": False, "error": "nuclei timeout (no findings before cap)"}
        if (not out.strip()) and ("not defined" in err.lower() or "not defined" in out.lower()):
            rc, out, err = await _run("-json")  # legacy nuclei (<v3)
            if rc == "TIMEOUT_EMPTY":
                return {"success": False, "error": "nuclei timeout (no findings before cap)"}

        # Surface genuine tool errors (e.g. missing templates) instead of
        # reporting an empty-but-successful scan.
        if not out.strip() and rc not in (0, None):
            hint = ""
            if "no templates" in err.lower():
                hint = " — run `nuclei -update-templates` to install the template set"
            return {"success": False, "error": f"nuclei error (rc={rc}): {err.strip()[:300]}{hint}"}

        stdout = out.encode()  # downstream loop decodes again
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

        return {"success": True, "output": {"findings": findings, "total": len(findings), "url": url}}

    async def health_check(self) -> ToolHealthStatus:
        if shutil.which("nuclei"):
            return ToolHealthStatus(available=True, message="nuclei_scan")
        return ToolHealthStatus(available=False, message="nuclei binary not found")


def _severity_to_cvss(severity: str) -> float:
    return {"critical": 9.5, "high": 7.5, "medium": 5.5, "low": 2.5, "info": 0.0}.get(
        severity.lower(), 0.0
    )
