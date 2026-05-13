# TIRPAN — Plugin System

> **Purpose:** Add new attack capabilities without touching the core.
> Core + extended tools live in `tools/`. Plugins are optional add-ons.
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
| **Core Tools** | Nmap, SearchSploit, Metasploit, SSH, Shell | `tools/` |
| **Extended Tools** | masscan, nuclei, ffuf, whatweb, nikto, sqlmap, wpscan, commix, crackmapexec, impacket, ... | `tools/` |
| **Plugin Tools** | Custom integrations | `plugins/<name>/` |

**Rule:** Shipping tools live in `tools/`. Use `plugins/` for local/custom integrations that you do not want to vendor into core.

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

If `type` is omitted, `python_class` is assumed (backward compatible).

---

## Type A — `python_class`

Write a Python class inheriting `BaseTool`.

**`plugin.json` required fields:**
- `name`, `enabled` (must be `true` to load)
- `type` is optional and defaults to `python_class`
- `python_class`: `entry_point`, `class_name`
- `cli_wrapper`: `binary`
- `api_wrapper`: `base_url` (plus `auth_env` recommended)

**`plugin.json` example:**
```json
{
  "name": "linpeas",
  "type": "python_class",
  "version": "1.0.0",
  "enabled": true,
  "entry_point": "plugins.linpeas.tool",
  "class_name": "LinPEASTool"
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


## Type B — `cli_wrapper`

Wrap any CLI binary entirely in `plugin.json`. No `tool.py` needed.
`ToolRegistry` auto-generates a `GenericCLITool` instance.

**`plugin.json`:**
```json
{
  "name": "ffuf",
  "type": "cli_wrapper",
  "version": "1.0.0",
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
  "description": "Query Shodan for a target IP to retrieve known open ports, services, and CVEs without active scanning. Requires SHODAN_API_KEY.",
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
1. Environment variable named by `auth_env` (e.g. `SHODAN_API_KEY`)
2. `SecureStore` (OS keychain) key named by `auth_secure_store_key`
3. Not found → `health_check()` returns `available=False` with an install hint

**Note:** `health_check()` for `api_wrapper` only checks credential presence — no live API call is made.

---

## `plugin.json` Full Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Tool identifier (used as tool name) |
| `type` | enum | No | `"python_class"` (default) \| `"cli_wrapper"` \| `"api_wrapper"` |
| `enabled` | bool | No | Must be `true` to load; missing defaults to `false` |
| `entry_point` | string | python_class only | Python module path |
| `class_name` | string | python_class only | Class name in module |
| `description` | string | No | Metadata for wrappers; default derived from name |
| `category` | string | No | Metadata category (default `recon`) |
| `version` | string | No | Metadata version (default `1.0.0`) |
| `parameters` | JSON Schema | No | LLM parameter schema (default empty) |
| `binary` | string | cli_wrapper only | Executable name (checked via `shutil.which`) |
| `args_template` | list | cli_wrapper only | CLI args with `{param}` placeholders |
| `output_format` | enum | cli_wrapper only | `"json"` \| `"jsonlines"` \| `"text"` \| `"csv"` |
| `timeout_seconds` | int | No | CLI default 300, API default 15 |
| `install_hint` | string | No | Shown when binary/key missing |
| `base_url` | string | api_wrapper only | API base URL |
| `endpoints` | object | api_wrapper only | Endpoint map used by `GenericAPITool` |
| `auth_env` | string | No | Env var name for API key |
| `auth_secure_store_key` | string | No | SecureStore key name |
| `auth_type` | enum | No | `"query_param"` (default) \| `"bearer"` \| `"header"` |
| `auth_param_name` | string | No | Query or header name (default `key`) |

Additional fields are ignored by the loader. `python_class` tools can define their own metadata in code.

---

## Tool Registry Flow

```
At startup:
  1. ToolRegistry initialized
  2. Core + extended tools registered (see `core/registry_builder.py`)
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

# Restart the API/web process to reload plugins
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

The `plugins/` directory is empty by default. Core and extended tools are built into `tools/` and registered at startup. Use plugins only for custom/local integrations.
