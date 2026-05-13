# TIRPAN — Architecture

> *Autonomous Ethical Guardrailed Intelligence System*

# TIRPAN — Architecture (Updated May 2026)

This document reflects the codebase as implemented today.

---

## Execution Modes

**V1 (single agent, stable)**
- `PentestAgent` runs a ReAct loop: Reason → Act → Observe → Reflect.
- Available via web UI and `main.py run` (headless CLI).

**V2 (multi-agent, beta)**
- `BrainAgent` orchestrates specialized agents in parallel.
- Available in web UI/API via `mode=v2_auto`.

**V3 (placeholder)**
- API routes exist under `/api/v3`, but execution is not implemented.

---

## V1 Runtime Flow (Implemented)

```
DISCOVERY      nmap_scan (ping/service) → host list
PORT_SCAN      nmap_scan (service/full) → open ports
EXPLOIT_SEARCH searchsploit_search      → candidate exploits
EXPLOITATION   metasploit_run / helpers → session or failure
DONE           generate_report
```

---

## V2 Architecture (Implemented, beta)

```
Web UI / API
   │
   ▼
BrainAgent (BaseAgent)
   ├─ MissionContext (shared state, brain writes)
   ├─ AgentMessageBus (async pub/sub)
   ├─ Specialized agents (parallel)
   └─ ToolRegistry (core + extended tools)
```

**Specialized agents in code:**
- ScannerAgent
- ExploitAgent
- WebAppAgent
- OSINTAgent
- PostExploitAgent
- LateralMovementAgent
- ReportingAgent

**Shell access:**
- `shell_exec` (ShellSessionTool) supports bind/reverse/ssh sessions.
- `ShellManager` exists as a unifying service for multi-agent shell routing.

---

## Tool Registry

Tools are registered from two sources:
- **Core + extended tools:** `tools/` (auto-registered in `core/registry_builder.py`).
- **Plugins:** `plugins/` (loaded via `plugin.json` with `enabled: true`).

Tool availability is health-checked at session start and exposed at:
- `GET /api/v1/tools/status`

---

## MissionContext (V2)

`MissionContext` is the shared, brain-owned state model used by all agents. It includes:
- Targets, scope, mode, operator notes
- Hosts and ports (with service metadata)
- Vulnerabilities, sessions, credentials, loot
- Objectives and active agents
- Attack graph (nodes/edges)
- Permission flags (exploitation, post-exploit, lateral, persistence, exfil)

**Access rules:** all agents read; only Brain writes.

---

## AgentMessageBus (V2)

Actual message fields in code (see `core/message_bus.py`):

```python
AgentMessage(
  msg_type, sender_id, payload,
  recipient_id=None, msg_id=uuid,
  correlation_id=None, timestamp=time.time()
)
```

Common message types include:
- `FINDING`, `AGENT_DONE`, `AGENT_ERROR`, `PHASE_CHANGED`, `ASK_OPERATOR`

---

## Web + API Integration

Key endpoints:
- `POST /api/v1/sessions` (V1 + V2)
- `GET /api/v1/sessions/{id}` (status + findings)
- `GET /api/v1/sessions/{id}/agents` (V2 agents)
- `GET /api/v1/sessions/{id}/mission-context` (V2 state)
- `GET /api/v1/sessions/{id}/attack-graph` (V2 graph)

---

## Defense Module (Blue Team)

The defense stack is implemented under `defense/` and exposed via
`/api/v1/defense/*`. See [07_NETWORK_DEFENSE_MODULE.md](07_NETWORK_DEFENSE_MODULE.md).
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
TIRPAN/
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
