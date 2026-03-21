# AEGIS — Plugin System

> **Purpose:** Add new attack capabilities without touching the core.
> V1 ships with 3 built-in tools. Everything else arrives as plugins.
> Three plugin types: Python class, CLI wrapper, API wrapper.

---

## Why a Plugin System?

| Approach | Problem |
|----------|---------|
| Embedding tools into core | Adding ffuf means touching nmap code — risk of breakage |
| Rewriting everything | Updating Metasploit affects the entire system |
| **Plugin system** | Write a tool → drop it in `/plugins/` → it's available to agents |

---

## Core Tools vs Plugin Tools

| Category | Examples | Location |
|---|---|---|
| **Core Tools** (V1 built-in) | Nmap, SearchSploit, Metasploit | `tools/` |
| **Plugin Tools** (V2+) | ffuf, nuclei, sqlmap, crackmapexec, theHarvester... | `plugins/<name>/` |

**Rule:** A tool that is self-contained and required for basic operation → `tools/` (core).
A tool that has external dependencies, is optional, or targets a specific domain → `plugins/`.

---

## Plugin Anatomy

```
plugins/
└── ffuf/                   ← Plugin directory name (lowercase, underscore)
    ├── plugin.json         ← Manifest (REQUIRED)
    ├── tool.py             ← Python implementation (only for python_class type)
    ├── requirements.txt    ← Plugin-specific Python deps (optional)
    └── README.md           ← Usage guide (recommended)
```

---

## Three Plugin Types

| `"type"` | Use Case | `tool.py` Needed |
|---|---|---|
| `python_class` | Complex logic, stateful tools, custom parsers | Yes |
| `cli_wrapper` | Any CLI binary with parseable output | No — JSON config only |
| `api_wrapper` | REST API endpoints with authentication | No — JSON config only |

If `"type"` is omitted, `"python_class"` is assumed (backward compatible with V1 plugins).

---

## Type A — `python_class`

Write a Python class inheriting `BaseTool`.

**`plugin.json`:**
```json
{
  "name": "linpeas",
  "type": "python_class",
  "version": "1.0.0",
  "display_name": "LinPEAS",
  "description": "Upload and run LinPEAS on target via Shell Manager for privilege escalation enumeration.",
  "author": "aegis",
  "category": "post-exploit",
  "enabled": true,
  "entry_point": "plugins.linpeas.tool",
  "class_name": "LinPEASTool",
  "min_core_version": "2.0.0",
  "safety_level": "high",
  "target_type": "session"
}
```

**`tool.py` template:**
```python
from tools.base_tool import BaseTool, ToolMetadata

class LinPEASTool(BaseTool):
    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="run_linpeas",
            description=(
                "Upload LinPEAS to target and execute it to enumerate "
                "privilege escalation vectors. Requires an active session_id."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "Shell Manager session ID"
                    }
                },
                "required": ["session_id"]
            },
            category="post-exploit",
            version="1.0.0"
        )

    async def execute(self, params: dict) -> dict:
        session_id = params["session_id"]
        shell_manager = params.get("_shell_manager")  # injected at runtime

        try:
            # Upload script
            await shell_manager.upload_file(
                session_id,
                "tools/scripts/linpeas.sh",
                "/tmp/linpeas.sh"
            )
            await shell_manager.execute(session_id, "chmod +x /tmp/linpeas.sh")

            # Run with timeout
            result = await shell_manager.execute(
                session_id,
                "bash /tmp/linpeas.sh 2>/dev/null",
                timeout=300.0
            )

            # Cleanup
            await shell_manager.execute(session_id, "rm -f /tmp/linpeas.sh")

            findings = self._parse_output(result.output)
            return {"success": True, "output": findings, "raw": result.output}

        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}

    async def health_check(self):
        from pathlib import Path
        from tools.base_tool import ToolHealthStatus
        script = Path("tools/scripts/linpeas.sh")
        return ToolHealthStatus(
            available=script.exists(),
            message="linpeas.sh found" if script.exists() else "linpeas.sh not found",
            install_hint="Download from: https://github.com/carlospolop/PEASS-ng"
        )

    def _parse_output(self, output: str) -> dict:
        # Extract key findings from LinPEAS output
        ...
```

---

## Type B — `cli_wrapper`

Wrap any CLI binary entirely in `plugin.json`. No `tool.py` needed.
`ToolRegistry` auto-generates a `GenericCLITool` instance.

**`plugin.json`:**
```json
{
  "name": "ffuf",
  "type": "cli_wrapper",
  "version": "1.0.0",
  "display_name": "ffuf Web Fuzzer",
  "description": "Fast web fuzzer for directory, file, and vhost discovery. Use after identifying HTTP services.",
  "category": "web",
  "enabled": true,
  "binary": "ffuf",
  "install_hint": "go install github.com/ffuf/ffuf/v2@latest",
  "args_template": [
    "-u", "{url}/FUZZ",
    "-w", "{wordlist}",
    "-o", "{output_file}",
    "-of", "json",
    "-mc", "{status_codes}",
    "-t", "{threads}",
    "-silent"
  ],
  "output_format": "json",
  "timeout_seconds": 300,
  "parameters": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "Target base URL (e.g. http://target.com)"
      },
      "wordlist": {
        "type": "string",
        "default": "/usr/share/seclists/Discovery/Web-Content/common.txt",
        "description": "Path to wordlist file"
      },
      "status_codes": {
        "type": "string",
        "default": "200,201,301,302,401,403",
        "description": "HTTP status codes to match"
      },
      "threads": {
        "type": "integer",
        "default": 40,
        "description": "Number of concurrent threads"
      }
    },
    "required": ["url"]
  }
}
```

**`args_template` substitution rules:**
- `{param_name}` → replaced with LLM-supplied parameter value
- Parameters not supplied use JSON Schema `default` value
- Missing required parameters → validation error before subprocess starts
- `{output_file}` → auto-generated temp file; content read back after execution

**`output_format` options:**
- `"json"` — parse as JSON object
- `"jsonlines"` — parse as newline-delimited JSON
- `"text"` — return raw stdout string
- `"csv"` — parse as CSV

---

## Type C — `api_wrapper`

Call a REST API entirely through `plugin.json`. No `tool.py` needed.
`ToolRegistry` generates a `GenericAPITool` instance.

**`plugin.json`:**
```json
{
  "name": "shodan_search",
  "type": "api_wrapper",
  "version": "1.0.0",
  "display_name": "Shodan Lookup",
  "description": "Query Shodan for a target IP to retrieve known open ports, services, and CVEs without active scanning. Requires SHODAN_API_KEY.",
  "category": "osint",
  "enabled": false,
  "base_url": "https://api.shodan.io",
  "auth_type": "query_param",
  "auth_param_name": "key",
  "auth_env": "SHODAN_API_KEY",
  "auth_secure_store_key": "shodan_api_key",
  "endpoints": {
    "host_lookup": {
      "method": "GET",
      "path": "/shodan/host/{ip}"
    },
    "search": {
      "method": "GET",
      "path": "/shodan/host/search",
      "params": {"query": "{query}", "facets": "port,country"}
    }
  },
  "timeout_seconds": 15,
  "parameters": {
    "type": "object",
    "properties": {
      "ip": {
        "type": "string",
        "description": "IPv4 address to look up"
      },
      "query": {
        "type": "string",
        "description": "Shodan search query (alternative to direct IP lookup)"
      }
    }
  }
}
```

**Authentication resolution order:**
1. Environment variable named by `auth_env` (`SHODAN_API_KEY`)
2. `SecureStore` (OS keychain) key named by `auth_secure_store_key`
3. Database `app_settings` table
4. Not found → `health_check()` returns `available=False`, UI shows: "API key not configured. Set SHODAN_API_KEY."

**Note:** `health_check()` for `api_wrapper` only checks credential presence — no live API call is made.

---

## `plugin.json` Full Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique identifier (matches directory name) |
| `type` | enum | No | `"python_class"` (default) \| `"cli_wrapper"` \| `"api_wrapper"` |
| `version` | semver | Yes | Plugin version |
| `display_name` | string | Yes | Human-readable name shown in UI |
| `description` | string | Yes | LLM reads this to decide when to use the tool |
| `author` | string | No | Author name |
| `category` | enum | Yes | `"recon"` \| `"osint"` \| `"web"` \| `"exploit"` \| `"post-exploit"` \| `"lateral"` \| `"pivot"` \| `"brute-force"` \| `"cracking"` |
| `enabled` | bool | Yes | `false` → not loaded; `true` → loaded at startup |
| `entry_point` | string | python_class only | Python module path |
| `class_name` | string | python_class only | Class name in module |
| `binary` | string | cli_wrapper only | Executable name (verified via `shutil.which`) |
| `install_hint` | string | No | Shown in UI when binary/key missing |
| `args_template` | list | cli_wrapper only | CLI argument list with `{param}` placeholders |
| `output_format` | enum | cli_wrapper | `"json"` \| `"jsonlines"` \| `"text"` \| `"csv"` |
| `base_url` | string | api_wrapper only | API base URL |
| `auth_env` | string | api_wrapper | Environment variable name for API key |
| `requires_packages` | list | No | pip dependencies for this plugin |
| `min_core_version` | semver | No | Minimum AEGIS core version required |
| `safety_level` | enum | No | `"low"` \| `"medium"` \| `"high"` — shown in UI |
| `target_type` | enum | No | `"ip"` \| `"url"` \| `"session"` \| `"domain"` \| `"any"` |
| `timeout_seconds` | int | No | Process/request timeout |
| `parameters` | JSON Schema | Yes | LLM uses this to generate tool parameters |

---

## Tool Registry Flow

```
At startup:
  1. ToolRegistry initialized
  2. Core tools registered: NmapTool, SearchSploitTool, MetasploitTool
  3. /plugins/ directory scanned
  4. Each plugin.json read
  5. Enabled plugins dispatched by type:
       python_class → importlib.import_module(entry_point).ClassName()
       cli_wrapper  → GenericCLITool(plugin_config)
       api_wrapper  → GenericAPITool(plugin_config)
  6. Tool registered in registry

Per-mission:
  7. ToolRegistry.run_health_checks()
       → Each tool reports available/degraded/unavailable
       → Unavailable tools excluded from agent prompts
       → Install hints available via GET /api/v1/tools/status
  8. Brain assigns tool subset to each agent
  9. Agent provides its tool list to LLM
  10. LLM calls tools by name
  11. Tool fetched from registry, executed through SafetyGuard
```

---

## Tool Health Check System

Every tool implements `health_check()` returning a `ToolHealthStatus`:

```python
class ToolHealthStatus(BaseModel):
    available: bool           # True = tool can be used
    degraded: bool = False    # True = works but at reduced capability
    message: str              # e.g. "nmap 7.94 found"
    install_hint: str | None  # e.g. "sudo apt install nmap"
    fallback_active: bool = False
```

**Examples:**

| Tool | Check | Degraded Condition |
|---|---|---|
| `NmapTool` | `shutil.which("nmap")` + version | Present but no sudo → OS scan limited |
| `SearchSploitTool` | `shutil.which("searchsploit")` | Not found |
| `MetasploitTool` | Try RPC connect → try `msfconsole` | CLI mode only (no session management) |
| `ffuf` (cli_wrapper) | `shutil.which("ffuf")` | Not found |
| `shodan_search` (api_wrapper) | Check `SHODAN_API_KEY` env var | Key not configured |
| `linpeas` (python_class) | Check linpeas.sh exists locally | Script not downloaded |

---

## Enabling / Disabling Plugins

```bash
# Method 1: Edit plugin.json directly
# plugins/ffuf/plugin.json → "enabled": true

# Method 2: Web UI
# Settings → Plugins → ffuf → Enable toggle

# Method 3: API (future)
# POST /api/v1/plugins/ffuf/enable
```

---

## Plugin Authoring Guidelines

### Do

- Set `"type"` explicitly
- Write a detailed `description` — the LLM reads this to decide when to use the tool
- Always return `{"success": bool, "output": any, "error": str|None}`
- Catch all exceptions inside `execute()`; never let them propagate
- Implement `health_check()` with a useful `install_hint`
- For `cli_wrapper`: write the `install_hint` and test the `args_template`
- For `api_wrapper`: specify `auth_env` so users know what env var to set

### Don't

- Touch `core/`, `tools/`, `database/` — plugins must not modify core files
- Hold global mutable state across calls (keep `execute()` stateless)
- Import `config.py` directly — receive settings through constructor or params
- Run commands that SafetyGuard blocks — they will always be blocked

---

## Current Plugin Status

### V1 — Core Tools (built-in, always available)

| Tool | File | Category |
|---|---|---|
| `nmap_scan` | `tools/nmap_tool.py` | recon |
| `searchsploit_search` | `tools/searchsploit_tool.py` | exploit-search |
| `metasploit_run` | `tools/metasploit_tool.py` | exploit-exec |

### V2 — Plugins (implement in priority order)

**Priority 1 — Core new tools:**

| Plugin | Type | Binary / Dep | Category |
|---|---|---|---|
| `masscan` | cli_wrapper | `masscan` | recon |
| `nuclei` | cli_wrapper | `nuclei` | vuln-scan |
| `ffuf` | cli_wrapper | `ffuf` | web |
| `sqlmap` | cli_wrapper | `sqlmap` | exploit |
| `nikto` | cli_wrapper | `nikto` | web |
| `whatweb` | cli_wrapper | `whatweb` | web |
| `linpeas` | python_class | linpeas.sh | post-exploit |
| `winpeas` | python_class | winpeas.exe | post-exploit |

**Priority 2 — OSINT:**

| Plugin | Type | Binary / Dep | Category |
|---|---|---|---|
| `theharvester` | cli_wrapper | `theHarvester` | osint |
| `subfinder` | cli_wrapper | `subfinder` | osint |
| `amass` | cli_wrapper | `amass` | osint |
| `whois_lookup` | python_class | `python-whois` | osint |
| `dns_lookup` | python_class | `dnspython` | osint |
| `wpscan` | cli_wrapper | `wpscan` | web |
| `dirsearch` | cli_wrapper | `dirsearch` | web |

**Priority 3 — Post-exploit / Lateral:**

| Plugin | Type | Binary / Dep | Category |
|---|---|---|---|
| `crackmapexec` | cli_wrapper | `nxc` / `cme` | lateral |
| `impacket_psexec` | python_class | `impacket` | lateral |
| `impacket_secretsdump` | python_class | `impacket` | post-exploit |
| `hydra` | cli_wrapper | `hydra` | brute-force |
| `hashcat` | cli_wrapper | `hashcat` | cracking |
| `ligolo` | python_class | `ligolo-ng` | pivot |
| `chisel` | cli_wrapper | `chisel` | pivot |

**Priority 4 — Optional paid API:**

| Plugin | Type | Requires | Category |
|---|---|---|---|
| `shodan_search` | api_wrapper | `SHODAN_API_KEY` | osint |
| `censys_search` | api_wrapper | `CENSYS_API_KEY` | osint |
