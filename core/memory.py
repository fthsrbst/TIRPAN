"""
Phase 7 — Session Memory

Manages the LLM conversation history for a single pentest session.
Handles token budgeting, auto-truncation, and critical finding pinning.
"""

from __future__ import annotations

import logging
from collections import deque
from typing import Literal

logger = logging.getLogger(__name__)

MessageRole = Literal["system", "user", "assistant", "tool_result"]

# Rough token estimation: 1 token ≈ 4 characters
_CHARS_PER_TOKEN = 4

# Default limits
DEFAULT_MAX_MESSAGES = 50
DEFAULT_MAX_TOKENS = 4096


class Message:
    """A single message in the conversation history."""

    __slots__ = ("role", "content", "pinned")

    def __init__(self, role: MessageRole, content: str, pinned: bool = False):
        self.role = role
        self.content = content
        self.pinned = pinned  # pinned messages are never auto-truncated

    @property
    def estimated_tokens(self) -> int:
        return max(1, len(self.content) // _CHARS_PER_TOKEN)

    def to_dict(self) -> dict:
        return {"role": self.role, "content": self.content, "pinned": self.pinned}

    @classmethod
    def from_dict(cls, data: dict) -> Message:
        return cls(
            role=data["role"],
            content=data["content"],
            pinned=data.get("pinned", False),
        )

    def __repr__(self) -> str:
        pin = " [PINNED]" if self.pinned else ""
        preview = self.content[:50].replace("\n", " ")
        return f"Message({self.role}{pin}: {preview!r})"


class SessionMemory:
    """
    Bounded conversation memory for a pentest session.

    - Keeps up to `max_messages` messages in a sliding window.
    - Pinned messages (critical findings) survive auto-truncation.
    - `build_context()` returns a token-budget-aware messages list for the LLM.
    - Serializable via `to_dict()` / `from_dict()` for database persistence.
    """

    def __init__(
        self,
        max_messages: int = DEFAULT_MAX_MESSAGES,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ):
        self.max_messages = max_messages
        self.max_tokens = max_tokens
        # No maxlen — we enforce the limit manually to protect pinned messages
        self._messages: deque[Message] = deque()

    # ------------------------------------------------------------------
    # Add messages
    # ------------------------------------------------------------------

    def add(self, role: MessageRole, content: str, pinned: bool = False) -> None:
        """Add a message to the history, evicting oldest non-pinned if at capacity."""
        msg = Message(role=role, content=content, pinned=pinned)
        self._messages.append(msg)

        # Enforce max_messages: drop oldest non-pinned messages first
        while len(self._messages) > self.max_messages:
            evicted = False
            for i, m in enumerate(self._messages):
                if not m.pinned:
                    del self._messages[i]  # deque supports del by index in Python 3.5+
                    evicted = True
                    break
            if not evicted:
                # All messages are pinned — drop the oldest regardless
                self._messages.popleft()
                break

        logger.debug("Memory: added %s message (%d tokens)", role, msg.estimated_tokens)

    def add_system(self, content: str) -> None:
        self.add("system", content)

    def add_user(self, content: str) -> None:
        self.add("user", content)

    def add_assistant(self, content: str) -> None:
        self.add("assistant", content)

    def add_tool_result(self, content: str, pinned: bool = False) -> None:
        """Add a tool result. Pin it if it contains a critical finding."""
        self.add("tool_result", content, pinned=pinned)

    def pin(self, index: int) -> None:
        """Pin a message by index (0-based) so it survives truncation."""
        messages = list(self._messages)
        if 0 <= index < len(messages):
            messages[index].pinned = True

    # ------------------------------------------------------------------
    # Build context for LLM
    # ------------------------------------------------------------------

    def build_context(self, max_tokens: int | None = None) -> list[dict]:
        """
        Build the messages list to send to the LLM.

        Fits within `max_tokens` budget by dropping old non-pinned messages first.
        Pinned messages are always included.
        Returns a list of {"role": ..., "content": ...} dicts.
        """
        budget = max_tokens or self.max_tokens
        all_messages = list(self._messages)

        # Separate pinned and normal messages
        pinned = [m for m in all_messages if m.pinned]
        normal = [m for m in all_messages if not m.pinned]

        # Always include pinned messages
        pinned_tokens = sum(m.estimated_tokens for m in pinned)
        remaining_budget = budget - pinned_tokens

        # Fill remaining budget with most recent normal messages
        selected_normal: list[Message] = []
        for msg in reversed(normal):
            if remaining_budget <= 0:
                break
            if msg.estimated_tokens <= remaining_budget:
                selected_normal.insert(0, msg)
                remaining_budget -= msg.estimated_tokens

        # Merge: pinned first (in original order), then normal
        pinned_set = {id(m) for m in pinned}
        result: list[Message] = []
        for msg in all_messages:
            if id(msg) in pinned_set or msg in selected_normal:
                result.append(msg)

        # OpenAI-compatible APIs only accept "system", "user", "assistant" roles.
        # Map internal "tool_result" role to "user" before sending.
        _role_map = {"tool_result": "user"}
        return [
            {"role": _role_map.get(m.role, m.role), "content": m.content}
            for m in result
            if m.content  # skip messages with empty content
        ]

    # ------------------------------------------------------------------
    # Token counting
    # ------------------------------------------------------------------

    @property
    def estimated_tokens(self) -> int:
        """Rough total token count for all messages."""
        return sum(m.estimated_tokens for m in self._messages)

    @property
    def message_count(self) -> int:
        return len(self._messages)

    @property
    def pinned_count(self) -> int:
        return sum(1 for m in self._messages if m.pinned)

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """Serialize for database storage."""
        return {
            "max_messages": self.max_messages,
            "max_tokens": self.max_tokens,
            "messages": [m.to_dict() for m in self._messages],
        }

    @classmethod
    def from_dict(cls, data: dict) -> SessionMemory:
        """Deserialize from database storage."""
        memory = cls(
            max_messages=data.get("max_messages", DEFAULT_MAX_MESSAGES),
            max_tokens=data.get("max_tokens", DEFAULT_MAX_TOKENS),
        )
        for msg_data in data.get("messages", []):
            msg = Message.from_dict(msg_data)
            memory._messages.append(msg)
        return memory

    def clear(self) -> None:
        """Clear all messages (including pinned)."""
        self._messages.clear()

    def __len__(self) -> int:
        return len(self._messages)

    def __repr__(self) -> str:
        return (
            f"SessionMemory("
            f"messages={self.message_count}, "
            f"pinned={self.pinned_count}, "
            f"tokens≈{self.estimated_tokens})"
        )
