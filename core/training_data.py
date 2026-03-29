"""
TIRPAN V2 — LoRA Training Data Collector
==========================================
Captures Brain agent iterations in Qwen3 ChatML instruction format
for fine-tuning via LoRA.

Each iteration produces one training example:
  - input  : system prompt + conversation history up to the LLM call
  - output : the action JSON produced by the LLM
  - label  : "positive" (successful / informative outcome)
             "negative" (error, blocked, failed attempt)

Output: data/training/{session_id}.jsonl
Each line is a self-contained JSON record.

Record schema:
{
  "messages": [
    {"role": "system",    "content": "..."},
    {"role": "user",      "content": "..."},
    ...
    {"role": "assistant", "content": "...action json..."}
  ],
  "label": "positive" | "negative",
  "metadata": {
    "session_id":    "...",
    "iteration":     N,
    "tool":          "...",
    "result_status": "...",
    "agent_type":    "brain",
    "timestamp":     "ISO8601"
  }
}
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_TRAINING_DIR = Path("data/training")

# Tools whose success is truly meaningful (exclude housekeeping meta-tools
# that always succeed and carry no signal).
_HIGH_SIGNAL_TOOLS = {
    "spawn_agent",
    "spawn_agents_batch",
    "update_context",
    "set_phase",
    "mission_done",
}

# Tools we never want as positive examples because they're always "ok"
# and add noise to the training corpus.
_LOW_SIGNAL_TOOLS = {"ask_operator"}


def _determine_label(tool_name: str, result: dict) -> str:
    """
    Assign a training label based on tool outcome.

    Positive:
      - Tool succeeded AND is a high-signal tool (real progress)
      - wait_for_agents returned completed agents
      - kill_agent succeeded

    Negative:
      - Any error
      - Blocked / not available
      - wait_for_agents timed out
      - spawn with already_running (waste of an iteration)
    """
    error = result.get("error") or ""
    output = result.get("output") or {}
    success = result.get("success", False)

    # Hard-fail
    if not success:
        return "negative"

    # Error string present
    if error:
        return "negative"

    if tool_name == "wait_for_agents":
        inner = output if isinstance(output, dict) else {}
        timed_out = inner.get("timed_out", [])
        completed = inner.get("completed", [])
        if timed_out and not completed:
            return "negative"
        # Partially completed is still a positive signal
        return "positive" if completed else "negative"

    if tool_name == "spawn_agent":
        inner = output if isinstance(output, dict) else {}
        spawn_status = inner.get("status", "")
        if spawn_status == "already_running":
            return "negative"  # redundant spawn — bad reasoning
        if spawn_status == "error":
            return "negative"
        return "positive"

    if tool_name == "spawn_agents_batch":
        inner = output if isinstance(output, dict) else {}
        spawned = len(inner.get("spawned", []))
        errors = len(inner.get("errors", []))
        if errors > spawned:
            return "negative"
        return "positive" if spawned > 0 else "negative"

    if tool_name in _LOW_SIGNAL_TOOLS:
        return "negative"  # too noisy

    # Default: success = positive
    return "positive" if success else "negative"


class TrainingDataCollector:
    """
    Append-only training data writer.

    Thread-safe for a single asyncio event loop (writes are synchronous
    file appends — fast enough to not warrant async IO at this scale).
    """

    def __init__(self) -> None:
        _TRAINING_DIR.mkdir(parents=True, exist_ok=True)

    def record(
        self,
        *,
        session_id: str,
        iteration: int,
        messages: list[dict],
        action_dict: dict,
        result: dict,
        agent_type: str = "brain",
    ) -> None:
        """
        Save one Brain iteration as a training example.

        Parameters
        ----------
        session_id   : current session ID (used for file name)
        iteration    : Brain iteration counter
        messages     : full message list passed to the LLM (system + history)
        action_dict  : the action JSON the LLM produced (will become the
                       assistant turn in the training record)
        result       : tool execution result {"success", "output", "error"}
        agent_type   : defaults to "brain"
        """
        if not messages:
            return

        tool_name = (
            action_dict.get("action")
            or action_dict.get("tool", "unknown")
        )
        label = _determine_label(tool_name, result)

        # Build assistant content: the raw action JSON as the LLM produced it.
        # We use the full action_dict (thought + action + parameters) so the
        # fine-tuned model learns the complete output format.
        assistant_content = json.dumps(action_dict, ensure_ascii=False)

        # Build the training message list: system + conversation + assistant turn.
        # Strip any trailing assistant messages (the LLM output is added by us).
        training_messages = [m for m in messages if m.get("role") != "assistant"]
        # Also remove the last user message if it's just the initial "Mission target" stub
        # (it adds no signal — the system prompt already contains the mission context).
        training_messages.append({"role": "assistant", "content": assistant_content})

        record: dict[str, Any] = {
            "messages": training_messages,
            "label": label,
            "metadata": {
                "session_id":    session_id,
                "iteration":     iteration,
                "tool":          tool_name,
                "result_status": "ok" if result.get("success") else "error",
                "agent_type":    agent_type,
                "timestamp":     datetime.now(timezone.utc).isoformat(),
            },
        }

        # Check runtime toggle — import here to avoid circular import at module load
        from config import settings as _settings
        if not _settings.collect_training_data:
            return

        out_path = _TRAINING_DIR / f"{session_id}.jsonl"
        try:
            with open(out_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        except OSError as exc:
            logger.warning("training_data: failed to write to %s: %s", out_path, exc)
            return

        logger.debug(
            "training_data[%s] iter=%d tool=%s label=%s",
            session_id[:8], iteration, tool_name, label,
        )

    def count(self, session_id: str) -> int:
        """Return number of training examples saved for a session."""
        p = _TRAINING_DIR / f"{session_id}.jsonl"
        if not p.exists():
            return 0
        with open(p, encoding="utf-8") as fh:
            return sum(1 for _ in fh)

    def export_session(self, session_id: str) -> list[dict]:
        """Load all training records for a session (for inspection / export)."""
        p = _TRAINING_DIR / f"{session_id}.jsonl"
        if not p.exists():
            return []
        records = []
        with open(p, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        return records

    def label_stats(self, session_id: str) -> dict[str, int]:
        """Return positive/negative counts for a session."""
        records = self.export_session(session_id)
        pos = sum(1 for r in records if r.get("label") == "positive")
        neg = sum(1 for r in records if r.get("label") == "negative")
        return {"positive": pos, "negative": neg, "total": len(records)}


# Module-level singleton
_collector: TrainingDataCollector | None = None


def get_collector() -> TrainingDataCollector:
    global _collector
    if _collector is None:
        _collector = TrainingDataCollector()
    return _collector
