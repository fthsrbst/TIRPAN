"""
V2 — ReportingAgent

Generates the final pentest report from MissionContext data.
Brain spawns this as the last step, after all other agents complete.

Uses the existing report_generator.py + enriches with V2 multi-agent findings.
"""

from __future__ import annotations

import json
import logging
import time

from core.agents.base_specialized import BaseSpecializedAgent
from core.base_agent import AgentResult
from core.brain_agent import _register_agent_type

logger = logging.getLogger(__name__)

_TOOLS_DESC = """\
Available tools:
  generate_report(format, include_sections)
                     — produce the final pentest report (formats: html, markdown, json)
  report_finding(finding_type, data)
                     — add supplemental note or executive summary section

Workflow:
  1. generate_report(format="html") → full HTML report
  2. generate_report(format="markdown") → markdown summary
  3. {"action": "done", "findings_summary": "Report generated."}
"""


class ReportingAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        return ["generate_report", "report_finding"]

    def build_messages(self) -> list[dict]:
        ctx_summary = self.ctx.to_summary() if self.ctx else ""
        system = f"""You are AEGIS ReportingAgent — the final stage of a penetration test engagement.

Your task is to generate a comprehensive pentest report based on all mission findings.

MISSION STATE:
{ctx_summary}

{_TOOLS_DESC}

The report must include:
- Executive Summary
- Attack Narrative (timeline of compromise)
- Technical Findings (per host, per vulnerability)
- Credentials and Loot (if any)
- Remediation Recommendations
- Attack Path diagram description

Respond ONLY with a valid JSON action dict.
"""
        msgs = [{"role": "system", "content": system}]
        for m in self.memory._messages:
            msgs.append({"role": m.role, "content": m.content})
        return msgs

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "generate_report":
            await self._handle_report_generated(result, action_dict)
        elif tool_name == "report_finding":
            params = action_dict.get("parameters", action_dict)
            finding = {"type": params.get("finding_type", "report_note"),
                       **params.get("data", {})}
            self._add_finding(finding)
            await self.publish_finding(finding)

    async def _handle_report_generated(self, result: dict, action_dict: dict) -> None:
        if result.get("status") != "success":
            return
        params = action_dict.get("parameters", action_dict)
        report_format = params.get("format", "html")
        finding = {
            "type": "report_generated",
            "format": report_format,
            "path": result.get("path", result.get("output_path", "")),
            "size_bytes": result.get("size", 0),
            "generated_at": time.time(),
        }
        self._add_finding(finding)
        await self.publish_finding(finding)

    async def _build_context_report(self) -> dict:
        """Generate report directly from MissionContext when tool unavailable."""
        if not self.ctx:
            return {"status": "error", "error": "No MissionContext"}
        return {
            "status": "success",
            "summary": self.ctx.to_summary(),
            "hosts": len(self.ctx.hosts),
            "vulnerabilities": len(self.ctx.vulnerabilities),
            "sessions": len(self.ctx.active_sessions),
            "credentials": len(self.ctx.credentials),
            "loot": len(self.ctx.loot),
        }


_register_agent_type("reporting", "core.agents.reporting_agent", "ReportingAgent")
