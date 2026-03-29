# TIRPAN — Master Checklist (Per Phase, Complete)

> Detailed task list for each phase. Mark with ✅ when complete.
>
> **Total Phases:** 15 (Pentest: 14 core + 1 ToolRegistry) + 8 (Defense) = **23 Phases**
> **Important:** ShellTool is NOT in V1. Web attacks come as V2+ plugins. `/plugins/` is empty in V1.

---

## 🔵 SECTION A: TIRPAN Pentest Bot (V1)

---

## Phase 1: Configuration & Data Models

**Files:** `config.py`, `models/`
**Teaches:** Pydantic, type hints, env vars

### Structure

- [x] **1.1** — Create project directory structure (`core/`, `tools/`, `plugins/`, `models/`, `database/`, `web/`, `reporting/`, `defense/`, `tests/`, `docs/`)
- [x] **1.2** — Create virtual environment (`python3.11 -m venv venv`)
- [x] **1.3** — Prepare `requirements.txt`: `pydantic fastapi uvicorn httpx python-nmap pymetasploit3 scapy aiosqlite rich weasyprint jinja2 pytest pytest-cov pytest-asyncio`
      _(no openai package — we connect to OpenRouter directly via httpx)_
      _(scapy is only for the defense module; optionally move to a separate requirements-defense.txt)_
- [x] **1.4** — Create `.env.example` file (OPENROUTER_API_KEY, MSF_RPC_PASSWORD, MSF_RPC_HOST, MSF_RPC_PORT)
- [x] **1.5** — Create `.gitignore` file (`.env`, `venv/`, `*.db`, `__pycache__/`, `reports/`)

### Models

- [x] **1.6** — `models/target.py` — `Target` Pydantic model (ip, port_range, scan_only, excluded_ports)
- [x] **1.7** — `models/scan_result.py` — `Port`, `Host`, `ScanResult` models
- [x] **1.8** — `models/vulnerability.py` — `Vulnerability` model (cvss_score, description, cve_id)
- [x] **1.9** — `models/exploit_result.py` — `ExploitResult` model (success, output, session_id)
- [x] **1.10** — `models/session.py` — `Session` model (target, config, status, timestamps)

### Configuration

- [x] **1.11** — `config.py` — `AppConfig` class (reads all settings from `.env`)
- [x] **1.12** — `config.py` — `SafetyConfig` class (10 guardrail rules)
- [x] **1.13** — `config.py` — `LLMConfig` class (provider, model, temperature, timeout)

### Tests

- [x] **1.14** — `tests/test_models.py` — write validation tests for every model
- [x] **1.15** — `python -m pytest tests/test_models.py -v` must pass (25/25)

---

## Phase 2: LLM Client

**File:** `core/llm_client.py`
**Teaches:** Async/await, HTTP API calls, JSON parsing, abstraction

### OpenRouter Integration

- [x] **2.1** — Create `LLMClient` abstract base class
- [x] **2.2** — `OpenRouterClient` — async POST calls via `httpx` (chat completions endpoint)
- [x] **2.3** — `OpenRouterClient` — JSON response parsing (`choices[0].message.content`)
- [x] **2.4** — `OpenRouterClient` — retry logic (3 attempts, exponential backoff)
- [x] **2.5** — `OpenRouterClient` — timeout handling (30 second default)

### Ollama Integration

- [x] **2.6** — `OllamaClient` — local API (`http://localhost:11434/api/chat`)
- [x] **2.7** — `OllamaClient` — streaming response support
- [x] **2.8** — `OllamaClient` — model health check (`/api/tags` endpoint)

### Router

- [x] **2.9** — `LLMRouter` — provider selection + fallback logic
- [x] **2.10** — Structured output parsing (parse JSON returned by the LLM, handles ```json blocks)
- [x] **2.11** — Fallback logic (primary fails → switch to other provider)

### Tests

- [x] **2.12** — `tests/test_llm_client.py` — unit tests with mocked HTTP calls
- [x] **2.13** — Integration test with real Ollama API (`.env` ile doğrulandı)
- [x] **2.14** — `python -m pytest tests/test_llm_client.py -v` must pass (14/14)

---

## Phase 3: Base Tool & Nmap Tool (OOP)

**Files:** `tools/base_tool.py`, `tools/nmap_tool.py`
**Teaches:** OOP, inheritance, abstract methods, subprocess, XML parsing

### Base Tool + ToolMetadata (Plugin Contract)

- [x] **3.1** — Create `ToolMetadata` Pydantic model: `name`, `description`, `parameters` (JSON schema), `category`, `version`
- [x] **3.2** — Create `BaseTool` abstract class (ABC)
- [x] **3.3** — Define `@property @abstractmethod metadata(self) -> ToolMetadata`
- [x] **3.4** — Define `async def execute(self, params: dict) -> dict` abstract method
  - Return format always: `{"success": bool, "output": any, "error": str|None}`
- [x] **3.5** — Optional `async def validate(self, params: dict) -> tuple[bool, str]` override

### Nmap Tool

- [x] **3.6** — Create `NmapTool(BaseTool)` class, implement `metadata` property
- [x] **3.7** — Ping sweep: host discovery with `-sn` flag
- [x] **3.8** — Port scan: service and OS detection with `-sV -O`
- [x] **3.9** — XML output parsing (`xml.etree`)
- [x] **3.10** — Structured output: convert to `ScanResult` model
- [x] **3.11** — Scan type selection (ping/service/os/full)
- [x] **3.12** — Timeout control (max 5 minutes per host)

### Tests

- [x] **3.13** — `tests/test_nmap_tool.py` — tests with mocked subprocess output
- [ ] **3.14** — Run Metasploitable2 in Docker and test with a real scan
- [x] **3.15** — `python -m pytest tests/test_nmap_tool.py -v` must pass (20/20)

---

## Phase 3.5: Tool Registry (Plugin Loader)

**File:** `core/tool_registry.py`
**Teaches:** importlib, dynamic loading, registry pattern
**Why it matters:** The agent learns which tools exist from here. Plugins register here.

- [x] **3.5.1** — Create `ToolRegistry` class
- [x] **3.5.2** — `register(tool: BaseTool)` — store the tool in a dict (key = `tool.metadata.name`)
- [x] **3.5.3** — `get(name: str) -> BaseTool` — retrieve tool by name, raise `ToolNotFoundError` if missing
- [x] **3.5.4** — `list_for_llm() -> list[dict]` — tool descriptions to send to the LLM
  ```python
  # Example output:
  [{"name": "nmap_scan", "description": "...", "parameters": {...}}, ...]
  ```
- [x] **3.5.5** — `load_plugins(plugins_dir: Path)` — scan `/plugins/` directory:
  - [x] Look for `plugin.json` in each subdirectory
  - [x] Load those with `enabled: true` via `importlib.import_module()`
  - [x] Instantiate and register the class from `entry_point`
  - [x] On plugin load failure: log `WARNING`, do not crash the app
- [x] **3.5.6** — Bootstrap registry in `main.py` on startup
- [x] **3.5.7** — Create empty `plugins/__init__.py` (makes directory a package)
- [x] **3.5.8** — `plugin.json` schema validation: check for required fields
- [x] **3.5.9** — `tests/test_tool_registry.py` — test scenarios:
  - [x] Core tool register and get test
  - [x] Get non-existent tool → `ToolNotFoundError`
  - [x] `load_plugins()` test with a mock plugin directory
  - [x] Plugin with `enabled: false` must not be loaded
  - [x] Malformed `plugin.json` → app must not crash (WARNING log)
- [x] **3.5.10** — `python -m pytest tests/test_tool_registry.py -v` must pass (12/12)

---

## Phase 4: SearchSploit Tool

**File:** `tools/searchsploit_tool.py`
**Teaches:** String parsing, regex, CLI integration

- [x] **4.1** — Create `SearchSploitTool(BaseTool)` class
- [x] **4.2** — Use `searchsploit -j` JSON output mode
- [x] **4.3** — Build query combining service + version
- [x] **4.4** — Parse exploit list (title, path, type, platform)
- [x] **4.5** — CVE ID extraction (regex from title)
- [x] **4.6** — Filter exploit categories (exclude DoS exploits — safety)
- [x] **4.7** — Map results to `Vulnerability` model
- [x] **4.8** — `tests/test_searchsploit_tool.py` — tests with mocked output
- [x] **4.9** — `python -m pytest tests/test_searchsploit_tool.py -v` must pass (16/16)

---

## Phase 5: Metasploit RPC Tool

**File:** `tools/metasploit_tool.py`
**Teaches:** RPC protocol, network programming, session management

- [x] **5.1** — Prepare `msfrpcd` startup script (systemd service or startup script)
- [x] **5.2** — `MetasploitTool(BaseTool)` — connection via `pymetasploit3`
- [x] **5.3** — Module listing: `client.modules.exploits`
- [x] **5.4** — Module search: find exploits by service
- [x] **5.5** — Option setting: `RHOSTS`, `RPORT`, `PAYLOAD`
- [x] **5.6** — Exploit execution: `client.modules.use()` + `run()`
- [x] **5.7** — Session management: list active sessions, run commands
- [x] **5.8** — Timeout: 60 second exploit timeout
- [x] **5.9** — Handle connection loss (detect msfrpcd restart)
- [x] **5.10** — `tests/test_metasploit_tool.py` — tests with mocked RPC
- [x] **5.11** — `python -m pytest tests/test_metasploit_tool.py -v` must pass (16/16)

---

## Phase 6: Safety System

**File:** `core/safety.py`
**Teaches:** IP mathematics, input validation, security thinking

- [x] **6.1** — Create `SafetyGuard` class
- [x] **6.2** — **Rule 1:** `check_target_scope()` — CIDR range check (`ipaddress` module)
- [x] **6.3** — **Rule 2:** `check_port_scope()` — port range check
- [x] **6.4** — **Rule 3:** `check_excluded_ips()` — excluded IP list check
- [x] **6.5** — **Rule 4:** `check_excluded_ports()` — excluded port check
- [x] **6.6** — **Rule 5:** `check_exploit_allowed()` — scan-only mode check
- [x] **6.7** — **Rule 6:** `check_no_dos()` — block DoS exploit categories
- [x] **6.8** — **Rule 7:** `check_no_destructive()` — block destructive actions
- [x] **6.9** — **Rule 8:** `check_max_severity()` — CVSS score cap
- [x] **6.10** — **Rule 9:** `check_time_limit()` — session duration limit
- [x] **6.11** — **Rule 10:** `check_rate_limit()` — requests/second limit
- [x] **6.12** — Kill switch: `kill_switch_triggered` flag and `emergency_stop()` method
- [x] **6.13** — `validate_action(action) -> (bool, str)` — runs all guards as a pipeline
- [x] **6.14** — `tests/test_safety.py` — test case for each rule
- [x] **6.15** — Edge cases: `/0` subnet, port 0, negative CVSS, etc.
- [x] **6.16** — `python -m pytest tests/test_safety.py -v` must pass (36/36)

---

## Phase 7: Session Memory

**File:** `core/memory.py`
**Teaches:** Data structures, context management, token counting

- [x] **7.1** — Create `SessionMemory` class
- [x] **7.2** — Message history: bounded window (evicts oldest non-pinned first)
- [x] **7.3** — Message types: `system`, `user`, `assistant`, `tool_result`
- [x] **7.4** — Context builder: build messages list to send to LLM
- [x] **7.5** — Token estimation: rough token count (chars/4 heuristic)
- [x] **7.6** — Auto-truncation: drop old messages when context window fills up
- [x] **7.7** — Important findings **pinning**: critical findings always stay in context
- [x] **7.8** — Memory serialization: `to_dict()` and `from_dict()` (for DB)
- [x] **7.9** — `tests/test_memory.py` — truncation and pinning tests
- [x] **7.10** — `python -m pytest tests/test_memory.py -v` must pass (24/24)

---

## Phase 8: Agent Core (ReAct Loop)

**File:** `core/agent.py`
**Teaches:** State machines, ReAct pattern, async orchestration

### Agent State Machine

- [x] **8.1** — `AgentState` enum: `IDLE`, `REASONING`, `ACTING`, `OBSERVING`, `REFLECTING`, `DONE`, `ERROR`
- [x] **8.2** — Create `PentestAgent` class
- [x] **8.3** — State transitions: `IDLE → REASONING → ACTING → OBSERVING → REFLECTING → REASONING`

### ReAct Loop

- [x] **8.4** — `reason()` — send current state to LLM, receive next_action
- [x] **8.5** — `act(action)` — call the appropriate tool
- [x] **8.6** — `observe(result)` — add tool result to memory
- [x] **8.7** — `reflect()` — update summary, adapt strategy
- [x] **8.8** — `run()` — main loop (while not done)

### Attack Phases

- [x] **8.9** — Phase 1: Host discovery (`nmap_scan` tool, ping sweep)
- [x] **8.10** — Phase 2: Port scanning (`nmap_scan` tool, service detect, per host)
- [x] **8.11** — Phase 3: Exploit search (`searchsploit_search` tool, per service)
- [x] **8.12** — Phase 4: Exploitation (`metasploit_run` tool, LLM selects best exploit)
- [x] **8.13** — Phase 5: Report (terminate with `generate_report` meta-action)

> **ShellTool is NOT present in V1.** The LLM cannot run shell commands directly.

### Control

- [x] **8.14** — Kill switch integration (check before each action)
- [x] **8.15** — Max iterations guard (prevent infinite loop)
- [x] **8.16** — Ask-before-exploit mode (pause for user approval)
- [x] **8.17** — Progress callbacks (for WebSocket)
- [x] **8.18** — `tests/test_agent.py` — end-to-end ReAct loop test with mocked tools
- [x] **8.19** — `python -m pytest tests/test_agent.py -v` must pass (39/39)

---

## Phase 9: Prompt Engineering

**File:** `core/prompts.py`
**Teaches:** Prompt engineering, system prompts, templates, few-shot

- [x] **9.1** — Create `PromptBuilder` class
- [x] **9.2** — **System prompt:** define who the agent is, its purpose, and its constraints
- [x] **9.3** — **Context prompt:** send current scan state (found hosts, ports, vulns)
- [x] **9.4** — **Tool descriptions prompt:** describe each tool to the LLM as a JSON schema
- [x] **9.5** — **Action selection prompt:** "Choose next action" instruction
- [x] **9.6** — **Few-shot examples:** 5 examples of good decisions (vsftpd, SMB, report)
- [x] **9.7** — **Reflection prompt:** "What did you learn? Update strategy" prompt
- [x] **9.8** — Output format enforcement: "Return ONLY valid JSON, no prose"
- [x] **9.9** — Dynamic prompt assembly: examples dropped in EXPLOITATION phase and after iteration 20
- [x] **9.10** — `tests/test_prompts.py` — prompt token count and format tests
- [x] **9.11** — `python -m pytest tests/test_prompts.py -v` must pass (33/33)

---

## Phase 10: Database

**Files:** `database/db.py`, `database/repositories.py`, `database/knowledge_base.py`
**Teaches:** SQL, async database, repository pattern, schema design

### Schema

- [x] **10.1** — `database/schema.sql` — 7 tables (pentest_sessions, scan_results, vulnerabilities, exploit_results, knowledge_base, audit_log, schema_migrations)
- [x] **10.2** — `database/db.py` — async DB connection via `aiosqlite`, `init_db(db_path?)` function
- [x] **10.3** — Migration system: v1 (chat tables) → v2 (pentest tables) versioning

### Repositories

- [x] **10.4** — `SessionRepository` — CRUD + update_status, update_stats, save_memory
- [x] **10.5** — `ScanResultRepository` — save/get scan findings, hosts JSON serialization
- [x] **10.6** — `VulnerabilityRepository` — CRUD + `get_by_min_cvss()` query
- [x] **10.7** — `ExploitResultRepository` — save + get_successful()
- [x] **10.8** — `AuditLogRepository` — append-only (no delete/update methods)

### Knowledge Base

- [x] **10.9** — `KnowledgeBase` class — `database/knowledge_base.py`
- [x] **10.10** — `remember_success(service, version, exploit_module)` — upsert with count
- [x] **10.11** — `suggest_exploits(service, version)` — service-only fallback, ordered by count
- [x] **10.12** — `tests/test_database.py` — 44 tests with temp-file SQLite (no in-memory due to aiosqlite threading)
- [x] **10.13** — `python -m pytest tests/test_database.py -v` must pass (44/44)

---

## Phase 11: Reporting

**Files:** `reporting/report_generator.py`, `reporting/cvss.py`
**Teaches:** Jinja2 templates, PDF generation, CVSS algorithm, file I/O

- [x] **11.1** — `CvssCalculator` — CVSS v3.1 score calculation (attack vector, complexity, privileges, etc.)
- [x] **11.2** — `templates/report.html` — Jinja2 HTML template (title, executive summary, findings table)
- [x] **11.3** — Create `ReportGenerator` class
- [x] **11.4** — `generate_html(session_id) -> str` method
- [x] **11.5** — `generate_pdf(session_id) -> bytes` method (WeasyPrint)
- [x] **11.6** — For each finding: CVE description, CVSS score, PoC command, recommended fix
- [x] **11.7** — Executive summary: total host count, open ports, critical vulns
- [x] **11.8** — Save report file: `reports/{session_id}_{timestamp}.pdf`
- [x] **11.9** — `tests/test_reporting.py` — report generation test with mock data
- [x] **11.10** — `python -m pytest tests/test_reporting.py -v` must pass

---

## Phase 12: Web UI

**Files:** `web/app.py`, `web/routes.py`, `web/websocket_handler.py`, `web/static/`
**Teaches:** FastAPI, REST API design, WebSockets, HTML/CSS/JS

### Backend

- [x] **12.1** — Create `FastAPI` app, add CORS middleware
- [x] **12.2** — `POST /api/v1/sessions` — start a new pentest session
- [x] **12.3** — `GET /api/v1/sessions/{id}` — get session status
- [x] **12.4** — `POST /api/v1/sessions/{id}/kill` — kill switch
- [x] **12.5** — `GET /api/v1/sessions/{id}/report` — download HTML/PDF report
- [x] **12.6** — `WebSocket /ws` — real-time agent output stream (session-aware)
- [x] **12.7** — Background task: run agent in background via `asyncio.create_task()`

### Frontend

- [x] **12.8** — `web/static/index.html` — main page (Dashboard/Agent/Findings/Reports/Audit/Config)
- [x] **12.9** — Config Panel: target input, mode selector, safety guardrails form
- [x] **12.10** — Live Mission Feed: real-time REASONING / TOOL CALL / TOOL RESULT / PHASE CHANGE cards via WebSocket
- [x] **12.11** — Results Panel: counters (hosts/ports/vulns/exploits), phase tracker
- [x] **12.12** — Findings Table: vulnerability list sorted by CVSS score
- [x] **12.13** — Kill switch button (always visible), emergency stop
- [x] **12.14** — `web/static/app.js` — Fetch API + WebSocket client, auto-reconnect
- [x] **12.15** — `python3 main.py` serves `http://localhost:8000`
- [x] **12.16** — Manual browser test: start session, live agent feed visible, kill switch works
  - Extra: `web/app_state.py` — shared ToolRegistry singleton (avoids circular imports)
  - Extra: `create_app()` factory in `web/app.py` for test isolation

---

## Phase 13: CLI Entry Point

**File:** `main.py`
**Teaches:** argparse, application orchestration, entry point pattern

- [x] **13.1** — Define CLI arguments with `argparse` — two sub-commands: default (web server) and `run` (terminal pentest)
- [x] **13.2** — `--target` / `-t` arg: IP address or CIDR range (e.g. `192.168.1.0/24`)
- [x] **13.3** — `--mode` / `-m` arg: `full_auto`, `ask_before_exploit`, `scan_only`
- [x] **13.4** — `--scope` arg: CIDR to restrict scanning; `--exclude-ips`; `--exclude-ports`
- [x] **13.5** — `--time-limit`, `--rate-limit`, `--max-iterations`, `--no-dos-block`, `--no-destructive-block`, `--output`
- [x] **13.6** — Config validation: CLI args → `SafetyConfig` construction before agent starts
- [x] **13.7** — Mode routing: `python3 main.py` → web UI; `python3 main.py run` → terminal pentest
- [x] **13.8** — Graceful shutdown: Ctrl+C → `agent._safety.emergency_stop()` → cleanup via `contextlib.suppress`
- [x] **13.9** — Rich terminal startup screen: ASCII banner `Panel`, config `Table`, live event stream (`THINK` / `CALL` / `RESULT` / phase `Rule`)
- [x] **13.10** — `python3 main.py --help` and `python3 main.py run --help` show all arguments
- [x] **13.11** — `python3 main.py run --target 192.168.1.0/24 --mode scan_only` runs end-to-end
  - Extra: auto-saves HTML report to `reports/<id>_report.html` after terminal run

---

## Phase 14: Testing & Polish

**Files:** `tests/`, `pyproject.toml`, `README.md`
**Teaches:** pytest, mocking, test-driven thinking, debugging

- [x] **14.1** — `pyproject.toml` — pytest, coverage, black, ruff config in one file
- [x] **14.2** — `tests/conftest.py` — shared fixtures: `mock_llm_router`, `mock_registry`, `basic_safety`, `scan_only_safety`, `test_session`, `full_auto_session`, `tmp_db`
- [ ] **14.3** — End-to-end integration test: `docker run metasploitable2` + full scan *(requires live Docker environment)*
- [x] **14.4** — Coverage HTML report: `python3 -m pytest tests/ --cov=. --cov-report=html` → `htmlcov/`
- [x] **14.5** — **79% code coverage** achieved (target: 70%) — 342 tests
- [ ] **14.6** — Performance test: 10-host scan time < 5 minutes *(requires live network)*
- [ ] **14.7** — Memory leak check *(requires 2-hour live session)*
- [x] **14.8** — Edge case tests (`tests/test_edge_cases.py`) — 13 scenarios:
  - Target offline / nmap returns empty
  - `asyncio.TimeoutError` during LLM call → agent retries
  - Malformed JSON from LLM → skips iteration
  - `ConnectionRefusedError` (network disconnect) → retries
  - LLM always fails → max_iterations guard stops the agent
  - Out-of-scope target → `safety_block` event emitted
  - Exploit attempt in `scan_only` mode → `safety_block` event
  - Kill switch triggered mid-run → agent stops at next iteration
  - Max iterations prevents infinite loop
  - Tool raises unexpected exception → agent continues (no crash)
  - Unknown tool name (hallucination) → `error` event, agent continues
  - `generate_report` with zero findings → `DONE` state
- [x] **14.9** — README.md updated: CLI Reference section, `python3` commands, tech stack, badges
- [x] **14.10** — ruff: 0 errors (95 auto-fixed); black config in `pyproject.toml`
- [x] **14.11** — `python3 -m pytest tests/ -v` → **342 passed** ✅
- [ ] **14.12** — Demo video or GIF *(to be recorded)*
  - Extra: `tests/test_web_routes.py` — 10 FastAPI integration tests (health, sessions, config, audit, stats)

---

---

## 🔴 SECTION B: Network Defense Module (Blue Team — Optional Add-on)

> Reference: `docs/07_NETWORK_DEFENSE_MODULE.md`

---

## Phase D1: Defense Core — Packet Sniffer

**File:** `defense/sniffer.py`
**Tool:** Scapy

### Preparation

- [ ] **D1.1** — Add to `requirements.txt`: `scapy`, `pandas`, `numpy`, `scikit-learn`, `geoip2`, `mitreattack-python`, `python-watchdog`
- [ ] **D1.2** — Check for root/admin privileges (required for Scapy)
- [ ] **D1.3** — List and display network interfaces to the user

### Sniffer

- [ ] **D1.4** — Create `PacketSniffer` class
- [ ] **D1.5** — Producer-consumer packet pipeline with `asyncio.Queue`
- [ ] **D1.6** — Scapy `sniff()` function — promiscuous mode, all interfaces
- [ ] **D1.7** — Packet filtering: capture only TCP, UDP, ICMP, ARP
- [ ] **D1.8** — **Time window aggregation:** collect packets into 10-second buckets
- [ ] **D1.9** — Feature extraction per window:
  - [ ] Total packet count
  - [ ] Total bytes
  - [ ] Unique source IPs
  - [ ] Unique destination ports
  - [ ] TCP SYN count
  - [ ] TCP SYN-ACK count
  - [ ] ICMP count
  - [ ] UDP count
  - [ ] ARP packet count
- [ ] **D1.10** — Sniffer start/stop API (`start()`, `stop()`)
- [ ] **D1.11** — `tests/test_sniffer.py` — tests with mock packet injection
- [ ] **D1.12** — `python -m pytest tests/test_sniffer.py -v` must pass

---

## Phase D2: Threat Detectors

**File:** `defense/detectors/`

### Port Scan Detector

- [ ] **D2.1** — Create `defense/detectors/port_scan_detector.py`
- [ ] **D2.2** — Per-source-IP sliding window tracker (60 seconds)
- [ ] **D2.3** — Unique destination port count tracker
- [ ] **D2.4** — **Rule 1:** >15 unique dports in 5s → `SCAN_SUSPECTED`
- [ ] **D2.5** — **Rule 2:** >50 unique ports in 30s → `SCAN_CONFIRMED`
- [ ] **D2.6** — TCP flag analysis: SYN-only → stealth scan; SYN+FIN+PSH → Xmas scan
- [ ] **D2.7** — Calculate severity (1-10 scale)
- [ ] **D2.8** — Return MITRE mapping: `T1046`

### ARP Spoof Detector

- [ ] **D2.9** — Create `defense/detectors/arp_detector.py`
- [ ] **D2.10** — ARP table: `{ip → mac}` dictionary
- [ ] **D2.11** — Monitor ARP replies: op=2 packet → IP-MAC check
- [ ] **D2.12** — **Rule:** Known IP arrived with different MAC → `ARP_SPOOF_DETECTED`
- [ ] **D2.13** — Gratuitous ARP rate: >5/minute → suspicious
- [ ] **D2.14** — MITRE mapping: `T1557.002`

### DoS Detector

- [ ] **D2.15** — Create `defense/detectors/dos_detector.py`
- [ ] **D2.16** — Per-source PPS tracker (1-second window)
- [ ] **D2.17** — **Rule:** >1000 total PPS → `DOS_SUSPECTED`
- [ ] **D2.18** — **Rule:** ICMP >100 PPS → `ICMP_FLOOD`
- [ ] **D2.19** — **Rule:** SYN >500 PPS without 3-way handshake → `SYN_FLOOD`
- [ ] **D2.20** — MITRE mapping: `T1498`

### Brute Force Detector

- [ ] **D2.21** — Create `defense/detectors/brute_force_detector.py`
- [ ] **D2.22** — Monitor `/var/log/auth.log` file with `watchdog`
- [ ] **D2.23** — Regex: extract SSH failed attempt pattern (IP, timestamp)
- [ ] **D2.24** — **Rule:** >5 failed SSH/minute from same IP → `SSH_BRUTE_FORCE`
- [ ] **D2.25** — HTTP log monitoring (access.log brute force pattern)
- [ ] **D2.26** — **Rule:** >20 POST /login/minute → `HTTP_BRUTE_FORCE`
- [ ] **D2.27** — MITRE mapping: `T1110`

### Test Suite

- [ ] **D2.28** — `tests/test_detectors.py` — tests for each detector with mock data
- [ ] **D2.29** — True positive test: real attack pattern must generate an alert
- [ ] **D2.30** — False positive test: normal traffic must not generate an alert
- [ ] **D2.31** — `python -m pytest tests/test_detectors.py -v` must pass

---

## Phase D3: Threat Analysis Engine

**File:** `defense/analyzer.py`

- [ ] **D3.1** — Create `ThreatAnalyzer` class
- [ ] **D3.2** — Aggregate output from all detectors
- [ ] **D3.3** — **Threat Context Object** builder:
  - [ ] `source_ip`, `target_ips`, `threat_type`
  - [ ] `evidence` (raw data summary)
  - [ ] `packet_count`, `time_window`
  - [ ] `severity_score` (0-10)
  - [ ] `detector_confidence`
- [ ] **D3.4** — Duplicate detection: merge alerts from the same IP within a 30s window
- [ ] **D3.5** — Severity threshold: >3 → send to LLM; <3 → log_and_watch
- [ ] **D3.6** — Rate limiting: call LLM at most once/minute for the same threat
- [ ] **D3.7** — `tests/test_analyzer.py` — aggregation and dedup tests
- [ ] **D3.8** — `python -m pytest tests/test_analyzer.py -v` must pass

---

## Phase D4: LLM Defense Reasoning Engine

**File:** `defense/llm_defender.py`

### Prompt Design

- [ ] **D4.1** — Create `DefensePromptBuilder` class
- [ ] **D4.2** — Write **system prompt**: "Network security analyst, defend-only, no offensive actions"
- [ ] **D4.3** — Write **threat context prompt**: source IP, evidence, timing, severity
- [ ] **D4.4** — Define **output schema** (JSON):
  ```json
  {
    "threat_type": "...",
    "confidence": 0.0-1.0,
    "mitre_technique": "T...",
    "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
    "recommended_action": "block_ip|rate_limit|redirect_honeypot|log_and_watch|alert_only",
    "action_params": {},
    "reasoning": "...",
    "false_positive_likelihood": 0.0-1.0
  }
  ```
- [ ] **D4.5** — Add few-shot examples (3 examples: port scan, ARP spoof, DoS)
- [ ] **D4.6** — "Return ONLY valid JSON" enforcement

### Engine

- [ ] **D4.7** — Create `LLMDefender` class
- [ ] **D4.8** — Use Ollama as primary provider (for speed)
- [ ] **D4.9** — `analyze_threat(threat_context) -> DefenseDecision`
- [ ] **D4.10** — Response validation: on JSON parse error, fall back to `log_and_watch`
- [ ] **D4.11** — Confidence threshold check: <0.60 → override to `log_and_watch`
- [ ] **D4.12** — Action override safety check: whitelist check before `block_ip`
- [ ] **D4.13** — `tests/test_llm_defender.py` — decision tests with mocked LLM
- [ ] **D4.14** — `python -m pytest tests/test_llm_defender.py -v` must pass

---

## Phase D5: Response Engine

**File:** `defense/responder.py`

### IP Blocking

- [ ] **D5.1** — `block_ip(ip, duration)` — iptables DROP rule
- [ ] **D5.2** — `unblock_ip(ip)` — iptables ACCEPT rule
- [ ] **D5.3** — Scheduled unblock: `asyncio.sleep(duration)` + auto unblock
- [ ] **D5.4** — Whitelist check: never block router, DNS, or gateway IPs

### Rate Limiting

- [ ] **D5.5** — `rate_limit_ip(ip, pps)` — iptables limit rule
- [ ] **D5.6** — `remove_rate_limit(ip)` method

### Honeypot Redirect

- [ ] **D5.7** — `redirect_to_honeypot(ip, original_port, honeypot_port)` — iptables NAT rule
- [ ] **D5.8** — `remove_redirect(ip)` method

### Logging & Alerts

- [ ] **D5.9** — `log_threat(threat_context, decision, action_result)` — write to DB
- [ ] **D5.10** — `alert_user(message, severity)` — WebSocket push to UI
- [ ] **D5.11** — Sound alert (beep on critical severity)

### Safety Rails (Defense version)

- [ ] **D5.12** — Protected networks list: `protect_ranges` config
- [ ] **D5.13** — No action is ever applied to the local system
- [ ] **D5.14** — Extend or inherit from existing `SafetyGuard`

### Tests

- [ ] **D5.15** — `tests/test_responder.py` — iptables tests with mocked subprocess
- [ ] **D5.16** — Whitelist bypass test (protected IPs must not be blocked)
- [ ] **D5.17** — `python -m pytest tests/test_responder.py -v` must pass

---

## Phase D6: Honeypot Server (LLM-Powered)

**File:** `defense/honeypot.py`

- [ ] **D6.1** — Create `LLMHoneypot` class
- [ ] **D6.2** — Start `asyncio` socket server (configurable port, default 2222)
- [ ] **D6.3** — **Fake SSH banner:** `SSH-2.0-OpenSSH_8.4p1 Ubuntu-6ubuntu2.1`
- [ ] **D6.4** — Capture attacker commands: log every command
- [ ] **D6.5** — **LLM response generation:** generate fake Linux output via Ollama
- [ ] **D6.6** — System prompt: "Fake Ubuntu server. Give plausible but false command output. Never reveal you're fake."
- [ ] **D6.7** — Track attacker session duration
- [ ] **D6.8** — Log all interactions to `honeypot_log` DB table
- [ ] **D6.9** — HTTP honeypot: fake web panel on port 8080
- [ ] **D6.10** — Fake credential harvesting: log credentials attempted by the attacker
- [ ] **D6.11** — `tests/test_honeypot.py` — mock socket + mock LLM test
- [ ] **D6.12** — `python -m pytest tests/test_honeypot.py -v` must pass

---

## Phase D7: Defense Database & Integration

**Files:** `database/defense_schema.sql`, `database/defense_repositories.py`

### New Tables

- [ ] **D7.1** — `threat_events` table: timestamp, source_ip, threat_type, severity, mitre_technique, llm_analysis, action_taken
- [ ] **D7.2** — `firewall_rules` table: ip_address, rule_type, reason, created_at, expires_at, active
- [ ] **D7.3** — `honeypot_log` table: attacker_ip, timestamp, command, llm_response, session_duration
- [ ] **D7.4** — `traffic_baseline` table: time_window, metric_name, avg_value, std_deviation

### Repositories

- [ ] **D7.5** — `ThreatEventRepository` — CRUD operations
- [ ] **D7.6** — `FirewallRuleRepository` — active rule management + expired rule cleanup
- [ ] **D7.7** — `HoneypotLogRepository` — append-only interaction log
- [ ] **D7.8** — `TrafficBaselineRepository` — rolling average updater

### ML Baseline (Optional V1)

- [ ] **D7.9** — Learn normal traffic baseline with scikit-learn `IsolationForest`
- [ ] **D7.10** — Baseline training: monitor normal traffic for 10 minutes → model fit
- [ ] **D7.11** — Anomaly scoring: new window → `.predict()` → -1 means anomaly
- [ ] **D7.12** — `tests/test_defense_db.py` — tests with in-memory SQLite
- [ ] **D7.13** — `python -m pytest tests/test_defense_db.py -v` must pass

---

## Phase D8: Defense Web UI Extension & Full Integration

**Files:** `web/routes.py` (defense endpoints), `web/static/defense.html`

### Backend Endpoints

- [ ] **D8.1** — `POST /api/defense/start` — start monitoring (interface, protect_network)
- [ ] **D8.2** — `POST /api/defense/stop` — stop monitoring
- [ ] **D8.3** — `GET /api/defense/status` — active threat count, blocklist size
- [ ] **D8.4** — `GET /api/defense/threats` — last 50 threat events
- [ ] **D8.5** — `GET /api/defense/firewall` — active iptables rules
- [ ] **D8.6** — `POST /api/defense/whitelist/{ip}` — protect an IP
- [ ] **D8.7** — `DELETE /api/defense/block/{ip}` — manual unblock
- [ ] **D8.8** — `WebSocket /ws/defense` — real-time threat stream

### Frontend — Defense Tab

- [ ] **D8.9** — Add "Defense" tab to the main web UI
- [ ] **D8.10** — **Network Status Panel:** live traffic graph (Chart.js), host list, threat counter
- [ ] **D8.11** — **Threat Feed Panel:** real-time alert stream, color-coded severity, LLM reasoning accordion
- [ ] **D8.12** — **Control Panel:** Start/Stop button, whitelist form, sensitivity setting (low/medium/high)
- [ ] **D8.13** — **Intelligence Panel:** attack timeline, MITRE ATT&CK heatmap table, honeypot logs
- [ ] **D8.14** — Active firewall rules table (IP, reason, expiry, manual unblock button)

### Integration Tests

- [ ] **D8.15** — `python main.py --mode defend --interface eth0 --protect-network 192.168.1.0/24` must run
- [ ] **D8.16** — Run `nmap -sS 192.168.1.1` from another terminal → alert must appear in UI
- [ ] **D8.17** — LLM analysis must appear in UI (reasoning text)
- [ ] **D8.18** — After blocking IP, `nmap` ping must fail (iptables rule working)
- [ ] **D8.19** — Honeypot: `ssh attacker@localhost -p 2222` → LLM must generate a fake response
- [ ] **D8.20** — PDF/HTML defense report (threat summary, statistics)
- [ ] **D8.21** — End-to-end test: run defense mode and pentest mode simultaneously

---

## 📊 Overall Progress Summary

| Section                       | Total Tasks | Completed | Percent |
| ----------------------------- | ----------- | --------- | ------- |
| Phase 1 (Config)              | 15          | 15        | ✅ 100% |
| Phase 2 (LLM Client)          | 14          | 14        | ✅ 100% |
| Phase 3 (BaseTool + Nmap)     | 15          | 14        | 93%     |
| Phase 3.5 (ToolRegistry) 🆕   | 10          | 10        | ✅ 100% |
| Phase 4 (SearchSploit)        | 9           | 9         | ✅ 100% |
| Phase 5 (Metasploit)          | 11          | 11        | ✅ 100% |
| Phase 6 (Safety)              | 16          | 16        | ✅ 100% |
| Phase 7 (Memory)              | 10          | 10        | ✅ 100% |
| Phase 8 (Agent)               | 19          | 19        | 100%    |
| Phase 9 (Prompts)             | 11          | 11        | 100%    |
| Phase 10 (Database)           | 13          | 13        | 100%    |
| Phase 11 (Reporting)          | 10          | 10        | ✅ 100% |
| Phase 12 (Web UI)             | 16          | 16        | ✅ 100% |
| Phase 13 (CLI)                | 11          | 11        | ✅ 100% |
| Phase 14 (Testing)            | 12          | 9         | 75% (3 need live env) |
| **Pentest Total**             | **192**     | **188**   | **98%** |
| Phase D1 (Sniffer)            | 12          | 0         | 0%      |
| Phase D2 (Detectors)          | 31          | 0         | 0%      |
| Phase D3 (Analyzer)           | 8           | 0         | 0%      |
| Phase D4 (LLM Defender)       | 14          | 0         | 0%      |
| Phase D5 (Responder)          | 17          | 0         | 0%      |
| Phase D6 (Honeypot)           | 12          | 0         | 0%      |
| Phase D7 (Defense DB)         | 13          | 0         | 0%      |
| Phase D8 (Defense UI)         | 21          | 0         | 0%      |
| **Defense Total**             | **128**     | **0**     | **0%**  |
| **🎯 GRAND TOTAL**            | **320**     | **188**   | **59%** |

---

## 📝 Quick Reference — Key Commands

```bash
# ── Web UI (default) ──────────────────────────────────────────────────────────
python3 main.py                                      # http://localhost:8000
python3 main.py --host 0.0.0.0 --port 9000           # expose on network
python3 main.py --no-reload                          # production mode
python3 main.py --log-level debug                    # verbose logging

# ── Terminal pentest (headless, no web UI) ────────────────────────────────────
python3 main.py run --target 192.168.1.0/24
python3 main.py run --target 10.0.0.1 --mode full_auto --scope 10.0.0.0/24
python3 main.py run --target 10.0.0.5 --mode scan_only --time-limit 300
python3 main.py run --target 10.0.0.5 --exclude-ips 10.0.0.1,10.0.0.254
python3 main.py run --help                           # all flags

# ── Help ──────────────────────────────────────────────────────────────────────
python3 main.py --help
python3 main.py run --help

# ── Tests ─────────────────────────────────────────────────────────────────────
python3 -m pytest tests/ -v                          # run all 342 tests
python3 -m pytest tests/ --cov=. --cov-report=html   # with HTML coverage
python3 -m pytest tests/test_edge_cases.py -v        # edge case tests only
open htmlcov/index.html                              # view coverage report

# ── Linting ───────────────────────────────────────────────────────────────────
python3 -m ruff check core/ tools/ models/ database/ reporting/ main.py
python3 -m black --check core/ tools/ models/

# ── Practice targets ──────────────────────────────────────────────────────────
docker run -d --name metasploitable -p 2222:22 -p 8080:80 tleemcjr/metasploitable2
python3 main.py run --target $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' metasploitable)
```

---

> 💡 **Tip:** For each phase, write the test first (TDD), then implement until the test passes.
>
> 🛡️ **Safety:** Test the defense module ONLY on your own network. Set `--protect-network` correctly.
>
> 📖 **Reference:** Read `docs/07_NETWORK_DEFENSE_MODULE.md` for detailed architecture.
