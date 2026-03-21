"""
V2 — BaseSpecializedAgent

Common mixin for all specialized agents (Scanner, Exploit, PostExploit, etc.).

Adds:
  - message_bus / mission_context injection (not in BaseAgent)
  - publish_finding()  → sends FINDING message to Brain via bus
  - publish_done()     → sends AGENT_DONE to Brain
  - Structured system prompt skeleton
  - V2 constructor kwargs stripping (message_bus, mission_context, target, task_type)
"""

from __future__ import annotations

import time
from typing import Any

from core.base_agent import AgentResult, BaseAgent
from core.message_bus import AgentMessage, AgentMessageBus, MessageType


class BaseSpecializedAgent(BaseAgent):
    """
    Abstract base for all specialized agents.

    Constructor accepts (in addition to BaseAgent kwargs):
        message_bus:     AgentMessageBus  (optional — safe no-op if absent)
        mission_context: MissionContext   (optional — read-only reference)
        target:          str              (primary target for this task)
        task_type:       str              (e.g. "scan", "exploit", "post_exploit")
    """

    def __init__(self, **kwargs):
        self.bus: AgentMessageBus | None = kwargs.pop("message_bus", None)
        self.ctx = kwargs.pop("mission_context", None)
        self.target: str = kwargs.pop("target", "")
        self.task_type: str = kwargs.pop("task_type", "")
        self.options: dict = kwargs.pop("options", {})
        super().__init__(**kwargs)

    # ── Bus helpers ───────────────────────────────────────────────────────────

    async def publish_finding(self, finding: dict) -> None:
        """Send a FINDING message to Brain (non-blocking)."""
        if self.bus is None:
            return
        await self.bus.send(AgentMessage(
            msg_type=MessageType.FINDING,
            sender_id=self.agent_id,
            payload={**finding, "agent_id": self.agent_id,
                     "agent_type": self.agent_type, "target": self.target},
        ))

    async def publish_done(self, result: AgentResult) -> None:
        """Notify Brain that this agent completed (normally called by _run_child in Brain)."""
        if self.bus is None:
            return
        await self.bus.send(AgentMessage(
            msg_type=MessageType.AGENT_DONE,
            sender_id=self.agent_id,
            payload={
                "agent_id":    self.agent_id,
                "agent_type":  self.agent_type,
                "status":      result.status,
                "findings":    result.findings,
                "iterations":  result.iterations,
                "error":       result.error or "",
            },
        ))

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _base_system(self, role: str, tools_description: str) -> str:
        ctx_summary = self.ctx.to_summary() if self.ctx else "(no context)"
        options_note = (
            f"\nOPTIONS: {self.options}" if self.options else ""
        )
        return f"""You are AEGIS {role} — a specialized penetration testing sub-agent.

TARGET: {self.target}
TASK: {self.task_type}{options_note}

MISSION STATE:
{ctx_summary}

{tools_description}

Rules:
- Focus exclusively on your assigned target ({self.target}) and task type.
- Always include the "target" parameter when calling scan/lookup tools — use {self.target}.
- Report every significant finding immediately with the appropriate tool.
- When done or if you cannot proceed further, respond with:
  {{"thought": "...", "action": "done", "parameters": {{"findings_summary": "..."}}}}
- Never exceed the permissions granted in the mission brief.

Respond ONLY with a single valid JSON object in this exact format:
{{"thought": "<your brief reasoning>", "action": "<tool_name>", "parameters": {{"param1": "value1", "param2": "value2"}}}}

Example for nmap_scan:
{{"thought": "Starting with a ping scan on the target to check if it's alive.", "action": "nmap_scan", "parameters": {{"target": "{self.target}", "scan_type": "ping"}}}}
"""
