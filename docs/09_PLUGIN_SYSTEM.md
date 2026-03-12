# AEGIS — Plugin System Specification

> **Purpose:** Add new attack capabilities without touching the core.
> V1 ships with 3 built-in tools — everything else arrives via plugins.
> V2 introduces three plugin types so most tools need zero Python code.

---

## Why a Plugin System?

| Approach                     | Problem                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Embedding tools into core    | Adding XSS means touching Nmap code = risk of breakage                            |
| Rewriting everything         | Updating Metasploit affects the entire system                                     |
| **Plugin system** ✅          | Write an XSS tool → drop it in `/plugins/web_scan/` → register → it runs         |

---

## Plugin vs Core Tool Distinction

| Category                       | Examples                              | Location          |
| ------------------------------ | ------------------------------------- | ----------------- |
| **Core Tools** (V1 built-in)   | Nmap, SearchSploit, Metasploit        | `tools/`          |
| **Plugin Tools** (V2+)         | WebScan, Nuclei, Gobuster, SQLMap     | `plugins/<name>/` |

### Rule:

- A tool that **works at network-level, is self-contained, requires no extra install** → `tools/` (core)
- A tool that **has external dependencies, targets a specific type, is optional** → `plugins/` (plugin)

---

## Plugin Anatomy (Every Plugin Contains Exactly This)

```
plugins/
└── web_scanner/            ← Plugin directory (lowercase, underscore)
    ├── plugin.json         ← Manifest (REQUIRED)
    ├── tool.py             ← Main tool implementation (REQUIRED)
    ├── requirements.txt    ← Plugin-specific dependencies (optional)
    └── README.md           ← Usage guide (recommended)
```

---

## `plugin.json` Schema (Full Spec)

```json
{
  "name": "web_scanner",
  "version": "1.0.0",
  "display_name": "Web Vulnerability Scanner",
  "description": "Headless browser-based scanner for XSS, SQLi, and SSRF detection.",
  "author": "your_name",
  "license": "MIT",
  "category": "web",
  "enabled": false,
  "entry_point": "plugins.web_scanner.tool",
  "class_name": "WebScannerTool",
  "requires_packages": ["playwright>=1.40", "beautifulsoup4>=4.12"],
  "min_core_version": "2.0.0",
  "safety_level": "medium",
  "target_type": "url",
  "tags": ["web", "xss", "sqli", "ssrf"]
}
```

> **Note:** `entry_point` is the Python module path and `class_name` is the class within that module.
> The loader does: `cls = getattr(importlib.import_module(entry_point), class_name)`

### Field Descriptions

| Field               | Type   | Description                                                       |
| ------------------- | ------ | ----------------------------------------------------------------- |
| `name`              | string | Unique plugin identifier (same as directory name)                 |
| `version`           | semver | Plugin version                                                    |
| `enabled`           | bool   | `false` → not loaded; set to `true` to activate                   |
| `entry_point`       | string | Python module path (e.g. `"plugins.web_scanner.tool"`)            |
| `class_name`        | string | Class name inside the module (e.g. `"WebScannerTool"`)            |
| `requires_packages` | list   | pip dependencies to install                                       |
| `min_core_version`  | semver | Minimum core version this plugin supports                         |
| `safety_level`      | enum   | `"low"` / `"medium"` / `"high"` — shown to the user              |
| `target_type`       | enum   | `"ip"` / `"url"` / `"cidr"` / `"any"`                             |

---

## `tool.py` Template (Copy-Paste Ready)

```python
# plugins/web_scanner/tool.py
from tools.base_tool import BaseTool, ToolMetadata

class WebScannerTool(BaseTool):
    """
    Detects XSS, SQLi, and SSRF using a headless browser.
    Requires Playwright.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="web_scan",
            description=(
                "Scan a web application for XSS, SQLi, and SSRF vulnerabilities. "
                "Use only for URL targets, not IP addresses."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to scan (e.g. http://target.com/login)"
                    },
                    "scan_type": {
                        "type": "string",
                        "enum": ["xss", "sqli", "ssrf", "all"],
                        "description": "Which vulnerability types to look for"
                    },
                    "depth": {
                        "type": "integer",
                        "default": 2,
                        "description": "How many link levels deep to scan"
                    }
                },
                "required": ["url"]
            },
            category="web",
            version="1.0.0"
        )

    async def execute(self, params: dict) -> dict:
        url = params["url"]
        scan_type = params.get("scan_type", "all")

        try:
            results = await self._run_scan(url, scan_type)
            return {
                "success": True,
                "output": {
                    "findings": results,
                    "total": len(results)
                },
                "error": None
            }
        except Exception as e:
            return {
                "success": False,
                "output": None,
                "error": str(e)
            }

    async def _run_scan(self, url: str, scan_type: str) -> list:
        # Actual scanning implementation
        ...
```

---

## Enabling a Plugin

```bash
# Method 1: Edit plugin.json directly
# plugins/web_scanner/plugin.json → "enabled": true

# Method 2: CLI (V2 target)
python main.py --enable-plugin web_scanner

# Method 3: Web UI (V2 target)
# Settings → Plugins → Web Scanner → Enable
```

---

## Current + Planned Plugin List (V1 View)

> See the full V2 catalogue at the bottom of this document.

| Plugin Name            | Status       | Version | Description                          |
| ---------------------- | ------------ | ------- | ------------------------------------ |
| `web_scanner`          | 📋 Planned   | V2      | XSS, SQLi, SSRF (Playwright)         |
| `nuclei_scanner`       | 📋 Planned   | V2      | Nuclei template-based scanning       |
| `gobuster`             | 📋 Planned   | V2      | Directory/file brute force           |
| `interactsh`           | 📋 Planned   | V2      | OOB (blind injection) detection      |
| `sqlmap_plugin`        | 📋 Planned   | V2      | Automated SQL injection              |
| `ffuf_plugin`          | 📋 Planned   | V2      | Web fuzzing                          |
| `custom_payload`       | 📋 Planned   | V2      | LLM-written exploit scripts          |
| `source_code_analyzer` | 📋 Planned   | V3      | Semgrep + LLM white-box analysis     |

---

## ToolRegistry Integration Flow

```
At main.py startup:
  1. Create ToolRegistry()
  2. Register core tools:
       registry.register(NmapTool())
       registry.register(SearchSploitTool())
       registry.register(MetasploitTool())
  3. Call registry.load_plugins(Path("plugins/"))
       → Read each plugin.json
       → Import enabled ones via importlib
       → registry.register(PluginToolClass())
  4. Inject registry into agent
  5. Agent provides tool list to LLM via registry.list_for_llm()
```

---

## V2: Three Plugin Types

V1 supports only one plugin type — a Python class that implements `BaseTool`. V2 adds two configuration-only types so that wrapping a CLI binary or a REST API requires **no Python code**.

> Full technical spec: [11_V2_FEATURE_SPEC.md — Section 5](11_V2_FEATURE_SPEC.md#5-plugin-architecture-v2--three-plugin-types)

### Type Overview

| `"type"` value  | Use case                                      | Python `tool.py` needed |
| --------------- | --------------------------------------------- | ----------------------- |
| `python_class`  | Complex logic, stateful tools, custom parsers | **Yes**                 |
| `cli_wrapper`   | Any CLI binary with parseable output          | **No**                  |
| `api_wrapper`   | REST API endpoints with authentication        | **No**                  |

The `"type"` field must be present in `plugin.json`. If omitted, `"python_class"` is assumed for backward compatibility.

---

### Type A — `python_class` (V1 behaviour, unchanged)

Declare `"type": "python_class"` in `plugin.json` and provide a `tool.py` that subclasses `BaseTool`. See the `tool.py` template above.

---

### Type B — `cli_wrapper`

Wrap any CLI binary entirely through `plugin.json`. `ToolRegistry` generates a `GenericCLITool` instance automatically — there is no `tool.py`.

**`plugin.json` for `cli_wrapper`:**

```json
{
  "name": "nuclei_scan",
  "type": "cli_wrapper",
  "version": "1.0.0",
  "display_name": "Nuclei Scanner",
  "description": "Template-based vulnerability scanner. Best used after port scanning identifies open services.",
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

**Key fields:**

| Field             | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `binary`          | Executable name; verified via `shutil.which()` at health check           |
| `install_hint`    | Shown in UI when binary is not found                                     |
| `args_template`   | Array of arguments; `{param}` placeholders are substituted at runtime   |
| `{output_file}`   | Auto-generated temp file; content is read back after execution           |
| `output_format`   | `"jsonlines"` / `"json"` / `"text"` / `"csv"` — determines how stdout is parsed |
| `timeout_seconds` | Process killed after this duration; `ToolHealthStatus.degraded` set     |

**`args_template` substitution rules:**
- `{param_name}` → replaced with the LLM-supplied parameter value
- Parameters not supplied use their JSON Schema `default` value
- Missing required parameters → validation error before the subprocess starts

---

### Type C — `api_wrapper`

Call a REST API entirely through `plugin.json`. `ToolRegistry` generates a `GenericAPITool` instance. Authentication is resolved from environment variables or `SecureStore`.

**`plugin.json` for `api_wrapper`:**

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
      "path": "/shodan/host/{ip}"
    }
  },
  "timeout_seconds": 15,
  "parameters": {
    "type": "object",
    "properties": {
      "ip": {
        "type": "string",
        "description": "IPv4 address to look up on Shodan"
      }
    },
    "required": ["ip"]
  }
}
```

**Authentication resolution order:**
1. Environment variable named by `auth_env`
2. `SecureStore` (`core/secure_store.py`) key named by `auth_secure_store_key`
3. Database `settings` table
4. If none found → `health_check()` returns `available=False`, UI shows: "API key not configured"

**`health_check()` for `api_wrapper`:** verifies credential presence only — no live API call is made (avoids billing charges).

---

### Type Routing in `ToolRegistry`

`core/tool_registry.py` `_load_single_plugin()` dispatches on the `type` field:

```python
match cfg.get("type", "python_class"):
    case "python_class":
        # Existing importlib path (unchanged)
        module = importlib.import_module(cfg["entry_point"])
        cls = getattr(module, cfg["class_name"])
        tool_instance = cls()
    case "cli_wrapper":
        from core.generic_tools import GenericCLITool
        tool_instance = GenericCLITool(cfg)
    case "api_wrapper":
        from core.generic_tools import GenericAPITool
        tool_instance = GenericAPITool(cfg)
    case _:
        logger.warning("Unknown plugin type '%s' — skipping", cfg.get("type"))
        return
```

Both `GenericCLITool` and `GenericAPITool` are implemented in `core/generic_tools.py` and inherit from `BaseTool`. The `health_check()` method is implemented for both.

---

## Plugin Authoring Guidelines

### ✅ Do

- Set `"type"` explicitly in `plugin.json`
- For `python_class`: inherit from `BaseTool`, honour the return contract
- Write a detailed `metadata.description` — the LLM reads this to decide when to use it
- Always return `{"success": bool, "output": any, "error": str|None}`
- Catch exceptions inside `execute()`; never let them propagate unchecked
- Implement `health_check()` so the UI can report your tool's status
- Specify `min_core_version` and `install_hint` in `plugin.json`

### ❌ Don't

- Touch core files (`core/`, `tools/`, `database/`)
- Hold global mutable state across calls (keep `execute()` stateless)
- Import `config.py` directly → receive settings through the constructor
- Run commands that would be blocked by `safety.py` — they will be blocked regardless

---

## Current + Planned Plugin List

| Plugin Name            | Type           | Status       | Version | Description                              |
| ---------------------- | -------------- | ------------ | ------- | ---------------------------------------- |
| `nuclei_scan`          | `cli_wrapper`  | 📋 Planned   | V2      | Nuclei template-based scanning           |
| `gobuster_scan`        | `cli_wrapper`  | 📋 Planned   | V2      | Directory / file brute force             |
| `ffuf_fuzz`            | `cli_wrapper`  | 📋 Planned   | V2      | Web fuzzing                              |
| `sqlmap_scan`          | `cli_wrapper`  | 📋 Planned   | V2      | Automated SQL injection                  |
| `nikto_scan`           | `cli_wrapper`  | 📋 Planned   | V2      | Web server vulnerability scan            |
| `hydra_brute`          | `cli_wrapper`  | 📋 Planned   | V2      | Credential brute force                   |
| `shodan_lookup`        | `api_wrapper`  | 📋 Planned   | V2      | Passive host recon via Shodan API        |
| `virustotal_lookup`    | `api_wrapper`  | 📋 Planned   | V2      | Domain / hash reputation lookup          |
| `web_scanner`          | `python_class` | 📋 Planned   | V2      | XSS, SQLi, SSRF via Playwright           |
| `docker_escape`        | `python_class` | 📋 Planned   | V2      | Container escape detection & execution   |
| `lateral_pivot`        | `python_class` | 📋 Planned   | V2      | Internal subnet pivoting                 |
| `source_code_analyzer` | `python_class` | 📋 Planned   | V3      | Semgrep + LLM white-box analysis         |

---

## V1 Reference: Core Tool List

Only these 3 tools ship built-in in V1:

| Tool Name             | File                         | What It Does                               |
| --------------------- | ---------------------------- | ------------------------------------------ |
| `nmap_scan`           | `tools/nmap_tool.py`         | Port scanning, host discovery, service ID  |
| `searchsploit_search` | `tools/searchsploit_tool.py` | Exploit database search                    |
| `metasploit_run`      | `tools/metasploit_tool.py`   | Exploit execution, session management      |

And 2 built-in meta-actions (not tools — internal agent actions):

| Meta-action       | What It Does                                        |
| ----------------- | --------------------------------------------------- |
| `generate_report` | Produces PDF/HTML report from session findings      |
| `finish`          | Terminates the agent loop                           |
