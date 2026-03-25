"""
report_finding — pseudo-tool used by specialized agents to surface findings.

This tool does not call any external binary. It simply echoes the parameters
back as a success result so that BaseAgent.act() accepts the call.
The actual finding logic is handled in each agent's process_result().
"""

from __future__ import annotations

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata


class ReportFindingTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="report_finding",
            category="reporting",
            description=(
                "Report a structured finding (host, vulnerability, session, credential, "
                "loot, etc.) to the Brain coordinator. "
                "Parameters: finding_type (str), data (dict)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "finding_type": {
                        "type": "string",
                        "description": (
                            "Type of finding: host | port | vulnerability | session | "
                            "credential | loot | subdomain | email | webapp_info | lateral_edge"
                        ),
                    },
                    "data": {
                        "type": "object",
                        "description": "Structured finding payload (fields depend on finding_type)",
                    },
                },
                "required": ["finding_type", "data"],
            },
        )

    async def execute(self, params: dict) -> dict:
        # Validate data is a dict; coerce strings to a note field
        data = params.get("data", {})
        if not isinstance(data, dict):
            data = {"note": str(data)}
        return {
            "success": True,
            "output": {
                "finding_type": params.get("finding_type", "unknown"),
                "data": data,
            },
        }

    async def health_check(self) -> ToolHealthStatus:
        return ToolHealthStatus(available=True, message="report_finding")
