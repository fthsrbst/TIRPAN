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
You are a professional penetration tester with expertise in network reconnaissance,
vulnerability assessment, exploitation, post-exploitation, and lateral movement.

MISSION:
Perform an authorized network penetration test by executing the ATTACK PHASES below.
Follow operator instructions precisely. Respect every constraint listed.

STRICT CONSTRAINTS (never violate — hardcoded safety rules):
- Only target IPs inside the allowed CIDR range shown in your state.
- Never run DoS or denial-of-service exploit modules.
- Never use destructive modules (format, wipe, ransomware, encrypt_disk).
- Never run arbitrary shell commands — call only the listed tools.
- Respect the POLICY FLAGS in your state — they override everything else.
- Never touch EXCLUDED PORTS or NEVER-SCAN IPs if listed.

ATTACK PHASES (follow in order unless operator notes redirect you):
  1. DISCOVERY       — nmap_scan (ping sweep) to find live hosts
  2. PORT_SCAN       — nmap_scan (service/full) on each live host — use PORT RANGE from state
  3. EXPLOIT_SEARCH  — searchsploit_search for each discovered service/version
  4. EXPLOITATION    — metasploit_run (action=run) per vulnerability (only if POLICY allows)
       *** CRITICAL: attempt EVERY HIGH/CRITICAL CVE found, even if you already have root.
       *** Each exploit must be validated individually for the PoC report. Root access does
       *** NOT mean mission complete — continue until ALL unexecuted CVEs have been tried.
  5. POST_EXPLOIT    — MANDATORY after each successful exploit:
       a. INITIAL RECON — include post_commands in the exploit run call (preferred), or use action=session_exec if msfrpcd is available
       b. DEEP ENUM     — shell_exec (action=exec_script) for multi-step enumeration (SUID, cron, shadow, env secrets)
       c. SYSTEM AUDIT  — ssh_exec (action=audit) if SSH credentials are available
       d. PRIV ESC RECON — check: sudo -l, find SUID binaries, cron jobs, writable dirs
       e. FILE OPS      — shell_exec (action=upload/download) for transferring tools or exfiltrating data
  6. DONE            — generate_report ONLY after ALL CVEs have been attempted

MODE BEHAVIOUR:
- scan_only          : Phases 1-3 only. Never call metasploit_run or ssh_exec for exploitation.
- ask_before_exploit : Pause at phase 4. State "WAITING_FOR_APPROVAL: <exploit details>" and stop.
                       Only proceed after the operator explicitly approves in a follow-up message.
- full_auto          : Execute all permitted phases without pausing.

SCAN CONFIGURATION:
- Always use the PORT RANGE, SCAN TYPE, and NSE CATEGORIES from your state.
- Single-IP targets: skip ping sweep — host is already confirmed alive. Go straight to PORT_SCAN.
- If KNOWN TECH is listed: run searchsploit for those known services immediately (no need to wait for nmap).
  Then ALSO run a full port scan — there may be additional unknown services on the target.
- If EXCLUDED PORTS is listed, always pass them as excluded_ports param in every nmap_scan call.
- Apply OS detection and version detection flags exactly as configured.

METASPLOIT PAYLOAD RULES:
- ALWAYS leave payload empty ("") — the tool auto-selects the best compatible payload.
- For native-shell exploits (vsftpd_234_backdoor, usermap_script, distcc_exec): payload="" is mandatory. The tool handles retry logic with multiple payload candidates.
- For other exploits: payload="" selects a bind-shell payload (no LHOST needed, works in WSL/NAT/VM).
- Only set payload explicitly if you have a specific reason (e.g. a particular Meterpreter payload).
- LHOST is auto-detected by the tool when needed — never set it manually.

POST-EXPLOITATION WORKFLOW (MANDATORY after a successful exploit opens a session):

PREFERRED: Include post_commands in the exploit run call (works with and without msfrpcd):
  - Add "post_commands": ["id && whoami && uname -a && cat /etc/passwd", "cat /etc/shadow 2>/dev/null", "sudo -l 2>/dev/null"]
  - The result will contain "post_command_output" with all command output.
  - This is the ONLY reliable method when msfrpcd is unavailable (msfconsole fallback).

FALLBACK: If exploit already ran without post_commands, use action=session_exec (requires msfrpcd):
  - action=session_exec WILL FAIL if msfrpcd is unavailable — do not retry repeatedly.
  - If session_exec fails with "not valid or has been closed", the session was from a
    msfconsole run (no persistent session). Re-run the exploit with post_commands instead.

Initial recon commands to include in post_commands:
   - "id && whoami && pwd && uname -a && cat /etc/passwd" — identity + OS + accounts
   - "cat /etc/shadow 2>/dev/null" — password hashes (if readable)
   - "sudo -l 2>/dev/null; find / -perm -4000 -type f 2>/dev/null | head -20" — privesc vectors
   - "cat /etc/crontab 2>/dev/null; netstat -tlnp 2>/dev/null || ss -tlnp" — cron + network

CREDENTIALS & SSH:
- If SSH CREDENTIALS are listed in your state, use ssh_exec after gaining initial access
  or for authenticated system audits — do not ignore them.
- Match credentials to hosts using the host_pattern field.

SESSION INTERACTION:
- Prefer post_commands in the run call over separate session_exec calls.
- session_exec only works reliably when msfrpcd is running (RPC mode).
- If session_exec fails with "not valid or has been closed", re-run the exploit with post_commands.

MANDATORY OUTPUT FORMAT:
Respond with a single valid JSON object only. No prose, no markdown, no comments.

{
  "thought": "<your internal reasoning about the current situation>",
  "action": "<tool_name OR generate_report>",
  "parameters": { ... },
  "reasoning": "<one sentence: why this action, why now>"
}

Available action values: nmap_scan, searchsploit_search, metasploit_run, ssh_exec, shell_exec, generate_report, parallel_tools

PARALLEL EXECUTION:
When multiple tool calls are fully independent (e.g. searchsploit for 5 different services after a port scan),
use "parallel_tools" instead of repeating single actions. This runs all listed tools simultaneously.

Format:
{
  "thought": "<reasoning>",
  "action": "parallel_tools",
  "tools": [
    {"action": "<tool>", "parameters": {...}},
    {"action": "<tool>", "parameters": {...}}
  ],
  "reasoning": "<why parallel>"
}

Rules for parallel_tools:
- Only use when tools are truly independent (results of one do not affect others)
- Maximum 10 tools per batch
- Best use case: searchsploit_search for multiple services after a port scan
- Do NOT use for nmap scans that must run sequentially (discovery → port scan)
- Do NOT use when one tool's output is needed as input for another\
"""

# ── Few-Shot Examples ──────────────────────────────────────────────────────────

_FEW_SHOT_EXAMPLES = """\
EXAMPLES OF CORRECT DECISIONS:

Example 1 — Host discovery on a /24 with excluded ports
{
  "thought": "No hosts discovered yet. First step is a ping sweep. Port range and excluded ports are set.",
  "action": "nmap_scan",
  "parameters": {"target": "192.168.1.0/24", "scan_type": "ping"},
  "reasoning": "Host discovery must precede port scanning. Ping scan ignores port exclusions."
}

Example 2 — Full service scan respecting config
{
  "thought": "192.168.1.5 is alive. Config says scan_type=full, port_range=1-65535, NSE=default,vuln. Excluded: 23,25.",
  "action": "nmap_scan",
  "parameters": {
    "target": "192.168.1.5",
    "scan_type": "full",
    "port_range": "1-65535",
    "scripts": "default,vuln",
    "excluded_ports": "23,25"
  },
  "reasoning": "Full scan with configured NSE categories. Excluded ports passed as required."
}

Example 3 — Skip discovery because known tech listed
{
  "thought": "KNOWN TECH lists vsftpd/2.3.4 — no need to rediscover it. Go straight to exploit search.",
  "action": "searchsploit_search",
  "parameters": {"service": "vsftpd", "version": "2.3.4"},
  "reasoning": "Known tech skips redundant discovery — operator already knows the version."
}

Example 4 — Execute exploit with inline post-exploitation recon (preferred pattern)
{
  "thought": "POLICY allows exploitation. vsftpd 234 backdoor confirmed by searchsploit. Mode is full_auto. Include post_commands so initial recon runs in the same msfconsole session — this works even without msfrpcd.",
  "action": "metasploit_run",
  "parameters": {
    "action": "run",
    "target_ip": "192.168.1.5",
    "target_port": 21,
    "module": "exploit/unix/ftp/vsftpd_234_backdoor",
    "payload": "",
    "post_commands": [
      "id && whoami && pwd && uname -a",
      "cat /etc/passwd",
      "cat /etc/shadow 2>/dev/null",
      "sudo -l 2>/dev/null; find / -perm -4000 -type f 2>/dev/null | head -20",
      "netstat -tlnp 2>/dev/null || ss -tlnp"
    ]
  },
  "reasoning": "CVSS 10.0 exploit. post_commands run initial recon in the same msfconsole session — reliable without msfrpcd."
}

Example 5 — session_exec (only if msfrpcd is running and session is still open)
{
  "thought": "msfrpcd is available (RPC mode). Session 1 is confirmed open. Running additional commands.",
  "action": "metasploit_run",
  "parameters": {
    "action": "session_exec",
    "session_id": 1,
    "command": "id && whoami && uname -a && cat /etc/passwd"
  },
  "reasoning": "RPC mode — session persists. Running initial recon via session_exec."
}

Example 6 — Re-run exploit with post_commands after session_exec failure
{
  "thought": "session_exec failed: session not valid (msfconsole fallback — sessions don't persist). Must re-run the exploit with post_commands to collect recon in the same invocation.",
  "action": "metasploit_run",
  "parameters": {
    "action": "run",
    "target_ip": "192.168.1.5",
    "target_port": 21,
    "module": "exploit/unix/ftp/vsftpd_234_backdoor",
    "payload": "",
    "post_commands": [
      "id && whoami && uname -a && cat /etc/passwd",
      "sudo -l 2>/dev/null; find / -perm -4000 -type f 2>/dev/null | head -20"
    ]
  },
  "reasoning": "msfconsole fallback: sessions close with the process. post_commands is the only way to collect recon."
}

Example 7 — Ask before exploit mode
{
  "thought": "Mode is ask_before_exploit. I found a critical vuln but must not proceed without approval.",
  "action": "generate_report",
  "parameters": {},
  "reasoning": "WAITING_FOR_APPROVAL: vsftpd_234_backdoor on 192.168.1.5:21 (CVSS 10.0). Awaiting operator confirmation."
}

Example 8 — SSH audit after shell obtained
{
  "thought": "Shell obtained on 192.168.1.5. POLICY allows post-exploitation. SSH credentials available for this host.",
  "action": "ssh_exec",
  "parameters": {
    "host": "192.168.1.5",
    "username": "msfadmin",
    "password": "msfadmin",
    "action": "audit"
  },
  "reasoning": "Post-exploitation audit via SSH — collect system info, users, network, persistence opportunities."
}

Example 7 — Parallel exploit search for multiple services (best use of parallel_tools)
{
  "thought": "Port scan complete on 192.168.1.5. Found 5 services: vsftpd/2.3.4, openssh/4.7p1, apache/2.2.8, samba/3.0.20, mysql/5.0.51. All searchsploit queries are independent — running them in parallel saves 4 LLM iterations.",
  "action": "parallel_tools",
  "tools": [
    {"action": "searchsploit_search", "parameters": {"service": "vsftpd", "version": "2.3.4"}},
    {"action": "searchsploit_search", "parameters": {"service": "openssh", "version": "4.7p1"}},
    {"action": "searchsploit_search", "parameters": {"service": "apache", "version": "2.2.8"}},
    {"action": "searchsploit_search", "parameters": {"service": "samba", "version": "3.0.20"}},
    {"action": "searchsploit_search", "parameters": {"service": "mysql", "version": "5.0.51"}}
  ],
  "reasoning": "5 independent exploit searches — parallel_tools saves 4 sequential iterations."
}

Example 8 — Parallel exploit execution for multiple independent CVEs
{
  "thought": "EXPLOITATION phase. Found 3 independent CVEs on different ports: vsftpd:21, samba:445, distccd:3632. All are remote RCE, all independent — running them in parallel cuts 2 iterations. post_commands included so recon runs in the same msfconsole invocation.",
  "action": "parallel_tools",
  "tools": [
    {
      "action": "metasploit_run",
      "parameters": {
        "action": "run",
        "module": "exploit/unix/ftp/vsftpd_234_backdoor",
        "target_ip": "192.168.1.5",
        "target_port": 21,
        "payload": "",
        "post_commands": ["id && whoami && uname -a", "cat /etc/passwd"]
      }
    },
    {
      "action": "metasploit_run",
      "parameters": {
        "action": "run",
        "module": "exploit/multi/samba/usermap_script",
        "target_ip": "192.168.1.5",
        "target_port": 445,
        "payload": "",
        "post_commands": ["id && whoami && hostname"]
      }
    },
    {
      "action": "metasploit_run",
      "parameters": {
        "action": "run",
        "module": "exploit/unix/misc/distcc_exec",
        "target_ip": "192.168.1.5",
        "target_port": 3632,
        "payload": "",
        "post_commands": ["id && uname -a"]
      }
    }
  ],
  "reasoning": "3 independent RCE exploits on separate ports — parallel execution cuts 2 iterations."
}

Example 9 — shell_exec for deep post-exploitation enumeration
{
  "thought": "SSH credentials available (msfadmin/msfadmin). Using shell_exec with exec_script for comprehensive post-exploitation enumeration — SUID binaries, cron, network, sensitive files — in a single SSH session.",
  "action": "shell_exec",
  "parameters": {
    "action": "exec_script",
    "method": "ssh",
    "target_ip": "192.168.1.5",
    "target_port": 22,
    "username": "msfadmin",
    "password": "msfadmin",
    "commands": [
      "id && whoami && uname -a && hostname",
      "sudo -l 2>/dev/null",
      "find / -perm -4000 -type f 2>/dev/null | head -20",
      "cat /etc/crontab 2>/dev/null; ls -la /etc/cron.d/ 2>/dev/null",
      "cat /etc/shadow 2>/dev/null | head -10",
      "netstat -tlnp 2>/dev/null || ss -tlnp",
      "env 2>/dev/null | grep -iE 'pass|key|secret|token|api' | head -10"
    ]
  },
  "reasoning": "Multi-step enumeration via SSH — single connection, all commands in sequence."
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
        context: AgentContext,
        memory: SessionMemory,
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
        context: AgentContext,
        memory: SessionMemory,
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

    def _build_system_text(self, tools: list[dict], context: AgentContext) -> str:
        parts = [_SYSTEM_PROMPT]
        if self._include_examples and self._should_include_examples(context):
            parts.append(_FEW_SHOT_EXAMPLES)
        parts.append(self._format_tools(tools))
        return "\n\n".join(parts)

    def _build_action_user_text(self, context: AgentContext) -> str:
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

    def _format_state(self, context: AgentContext) -> str:
        m = context.mission  # shorthand — may be None on legacy contexts

        lines = [
            f"TARGET       : {context.target}",
            f"MODE         : {context.mode}",
            f"ATTACK PHASE : {context.attack_phase}",
            f"ITERATION    : {context.iteration}",
            f"PORT RANGE   : {context.port_range}  <- use this in every nmap_scan (service/os/full)",
        ]

        # ── Scan configuration from MissionBrief ──────────────────────────────
        if m:
            scan_type = m.scan_type or "service"
            lines.append(f"SCAN TYPE    : {scan_type}  <- use this scan_type in nmap_scan calls")

            if m.nse_categories:
                nse_str = ",".join(m.nse_categories)
                lines.append(f"NSE SCRIPTS  : {nse_str}  <- pass as scripts= in nmap_scan calls")

            flags = []
            if m.os_detection:
                flags.append("OS detection ON")
            if m.version_detection:
                flags.append("version detection ON")
            if flags:
                lines.append(f"SCAN FLAGS   : {', '.join(flags)}")

            if m.target_type and m.target_type != "auto":
                lines.append(f"TARGET TYPE  : {m.target_type}")

        # ── Speed profile ──────────────────────────────────────────────────────
        try:
            from config import settings
            sp = settings.speed_profile
            lines.append(f"SPEED PROFILE: {sp}  <- timing already applied by nmap tool")
        except Exception:
            pass

        lines.append("")

        # ── Operator notes / scope notes ──────────────────────────────────────
        if context.notes:
            lines.append(f"OPERATOR NOTES:\n{context.notes}")
            lines.append("")

        # ── Known technology (skip redundant discovery) ────────────────────────
        if m and m.known_tech:
            tech_str = ", ".join(m.known_tech)
            lines.append(f"KNOWN TECH   : {tech_str}")
            lines.append("  -> Skip discovery for these — go directly to searchsploit_search")
            lines.append("")

        # ── Excluded ports (hard block) ────────────────────────────────────────
        if m and m.excluded_ports:
            ports_str = ",".join(str(p) for p in m.excluded_ports)
            lines.append(f"EXCLUDED PORTS: {ports_str}")
            lines.append(f"  -> NEVER scan these ports — always pass excluded_ports='{ports_str}' to every nmap_scan")
            lines.append("")

        # ── Policy flags ───────────────────────────────────────────────────────
        if m:
            policy_lines = ["POLICY FLAGS (hard limits — do not violate):"]
            policy_lines.append(f"  allow_exploitation      : {'YES' if m.allow_exploitation else 'NO  <- do not call metasploit_run'}")
            policy_lines.append(f"  allow_post_exploitation : {'YES  <- ssh_exec audit is permitted' if m.allow_post_exploitation else 'NO  <- do not run post-exploit actions'}")
            policy_lines.append(f"  allow_lateral_movement  : {'YES  <- pivot to new subnets if discovered' if m.allow_lateral_movement else 'NO  <- stay on initial target subnet only'}")
            policy_lines.append(f"  allow_docker_escape     : {'YES' if m.allow_docker_escape else 'NO'}")
            policy_lines.append(f"  allow_browser_recon     : {'YES' if m.allow_browser_recon else 'NO'}")
            lines.extend(policy_lines)
            lines.append("")

        # ── SSH credentials summary (awareness only — do not log passwords) ───
        if m and m.ssh_credentials:
            lines.append(f"SSH CREDENTIALS AVAILABLE: {len(m.ssh_credentials)} credential(s)")
            for i, cred in enumerate(m.ssh_credentials, 1):
                lines.append(f"  [{i}] host_pattern={cred.host_pattern}  user={cred.username}  port={cred.port}  escalation={cred.escalation}")
            lines.append("  -> Use ssh_exec with matching host to run authenticated commands")
            lines.append("")

        # ── SMB credentials summary ────────────────────────────────────────────
        if m and m.smb_credentials:
            lines.append(f"SMB CREDENTIALS AVAILABLE: {len(m.smb_credentials)} credential(s)")
            for cred in m.smb_credentials:
                lines.append(f"  host_pattern={cred.host_pattern}  user={cred.domain}\\{cred.username}  auth={cred.auth_type}")
            lines.append("")

        # ── Active MSF sessions ────────────────────────────────────────────────
        if context.active_sessions:
            lines.append(f"ACTIVE SESSIONS ({len(context.active_sessions)}):")
            for sid, ip in context.active_sessions.items():
                lines.append(f"  session_id={sid}  target={ip}")
            lines.append("  WARNING: msfconsole fallback is active — sessions close when msfconsole exits.")
            lines.append("  -> session_exec WILL FAIL. Use post_commands in the next run call instead.")
            lines.append("  -> If post_exploit_data below already has recon, DO NOT re-run the exploit.")
            lines.append("")

        # ── Post-exploitation recon already collected ──────────────────────────
        if context.post_exploit_data:
            lines.append(f"POST-EXPLOIT RECON COLLECTED ({len(context.post_exploit_data)} host(s)):")
            for ip, data in context.post_exploit_data.items():
                preview = data[:800].replace("\n", " | ")
                lines.append(f"  [{ip}] {preview}")
            lines.append("  -> Recon already done. Do NOT re-run exploit for recon. Proceed to next objective.")
            lines.append("")

        # ── Discovered state ───────────────────────────────────────────────────
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
            lines.append(f"\nEXPLOIT ATTEMPTS ({len(context.exploit_results)}) (last 5):")
            for e in context.exploit_results[-5:]:
                lines.append(f"  {e}")

        # Show which vulnerabilities still need exploitation — agent must not skip any
        if context.vulnerabilities and context.attack_phase in ("EXPLOITATION", "POST_EXPLOIT"):
            attempted = {e for e in context.exploit_results}
            # Build a simplified list of vuln identifiers already attempted
            attempted_modules = set()
            for e in context.exploit_results:
                for part in e.split("|"):
                    part = part.strip()
                    if part.startswith("exploit/") or part.startswith("✓") or part.startswith("✗"):
                        attempted_modules.add(part.lstrip("✓✗ "))
            unattempted = [
                v for v in context.vulnerabilities
                if not any(a in v for a in attempted_modules)
            ]
            if unattempted:
                lines.append(f"\nUNEXECUTED CVEs ({len(unattempted)}) — MUST attempt before generate_report:")
                for v in unattempted[:10]:
                    lines.append(f"  ! {v}")
                if len(unattempted) > 10:
                    lines.append(f"  ... and {len(unattempted) - 10} more")
            else:
                lines.append("\nALL CVEs ATTEMPTED — may now call generate_report.")

        # ── Mode-specific reminders ────────────────────────────────────────────
        if context.mode == "scan_only":
            lines.append("\nREMINDER: scan_only mode — do NOT call metasploit_run or ssh_exec for exploitation.")
        elif context.mode == "ask_before_exploit":
            lines.append("\nREMINDER: ask_before_exploit mode — state WAITING_FOR_APPROVAL before any exploit.")

        if context.hosts_pending_port_scan:
            lines.append(
                f"\nPENDING PORT SCANS: {', '.join(context.hosts_pending_port_scan[:5])}"
            )

        # Show services still needing exploit search — agent MUST search all before exploitation
        if context.attack_phase == "EXPLOIT_SEARCH" and context.hosts_pending_exploit_search:
            pending_svcs = context.hosts_pending_exploit_search[:15]
            lines.append(
                f"\nPENDING EXPLOIT SEARCHES ({len(context.hosts_pending_exploit_search)} services remaining):"
            )
            lines.append("  Search using the PRODUCT NAME from the version string, not the protocol name.")
            lines.append("  Format shown: port — protocol | version (use version's first word as 'service' param)")
            for entry in pending_svcs:
                parts = entry.split(":", 3)
                if len(parts) >= 3:
                    protocol = parts[2]
                    ver_str = parts[3] if len(parts) > 3 else ""
                    # Extract product name = first word of version string (e.g. "vsftpd" from "vsftpd 2.3.4")
                    ver_words = ver_str.split()
                    product = ver_words[0] if ver_words else protocol
                    ver_num = " ".join(ver_words[1:]) if len(ver_words) > 1 else ""
                    hint = f'→ search service="{product.lower()}" version="{ver_num}"' if ver_num else f'→ search service="{product.lower()}"'
                    lines.append(f"  {parts[0]}:{parts[1]} {protocol} | {ver_str}  {hint}")
                else:
                    lines.append(f"  {entry}")
            if len(context.hosts_pending_exploit_search) > 15:
                lines.append(f"  ... and {len(context.hosts_pending_exploit_search)-15} more")
            lines.append(
                "  *** Use parallel_tools to search ALL pending services simultaneously. ***"
                "\n  *** Do NOT advance to EXPLOITATION until this queue is empty.       ***"
            )
        elif context.attack_phase == "EXPLOIT_SEARCH" and not context.hosts_pending_exploit_search:
            lines.append("\nALL SERVICES SEARCHED — may advance to EXPLOITATION.")

        return "\n".join(lines)

    def _should_include_examples(self, context: AgentContext) -> bool:
        """
        Drop examples once we're deep into the exploitation phase to save tokens.
        Early phases benefit more from the examples than later ones.
        """
        if context.attack_phase in ("EXPLOITATION", "DONE"):
            return False
        return not context.iteration > 20

    # ── Utility ───────────────────────────────────────────────────────────────

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Rough token estimate: characters / 4."""
        return max(1, len(text) // _CHARS_PER_TOKEN)
