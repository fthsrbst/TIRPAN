# TIRPAN — Version Roadmap

## Vision

Open-source autonomous AI red team. A **Brain Agent** coordinates specialized sub-agents
to work exactly like a professional penetration tester — thinking strategically, acting in
parallel, persisting access, and adapting when things don't go as planned.

---

## Version Philosophy

```
V1 (Complete):
  Network-level attacks. Single ReAct agent.
  3 tools, plugin system ready, solid foundation.
  Fully working web UI, real-time streaming, reports.

V2 (In Development):
  Multi-agent architecture. Brain + 8 specialized agents.
  50+ tools. Shell persistence. Post-exploitation depth.
  Parallel execution. OSINT. Web app testing. Lateral movement.

V3 (Future):
  Docker-isolated tool execution.
  Source code analysis, zero-day discovery.
  LLM-generated custom exploits.
  Bug bounty integration, CI/CD pipelines.
```

---

## V1 — Complete

**Status: ✅ Done**

### What's Built

- Single `PentestAgent` with ReAct loop (Reason → Act → Observe → Reflect)
- 3 core tools: `nmap_scan`, `searchsploit_search`, `metasploit_run`
- Plugin system (ToolRegistry with importlib loading)
- OpenRouter (Claude) + Ollama + LM Studio LLM support
- Full Auto / Ask Before Exploit / Scan Only modes
- 10 configurable safety guardrails + kill switch
- Pause / Resume / Operator message injection
- Full audit logging (append-only)
- SQLite database with repositories
- Session memory (bounded sliding window, pinned findings)
- Knowledge base (successful exploit tracking)
- Web UI with real-time WebSocket streaming
- HTML + PDF report generation with CVSS scoring
- IP, CIDR, and domain targeting
- Multiple concurrent pentest sessions
- Attack graph visualization
- Chat UI (separate LLM conversation interface)

### V1 Scope Boundaries

- Network-level attacks only — no web app scanning
- Single agent — no parallel execution
- Shells opened but not maintained (no Shell Manager)
- No OSINT, no post-exploitation depth, no lateral movement
- Plugin system ready but `/plugins/` is empty in V1

### V1 Tool List

| Tool | File | Category |
|---|---|---|
| `nmap_scan` | `tools/nmap_tool.py` | recon |
| `searchsploit_search` | `tools/searchsploit_tool.py` | exploit-search |
| `metasploit_run` | `tools/metasploit_tool.py` | exploit-exec |

---

## V2 — Multi-Agent Architecture

**Status: 🔨 Design complete, implementation starting**

### Core Architecture Change

Replace single `PentestAgent` with hierarchical multi-agent system:

```
Brain Agent (LLM coordinator)
    ├── OSINT Agent
    ├── Scanner Agent
    ├── Web Application Agent
    ├── Exploit Agent
    ├── Post-Exploitation Agent
    ├── Lateral Movement Agent
    └── Reporting Agent

Shell Manager (persistent session service — not an LLM agent)
```

Full spec: [11_MULTI_AGENT_SPEC.md](11_MULTI_AGENT_SPEC.md)

---

### Phase 1: Foundation

**Goal:** Core infrastructure for multi-agent coordination

- [ ] `BaseAgent` abstract class — shared LLM loop, event emission, message handling
- [ ] `MissionContext` — shared mission state, read by all agents, written only by Brain
- [ ] `AgentMessageBus` — async pub/sub for inter-agent communication
- [ ] `BrainAgent` — spawn/wait/decide loop, LLM-based coordination
- [ ] Migrate `PentestAgent` to `BaseAgent` (preserve V1 compatibility)
- [ ] New DB tables: `agent_instances`, `agent_messages`, `mission_phases`
- [ ] New API endpoints: agent management, mission context
- [ ] New WebSocket events: `agent_spawned`, `agent_message`, `agent_done`

---

### Phase 2: Shell Manager

**Goal:** Never lose a shell — all post-exploitation through persistent sessions

- [ ] `ShellManager` service class
- [ ] Session registry: type, privilege level, health status, exploit info
- [ ] Heartbeat monitoring (30s interval per session)
- [ ] Auto-reconnect on session drop (re-exploit using stored info)
- [ ] Session upgrade: shell → meterpreter
- [ ] Pivot/tunnel registration (ligolo-ng, chisel)
- [ ] New DB table: `shell_sessions`
- [ ] New API endpoints: shell listing, manual command execution
- [ ] New WebSocket events: `shell_opened`, `shell_lost`, `shell_reconnected`

---

### Phase 3: Specialized Agents

**Goal:** Each agent is an expert — faster, deeper, more accurate

**3a — Scanner Agent** *(refactor from PentestAgent)*
- [ ] masscan integration (fast wide scan)
- [ ] nmap targeted scan on masscan results
- [ ] NSE script execution
- [ ] SMB/SNMP/LDAP enumeration tools
- [ ] Banner grabbing

**3b — Exploit Agent** *(refactor from PentestAgent)*
- [ ] CVE lookup integration
- [ ] MSF `check` before full exploit
- [ ] Alternative payload selection on failure
- [ ] Manual exploit execution

**3c — OSINT Agent** *(new)*
- [ ] theHarvester integration
- [ ] subfinder / amass integration
- [ ] WHOIS lookup
- [ ] DNS enumeration (A, MX, NS, TXT, zone transfer)
- [ ] Certificate transparency
- [ ] Google dork list
- [ ] GitHub dork

**3d — Web Application Agent** *(new)*
- [ ] whatweb technology fingerprinting
- [ ] nikto integration
- [ ] ffuf / dirsearch directory enumeration
- [ ] nuclei template scanning
- [ ] sqlmap integration
- [ ] XSS/SSRF/LFI detection
- [ ] WordPress/Joomla-specific scanners
- [ ] Authenticated testing support

**3e — Post-Exploitation Agent** *(new)*
- [ ] LinPEAS / WinPEAS upload and execution via Shell Manager
- [ ] User/service/network enumeration
- [ ] Privilege escalation: sudo, SUID, kernel, service, cron, DLL hijack
- [ ] Persistence: crontab, systemd, SSH key, registry, backdoor user
- [ ] Credential harvesting: /etc/shadow, mimikatz, browser creds, SSH keys
- [ ] New DB tables: `credentials`, `loot`

**3f — Lateral Movement Agent** *(new)*
- [ ] Internal network scan via compromised host
- [ ] Pass-the-hash, pass-the-ticket
- [ ] PSExec, WinRM, SMB, WMI execution
- [ ] CrackMapExec credential spray
- [ ] ligolo-ng / chisel pivot setup
- [ ] Kerberoasting, ASREPRoasting, DCSync
- [ ] New DB tables: `network_nodes`, `network_edges`

**3g — Reporting Agent** *(refactor + enhance)*
- [ ] Aggregate findings from all agent types
- [ ] Executive summary generation
- [ ] Attack narrative (story of engagement)
- [ ] Full remediation recommendations
- [ ] Credentials and loot summary section

---

### Phase 4: New Tools (50+ total)

All tools implemented as `BaseTool` subclasses or plugin configs.

**Priority 1 — Core new tools:**

| Tool | Type | Category |
|---|---|---|
| `masscan` | cli_wrapper | recon |
| `nuclei` | cli_wrapper | vuln-scan |
| `ffuf` | cli_wrapper | web |
| `sqlmap` | cli_wrapper | exploit |
| `nikto` | cli_wrapper | web |
| `whatweb` | cli_wrapper | web |
| `linpeas` | python_class | post-exploit |
| `winpeas` | python_class | post-exploit |

**Priority 2 — OSINT tools:**

| Tool | Type | Category |
|---|---|---|
| `theharvester` | cli_wrapper | osint |
| `subfinder` | cli_wrapper | osint |
| `amass` | cli_wrapper | osint |
| `whois_lookup` | python_class | osint |
| `dns_lookup` | python_class | osint |
| `wpscan` | cli_wrapper | web |

**Priority 3 — Post-exploit / lateral tools:**

| Tool | Type | Category |
|---|---|---|
| `crackmapexec` | cli_wrapper | lateral |
| `impacket` | python_class | lateral |
| `hydra` | cli_wrapper | brute-force |
| `hashcat` | cli_wrapper | cracking |
| `ligolo` | python_class | pivot |
| `chisel` | cli_wrapper | pivot |

**Priority 4 — Optional paid API tools:**

| Tool | Type | Requires |
|---|---|---|
| `shodan_search` | api_wrapper | SHODAN_API_KEY |
| `censys_search` | api_wrapper | CENSYS_API_KEY |

---

### Phase 5: Brain Intelligence

**Goal:** Brain makes smart decisions, not just sequential ones

- [ ] Strategy planning prompt engineering (senior pentester persona)
- [ ] Adaptive failure handling: try differently → alternative vector → ask user
- [ ] Parallel agent coordination (dependency graph execution)
- [ ] Environment type detection (production vs staging vs lab)
- [ ] Clarifying questions when mission parameters are ambiguous
- [ ] Real-time strategy adjustment based on mid-mission findings
- [ ] "Critical finding" fast path: shell opened → immediately reprioritize

---

### Phase 6: UI Enhancements

**Goal:** Visibility into multi-agent operation

- [ ] **Agent Orchestra Panel** — replace single feed with per-agent cards
- [ ] **Brain reasoning feed** — separate view for Brain's strategic decisions
- [ ] **Enhanced Attack Graph** — compromise levels, attack path visualization
- [ ] **Credentials Panel** — table of all harvested creds, copyable
- [ ] **Loot Panel** — collected files and data, previews
- [ ] **Per-agent model selector** — dropdown per agent type in config panel
- [ ] **Agent status indicators** — real-time status for each spawned agent
- [ ] **Mission Context panel** — Brain's live view of the engagement

---

## V3 — Future

**Goal:** Production-grade, isolated, at scale

- [ ] Docker-isolated tool execution (each agent in its own container)
- [ ] Multi-target parallel execution (thousands simultaneously)
- [ ] Internal Reviewer agent — dedicated LLM validation of every finding
- [ ] Source code analysis — Semgrep + LLM white-box testing
- [ ] Zero-day discovery — LLM reasoning over unusual behavior patterns
- [ ] `custom_payload` — LLM generates targeted Python exploits on the fly
- [ ] CI/CD integration — GitHub Actions, GitLab CI pipeline step
- [ ] Bug bounty output — HackerOne-compatible JSON
- [ ] Continuous monitoring — scheduled recurring tests
- [ ] Cloud environments — AWS, Azure, GCP asset discovery
- [ ] Cross-campaign learning — RAG knowledge base fed by all sessions
- [ ] Plugin marketplace — community-contributed tools

---

## Timeline

```
2025 Q1–Q2    V1 Development                                  ✅ COMPLETE
              └── Core agent, 3 tools, safety, web UI, reports

2026 Q1       V2 Phase 1 — Foundation                         🔨 STARTING
              └── BaseAgent, MissionContext, MessageBus, Brain, DB

2026 Q2       V2 Phase 2 — Shell Manager
              └── Persistent sessions, health monitoring, reconnect

2026 Q2–Q3   V2 Phase 3 — Specialized Agents
              └── All 7 agents implemented and wired to Brain

2026 Q3       V2 Phase 4 — New Tools
              └── 50+ tools across all categories

2026 Q4       V2 Phase 5 — Brain Intelligence
              └── Adaptive strategy, parallel coordination

2026 Q4       V2 Phase 6 — UI
              └── Agent orchestra panel, attack graph, creds/loot panels

2027+         V3 Development
              └── Docker isolation, scale, CI/CD, zero-day, marketplace
```

---

## V1 → V2 → V3 Bridge

```
V1 (Complete)              V2 (Building)                    V3 (Future)
──────────────────         ─────────────────────────        ──────────────────────────
Single ReAct Agent    →    Brain + 8 Specialized Agents →   + Internal Reviewer Agent
3 tools               →    50+ tools                    →   + Custom LLM exploit gen
Sequential phases     →    Parallel agent execution     →   + Thousands simultaneous
Network attacks only  →    + Web, OSINT, Post-exploit   →   + Source code analysis
Shells abandoned      →    + Shell Manager (persistent) →   + Docker isolation
No lateral movement   →    + Full lateral + pivoting    →   + Cloud environments
No OSINT              →    + OSINT agent                →   + Zero-day discovery
Single LLM            →    Per-agent model selection    →   + Cross-campaign RAG
Basic report          →    Attack narrative + creds     →   + Bug bounty output
Plugin system ready   →    50+ plugins implemented      →   + Plugin marketplace
```
