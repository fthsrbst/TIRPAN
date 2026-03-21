# AEGIS — Architecture

> *Autonomous Ethical Guardrailed Intelligence System*

---

## Design Principle

> **"A senior pentester thinks before they act — so does AEGIS."**
>
> A **Brain Agent** coordinates a team of specialized sub-agents. Each agent is an expert
> in its domain. The Brain assesses the target, decides strategy, delegates tasks in parallel,
> collects results, and adapts — exactly like a real red team lead.

---

## Current State (V1 — Implemented)

AEGIS V1 ships a fully working autonomous pentest platform with a single ReAct agent:

```
┌───────────────────────────────────────────────────────────────────────┐
│                          AEGIS V1 (current)                           │
│                                                                       │
│  ┌──────────┐    ┌────────────────────────────────────────────────┐   │
│  │  Web UI  │───>│             FastAPI Backend                    │   │
│  │          │<───│  REST + WebSocket                              │   │
│  └──────────┘    └──────────────────┬─────────────────────────────┘   │
│                                     │                                 │
│                         ┌───────────▼────────────┐                    │
│                         │    PentestAgent        │                    │
│                         │    (ReAct Loop)        │                    │
│                         │                        │                    │
│                         │  Reason → Act →        │                    │
│                         │  Observe → Reflect     │                    │
│                         │                        │                    │
│                         │  ┌──────────────────┐  │                    │
│                         │  │  Safety Guard    │  │                    │
│                         │  │  (every action)  │  │                    │
│                         │  └──────────────────┘  │                    │
│                         └───────────┬────────────┘                    │
│                                     │                                 │
│                         ┌───────────▼─────────────┐                   │
│                         │    Tool Registry        │                   │
│                         │                         │                   │
│                         │  Core Tools:            │                   │
│                         │  ├── NmapTool           │                   │
│                         │  ├── SearchSploitTool   │                   │
│                         │  └── MetasploitTool     │                   │
│                         │                         │                   │
│                         │  Plugin Tools:          │                   │
│                         │  └── (loaded from       │                   │
│                         │      /plugins/ dir)     │                   │
│                         └─────────────────────────┘                   │
│                                                                       │
│  ┌──────────────────────────┐   ┌──────────────────────────────────┐  │
│  │    LLM Layer             │   │       SQLite Database            │  │
│  │  OpenRouter / Ollama /   │   │  Sessions / Scans / Vulns /      │  │
│  │  LM Studio               │   │  Exploits / Audit / KB           │  │
│  └──────────────────────────┘   └──────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

**V1 Attack Flow (Sequential):**
```
DISCOVERY      nmap ping sweep         → host list
PORT_SCAN      nmap service detect     × each host
EXPLOIT_SEARCH searchsploit            × each service
EXPLOITATION   metasploit_run          × each vulnerability
DONE           generate_report
```

---

## Target Architecture (V2 — Multi-Agent)

The V2 architecture replaces the single agent with a hierarchical multi-agent system.

```
┌───────────────────────────────────────────────────────────────────────┐
│                          AEGIS V2 (planned)                           │
│                                                                       │
│  ┌──────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  Web UI  │───>│  FastAPI Backend + WebSocket Event Bus          │  │
│  │          │<───│                                                 │  │
│  └──────────┘    └──────────────────┬──────────────────────────────┘  │
│                                     │                                 │
│                         ┌───────────▼────────────┐                    │
│                         │      BRAIN AGENT       │                    │
│                         │    (LLM Coordinator)   │                    │
│                         │                        │                    │
│                         │  - Mission planning    │                    │
│                         │  - Agent orchestration │                    │
│                         │  - Result aggregation  │                    │
│                         │  - Adaptive strategy   │                    │
│                         └──────────┬─────────────┘                    │
│                                    │ spawns & coordinates             │
│                ┌───────────────────┼───────────────────────┐          │
│                │                   │                       │          │
│   ┌────────────▼───────────────────▼───────────────────────▼───────┐  │
│   │                 SPECIALIZED AGENTS (run in parallel)           │  │
│   │                                                                │  │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐     │  │
│   │  │  OSINT   │ │ SCANNER  │ │   WEB APP    │ │  EXPLOIT   │     │  │
│   │  │  Agent   │ │  Agent   │ │   Agent      │ │  Agent     │     │  │
│   │  └──────────┘ └──────────┘ └──────────────┘ └────────────┘     │  │
│   │  ┌───────────────────────┐ ┌──────────────────────────────┐    │  │
│   │  │  POST-EXPLOIT Agent   │ │   LATERAL MOVEMENT Agent     │    │  │
│   │  └───────────────────────┘ └──────────────────────────────┘    │  │
│   │  ┌───────────────────────────────────────────────────────┐     │  │
│   │  │                   REPORTING Agent                     │     │  │
│   │  └───────────────────────────────────────────────────────┘     │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│                         ┌────────────────────────┐                    │
│                         │    SHELL MANAGER       │                    │
│                         │  (Background Service)  │                    │
│                         │                        │                    │
│                         │  - Session registry    │                    │
│                         │  - Health heartbeat    │                    │
│                         │  - Auto-reconnect      │                    │
│                         │  - Pivot/tunnel mgmt   │                    │
│                         └────────────────────────┘                    │
│                                                                       │
│  ┌────────────────────┐   ┌──────────────────┐  ┌─────────────────┐   │
│  │    Tool Registry   │   │   LLM Layer      │  │ SQLite Database │   │
│  │  50+ tools across  │   │  Per-agent model │  │ 15+ tables      │   │
│  │  all categories    │   │  selection       │  │                 │   │
│  └────────────────────┘   └──────────────────┘  └─────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## V2 Attack Flow (Parallel, Adaptive)

```
Mission Start
    │
    ├──[parallel]──────────────────┐
    │                              │
  OSINT Agent                 Scanner Agent
  (if domain given)           (masscan → nmap)
  theHarvester, subfinder,    host discovery,
  DNS, GitHub dork            service detect
    │                              │
    └──────[merge]─────────────────┘
                   │
            Brain Decision Point
            (all intel evaluated)
                   │
    ┌──────────────┼────────────────┐
    │              │                │
  Web Agent    Exploit Agent   [additional Scanner]
  (per HTTP    (per vuln)      if more subnets found
   service)        │
               [shell opened]
                   │
               Shell Manager registers session
                   │
           Post-Exploitation Agent
           - LinPEAS/WinPEAS
           - Privilege escalation
           - Persistence
           - Credential harvest
                   │
           Lateral Movement Agent
           - Internal scan via pivot
           - Credential spray
           - Tunnel setup
                   │
           Reporting Agent
```

---

## Agent Definitions

### Brain Agent (Coordinator)

**Role:** Mission planner, orchestrator, decision maker
**Model:** Configurable per user (default: most capable available — Opus recommended)

**Responsibilities:**
- Parse mission parameters (target, scope, mode, environment type)
- Ask operator clarifying questions if mission is ambiguous
- Spawn specialized agents with specific task descriptions
- Receive agent results and update global MissionContext
- Run agents in parallel or sequentially based on dependency graph
- Handle agent failures: try differently → alternative vector → ask user
- Detect production vs staging vs lab from DNS, banners, scope notes
- Maintain global AttackGraph (nodes=hosts/services, edges=relationships)

**Brain-exclusive meta-tools:**
```
spawn_agent(type, task, context, priority)   → agent_id
wait_for_agent(agent_id, timeout)            → agent_result
send_to_agent(agent_id, message)             → inject mid-task
kill_agent(agent_id, reason)                 → stop agent
ask_user(question, context)                  → operator input
read_mission_context()                       → full state
update_mission_context(key, value)           → update state
write_finding(category, data)                → persist discovery
```

---

### OSINT Agent

**Role:** Passive and semi-passive intelligence gathering
**Triggers:** Domain target given, or Brain requests more context

**Tools:** theHarvester, subfinder, amass, whois_lookup, dns_lookup, zone_transfer,
certificate_transparency, google_dork, github_dork, wayback_machine,
shodan_search *(API key)*, censys_search *(API key)*

**Output:** Subdomains, IPs, emails, tech stack hints, leaked credentials

---

### Scanner Agent

**Role:** Network discovery and service enumeration
**Model:** Lighter model acceptable

**Tools:** masscan, nmap, nmap_scripts, banner_grab, ssl_scan, smb_enum,
snmp_walk, ldap_enum, udp_scan, dns_bruteforce

**Strategy:** masscan (wide/fast) → nmap targeted on open ports → NSE scripts on interesting ports

---

### Web Application Agent

**Role:** HTTP service discovery, mapping, vulnerability testing
**Triggers:** HTTP/HTTPS ports found (80, 443, 8080, 8443, etc.)

**Tools:** whatweb, nikto, ffuf, dirsearch, nuclei, sqlmap, xss_scan,
ssrf_probe, lfi_scan, wpscan, joomscan, api_fuzz, http_auth_brute

**Strategy:** Technology detect → Directory enum → Nuclei scan → CMS-specific → Deep vuln testing → Authenticated testing if creds available

---

### Exploit Agent

**Role:** Vulnerability research and exploitation
**Model:** Strong reasoning model recommended

**Tools:** searchsploit, cve_lookup, metasploit_search, metasploit_run,
msf_check, manual_exploit, msfvenom, generate_payload

**Strategy:**
1. Cross-reference services+versions against CVE database
2. Prioritize by CVSS and exploit reliability rating
3. Run MSF `check` before full exploit
4. Try alternative payloads on failure
5. After N failures → report to Brain + ask for guidance

---

### Shell Manager (Persistent Session Handler)

**Role:** Maintain ALL active shells, route commands, prevent session loss
**Type:** Background service — no LLM, runs independently of agents

**Session types:** meterpreter, shell, ssh, web_shell

**Behaviors:**
- Heartbeat every 30s per session
- Auto-reconnect on session drop (re-exploits using stored exploit info)
- Privilege level tracking: 0=nobody, 1=user, 2=service, 3=root/SYSTEM
- Session upgrade: shell → meterpreter
- Pivot/tunnel registration (ligolo-ng, chisel)
- Multi-session per host

**Agent API:**
```
get_session(host_ip, min_privilege)        → best available session
execute(session_id, command, timeout)      → run command, return output
upload_file(session_id, src, dst)          → upload to target
download_file(session_id, remote_path)     → download from target
upgrade_session(session_id)               → upgrade to meterpreter
list_sessions(mission_id)                 → all active sessions
```

**Key invariant:** All agents route shell commands through Shell Manager.
No agent interacts directly with Metasploit sessions.

---

### Post-Exploitation Agent

**Role:** Everything after initial shell — enumerate, escalate, persist, harvest
**Triggers:** Shell Manager has an active session
**Requires:** Active session from Shell Manager

**Phase 1 — Local Enumeration:**
run_linpeas / run_winpeas, enumerate_users, enumerate_services,
enumerate_network, enumerate_files, check_sudo, check_suid,
check_capabilities, process_list

**Phase 2 — Privilege Escalation:**
kernel_exploit_check, sudo_exploit, suid_exploit, service_exploit,
cron_exploit, path_hijack, dll_hijack (Win), token_impersonation (Win),
getsystem (Meterpreter)

**Phase 3 — Persistence** *(requires `allow_persistence=True`):*
add_cron, add_service, add_ssh_key, add_registry_run (Win), create_backdoor_user

**Phase 4 — Credential Harvesting** *(requires `allow_credential_harvest=True`):*
dump_hashes, dump_memory_creds, find_credentials, dump_browser_creds,
dump_ssh_keys, dump_aws_keys

---

### Lateral Movement Agent

**Role:** Expand access across network from compromised host
**Triggers:** Privileged session available + more hosts in scope
**Requires:** `allow_lateral_movement=True`

**Tools:** arp_scan_from_host, port_scan_from_host, pass_the_hash,
pass_the_ticket, psexec, winrm_exec, ssh_lateral, smb_exec,
crackmapexec, setup_pivot, kerberoast, asreproast, dcsync

---

### Reporting Agent

**Role:** Aggregate all findings, generate professional pentest report

**Output:** Executive summary, technical findings with evidence,
attack narrative, CVSS risk matrix, remediation guide,
HTML + PDF report, attack graph visualization

---

## Communication Protocol

### Agent Message Bus

All agents communicate via `AgentMessageBus`:

```python
class AgentMessage(BaseModel):
    from_agent: str       # agent_id | "brain" | "user" | "shell_manager"
    to_agent: str         # agent_id | "brain" | "broadcast"
    message_type: str     # "task" | "result" | "finding" | "status" | "question" | "answer"
    priority: str = "normal"
    payload: dict
    correlation_id: str | None = None
    timestamp: float
```

### Shared Mission Context

Brain maintains `MissionContext` updated in real-time:

```
MissionContext
├── mission_id, target, scope, mode, environment_type, operator_notes
├── domains, subdomains, ip_addresses, emails
├── hosts: {ip → {ports, services, os, hostname}}
├── vulnerabilities: [Vulnerability]
├── active_sessions: [SessionSummary]   ← from Shell Manager
├── credentials: [Credential]           ← harvested
├── loot: [Loot]
├── phase, completed_tasks, active_agents: {id → AgentStatus}
├── attack_graph: AttackGraph
└── permission flags: allow_persistence, allow_credential_harvest, ...
```

**Access rules:** All agents READ. Only Brain WRITES.

---

## Parallelism Strategy

Brain uses a dependency graph:

```
Mission Start
    ├──[parallel]──────────────────┐
  OSINT Agent                 Scanner Agent
    └──────[merge]─────────────────┘
                   │
            Brain Decision Point
                   │
    ┌──────────────┼──────────────┐
  Web Agent    Exploit Agent   more Scanners
                   │
               Shell Manager
                   │
           PostExploit Agent ──[parallel]── Web Agent (other hosts)
                   │
           Lateral Movement ──[parallel]── ongoing scanning
                   │
           Reporting Agent
```

**Rules:** Max concurrent agents configurable (default: 8).
OSINT + Scanner always parallel if domain given.
PostExploit only after shell opened. Lateral only after credentials harvested.

---

## Safety System

### Existing 10 Rules (Unchanged)

| # | Rule | Default |
|---|------|---------|
| 1 | Target CIDR scope | Required |
| 2 | Port range scope | 1-65535 |
| 3 | Excluded IPs | [] |
| 4 | Excluded ports | [] |
| 5 | Exploit permitted | true |
| 6 | No DoS exploits | blocked |
| 7 | No destructive exploits | blocked |
| 8 | Max CVSS score | 10.0 |
| 9 | Session time limit | 3600s |
| 10 | Rate limit | 10 req/s |

### V2 Permission Flags (New — all default False)

| Flag | Controls |
|------|----------|
| `allow_persistence` | PostExploit Phase 3 (crontab, SSH key, service backdoors) |
| `allow_credential_harvest` | PostExploit Phase 4 (/etc/shadow, mimikatz, browser creds) |
| `allow_lateral_movement` | Lateral Movement Agent spawn |
| `allow_data_exfil` | File downloads from targets |
| `allow_docker_escape` | Container escape techniques |

**Key invariant:** Safety pipeline runs on every tool call regardless of which agent calls it.
All agent actions attributed to their agent_id in the audit log.

---

## Database Schema

### V1 Tables (Existing)

| Table | Purpose |
|---|---|
| `conversations` | Chat UI sessions |
| `messages` | Chat messages |
| `app_settings` | Key-value settings |
| `pentest_sessions` | Pentest mission records |
| `scan_results` | Nmap host/port output |
| `vulnerabilities` | Discovered CVEs |
| `exploit_results` | Exploitation attempts |
| `knowledge_base` | Successful exploit patterns |
| `audit_log` | Every action, append-only |
| `session_events` | Agent events for WS replay |

### V2 Tables (New)

| Table | Purpose |
|---|---|
| `agent_instances` | Spawned agent lifecycle (type, status, task, result) |
| `agent_messages` | Inter-agent message log |
| `shell_sessions` | Persistent shell registry (type, privilege, health) |
| `credentials` | Harvested creds (plaintext, hash, key, token) |
| `loot` | Exfiltrated files and data |
| `mission_phases` | High-level phase tracking |
| `network_nodes` | Discovered hosts with compromise level |
| `network_edges` | Attack paths (exploit, lateral, pivot) |

---

## Tool Registry

### Plugin Types

| Type | Use Case | Python Code Needed |
|---|---|---|
| `python_class` | Complex logic, stateful tools | Yes |
| `cli_wrapper` | Any CLI binary | No — JSON config only |
| `api_wrapper` | REST API tools | No — JSON config only |

### Tool Health Checks

Every tool implements `health_check()`:
- Reports availability before session starts
- Unavailable tools excluded from LLM prompt
- Install hints surfaced in UI
- Degraded mode supported (e.g., nmap without sudo)

### Tool Categories

| Category | Examples | Used By |
|---|---|---|
| recon | masscan, nmap, banner_grab | Scanner |
| osint | theHarvester, subfinder, whois | OSINT |
| web | ffuf, nikto, nuclei, sqlmap | Web App |
| exploit | searchsploit, metasploit_run | Exploit |
| post-exploit | linpeas, dump_hashes, add_cron | PostExploit |
| lateral | crackmapexec, psexec, kerberoast | Lateral |
| pivot | ligolo, chisel | Lateral |
| brute-force | hydra, hashcat | Web App, Lateral |

---

## LLM Layer

### Per-Agent Model Selection

| Agent | Recommended | Why |
|---|---|---|
| Brain | Strongest (Opus) | Complex planning, multi-step reasoning |
| OSINT | Medium | Tool orchestration + output parsing |
| Scanner | Light OK | Mostly tool execution |
| Web App | Medium-strong | Web vuln pattern knowledge |
| Exploit | Strong | CVE matching, payload selection |
| PostExploit | Strong | Complex privesc reasoning |
| Lateral | Strong | AD/network knowledge intensive |
| Reporting | Medium (good writer) | Natural language generation |

### Supported Providers

| Provider | Mode | Notes |
|---|---|---|
| Ollama | Local | Free, private, fast for simple tasks |
| LM Studio | Local | Alternative local option |
| OpenRouter | Cloud | Claude, GPT-4, Llama, Mixtral |

All providers runtime-switchable. Each agent independently configurable.

---

## Directory Structure (V2 Target)

```
AEGIS/
├── main.py
├── config.py
├── requirements.txt
│
├── core/
│   ├── agent.py                     # [V1] PentestAgent ReAct loop (preserved)
│   ├── base_agent.py                # [V2] BaseAgent abstract class
│   ├── brain_agent.py               # [V2] Brain coordinator
│   ├── agent_message_bus.py         # [V2] Inter-agent pub/sub
│   ├── mission_context.py           # [V2] Shared mission state
│   ├── shell_manager.py             # [V2] Persistent shell sessions
│   ├── llm_client.py                # LLM abstraction
│   ├── safety.py                    # 10 rules + V2 permission flags
│   ├── memory.py                    # Bounded sliding window memory
│   ├── prompts.py                   # Prompt builders (per agent type)
│   ├── tool_registry.py             # Plugin loader + tool catalog
│   ├── generic_tools.py             # GenericCLITool, GenericAPITool
│   └── secure_store.py              # Keychain / DB secret storage
│
├── agents/                          # [V2] Specialized agent implementations
│   ├── osint_agent.py
│   ├── scanner_agent.py
│   ├── web_agent.py
│   ├── exploit_agent.py
│   ├── postexploit_agent.py
│   ├── lateral_agent.py
│   └── reporting_agent.py
│
├── tools/                           # Core tools (V1 built-in)
│   ├── base_tool.py
│   ├── nmap_tool.py
│   ├── searchsploit_tool.py
│   └── metasploit_tool.py
│
├── plugins/                         # Plugin tools (optional)
│   ├── masscan/
│   ├── nuclei/
│   ├── ffuf/
│   ├── sqlmap/
│   ├── nikto/
│   ├── whatweb/
│   ├── theharvester/
│   ├── subfinder/
│   ├── amass/
│   ├── hydra/
│   ├── hashcat/
│   ├── crackmapexec/
│   ├── impacket/
│   ├── linpeas/
│   ├── winpeas/
│   ├── ligolo/
│   ├── shodan/          # requires SHODAN_API_KEY
│   └── censys/          # requires CENSYS_API_KEY
│
├── database/
│   ├── db.py
│   ├── repositories.py
│   ├── knowledge_base.py
│   └── schema.sql
│
├── models/
│   ├── target.py
│   ├── scan_result.py
│   ├── vulnerability.py
│   ├── exploit_result.py
│   ├── session.py
│   ├── mission.py           # [V2] MissionContext, MissionBrief
│   ├── agent_instance.py    # [V2]
│   ├── shell_session.py     # [V2]
│   ├── credential.py        # [V2]
│   └── loot.py              # [V2]
│
├── web/
│   ├── app.py
│   ├── routes.py
│   ├── websocket_handler.py
│   ├── session_manager.py
│   ├── app_state.py
│   ├── stats_state.py
│   └── static/
│       ├── index.html
│       ├── app.js
│       └── style.css
│
├── reporting/
│   ├── report_generator.py
│   ├── cvss.py
│   └── templates/
│       └── report.html
│
└── docs/
    ├── 02_ARCHITECTURE.md       ← THIS FILE
    ├── 04_ROADMAP.md
    ├── 05_SAFETY_AND_LEGAL.md
    ├── 09_PLUGIN_SYSTEM.md
    └── 11_MULTI_AGENT_SPEC.md   ← detailed V2 implementation spec
```

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Brain is LLM-based, not rule-based | Adapts to unexpected findings; handles novel situations |
| Shell Manager is a service, not an agent | Sessions persist independent of agent lifecycle |
| Only Brain writes MissionContext | Prevents race conditions; single source of truth |
| Safety pipeline runs on every tool call | No agent can bypass safety regardless of authority |
| Per-agent model selection | Balance cost vs capability |
| Plugin system for all new tools | Core stays stable; capabilities added without risk |
| Agents are stateless | Killed/restarted without data loss; all state in DB |
| Audit log attributes agent_id | Full accountability — know which agent did what |
| V2 permission flags default False | Blast radius controlled by operator explicitly |
| Max 8 parallel agents (default) | Balance parallelism with LLM API rate limits |
| V1 PentestAgent preserved | Backward compatibility; can run without multi-agent |
