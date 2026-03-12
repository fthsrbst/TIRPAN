# AEGIS — V2 Feature Specification

> **Status:** Design phase (post-V1 capstone)
> **Target Release:** V2.0
> **Document Version:** 1.1 — March 2026

This document defines the complete technical specification for all V2 features. Each section maps directly to a discrete implementation unit. V1 provides the stable foundation; every feature described here extends the existing architecture without breaking backward compatibility.

---

## Table of Contents

1. [Tool Health Check System](#1-tool-health-check-system)
2. [Mission Brief — Advanced Target Configuration](#2-mission-brief--advanced-target-configuration)
3. [Web Recon Layer](#3-web-recon-layer)
4. [Attack Phase Expansion](#4-attack-phase-expansion)
5. [Plugin Architecture v2 — Three Plugin Types](#5-plugin-architecture-v2--three-plugin-types)
6. [Finding & Proof Collection System](#6-finding--proof-collection-system)
7. [Speed Profiles](#7-speed-profiles)
8. [Self-Correction](#8-self-correction)
9. [SARIF Output](#9-sarif-output)
10. [Network Proxying](#10-network-proxying)
11. [Vector Search / RAG Knowledge Base](#11-vector-search--rag-knowledge-base)

---

## 1. Tool Health Check System

### Problem

In V1, tools are registered at startup without verifying whether their underlying binaries or services are actually available. The first time the agent tries to use nmap, searchsploit, or the Metasploit RPC daemon, it may fail mid-run. The LLM receives a tool error and either retries futilely or produces a degraded result. The user sees a cryptic connection error with no actionable guidance.

### Design

#### 1.1 `health_check()` on `BaseTool`

Add an optional async method to `tools/base_tool.py`:

```python
class ToolHealthStatus:
    available: bool           # True = tool can be used
    degraded: bool            # True = tool works but at reduced capability
    message: str              # Human-readable status, e.g. "nmap v7.94 found"
    install_hint: str | None  # e.g. "sudo apt install nmap"
    fallback_active: bool     # True = operating in fallback mode

class BaseTool(ABC):
    async def health_check(self) -> ToolHealthStatus:
        """
        Default: always returns available=True.
        Override in each tool to perform real checks.
        """
        return ToolHealthStatus(available=True, degraded=False, message="OK")
```

**Tool-specific implementations:**

| Tool              | Check                                                             | Degraded Condition                    |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `NmapTool`        | `shutil.which("nmap")` + `nmap --version`                        | Present but no sudo → OS scan limited |
| `SearchSploitTool`| `shutil.which("searchsploit")`                                   | Not found                             |
| `MetasploitTool`  | Try RPC connect → if fails, try `shutil.which("msfconsole")`     | Only CLI mode (no session management) |

**Install hints** are tool-specific and platform-aware:

```python
# NmapTool.health_check()
if sys.platform == "linux":
    hint = "sudo apt install nmap   # Debian/Ubuntu/Kali"
elif sys.platform == "darwin":
    hint = "brew install nmap"
else:
    hint = "https://nmap.org/download.html"
```

#### 1.2 `ToolRegistry` Health Gate

`core/tool_registry.py` gains two new methods:

```python
async def run_health_checks(self) -> dict[str, ToolHealthStatus]:
    """Run health_check() on all registered tools. Called at agent startup."""

def list_for_llm(self, healthy_only: bool = True) -> list[dict]:
    """
    Returns tool metadata for the LLM prompt.
    When healthy_only=True (default), tools with available=False are excluded.
    The LLM never generates actions for unavailable tools.
    """
```

The agent calls `run_health_checks()` once per session start, before the first ReAct iteration. Results are stored in registry state and re-checked if a tool error occurs mid-run.

#### 1.3 REST Endpoint

`web/routes.py` gains:

```
GET /api/v1/tools/status
```

**Response:**

```json
{
  "tools": [
    {
      "name": "nmap_scan",
      "available": true,
      "degraded": false,
      "message": "nmap 7.94 — sudo available",
      "fallback_active": false,
      "install_hint": null
    },
    {
      "name": "searchsploit_search",
      "available": false,
      "degraded": false,
      "message": "searchsploit binary not found",
      "fallback_active": false,
      "install_hint": "sudo apt install exploitdb"
    },
    {
      "name": "metasploit_run",
      "available": true,
      "degraded": true,
      "message": "RPC unavailable — msfconsole fallback active",
      "fallback_active": true,
      "install_hint": "msfrpcd -P your_pass -S -a 127.0.0.1 -p 55553"
    }
  ]
}
```

#### 1.4 Web UI Integration

- On session creation, the UI calls `/api/v1/tools/status` and renders a tool status strip above the terminal.
- Green badge = available, yellow badge = degraded/fallback, red badge = unavailable.
- Red badge is clickable and expands an install hint panel.
- WebSocket event type `tool_warning` is added to `web/websocket_handler.py` for mid-run degradation events.

#### 1.5 Graceful Degradation Behaviour

```
Tool state          | Agent behaviour
--------------------|------------------------------------------------------------
available=True      | Tool offered to LLM as normal
degraded=True       | Tool offered to LLM; degradation note appended to description
available=False     | Tool excluded from LLM prompt; agent continues without it
```

When a critical tool (nmap) is unavailable and the agent cannot proceed, it emits a `session_blocked` event with the install hint embedded in the message.

---

## 2. Mission Brief — Advanced Target Configuration

### Problem

V1 `AgentContext` (`core/agent.py`) only holds `target`, `mode`, and a free-text `notes` field. The agent always starts with a ping scan regardless of what the operator already knows. There is no way to declare scope boundaries, pre-known technology stack, stealth requirements, or which post-exploitation actions are permitted.

### Design

#### 2.1 `MissionBrief` Model

New file: `models/mission.py`

```python
@dataclass
class MissionBrief:
    # Target identification
    target_type: str = "auto"
    # "ip" | "cidr" | "domain" | "webapp" | "auto"
    # "auto" = agent infers from input format

    # Operator-supplied intelligence (optional)
    known_tech: list[str] = field(default_factory=list)
    # e.g. ["nginx/1.24", "php/8.1", "wordpress/6.4"]
    # Injected into prompt to skip redundant discovery steps

    credentials: dict[str, str] = field(default_factory=dict)
    # e.g. {"ssh_user": "admin", "http_password": "p@ss"}
    # Stored in SecureStore; never logged

    scope_notes: str = ""
    # Free-text operator guidance: "Only 80/443. Do not pivot to 10.0.0.0/8."
    # Injected verbatim into every LLM prompt as a constraint block

    # Permission flags (all False by default — operator must opt in)
    allow_exploitation: bool = False
    allow_post_exploitation: bool = False
    allow_lateral_movement: bool = False
    allow_docker_escape: bool = False
    allow_browser_recon: bool = False

    # Excluded targets (CIDR or IP list the agent must never touch)
    excluded_targets: list[str] = field(default_factory=list)
```

#### 2.2 `AgentContext` Extension

`AgentContext` in `core/agent.py` gains a `mission` field:

```python
@dataclass
class AgentContext:
    target: str
    mode: str
    mission: MissionBrief = field(default_factory=MissionBrief)
    # ... existing fields unchanged
```

`PromptBuilder` (`core/prompts.py`) renders `mission` as a dedicated `## Mission Constraints` block in every system prompt. If the operator leaves `MissionBrief` at defaults, the agent infers appropriate behaviour from findings.

#### 2.3 `Session` Model Extension

`models/session.py` `Session` adds:

```python
target_type: str = "auto"
speed_profile: str = "normal"   # "stealth" | "normal" | "aggressive"
scope_notes: str = ""
allow_exploitation: bool = False
allow_post_exploitation: bool = False
allow_lateral_movement: bool = False
allow_docker_escape: bool = False
```

`database/schema.sql` `pentest_sessions` table gains corresponding columns.

#### 2.4 Session Creation API

`POST /api/v1/sessions` request body is extended:

```json
{
  "target": "10.0.0.50",
  "mode": "full_auto",
  "target_type": "webapp",
  "speed_profile": "stealth",
  "scope_notes": "Production system. Only ports 80 and 443. No exploitation.",
  "known_tech": ["apache/2.4", "php/8.1"],
  "allow_exploitation": false,
  "allow_lateral_movement": false,
  "excluded_targets": ["10.0.0.1", "10.0.0.254"]
}
```

All new fields are optional. When omitted, the agent operates with safe defaults (no exploitation, no lateral movement, `speed_profile=normal`).

#### 2.5 Inference Behaviour

If `target_type` is `"auto"`, the agent applies these rules before the first iteration:

| Input pattern             | Inferred `target_type` |
| ------------------------- | ---------------------- |
| Valid IPv4 / IPv6         | `"ip"`                 |
| CIDR notation             | `"cidr"`               |
| Starts with `http(s)://`  | `"webapp"`             |
| Hostname without protocol | `"domain"`             |

The inferred type determines which tools the agent prioritises in the first iteration (e.g., `webapp` → `web_recon` before nmap; `ip` → nmap ping first).

---

## 3. Web Recon Layer

### Problem

V1 treats all targets as raw IP addresses and immediately runs nmap. When the target is a web application, significant intelligence is discarded: HTTP headers, page source, JavaScript endpoints, technology fingerprints, and sitemap structure are all ignored.

### Design

#### 3.1 New Core Tool: `WebReconTool`

File: `tools/web_recon_tool.py`

**Actions:**

| `action`          | What it does                                                           | External dependency |
| ----------------- | ---------------------------------------------------------------------- | ------------------- |
| `headers`         | HTTP HEAD/GET → parse response headers                                 | `httpx` (already in requirements) |
| `fingerprint`     | Match headers + favicon hash + HTML patterns to known tech signatures  | Built-in pattern DB |
| `source_scan`     | Download HTML + linked JS files, extract endpoints, API keys, comments | `httpx` + regex     |
| `sitemap`         | Fetch `robots.txt`, `sitemap.xml`, `/.well-known/`                     | `httpx`             |
| `browser`         | Playwright headless Chromium: screenshot + DOM + network traffic log   | `playwright`        |

The `browser` action is only available when `mission.allow_browser_recon = True` and Playwright is installed. `health_check()` reports degraded (not unavailable) if Playwright is absent — the other actions still work.

**Return structure:**

```python
{
  "success": True,
  "output": {
    "url": "https://target.com",
    "status_code": 200,
    "server": "nginx/1.24.0",
    "tech_stack": ["nginx", "php/8.1", "wordpress/6.4"],
    "interesting_headers": {
      "X-Powered-By": "PHP/8.1.2",
      "X-Generator": "WordPress 6.4"
    },
    "endpoints_found": ["/wp-admin", "/wp-login.php", "/api/v1/"],
    "secrets_found": [],          # e.g. hardcoded API tokens in JS
    "robots_disallowed": ["/admin", "/backup"],
    "screenshot_path": "data/screenshots/session_id_001.png",  # browser mode only
    "raw_headers": {...}
  },
  "error": None
}
```

#### 3.2 Tech Stack Fingerprint Database

Built-in pattern file: `data/tech_fingerprints.json`

Structure (subset):

```json
{
  "wordpress": {
    "headers": ["X-Pingback"],
    "html_patterns": ["wp-content/", "wp-includes/"],
    "favicon_hash": "d41d8cd9"
  },
  "nginx": {
    "headers_contains": {"Server": "nginx"}
  },
  "php": {
    "headers_contains": {"X-Powered-By": "PHP"}
  }
}
```

Matched tech stack items are stored in `AgentContext` and fed directly into the SearchSploit query in the `EXPLOIT_SEARCH` phase.

#### 3.3 Phase Integration

When `mission.target_type` is `"webapp"` or `"domain"`, `WEB_RECON` is the second phase (after initial `DISCOVERY`):

```
DISCOVERY → WEB_RECON → PORT_SCAN → ...
```

In `WEB_RECON`, the agent:
1. Calls `web_recon` with `action="headers"` and `action="fingerprint"`
2. Populates `AgentContext.known_tech` with detected stack
3. Calls `web_recon` with `action="source_scan"` to find endpoints
4. If `allow_browser_recon=True`: calls `action="browser"` for screenshot + DOM

---

## 4. Attack Phase Expansion

### Problem

V1 `attack_phase` has five states: `DISCOVERY → PORT_SCAN → EXPLOIT_SEARCH → EXPLOITATION → DONE`. There is no post-exploitation, no lateral movement, and no structured reporting phase.

### Design

#### 4.1 Complete Phase FSM

```
DISCOVERY
    │ live hosts found
    ▼
WEB_RECON  ──────────────────────────────────── (only if target_type is webapp/domain)
    │ tech stack identified
    ▼
PORT_SCAN
    │ open ports found
    ▼
VULN_SCAN  ──────────────────────────────────── (V2: Nuclei plugin, if registered)
    │
    ▼
EXPLOIT_SEARCH
    │ exploits found
    ▼
EXPLOITATION  ──────────────────────────────── (only if allow_exploitation=True)
    │ session opened
    ▼
POST_EXPLOITATION  ─────────────────────────── (only if allow_post_exploitation=True)
    │ uid, hostname, network interfaces collected
    ▼
LATERAL_MOVEMENT  ──────────────────────────── (only if allow_lateral_movement=True)
    │ pivot targets identified, re-enters DISCOVERY with new targets
    ▼
PRIVILEGE_ESCALATION  ──────────────────────── (only if shell session exists)
    │
    ▼
DOCKER_ESCAPE  ──────────────────────────────── (only if allow_docker_escape=True + in container)
    │
    ▼
REPORTING
    │
    ▼
DONE
```

**Phase guard table** — phases that must be explicitly permitted:

| Phase                  | Guard flag                        | Skipped if flag=False          |
| ---------------------- | --------------------------------- | ------------------------------ |
| `EXPLOITATION`         | `allow_exploitation`              | → jumps to `REPORTING`         |
| `POST_EXPLOITATION`    | `allow_post_exploitation`         | → jumps to `REPORTING`         |
| `LATERAL_MOVEMENT`     | `allow_lateral_movement`          | → jumps to `REPORTING`         |
| `DOCKER_ESCAPE`        | `allow_docker_escape`             | → skipped silently             |
| `PRIVILEGE_ESCALATION` | `allow_post_exploitation`         | → skipped silently             |

Phase guard logic lives in `core/agent.py` → `_advance_phase()`. The safety guard (`core/safety.py`) has a complementary hard-block: it rejects any action whose category is `"post_exploit"` or `"lateral"` when the corresponding flag is False, regardless of what the LLM requested.

#### 4.2 Post-Exploitation Phase (New)

When a Metasploit session is opened and `allow_post_exploitation=True`, the agent enters `POST_EXPLOITATION`. In this phase the LLM is guided to run information-gathering commands through the session:

- `whoami` / `id` → privilege level
- `hostname`, `uname -a` → OS details
- `ip addr` / `ifconfig` → network interfaces (feeds lateral movement)
- `cat /etc/passwd`, `cat /etc/shadow` → credential files (if privileged)
- `docker ps`, `cat /.dockerenv` → container detection (feeds docker escape decision)

All output is saved as `Finding` records (see Section 6) with full command evidence.

#### 4.3 Lateral Movement Phase (New)

Requires `allow_lateral_movement=True`. The agent collects internal IP ranges discovered during post-exploitation and re-enters a new `DISCOVERY` sub-cycle for those networks. `excluded_targets` from `MissionBrief` are strictly honoured.

The agent maintains a `lateral_targets: list[str]` and `lateral_visited: set[str]` in `AgentContext` to prevent infinite loops.

#### 4.4 `REPORTING` Phase

The final structured phase before `DONE`. The agent:
1. Calls `report_generator.py` with all collected `Finding` objects
2. Groups findings by severity (CRITICAL → INFO)
3. Generates reproduction steps for each finding from recorded commands
4. Produces the HTML/PDF report with proof screenshots embedded

---

## 5. Plugin Architecture v2 — Three Plugin Types

### Problem

V1 supports only one plugin type (Python class in `tool.py`). Adding a CLI tool like `nuclei` requires writing boilerplate async subprocess code. Adding a web API (Shodan, VirusTotal) requires writing HTTP client code. Both are repetitive and error-prone.

### Design: Three Plugin Types

The `plugin.json` gains a `"type"` field:

| `type`          | Use case                                   | Python code required |
| --------------- | ------------------------------------------ | -------------------- |
| `python_class`  | Complex logic, custom parsing (existing)   | Yes — `tool.py`      |
| `cli_wrapper`   | Any CLI binary with structured output      | No                   |
| `api_wrapper`   | REST API with authentication               | No                   |

---

### 5.1 Type A — `python_class` (Unchanged from V1)

The existing system. `plugin.json` points to a `tool.py` that implements `BaseTool`. No changes needed.

---

### 5.2 Type B — `cli_wrapper`

For wrapping any CLI binary. `ToolRegistry` auto-generates a `GenericCLITool` instance — no Python tool code required.

**`plugin.json` schema for `cli_wrapper`:**

```json
{
  "name": "nuclei_scan",
  "type": "cli_wrapper",
  "version": "1.0.0",
  "display_name": "Nuclei Scanner",
  "description": "Template-based vulnerability scanner. Best used after port scanning.",
  "category": "vuln-scan",
  "enabled": true,
  "binary": "nuclei",
  "install_hint": "go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest",
  "args_template": ["-u", "{target}", "-t", "{templates}", "-o", "{output_file}", "-json", "-silent"],
  "output_format": "jsonlines",
  "timeout_seconds": 300,
  "parameters": {
    "type": "object",
    "properties": {
      "target": {
        "type": "string",
        "description": "URL or IP to scan"
      },
      "templates": {
        "type": "string",
        "default": "cves/",
        "description": "Nuclei template path or category"
      }
    },
    "required": ["target"]
  }
}
```

**`args_template` substitution rules:**

- `{param_name}` → replaced with the value from the LLM-supplied parameters
- `{output_file}` → auto-generated temp file path; content is read back after execution
- Parameters not supplied by the LLM use their `default` value
- Missing required parameters → validation error before execution

**`output_format` options:**

| Format       | How it is parsed                                           |
| ------------ | ---------------------------------------------------------- |
| `jsonlines`  | Each line parsed as a JSON object; returned as a list      |
| `json`       | Single JSON object parsed                                  |
| `text`       | Raw stdout returned as a string                            |
| `csv`        | Parsed into list of dicts using first line as headers      |

**`health_check()` for `cli_wrapper`:** calls `shutil.which(binary)`. Returns install hint from `plugin.json` if not found.

---

### 5.3 Type C — `api_wrapper`

For calling REST APIs. `ToolRegistry` auto-generates a `GenericAPITool` instance.

**`plugin.json` schema for `api_wrapper`:**

```json
{
  "name": "shodan_lookup",
  "type": "api_wrapper",
  "version": "1.0.0",
  "display_name": "Shodan Lookup",
  "description": "Query Shodan for a target IP to retrieve known open ports, services, and CVEs without active scanning.",
  "category": "recon",
  "enabled": true,
  "base_url": "https://api.shodan.io",
  "auth_type": "query_param",
  "auth_param_name": "key",
  "auth_env": "SHODAN_API_KEY",
  "auth_secure_store_key": "shodan_api_key",
  "endpoints": {
    "host_lookup": {
      "method": "GET",
      "path": "/shodan/host/{ip}",
      "response_field": null
    }
  },
  "timeout_seconds": 15,
  "parameters": {
    "type": "object",
    "properties": {
      "ip": {
        "type": "string",
        "description": "IPv4 address to look up"
      }
    },
    "required": ["ip"]
  }
}
```

**Authentication resolution order:**
1. Check `AEGIS_<AUTH_ENV>` environment variable
2. Check `SecureStore` (`core/secure_store.py`) for `auth_secure_store_key`
3. Check database `settings` table
4. If none found → `health_check()` returns `available=False`, message: "API key not configured"

**`health_check()` for `api_wrapper`:** verifies credential presence only (no actual API call to avoid billing).

---

### 5.4 `GenericCLITool` and `GenericAPITool` Loader

`core/tool_registry.py` `_load_single_plugin()` routes on `cfg["type"]`:

```python
match cfg.get("type", "python_class"):
    case "python_class":
        # existing importlib path
    case "cli_wrapper":
        from core.generic_tools import GenericCLITool
        tool_instance = GenericCLITool(cfg)
    case "api_wrapper":
        from core.generic_tools import GenericAPITool
        tool_instance = GenericAPITool(cfg)
    case _:
        logger.warning("Unknown plugin type '%s' in %s", cfg["type"], plugin_name)
        return
```

New file: `core/generic_tools.py` — implements `GenericCLITool(BaseTool)` and `GenericAPITool(BaseTool)`.

---

### 5.5 Planned V2 Plugin Catalogue

| Plugin                | Type           | Binary / API   | Category    |
| --------------------- | -------------- | -------------- | ----------- |
| `nuclei_scan`         | `cli_wrapper`  | `nuclei`       | vuln-scan   |
| `gobuster_scan`       | `cli_wrapper`  | `gobuster`     | recon       |
| `ffuf_fuzz`           | `cli_wrapper`  | `ffuf`         | recon       |
| `sqlmap_scan`         | `cli_wrapper`  | `sqlmap`       | exploit     |
| `nikto_scan`          | `cli_wrapper`  | `nikto`        | vuln-scan   |
| `hydra_brute`         | `cli_wrapper`  | `hydra`        | exploit     |
| `shodan_lookup`       | `api_wrapper`  | Shodan API     | recon       |
| `virustotal_lookup`   | `api_wrapper`  | VirusTotal API | recon       |
| `web_scanner`         | `python_class` | Playwright     | web         |
| `docker_escape`       | `python_class` | Built-in       | post-exploit|
| `lateral_pivot`       | `python_class` | Built-in       | post-exploit|

---

## 6. Finding & Proof Collection System

### Problem

V1 stores exploit results as plain strings in `exploit_results: list[str]` inside `AgentContext`. Vulnerabilities are stored in the `vulnerabilities` DB table but have no associated evidence, commands, or reproduction steps. The current `report.html` template cannot produce a credible penetration test report from this data.

### Design

#### 6.1 `Finding` Model

New file: `models/finding.py`

```python
from pydantic import BaseModel

class Finding(BaseModel):
    id: str                         # UUID
    session_id: str

    # Classification
    phase: str                      # Which attack phase produced this
    category: str                   # "network" | "web" | "credential" | "config" | "exploit"
    severity: str                   # "critical" | "high" | "medium" | "low" | "info"
    title: str                      # Short human-readable title
    description: str                # Detailed narrative

    # Target context
    target_host: str
    target_port: int | None = None
    target_url: str | None = None
    target_service: str | None = None

    # Evidence
    tool_name: str                  # Which tool produced this finding
    commands_run: list[str]         # Exact commands executed (for reproduction)
    raw_output: str                 # Full tool output (truncated if very large)
    screenshot_path: str | None     # Absolute path; None if no screenshot

    # Vulnerability metadata
    cve_id: str | None = None
    cvss_score: float = 0.0
    cwe_id: str | None = None

    # Reproduction
    reproduction_steps: list[str]   # Step-by-step narrative
    remediation: str = ""           # Suggested fix

    created_at: float
```

#### 6.2 Database Schema Addition

`database/schema.sql` gains a new table:

```sql
CREATE TABLE IF NOT EXISTS findings (
    id                  TEXT    PRIMARY KEY,
    session_id          TEXT    NOT NULL REFERENCES pentest_sessions(id) ON DELETE CASCADE,
    phase               TEXT    NOT NULL,
    category            TEXT    NOT NULL,
    severity            TEXT    NOT NULL,
    title               TEXT    NOT NULL,
    description         TEXT    NOT NULL DEFAULT '',
    target_host         TEXT    NOT NULL,
    target_port         INTEGER,
    target_url          TEXT,
    target_service      TEXT,
    tool_name           TEXT    NOT NULL,
    commands_run_json   TEXT    NOT NULL DEFAULT '[]',
    raw_output          TEXT    NOT NULL DEFAULT '',
    screenshot_path     TEXT,
    cve_id              TEXT,
    cvss_score          REAL    NOT NULL DEFAULT 0.0,
    cwe_id              TEXT,
    reproduction_steps_json TEXT NOT NULL DEFAULT '[]',
    remediation         TEXT    NOT NULL DEFAULT '',
    created_at          REAL    NOT NULL
);
```

#### 6.3 Finding Generation

Every tool `execute()` result that contains vulnerability or post-exploitation data triggers `_record_finding()` in `core/agent.py`. The agent extracts structured data from the tool output and constructs a `Finding` object.

`database/repositories.py` gains `FindingRepository` with `create()`, `get_by_session()`, `get_by_severity()`.

#### 6.4 Report Integration

`reporting/report_generator.py` switches from reading raw `vulnerabilities` and `exploit_results` to querying `FindingRepository.get_by_session()`. The `reporting/templates/report.html` Jinja2 template is updated to render each `Finding` with:

- Severity badge (colour-coded)
- Evidence block (commands run + raw output in a code block)
- Embedded screenshot (if present)
- Step-by-step reproduction section
- Remediation guidance

---

## 7. Speed Profiles

### Problem

V1 nmap runs with `-T4` hardcoded. There is no way to run stealthy scans without manually editing source code. On production systems, aggressive scanning can cause service disruption and trigger security monitoring.

### Design

#### 7.1 Profile Definitions

Three profiles, stored in `config.py` as a mapping:

```python
SPEED_PROFILES = {
    "stealth": SpeedProfile(
        nmap_timing="-T1",
        nmap_extra=["--scan-delay", "5s", "--max-retries", "1"],
        max_parallel_hosts=1,
        inter_request_delay_ms=2000,
        description="IDS-evasive. Very slow. Use for production systems."
    ),
    "normal": SpeedProfile(
        nmap_timing="-T3",
        nmap_extra=[],
        max_parallel_hosts=5,
        inter_request_delay_ms=200,
        description="Balanced. Default for most engagements."
    ),
    "aggressive": SpeedProfile(
        nmap_timing="-T5",
        nmap_extra=["--min-rate", "5000"],
        max_parallel_hosts=0,  # 0 = unlimited
        inter_request_delay_ms=0,
        description="Maximum speed. Use only on lab/CTF targets."
    ),
}
```

#### 7.2 `SpeedProfile` Dataclass

New addition to `config.py`:

```python
@dataclass
class SpeedProfile:
    nmap_timing: str                  # nmap -T flag
    nmap_extra: list[str]             # Additional nmap args
    max_parallel_hosts: int           # 0 = unlimited
    inter_request_delay_ms: int       # Delay between HTTP requests in web tools
    description: str
```

#### 7.3 Per-Tool Integration

Each tool reads `settings.speed_profile` (set from session `Session.speed_profile`) via the existing `AppConfig` settings object:

| Tool                | `stealth`                         | `normal`           | `aggressive`              |
| ------------------- | --------------------------------- | ------------------ | ------------------------- |
| `NmapTool`          | `-T1 --scan-delay 5s`             | `-T3`              | `-T5 --min-rate 5000`     |
| `WebReconTool`      | 2000ms delay between requests     | 200ms              | No delay                  |
| `SearchSploitTool`  | Unaffected (local DB query)        | Unaffected         | Unaffected                |
| `MetasploitTool`    | Longer exploit timeout (180s)     | 120s               | 90s                       |
| `cli_wrapper` tools | `inter_request_delay_ms` applied  | As configured      | No delay                  |

The `NmapTool._build_command()` method receives the profile from `AppConfig` and merges the timing flags into the command array.

#### 7.4 Session API

`speed_profile` is set at session creation time via the `POST /api/v1/sessions` body (see Section 2.4). It cannot be changed mid-session. If not specified, `"normal"` is used.

The Web UI session creation form exposes three buttons: **Stealth / Normal / Aggressive** with the profile descriptions shown as tooltip text.

---

---

## 8. Self-Correction

### Problem

When a tool fails or returns an empty/unproductive result in V1, the agent logs the failure and asks the LLM what to do next. The LLM may generate the same action again, leading to repeated identical failures. There is no explicit mechanism that forces the agent to pivot to an alternative approach.

### Design

#### 8.1 Reflection Step in the ReAct Loop

After `Observe()`, if `result["success"] == False` or the result is structurally empty (no hosts, no ports, no vulns depending on phase), the agent enters a `Reflect()` sub-step before the next `Reason()` call.

In `Reflect()`, the agent:
1. Records the failure in `AgentContext.failed_actions`: `{"tool": name, "params": params, "error": error, "iteration": n}`
2. Builds a **correction prompt** (separate, shorter prompt) that shows the LLM: what failed, why, what has already been tried, and asks for an alternative approach.
3. The LLM response is a directive (not a full JSON action): `{"pivot": "try nmap with scan_type=full instead of service"}` or `{"give_up": true, "reason": "..."}`.
4. The directive is injected as a constraint into the next `Reason()` call.

#### 8.2 Retry Budget

`AgentContext` gains:

```python
failed_actions: list[dict] = field(default_factory=list)
max_retries_per_tool: int = 3   # From AppConfig; default 3
```

If the same `(tool_name, target)` pair has failed `max_retries_per_tool` times, the tool is **soft-blocked** for the remainder of that phase: excluded from the LLM prompt for that phase only. This prevents infinite retry loops.

#### 8.3 `AgentContext` Changes

```python
@dataclass
class AgentContext:
    # ... existing fields ...
    failed_actions: list[dict] = field(default_factory=list)
    correction_directives: list[str] = field(default_factory=list)
```

`PromptBuilder` includes `correction_directives` (last 3 only) in the system prompt as a `## Do Not Repeat` constraint block.

---

## 9. SARIF Output

### Problem

V1 produces only HTML and PDF reports. These are human-readable but not machine-consumable. CI/CD pipelines, GitHub code scanning, and IDE integrations (VS Code, JetBrains) use SARIF (Static Analysis Results Interchange Format) v2.1.0 as the standard exchange format. Without SARIF output, AEGIS findings cannot be imported into these workflows.

### Design

#### 9.1 SARIF Serialiser

New file: `reporting/sarif_generator.py`

```python
def generate_sarif(session: Session, findings: list[Finding]) -> dict:
    """
    Produces a SARIF 2.1.0 JSON document from a completed session's findings.
    Returns a dict that can be written to <session_id>.sarif.json.
    """
```

**SARIF mapping from `Finding`:**

| SARIF field              | Source field                                      |
| ------------------------ | ------------------------------------------------- |
| `run.tool.driver.name`   | `"AEGIS"`                                         |
| `run.tool.driver.version`| App version from `config.py`                      |
| `result.ruleId`          | `finding.cve_id` or `finding.category + "/" + finding.title` |
| `result.level`           | Mapped from `finding.severity` (critical/error, high/error, medium/warning, low/note, info/none) |
| `result.message.text`    | `finding.description`                             |
| `result.locations[0].physicalLocation.artifactLocation.uri` | `finding.target_url` or `finding.target_host` |
| `result.fingerprints`    | SHA-256 of `(session_id + finding.title + target_host)` |
| `result.properties.reproduction` | `finding.reproduction_steps`              |

#### 9.2 Report Generator Integration

`reporting/report_generator.py` gains a `generate_sarif_file()` method alongside the existing `generate_html()` and `generate_pdf()`. All three are called at the `REPORTING` phase.

**Output path:** `reports/<session_id>.sarif.json`

#### 9.3 REST Endpoint

```
GET /api/v1/sessions/{session_id}/report/sarif
Content-Type: application/json
Content-Disposition: attachment; filename="<session_id>.sarif.json"
```

Added alongside the existing `/report/html` and `/report/pdf` endpoints in `web/routes.py`.

---

## 10. Network Proxying

### Problem

All web recon requests (HTTP headers, source scan, Playwright browser) are sent directly from the AEGIS process to the target. Security analysts who want to review or intercept these requests — for example to inspect what data the agent is sending, or to feed traffic through Burp Suite for deeper manual analysis — have no way to do so.

### Design

#### 10.1 `AppConfig` Proxy Settings

New settings group in `config.py`:

```python
@dataclass
class ProxyConfig:
    enabled: bool = False
    http_proxy: str = ""    # e.g. "http://127.0.0.1:8080"
    https_proxy: str = ""   # e.g. "http://127.0.0.1:8080"  (Burp uses same port)
    no_proxy: list[str] = field(default_factory=list)  # hosts to bypass
    verify_ssl: bool = True  # Set False when using Burp's self-signed cert
```

Environment variable: `AEGIS_HTTP_PROXY`, `AEGIS_HTTPS_PROXY`, `AEGIS_PROXY_NO_SSL_VERIFY`.

#### 10.2 `WebReconTool` Integration

`WebReconTool` constructs its `httpx.AsyncClient` with proxy settings:

```python
client = httpx.AsyncClient(
    proxies={
        "http://": settings.proxy.http_proxy or None,
        "https://": settings.proxy.https_proxy or None,
    },
    verify=settings.proxy.verify_ssl,
)
```

#### 10.3 Playwright Integration

When `proxy.enabled = True`, the Playwright browser context is launched with:

```python
browser = await playwright.chromium.launch()
ctx = await browser.new_context(
    proxy={"server": settings.proxy.https_proxy},
    ignore_https_errors=not settings.proxy.verify_ssl,
)
```

#### 10.4 Scope

Proxy applies **only to `WebReconTool`**. It does not affect:
- nmap (raw TCP — not HTTP)
- SearchSploit (local filesystem)
- Metasploit (its own network stack)
- LLM API calls (handled separately by `httpx` in `llm_client.py` — configurable independently)

#### 10.5 UI Configuration

Settings → Network → Proxy section in the Web UI. Toggle + two text fields (HTTP / HTTPS proxy URL) + SSL verification checkbox.

---

## 11. Vector Search / RAG Knowledge Base

### Problem

V1 `knowledge_base.py` uses exact-match SQL queries to look up past successful exploits: `SELECT * FROM knowledge_base WHERE service = ? AND version = ?`. If the service name differs slightly (e.g. `"OpenSSH"` vs `"openssh"`) or the version is close but not identical, no match is returned. The agent loses institutional memory from past sessions.

### Design

#### 11.1 Embedding Store

New file: `database/vector_store.py`

Storage backend: **SQLite with `sqlite-vec` extension** (zero additional infrastructure; pure Python install). Fallback for environments where `sqlite-vec` cannot be built: degrade to existing keyword search automatically.

```python
class VectorStore:
    async def upsert(self, id: str, text: str, metadata: dict) -> None:
        """Embed text and store vector + metadata."""

    async def search(self, query: str, top_k: int = 5) -> list[dict]:
        """Return top_k most semantically similar stored entries."""
```

#### 11.2 What Gets Embedded

| Source | Text embedded | Metadata stored |
| --- | --- | --- |
| Successful exploit in `knowledge_base` | `"{service} {version} {module} {payload}"` | `module`, `payload`, `session_id` |
| Each `Finding` (severity >= HIGH) | `finding.title + " " + finding.description` | `severity`, `cve_id`, `target_service` |
| Web recon tech stack detections | `"{url} runs {tech_stack}"` | `url`, `session_id` |

#### 11.3 Query Integration

In `EXPLOIT_SEARCH` phase, before calling `searchsploit_search`, the agent calls:

```python
rag_results = await vector_store.search(
    query=f"{service} {version} exploit",
    top_k=3
)
```

Results are prepended to the LLM prompt as a `## Historical Intelligence` block:

```
## Historical Intelligence (from past sessions)
- vsftpd 2.3.4 → exploit/unix/ftp/vsftpd_234_backdoor worked (1 session)
- OpenSSH 7.4 → CVE-2018-15473 (user enumeration) found (2 sessions)
```

This allows the LLM to prioritise proven exploit paths over generic searchsploit results.

#### 11.4 Embedding Model

Default: `nomic-embed-text` via Ollama (runs locally, 274MB, no API cost). Configurable via `AEGIS_EMBED_MODEL` env var. If Ollama is unavailable, falls back to a simple TF-IDF bag-of-words similarity function (no external dependency).

#### 11.5 `AppConfig` Addition

```python
@dataclass
class VectorConfig:
    enabled: bool = True
    embed_model: str = "nomic-embed-text"
    embed_provider: str = "ollama"   # "ollama" | "openai" | "tfidf_fallback"
    top_k: int = 5
```

---

## Implementation Order

All eleven features with dependency relationships:

```
1.  Health Check System      ← No dependencies. Implement first.
2.  Speed Profiles           ← No dependencies. Parallel with 1.
3.  Mission Brief            ← No dependencies. Enables 4, 5.
4.  Web Recon Layer          ← Depends on 3 (MissionBrief.target_type).
5.  Attack Phase Expansion   ← Depends on 3 (permit flags) and 4 (WEB_RECON phase).
6.  Finding System           ← Depends on 5 (phases produce findings).
7.  Plugin Architecture v2   ← Depends on 1 (health_check on GenericCLITool/APITool).
8.  Self-Correction          ← Depends on 5 (ReAct loop must have full phases first).
9.  SARIF Output             ← Depends on 6 (Finding model must exist).
10. Network Proxying         ← Depends on 4 (WebReconTool must exist).
11. Vector Search / RAG      ← Depends on 6 (Finding records to embed).
```

**Recommended sequence:**

| Sprint | Items                                                    |
| ------ | -------------------------------------------------------- |
| 1      | Feature 1 (Health Check) + Feature 2 (Speed Profiles)   |
| 2      | Feature 7 (Plugin Architecture)                          |
| 3      | Feature 3 (Mission Brief)                               |
| 4      | Feature 4 (Web Recon) + Feature 10 (Network Proxying)   |
| 5      | Feature 5 (Phase Expansion) + Feature 8 (Self-Correction)|
| 6      | Feature 6 (Finding System) + Feature 9 (SARIF)          |
| 7      | Feature 11 (RAG / Vector Search)                        |
