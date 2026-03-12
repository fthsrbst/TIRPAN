# AEGIS — Version Roadmap v2

## Vision

Open-source autonomous AI pentester. **Small core, big plugins.**
Start with network-level attacks, expand to every attack type through the plugin system.

---

## Version Philosophy

```
V1 (Capstone):
  Network-level attacks only.
  3 tools, 1 agent, solid foundation.
  Plugin system ready but no plugins.

V2 (Community Growth):
  Web recon, post-exploitation, lateral movement.
  Full plugin ecosystem (cli_wrapper, api_wrapper).
  Self-correction, RAG knowledge base, SARIF reports.
  Single agent — smarter, faster, more capable.

V3 (XBOW Level):
  Multi-agent coordinator + solvers.
  Docker-isolated tool execution.
  Source code analysis, zero-day discovery.
  LLM-generated custom exploits.
```

---

## V1 — Capstone Release

**Goal:** A fully working, plugin-extensible autonomous pentest bot with 3 tools.

### Core Features

- [x] ReAct agent loop (Reason → Act → Observe → Reflect)
- [x] **ToolRegistry** — plugin loader infrastructure (core tools built-in)
- [x] Nmap port & service scanning
- [x] SearchSploit exploit search
- [x] Metasploit RPC exploit execution
- [x] OpenRouter (Claude) + Ollama + LM Studio LLM support
- [x] Full Auto + Ask Before Exploit modes
- [x] 10 safety guardrails + kill switch
- [x] Full audit logging
- [x] SQLite database + knowledge base
- [x] Session memory (sliding window, pinned findings)
- [x] Web UI — real-time streaming (WebSocket)
- [x] PDF/HTML report + CVSS scoring
- [x] IP and CIDR targeting

### V1 Scope Boundaries (Intentional)

- **Network-level attacks only** — no web app scanning
- **Single agent** — no parallel execution
- **Runs on host** — no Docker isolation
- **Plugin system ready** but `/plugins/` directory is **empty**
- ShellTool **absent** (security risk)

### V1 Tools

| Tool                  | File                         | Category       |
| --------------------- | ---------------------------- | -------------- |
| `nmap_scan`           | `tools/nmap_tool.py`         | recon          |
| `searchsploit_search` | `tools/searchsploit_tool.py` | exploit-search |
| `metasploit_run`      | `tools/metasploit_tool.py`   | exploit-exec   |

---

## V2 — Post-Capstone: Intelligent Reconnaissance & Full Attack Lifecycle

**Goal:** Transform AEGIS from a network-level scanner into a complete autonomous penetration testing platform covering web recon, post-exploitation, lateral movement, a robust proof collection system, and a greatly expanded plugin ecosystem.

Full technical specification: [11_V2_FEATURE_SPEC.md](11_V2_FEATURE_SPEC.md)

---

### Core Infrastructure

- [ ] **Tool Health Check System** — Every tool reports availability before the session starts; unavailable tools are excluded from the LLM prompt with install hints surfaced in the UI. (`BaseTool.health_check()` + `GET /api/v1/tools/status`)
- [ ] **Speed Profiles** — `stealth` / `normal` / `aggressive` profiles that propagate timing flags to every tool (nmap `-T1`…`-T5`, inter-request delays for web tools, exploit timeouts).
- [ ] **Mission Brief** — Structured pre-session configuration: `target_type`, `scope_notes`, `known_tech`, `excluded_targets`, and per-phase permission flags (`allow_exploitation`, `allow_lateral_movement`, `allow_docker_escape`, etc.).

### New Attack Capabilities

- [ ] **Web Recon Layer** — New `WebReconTool` covering HTTP header analysis, technology fingerprinting (via built-in signature DB), source code / JS endpoint extraction, `robots.txt` / sitemap crawl, and optional headless Playwright browser recon.
- [ ] **Expanded Attack Phases** — Full FSM: `DISCOVERY → WEB_RECON → PORT_SCAN → VULN_SCAN → EXPLOIT_SEARCH → EXPLOITATION → POST_EXPLOITATION → LATERAL_MOVEMENT → PRIVILEGE_ESCALATION → DOCKER_ESCAPE → REPORTING → DONE`. Each phase guarded by permission flags.
- [ ] **Post-Exploitation** — Automated `whoami`, `ifconfig`, container detection through active sessions.
- [ ] **Lateral Movement** — Agent discovers internal subnets via post-exploitation and re-enters DISCOVERY for pivot targets; respects `excluded_targets`.
- [ ] **Docker Escape** — Detects containerised environments and attempts escape techniques when permitted.

### Plugin Architecture v2

Three plugin types — no Python code required for CLI tools or REST APIs:

- [ ] **`python_class`** — Existing system (unchanged). Complex logic in `tool.py`.
- [ ] **`cli_wrapper`** — Any CLI binary declared entirely in `plugin.json` (`args_template`, `output_format`, `install_hint`). `ToolRegistry` auto-generates a `GenericCLITool` instance.
- [ ] **`api_wrapper`** — REST API tools declared in `plugin.json` (`base_url`, `auth_env`, `endpoints`). API key resolved from environment / `SecureStore` / database.

### Finding & Proof System

- [ ] **`Finding` model** — Structured evidence record: phase, severity, target context, exact commands run, raw output, screenshot path, CVE/CVSS, reproduction steps, remediation.
- [ ] **`findings` database table** — Replaces raw string lists in `AgentContext`.
- [ ] **Report overhaul** — `report_generator.py` and `report.html` rebuilt around `Finding` objects: severity-coded badges, embedded screenshots, command evidence blocks, per-finding reproduction guides.
- [ ] **SARIF output** — Export findings as SARIF v2.1 JSON for CI/CD pipeline and IDE integration alongside existing HTML/PDF.

### AI & Agent Improvements

- [ ] **Self-Correction** — On tool failure or unproductive result, agent automatically selects an alternative module or strategy instead of retrying the same action. Implemented as a reflection step in the ReAct loop.
- [ ] **Vector Search / RAG Knowledge Base** — Embed historical findings and successful exploit patterns into a local vector store. Agent queries similar past sessions before deciding which exploit to attempt. Replaces keyword-only `knowledge_base.py` lookups.

### Network & Traffic

- [ ] **Network proxying** — Optional proxy support for all web recon requests (`httpx` + Playwright routed through a configurable HTTP/S proxy, e.g. Burp Suite or mitmproxy). Enables full traffic capture and manual review of what the agent sends.

### V2 Plugin Catalogue

| Plugin              | Type           | Binary / API    | Category    |
| ------------------- | -------------- | --------------- | ----------- |
| `nuclei_scan`       | `cli_wrapper`  | `nuclei`        | vuln-scan   |
| `gobuster_scan`     | `cli_wrapper`  | `gobuster`      | recon       |
| `ffuf_fuzz`         | `cli_wrapper`  | `ffuf`          | recon       |
| `sqlmap_scan`       | `cli_wrapper`  | `sqlmap`        | exploit     |
| `nikto_scan`        | `cli_wrapper`  | `nikto`         | vuln-scan   |
| `hydra_brute`       | `cli_wrapper`  | `hydra`         | exploit     |
| `shodan_lookup`     | `api_wrapper`  | Shodan API      | recon       |
| `virustotal_lookup` | `api_wrapper`  | VirusTotal API  | recon       |
| `web_scanner`       | `python_class` | Playwright      | web         |
| `docker_escape`     | `python_class` | Built-in        | post-exploit|
| `lateral_pivot`     | `python_class` | Built-in        | post-exploit|
| `interactsh`        | `cli_wrapper`  | `interactsh`    | exploit     |

---

## V3 — XBOW Level

**Goal:** Production-quality open-source tool with multi-agent architecture and automated intelligence.

### Architecture

- [ ] **Coordinator + Solver architecture** — Meta-agent spawns specialised solvers per target/phase; each solver is independent and restartable
- [ ] **Isolated attack machines** — Each solver runs inside its own Docker container; host filesystem untouched
- [ ] **Multi-target parallel execution** — Coordinator manages thousands of targets simultaneously across solver pool
- [ ] **Internal Reviewer agent** — Dedicated second LLM pass that validates every Finding before it enters the report; reduces false positives without slowing the primary agent

### Intelligence

- [ ] **Source code analysis** — White-box testing via Semgrep + LLM for repositories and deployed code
- [ ] **Zero-day discovery** — LLM reasoning over unusual service behaviour and non-public vulnerability patterns
- [ ] **`custom_payload` plugin** — LLM writes targeted Python exploit scripts on the fly for non-public or custom services; sandboxed execution
- [ ] **Continuous learning** — Cross-campaign improvement; successful exploit chains fed back into the RAG knowledge base automatically

### Integration

- [ ] **CI/CD integration** — GitHub Actions and GitLab CI plugins; AEGIS runs as a pipeline step
- [ ] **Bug bounty output** — HackerOne-compatible JSON report alongside SARIF
- [ ] **Always-on monitoring** — Scheduled continuous security testing against registered targets
- [ ] **Cloud environments** — AWS, Azure, GCP asset discovery and cloud-specific exploit modules

---

## Optional: Defense Module

> Not the main product — an optional Blue Team add-on.

```bash
# Attack mode (primary use)
python main.py --target 192.168.1.0/24 --mode full_auto

# Defense mode (optional, started separately)
sudo python main.py --mode defend --interface eth0 --protect-network 192.168.1.0/24
```

The Defense Module runs as a separate process and does not affect the main attack workflow.
Details: [07_NETWORK_DEFENSE_MODULE.md](07_NETWORK_DEFENSE_MODULE.md)

---

## Timeline (Flexible)

```
2025 Q1-Q2   V1 Development (Capstone)                            ✓ COMPLETE
             └── Core agent, 3 tools, ToolRegistry, safety, web UI

2026 Q1      V2 Sprint 1 — Foundation
             └── Tool health checks, speed profiles

2026 Q2      V2 Sprint 2 — Plugin Architecture
             └── cli_wrapper + api_wrapper plugin types, GenericCLITool/GenericAPITool

2026 Q3      V2 Sprint 3 — Intelligent Recon
             └── Mission Brief, WebReconTool, browser recon, network proxying

2026 Q4      V2 Sprint 4 — Full Attack Lifecycle
             └── Phase expansion, post-exploitation, lateral movement, Docker escape

2027 Q1      V2 Sprint 5 — Evidence & Reporting
             └── Finding model, SARIF output, report overhaul

2027 Q2      V2 Sprint 6 — AI Improvements
             └── Self-correction, RAG/vector knowledge base

2027 Q3+     V3 Development (XBOW Level)
             └── Multi-agent, Docker isolation, Internal Reviewer, source analysis, zero-day

Ongoing      Open Source Community
             └── Bug bounties, contributions, new plugins
```

---

## V1 → XBOW Bridge

```
V1 (Capstone) ✓           V2 (Growth)                       V3 (XBOW Level)
──────────────────         ────────────────────────────      ──────────────────────────
Single Agent        →      Single (smarter)             →    Coordinator + Solvers
Network Only        →      + Web Recon + OOB probes      →    + Source Code Analysis
3 Core Tools        →      + 11 Plugin Tools             →    + Custom Tool Generation
Basic Retry         →      + Self-Correction             →    + Full Adaptation
No scope config     →      + Mission Brief               →    + Autonomous Scoping
Host Exec (all)     →      + Configurable proxy          →    + Docker-Isolated Tools
1 Target            →      + Lateral Movement            →    + Thousands Simultaneous
SearchSploit only   →      + Nuclei, Shodan, ffuf        →    + Zero-Day Discovery
String findings     →      + Structured Proofs + SARIF   →    + Bug Bounty Integration
Keyword KB lookup   →      + RAG / Vector Search         →    + Cross-Campaign Learning
Tool failures fatal →      + Health Checks + Hints       →    + Self-Healing Tooling
Plugin System ready →      + cli_wrapper / api_wrapper   →    + Plugin Marketplace
No second opinion   →      —                             →    + Internal Reviewer LLM
```

---

## Open Source Plan

### License: MIT

### Repository Structure (at release)

```
AEGIS/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CHANGELOG.md
├── PLUGIN_GUIDE.md     ← Plugin authoring guide
├── docs/
├── src/
├── plugins/            ← Community plugins go here
├── tests/
├── docker/
└── .github/workflows/
```

### Community Goals

- Receive contributions from security researchers
- Plugin ecosystem (anyone can write a new attack type)
- Documentation wiki
- Discord/Matrix community
