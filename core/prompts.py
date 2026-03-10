"""
Phase 9 — Prompt Engineering

Builds all prompts for the PentestAgent.
- System prompt  : who the agent is, constraints, attack phases
- Few-shot        : 5 examples of good decisions
- Tool desc       : JSON schema per tool
- Context prompt  : current scan state (hosts / ports / vulns)
- Action prompt   : "choose next action → return ONLY JSON"
- Reflection      : "what did you learn? update strategy"
- Token budgeting : dynamic example count based on context length
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.agent import AgentContext
    from core.memory import SessionMemory

logger = logging.getLogger(__name__)

_CHARS_PER_TOKEN = 4  # rough estimate


# ── System Prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are AEGIS, an autonomous network penetration testing agent.

MISSION:
Perform authorized network penetration tests by discovering live hosts, scanning
open ports, searching for known exploits, attempting exploitation, and producing
a structured report of every finding.

STRICT CONSTRAINTS (never violate):
- Only target IPs inside the allowed CIDR range provided to you.
- Never run DoS or denial-of-service exploit modules.
- Never use destructive modules (format, wipe, ransomware, encrypt_disk).
- Never run arbitrary shell commands — you may only call the tools listed below.
- If the mode is "scan_only", perform recon only and then generate_report.
- If an exploit is declined by the user, try a different approach.

ATTACK PHASES (follow in order):
  1. DISCOVERY       — nmap_scan (ping sweep) to find live hosts
  2. PORT_SCAN       — nmap_scan (service detection) on each live host
  3. EXPLOIT_SEARCH  — searchsploit_search per open service/version found
  4. EXPLOITATION    — metasploit_run per vulnerability (if mode allows)
  5. DONE            — generate_report when all hosts are fully processed

MANDATORY OUTPUT FORMAT:
Respond with a single valid JSON object only. No prose, no markdown, no comments.

{
  "thought": "<your internal reasoning about the current situation>",
  "action": "<tool_name OR generate_report>",
  "parameters": { ... },
  "reasoning": "<one sentence: why this action, why now>"
}

Available action values: nmap_scan, searchsploit_search, metasploit_run, generate_report\
"""

# ── Few-Shot Examples ──────────────────────────────────────────────────────────

_FEW_SHOT_EXAMPLES = """\
EXAMPLES OF CORRECT DECISIONS:

Example 1 — Start: host discovery on a /24 network
{
  "thought": "No hosts discovered yet. First step is always a ping sweep.",
  "action": "nmap_scan",
  "parameters": {"target": "192.168.1.0/24", "scan_type": "ping"},
  "reasoning": "Host discovery must precede port scanning."
}

Example 2 — Port scan a discovered host
{
  "thought": "192.168.1.5 is alive. I need to identify running services.",
  "action": "nmap_scan",
  "parameters": {"target": "192.168.1.5", "scan_type": "service"},
  "reasoning": "Service version detection reveals exploitable software."
}

Example 3 — Search exploits for a known service
{
  "thought": "Port 21 shows vsftpd 2.3.4 — a version with a known backdoor.",
  "action": "searchsploit_search",
  "parameters": {"query": "vsftpd 2.3.4"},
  "reasoning": "CVE-2011-2523 backdoor exists for this exact version."
}

Example 4 — Execute a reliable exploit
{
  "thought": "searchsploit confirmed the vsftpd 234 backdoor module.",
  "action": "metasploit_run",
  "parameters": {
    "target_ip": "192.168.1.5",
    "target_port": 21,
    "module": "exploit/unix/ftp/vsftpd_234_backdoor",
    "payload": "cmd/unix/interact"
  },
  "reasoning": "CVSS 10.0, reliable exploit. High probability of success."
}

Example 5 — Generate report when all hosts processed
{
  "thought": "All 3 live hosts have been fully scanned, exploits searched, and attempts made.",
  "action": "generate_report",
  "parameters": {},
  "reasoning": "All attack phases complete. Time to compile the final report."
}\
"""


# ── PromptBuilder ──────────────────────────────────────────────────────────────

class PromptBuilder:
    """
    Builds all prompt messages for the PentestAgent.

    Usage:
        pb = PromptBuilder()
        messages = pb.build_full_prompt(context, memory, tools)
        reflection = pb.build_reflection_messages(context, memory)
    """

    def __init__(self, include_examples: bool = True):
        self._include_examples = include_examples

    # ── Public API ────────────────────────────────────────────────────────────

    def build_full_prompt(
        self,
        context: "AgentContext",
        memory: "SessionMemory",
        tools: list[dict],
    ) -> list[dict]:
        """
        Assemble the complete messages list for the REASONING step.

        Structure:
          [system] system_prompt + few_shot + tool_descriptions
          [...   ] conversation history (from memory, token-budgeted)
          [user  ] current state + action instruction
        """
        system_text = self._build_system_text(tools, context)
        user_text = self._build_action_user_text(context)

        messages: list[dict] = [{"role": "system", "content": system_text}]
        messages.extend(memory.build_context())
        messages.append({"role": "user", "content": user_text})
        return messages

    def build_reflection_messages(
        self,
        context: "AgentContext",
        memory: "SessionMemory",
    ) -> list[dict]:
        """
        Assemble messages for the REFLECTION step.

        The LLM summarises what it learned and updates its tactical assessment.
        Plain text response — no JSON required here.
        """
        system_text = (
            "You are AEGIS in reflection mode. "
            "Analyze the last tool result and provide a concise 1-2 sentence "
            "tactical update: what did you learn, and what should be prioritized next? "
            "Be brief. No JSON required."
        )
        state_summary = (
            f"Phase: {context.attack_phase} | "
            f"Hosts: {len(context.discovered_hosts)} | "
            f"Ports/Services: {context.total_ports} | "
            f"Vulnerabilities: {context.total_vulns} | "
            f"Exploit attempts: {context.total_exploits}"
        )
        user_text = (
            f"Current state: {state_summary}\n\n"
            "Reflect on the last action result. Update your tactical assessment in 1-2 sentences."
        )
        messages: list[dict] = [{"role": "system", "content": system_text}]
        messages.extend(memory.build_context(max_tokens=1024))
        messages.append({"role": "user", "content": user_text})
        return messages

    # ── Private builders ──────────────────────────────────────────────────────

    def _build_system_text(self, tools: list[dict], context: "AgentContext") -> str:
        parts = [_SYSTEM_PROMPT]
        if self._include_examples and self._should_include_examples(context):
            parts.append(_FEW_SHOT_EXAMPLES)
        parts.append(self._format_tools(tools))
        return "\n\n".join(parts)

    def _build_action_user_text(self, context: "AgentContext") -> str:
        return (
            f"{self._format_state(context)}\n\n"
            "Based on the current state above, choose your next action. "
            "Return ONLY valid JSON. No other text."
        )

    def _format_tools(self, tools: list[dict]) -> str:
        if not tools:
            return "AVAILABLE TOOLS: none registered"
        lines = ["AVAILABLE TOOLS (use exact names in the 'action' field):"]
        for t in tools:
            params_str = json.dumps(t.get("parameters", {}), indent=2)
            lines.append(f"\n--- {t['name']} ---")
            lines.append(t.get("description", "(no description)"))
            lines.append(f"Parameters schema:\n{params_str}")
        return "\n".join(lines)

    def _format_state(self, context: "AgentContext") -> str:
        lines = [
            f"TARGET       : {context.target}",
            f"MODE         : {context.mode}",
            f"ATTACK PHASE : {context.attack_phase}",
            f"ITERATION    : {context.iteration}",
            "",
        ]

        if context.discovered_hosts:
            lines.append(f"LIVE HOSTS ({len(context.discovered_hosts)}):")
            for h in context.discovered_hosts:
                lines.append(f"  {h}")
        else:
            lines.append("LIVE HOSTS: none discovered yet")

        if context.scan_results:
            lines.append(f"\nOPEN SERVICES (last 5):")
            for s in context.scan_results[-5:]:
                lines.append(f"  {s}")

        if context.vulnerabilities:
            lines.append(f"\nVULNERABILITIES ({len(context.vulnerabilities)}) (last 5):")
            for v in context.vulnerabilities[-5:]:
                lines.append(f"  {v}")

        if context.exploit_results:
            lines.append(f"\nEXPLOIT ATTEMPTS ({len(context.exploit_results)}) (last 3):")
            for e in context.exploit_results[-3:]:
                lines.append(f"  {e}")

        if context.mode == "scan_only":
            lines.append("\nNOTE: Exploitation is DISABLED (scan_only mode). Do not call metasploit_run.")

        if context.hosts_pending_port_scan:
            lines.append(
                f"\nPENDING PORT SCANS: {', '.join(context.hosts_pending_port_scan[:5])}"
            )

        return "\n".join(lines)

    def _should_include_examples(self, context: "AgentContext") -> bool:
        """
        Drop examples once we're deep into the exploitation phase to save tokens.
        Early phases benefit more from the examples than later ones.
        """
        if context.attack_phase in ("EXPLOITATION", "DONE"):
            return False
        if context.iteration > 20:
            return False
        return True

    # ── Utility ───────────────────────────────────────────────────────────────

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Rough token estimate: characters / 4."""
        return max(1, len(text) // _CHARS_PER_TOKEN)
