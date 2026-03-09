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
  Web attack plugins.
  Smarter AI decisions.
  Docker isolation.

V3 (XBOW Level):
  Multi-agent, source code analysis,
  zero-day discovery.
```

---

## V1 — Capstone Release

**Goal:** A fully working, plugin-extensible autonomous pentest bot with 3 tools.

### Core Features

- [x] ReAct agent loop (Reason → Act → Observe → Reflect)
- [ ] **ToolRegistry** — plugin loader infrastructure (core tools built-in)
- [ ] Nmap port & service scanning
- [ ] SearchSploit exploit search
- [ ] Metasploit RPC exploit execution
- [ ] OpenRouter (Claude) + Ollama LLM support
- [ ] Full Auto + Ask Before Exploit modes
- [ ] 10 safety guardrails + kill switch
- [ ] Full audit logging
- [ ] SQLite database + knowledge base
- [ ] Session memory (chat history)
- [ ] Web UI — real-time streaming (WebSocket)
- [ ] PDF/HTML report + CVSS scoring
- [ ] IP and CIDR targeting

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

## V2 — Post-Capstone: Web Testing Plugins

**Goal:** Add web application attack capabilities via the plugin system.

### New Plugins (each as an independent PR)

- [ ] `web_scanner` plugin — XSS, SQLi, SSRF (Playwright)
- [ ] `nuclei_scanner` plugin — Template-based scanning
- [ ] `gobuster` plugin — Directory brute force
- [ ] `interactsh` plugin — Blind injection (OOB callbacks)
- [ ] `custom_payload` plugin — LLM writes exploit scripts

### Core Improvements

- [ ] **Self-Correction** — Failed exploit → try a different strategy
- [ ] **Internal Reviewer** — Second LLM validates findings (reduces false positives)
- [ ] **Docker isolation** — Tools run inside containers
- [ ] **Multi-target parallel** — Multiple hosts at the same time
- [ ] **Domain/URL support** — Non-IP targets
- [ ] **SARIF output** — Standard vulnerability report format
- [ ] **PoC generation** — Reproducible proof for every finding
- [ ] **Network proxying** — Full traffic monitoring
- [ ] **Vector search (RAG)** — Smarter knowledge base

### V2 Tools (delivered as plugins)

```
plugins/
├── web_scanner/    (Playwright + custom XSS/SQLi/SSRF)
├── nuclei/         (Nuclei templates)
├── gobuster/       (dir brute force)
├── interactsh/     (OOB callbacks)
└── custom_payload/ (LLM-generated scripts)
```

---

## V3 — XBOW Level

**Goal:** Production-quality open-source tool.

### New Features

- [ ] **Coordinator + Solver architecture** — Meta-agent spawns specialized solvers
- [ ] **Isolated attack machines** — Each solver in its own container
- [ ] **Source code analysis** — White-box testing (Semgrep + LLM)
- [ ] **Zero-day discovery** — Reasoning about novel vulnerabilities
- [ ] **Custom tool generation** — LLM creates tools on the fly
- [ ] **Continuous learning** — Improvement across campaigns
- [ ] **CI/CD integration** — GitHub Actions, GitLab CI plugins
- [ ] **Bug bounty output** — HackerOne-compatible report
- [ ] **Always-on monitoring** — Continuous security testing
- [ ] Cloud environments (AWS, Azure, GCP)

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
2025 Q1-Q2   V1 Development (Capstone)
             └── Core agent, 3 tools, ToolRegistry, safety, web UI

2025 Q3-Q4   V2 Development (Community)
             └── Web plugins, Docker, multi-target, smarter AI

2026+        V3 Development (XBOW Level)
             └── Multi-agent, source analysis, zero-day

Ongoing      Open Source Community
             └── Bug bounties, contributions, new plugins
```

---

## V1 → XBOW Bridge

```
V1 (Capstone)          V2 (Growth)              V3 (XBOW Level)
──────────────         ──────────────            ──────────────
Single Agent    →      Single + Reviewer    →    Coordinator + Solvers
Network Only    →      + Web Plugins        →    + Source Code Analysis
3 Core Tools    →      + 5 Plugins          →    + Custom Tool Generation
Basic Retry     →      + Self-Correction    →    + Full Adaptation
Host Exec       →      + Docker Isolation   →    + Isolated Attack Machines
1 Target        →      + Multi-Target       →    + Thousands Simultaneous
SearchSploit    →      + Nuclei + NVD API   →    + Zero-Day Discovery
PDF Report      →      + SARIF + PoC        →    + Bug Bounty Integration
Plugin System   →      + Plugin Ecosystem   →    + Plugin Marketplace
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
