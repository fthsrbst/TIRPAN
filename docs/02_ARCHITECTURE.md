# AEGIS — Full Architecture v2 (Plugin-Aware)
> *Autonomous Ethical Guardrailed Intelligence System*

## Design Principle

> **"Small core, big plugins."**
>
> Core: only the Agent loop + LLM + Safety + DB + UI.
> Every attack capability is a **Tool Plugin** — added or removed without touching the core.

---

## Big Picture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          AEGIS                                        │
│                                                                       │
│  ┌──────────┐    ┌────────────────────────────────────────────────┐   │
│  │  Web UI  │───▶│             FastAPI Backend                    │   │
│  │          │◀───│  REST + WebSocket                              │   │
│  └──────────┘    └──────────────────┬─────────────────────────────┘  │
│                                     │                                 │
│                         ┌───────────▼───────────┐                    │
│                         │    ReAct Agent Core    │                    │
│                         │                        │                    │
│                         │  Reason → Act →        │                    │
│                         │  Observe → Reflect     │                    │
│                         │                        │                    │
│                         │  ┌──────────────────┐  │                    │
│                         │  │  Safety Guard     │  │                    │
│                         │  │  (every action)   │  │                    │
│                         │  └──────────────────┘  │                    │
│                         └───────────┬────────────┘                    │
│                                     │                                 │
│                         ┌───────────▼────────────┐                    │
│                         │    Tool Registry        │ ← KEY POINT       │
│                         │                         │                    │
│                         │  Core Tools (built-in): │                    │
│                         │  ├── NmapTool           │                    │
│                         │  ├── SearchSploitTool   │                    │
│                         │  └── MetasploitTool     │                    │
│                         │                         │                    │
│                         │  Plugin Tools (loaded): │                    │
│                         │  ├── [empty — V1]       │                    │
│                         │  ├── WebScanPlugin (V2) │                    │
│                         │  ├── NucleiPlugin (V2)  │                    │
│                         │  └── ...                │                    │
│                         └─────────────────────────┘                    │
│                                                                       │
│  ┌──────────────────────────┐   ┌──────────────────────────────────┐  │
│  │    LLM Layer             │   │       SQLite Database             │  │
│  │  OpenRouter + Ollama     │   │  Sessions / Findings / Audit     │  │
│  └──────────────────────────┘   └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

[OPTIONAL MODULE]
┌─────────────────────────────────────┐
│         Defense Module              │  ← Separate process, same DB
│  Sniffer → Detectors → LLM → Block  │
└─────────────────────────────────────┘
```

---

## Layers (V1 Scope — Definitive)

### Layer 1: Core Infrastructure (immutable foundation)

```
core/
├── agent.py          # ReAct loop — gets tool names from tool registry
├── llm_client.py     # OpenRouter + Ollama abstraction
├── safety.py         # 10 guardrails — runs before every action
├── memory.py         # Session memory (sliding window)
├── prompts.py        # Prompt builder
└── tool_registry.py  # ← NEW: Plugin loader & tool catalog  [CORE]
```

### Layer 2: Core Tools (built-in in V1, behave like core)

```
tools/
├── base_tool.py          # Abstract base — every tool conforms to this
├── nmap_tool.py          # Port scan + host discovery
├── searchsploit_tool.py  # Exploit search
└── metasploit_tool.py    # Exploit execution via RPC
```

**ShellTool is NOT in V1.** Excluded from scope due to security risk.

### Layer 3: Plugin Tools (empty in V1 — loaded later)

```
plugins/
├── __init__.py
├── web_scan/           # V2: XSS, SQLi, SSRF (Playwright + custom)
│   ├── plugin.json     # Metadata
│   └── tool.py
├── nuclei/             # V2: Template-based scanner
│   ├── plugin.json
│   └── tool.py
├── gobuster/           # V2: Directory brute forcing
│   ├── plugin.json
│   └── tool.py
└── custom_payload/     # V2: LLM-generated exploit scripts
    ├── plugin.json
    └── tool.py
```

### Layer 4: Data Layer

```
database/
├── db.py                 # aiosqlite connection manager
├── repositories.py       # CRUD per entity
├── knowledge_base.py     # "What worked where" lookup
└── schema.sql            # 7 tables (pentest) + 4 tables (defense)
```

### Layer 5: Web & Reporting

```
web/
├── app.py                # FastAPI app + CORS
├── routes.py             # REST endpoints
├── websocket_handler.py  # Real-time streaming
└── static/               # HTML/CSS/JS dashboard

reporting/
├── report_generator.py   # HTML → PDF pipeline
├── cvss.py               # CVSS v3.1 calculator
└── templates/
    └── report.html       # Jinja2 report template
```

### Layer 6: Defense Module (Optional, started separately)

```
defense/
├── sniffer.py            # Scapy packet capture
├── analyzer.py           # Threat aggregation
├── llm_defender.py       # LLM-based threat analysis
├── responder.py          # iptables / alert / redirect
├── honeypot.py           # LLM-powered fake service
└── detectors/
    ├── port_scan.py
    ├── arp_spoof.py
    ├── dos.py
    └── brute_force.py
```

---

## Tool Registry — Plugin System Details

### How It Works

```
At startup:
1. ToolRegistry is initialized
2. Core tools (Nmap, SearchSploit, MSF) are auto-registered
3. /plugins/ directory is scanned
4. Each plugin.json is read (metadata)
5. Enabled plugins are imported via importlib and registered

While agent is running:
6. Agent sends the LLM the "current tools" list
   → Tool name + description + parameter schema
7. LLM decides which tool to call
8. Agent retrieves the tool from ToolRegistry and executes it
```

### Tool Interface (Immutable Contract)

```python
# tools/base_tool.py
from abc import ABC, abstractmethod
from pydantic import BaseModel

class ToolMetadata(BaseModel):
    name: str           # Name the agent tells the LLM: "nmap_scan"
    description: str    # Helps the LLM understand when to use it
    parameters: dict    # JSON Schema — LLM generates params from this schema
    category: str       # "recon" | "exploit" | "web" | "report"
    version: str        # Semver: "1.0.0"

class BaseTool(ABC):
    @property
    @abstractmethod
    def metadata(self) -> ToolMetadata:
        """All information about the tool lives here."""

    @abstractmethod
    async def execute(self, params: dict) -> dict:
        """
        Execute the tool.
        Returns: {"success": bool, "output": any, "error": str|None}
        """

    async def validate(self, params: dict) -> tuple[bool, str]:
        """Validate params. Can be overridden."""
        return True, ""
```

### Plugin `plugin.json` Schema

```json
{
  "name": "web_scanner",
  "version": "1.0.0",
  "display_name": "Web Vulnerability Scanner",
  "description": "XSS, SQLi, SSRF detection using headless browser",
  "author": "community",
  "enabled": false,
  "requires": ["playwright", "beautifulsoup4"],
  "category": "web",
  "entry_point": "plugins.web_scan.tool.WebScanTool",
  "min_core_version": "2.0.0",
  "safety_level": "medium"
}
```

### Tool Registry Implementation (Summary)

```python
# core/tool_registry.py
import importlib
import json
from pathlib import Path
from tools.base_tool import BaseTool

class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        name = tool.metadata.name
        self._tools[name] = tool

    def get(self, name: str) -> BaseTool:
        return self._tools[name]

    def list_for_llm(self) -> list[dict]:
        """Tool descriptions to send to the LLM."""
        return [
            {
                "name": t.metadata.name,
                "description": t.metadata.description,
                "parameters": t.metadata.parameters,
            }
            for t in self._tools.values()
        ]

    def load_plugins(self, plugins_dir: Path) -> None:
        """Scan plugin directory, import loadable plugins."""
        for plugin_dir in plugins_dir.iterdir():
            manifest_path = plugin_dir / "plugin.json"
            if not manifest_path.exists():
                continue
            manifest = json.loads(manifest_path.read_text())
            if not manifest.get("enabled", False):
                continue
            # Dynamic import
            module_path, class_name = manifest["entry_point"].rsplit(".", 1)
            module = importlib.import_module(module_path)
            tool_class = getattr(module, class_name)
            self.register(tool_class())
```

---

## LLM Communication Protocol (Standard)

The agent sends this to the LLM on every ReAct iteration:

```json
{
  "available_tools": [
    {
      "name": "nmap_scan",
      "description": "Scan ports and detect services on a target IP or range.",
      "parameters": {
        "type": "object",
        "properties": {
          "target": {"type": "string", "description": "IP or CIDR range"},
          "scan_type": {"type": "string", "enum": ["ping", "service", "os", "full"]}
        },
        "required": ["target"]
      }
    }
  ],
  "current_state": { ... },
  "history": [ ... ]
}
```

The LLM always responds with this JSON:

```json
{
  "thought": "Port 445 is open and SMB v1 is running. Checking searchsploit for EternalBlue.",
  "tool": "searchsploit_search",
  "parameters": { "query": "EternalBlue SMB ms17-010" },
  "confidence": 0.91
}
```

When the LLM decides it's done:

```json
{
  "thought": "All targets scanned, 3 critical vulnerabilities found.",
  "tool": "generate_report",
  "parameters": { "session_id": "abc123" },
  "confidence": 1.0
}
```

---

## Attack Flow (V1 — Network Only)

```
User: "Scan 192.168.1.0/24 and exploit anything you find"
                    │
                    ▼
        [Agent] Create session (DB)
                    │
          ┌─────────▼──────────┐
          │  Phase 1: Discovery │ → nmap_scan (ping sweep)
          └─────────┬──────────┘
                    │ → Host list: [.5, .10, .23, .42]
          ┌─────────▼──────────┐
          │  Phase 2: Port      │ → nmap_scan (service detect) × host count
          │  Scanning           │
          └─────────┬──────────┘
                    │ → Port/service/version list
          ┌─────────▼──────────┐
          │  Phase 3: Exploit   │ → searchsploit_search × service count
          │  Search             │
          └─────────┬──────────┘
                    │ → Exploit list
          ┌─────────▼──────────┐
          │  Phase 4:           │ → metasploit_run × exploit count
          │  Exploitation       │   (Safety check → LLM selects)
          └─────────┬──────────┘
                    │ → Successful exploits, sessions
          ┌─────────▼──────────┐
          │  Phase 5: Report    │ → generate_report
          └────────────────────┘
```

**Safety Guard runs before every action. Any rule violation → block.**

---

## Safety System (10 Rules — Immutable)

```
Action → [1] Is kill switch active?
       → [2] Is target IP within scope?
       → [3] Is port within allowed range?
       → [4] Is target in excluded_ips?
       → [5] Is port in excluded_ports?
       → [6] Is exploit permitted? (scan_only mode)
       → [7] Is this a DoS category?
       → [8] Is this a destructive action?
       → [9] Does it exceed max exploit severity?
       → [10] Has time limit expired?
       → ✅ Execute  OR  🛑 Block + Audit Log
```

---

## Database (7 Tables — Pentest)

| Table             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `sessions`        | Each pentest session                                 |
| `messages`        | Agent thought/action/result history                  |
| `scan_results`    | Host/port/service findings                           |
| `vulnerabilities` | CVE list + CVSS score                                |
| `exploit_results` | Exploit attempt + result                             |
| `knowledge_base`  | "Which exploit worked against which service/version" |
| `audit_log`       | Every action logged for legal purposes               |

---

## Technology Stack (V1 — Definitive List)

| Component         | Technology                     | Version       |
| ----------------- | ------------------------------ | ------------- |
| Language          | Python                         | 3.11+         |
| Web Framework     | FastAPI                        | 0.110+        |
| LLM (cloud)       | OpenRouter → Claude 3.5 Sonnet | —             |
| LLM (local)       | Ollama → Llama 3 8B            | —             |
| DB                | SQLite via aiosqlite           | —             |
| Port Scanner      | Nmap                           | 7.94+         |
| Exploit DB        | SearchSploit (ExploitDB)       | —             |
| Exploit Framework | Metasploit 6.x via RPC         | pymetasploit3 |
| Reporting         | Jinja2 + WeasyPrint            | —             |
| Real-time         | WebSocket via FastAPI          | —             |
| Terminal UI       | Rich                           | 13.x          |
| Testing           | pytest                         | 8.x           |
| Plugin loading    | importlib (stdlib)             | —             |

**Not in V1 (planned as V2+ plugins):**

- Playwright / Headless Browser
- XSS / SQLi / SSRF scanning
- Nuclei
- Gobuster / ffuf
- InteractSH (OOB callbacks)
- SQLMap
- SARIF output

---

## Directory Structure (Complete)

```
AEGIS/
│
├── main.py                      # CLI entry point
├── config.py                    # AppConfig, SafetyConfig, LLMConfig
├── requirements.txt
├── .env.example
│
├── core/                        # CORE — do not modify
│   ├── agent.py                 # ReAct loop
│   ├── llm_client.py            # LLM abstraction
│   ├── safety.py                # 10 guardrails
│   ├── memory.py                # Session memory
│   ├── prompts.py               # Prompt builder
│   └── tool_registry.py         # Plugin loader + tool catalog
│
├── tools/                       # CORE TOOLS — V1 built-in
│   ├── base_tool.py             # Abstract base
│   ├── nmap_tool.py
│   ├── searchsploit_tool.py
│   └── metasploit_tool.py
│
├── plugins/                     # PLUGIN TOOLS — V2+ (empty at start)
│   └── __init__.py              # Empty, Plugin loader looks here
│
├── database/
│   ├── db.py
│   ├── repositories.py
│   ├── knowledge_base.py
│   └── schema.sql
│
├── web/
│   ├── app.py
│   ├── routes.py
│   ├── websocket_handler.py
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
├── defense/                     # OPTIONAL — separate process
│   ├── sniffer.py
│   ├── analyzer.py
│   ├── llm_defender.py
│   ├── responder.py
│   ├── honeypot.py
│   └── detectors/
│       ├── port_scan.py
│       ├── arp_spoof.py
│       ├── dos.py
│       └── brute_force.py
│
├── models/                      # Pydantic data models
│   ├── target.py
│   ├── scan_result.py
│   ├── vulnerability.py
│   ├── exploit_result.py
│   └── session.py
│
├── tests/
│   ├── conftest.py
│   ├── test_models.py
│   ├── test_llm_client.py
│   ├── test_nmap_tool.py
│   ├── test_searchsploit_tool.py
│   ├── test_metasploit_tool.py
│   ├── test_safety.py
│   ├── test_memory.py
│   ├── test_agent.py
│   ├── test_prompts.py
│   ├── test_database.py
│   ├── test_reporting.py
│   ├── test_tool_registry.py    # NEW
│   └── defense/
│       ├── test_sniffer.py
│       ├── test_detectors.py
│       ├── test_analyzer.py
│       ├── test_llm_defender.py
│       └── test_responder.py
│
└── docs/
    ├── 01_XBOW_COMPARISON.md
    ├── 02_ARCHITECTURE.md       ← THIS FILE
    ├── 03_PREREQUISITES.md
    ├── 04_ROADMAP.md
    ├── 05_SAFETY_AND_LEGAL.md
    ├── 06_LEARNING_CURRICULUM.md
    ├── 07_NETWORK_DEFENSE_MODULE.md
    ├── 08_MASTER_CHECKLIST.md
    └── 09_PLUGIN_SYSTEM.md      ← NEW
```

---

## Architecture Decisions and Rationale

| Decision                                          | Rationale                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Design plugin system now, no plugins in V1        | XSS plugin can be added in V2 without touching core code                    |
| No ShellTool                                      | Security risk too high, cannot be audited                                   |
| Ollama local over OpenRouter local                | Speed: 200ms vs 2s. Ideal for parsing/classification                        |
| importlib plugin loading                          | stdlib, no extra dependencies, secure                                       |
| Defense as separate process                       | Stopping the pentest bot should not affect the defense module               |
| SQLite (aiosqlite)                                | Zero setup, sufficient for capstone, migrate to PostgreSQL in V3            |
| Single agent (V1)                                 | Easier to understand, every decision is traceable, multi-agent deferred to V3 |
