"""
TIRPAN — Soul Loader
====================
Loads external SOUL.md files from the souls/ directory and injects
them into agent system prompts at runtime.

Usage:
    from core.soul_loader import SoulLoader
    soul = SoulLoader()
    brain_prompt = soul.build_brain_prompt(ctx_summary, active_agents, permissions)
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

# souls/ directory is always relative to the project root (parent of core/)
_SOULS_DIR = Path(__file__).parent.parent / "souls"


class SoulLoader:
    """Loads and caches soul files from the souls/ directory."""

    def __init__(self, souls_dir: Path | None = None) -> None:
        self._dir = souls_dir or _SOULS_DIR
        self._cache: dict[str, str] = {}

    def load(self, name: str) -> str:
        """Load a soul file by name (e.g. 'BRAIN_SOUL' or 'HACKER_MINDSET').
        Returns empty string if file not found (graceful degradation).
        """
        if name in self._cache:
            return self._cache[name]
        path = self._dir / f"{name}.md"
        if not path.exists():
            logger.warning("Soul file not found: %s", path)
            return ""
        try:
            content = path.read_text(encoding="utf-8")
            self._cache[name] = content
            return content
        except Exception as exc:
            logger.error("Failed to read soul file %s: %s", path, exc)
            return ""

    def reload(self, name: str) -> str:
        """Force reload from disk (bypass cache)."""
        self._cache.pop(name, None)
        return self.load(name)

    def reload_all(self) -> None:
        """Clear entire cache — all files reloaded on next access."""
        self._cache.clear()

    def build_brain_prompt(
        self,
        ctx_summary: str,
        active_agents: dict[str, str],
        permissions: dict[str, bool],
        playbook_section: str = "",
        discovered_services: list[str] | None = None,
    ) -> str:
        """Build the full BrainAgent system prompt from soul files + runtime context."""
        brain_soul = self.load("BRAIN_SOUL")
        mindset = self.load("HACKER_MINDSET")
        exploit_kb = self.load("EXPLOIT_KB")

        # Active agents table
        if active_agents:
            agents_lines = "\n".join(
                f"  {aid}  ({atype})" for aid, atype in active_agents.items()
            )
            agents_section = f"RUNNING AGENTS (use these exact IDs in wait_for_agents):\n{agents_lines}"
        else:
            agents_section = "RUNNING AGENTS: none"

        # Permissions
        perm_lines = "\n".join(
            f"  {k}: {v}" for k, v in permissions.items()
        )

        playbook_part = f"\n---\n\n{playbook_section}\n" if playbook_section.strip() else ""

        return f"""{brain_soul}

---

{mindset}

---

{exploit_kb}
{playbook_part}
---

## CURRENT MISSION STATE

{ctx_summary}

{agents_section}

## PERMISSIONS

{perm_lines}

---

## AVAILABLE META-TOOLS

  spawn_agent(agent_type, target, task_type, options)
    agent_type: scanner | exploit | post_exploit | webapp | osint | lateral | reporting
    Returns: {{"agent_id": "<id>", "status": "spawned"}}

  spawn_agents_batch(agents)
    agents: list of spawn_agent parameter dicts
    Spawns ALL agents simultaneously in one call. USE THIS after scan completes.
    Returns: {{"spawned": [{{"agent_id": ..., "agent_type": ...}}, ...]}}
    Example:
      {{"action": "spawn_agents_batch", "parameters": {{"agents": [
        {{"agent_type": "exploit", "target": "192.168.1.1", "task_type": "exploit_vsftpd"}},
        {{"agent_type": "exploit", "target": "192.168.1.1", "task_type": "exploit_samba"}},
        {{"agent_type": "webapp",  "target": "http://192.168.1.1", "task_type": "web_scan"}}
      ]}}}}

  wait_for_agents(agent_ids, timeout)
    agent_ids: list of agent_id strings OR "all" for all running agents
    After spawn_agents_batch, always call: wait_for_agents({{"agent_ids": "all"}})

  kill_agent(agent_id)
  update_context(item)   — types: host | vulnerability | session | credential | loot
  ask_operator(question, timeout)
  set_phase(phase)       — recon | scanning | exploitation | post_exploitation | reporting | done
  mission_done(summary)

---

## OUTPUT FORMAT

Respond ONLY with valid JSON:
{{"thought": "<reasoning — what you know, what you decided and WHY>", "action": "<tool_name>", "parameters": {{...}}}}
"""
