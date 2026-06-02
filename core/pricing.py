"""
LLM cost accounting — token estimation, per-model pricing, usage recording.

Token usage is captured at two points:
  - core/base_agent.py reason()  — autonomous pentest agents (streamed)
  - web/websocket_handler.py      — interactive chat

When the provider returns a real `usage` block (OpenRouter with
stream_options.include_usage, or Ollama's prompt_eval_count/eval_count) we use
it verbatim. Otherwise we fall back to a lightweight char-based estimate and
mark the row `is_estimated=1`.

Pricing is a DB-persisted, operator-editable table (`model_pricing` setting),
expressed in USD per 1M tokens. Local providers (Ollama / LM Studio) are always
free. Unknown cloud models default to $0 until the operator adds a price.
"""

from __future__ import annotations

import logging
import math

logger = logging.getLogger(__name__)

# Providers whose inference runs locally → no per-token cost, ever.
_LOCAL_PROVIDERS = frozenset({"ollama", "lmstudio"})

# Default price table — USD per 1M tokens, {model_key: {"in": x, "out": y}}.
# Keys match what providers report. Operators can override / extend any of these
# from Settings → Billing (persisted to the `model_pricing` setting).
DEFAULT_PRICING: dict[str, dict[str, float]] = {
    # Anthropic (OpenRouter-style and bare ids)
    "anthropic/claude-sonnet-4-6":   {"in": 3.0,  "out": 15.0},
    "anthropic/claude-opus-4-8":     {"in": 15.0, "out": 75.0},
    "anthropic/claude-3-7-sonnet":   {"in": 3.0,  "out": 15.0},
    "anthropic/claude-3.5-sonnet":   {"in": 3.0,  "out": 15.0},
    "anthropic/claude-3-5-haiku":    {"in": 0.8,  "out": 4.0},
    "claude-3-7-sonnet":             {"in": 3.0,  "out": 15.0},
    "claude-3-5-haiku":              {"in": 0.8,  "out": 4.0},
    # OpenAI
    "openai/gpt-4o":                 {"in": 2.5,  "out": 10.0},
    "openai/gpt-4o-mini":            {"in": 0.15, "out": 0.6},
    # DeepSeek (also used via OpenCode Go)
    "deepseek/deepseek-r1":          {"in": 0.55, "out": 2.19},
    "deepseek-r1":                   {"in": 0.55, "out": 2.19},
    "deepseek-chat":                 {"in": 0.27, "out": 1.1},
}


# ── Token estimation ────────────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """Rough char-based token estimate (~4 chars/token). Never returns < 0."""
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 4))


def estimate_message_tokens(messages: list[dict]) -> int:
    """Estimate prompt tokens for a chat-style message list (+~4/message overhead)."""
    total = 0
    for m in messages or []:
        content = m.get("content", "") if isinstance(m, dict) else str(m)
        total += estimate_tokens(content) + 4
    return total


# ── Pricing ─────────────────────────────────────────────────────────────────────

async def get_pricing() -> dict[str, dict[str, float]]:
    """Return the effective price table: persisted overrides merged over defaults."""
    table = dict(DEFAULT_PRICING)
    try:
        from database import db as _db
        saved = await _db.get_setting("model_pricing", None)
        if saved:
            import json
            override = saved if isinstance(saved, dict) else json.loads(saved)
            for k, v in (override or {}).items():
                if isinstance(v, dict) and ("in" in v or "out" in v):
                    table[k] = {
                        "in": float(v.get("in", 0) or 0),
                        "out": float(v.get("out", 0) or 0),
                    }
    except Exception as e:  # pragma: no cover — pricing must never break a call
        logger.debug("get_pricing override load failed: %s", e)
    return table


def _lookup_price(table: dict, model: str) -> dict[str, float] | None:
    """Match a model id against the price table — exact, then suffix after '/'."""
    if not model:
        return None
    if model in table:
        return table[model]
    # OpenRouter ids are "vendor/model"; allow matching the bare model name too.
    tail = model.split("/")[-1]
    if tail in table:
        return table[tail]
    for key, val in table.items():
        if key.split("/")[-1] == tail:
            return val
    return None


async def price_for(
    provider: str, model: str, prompt_tokens: int, completion_tokens: int
) -> float:
    """Compute USD cost for a single call. Local providers are always $0."""
    if (provider or "").lower() in _LOCAL_PROVIDERS:
        return 0.0
    table = await get_pricing()
    price = _lookup_price(table, model)
    if not price:
        return 0.0
    return (
        (prompt_tokens / 1_000_000.0) * price.get("in", 0.0)
        + (completion_tokens / 1_000_000.0) * price.get("out", 0.0)
    )


# ── Recording ────────────────────────────────────────────────────────────────────

async def record_usage(
    *,
    session_id: str = "",
    user_id: str = "",
    org_id: str = "",
    provider: str = "",
    model: str = "",
    agent_type: str = "",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    is_estimated: bool = False,
    cost_usd: float | None = None,
) -> None:
    """Persist one LLM call's token + cost usage. Never raises into the caller."""
    try:
        prompt_tokens = max(0, int(prompt_tokens or 0))
        completion_tokens = max(0, int(completion_tokens or 0))
        if prompt_tokens == 0 and completion_tokens == 0:
            return

        if cost_usd is None:
            cost_usd = await price_for(provider, model, prompt_tokens, completion_tokens)

        # Resolve org from user when not supplied, so per-org rollups work even
        # for agent calls that only know the owning user.
        if user_id and not org_id:
            try:
                from database.repositories import UserRepository
                u = await UserRepository().get_by_id(user_id)
                if u:
                    org_id = u.get("org_id") or ""
            except Exception:
                pass

        from database.repositories import UsageRepository
        await UsageRepository().insert(
            session_id=session_id or "",
            user_id=user_id or "",
            org_id=org_id or "",
            provider=provider or "",
            model=model or "",
            agent_type=agent_type or "",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=float(cost_usd or 0.0),
            is_estimated=bool(is_estimated),
        )

        # Keep the legacy in-memory live counter in sync (system stats widget).
        try:
            from web.stats_state import token_counter
            token_counter.add(prompt_tokens=prompt_tokens, eval_tokens=completion_tokens)
        except Exception:
            pass
    except Exception as e:  # pragma: no cover
        logger.warning("record_usage failed (non-fatal): %s", e)
