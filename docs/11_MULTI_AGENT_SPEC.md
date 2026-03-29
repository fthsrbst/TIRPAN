# TIRPAN — Multi-Agent Architecture Specification

> **Status:** Design complete — implementation starting
> **Document Version:** 1.0 — March 2026
> **Supersedes:** 11_V2_FEATURE_SPEC.md (single-agent V2 spec, archived)

This document is the complete technical specification for TIRPAN V2's multi-agent system.
Each section maps to a discrete implementation unit.

---

## Table of Contents

1. [Overview & Motivation](#1-overview--motivation)
2. [BaseAgent — Shared Foundation](#2-baseagent--shared-foundation)
3. [MissionContext — Shared State](#3-missioncontext--shared-state)
4. [AgentMessageBus — Communication](#4-agentmessagebus--communication)
5. [BrainAgent — Coordinator](#5-brainagent--coordinator)
6. [ShellManager — Persistent Sessions](#6-shellmanager--persistent-sessions)
7. [Specialized Agents](#7-specialized-agents)
8. [New Tools](#8-new-tools)
9. [Database Schema Changes](#9-database-schema-changes)
10. [API Changes](#10-api-changes)
11. [UI Changes](#11-ui-changes)
12. [Safety Extensions](#12-safety-extensions)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Overview & Motivation

### Problem with V1

V1's single `PentestAgent` runs everything sequentially:
- One phase at a time — slow
- No OSINT, no web app testing, no post-exploitation depth
- Shells opened via Metasploit are never reused — re-exploits on every action
- One model handles everything — no specialization

### V2 Solution

A **Brain Agent** coordinates a team of specialized agents, each an expert in its domain.

```
Brain (LLM coordinator)
├── Decides strategy based on mission + findings
├── Spawns specialized agents with specific tasks
├── Receives results and updates shared mission state
├── Runs agents in parallel where dependencies allow
└── Adapts: failure → try differently → last resort ask user

Specialized Agents (each with own LLM + tools):
├── OSINT Agent      — passive intelligence gathering
├── Scanner Agent    — network discovery and enumeration
├── Web App Agent    — HTTP service vulnerability testing
├── Exploit Agent    — CVE research and exploitation
├── PostExploit Agent — privesc, persistence, credential harvest
├── Lateral Agent    — network expansion from compromised hosts
└── Reporting Agent  — professional pentest report generation

Shell Manager (background service, no LLM):
└── Persistent session registry, health monitoring, reconnect
```

---

## 2. BaseAgent — Shared Foundation

**File:** `core/base_agent.py`

All specialized agents inherit from `BaseAgent`. It provides:

```python
class BaseAgent(ABC):
    def __init__(
        self,
        agent_id: str,
        agent_type: str,
        mission_id: str,
        task_description: str,
        context: dict,          # subset of MissionContext relevant to this task
        tools: list[BaseTool],  # tool subset assigned by Brain
        llm_config: LLMConfig,  # per-agent model config
        message_bus: AgentMessageBus,
        shell_manager: ShellManager,
        safety: SafetyGuard,
        db_path: str,
    ):
        ...

    # ── Core lifecycle ──────────────────────────────────────────────────

    async def run(self) -> AgentResult:
        """Main entry point. Runs the agent's ReAct loop until done."""
        ...

    async def reason(self) -> ActionDict:
        """Call LLM with current context + tools. Stream tokens. Parse JSON action."""
        ...

    async def act(self, action: ActionDict) -> ToolResult:
        """Execute the chosen tool through SafetyGuard."""
        ...

    async def observe(self, result: ToolResult, action: ActionDict) -> None:
        """Update local context. Emit findings to Brain via message bus."""
        ...

    async def reflect(self) -> None:
        """Optional: ask LLM for tactical summary before next iteration."""
        ...

    # ── Communication ────────────────────────────────────────────────────

    async def emit_finding(self, category: str, data: dict) -> None:
        """Send a finding to Brain immediately (high-priority, non-blocking)."""
        ...

    async def report_result(self, status: str, findings: list, recommendations: list) -> None:
        """Final result report to Brain when task is complete."""
        ...

    async def request_input(self, question: str) -> str:
        """Ask Brain for guidance. Brain may relay to operator."""
        ...

    # ── Control ──────────────────────────────────────────────────────────

    async def pause(self) -> None: ...
    async def resume(self) -> None: ...
    async def inject_message(self, message: str) -> None: ...
    async def kill(self) -> None: ...

    # ── Abstract ─────────────────────────────────────────────────────────

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Each agent defines its own persona and expertise."""
        ...

    @abstractmethod
    def get_tool_subset(self) -> list[str]:
        """Each agent declares which tools it uses."""
        ...
```

### AgentResult

```python
class AgentResult(BaseModel):
    agent_id: str
    agent_type: str
    status: str              # "success" | "partial" | "failed" | "needs_input"
    findings: list[Finding]
    recommendations: list[str]  # what Brain should do next
    artifacts: list[Artifact]   # credentials, files, sessions opened
    error_message: str | None
    iterations: int
    duration_seconds: float
```

---

## 3. MissionContext — Shared State

**File:** `core/mission_context.py`

```python
class MissionContext(BaseModel):
    mission_id: str
    target: str | list[str]
    scope: list[str]            # allowed CIDR ranges
    mode: str                   # "full_auto" | "ask_before_exploit" | "scan_only"
    environment_type: str       # "production" | "staging" | "lab" | "unknown"
    operator_notes: str

    # Discovery
    domains: list[str] = []
    subdomains: list[str] = []
    ip_addresses: list[str] = []
    emails: list[str] = []      # from OSINT

    # Scan results
    hosts: dict[str, HostInfo] = {}     # ip → {ports, services, os, hostname}

    # Findings
    vulnerabilities: list[Vulnerability] = []

    # Access
    active_sessions: list[SessionSummary] = []   # from Shell Manager
    credentials: list[Credential] = []
    loot: list[Loot] = []

    # Mission progress
    phase: str = "initial"
    completed_tasks: list[str] = []
    active_agents: dict[str, AgentStatus] = {}

    # Intelligence
    attack_graph: AttackGraph = AttackGraph()

    # Permission flags
    allow_exploitation: bool = True
    allow_persistence: bool = False
    allow_credential_harvest: bool = False
    allow_lateral_movement: bool = False
    allow_data_exfil: bool = False
    allow_docker_escape: bool = False
```

**Access rules:**
- All agents: `READ` via `message_bus.get_context()`
- Only Brain: `WRITE` via `message_bus.update_context(key, value)`
- Agents propose updates by sending `finding` messages to Brain
- Brain decides what to integrate and when

**Persistence:** MissionContext serialized to `pentest_sessions.memory_json` at each
Brain decision point. Survives server restart.

---

## 4. AgentMessageBus — Communication

**File:** `core/agent_message_bus.py`

```python
class AgentMessageBus:
    def __init__(self, mission_id: str, db_path: str):
        self._mission_id = mission_id
        self._queues: dict[str, asyncio.Queue] = {}
        self._context: MissionContext = None
        self._context_lock = asyncio.Lock()
        self._db_path = db_path

    # ── Message routing ──────────────────────────────────────────────────

    async def send(self, message: AgentMessage) -> None:
        """Route message to recipient's queue. Persist to DB."""
        ...

    async def receive(self, agent_id: str, timeout: float | None = None) -> AgentMessage:
        """Block until message arrives for agent_id."""
        ...

    async def broadcast(self, message: AgentMessage) -> None:
        """Send to all active agents."""
        ...

    # ── Context management ────────────────────────────────────────────────

    async def get_context(self) -> MissionContext:
        """Thread-safe read of shared mission context."""
        ...

    async def update_context(self, key: str, value: any) -> None:
        """Brain-only write. Validates key against MissionContext schema."""
        ...

    # ── Agent registry ────────────────────────────────────────────────────

    async def register_agent(self, agent_id: str, agent_type: str) -> None: ...
    async def unregister_agent(self, agent_id: str) -> None: ...
    async def list_active_agents(self) -> list[AgentStatus]: ...
```

### AgentMessage Schema

```python
class AgentMessage(BaseModel):
    message_id: str = Field(default_factory=lambda: str(uuid4()))
    mission_id: str
    from_agent: str          # agent_id | "brain" | "user" | "shell_manager"
    to_agent: str            # agent_id | "brain" | "broadcast"
    message_type: str        # "task" | "result" | "finding" | "status" | "question" | "answer"
    priority: str = "normal" # "critical" | "high" | "normal" | "low"
    payload: dict
    correlation_id: str | None = None  # links request/response
    timestamp: float = Field(default_factory=time.time)
```

### Message Types

| Type | Direction | When |
|---|---|---|
| `task` | Brain → Agent | Brain assigns work to an agent |
| `result` | Agent → Brain | Agent completed its task |
| `finding` | Agent → Brain | Time-sensitive discovery mid-task |
| `status` | Agent → Brain | Progress update (% complete, current action) |
| `question` | Agent → Brain | Agent needs guidance |
| `answer` | Brain → Agent | Brain responds to agent's question |
| `kill` | Brain → Agent | Brain terminates an agent |
| `inject` | Brain/User → Agent | Mid-task instruction injection |

---

## 5. BrainAgent — Coordinator

**File:** `core/brain_agent.py`

Brain is an LLM agent with a special set of meta-tools for orchestration.

### Brain-Exclusive Meta-Tools

```python
# These tools are NOT in the ToolRegistry — they're Brain's internal actions

async def spawn_agent(
    agent_type: str,           # "osint"|"scanner"|"web"|"exploit"|"postexploit"|"lateral"|"reporting"
    task_description: str,     # natural language task for the agent's LLM
    context_subset: dict,      # relevant mission context to share
    priority: str = "normal",
    constraints: dict = {},    # scope, time limit, tool restrictions
) -> str:                      # returns agent_id
    ...

async def wait_for_agent(agent_id: str, timeout: float = 3600.0) -> AgentResult: ...
async def get_agent_status(agent_id: str) -> AgentStatus: ...
async def send_to_agent(agent_id: str, message: str) -> None: ...
async def kill_agent(agent_id: str, reason: str) -> None: ...
async def ask_user(question: str, context: str = "") -> str: ...
async def update_mission_context(key: str, value: any) -> None: ...
async def read_mission_context() -> dict: ...
async def write_finding(category: str, finding: dict) -> None: ...
```

### Brain Decision Loop

```python
async def run(self) -> MissionContext:
    """Brain's main orchestration loop."""

    # 1. Parse mission, ask clarifying questions if needed
    context = await self._initialize_mission()

    while not context.phase == "done":
        if self._kill_switch: break

        # 2. Call LLM with current mission state
        decision = await self._reason(context)

        # 3. Execute decision (spawn agent, wait, update context, etc.)
        result = await self._execute_decision(decision)

        # 4. Process results, update context
        await self._process_result(result, context)

        # 5. Check if mission is complete
        if await self._is_mission_complete(context):
            break

    # 6. Spawn reporting agent
    await self._spawn_reporting_agent(context)

    return context
```

### Brain's LLM Prompt Structure

```
System: You are a senior penetration tester coordinating an expert red team.
        You have access to specialized agents and must orchestrate them to
        achieve the mission objectives efficiently and thoroughly.

        Mission: {mission_description}
        Scope: {scope}
        Mode: {mode}
        Environment: {environment_type}
        Permission flags: {flags}

        Current mission state:
        {mission_context_summary}

        Active agents: {active_agents}

        Available agent types and their capabilities:
        {agent_type_descriptions}

        Decide what to do next. You can:
        - spawn_agent(type, task, context)
        - wait_for_agent(agent_id)
        - ask_user(question) if you need operator input
        - update_mission_context(key, value)
        - write_finding(category, data)

        Respond with JSON:
        {
          "thought": "Your reasoning here",
          "action": "spawn_agent | wait_for_agent | ask_user | mission_complete",
          "parameters": {...}
        }
```

### Parallelism Logic

Brain uses a dependency graph to decide when to run agents in parallel:

```python
# Dependencies:
# - OSINT: no deps (run immediately if domain given)
# - Scanner: no deps (run immediately)
# - Web Agent: depends on Scanner (needs HTTP ports)
# - Exploit Agent: depends on Scanner (needs service info)
# - PostExploit: depends on Exploit (needs active shell)
# - Lateral: depends on PostExploit (needs credentials + privesc)
# - Reporting: depends on all others

AGENT_DEPENDENCIES = {
    "osint":       [],
    "scanner":     [],
    "web":         ["scanner"],
    "exploit":     ["scanner"],
    "postexploit": ["exploit"],     # specifically: needs shell_opened event
    "lateral":     ["postexploit"], # needs credentials + privileged session
    "reporting":   ["*"],           # waits for all
}
```

---

## 6. ShellManager — Persistent Sessions

**File:** `core/shell_manager.py`

ShellManager is a **service**, not an agent. It has no LLM. It manages all active shells
and provides a clean API for agents to interact with targets.

### ShellSession Model

```python
class ShellSession(BaseModel):
    session_id: str
    mission_id: str
    host_ip: str
    port: int | None
    session_type: str        # "meterpreter" | "shell" | "ssh" | "web_shell"
    privilege_level: int     # 0=nobody/www-data, 1=user, 2=service, 3=root/SYSTEM
    username: str | None
    os_type: str | None      # "linux" | "windows" | "macos"
    os_version: str | None
    msf_session_id: int | None   # Metasploit RPC session ID
    exploit_used: str | None     # for reconnect
    exploit_options: dict = {}   # for reconnect
    status: str = "active"       # "active" | "lost" | "closed"
    last_heartbeat: float = Field(default_factory=time.time)
    opened_at: float = Field(default_factory=time.time)
    closed_at: float | None = None
```

### ShellManager API

```python
class ShellManager:
    async def register_session(self, session: ShellSession) -> None:
        """Called by Exploit Agent when shell is obtained."""
        ...

    async def get_session(
        self,
        host_ip: str,
        min_privilege: int = 0,
        session_type: str | None = None,
    ) -> ShellSession | None:
        """Return best available session for host meeting privilege requirement."""
        ...

    async def execute(
        self,
        session_id: str,
        command: str,
        timeout: float = 30.0,
    ) -> CommandResult:
        """Execute command on session. Route through Metasploit RPC or SSH."""
        ...

    async def upload_file(
        self,
        session_id: str,
        local_path: str,
        remote_path: str,
    ) -> bool: ...

    async def download_file(
        self,
        session_id: str,
        remote_path: str,
    ) -> bytes: ...

    async def upgrade_session(self, session_id: str) -> ShellSession | None:
        """Attempt shell → meterpreter upgrade."""
        ...

    async def list_sessions(self, mission_id: str | None = None) -> list[ShellSession]: ...
    async def close_session(self, session_id: str) -> None: ...

    # Internal
    async def _heartbeat_loop(self) -> None:
        """Check all sessions every 30s. Mark lost sessions, attempt reconnect."""
        ...

    async def _reconnect_session(self, session: ShellSession) -> bool:
        """Re-exploit target using stored exploit info to restore session."""
        ...
```

### Session Lifecycle

```
Exploit Agent runs exploit
    │
    ▼ exploit success → shell/session opened
    │
    ▼ Exploit Agent calls shell_manager.register_session(...)
    │
    ▼ ShellManager starts heartbeat for this session (30s interval)
    │
    ▼ Brain notified: "shell_opened on 192.168.1.5, privilege=user"
    │
    ▼ Brain spawns PostExploit Agent with session info
    │
PostExploit Agent → shell_manager.get_session("192.168.1.5")
    │              → shell_manager.execute(session_id, "whoami")
    │
    ▼ [Session drops during PostExploit]
    │
    ▼ Heartbeat detects: last_heartbeat > 30s, session gone
    │
    ▼ ShellManager attempts reconnect:
    │   → re-runs exploit_agent.reconnect(exploit_used, options)
    │   → if success: session restored, agents continue
    │   → if fail: Brain notified → may choose different vector
    │
    ▼ Mission complete → ShellManager.close_session() for all sessions
```

### Privilege Levels

```
3 = root / SYSTEM / Administrator / Domain Admin
2 = Service account (www-data, nginx, mssql)
1 = Regular user (non-privileged shell)
0 = Unauthenticated / read-only web shell
```

When PostExploit Agent requests a session:
- Requests `min_privilege=1` for initial enumeration
- Requests `min_privilege=3` for privileged operations (dump hashes, add user)
- ShellManager returns the highest-privilege session available for that host

---

## 7. Specialized Agents

### 7.1 OSINT Agent

**File:** `agents/osint_agent.py`
**Triggers:** Target includes a domain name, or Brain explicitly spawns

```python
class OsintAgent(BaseAgent):
    def get_system_prompt(self) -> str:
        return """You are an expert OSINT (Open Source Intelligence) analyst.
        Your job is to gather as much intelligence as possible about the target
        using only passive or semi-passive techniques. Do not actively probe the target.

        Prioritize: subdomains, IP ranges, email addresses, technology stack,
        leaked credentials, exposed sensitive files, historical URLs."""

    def get_tool_subset(self) -> list[str]:
        return [
            "theharvester", "subfinder", "amass",
            "whois_lookup", "dns_lookup", "zone_transfer",
            "certificate_transparency", "google_dork",
            "github_dork", "wayback_machine",
            "shodan_search",   # if API key configured
            "censys_search",   # if API key configured
        ]
```

**Output to Brain:**
- All discovered subdomains and IPs → added to MissionContext.subdomains/ip_addresses
- Emails and personnel names
- Technology stack hints (skip discovery if already known)
- Leaked credentials or API keys (critical finding → immediate Brain notification)
- Historical endpoints worth investigating

### 7.2 Scanner Agent

**File:** `agents/scanner_agent.py`

```python
class ScannerAgent(BaseAgent):
    def get_system_prompt(self) -> str:
        return """You are an expert network reconnaissance specialist.
        Your job is to discover all live hosts and enumerate their services thoroughly.

        Strategy: masscan for speed → nmap targeted scan → service-specific scripts.
        Be thorough but don't miss anything. Flag interesting services immediately."""

    def get_tool_subset(self) -> list[str]:
        return [
            "masscan", "nmap", "nmap_scripts",
            "banner_grab", "ssl_scan",
            "smb_enum", "snmp_walk", "ldap_enum",
            "udp_scan", "dns_bruteforce",
        ]
```

### 7.3 Web Application Agent

**File:** `agents/web_agent.py`

```python
class WebAgent(BaseAgent):
    def get_system_prompt(self) -> str:
        return """You are an expert web application penetration tester.
        Your job is to thoroughly test the web application at the given URL.

        Workflow: fingerprint → enumerate directories → run nuclei → test specific vulns.
        Test for OWASP Top 10. Try authenticated paths if credentials are available.
        Report every finding with evidence and reproduction steps."""

    def get_tool_subset(self) -> list[str]:
        return [
            "whatweb", "nikto", "ffuf", "dirsearch",
            "nuclei", "sqlmap", "xss_scan",
            "ssrf_probe", "lfi_scan",
            "wpscan", "joomscan",
            "api_fuzz", "http_auth_brute",
        ]
```

**Authenticated testing:**
When MissionContext contains credentials for the target, Web Agent:
1. Attempts login with known credentials
2. Maps authenticated endpoints separately
3. Tests authenticated paths for privilege escalation (IDOR, etc.)

### 7.4 Exploit Agent

**File:** `agents/exploit_agent.py`

```python
class ExploitAgent(BaseAgent):
    def get_system_prompt(self) -> str:
        return """You are an expert exploit developer and vulnerability researcher.
        Given a list of services and versions, find and exploit vulnerabilities.

        Strategy:
        1. Cross-reference each service+version against CVE database
        2. Prioritize by CVSS and exploit reliability
        3. Use MSF check before full exploitation
        4. Try alternative payloads on failure
        5. Keep trying different approaches before giving up
        6. If shell is obtained, immediately notify Brain"""

    def get_tool_subset(self) -> list[str]:
        return [
            "searchsploit", "cve_lookup",
            "metasploit_search", "metasploit_run",
            "msf_check", "manual_exploit",
            "msfvenom", "generate_payload",
        ]
```

**On exploit success:**
```python
# Exploit Agent immediately emits critical finding to Brain
await self.emit_finding("shell_opened", {
    "host_ip": target_ip,
    "session_id": session_id,
    "privilege": "user" | "root",
    "exploit_used": module,
})
```

### 7.5 Post-Exploitation Agent

**File:** `agents/postexploit_agent.py`

```python
class PostExploitAgent(BaseAgent):
    def get_system_prompt(self) -> str:
        return """You are an expert post-exploitation specialist.
        You have an active shell on a compromised host. Your goals:
        1. Enumerate the system thoroughly
        2. Escalate to highest privileges possible
        3. Establish persistence (if authorized)
        4. Harvest all valuable credentials
        5. Identify paths for lateral movement

        Never close the shell. Always work through the Shell Manager.
        Report credentials and new attack paths immediately."""
```

**Privilege escalation decision tree:**
```
Current user is root/SYSTEM?
    YES → skip privesc, proceed to persistence/harvest
    NO →
        Run LinPEAS/WinPEAS
        Analyze results for:
            - sudo misconfig?          → try sudo exploit
            - SUID binaries?           → try SUID exploit
            - Writable cron jobs?      → try cron exploit
            - Kernel version known?    → check kernel exploits
            - Service running as root? → try service exploit
            - DLL hijack opportunity?  → try DLL hijack (Windows)
        Got root?
            YES → proceed
            NO → report partial success + recommendations to Brain
```

### 7.6 Lateral Movement Agent

**File:** `agents/lateral_agent.py`

```python
class LateralAgent(BaseAgent):
    def get_system_prompt(self) -> str:
        return """You are an expert in network lateral movement and Active Directory attacks.
        You have credentials and privileged access to at least one host.
        Your goal is to expand access across the network.

        Strategy:
        1. Discover internal network from compromised host
        2. Map reachable hosts and services
        3. Try harvested credentials against all reachable targets
        4. Set up pivot/tunnel for TIRPAN to reach internal networks
        5. Escalate in AD if possible (Kerberoast, DCSync)

        Report every new host compromised immediately."""
```

**AD escalation path:**
```
Internal network discovered
    │
    ▼ Identify domain controllers (LDAP, DNS, port 88)
    │
    ▼ Kerberoasting attempt
    │   → Get service tickets → crack offline with hashcat
    │
    ▼ ASREPRoasting attempt
    │   → Get AS-REP hashes for accounts without pre-auth
    │
    ▼ Got DA credentials?
    │   → DCSync (dump all domain hashes)
    │   → pass-the-hash to Domain Controller
    │
    ▼ Report: full domain compromise
```

---

## 8. New Tools

### Tool Priority and Implementation Order

**Priority 1 — Core (implement first):**

| Tool Name | Type | Binary | Category | Used By |
|---|---|---|---|---|
| `masscan` | cli_wrapper | `masscan` | recon | Scanner |
| `nuclei` | cli_wrapper | `nuclei` | vuln-scan | Web, Scanner |
| `ffuf` | cli_wrapper | `ffuf` | web | Web |
| `sqlmap` | cli_wrapper | `sqlmap` | exploit | Web |
| `nikto` | cli_wrapper | `nikto` | web | Web |
| `whatweb` | cli_wrapper | `whatweb` | web | Web |
| `linpeas` | python_class | — | post-exploit | PostExploit |
| `winpeas` | python_class | — | post-exploit | PostExploit |

**Priority 2 — OSINT:**

| Tool Name | Type | Binary | Category | Used By |
|---|---|---|---|---|
| `theharvester` | cli_wrapper | `theHarvester` | osint | OSINT |
| `subfinder` | cli_wrapper | `subfinder` | osint | OSINT |
| `amass` | cli_wrapper | `amass` | osint | OSINT |
| `whois_lookup` | python_class | — | osint | OSINT |
| `dns_lookup` | python_class | — | osint | OSINT |
| `wpscan` | cli_wrapper | `wpscan` | web | Web |
| `dirsearch` | cli_wrapper | `dirsearch` | web | Web |

**Priority 3 — Post-exploit / Lateral:**

| Tool Name | Type | Binary | Category | Used By |
|---|---|---|---|---|
| `crackmapexec` | cli_wrapper | `crackmapexec` / `nxc` | lateral | Lateral |
| `impacket_psexec` | python_class | — | lateral | Lateral |
| `impacket_secretsdump` | python_class | — | post-exploit | PostExploit |
| `hydra` | cli_wrapper | `hydra` | brute-force | Web, Lateral |
| `hashcat` | cli_wrapper | `hashcat` | cracking | PostExploit, Lateral |
| `ligolo_agent` | python_class | `ligolo-ng` | pivot | Lateral |
| `chisel` | cli_wrapper | `chisel` | pivot | Lateral |
| `msfvenom` | python_class | — | exploit | Exploit |

**Priority 4 — Optional paid API:**

| Tool Name | Type | Env Var | Category | Used By |
|---|---|---|---|---|
| `shodan_search` | api_wrapper | `SHODAN_API_KEY` | osint | OSINT |
| `censys_search` | api_wrapper | `CENSYS_API_KEY` | osint | OSINT |

### LinPEAS/WinPEAS Tool Design

These tools are special because they upload a script to the target and execute it:

```python
class LinPEASTool(BaseTool):
    """Upload and execute LinPEAS on target via Shell Manager."""

    async def execute(self, params: dict) -> dict:
        session_id = params["session_id"]
        shell_manager = params["_shell_manager"]  # injected at runtime

        # 1. Upload LinPEAS to /tmp/
        local_path = Path("tools/scripts/linpeas.sh")
        await shell_manager.upload_file(session_id, str(local_path), "/tmp/linpeas.sh")

        # 2. Make executable
        await shell_manager.execute(session_id, "chmod +x /tmp/linpeas.sh")

        # 3. Run with timeout (LinPEAS can take 3-5 minutes)
        result = await shell_manager.execute(
            session_id,
            "bash /tmp/linpeas.sh 2>/dev/null",
            timeout=300.0,
        )

        # 4. Parse output for key findings
        findings = self._parse_linpeas_output(result.output)

        # 5. Cleanup
        await shell_manager.execute(session_id, "rm /tmp/linpeas.sh")

        return {"success": True, "output": findings, "raw": result.output}
```

---

## 9. Database Schema Changes

### New Tables

```sql
-- Track all spawned agent instances within a mission
CREATE TABLE agent_instances (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL REFERENCES pentest_sessions(id),
    agent_type TEXT NOT NULL,
    -- "brain"|"osint"|"scanner"|"web"|"exploit"|"postexploit"|"lateral"|"reporting"
    status TEXT NOT NULL DEFAULT 'spawning',
    -- "spawning"|"running"|"paused"|"done"|"failed"|"killed"
    task_description TEXT,
    llm_provider TEXT,
    llm_model TEXT,
    iterations INTEGER DEFAULT 0,
    started_at REAL DEFAULT (unixepoch('now', 'subsec')),
    finished_at REAL,
    result_json TEXT,     -- AgentResult serialized
    error_message TEXT
);

-- Inter-agent communication log (append-only)
CREATE TABLE agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    message_type TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    payload_json TEXT,
    correlation_id TEXT,
    created_at REAL DEFAULT (unixepoch('now', 'subsec'))
);

-- Persistent shell sessions
CREATE TABLE shell_sessions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL REFERENCES pentest_sessions(id),
    host_ip TEXT NOT NULL,
    port INTEGER,
    session_type TEXT NOT NULL,  -- "meterpreter"|"shell"|"ssh"|"web_shell"
    privilege_level INTEGER DEFAULT 0,
    username TEXT,
    os_type TEXT,                -- "linux"|"windows"|"macos"
    os_version TEXT,
    msf_session_id INTEGER,
    exploit_used TEXT,
    exploit_options_json TEXT,
    status TEXT DEFAULT 'active', -- "active"|"lost"|"closed"
    last_heartbeat REAL DEFAULT (unixepoch('now', 'subsec')),
    opened_at REAL DEFAULT (unixepoch('now', 'subsec')),
    closed_at REAL
);

-- Harvested credentials
CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    source_host TEXT,
    username TEXT,
    password TEXT,
    hash TEXT,
    hash_type TEXT,              -- "ntlm"|"sha512crypt"|"bcrypt"|"md5crypt"
    private_key TEXT,
    credential_type TEXT NOT NULL, -- "plaintext"|"hash"|"key"|"token"|"cookie"
    service TEXT,
    valid_on TEXT,               -- comma-separated IPs where cred was verified
    source_tool TEXT,            -- which tool found it
    created_at REAL DEFAULT (unixepoch('now', 'subsec'))
);

-- Exfiltrated data and files
CREATE TABLE loot (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    source_host TEXT,
    source_path TEXT,
    loot_type TEXT NOT NULL,     -- "file"|"data"|"screenshot"|"config"|"key"|"database"
    description TEXT,
    content TEXT,                -- for text data
    file_path TEXT,              -- local path for stored files
    file_size INTEGER,
    created_at REAL DEFAULT (unixepoch('now', 'subsec'))
);

-- High-level mission phase tracking
CREATE TABLE mission_phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    phase_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    -- "pending"|"in_progress"|"done"|"skipped"|"failed"
    started_at REAL,
    finished_at REAL,
    agent_id TEXT,              -- which agent handled this phase
    summary TEXT
);

-- Network topology (discovered hosts)
CREATE TABLE network_nodes (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    hostname TEXT,
    os_type TEXT,
    os_version TEXT,
    domain TEXT,
    is_domain_controller BOOLEAN DEFAULT 0,
    compromise_level INTEGER DEFAULT 0,
    -- 0=none, 1=access/web-shell, 2=user-shell, 3=root/system
    first_seen REAL DEFAULT (unixepoch('now', 'subsec')),
    last_seen REAL DEFAULT (unixepoch('now', 'subsec')),
    UNIQUE(mission_id, ip_address)
);

-- Attack paths and relationships
CREATE TABLE network_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    from_node TEXT NOT NULL,   -- IP or "attacker"
    to_node TEXT NOT NULL,
    edge_type TEXT NOT NULL,   -- "exploit"|"lateral"|"pivot"|"discovered_from"
    description TEXT,
    created_at REAL DEFAULT (unixepoch('now', 'subsec'))
);
```

### Repository Classes

New repositories following the existing pattern in `database/repositories.py`:

```python
class AgentInstanceRepository: ...
class AgentMessageRepository: ...
class ShellSessionRepository: ...
class CredentialRepository: ...
class LootRepository: ...
class MissionPhaseRepository: ...
class NetworkNodeRepository: ...
class NetworkEdgeRepository: ...
```

---

## 10. API Changes

### New Endpoints

```python
# Agent management
GET  /api/v1/sessions/{sid}/agents
GET  /api/v1/sessions/{sid}/agents/{aid}
POST /api/v1/sessions/{sid}/agents/{aid}/kill
POST /api/v1/sessions/{sid}/agents/{aid}/inject

# Shell sessions
GET  /api/v1/sessions/{sid}/shells
POST /api/v1/sessions/{sid}/shells/{shell_id}/execute
GET  /api/v1/sessions/{sid}/shells/{shell_id}/health

# Intelligence
GET  /api/v1/sessions/{sid}/credentials
GET  /api/v1/sessions/{sid}/loot
GET  /api/v1/sessions/{sid}/attack-graph
GET  /api/v1/sessions/{sid}/mission-context

# Configuration
GET  /api/v1/config/agent-models
POST /api/v1/config/agent-models
GET  /api/v1/tools/status
```

### Updated StartSessionRequest

```python
class StartSessionRequest(BaseModel):
    # V1 fields (unchanged)
    target: str
    mode: str
    port_range: str | None = None
    notes: str | None = None
    llm_provider: str | None = None
    llm_model: str | None = None

    # V2 additions
    environment_type: str = "unknown"       # "production"|"staging"|"lab"|"unknown"
    per_agent_models: dict[str, str] = {}   # {"brain": "claude-opus-4-6", "scanner": "llama3:8b"}

    # V2 permission flags (all default False for safety)
    allow_persistence: bool = False
    allow_credential_harvest: bool = False
    allow_lateral_movement: bool = False
    allow_data_exfil: bool = False
    allow_docker_escape: bool = False

    # V2 scope
    max_parallel_agents: int = 8
```

---

## 11. UI Changes

### Agent Orchestra Panel

Replace single agent feed with multi-pane orchestrated view:

```
┌─────────────────────────────────────────────────────────────────┐
│  BRAIN                                                           │
│  ● Reasoning: Scanner found HTTP/443 on 192.168.1.5. Spawning  │
│    Web App Agent to test the application...                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐
│ OSINT Agent  │ │Scanner Agent │ │  Web Agent   │ │ Exploit    │
│ ✅ Done      │ │ ✅ Done      │ │ 🔄 Running  │ │ 🔄 Running│
│              │ │              │ │              │ │            │
│ 15 subdomains│ │ 4 hosts      │ │ Testing: SQL │ │ CVE-2023  │
│ 3 emails     │ │ 23 ports     │ │ injection    │ │ EternalBlue│
│ 1 leaked key │ │ 8 services   │ │              │ │ checking...│
└──────────────┘ └──────────────┘ └──────────────┘ └────────────┘

┌──────────────┐ ┌──────────────┐
│PostExploit   │ │  Lateral     │
│ ⏳ Waiting  │ │ ⏳ Waiting  │
│ for shell    │ │ for creds    │
└──────────────┘ └──────────────┘
```

### Enhanced Attack Graph

Network nodes color-coded by compromise level:
- ⬜ Gray — discovered, no access
- 🔵 Blue — access gained (web shell, low priv)
- 🟡 Yellow — user shell
- 🟠 Orange — service account
- 🔴 Red — root/SYSTEM/Domain Admin

Edge types:
- `→ exploit` — direct exploitation
- `→ lateral` — lateral movement using credentials
- `→ pivot` — routed through tunnel/pivot

Clickable nodes: show all findings for that host in side panel.

### New Tabs

**Credentials Tab:**
```
┌──────┬──────────┬──────────┬──────┬───────────────────────────┐
│ Host │ Username │ Password │ Hash │ Valid On                   │
├──────┼──────────┼──────────┼──────┼───────────────────────────┤
│ .5   │ root     │ toor     │      │ 192.168.1.5, 192.168.1.10 │
│ .5   │ admin    │          │ NTLMx│ 192.168.1.5               │
└──────┴──────────┴──────────┴──────┴───────────────────────────┘
```
All values copyable with one click.

**Loot Tab:**
```
┌──────┬──────────────────┬────────┬────────────────────────────┐
│ Host │ Path             │ Type   │ Description                │
├──────┼──────────────────┼────────┼────────────────────────────┤
│ .5   │ /etc/shadow      │ file   │ Password hashes            │
│ .5   │ ~/.ssh/id_rsa    │ key    │ SSH private key            │
│ .10  │ /var/www/config  │ config │ Database credentials       │
└──────┴──────────────────┴────────┴────────────────────────────┘
```

### Per-Agent Model Selector

```
┌─────────────────────┬────────────────────────────────────────┐
│ Agent               │ Model                                  │
├─────────────────────┼────────────────────────────────────────┤
│ Brain               │ [claude-opus-4-6          ▼]          │
│ OSINT               │ [claude-sonnet-4-6        ▼]          │
│ Scanner             │ [llama3:8b (local)        ▼]          │
│ Web App             │ [claude-sonnet-4-6        ▼]          │
│ Exploit             │ [claude-opus-4-6          ▼]          │
│ Post-Exploitation   │ [claude-opus-4-6          ▼]          │
│ Lateral Movement    │ [claude-sonnet-4-6        ▼]          │
│ Reporting           │ [claude-sonnet-4-6        ▼]          │
└─────────────────────┴────────────────────────────────────────┘

Presets: [All Local]  [All Cloud]  [Brain Cloud + Rest Local]
```

---

## 12. Safety Extensions

### New Permission Flags

Added to `SafetyConfig` and `StartSessionRequest`:

```python
class SafetyConfig(BaseModel):
    # ... existing V1 rules unchanged ...

    # V2 permission flags (all default False)
    allow_persistence: bool = False
    allow_credential_harvest: bool = False
    allow_lateral_movement: bool = False
    allow_data_exfil: bool = False
    allow_docker_escape: bool = False
```

### Per-Flag Behavior

| Flag | When False (default) | When True |
|---|---|---|
| `allow_persistence` | PostExploit Phase 3 skipped entirely | Crontab, SSH key, service, registry backdoors allowed |
| `allow_credential_harvest` | PostExploit Phase 4 skipped | /etc/shadow, mimikatz, browser creds allowed |
| `allow_lateral_movement` | Lateral Movement Agent never spawned | Full lateral movement enabled |
| `allow_data_exfil` | File downloads blocked | File download via Shell Manager allowed |
| `allow_docker_escape` | Container escape skipped | Docker/LXC escape attempts allowed |

**Safety pipeline update:**

```python
class SafetyGuard:
    def check(self, action: dict, context: SafetyContext) -> SafetyResult:
        # ... existing 10 rules ...

        # V2 additional checks
        if action.get("category") == "persistence":
            if not self.config.allow_persistence:
                return SafetyResult.BLOCKED("Persistence not enabled in mission config")

        if action.get("category") == "credential_harvest":
            if not self.config.allow_credential_harvest:
                return SafetyResult.BLOCKED("Credential harvesting not enabled in mission config")

        # etc.
```

All blocked actions are audit-logged with the specific rule that blocked them.

---

## 13. Implementation Phases

### Phase 1: Foundation (Estimated: 2 weeks)

**Goal:** Core infrastructure working, Brain can spawn one agent and receive results.

Tasks:
1. `BaseAgent` abstract class
2. `AgentMessage`, `AgentResult` Pydantic models
3. `AgentMessageBus` (in-memory first, DB persistence second)
4. `MissionContext` dataclass + persistence
5. `BrainAgent` — basic spawn/wait loop (no LLM yet, rule-based)
6. `AgentInstanceRepository`, `AgentMessageRepository`
7. New DB tables + schema migration
8. New API endpoints (agent listing, status)
9. New WebSocket events
10. Unit tests for all new components

**Milestone:** Brain spawns a Scanner Agent, Scanner runs nmap, Brain receives result.

---

### Phase 2: Shell Manager (Estimated: 1 week)

**Goal:** Shells never lost during a mission.

Tasks:
1. `ShellSession` model
2. `ShellManager` service class
3. Metasploit RPC integration
4. Heartbeat loop
5. Reconnect logic
6. `ShellSessionRepository`
7. New API endpoints
8. Unit tests

**Milestone:** Exploit Agent gets shell, ShellManager registers it, PostExploit Agent uses it.

---

### Phase 3: Specialized Agents (Estimated: 4 weeks)

Implement in order: Scanner → Exploit → OSINT → Web → PostExploit → Lateral → Reporting

For each agent:
1. Agent class (`agents/*.py`)
2. System prompt with persona and strategy
3. Tool subset declaration
4. Specific output parsing and finding emission
5. Integration tests

**Milestone:** Full pipeline working: OSINT → Scanner → Exploit → Shell → PostExploit → Report

---

### Phase 4: New Tools (Estimated: 3 weeks)

Implement Priority 1 tools first, then 2, then 3.

For each tool:
1. `plugin.json` (cli_wrapper or api_wrapper)
2. `tool.py` for python_class tools
3. Output parser
4. `health_check()` implementation
5. Unit tests

**Milestone:** 30+ tools working across all agent types.

---

### Phase 5: Brain LLM Intelligence (Estimated: 2 weeks)

**Goal:** Brain makes smart decisions, not just pre-programmed ones.

Tasks:
1. Brain LLM prompt engineering (senior pentester persona)
2. Parallel agent coordination logic
3. Environment type detection
4. Clarifying questions system
5. Adaptive failure handling
6. Critical finding fast path
7. Integration tests with full agent pipeline

**Milestone:** Brain successfully adapts strategy when exploit fails, finds alternative path.

---

### Phase 6: UI (Estimated: 1.5 weeks)

Tasks:
1. Agent Orchestra Panel
2. Brain reasoning feed (separate from agent feeds)
3. Enhanced Attack Graph (compromise levels, edge types)
4. Credentials Panel
5. Loot Panel
6. Per-agent model selector
7. Mission Context live panel

**Milestone:** Full V2 UI working with live multi-agent mission.
