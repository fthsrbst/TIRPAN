# PenTestAI — Full Architecture v2 (Plugin-Aware)

## Tasarım İlkesi

> **"Core küçük, plugin'ler büyük."**
>
> Core: sadece Agent loop + LLM + Safety + DB + UI.  
> Her attack capability bir **Tool Plugin**'dir — core'a dokunmadan eklenip çıkarılır.

---

## Büyük Resim

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PenTestAI                                    │
│                                                                      │
│  ┌──────────┐    ┌────────────────────────────────────────────────┐  │
│  │  Web UI  │───▶│             FastAPI Backend                    │  │
│  │          │◀───│  REST + WebSocket                              │  │
│  └──────────┘    └──────────────────┬─────────────────────────────┘  │
│                                     │                                │
│                         ┌───────────▼───────────┐                   │
│                         │    ReAct Agent Core    │                   │
│                         │                        │                   │
│                         │  Reason → Act →        │                   │
│                         │  Observe → Reflect     │                   │
│                         │                        │                   │
│                         │  ┌──────────────────┐  │                   │
│                         │  │  Safety Guard     │  │                   │
│                         │  │  (every action)   │  │                   │
│                         │  └──────────────────┘  │                   │
│                         └───────────┬────────────┘                   │
│                                     │                                │
│                         ┌───────────▼────────────┐                   │
│                         │    Tool Registry        │ ← KİLİT NOKTA   │
│                         │                         │                   │
│                         │  Core Tools (built-in): │                   │
│                         │  ├── NmapTool           │                   │
│                         │  ├── SearchSploitTool   │                   │
│                         │  └── MetasploitTool     │                   │
│                         │                         │                   │
│                         │  Plugin Tools (loaded): │                   │
│                         │  ├── [boş — V1]         │                   │
│                         │  ├── WebScanPlugin (V2) │                   │
│                         │  ├── NucleiPlugin (V2)  │                   │
│                         │  └── ...                │                   │
│                         └─────────────────────────┘                   │
│                                                                      │
│  ┌──────────────────────────┐   ┌──────────────────────────────────┐ │
│  │    LLM Layer             │   │       SQLite Database             │ │
│  │  OpenRouter + Ollama     │   │  Sessions / Findings / Audit     │ │
│  └──────────────────────────┘   └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

[OPSİYONEL MODÜL]
┌─────────────────────────────────────┐
│         Defense Module              │  ← Ayrı process, aynı DB
│  Sniffer → Detectors → LLM → Block  │
└─────────────────────────────────────┘
```

---

## Katmanlar (V1 Scope — Kesin)

### Katman 1: Core Infrastructure (değişmez temel)

```
core/
├── agent.py          # ReAct loop — tool isimlerini tool registry'den alır
├── llm_client.py     # OpenRouter + Ollama abstraction
├── safety.py         # 10 guardrail — her action'dan önce çalışır
├── memory.py         # Session memory (sliding window)
├── prompts.py        # Prompt builder
└── tool_registry.py  # ← YENİ: Plugin loader & tool catalog  [CORE]
```

### Katman 2: Core Tools (V1'de built-in, core gibi davranır)

```
tools/
├── base_tool.py          # Abstract base — her tool buna uyar
├── nmap_tool.py          # Port scan + host discovery
├── searchsploit_tool.py  # Exploit search
└── metasploit_tool.py    # Exploit execution via RPC
```

**V1'de ShellTool YOKTUR.** Güvenlik riski olduğu için scope dışına alındı.

### Katman 3: Plugin Tools (V1'de boş — sonradan yüklenir)

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

### Katman 4: Data Layer

```
database/
├── db.py                 # aiosqlite connection manager
├── repositories.py       # CRUD per entity
├── knowledge_base.py     # "What worked where" lookup
└── schema.sql            # 7 tablo (pentest) + 4 tablo (defense)
```

### Katman 5: Web & Reporting

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

### Katman 6: Defense Module (Opsiyonel, ayrı başlatılır)

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

## Tool Registry — Plugin Sistemi Detayı

### Nasıl Çalışır

```
Başlangıçta:
1. ToolRegistry başlatılır
2. Core tools (Nmap, SearchSploit, MSF) otomatik register edilir
3. /plugins/ klasörü taranır
4. Her plugin.json okunur (metadata)
5. Enabled plugin'ler importlib ile yüklenir ve register edilir

Agent çalışırken:
6. Agent, LLM'e "şu andaki araçlar" listesini gönderir
   → Tool ismi + açıklaması + parametre şeması
7. LLM, hangi tool'u çağıracağına karar verir
8. Agent, ToolRegistry'den tool'u alır ve execute eder
```

### Tool Arayüzü (Değişmez Kontrat)

```python
# tools/base_tool.py
from abc import ABC, abstractmethod
from pydantic import BaseModel

class ToolMetadata(BaseModel):
    name: str           # Agent'ın LLM'e söylediği isim: "nmap_scan"
    description: str    # LLM'in ne zaman kullanacağını anlaması için
    parameters: dict    # JSON Schema — LLM bu şemaya göre parametre üretir
    category: str       # "recon" | "exploit" | "web" | "report"
    version: str        # Semver: "1.0.0"

class BaseTool(ABC):
    @property
    @abstractmethod
    def metadata(self) -> ToolMetadata:
        """Tool hakkında tüm bilgi burada."""

    @abstractmethod
    async def execute(self, params: dict) -> dict:
        """
        Tool'u çalıştır.
        Returns: {"success": bool, "output": any, "error": str|None}
        """

    async def validate(self, params: dict) -> tuple[bool, str]:
        """Params doğrula. Override edilebilir."""
        return True, ""
```

### Plugin `plugin.json` Şeması

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

### Tool Registry Implementasyonu (Özet)

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
        """LLM'e gönderilecek tool açıklamaları."""
        return [
            {
                "name": t.metadata.name,
                "description": t.metadata.description,
                "parameters": t.metadata.parameters,
            }
            for t in self._tools.values()
        ]

    def load_plugins(self, plugins_dir: Path) -> None:
        """Plugin klasörünü tara, yüklenebilir plugin'leri import et."""
        for plugin_dir in plugins_dir.iterdir():
            manifest_path = plugin_dir / "plugin.json"
            if not manifest_path.exists():
                continue
            manifest = json.loads(manifest_path.read_text())
            if not manifest.get("enabled", False):
                continue
            # Dinamik import
            module_path, class_name = manifest["entry_point"].rsplit(".", 1)
            module = importlib.import_module(module_path)
            tool_class = getattr(module, class_name)
            self.register(tool_class())
```

---

## LLM İletişim Protokolü (Standart)

Agent, her ReAct döngüsünde LLM'e şunu gönderir:

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

LLM her zaman şu JSON'la cevap verir:

```json
{
  "thought": "Port 445 açık ve SMB v1 çalışıyor. EternalBlue için searchsploit'e bakacağım.",
  "tool": "searchsploit_search",
  "parameters": { "query": "EternalBlue SMB ms17-010" },
  "confidence": 0.91
}
```

Eğer LLM işi bitirdi diye düşünüyorsa:

```json
{
  "thought": "Tüm hedefler tarandı, 3 kritik zafiyet bulundu.",
  "tool": "generate_report",
  "parameters": { "session_id": "abc123" },
  "confidence": 1.0
}
```

---

## Saldırı Akışı (V1 — Network Only)

```
Kullanıcı: "192.168.1.0/24 ağını tara ve exploit et"
                    │
                    ▼
        [Agent] Session oluştur (DB)
                    │
          ┌─────────▼──────────┐
          │  Phase 1: Keşif    │ → nmap_scan (ping sweep)
          └─────────┬──────────┘
                    │ → Host listesi: [.5, .10, .23, .42]
          ┌─────────▼──────────┐
          │  Phase 2: Port     │ → nmap_scan (service detect) × host sayısı
          │  Tarama            │
          └─────────┬──────────┘
                    │ → Port/servis/versiyon listesi
          ┌─────────▼──────────┐
          │  Phase 3: Exploit  │ → searchsploit_search × servis sayısı
          │  Arama             │
          └─────────┬──────────┘
                    │ → Exploit listesi
          ┌─────────▼──────────┐
          │  Phase 4:          │ → metasploit_run × exploit sayısı
          │  Exploitation      │   (Safety check → LLM seçer)
          └─────────┬──────────┘
                    │ → Başarılı exploitler, sessionlar
          ┌─────────▼──────────┐
          │  Phase 5: Rapor    │ → generate_report
          └────────────────────┘
```

**Her action öncesi Safety Guard çalışır. Herhangi bir kural ihlali → block.**

---

## Safety System (10 Kural — Değişmez)

```
Action → [1] Kill switch aktif mi?
       → [2] Hedef IP scope dahilinde mi?
       → [3] Port izin verilen aralıkta mı?
       → [4] Hedef excluded_ips'de mi?
       → [5] Excluded ports'da mı?
       → [6] Exploit izni var mı? (scan_only mode)
       → [7] DoS kategorisi mi?
       → [8] Destructive action mı?
       → [9] Max exploit severity'yi aşıyor mu?
       → [10] Time limit doldu mu?
       → ✅ Çalıştır  VEYA  🛑 Blok + Audit Log
```

---

## Veritabanı (7 Tablo — Pentest)

| Tablo             | Amacı                                           |
| ----------------- | ----------------------------------------------- |
| `sessions`        | Her pentest oturumu                             |
| `messages`        | Agent thought/action/result geçmişi             |
| `scan_results`    | Host/port/servis bulguları                      |
| `vulnerabilities` | CVE listesi + CVSS puanı                        |
| `exploit_results` | Exploit denemesi + sonuç                        |
| `knowledge_base`  | "Hangi exploit hangi servis-versiyonda çalıştı" |
| `audit_log`       | Hukuki için her action logu                     |

---

## Teknoloji Stack (V1 — Kesin Liste)

| Bileşen           | Teknoloji                      | Versiyon      |
| ----------------- | ------------------------------ | ------------- |
| Dil               | Python                         | 3.11+         |
| Web Framework     | FastAPI                        | 0.110+        |
| LLM (cloud)       | OpenRouter → Claude 3.5 Sonnet | —             |
| LLM (local)       | Ollama → Llama 3 8B            | —             |
| DB                | SQLite via aiosqlite           | —             |
| Port Scanner      | Nmap                           | 7.94+         |
| Exploit DB        | SearchSploit (ExploitDB)       | —             |
| Exploit Framework | Metasploit 6.x via RPC         | pymetasploit3 |
| Rapor             | Jinja2 + WeasyPrint            | —             |
| Real-time         | WebSocket via FastAPI          | —             |
| Terminal UI       | Rich                           | 13.x          |
| Test              | pytest                         | 8.x           |
| Plugin yükleme    | importlib (stdlib)             | —             |

**V1'de OLMAYAN şeyler (Plugin olarak V2+):**

- Playwright / Headless Browser
- XSS / SQLi / SSRF tarama
- Nuclei
- Gobuster / ffuf
- InteractSH (OOB callbacks)
- SQLMap
- SARIF output

---

## Klasör Yapısı (Tam)

```
PenTestAI/
│
├── main.py                      # CLI entry point
├── config.py                    # AppConfig, SafetyConfig, LLMConfig
├── requirements.txt
├── .env.example
│
├── core/                        # CORE — değiştirme
│   ├── agent.py                 # ReAct loop
│   ├── llm_client.py            # LLM abstraction
│   ├── safety.py                # 10 guardrail
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
├── plugins/                     # PLUGIN TOOLS — V2+ (başlangıçta boş)
│   └── __init__.py              # Boş, Plugin loader buraya bakar
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
├── defense/                     # OPSİYONEL — ayrı process
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
│   ├── test_tool_registry.py    # YENİ
│   └── defense/
│       ├── test_sniffer.py
│       ├── test_detectors.py
│       ├── test_analyzer.py
│       ├── test_llm_defender.py
│       └── test_responder.py
│
└── docs/
    ├── 01_XBOW_COMPARISON.md
    ├── 02_ARCHITECTURE.md       ← BU DOSYA
    ├── 03_PREREQUISITES.md
    ├── 04_ROADMAP.md
    ├── 05_SAFETY_AND_LEGAL.md
    ├── 06_LEARNING_CURRICULUM.md
    ├── 07_NETWORK_DEFENSE_MODULE.md
    ├── 08_MASTER_CHECKLIST.md
    └── 09_PLUGIN_SYSTEM.md      ← YENİ
```

---

## Mimari Kararlar ve Gerekçeler

| Karar                                        | Gerekçe                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Plugin sistemi şimdi tasarla, V1'de tool yok | V2'de koda dokunmadan XSS plugin eklenebilsin                            |
| ShellTool yok                                | Güvenlik riski çok yüksek, audit edilemez                                |
| Ollama local > OpenRouter local              | Hız: 200ms vs 2s. Parsing/classification için ideal                      |
| importlib plugin loading                     | stdlib, dependency yok, güvenli                                          |
| Defense ayrı process                         | Pentest bot'u durdurmak defense'i etkilemesin                            |
| SQLite (aiosqlite)                           | Sıfır kurulum, capstone için yeterli, V3'te PostgreSQL'e migrate edilir  |
| Single agent (V1)                            | Öğrenmesi kolay, her kararı takip edilebilir, multi-agent V3'e ertelendi |
