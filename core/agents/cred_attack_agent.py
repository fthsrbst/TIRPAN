"""
V2 — CredAttackAgent

Dedicated lane for credential attacks (brute-force / password guessing).

Why its own agent (redesign doc §7): in session test1, brute NSE scripts
(ssh-brute, vnc-brute) ran *inside scanner agents* on the 600s scanner budget,
held a slot in the main spawn pool, produced 0 results and timed out — stalling
the whole mission. Credential attacks are slow by nature and should run in the
**background** on their own pool while the brain keeps working; the operator
explicitly asked for this ("brute-force'lar arkaplanda çalışsın, brain başka
işlere devam etsin").

Brain spawns this (fire-and-forget — it is excluded from wait_for_agents("all"))
when a service worth guessing credentials for is found. Findings reported:
  - credential  (type="credential" — username/password per host/service)
"""

from __future__ import annotations

import logging
from typing import Any

from core.agents.base_specialized import BaseSpecializedAgent
from core.brain_agent import _register_agent_type

logger = logging.getLogger(__name__)

_TOOLS_DESC = """\
Available tools:
  hydra_bruteforce(target, service, username|userlist, password|passlist, port, tasks, delay)
    service: ssh | ftp | telnet | smb | rdp | vnc | mysql | postgres | http-get | ...
    Omit username/passlist to use sensible defaults (common users + bundled wordlist).
  nmap_scan(target, scan_type, port_range, scripts)   [for NSE *-brute scripts as fallback]
  report_finding(finding_type, data)                  [report a discovery to Brain]

Role — CREDENTIAL ATTACK (background):
  1. You are given ONE service to attack (host + port + service). Guess credentials.
  2. Prefer hydra_bruteforce. Start with common creds:
       users:  root, admin, administrator, ubuntu, pi, user, guest
       passes: (blank), password, 123456, admin, toor, raspberry, root
  3. If hydra is unavailable for the service, fall back to the matching nmap NSE
     brute script (e.g. ssh-brute, vnc-brute, smb-brute).
  4. On ANY valid credential → report_finding(finding_type="credential",
       data={host, port, service, username, password}). Then call done.
  5. If nothing after a full wordlist pass, report what you tried and call done.

CRITICAL RULES:
- ONLY report credentials hydra/nmap actually returned. NEVER fabricate creds.
- One service per agent — do NOT pivot to other hosts/ports.
- Do NOT repeat the exact same (service, userlist, passlist) combination.
"""


class CredAttackAgent(BaseSpecializedAgent):
    """Background credential-attack agent (brute-force lane)."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._attempt_count = 0
        # Brute is allowed to run long (operator's call), so a generous cap —
        # the wall-clock budget in brain_agent is the real bound.
        self._max_attempts = 20

    def get_available_tools(self) -> list[str]:
        tools = ["report_finding"]
        if self._registry and self._registry.has("hydra_bruteforce"):
            tools.insert(0, "hydra_bruteforce")
        if self._registry and self._registry.has("nmap_scan"):
            tools.append("nmap_scan")
        return tools

    def build_messages(self) -> list[dict]:
        system = self._base_system("CredAttackAgent", _TOOLS_DESC)
        return [{"role": "system", "content": system}] + self._build_memory_messages()

    def _summarize_tool_output(self, tool_name: str, raw_output: Any, success: bool) -> str:
        if tool_name == "hydra_bruteforce" and isinstance(raw_output, dict):
            out = raw_output.get("output", raw_output)
            creds = out.get("credentials_found", []) or []
            head = f"hydra {out.get('service','?')} on {out.get('target','?')}: {len(creds)} credential(s)"
            if creds:
                lines = [head] + [
                    f"  {c.get('username','')}:{c.get('password','')} ({c.get('service','')})"
                    for c in creds[:10]
                ]
                return "\n".join(lines)
            return head + " — none found. Try a different user/password list or service."
        return super()._summarize_tool_output(tool_name, raw_output, success)

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        if tool_name == "hydra_bruteforce":
            self._attempt_count += 1
            await self._process_hydra_result(result, action_dict)
            if self._attempt_count >= self._max_attempts:
                self.memory.add_tool_result(
                    f"[SYSTEM] Reached {self._max_attempts} brute attempts. Report any "
                    f"credentials found and call done.",
                    pinned=True,
                )
        elif tool_name == "nmap_scan":
            self._attempt_count += 1
        elif tool_name == "report_finding":
            await self._process_report_finding(action_dict)

    async def _process_hydra_result(self, result: dict, action_dict: dict) -> None:
        if not result.get("success"):
            return
        out = result.get("output") or {}
        params = action_dict.get("parameters", {}) or {}
        for cred in out.get("credentials_found", []) or []:
            finding = {
                "type": "credential",
                "host": cred.get("host") or out.get("target") or self.target,
                "port": params.get("port", ""),
                "service": cred.get("service") or out.get("service", ""),
                "username": cred.get("username", ""),
                "password": cred.get("password", ""),
            }
            self._add_finding(finding)
            await self.publish_finding(finding)


# Register with BrainAgent registry
_register_agent_type("cred_attack", "core.agents.cred_attack_agent", "CredAttackAgent")
