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
  generate_report(format, session_id)
                     — produce the final pentest report (formats: html, markdown, json)
    ALWAYS include session_id — it is injected below.
  report_finding(finding_type, data)
                     — add supplemental note or executive summary section

Workflow:
  1. generate_report(format="html", session_id="SESSION_ID_PLACEHOLDER") → full HTML report
  2. {"thought": "Report generated.", "action": "done", "parameters": {"findings_summary": "Report generated."}}
"""


class ReportingAgent(BaseSpecializedAgent):

    def get_available_tools(self) -> list[str]:
        return ["generate_report", "report_finding"]

    def build_messages(self) -> list[dict]:
        ctx_summary = self.ctx.to_summary() if self.ctx else ""
        tools_desc = _TOOLS_DESC.replace("SESSION_ID_PLACEHOLDER", self.session_id)
        system = f"""You are AEGIS ReportingAgent — the final stage of a penetration test engagement.

Your task is to generate a comprehensive pentest report based on all mission findings.

SESSION ID: {self.session_id}

MISSION STATE:
{ctx_summary}

{tools_desc}

Respond ONLY with a single valid JSON object:
{{"thought": "<your brief reasoning>", "action": "<tool_name>", "parameters": {{"param1": "value1"}}}}
"""
        return [{"role": "system", "content": system}] + self._build_memory_messages()

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "generate_report":
            await self._handle_report_generated(result, action_dict)
        elif tool_name == "report_finding":
            await self._process_report_finding(action_dict)

    async def _handle_report_generated(self, result: dict, action_dict: dict) -> None:
        if not result.get("success"):
            return
        data = result.get("output") or result
        params = action_dict.get("parameters", action_dict)
        report_format = params.get("format", "html")
        finding = {
            "type": "report_generated",
            "format": report_format,
            "path": data.get("path", data.get("output_path", "")),
            "size_bytes": data.get("size", 0),
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
