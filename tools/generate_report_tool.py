"""
V2 — GenerateReportTool

Wraps the existing ReportGenerator to produce a final pentest report.
Used by ReportingAgent as the "generate_report" meta-tool.

Returns: {"success": True, "output": {"path": "...", "format": "...", "size": N}}
"""

from __future__ import annotations

import logging
from pathlib import Path

from tools.base_tool import BaseTool, ToolMetadata

logger = logging.getLogger(__name__)


class GenerateReportTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="generate_report",
            category="report",
            description="Generate the final penetration test report from session findings.",
            parameters={
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["html", "markdown", "json"],
                        "description": "Report format (default: html)",
                    },
                    "include_sections": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of sections to include",
                    },
                    "session_id": {
                        "type": "string",
                        "description": "Session ID (auto-injected by the agent runner if omitted)",
                    },
                },
                "required": [],
            },
        )

    async def execute(self, params: dict) -> dict:
        fmt = params.get("format", "html").lower()
        session_id = params.get("session_id", "")

        if not session_id:
            return {"success": False, "error": "session_id is required"}

        try:
            from reporting.report_generator import ReportGenerator, _REPORTS_DIR

            rg = ReportGenerator()

            if fmt == "html":
                html = await rg.generate_html(session_id)
                out_path = _REPORTS_DIR / f"{session_id}.html"
                out_path.write_text(html, encoding="utf-8")
                return {
                    "success": True,
                    "output": {
                        "format": "html",
                        "path": str(out_path),
                        "size": len(html),
                    },
                }
            elif fmt == "markdown":
                # Fallback: generate HTML and return a minimal markdown summary
                html = await rg.generate_html(session_id)
                out_path = _REPORTS_DIR / f"{session_id}.html"
                out_path.write_text(html, encoding="utf-8")
                return {
                    "success": True,
                    "output": {
                        "format": "html",  # produced html, markdown not templated
                        "path": str(out_path),
                        "size": len(html),
                        "note": "markdown template not available — HTML report generated",
                    },
                }
            elif fmt == "json":
                # Return context summary as JSON
                import json
                from web import session_manager
                agent = session_manager.get_agent(session_id)
                if agent and hasattr(agent, "_mission_ctx") and agent._mission_ctx:
                    ctx_dict = agent._mission_ctx.to_dict()
                else:
                    ctx_dict = {"session_id": session_id}
                out_path = _REPORTS_DIR / f"{session_id}.json"
                out_path.write_text(json.dumps(ctx_dict, indent=2), encoding="utf-8")
                return {
                    "success": True,
                    "output": {
                        "format": "json",
                        "path": str(out_path),
                        "size": out_path.stat().st_size,
                    },
                }
            else:
                return {"success": False, "error": f"Unknown format: {fmt}"}

        except Exception as exc:
            logger.error("generate_report error: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}
