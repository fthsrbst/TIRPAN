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

import logging
import time
from typing import Any

from core.base_agent import AgentResult, BaseAgent
from core.finding_classifier import finding_classifier
from core.message_bus import AgentMessage, AgentMessageBus, MessageType

logger = logging.getLogger(__name__)


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
        """
        Send a FINDING message to Brain (non-blocking).

        Before publishing, the finding is enriched with a "_cls" block produced
        by FindingClassifier (LLM zero-shot, fallback to rule-based).  The
        classifier runs with a hard timeout so it never blocks the agent loop.
        """
        enriched = await self._enrich_finding(finding)
        if self.bus is None:
            return
        await self.bus.send(AgentMessage(
            msg_type=MessageType.FINDING,
            sender_id=self.agent_id,
            payload={**enriched, "agent_id": self.agent_id,
                     "agent_type": self.agent_type, "target": self.target},
        ))

    async def _enrich_finding(self, finding: dict) -> dict:
        """Attach classification metadata to a finding dict under '_cls'."""
        if "_cls" in finding:
            return finding   # already classified upstream
        try:
            cls = await finding_classifier.classify(finding)
            return {**finding, "_cls": cls.to_dict()}
        except Exception as exc:
            logger.debug("_enrich_finding failed: %s", exc)
            return finding

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

    # ── Common report_finding handler ─────────────────────────────────────────

    async def _process_report_finding(self, action_dict: dict) -> None:
        """
        Handle a report_finding tool result.

        Reads from the validated tool result (action_dict["parameters"]) and
        safely coerces the data field to a dict so that **unpacking never fails.
        The finding is classified before being stored and published so that both
        the in-memory findings list and the Brain bus message carry "_cls".
        Subclasses may override for custom logic.
        """
        params = action_dict.get("parameters", action_dict)
        finding_type = params.get("finding_type", "unknown")
        data = params.get("data", {})
        if not isinstance(data, dict):
            data = {"note": str(data)}
        finding = {"type": finding_type, **data}
        enriched = await self._enrich_finding(finding)
        self._add_finding(enriched)
        await self.publish_finding(enriched)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _build_memory_messages(self) -> list[dict]:
        """
        Return memory messages for LLM context, with proper role mapping
        and token budgeting via build_context().

        If memory is empty (first iteration), returns a single starter
        user message so the LLM always has at least one user turn.
        """
        if not self.memory._messages:
            return [{"role": "user", "content": self._initial_user_message()}]
        return self.memory.build_context()

    def _initial_user_message(self) -> str:
        """
        Return a starter user message so the LLM has at least one user turn.

        Many OpenRouter / cloud models require messages to start with a user
        message — without it the API may error or the model may immediately
        return 'done'.
        """
        available = self.get_available_tools()
        return (
            f"You are assigned to target {self.target} with task: {self.task_type}. "
            f"Your available tools are: {available}. "
            f"Begin your work now. Call your first tool."
        )

    def _ml_hint_section(self) -> str:
        """Return a compact ML next-step hint block for the sub-agent system prompt."""
        if self.ctx is None:
            return ""
        try:
            from ml.attack_path import get_attack_path_suggester, _fallback_suggestions
            services: list[str] = []
            platforms: list[str] = []
            host_count = 0
            for host in self.ctx.hosts.values():
                host_count += 1
                if host.os_type:
                    platforms.append(host.os_type.lower())
                for port in host.ports:
                    if (port.state or "").lower() == "open" and port.service:
                        services.append(port.service.lower())
            has_shell = bool(getattr(self.ctx, "active_sessions", []))
            phase = (getattr(self.ctx, "phase", "exploitation") or "exploitation").lower()

            suggester = get_attack_path_suggester()
            if suggester is not None and suggester.is_built:
                suggs = suggester.suggest(
                    current_phase=phase,
                    services=list({s for s in services if s}),
                    used_ttps=[],
                    top_n=4,
                    host_count=max(host_count, 1),
                    has_shell=has_shell,
                    platforms=list({p for p in platforms if p}),
                )
            else:
                suggs = _fallback_suggestions(phase, 4, max(host_count, 1), has_shell,
                                             list({p for p in platforms if p}))
            if not suggs:
                return ""
            lines = ["## ML NEXT-STEP HINTS (advisory)", ""]
            for s in suggs:
                sd = s.to_dict() if hasattr(s, "to_dict") else s
                lines.append(
                    f"  {sd.get('ttp_id','?'):<10} {sd.get('tactic','?'):<20} "
                    f"conf={sd.get('confidence', 0):.2f}  {sd.get('ttp_name','?')}"
                )
            lines.append("")
            return "\n".join(lines)
        except Exception:
            return ""

    def _base_system(self, role: str, tools_description: str) -> str:
        ctx_summary = self.ctx.to_summary() if self.ctx else "(no context)"
        options_note = (
            f"\nOPTIONS: {self.options}" if self.options else ""
        )
        ml_hints = self._ml_hint_section()
        ml_section = f"\n{ml_hints}" if ml_hints else ""
        return f"""You are TIRPAN {role} — a specialized penetration testing sub-agent.

TARGET: {self.target}
TASK: {self.task_type}{options_note}

MISSION STATE:
{ctx_summary}
{ml_section}
{tools_description}

Rules:
- Focus exclusively on your assigned target ({self.target}) and task type.
- ONLY use tools listed in "Available tools" above. Do NOT call any other tool.
- If you cannot proceed with your available tools, call "done" immediately.
- Report every significant finding immediately with the appropriate tool.
- When done or if you cannot proceed further, respond with:
  {{"thought": "...", "action": "done", "parameters": {{"findings_summary": "..."}}}}
- Never exceed the permissions granted in the mission brief.

Respond ONLY with a single valid JSON object in this exact format:
{{"thought": "<your brief reasoning>", "action": "<tool_name>", "parameters": {{"param1": "value1", "param2": "value2"}}}}
"""
