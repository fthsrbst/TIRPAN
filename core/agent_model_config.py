"""
Agent model configuration normalization.

Provides normalize_agent_models() which cleans up and applies inheritance
rules to a per-agent model override dict before it reaches BrainAgent or
routes.py.

Inheritance rules (applied only when target key has no override):
  scanner  → exploit, webapp
  osint    → lateral
"""

from __future__ import annotations

# Keys accepted in the agent_models dict and their canonical names.
_CANONICAL_KEYS: set[str] = {
    "brain",
    "scanner",
    "exploit",
    "webapp",
    "postexploit",
    "post_exploit",
    "osint",
    "lateral",
    "reporting",
}

# Spread rules: if source key is present, copy to targets that are absent.
_SPREAD_RULES: list[tuple[str, str]] = [
    ("scanner", "exploit"),
    ("scanner", "webapp"),
    ("osint",   "lateral"),
]


def normalize_agent_models(raw: dict) -> dict:
    """
    Normalize a per-agent model override dict.

    - Strips entries with no provider and no model.
    - Normalises 'post_exploit' → 'postexploit' (both spellings accepted).
    - Applies spread rules so scanner config is inherited by exploit/webapp
      and osint config is inherited by lateral when no explicit override exists.
    - Returns a new dict; does not mutate the input.
    """
    if not raw or not isinstance(raw, dict):
        return {}

    result: dict = {}

    for key, cfg in raw.items():
        if not isinstance(cfg, dict):
            continue
        # Normalise key spelling
        norm_key = "postexploit" if key == "post_exploit" else key
        # Only keep entries with at least a provider or model
        if cfg.get("provider") or cfg.get("model"):
            result[norm_key] = {
                "provider": cfg.get("provider", ""),
                "model":    cfg.get("model", ""),
            }

    # Apply inheritance / spread rules
    for src, dst in _SPREAD_RULES:
        if src in result and dst not in result:
            result[dst] = result[src].copy()

    return result
