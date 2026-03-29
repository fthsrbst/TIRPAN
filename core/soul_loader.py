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

# Sections always included regardless of discovered services
_KB_ALWAYS_INCLUDE = {
    "How to Use This Reference",
    "Target Profiling Methodology",
    "Universal Rules",
}

# Maps section header keywords → service name patterns to match against
# discovered service strings (case-insensitive substring match)
_KB_SERVICE_MAP: dict[str, list[str]] = {
    "FTP":                              ["ftp"],
    "SSH":                              ["ssh", "openssh"],
    "SMB / Samba":                      ["smb", "samba", "netbios", "microsoft-ds", "cifs"],
    "HTTP / HTTPS":                     ["http", "https", "www", "apache", "nginx",
                                         "iis", "tomcat", "lighttpd", "httpd"],
    "CMS Platforms":                    ["http", "https", "www", "apache", "nginx",
                                         "iis", "tomcat", "wordpress", "drupal", "joomla"],
    "Windows — Active Directory":       ["smb", "ldap", "kerberos", "msrpc", "rdp",
                                         "microsoft", "windows", "netlogon"],
    "Database Services":                ["mysql", "mssql", "postgresql", "postgres",
                                         "redis", "mongodb", "oracle", "ms-sql", "db"],
    "R-Services":                       ["rsh", "rexec", "rlogin", "shell", "login",
                                         "exec", "remote"],
    "VoIP / Telephony":                 ["sip", "voip", "asterisk", "h.323"],
    "Network Equipment":                ["snmp", "cisco", "nfs", "tftp"],
    "Container & Cloud":                ["docker", "kubernetes", "k8s", "aws", "etcd"],
    "Distccd":                          ["distcc", "distccd"],
    "IRC":                              ["irc", "unreal"],
    "VNC":                              ["vnc"],
    "Telnet":                           ["telnet"],
}


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
        if name == "EXPLOIT_KB":
            self._cache.pop("__kb_sections__", None)
        return self.load(name)

    def _parse_kb_sections(self) -> dict[str, str]:
        """
        Parse EXPLOIT_KB.md into a dict of {section_title: section_content}.
        Result is cached on first call.
        """
        cache_key = "__kb_sections__"
        if cache_key in self._cache:
            import json as _json
            return _json.loads(self._cache[cache_key])

        raw = self.load("EXPLOIT_KB")
        sections: dict[str, str] = {}
        current_title = "__preamble__"
        current_lines: list[str] = []

        for line in raw.splitlines(keepends=True):
            if line.startswith("## "):
                if current_lines:
                    sections[current_title] = "".join(current_lines).strip()
                current_title = line[3:].strip()
                current_lines = [line]
            else:
                current_lines.append(line)

        if current_lines:
            sections[current_title] = "".join(current_lines).strip()

        import json as _json
        self._cache[cache_key] = _json.dumps(sections)
        return sections

    def build_dynamic_kb(self, discovered_services: list[str] | None = None) -> str:
        """
        Return a trimmed EXPLOIT_KB containing only sections relevant to
        the discovered services + always-included sections.

        If discovered_services is None or empty, returns the full KB.
        """
        if not discovered_services:
            return self.load("EXPLOIT_KB")

        sections = self._parse_kb_sections()
        service_lower = " ".join(discovered_services).lower()

        selected: list[str] = []

        # Preamble (intro text before first ## heading)
        if "__preamble__" in sections:
            selected.append(sections["__preamble__"])

        for title, content in sections.items():
            if title == "__preamble__":
                continue

            # Always-include sections
            if any(always in title for always in _KB_ALWAYS_INCLUDE):
                selected.append(content)
                continue

            # Match section to discovered services
            section_key = next(
                (k for k in _KB_SERVICE_MAP if k in title or title in k), None
            )
            if section_key is None:
                # Unknown section — include it to be safe
                selected.append(content)
                continue

            patterns = _KB_SERVICE_MAP[section_key]
            if any(p in service_lower for p in patterns):
                selected.append(content)

        result = "\n\n".join(selected)

        # Log compression ratio for debugging
        full_len = len(self.load("EXPLOIT_KB"))
        logger.debug(
            "dynamic_kb: %d/%d chars (%.0f%%) for services: %s",
            len(result), full_len,
            100 * len(result) / max(full_len, 1),
            discovered_services[:5],
        )
        return result

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
        # Dynamic: only inject KB sections relevant to discovered services
        exploit_kb = self.build_dynamic_kb(discovered_services)

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
