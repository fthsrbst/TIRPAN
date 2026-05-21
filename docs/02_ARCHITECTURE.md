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

---

## V1 Runtime Flow (Implemented)

```
DISCOVERY      nmap_scan (ping/service) → host list
PORT_SCAN      nmap_scan (service/full) → open ports
SERVICE_PROBE  nmap_scan (NSE scripts), smb_enum, telnet_probe → service details
EXPLOIT_SEARCH searchsploit_search + knowledge_base.suggest → candidate exploits
EXPLOITATION   metasploit_run / ssh_exec / rsh / distcc / webdav → session or failure
POST_EXPLOIT   shell_exec (enumeration, privesc, credential harvest, persistence)
LATERAL        crackmapexec / impacket (from compromised host to new targets)
DONE           generate_report → HTML/PDF + findings
```

---

## V2 Architecture (Implemented, beta)

```
Web UI / API
   │
   ▼
BrainAgent (BaseAgent — 2400+ lines)
   ├─ Meta-tools: spawn_agent, spawn_agents_batch, wait_for_agents, kill_agent, update_context, ask_operator, set_phase, mission_done
   ├─ MissionContext (shared state — Brain writes, agents publish via MessageBus)
   ├─ AgentMessageBus (async pub/sub — 20 message types)
   ├─ ShellManager (persistent shell registry + heartbeat + auto-reconnect)
   ├─ ToolRegistry (33 core + extended tools)
   └─ 7 specialized agents (parallel under Brain coordination):
      ├─ ScannerAgent      — nmap + masscan
      ├─ ExploitAgent      — searchsploit + metasploit
      ├─ WebAppAgent       — whatweb → nikto → nuclei → ffuf → sqlmap/wpscan/commix/arjun
      ├─ OSINTAgent        — theHarvester + subfinder + whois + dns
      ├─ PostExploitAgent  — shell_exec (enumeration, privesc, persistence, cred harvest)
      ├─ LateralAgent      — crackmapexec + impacket
      └─ ReportingAgent    — generate final report from MissionContext
```

**Implementation status:** All components listed above are implemented and tested.
- BrainAgent: 2400+ lines with 8 meta-tools, parallel agent spawning, dedup guards, training data capture
- MissionContext: 653 lines with 13 dataclasses, thread-safe read/write via asyncio.Lock
- AgentMessageBus: 405 lines, 20 message types, async pub/sub with 1000-message history
- ShellManager: 365 lines, MSF RPC serialization via asyncio.Semaphore(1)
- All 7 specialized agents implemented with BaseSpecializedAgent mixin and MessageBus integration
- V2 tables in DB: agent_instances, agent_messages, shell_sessions, harvested_credentials, loot, mission_phases, network_nodes, network_edges

---

## Tool Registry

Tools are registered from two sources:
- **33 tools in `tools/`:** Auto-registered via `core/registry_builder.py`. All are BaseTool subclasses covering recon, OSINT, web, exploit, post-exploit, lateral, cracking, and reporting categories.
- **Plugins in `plugins/`:** Loaded via `plugin.json` with `enabled: true`. Supports Python class, CLI wrapper, and API wrapper types.

Tool availability is health-checked at session start and exposed at:
- `GET /api/v1/tools/status`
- Unavailable tools excluded from LLM prompt with install hints in UI

---

## MissionContext (V2)

`MissionContext` is the shared, brain-owned state model used by all agents. It includes:
- Targets, scope, mode, operator notes
- Hosts and ports (with service metadata)
- Vulnerabilities, sessions, credentials, loot
- Objectives and active agents
- Attack graph (nodes/edges)
- Permission flags (exploitation, post-exploit, lateral, persistence, exfil)

**Access rules:** all agents publish findings via MessageBus; Brain receives and integrates into MissionContext.

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

81 REST endpoints + WebSocket. Key endpoint groups:

**Sessions:**
- `POST /api/v1/sessions` — start pentest session (V1 or V2)
- `GET /api/v1/sessions/{id}` — session status + findings
- `POST /api/v1/sessions/{id}/kill` — kill switch per-session
- `POST /api/v1/sessions/{id}/pause` / `/resume` — pause/resume agent
- `POST /api/v1/sessions/{id}/inject` — inject operator message
- `POST /api/v1/sessions/{id}/rollback/{iteration}` — rollback to iteration

**V2 Agents:**
- `GET /api/v1/sessions/{id}/agents` — list agent instances
- `GET /api/v1/sessions/{id}/agents/active` — active agents only

**V2 State:**
- `GET /api/v1/sessions/{id}/mission-context` — MissionContext snapshot
- `GET /api/v1/sessions/{id}/attack-graph` — attack graph data
- `GET /api/v1/sessions/{id}/credentials/harvested` — harvested credentials
- `GET /api/v1/sessions/{id}/loot` — loot items
- `GET /api/v1/sessions/{id}/shells` — active shells

**Tools:**
- `GET /api/v1/tools/status` — tool health check

**Config:**
- `GET/POST /config/ollama`, `/config/lmstudio`, `/config/openrouter`, `/config/opencode-go` — LLM configs
- `GET/POST /config/safety`, `/config/msf` — safety and Metasploit configs

**Reports:**
- `GET /api/v1/sessions/{id}/report/html` — HTML report
- `GET /api/v1/sessions/{id}/report/pdf` — PDF report

**ML:**
- `GET /api/v1/sessions/{id}/ml-suggestions` — ML-generated suggestions
- `POST /api/v1/ml/train` — trigger ML training
- `GET /api/v1/ml/status`, `/ml/metrics` — model status and metrics

**Training Data:**
- `GET /config/training`, `POST /config/training` — training config
- `GET /api/v1/sessions/{id}/training` — training data for session
- `GET /api/v1/training/stats` — training data stats

**Defense:**
- `POST /api/v1/defense/start` — start monitoring
- `POST /api/v1/defense/stop` — stop monitoring
- `GET /api/v1/defense/status` — active threats, blocklist
- `GET /api/v1/defense/threats` — threat events

**WebSocket:** `/ws` endpoint for real-time agent event streaming (reasoning, tool_call, tool_result, phase_change, finding, agent_spawned, shell_opened, etc.)

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
| OpenRouter | Cloud | Claude, GPT-4, Llama, Mixtral, Gemini |
| OpenCode Go | Cloud | DeepSeek R1, DeepSeek V3, and others |

All providers runtime-switchable. Each agent independently configurable via `--provider` flag or `/config/openrouter` / `/config/lmstudio` / `/config/opencode-go` API endpoints.

---

## Directory Structure (Actual — May 2026)

```
TIRPAN/
├── main.py                         # Entry point: web server (default) + headless CLI (run subcommand)
├── config.py                       # AppConfig, SafetyConfig, LLMConfig, MetasploitConfig, SpeedProfiles
├── manage.py                       # Admin user management CLI
├── seed_demo.py                    # Seeds demo user accounts
├── pyproject.toml                  # Build config, pytest, coverage, black, ruff
├── requirements.txt                # Python dependencies (56 packages)
├── .env.example                    # Environment variable template
│
├── core/                           # *** Agent framework (32+ files) ***
│   ├── __init__.py
│   ├── agent.py                    # [V1] PentestAgent ReAct loop (stable, 72KB)
│   ├── base_agent.py               # [V2] BaseAgent abstract class (1053 lines)
│   ├── brain_agent.py              # [V2] BrainAgent coordinator (2400+ lines)
│   ├── chat_agent.py               # Chat LLM interface (separate conversation mode)
│   ├── soul_loader.py              # Loads "souls" (prompt/inject personality for Brain/reporting)
│   ├── mission_context.py          # [V2] Shared mission state (HostInfo, VulnInfo, SessionInfo, etc.)
│   ├── message_bus.py              # [V2] Async pub/sub inter-agent messaging (AgentMessageBus, 405 lines)
│   ├── shell_manager.py            # [V2] Persistent shell session registry + heartbeat + reconnect
│   ├── safety.py                   # 10-rule safety pipeline + V2 permission flags + kill switch
│   ├── memory.py                   # Bounded sliding window conversation memory with pinning
│   ├── prompts.py                  # PromptBuilders for every agent type + few-shot examples
│   ├── llm_client.py               # LLMRouter: OpenRouter, Ollama, LM Studio, OpenCode Go
│   ├── llm_parser.py               # LLM JSON response parsing (handles ```json blocks, repair)
│   ├── tool_registry.py            # Plugin loader + tool catalog + health check system
│   ├── registry_builder.py         # Bootstraps tool registry from tools/ + plugins/
│   ├── generic_tools.py            # GenericCLITool + GenericAPITool for cli_wrapper/api_wrapper plugins
│   ├── targeting.py                # Auto-discovery of local private subnets
│   ├── platform_utils.py           # Cross-platform utilities (Kali/Parrot/Ubuntu/Arch detection)
│   ├── playbook.py                 # Playbook system for recording successful exploit patterns
│   ├── pty_manager.py              # PTY (pseudo-terminal) management for interactive shells
│   ├── session_tracer.py           # Session-level tracing/debugging
│   ├── session_orchestration.py    # Multi-session coordination logic
│   ├── session_data_recovery.py    # Recovery of session data after crashes
│   ├── debug_logger.py             # Debug logging utilities
│   ├── secure_store.py             # OS keychain / encrypted secret storage
│   ├── finding_classifier.py       # ML-based finding classifier
│   ├── agent_model_config.py       # Per-agent LLM model configuration
│   ├── artifact_store.py           # Artifact storage for agent outputs
│   ├── training_data.py            # Collects training data (JSONL) for LoRA fine-tuning
│   ├── agents/                     # [V2] Specialized agent implementations
│   │   ├── __init__.py
│   │   ├── base_specialized.py     # Abstract mixin for all specialized agents
│   │   ├── scanner_agent.py        # Network discovery via nmap + masscan
│   │   ├── exploit_agent.py        # Exploitation via searchsploit + metasploit
│   │   ├── webapp_agent.py         # Web app scanning chain (whatweb→nikto→nuclei→ffuf→sqlmap)
│   │   ├── osint_agent.py          # OSINT gathering (theHarvester, subfinder, whois, dns)
│   │   ├── postexploit_agent.py    # Post-exploitation via shell_exec
│   │   ├── lateral_agent.py        # Lateral movement via crackmapexec + impacket
│   │   └── reporting_agent.py      # Final report generation from MissionContext
│   ├── squads/                     # [V3] Squad compositions (unimplemented)
│   └── rag/                        # [V3] RAG knowledge base (unimplemented)
│
├── tools/                          # *** 33 security tools ***
│   ├── base_tool.py                # BaseTool abstract class + ToolMetadata + ToolHealthStatus
│   ├── nmap_tool.py                # Nmap scanning (ping, service, OS, NSE scripts)
│   ├── masscan_tool.py             # Masscan fast port scanning
│   ├── searchsploit_tool.py        # ExploitDB/SearchSploit queries
│   ├── metasploit_tool.py          # Metasploit RPC (search, run, sessions, post-commands)
│   ├── ssh_tool.py                 # SSH authenticated scanning + auditing (paramiko)
│   ├── shell_session_tool.py       # Shell session management (bind/reverse/ssh shells)
│   ├── local_exec_tool.py          # Local command execution on TIRPAN host
│   ├── rsh_tool.py                 # RSH/rlogin/rexec exploitation (legacy Unix)
│   ├── distcc_tool.py              # Distcc distributed compiler exploitation
│   ├── telnet_tool.py              # Telnet probing + authentication
│   ├── webdav_tool.py              # WebDAV PUT exploitation
│   ├── smb_enum_tool.py            # SMB null session enumeration
│   ├── whatweb_tool.py             # WhatWeb web technology fingerprinting
│   ├── nikto_tool.py               # Nikto web server scanner
│   ├── nuclei_tool.py              # Nuclei CVE/misconfig template scanner
│   ├── ffuf_tool.py                # Ffuf web fuzzer (directory/file/vhost)
│   ├── gobuster_tool.py            # Gobuster DNS and VHost enumeration
│   ├── arjun_tool.py               # Arjun HTTP parameter discovery
│   ├── sqlmap_tool.py              # SQLMap SQL injection detection + exploitation
│   ├── commix_tool.py              # Commix OS command injection
│   ├── wpscan_tool.py              # WPScan WordPress vulnerability scanner
│   ├── hydra_tool.py               # Hydra online brute force
│   ├── hashcat_tool.py             # Hashcat offline password cracking
│   ├── john_tool.py                # John the Ripper offline cracking
│   ├── crackmapexec_tool.py        # CrackMapExec/NXC lateral movement (SMB, SSH, WinRM)
│   ├── impacket_tool.py            # Impacket (psexec, secretsdump, kerberoast, etc.)
│   ├── theharvester_tool.py        # theHarvester email/domain OSINT
│   ├── subfinder_tool.py           # Subfinder subdomain enumeration
│   ├── whois_tool.py               # WHOIS domain lookup
│   ├── dns_tool.py                 # DNS enumeration + zone transfers
│   ├── ddos_tool.py                # DDoS testing utilities (gated)
│   ├── generate_report_tool.py     # Report generation tool invocation
│   └── report_finding_tool.py      # Structured finding reporting
│
├── models/                         # Pydantic data models
│   ├── session.py                  # Session model (target, mode, status, timestamps)
│   ├── target.py                   # Target model (IP, port_range, excluded ports)
│   ├── scan_result.py              # Host, Port, ScanResult models
│   ├── vulnerability.py            # Vulnerability model (CVSS, CVE, service)
│   ├── exploit_result.py           # ExploitResult model (success, output, session)
│   └── mission.py                  # MissionBrief model (scope, objectives, creds, permission flags)
│
├── database/                       # SQLite database layer
│   ├── db.py                       # Async DB connection (aiosqlite) + migration system (v1-v9)
│   ├── repositories.py             # Repository classes for all tables (CRUD operations)
│   ├── knowledge_base.py           # Successful exploit pattern memory (upsert + suggest)
│   ├── schema.sql                  # DDL schema: 16 tables + indexes
│   └── sqlite_conn.py              # Connection pooling/management
│
├── web/                            # FastAPI web application
│   ├── app.py                      # FastAPI app factory + CORS + static file serving
│   ├── routes.py                   # REST endpoints (81 endpoints: sessions, config, agents, shells, etc.)
│   ├── v3_routes.py                # V3 API endpoint placeholders (empty)
│   ├── defense_routes.py           # Defense module API endpoints
│   ├── ddos_routes.py              # DDoS tool API endpoints
│   ├── websocket_handler.py        # WebSocket handler for real-time event streaming
│   ├── session_manager.py          # Multi-session task/guard/agent/registry management
│   ├── app_state.py                # Shared singleton ToolRegistry (avoids circular imports)
│   ├── stats_state.py              # Dashboard statistics aggregation
│   ├── auth/                       # JWT authentication
│   │   ├── models.py               # User, Organization, JWT token models
│   │   ├── service.py              # Password hashing, token creation/verification
│   │   ├── router.py               # Login/logout/register/settings endpoints
│   │   └── dependencies.py         # FastAPI dependency injection for auth
│   └── static/                     # Frontend assets
│       ├── index.html              # Main web UI (4487-line SPA)
│       ├── app.js                  # JavaScript client: Fetch API + WebSocket + DOM
│       ├── style.css               # Custom CSS: dark/light mode, terminal aesthetic
│       ├── defense.js              # Defense module UI logic
│       ├── ddos.js                 # DDoS tool UI logic
│       └── logo.png                # TIRPAN logo
│
├── reporting/                      # Report generation
│   ├── report_generator.py         # HTML + PDF report generation (Jinja2 + WeasyPrint)
│   ├── cvss.py                     # CVSS v3.1 score calculator
│   └── templates/
│       └── report.html             # Jinja2 HTML report template
│
├── defense/                        # Network Defense (Blue Team) module
│   ├── __init__.py                 # Module docs
│   ├── monitor.py                  # NetworkMonitor: ScapySniffer + AuthLogPoller (438 lines)
│   ├── detector.py                 # DetectorEngine: 6 rule-based detectors (511 lines)
│   ├── defense_agent.py            # DefenseAgent: ReAct loop with LLM analysis (653 lines)
│   ├── defense_session.py          # Defense session management
│   ├── attacker_profiler.py        # Attacker profiling + MITRE ATT&CK TTP mapping
│   ├── predictor.py                # KillChainPredictor: ML/rule-based attack chain prediction
│   ├── prompts.py                  # Blue team system prompts (423 lines)
│   └── tools/                      # 11 defense response tools (alert, block, canary, deception, etc.)
│
├── ml/                             # Machine Learning
│   ├── train_all.py                # Training orchestrator for all ML models
│   ├── exploit_predictor.py        # Exploit success prediction
│   ├── finding_classifier.py       # Pentest finding classification
│   ├── attack_path.py              # Attack path suggestion model
│   ├── datasets.py                 # Dataset creation and loading
│   ├── evaluate.py                 # Model evaluation utilities
│   ├── smoke_test.py               # Model smoke testing
│   ├── models/                     # Serialized trained models (.pkl files)
│   └── data/                       # ML training data (CVE JSONs, EPSS, MITRE ATT&CK)
│
├── souls/                          # Agent "souls" — prompt personalities
│   ├── __init__.py
│   ├── _embedded.py                # Embedded soul data (auto-generated)
│   ├── BRAIN_SOUL.md               # Brain Agent persona + methodology (266 lines)
│   ├── HACKER_MINDSET.md           # Penetration tester mindset + service taxonomy
│   └── EXPLOIT_KB.md               # Comprehensive exploit knowledge base (751 lines)
│
├── plugins/                        # Custom tool plugins (package init only — plugins go in subdirs)
│   └── __init__.py
│
├── attack-graph-canvas/            # React/TypeScript attack graph visualization
│   ├── package.json                # Vite + React + Cytoscape.js + Tailwind
│   ├── src/                        # React components, hooks, pages (50+ files)
│   └── public/                     # Static assets
│
├── tests/                          # pytest test suite (681 tests, 22 files)
│   ├── conftest.py                 # Shared fixtures
│   ├── test_agent.py               # V1 ReAct loop tests
│   ├── test_base_agent.py          # BaseAgent abstract class tests
│   ├── test_brain_agent.py         # BrainAgent orchestration tests
│   ├── test_database.py            # Database CRUD + migration tests
│   ├── test_edge_cases.py          # Edge case tests
│   ├── test_llm_client.py          # LLM client mock tests
│   ├── test_memory.py              # SessionMemory tests
│   ├── test_message_bus.py         # AgentMessageBus tests
│   ├── test_metasploit_tool.py     # Metasploit mock tests
│   ├── test_mission_context.py     # MissionContext state management tests
│   ├── test_models.py              # Pydantic model validation tests
│   ├── test_nmap_tool.py           # Nmap mock tests
│   ├── test_prompts.py             # Prompt formatting tests
│   ├── test_reporting.py           # Report generation tests
│   ├── test_safety.py              # Safety guardrail tests
│   ├── test_searchsploit_tool.py   # SearchSploit mock tests
│   ├── test_session_data_recovery.py # Session recovery tests
│   ├── test_shell_manager.py       # ShellManager lifecycle tests
│   ├── test_specialized_agents.py  # Specialized agent tests
│   ├── test_tool_registry.py       # Tool registry tests
│   ├── test_v2_tools.py            # V2 tool implementation tests
│   └── test_web_routes.py          # FastAPI integration tests
│
├── docs/                           # Documentation (16 files)
├── data/                           # Runtime data (gitignored)
├── reports/                        # Generated pentest reports (gitignored)
├── README.md                       # English documentation
├── README.tr.md                    # Turkish documentation
├── DESIGN.md                       # Design system specification
├── LICENSE                         # AEGIS Non-Commercial License
├── .gitignore
├── gif.gif
└── logo.png
```

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Brain is LLM-based, not rule-based | Adapts to unexpected findings; handles novel situations |
| Shell Manager is a service, not an agent | Sessions persist independent of agent lifecycle |
| Agents publish via MessageBus; Brain integrates | Prevents race conditions; Brain validates before updating context |
| Safety pipeline runs on every tool call | No agent can bypass safety regardless of authority |
| Per-agent model selection | Balance cost vs capability |
| Plugin system for all new tools | Core stays stable; capabilities added without risk |
| Agents are stateless | Killed/restarted without data loss; all state in DB |
| Audit log attributes agent_id | Full accountability — know which agent did what |
| V2 permission flags default False | Blast radius controlled by operator explicitly |
| Max 8 parallel agents (default) | Balance parallelism with LLM API rate limits |
| V1 PentestAgent preserved | Backward compatibility; can run without multi-agent |
| Meta-tools are Brain-internal, not in ToolRegistry | Coordination is separate from pentest tools |
| Metasploit RPC serialized via asyncio.Semaphore(1) | Prevents concurrent RPC conflicts |
| All 33 tools in `tools/`, plugins in `plugins/` | Core tools ship with TIRPAN; plugins are user-created |

---

## Defense Module (Blue Team)

The defense stack is implemented under `defense/` (18 .py files) and exposed via
`/api/v1/defense/*`. Key components:

- **NetworkMonitor** (438 lines): Local Scapy async sniffer + SSH remote polling of auth.log + ARP watching
- **DetectorEngine** (511 lines): 6 rule-based detectors (port scan, brute force, ARP spoof, DoS, lateral movement, data exfil)
- **DefenseAgent** (653 lines): ReAct loop receiving alerts, profiling attackers, managing deception, predicting next moves
- **AttackerProfiler** (315 lines): Behavioral profiles per hostile IP with MITRE ATT&CK TTP mapping
- **KillChainPredictor** (194 lines): Pre-emptive hardening recommendations, confidence-gated auto-actions
- **11 response tools**: alert, block, canary, deception, harden, honeypot, log analysis, network survey, pcap, SSH remote, update profile

See [07_NETWORK_DEFENSE_MODULE.md](07_NETWORK_DEFENSE_MODULE.md) for full architecture.

---

## ML Pipeline

The `ml/` module provides lightweight ML models using scikit-learn and XGBoost:

- **Exploit predictor:** Predicts exploitation success probability from service/version/CVE data
- **Finding classifier:** Classifies pentest findings by severity and type
- **Attack path model:** Suggests next attack paths based on current compromise state
- **Training:** `ml/train_all.py` orchestrates training using CVE datasets (CISA KEV, NVD JSONs, EPSS scores)
- **Models serialized:** Trained models stored as `.pkl` files in `ml/models/`

---

## Agent Souls

Three "soul" files in `souls/` provide prompt personality injections loaded by `core/soul_loader.py`:

- **BRAIN_SOUL.md** (266 lines): Senior pentester methodology, authorization boundaries, strategy
- **HACKER_MINDSET.md** (267 lines): Service taxonomy, attack chains, methodology per service type
- **EXPLOIT_KB.md** (751 lines): Comprehensive CVE knowledge base organized by service/version

The soul loader maps discovered services to KB sections and injects relevant knowledge into agent system prompts.

---

## Training Data Collection

`core/training_data.py` captures Brain agent iterations in LoRA fine-tuning format:
- Output: `data/training/{session_id}.jsonl` (Qwen3 ChatML format)
- Records: system→user→assistant message chains with labels (positive/negative)
- Focus on high-signal meta-tools: spawn_agent, update_context, set_phase, mission_done

---

## Attack Graph Canvas

A separate React/TypeScript SPA at `attack-graph-canvas/` provides rich visualization:
- **Stack:** Vite + React 18 + TypeScript + Cytoscape.js + Tailwind CSS + shadcn/ui
- **16 routes:** Overview, Missions, Attack Graph, Agents, Hosts, Findings, Credentials, Reports, Terminal, Settings, etc.
- **xterm.js** terminal emulation for interactive shells
- **Recharts** for analytics and statistics dashboards
- Build output deploys to `web/static/normal/`
