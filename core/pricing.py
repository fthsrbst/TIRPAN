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

import asyncio
import logging
import math
import time

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
    # DeepSeek (also used via OpenCode Go). These are static fallbacks used when
    # the live OpenRouter catalog (see _openrouter_prices) can't be reached — the
    # real numbers are pulled from OpenRouter and override these at runtime.
    "deepseek/deepseek-r1":          {"in": 0.55,  "out": 2.19},
    "deepseek-r1":                   {"in": 0.55,  "out": 2.19},
    "deepseek-chat":                 {"in": 0.27,  "out": 1.1},
    "deepseek/deepseek-v4-pro":      {"in": 0.435, "out": 0.87},
    "deepseek/deepseek-v4-flash":    {"in": 0.0983, "out": 0.1966},
}


# ── Live OpenRouter catalog ──────────────────────────────────────────────────────
# OpenRouter publishes per-token USD prices for ~350 models at a public, key-less
# endpoint. We pull that catalog and use it as the authoritative price source so
# operators don't have to hand-maintain a table. Results are cached in-process
# (TTL below) and mirrored to a DB setting so pricing survives restarts / offline.

_OPENROUTER_URL = "https://openrouter.ai/api/v1/models"
_OPENROUTER_TTL = 6 * 3600.0  # refresh at most every 6 hours
_OPENROUTER_CACHE_SETTING = "openrouter_pricing_cache"

_or_cache: dict[str, dict[str, float]] = {}
# Earliest time we'll attempt another refresh. Advanced after EVERY attempt —
# success or failure — so an unreachable endpoint can't trigger a (blocking)
# network call on every single record_usage(); callers just get the last table.
_or_next_refresh: float = 0.0
_or_lock = asyncio.Lock()


async def _openrouter_prices() -> dict[str, dict[str, float]]:
    """OpenRouter catalog → {model_id: {"in": x, "out": y}} in USD per 1M tokens.

    Cached in-process for _OPENROUTER_TTL and persisted to a DB setting so the
    last-known catalog is still available after a restart or while offline.
    Never raises — returns the best table it can (possibly empty).
    """
    global _or_cache, _or_next_refresh
    if time.time() < _or_next_refresh:
        return _or_cache

    async with _or_lock:
        # Another coroutine may have refreshed while we waited for the lock.
        if time.time() < _or_next_refresh:
            return _or_cache

        # Seed from the persisted cache on first use so a cold start is priced.
        if not _or_cache:
            try:
                from database import db as _db
                saved = await _db.get_setting(_OPENROUTER_CACHE_SETTING, None)
                if isinstance(saved, dict) and isinstance(saved.get("table"), dict):
                    _or_cache = saved["table"]
                    saved_ts = float(saved.get("ts") or 0)
                    if (time.time() - saved_ts) < _OPENROUTER_TTL:
                        # Still fresh — defer the next refresh until it expires.
                        _or_next_refresh = saved_ts + _OPENROUTER_TTL
                        return _or_cache
            except Exception as e:  # pragma: no cover
                logger.debug("openrouter cache load failed: %s", e)

        # Attempt a refresh. Whether it succeeds or fails, don't try again until
        # the TTL elapses — a dead endpoint must not stall every caller.
        _or_next_refresh = time.time() + _OPENROUTER_TTL
        try:
            import httpx
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(_OPENROUTER_URL)
                resp.raise_for_status()
                data = resp.json()
            table: dict[str, dict[str, float]] = {}
            for m in data.get("data", []):
                mid = m.get("id")
                pr = m.get("pricing") or {}
                try:
                    pin = float(pr.get("prompt") or 0) * 1_000_000
                    pout = float(pr.get("completion") or 0) * 1_000_000
                except (TypeError, ValueError):
                    continue
                if mid and (pin > 0 or pout > 0):
                    table[mid] = {"in": round(pin, 6), "out": round(pout, 6)}
            if table:
                _or_cache = table
                try:
                    from database import db as _db
                    await _db.set_setting(
                        _OPENROUTER_CACHE_SETTING,
                        {"ts": time.time(), "table": table},
                    )
                except Exception as e:  # pragma: no cover
                    logger.debug("openrouter cache persist failed: %s", e)
        except Exception as e:  # pragma: no cover — pricing must never break a call
            logger.debug("openrouter price fetch failed (using fallback): %s", e)

    return _or_cache


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
    """Return the effective price table.

    Layered, lowest priority first:
      1. DEFAULT_PRICING        — static fallbacks (used only when offline).
      2. live OpenRouter catalog — the authoritative auto-updating source.
      3. operator overrides      — the editable `model_pricing` setting wins.
    """
    table = dict(DEFAULT_PRICING)
    try:
        table.update(await _openrouter_prices())
    except Exception as e:  # pragma: no cover — never let pricing break a call
        logger.debug("openrouter merge failed: %s", e)
    try:
        from database import db as _db
        saved = await _db.get_setting("model_pricing", None)
        if saved:
            import json
            override = saved if isinstance(saved, dict) else json.loads(saved)
            for k, v in (override or {}).items():
                if isinstance(v, dict) and ("in" in v or "out" in v):
                    # Merge onto the existing entry so a one-sided override (only
                    # "in" or only "out") doesn't zero out the other side that the
                    # default / OpenRouter catalog already supplied.
                    merged = dict(table.get(k, {}))
                    if "in" in v:
                        merged["in"] = float(v.get("in", 0) or 0)
                    if "out" in v:
                        merged["out"] = float(v.get("out", 0) or 0)
                    table[k] = merged
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
            cost_usd=round(float(cost_usd or 0.0), 6),
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
