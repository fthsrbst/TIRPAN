"""
TIRPAN — ChatAgent

A conversational agent that can directly invoke penetration testing tools
when the operator asks for actions like "scan 192.168.56.101" or
"exploit the FTP service".

Unlike BrainAgent (which orchestrates sub-agents) and specialized agents
(which are single-purpose executors), ChatAgent is the operator's direct
interface: it combines the full soul set (BRAIN_SOUL + HACKER_MINDSET +
EXPLOIT_KB) with all registered tools.

Design:
  - One ChatAgent instance per WebSocket connection (per-connection persistence)
  - Each user message: call inject_user_message() then run()
  - "chat_reply" is a terminal pseudo-action (not in ToolRegistry)
    intercepted in handle_terminal_action() before act() pipeline
  - process_result() is a no-op — no finding accumulation needed in chat
  - max_iterations=20 per message to bound long-running tasks
"""

from __future__ import annotations

import logging

from core.base_agent import AgentState, BaseAgent
from core.soul_loader import SoulLoader

logger = logging.getLogger(__name__)


class ChatAgent(BaseAgent):
    """
    Operator-facing conversational agent with direct access to all tools.

    Constructor kwargs (passed through to BaseAgent):
        mission_id:      str            (required)
        tool_registry:   ToolRegistry   (required — should be the app-level registry)
        safety:          SafetyGuard    (optional, default SafetyGuard())
        agent_id:        str            (optional)
        context:         str            (optional — extra context injected into system prompt)
    """

    _soul = SoulLoader()  # class-level singleton

    def __init__(self, **kwargs):
        self._chat_context: str = kwargs.pop("context", "")

        kwargs.setdefault("agent_type", "chat")
        kwargs.setdefault("max_iterations", 20)
        kwargs.setdefault("memory_max_messages", 100)
        kwargs.setdefault("memory_max_tokens", 8192)

        super().__init__(**kwargs)

        self._final_reply: str = ""
        self._tools_desc: str = ""  # cached tool description string

    # ── Tool description builder ──────────────────────────────────────────────

    def _build_tools_desc(self) -> str:
        """Build a compact tool list for the system prompt. Cached after first call."""
        if self._tools_desc:
            return self._tools_desc

        tools = self._registry.list_for_llm()
        if not tools:
            self._tools_desc = "No tools available."
            return self._tools_desc

        lines = ["## AVAILABLE TOOLS\n"]
        for t in tools:
            name = t.get("name", "")
            desc = t.get("description", "")
            lines.append(f"  {name}: {desc}")
            props = t.get("parameters", {}).get("properties", {})
            required = t.get("parameters", {}).get("required", [])
            for param, spec in props.items():
                req_marker = " (required)" if param in required else ""
                pdesc = spec.get("description", "")
                lines.append(f"    - {param}{req_marker}: {pdesc}")

        self._tools_desc = "\n".join(lines)
        return self._tools_desc

    # ── BaseAgent abstract interface ──────────────────────────────────────────

    def get_available_tools(self) -> list[str]:
        """Chat agent may use ALL registered tools."""
        return [t.metadata.name for t in self._registry.list_tools()]

    def build_messages(self) -> list[dict]:
        system = self._soul.build_chat_prompt(
            self._build_tools_desc(), self._chat_context
        )
        msgs = [{"role": "system", "content": system}]
        if not self.memory._messages:
            # BaseAgent.run() needs at least one user message to start
            msgs.append({"role": "user", "content": "Ready. Awaiting operator command."})
            return msgs

        # Send the FULL conversation history — no token-budget truncation.
        # tool_result is mapped to "user" for OpenAI-compatible API.
        _role_map = {"tool_result": "user"}
        for m in self.memory._messages:
            if m.content:
                msgs.append({
                    "role": _role_map.get(m.role, m.role),
                    "content": m.content,
                })
        return msgs

    async def handle_terminal_action(self, action_dict: dict) -> bool:
        """
        Intercept terminal actions before they reach act().

        chat_reply    → primary terminal (message field used as reply)
        done          → fallback terminal (findings_summary / summary used as reply)
        mission_done  → BrainAgent-style terminal (narrative / summary used as reply)
        """
        action = action_dict.get("action", "")
        params = action_dict.get("parameters", {}) or {}

        if action == "chat_reply":
            self._final_reply = params.get("message", "")
            self.emit_event("chat_reply", {"message": self._final_reply})
            return True

        if action in ("done", "mission_done"):
            # Extract whatever text the model put in the terminal action
            self._final_reply = (
                params.get("message")
                or params.get("narrative")
                or params.get("findings_summary")
                or params.get("summary")
                or ""
            )
            self.emit_event("chat_reply", {"message": self._final_reply})
            return True

        return False

    async def process_result(
        self, tool_name: str, result: dict, action_dict: dict
    ) -> None:
        """No finding accumulation needed in chat mode."""

    # ── Chat-specific helpers ─────────────────────────────────────────────────

    def inject_user_message(self, content: str) -> None:
        """
        Prepare the agent for a new user message.

        Persists the previous turn's chat_reply into memory first (so the
        model sees its own previous spoken response), then adds the new user
        message and resets the iteration counter + state.
        """
        # Store the previous assistant reply so the model remembers what it said
        if self._final_reply:
            self.memory.add_assistant(self._final_reply)

        self.memory.add_user(content)
        self._final_reply = ""
        self._iteration = 0
        self._state = AgentState.IDLE

    def get_final_reply(self) -> str:
        """Return the assistant's reply text after run() completes."""
        return self._final_reply
