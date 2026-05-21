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

V2 (Implemented):
  Multi-agent architecture. Brain + 7 specialized agents.
  33 tools. Shell persistence. Post-exploitation depth.
  Parallel execution. OSINT. Web app testing. Lateral movement.
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

- Network-level attacks — 33 tools available (all categories)
- Single agent mode available; multi-agent mode also supported
- Shell sessions managed via ShellManager (persistent)
- Web app, OSINT, post-exploitation, lateral movement all available
- Plugin system ready but `plugins/` is empty (tools ship in `tools/`)
- Defense module, ML pipeline, React SPA, training data pipeline available

### V1 Tool List (33 tools registered)

| Category | Tools |
|---|---|
| recon | nmap, masscan, smb_enum, telnet_probe, ssh_exec |
| osint | theharvester, subfinder, whois, dns |
| web | whatweb, nikto, nuclei, ffuf, gobuster, arjun, sqlmap, wpscan, commix |
| exploit | searchsploit, metasploit, rsh, distcc, webdav |
| post-exploit | shell_exec, local_exec |
| lateral | crackmapexec, impacket |
| cracking | hydra, hashcat, john |
| reporting | generate_report, report_finding |
| other | ddos |

---

## V2 — Multi-Agent Architecture

**Status: 🔄 Mostly implemented — 6 phases substantially complete**

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

- [x] `BaseAgent` abstract class — shared LLM loop, event emission, message handling
- [x] `MissionContext` — shared mission state, read by all agents, written only by Brain
- [x] `AgentMessageBus` — async pub/sub for inter-agent communication
- [x] `BrainAgent` — spawn/wait/decide loop, LLM-based coordination
- [x] Migrate `PentestAgent` to `BaseAgent` (preserve V1 compatibility)
- [x] New DB tables: `agent_instances`, `agent_messages`, `mission_phases`
- [x] New API endpoints: agent management, mission context
- [x] New WebSocket events: `agent_spawned`, `agent_message`, `agent_done`

---

### Phase 2: Shell Manager

**Goal:** Never lose a shell — all post-exploitation through persistent sessions

- [x] `ShellManager` service class
- [x] Session registry: type, privilege level, health status, exploit info
- [x] Heartbeat monitoring (30s interval per session)
- [x] Auto-reconnect on session drop (re-exploit using stored info)
- [x] Session upgrade: shell → meterpreter
- [x] Pivot/tunnel registration (shell session tracking)
- [x] New DB table: `shell_sessions`
- [x] New API endpoints: shell listing, manual command execution
- [x] New WebSocket events: `shell_opened`, `shell_lost`, `shell_reconnected`

---

### Phase 3: Specialized Agents

**Goal:** Each agent is an expert — faster, deeper, more accurate

**3a — Scanner Agent** *(refactor from PentestAgent)*
- [x] masscan integration (fast wide scan)
- [x] nmap targeted scan on masscan results
- [x] NSE script execution
- [x] SMB/SNMP/LDAP enumeration tools
- [x] Banner grabbing

**3b — Exploit Agent** *(refactor from PentestAgent)*
- [x] CVE lookup integration
- [x] MSF `check` before full exploit
- [x] Alternative payload selection on failure
- [x] CTF flag detection (flag{...} regex)

**3c — OSINT Agent** *(new)*
- [x] theHarvester integration
- [x] subfinder integration
- [x] WHOIS lookup
- [x] DNS enumeration (A, MX, NS, TXT, zone transfer)
- [ ] Certificate transparency, Google/GitHub dork (planned)

**3d — Web Application Agent** *(new)*
- [x] whatweb technology fingerprinting
- [x] nikto integration
- [x] ffuf directory enumeration
- [x] nuclei template scanning
- [x] sqlmap integration
- [x] WordPress scanner (wpscan)
- [x] Command injection (commix), parameter discovery (arjun), DNS/VHost (gobuster)

**3e — Post-Exploitation Agent** *(new)*
- [x] Shell command execution via ShellManager
- [x] User/service/network enumeration
- [x] Privilege escalation: sudo, SUID, kernel, service, cron
- [x] Persistence: crontab, systemd, SSH key, registry (gated behind permission flag)
- [x] Credential harvesting: /etc/shadow, mimikatz, browser creds, SSH keys (gated behind permission flag)
- [x] New DB tables: `credentials`, `loot`

**3f — Lateral Movement Agent** *(new)*
- [x] Internal network scan via compromised host
- [x] Pass-the-hash, pass-the-ticket
- [x] PSExec, WinRM, SMB, WMI execution
- [x] CrackMapExec/NXC credential spray
- [x] Kerberoasting, ASREPRoasting, DCSync (via Impacket)
- [x] New DB tables: `network_nodes`, `network_edges`

**3g — Reporting Agent** *(refactor + enhance)*
- [x] Aggregate findings from MissionContext
- [x] HTML/markdown/JSON report formats
- [ ] Executive summary generation, attack narrative (basic implementation) 

---

### Phase 4: New Tools (33 tools registered)

All tools implemented as `BaseTool` subclasses in `tools/`.

**Priority 1 — Core new tools:** ✅ All implemented

| Tool | Type | Category | Status |
|---|---|---|---|
| `masscan` | BaseTool subclass | recon | ✅ |
| `nuclei` | BaseTool subclass | vuln-scan | ✅ |
| `ffuf` | BaseTool subclass | web | ✅ |
| `sqlmap` | BaseTool subclass | exploit | ✅ |
| `nikto` | BaseTool subclass | web | ✅ |
| `whatweb` | BaseTool subclass | web | ✅ |

**Priority 2 — OSINT tools:** ✅ All core tools implemented

| Tool | Type | Category | Status |
|---|---|---|---|
| `theharvester` | BaseTool subclass | osint | ✅ |
| `subfinder` | BaseTool subclass | osint | ✅ |
| `whois_lookup` | BaseTool subclass | osint | ✅ |
| `dns_lookup` | BaseTool subclass | osint | ✅ |
| `wpscan` | BaseTool subclass | web | ✅ |
| `gobuster` | BaseTool subclass | web | ✅ |
| `arjun` | BaseTool subclass | web | ✅ |
| `commix` | BaseTool subclass | web | ✅ |

**Priority 3 — Post-exploit / lateral tools:** ✅ All implemented

| Tool | Type | Category | Status |
|---|---|---|---|
| `crackmapexec` | BaseTool subclass | lateral | ✅ |
| `impacket` | BaseTool subclass | lateral | ✅ |
| `hydra` | BaseTool subclass | brute-force | ✅ |
| `hashcat` | BaseTool subclass | cracking | ✅ |
| `john` | BaseTool subclass | cracking | ✅ |
| `ssh_exec` | BaseTool subclass | post-exploit | ✅ |
| `shell_exec` | BaseTool subclass | post-exploit | ✅ |
| `smb_enum` | BaseTool subclass | recon | ✅ |
| `telnet_probe` | BaseTool subclass | recon | ✅ |
| `rsh_exec` | BaseTool subclass | exploit | ✅ |
| `distcc_exec` | BaseTool subclass | exploit | ✅ |
| `webdav_put` | BaseTool subclass | exploit | ✅ |

**Priority 4 — Optional paid API tools:** Not yet implemented

| Tool | Type | Requires |
|---|---|---|
| `shodan_search` | api_wrapper | SHODAN_API_KEY |
| `censys_search` | api_wrapper | CENSYS_API_KEY |

---

### Phase 5: Brain Intelligence

**Goal:** Brain makes smart decisions, not just sequential ones

- [x] Strategy planning prompt engineering (senior pentester persona + soul injection)
- [x] Adaptive failure handling: try differently → alternative vector → ask user
- [x] Parallel agent coordination (spawn_agents_batch + wait_for_agents)
- [x] "Critical finding" fast path: shell opened → immediately reprioritize
- [x] Environment type detection (production vs staging vs lab)
- [ ] Clarifying questions when mission parameters are ambiguous (partial — ask_operator exists)
- [ ] Real-time strategy adjustment based on mid-mission findings (basic implementation)
- [x] Training data capture for LoRA fine-tuning (captures Brain iterations as JSONL)
- [x] Soul-based knowledge injection (service-specific CVE knowledge base)

---

### Phase 6: UI Enhancements

**Goal:** Visibility into multi-agent operation

- [x] **Agent Orchestra Panel** — React SPA (`attack-graph-canvas/`) with per-agent cards and status
- [x] **Brain reasoning feed** — separate view for Brain's strategic decisions in React SPA
- [x] **Enhanced Attack Graph** — compromise levels, attack path visualization (Cytoscape.js)
- [x] **Credentials Panel** — table of all harvested creds in React SPA
- [x] **Loot Panel** — collected files and data with previews in React SPA
- [x] **Per-agent model selector** — configurable via `/config/ollama|openrouter|lmstudio|opencode-go`
- [x] **Agent status indicators** — real-time status for each spawned agent
- [ ] **Mission Context panel** — Brain's live view (partial — available via API, basic HTML view)
- [ ] **Static HTML multi-agent view** — original `index.html` still uses single-agent feed

---

## Timeline

```
2025 Q1–Q2    V1 Development                                  ✅ COMPLETE
              └── Core agent, 3 tools, safety, web UI, reports

2025 Q3–2026 Q1  V2 Foundation + Tools                        ✅ COMPLETE
              └── BaseAgent, MissionContext, MessageBus, Brain, DB migration
              └── ShellManager, 33 tools, 7 specialized agents
              └── Defense module core + ML pipeline

2026 Q1–Q2    V2 Phase 3–6 — Polish + Integration             🔄 IN PROGRESS
              └── Brain intelligence, UI enhancements, React SPA
              └── Training data pipeline, soul loader
              └── V2 testing and stabilization

2026 Q3–Q4    V2 Completion                                    📋 PLANNED
              └── Clarifying questions system
              └── Static HTML multi-agent view
              └── RAG knowledge base, squads
              └── Shodan/Censys API plugins
```

---

## V1 → V2 Bridge

```
V1 (Complete)              V2 (Mostly Done)
──────────────────         ─────────────────────────
Single ReAct Agent    →    Brain + 7 Specialized Agents
3 tools               →    33 tools
Sequential phases     →    Parallel agent execution
Network attacks only  →    + Web, OSINT, Post-exploit
Shells abandoned      →    + Shell Manager (persistent)
No lateral movement   →    + Full lateral + pivoting
No OSINT              →    + OSINT agent
Single LLM            →    Per-agent model selection
Basic report          →    Attack narrative + creds
Plugin system ready   →    33 tools implemented
No defense            →    + Full blue team module
No ML                 →    + XGBoost/scikit-learn
```
```
