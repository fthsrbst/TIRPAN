# AEGIS — Plugin System Specification

> **Purpose:** Add new attack capabilities without touching the core.
> V1 ships with 3 built-in tools — everything else arrives via plugins.

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
  "entry_point": "plugins.web_scanner.tool.WebScannerTool",
  "requires_packages": ["playwright>=1.40", "beautifulsoup4>=4.12"],
  "min_core_version": "2.0.0",
  "safety_level": "medium",
  "target_type": "url",
  "tags": ["web", "xss", "sqli", "ssrf"]
}
```

### Field Descriptions

| Field               | Type   | Description                                                       |
| ------------------- | ------ | ----------------------------------------------------------------- |
| `name`              | string | Unique plugin identifier (same as directory name)                 |
| `version`           | semver | Plugin version                                                    |
| `enabled`           | bool   | `false` → not loaded; set to `true` to activate                   |
| `entry_point`       | string | `module.path.ClassName` (importlib uses this)                     |
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

## Current + Planned Plugin List

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

## Plugin Authoring Guidelines

### ✅ Do

- Inherit from `BaseTool`, honour the contract
- Write a detailed `metadata.description` — the LLM reads this to decide when to use it
- Always return `{"success": bool, "output": any, "error": str|None}`
- Catch exceptions, never let them propagate unchecked
- Specify `min_core_version` in `plugin.json`

### ❌ Don't

- Touch core files (`core/`, `tools/`, `database/`)
- Hold global state (keep it stateless)
- Import `config.py` directly → inject it through the constructor
- Deliberately run blocked commands (`safety.py` will block them anyway)

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
