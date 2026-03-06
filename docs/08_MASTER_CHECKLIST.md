# AEGIS — Master Checklist (Per Phase, Eksiksiz)

> Her aşama için ayrı, detaylı görev listesi. Tamamlandığında ✅ işaretle.
>
> **Toplam Aşama:** 15 (Pentest: 14 core + 1 ToolRegistry) + 8 (Defense) = **23 Aşama**  
> **Önemli:** ShellTool V1'de YOK. Web attack'lar V2+ plugin olarak gelir. `/plugins/` V1'de boş.

---

## 🔵 BÖLÜM A: AEGIS Örnek Kalıbı (V1 Pentest Bot)

---

## Phase 1: Configuration & Data Models

**Dosyalar:** `config.py`, `models/`  
**Öğrenilen:** Pydantic, type hints, env vars

### Yapı

- [ ] **1.1** — Proje klasör yapısını oluştur (`core/`, `tools/`, `plugins/`, `models/`, `database/`, `web/`, `reporting/`, `defense/`, `tests/`, `docs/`)
- [ ] **1.2** — `venv` sanal ortamını oluştur (`python3.11 -m venv venv`)
- [ ] **1.3** — `requirements.txt` dosyasını hazırla: `pydantic fastapi uvicorn httpx python-nmap pymetasploit3 scapy aiosqlite rich weasyprint jinja2 pytest pytest-cov pytest-asyncio`  
      _(openai paketi YOK — OpenRouter'a httpx ile doğrudan bağlanıyoruz)_  
      _(scapy sadece defense module için, opsiyonel ayrı requirements-defense.txt'e taşınabilir)_
- [ ] **1.4** — `.env.example` dosyası oluştur (OPENROUTER_API_KEY, MSF_RPC_PASSWORD, MSF_RPC_HOST, MSF_RPC_PORT)
- [ ] **1.5** — `.gitignore` dosyası oluştur (`.env`, `venv/`, `*.db`, `__pycache__/`, `reports/`)

### Modeller

- [ ] **1.6** — `models/target.py` — `Target` Pydantic modeli (ip, port_range, scan_only, excluded_ports)
- [ ] **1.7** — `models/scan_result.py` — `Port`, `Host`, `ScanResult` modelleri
- [ ] **1.8** — `models/vulnerability.py` — `Vulnerability` modeli (cvss_score, description, cve_id)
- [ ] **1.9** — `models/exploit_result.py` — `ExploitResult` modeli (success, output, session_id)
- [ ] **1.10** — `models/session.py` — `Session` modeli (target, config, status, timestamps)

### Konfigürasyon

- [ ] **1.11** — `config.py` — `AppConfig` sınıfı (tüm ayarları `.env`'den okur)
- [ ] **1.12** — `config.py` — `SafetyConfig` sınıfı (10 guardrail kuralı)
- [ ] **1.13** — `config.py` — `LLMConfig` sınıfı (provider, model, temperature, timeout)

### Test

- [ ] **1.14** — `tests/test_models.py` — Her model için validation test yaz
- [ ] **1.15** — `python -m pytest tests/test_models.py -v` komutu başarıyla çalışmalı

---

## Phase 2: LLM Client

**Dosya:** `core/llm_client.py`  
**Öğrenilen:** Async/await, HTTP API calls, JSON parsing, abstraction

### OpenRouter Entegrasyonu

- [ ] **2.1** — `LLMClient` abstract base class oluştur
- [ ] **2.2** — `OpenRouterClient` — `httpx` ile async POST calls (chat completions endpoint)
- [ ] **2.3** — `OpenRouterClient` — JSON response parsing (`choices[0].message.content`)
- [ ] **2.4** — `OpenRouterClient` — Retry logic (3 deneme, exponential backoff)
- [ ] **2.5** — `OpenRouterClient` — Timeout handling (30 saniye varsayılan)

### Ollama Entegrasyonu

- [ ] **2.6** — `OllamaClient` — Local API (`http://localhost:11434/api/generate`)
- [ ] **2.7** — `OllamaClient` — Streaming response support
- [ ] **2.8** — `OllamaClient` — Model sağlık kontrolü (`ollama list` API)

### Router

- [ ] **2.9** — `LLMRouter` — Görev türüne göre provider seçimi (complex → OpenRouter, parsing → Ollama)
- [ ] **2.10** — Structured output parsing (LLM'den gelen JSON'u parse et)
- [ ] **2.11** — Fallback logic (OpenRouter başarısız → Ollama'ya geç)

### Test

- [ ] **2.12** — `tests/test_llm_client.py` — Mock HTTP calls ile unit test
- [ ] **2.13** — Gerçek API ile integration test (`.env` gerektirir)
- [ ] **2.14** — `python -m pytest tests/test_llm_client.py -v` başarılı çalışmalı

---

## Phase 3: Base Tool & Nmap Tool (OOP)

**Dosyalar:** `tools/base_tool.py`, `tools/nmap_tool.py`  
**Öğrenilen:** OOP, inheritance, abstract methods, subprocess, XML parsing

### Base Tool + ToolMetadata (Plugin Kontratı)

- [ ] **3.1** — `ToolMetadata` Pydantic model oluştur: `name`, `description`, `parameters` (JSON schema), `category`, `version`
- [ ] **3.2** — `BaseTool` abstract class oluştur (ABC)
- [ ] **3.3** — `@property @abstractmethod metadata(self) -> ToolMetadata` tanımla
- [ ] **3.4** — `async def execute(self, params: dict) -> dict` abstract method tanımla
  - Return format her zaman: `{"success": bool, "output": any, "error": str|None}`
- [ ] **3.5** — `async def validate(self, params: dict) -> tuple[bool, str]` opsiyonel override

### Nmap Tool

- [ ] **3.6** — `NmapTool(BaseTool)` class oluştur, `metadata` property implement et
- [ ] **3.7** — Ping sweep: `-sn` flag ile host discovery
- [ ] **3.8** — Port scan: `-sV -O` ile servis ve OS tespiti
- [ ] **3.9** — XML output parsing (`python-nmap` veya `xml.etree`)
- [ ] **3.10** — Structured output: `ScanResult` modeline dönüştür
- [ ] **3.11** — Scan type seçimi (ping/service/os/full)
- [ ] **3.12** — Timeout kontrolü (max 5 dakika per host)

### Test

- [ ] **3.13** — `tests/test_nmap_tool.py` — Mock subprocess output ile test
- [ ] **3.14** — Docker'da Metasploitable2 çalıştır ve gerçek scan test et
- [ ] **3.15** — `python -m pytest tests/test_nmap_tool.py -v` başarılı

---

## Phase 3.5: Tool Registry (Plugin Loader)

**Dosya:** `core/tool_registry.py`  
**Öğrenilen:** importlib, dynamic loading, registry pattern  
**Neden önemli:** Agent hangi tool'ların var olduğunu buradan öğrenir. Plugin'ler buraya kayıt olur.

- [ ] **3.5.1** — `ToolRegistry` class oluştur
- [ ] **3.5.2** — `register(tool: BaseTool)` — tool'u dict'e kaydet (key = `tool.metadata.name`)
- [ ] **3.5.3** — `get(name: str) -> BaseTool` — tool'u adıyla getir, yoksa `ToolNotFoundError`
- [ ] **3.5.4** — `list_for_llm() -> list[dict]` — LLM'e gönderilecek tool açıklamaları
  ```python
  # Örnek çıktı:
  [{"name": "nmap_scan", "description": "...", "parameters": {...}}, ...]
  ```
- [ ] **3.5.5** — `load_plugins(plugins_dir: Path)` — `/plugins/` klasörünü tara:
  - [ ] Her alt klasörde `plugin.json` ara
  - [ ] `enabled: true` olanları `importlib.import_module()` ile yükle
  - [ ] `entry_point` alanındaki class'ı instantiate et ve register et
  - [ ] Başarısız plugin yüklemesinde `WARNING` log, uygulama çökmez
- [ ] **3.5.6** — `main.py` başlangıcında registry bootstrap:
  ```python
  registry = ToolRegistry()
  registry.register(NmapTool())
  registry.register(SearchSploitTool())
  registry.register(MetasploitTool())
  registry.load_plugins(Path("plugins/"))
  ```
- [ ] **3.5.7** — `plugins/__init__.py` boş dosya oluştur (klasör paketi olsun)
- [ ] **3.5.8** — `plugin.json` şema validasyonu: required fields kontrolü
- [ ] **3.5.9** — `tests/test_tool_registry.py` — test senaryoları:
  - [ ] Core tool register ve get testi
  - [ ] Var olmayan tool get → `ToolNotFoundError`
  - [ ] Mock plugin klasörü ile `load_plugins()` testi
  - [ ] `enabled: false` plugin yüklenmemeli
  - [ ] Bozuk `plugin.json` → uygulama çökmemeli (WARNING log)
- [ ] **3.5.10** — `python -m pytest tests/test_tool_registry.py -v` başarılı

---

## Phase 4: SearchSploit Tool

**Dosya:** `tools/searchsploit_tool.py`  
**Öğrenilen:** String parsing, regex, CLI integration

- [ ] **4.1** — `SearchSploitTool(BaseTool)` class oluştur
- [ ] **4.2** — `searchsploit -j` JSON output modu kullan
- [ ] **4.3** — Servis + versiyon combination query oluştur
- [ ] **4.4** — Exploits listesi parse et (title, path, type, platform)
- [ ] **4.5** — CVE ID extraction (title'dan regex ile)
- [ ] **4.6** — Exploit kategorileri filtrele (DoS exploits'i hariç tut — safety)
- [ ] **4.7** — Sonuçları `Vulnerability` modeline map et
- [ ] **4.8** — `tests/test_searchsploit_tool.py` — Mock output ile test
- [ ] **4.9** — `python -m pytest tests/test_searchsploit_tool.py -v` başarılı

---

## Phase 5: Metasploit RPC Tool

**Dosya:** `tools/metasploit_tool.py`  
**Öğrenilen:** RPC protocol, network programming, session management

- [ ] **5.1** — `msfrpcd` başlatma scripti hazırla (systemd service veya startup script)
- [ ] **5.2** — `MetasploitTool(BaseTool)` — `pymetasploit3` ile bağlantı
- [ ] **5.3** — Module listing: `client.modules.exploits`
- [ ] **5.4** — Module search: servis bazlı exploit bulma
- [ ] **5.5** — Option setting: `RHOSTS`, `RPORT`, `PAYLOAD`
- [ ] **5.6** — Exploit execution: `client.modules.use()` + `run()`
- [ ] **5.7** — Session management: aktif oturumları listele, komut çalıştır
- [ ] **5.8** — Timeout: 60 saniye exploit timeout
- [ ] **5.9** — Connection lost handling (msfrpcd restart'ı tespit et)
- [ ] **5.10** — `tests/test_metasploit_tool.py` — Mock RPC ile test
- [ ] **5.11** — `python -m pytest tests/test_metasploit_tool.py -v` başarılı

---

## Phase 6: Safety System

**Dosya:** `core/safety.py`  
**Öğrenilen:** IP mathematics, input validation, security thinking

- [ ] **6.1** — `SafetyGuard` class oluştur
- [ ] **6.2** — **Kural 1:** `check_target_scope()` — CIDR range kontrolü (`ipaddress` modülü)
- [ ] **6.3** — **Kural 2:** `check_port_scope()` — Port range kontrolü
- [ ] **6.4** — **Kural 3:** `check_excluded_ips()` — Excluded IP listesi kontrolü
- [ ] **6.5** — **Kural 4:** `check_excluded_ports()` — Excluded port kontrolü
- [ ] **6.6** — **Kural 5:** `check_exploit_allowed()` — scan-only mode kontrolü
- [ ] **6.7** — **Kural 6:** `check_no_dos()` — DoS exploit kategorisi bloklama
- [ ] **6.8** — **Kural 7:** `check_no_destructive()` — Destructive action bloklama
- [ ] **6.9** — **Kural 8:** `check_max_severity()` — CVSS score limiti
- [ ] **6.10** — **Kural 9:** `check_time_limit()` — Session sure limiti
- [ ] **6.11** — **Kural 10:** `check_rate_limit()` — Requests/second limiti
- [ ] **6.12** — Kill switch: `kill_switch_triggered` flag ve `emergency_stop()` method
- [ ] **6.13** — `validate_action(action) -> (bool, str)` — All guards pipeline
- [ ] **6.14** — `tests/test_safety.py` — Her kural için test case
- [ ] **6.15** — Edge cases: `/0` subnet, port 0, negative CVSS gibi
- [ ] **6.16** — `python -m pytest tests/test_safety.py -v` başarılı

---

## Phase 7: Session Memory

**Dosya:** `core/memory.py`  
**Öğrenilen:** Data structures, context management, token counting

- [ ] **7.1** — `SessionMemory` class oluştur
- [ ] **7.2** — Message history: `deque(maxlen=50)` ile bounded window
- [ ] **7.3** — Message types: `system`, `user`, `assistant`, `tool_result`
- [ ] **7.4** — Context builder: LLM'e göndermek için messages listesi oluştur
- [ ] **7.5** — Token estimation: rough token count (chars/4 heuristic)
- [ ] **7.6** — Auto-truncation: context window dolduğunda eski mesajları sil
- [ ] **7.7** — Important findings `pinning`: kritik bulgular hep context'te kalır
- [ ] **7.8** — Memory serialization: `to_dict()` ve `from_dict()` (DB için)
- [ ] **7.9** — `tests/test_memory.py` — Truncation ve pinning testleri
- [ ] **7.10** — `python -m pytest tests/test_memory.py -v` başarılı

---

## Phase 8: Agent Core (ReAct Loop)

**Dosya:** `core/agent.py`  
**Öğrenilen:** State machines, ReAct pattern, async orchestration

### Agent State Machine

- [ ] **8.1** — `AgentState` enum: `IDLE`, `REASONING`, `ACTING`, `OBSERVING`, `REFLECTING`, `DONE`, `ERROR`
- [ ] **8.2** — `PentestAgent` class oluştur
- [ ] **8.3** — State transitions: `IDLE → REASONING → ACTING → OBSERVING → REFLECTING → REASONING`

### ReAct Loop

- [ ] **8.4** — `reason()` — LLM'e mevcut durumu gönder, next_action al
- [ ] **8.5** — `act(action)` — Uygun tool'u çağır
- [ ] **8.6** — `observe(result)` — Tool sonucunu memory'ye ekle
- [ ] **8.7** — `reflect()` — Summary güncelle, strategy adapt et
- [ ] **8.8** — `run()` — Ana loop (while not done)

### Attack Phases

- [ ] **8.9** — Phase 1: Host discovery (`nmap_scan` tool, ping sweep)
- [ ] **8.10** — Phase 2: Port scanning (`nmap_scan` tool, service detect, per host)
- [ ] **8.11** — Phase 3: Exploit arama (`searchsploit_search` tool, per service)
- [ ] **8.12** — Phase 4: Exploitation (`metasploit_run` tool, LLM best exploit seçer)
- [ ] **8.13** — Phase 5: Rapor (`generate_report` meta-action ile bitir)

> ⚠️ **ShellTool V1'de YOKTUR.** LLM doğrudan shell komutu çalıştıramaz.

### Control

- [ ] **8.14** — Kill switch integration (check before each action)
- [ ] **8.15** — Max iterations guard (prevent infinite loop)
- [ ] **8.16** — Ask-before-exploit mode (pause for user approval)
- [ ] **8.17** — Progress callbacks (WebSocket için)
- [ ] **8.18** — `tests/test_agent.py` — Mock tools ile end-to-end ReAct loop test
- [ ] **8.19** — `python -m pytest tests/test_agent.py -v` başarılı

---

## Phase 9: Prompt Engineering

**Dosya:** `core/prompts.py`  
**Öğrenilen:** Prompt engineering, system prompts, templates, few-shot

- [ ] **9.1** — `PromptBuilder` class oluştur
- [ ] **9.2** — **System prompt:** Agent'ın kim olduğunu, amacını, kısıtlamalarını tanımla
- [ ] **9.3** — **Context prompt:** Mevcut scan durumunu gönder (found hosts, ports, vulns)
- [ ] **9.4** — **Tool descriptions prompt:** Her tool'u LLM'e JSON schema olarak tanımla
- [ ] **9.5** — **Action selection prompt:** "Choose next action" instruction
- [ ] **9.6** — **Few-shot examples:** 3-5 örnek iyi karar (EternalBlue, başarısız exploit, vb.)
- [ ] **9.7** — **Reflection prompt:** "What did you learn? Update strategy" prompt
- [ ] **9.8** — Output format enforcement: "Return ONLY valid JSON, no prose"
- [ ] **9.9** — Dynamic prompt assembly: context uzunluğuna göre örnek sayısını ayarla
- [ ] **9.10** — `tests/test_prompts.py` — Prompt token sayısı ve format testleri
- [ ] **9.11** — `python -m pytest tests/test_prompts.py -v` başarılı

---

## Phase 10: Database

**Dosyalar:** `database/db.py`, `database/repositories.py`, `database/knowledge_base.py`  
**Öğrenilen:** SQL, async database, repository pattern, schema design

### Schema

- [ ] **10.1** — `database/schema.sql` — 7 tablo tanımla (sessions, messages, scan_results, vulnerabilities, exploit_results, knowledge_base, audit_log)
- [ ] **10.2** — `database/db.py` — `aiosqlite` ile async DB bağlantısı
- [ ] **10.3** — Migration system: schema versiyonlama

### Repositories

- [ ] **10.4** — `SessionRepository` — CRUD operations for sessions
- [ ] **10.5** — `ScanResultRepository` — Save/get scan findings
- [ ] **10.6** — `VulnerabilityRepository` — CRUD + query by CVSS score
- [ ] **10.7** — `ExploitResultRepository` — Save exploit attempts
- [ ] **10.8** — `AuditLogRepository` — Append-only audit trail

### Knowledge Base

- [ ] **10.9** — `KnowledgeBase` — "What exploits worked on what services" DB
- [ ] **10.10** — `remember_success(service, version, exploit_module)` method
- [ ] **10.11** — `suggest_exploits(service, version)` method (LLM hint için)
- [ ] **10.12** — `tests/test_database.py` — in-memory SQLite ile test
- [ ] **10.13** — `python -m pytest tests/test_database.py -v` başarılı

---

## Phase 11: Reporting

**Dosyalar:** `reporting/report_generator.py`, `reporting/cvss.py`  
**Öğrenilen:** Jinja2 templates, PDF generation, CVSS algorithm, file I/O

- [ ] **11.1** — `CvssCalculator` — CVSS v3.1 score hesaplama (attack vector, complexity, privileges vb.)
- [ ] **11.2** — `templates/report.html` — Jinja2 HTML template (başlık, yönetici özeti, bulgular tablosu)
- [ ] **11.3** — `ReportGenerator` class oluştur
- [ ] **11.4** — `generate_html(session_id) -> str` method
- [ ] **11.5** — `generate_pdf(session_id) -> bytes` method (WeasyPrint)
- [ ] **11.6** — Her bulgu için: CVE açıklaması, CVSS score, PoC komut, öneri düzeltme
- [ ] **11.7** — Yönetici özeti (exec summary): toplam host, open ports, critical vulns sayısı
- [ ] **11.8** — Report file kaydetme: `reports/{session_id}_{timestamp}.pdf`
- [ ] **11.9** — `tests/test_reporting.py` — Mock data ile report generation test
- [ ] **11.10** — `python -m pytest tests/test_reporting.py -v` başarılı

---

## Phase 12: Web UI

**Dosyalar:** `web/app.py`, `web/routes.py`, `web/websocket_handler.py`, `web/static/`  
**Öğrenilen:** FastAPI, REST API design, WebSockets, HTML/CSS/JS

### Backend

- [ ] **12.1** — `FastAPI` app oluştur, CORS middleware ekle
- [ ] **12.2** — `POST /api/sessions` — Yeni pentest session başlat
- [ ] **12.3** — `GET /api/sessions/{id}` — Session durumunu al
- [ ] **12.4** — `POST /api/sessions/{id}/kill` — Kill switch
- [ ] **12.5** — `GET /api/sessions/{id}/report` — PDF rapor indir
- [ ] **12.6** — `WebSocket /ws/{session_id}` — Real-time agent output stream
- [ ] **12.7** — Background task: agent'ı `asyncio.create_task()` ile arka planda çalıştır

### Frontend

- [ ] **12.8** — `web/static/index.html` — Ana sayfa (4 panel layout)
- [ ] **12.9** — Config Panel: target input, mode selector, limits form
- [ ] **12.10** — Chat Panel: WebSocket bağlantısı, mesaj stream, syntax highlight
- [ ] **12.11** — Results Panel: counters (hosts/ports/vulns/exploits)
- [ ] **12.12** — Findings Table: CVSS score ile sıralı bulgular listesi
- [ ] **12.13** — Kill switch butonu (kırmızı, her zaman görünür)
- [ ] **12.14** — `web/static/app.js` — Fetch API + WebSocket client code
- [ ] **12.15** — `python -m web.app` ile `http://localhost:8000` servisi çalışmalı
- [ ] **12.16** — Browser'da manuel test: session başlat, mesajları izle, kill switch test et

---

## Phase 13: CLI Entry Point

**Dosya:** `main.py`  
**Öğrenilen:** argparse, application orchestration, entry point pattern

- [ ] **13.1** — `argparse` ile CLI argümanları tanımla (`--target`, `--mode`, `--interface`)
- [ ] **13.2** — `--target` arg: IP, CIDR range
- [ ] **13.3** — `--mode` arg: `full_auto`, `ask_before_exploit`, `scan_only`, `defend`
- [ ] **13.4** — `--interface` arg: network interface for defense mode
- [ ] **13.5** — `--protect-network` arg: CIDR range to protect
- [ ] **13.6** — Config validation: argparse output → AppConfig + SafetyConfig
- [ ] **13.7** — Mode routing: pentest agent veya defense monitor başlat
- [ ] **13.8** — Graceful shutdown: Ctrl+C → kill switch → cleanup
- [ ] **13.9** — Rich terminal başlangıç ekranı (banner, config summary)
- [ ] **13.10** — `python main.py --help` — tüm argümanlar gösterilmeli
- [ ] **13.11** — `python main.py --target 192.168.1.0/24 --mode scan_only` çalışmalı

---

## Phase 14: Testing & Polish

**Dosyalar:** `tests/`  
**Öğrenilen:** pytest, mocking, test-driven thinking, debugging

- [ ] **14.1** — `pytest.ini` veya `pyproject.toml` test konfigürasyonu
- [ ] **14.2** — `conftest.py` — Shared fixtures (mock LLM, mock DB, test targets)
- [ ] **14.3** — End-to-end integration test: `docker run metasploitable2` + full scan
- [ ] **14.4** — Coverage raporu çıkar: `pytest --cov=src --cov-report=html`
- [ ] **14.5** — Minimum %70 code coverage sağla
- [ ] **14.6** — Performance test: 10 host scan süresi < 5 dakika
- [ ] **14.7** — Memory leak check: uzun session (2 saat) sonrası RAM kullanımı
- [ ] **14.8** — Edge case: hedef offline, ağ kesilmesi, LLM timeout
- [ ] **14.9** — README.md güncelle: güncel kurulum ve kullanım adımları
- [ ] **14.10** — Kod formatı: `black`, `ruff` linting çalıştır
- [ ] **14.11** — `python -m pytest tests/ -v --cov=src` başarılı çalışmalı
- [ ] **14.12** — Demo video veya GIF: Metasploitable2 üzerinde tam demo

---

---

## 🔴 BÖLÜM B: Network Defense Module (Blue Team — Yeni Ek)

> Referans: `docs/07_NETWORK_DEFENSE_MODULE.md`

---

## Phase D1: Defense Core — Packet Sniffer

**Dosya:** `defense/sniffer.py`  
**Araç:** Scapy

### Hazırlık

- [ ] **D1.1** — `requirements.txt`'e ekle: `scapy`, `pandas`, `numpy`, `scikit-learn`, `geoip2`, `mitreattack-python`, `python-watchdog`
- [ ] **D1.2** — Root/admin privilege kontrolü (Scapy için gerekli)
- [ ] **D1.3** — Network interface listele ve kullanıcıya göster

### Sniffer

- [ ] **D1.4** — `PacketSniffer` class oluştur
- [ ] **D1.5** — `asyncio.Queue` ile producer-consumer packet pipeline
- [ ] **D1.6** — Scapy `sniff()` fonksiyonu — promiscuous mode, all interfaces
- [ ] **D1.7** — Packet filtering: sadece TCP, UDP, ICMP, ARP capture
- [ ] **D1.8** — **Time window aggregation:** 10 saniyelik bucket'lara paket topla
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
- [ ] **D1.10** — Sniffer başlatma/durdurma API (`start()`, `stop()`)
- [ ] **D1.11** — `tests/test_sniffer.py` — Mock packet injection ile test
- [ ] **D1.12** — `python -m pytest tests/test_sniffer.py -v` başarılı

---

## Phase D2: Threat Detectors

**Dosya:** `defense/detectors/`

### Port Scan Detector

- [ ] **D2.1** — `defense/detectors/port_scan_detector.py` oluştur
- [ ] **D2.2** — Per-source-IP sliding window tracker (60 saniye)
- [ ] **D2.3** — Unique destination port count tracker
- [ ] **D2.4** — **Kural 1:** >15 unique dport in 5s → `SCAN_SUSPECTED`
- [ ] **D2.5** — **Kural 2:** >50 unique ports in 30s → `SCAN_CONFIRMED`
- [ ] **D2.6** — TCP flag analizi: SYN-only → stealth scan; SYN+FIN+PSH → Xmas scan
- [ ] **D2.7** — Severity hesapla (1-10 scale)
- [ ] **D2.8** — MITRE mapping return: `T1046`

### ARP Spoof Detector

- [ ] **D2.9** — `defense/detectors/arp_detector.py` oluştur
- [ ] **D2.10** — ARP table: `{ip → mac}` dictionary
- [ ] **D2.11** — Arp reply monitor: op=2 paket → IP-MAC check
- [ ] **D2.12** — **Kural:** Bilinen IP farklı MAC ile geldi → `ARP_SPOOF_DETECTED`
- [ ] **D2.13** — Gratuitous ARP rate: >5/dakika → şüpheli
- [ ] **D2.14** — MITRE mapping: `T1557.002`

### DoS Detector

- [ ] **D2.15** — `defense/detectors/dos_detector.py` oluştur
- [ ] **D2.16** — Per-source PPS tracker (1 saniyelik window)
- [ ] **D2.17** — **Kural:** >1000 PPS total → `DOS_SUSPECTED`
- [ ] **D2.18** — **Kural:** ICMP >100 PPS → `ICMP_FLOOD`
- [ ] **D2.19** — **Kural:** SYN >500 PPS without 3-way handshake → `SYN_FLOOD`
- [ ] **D2.20** — MITRE mapping: `T1498`

### Brute Force Detector

- [ ] **D2.21** — `defense/detectors/brute_force_detector.py` oluştur
- [ ] **D2.22** — `watchdog` ile `/var/log/auth.log` file monitoring
- [ ] **D2.23** — Regex: SSH failed attempt pattern extract (IP, timestamp)
- [ ] **D2.24** — **Kural:** >5 failed SSH/dakika from same IP → `SSH_BRUTE_FORCE`
- [ ] **D2.25** — HTTP log monitoring (access.log brute force pattern)
- [ ] **D2.26** — **Kural:** >20 POST /login/dakika → `HTTP_BRUTE_FORCE`
- [ ] **D2.27** — MITRE mapping: `T1110`

### Test Suite

- [ ] **D2.28** — `tests/test_detectors.py` — Her detector için mock data ile test
- [ ] **D2.29** — True positive test: gerçek saldırı pattern ile alert üretmeli
- [ ] **D2.30** — False positive test: normal trafik ile alert üretmemeli
- [ ] **D2.31** — `python -m pytest tests/test_detectors.py -v` başarılı

---

## Phase D3: Threat Analysis Engine

**Dosya:** `defense/analyzer.py`

- [ ] **D3.1** — `ThreatAnalyzer` class oluştur
- [ ] **D3.2** — Tüm detector output'larını aggregate et
- [ ] **D3.3** — **Threat Context Object** builder:
  - [ ] `source_ip`, `target_ips`, `threat_type`
  - [ ] `evidence` (raw data summary)
  - [ ] `packet_count`, `time_window`
  - [ ] `severity_score` (0-10)
  - [ ] `detector_confidence`
- [ ] **D3.4** — Duplicate detection: aynı IP'den gelen uyarıları birleştir (30s window)
- [ ] **D3.5** — Severity threshold: >3 → LLM'e gönder; <3 → log_and_watch
- [ ] **D3.6** — Rate limiting: aynı tehdit için LLM'i max 1/dakika çağır
- [ ] **D3.7** — `tests/test_analyzer.py` — Aggregation ve dedup testleri
- [ ] **D3.8** — `python -m pytest tests/test_analyzer.py -v` başarılı

---

## Phase D4: LLM Defense Reasoning Engine

**Dosya:** `defense/llm_defender.py`

### Prompt Design

- [ ] **D4.1** — `DefensePromptBuilder` class oluştur
- [ ] **D4.2** — **System prompt** yaz: "Network security analyst, defend-only, no offensive actions"
- [ ] **D4.3** — **Threat context prompt** yaz: source IP, evidence, timing, severity
- [ ] **D4.4** — **Output schema** tanımla (JSON):
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
- [ ] **D4.5** — Few-shot examples ekle (3 örnek: port scan, ARP spoof, DoS)
- [ ] **D4.6** — "Return ONLY valid JSON" enforcement

### Engine

- [ ] **D4.7** — `LLMDefender` class oluştur
- [ ] **D4.8** — Ollama'yı primary provider kullan (hız için)
- [ ] **D4.9** — `analyze_threat(threat_context) -> DefenseDecision`
- [ ] **D4.10** — Response validation: JSON parse hatasında fallback action (`log_and_watch`)
- [ ] **D4.11** — Confidence threshold check: <0.60 → override to `log_and_watch`
- [ ] **D4.12** — Action override safety check: `block_ip` için whitelist kontrolü
- [ ] **D4.13** — `tests/test_llm_defender.py` — Mock LLM ile karar testleri
- [ ] **D4.14** — `python -m pytest tests/test_llm_defender.py -v` başarılı

---

## Phase D5: Response Engine

**Dosya:** `defense/responder.py`

### IP Blocking

- [ ] **D5.1** — `block_ip(ip, duration)` — iptables DROP rule
- [ ] **D5.2** — `unblock_ip(ip)` — iptables ACCEPT rule
- [ ] **D5.3** — Scheduled unblock: `asyncio.sleep(duration)` + auto unblock
- [ ] **D5.4** — Whitelist check: hiçbir zaman router, DNS, gateway IP'yi bloklama

### Rate Limiting

- [ ] **D5.5** — `rate_limit_ip(ip, pps)` — iptables limit rule
- [ ] **D5.6** — `remove_rate_limit(ip)` method

### Honeypot Redirect

- [ ] **D5.7** — `redirect_to_honeypot(ip, original_port, honeypot_port)` — iptables NAT rule
- [ ] **D5.8** — `remove_redirect(ip)` method

### Logging & Alerts

- [ ] **D5.9** — `log_threat(threat_context, decision, action_result)` — DB kayıt
- [ ] **D5.10** — `alert_user(message, severity)` — WebSocket push to UI
- [ ] **D5.11** — Sound alert import (critical severity için beep)

### Safety Rails (Defense version)

- [ ] **D5.12** — Protected networks listesi: `protect_ranges` config
- [ ] **D5.13** — Hiçbir action kendi sistemine uygulanmaz
- [ ] **D5.14** — Mevcut `SafetyGuard`'dan türet veya extend et

### Test

- [ ] **D5.15** — `tests/test_responder.py` — Mock subprocess ile iptables test
- [ ] **D5.16** — Whitelist bypass test (koRunmacı IP bloklamamalı)
- [ ] **D5.17** — `python -m pytest tests/test_responder.py -v` başarılı

---

## Phase D6: Honeypot Server (LLM-Powered)

**Dosya:** `defense/honeypot.py`

- [ ] **D6.1** — `LLMHoneypot` class oluştur
- [ ] **D6.2** — `asyncio` socket server başlat (configurable port, default 2222)
- [ ] **D6.3** — **Fake SSH banner:** `SSH-2.0-OpenSSH_8.4p1 Ubuntu-6ubuntu2.1`
- [ ] **D6.4** — Attacker command capture: her komutu log'la
- [ ] **D6.5** — **LLM response generation:** Ollama ile fake Linux output üret
- [ ] **D6.6** — System prompt: "Fake Ubuntu server. Give plausible but false command output. Never reveal you're fake."
- [ ] **D6.7** — Attacker session duration tracking
- [ ] **D6.8** — Tüm etkileşimleri `honeypot_log` DB tablosuna kaydet
- [ ] **D6.9** — HTTP honeypot: port 8080'de fake web panel
- [ ] **D6.10** — Fake credential harvest: attacker denediği credential'ları log'la
- [ ] **D6.11** — `tests/test_honeypot.py` — Mock socket + mock LLM test
- [ ] **D6.12** — `python -m pytest tests/test_honeypot.py -v` başarılı

---

## Phase D7: Defense Database & Integration

**Dosyalar:** `database/defense_schema.sql`, `database/defense_repositories.py`

### Yeni Tablolar

- [ ] **D7.1** — `threat_events` tablosu: timestamp, source_ip, threat_type, severity, mitre_technique, llm_analysis, action_taken
- [ ] **D7.2** — `firewall_rules` tablosu: ip_address, rule_type, reason, created_at, expires_at, active
- [ ] **D7.3** — `honeypot_log` tablosu: attacker_ip, timestamp, command, llm_response, session_duration
- [ ] **D7.4** — `traffic_baseline` tablosu: time_window, metric_name, avg_value, std_deviation

### Repositories

- [ ] **D7.5** — `ThreatEventRepository` — CRUD operations
- [ ] **D7.6** — `FirewallRuleRepository` — Active rule management + cleanup expired
- [ ] **D7.7** — `HoneypotLogRepository` — Append-only interaction log
- [ ] **D7.8** — `TrafficBaselineRepository` — Rolling average updater

### ML Baseline (Optional V1)

- [ ] **D7.9** — Scikit-learn `IsolationForest` ile normal trafik baseline öğren
- [ ] **D7.10** — Baseline training: 10 dakika normal trafik izle → model fit
- [ ] **D7.11** — Anomaly scoring: yeni window → `.predict()` → -1 ise anomali
- [ ] **D7.12** — `tests/test_defense_db.py` — in-memory SQLite ile test
- [ ] **D7.13** — `python -m pytest tests/test_defense_db.py -v` başarılı

---

## Phase D8: Defense Web UI Extension & Full Integration

**Dosyalar:** `web/routes.py` (defense endpoints), `web/static/defense.html`

### Backend Endpoints

- [ ] **D8.1** — `POST /api/defense/start` — Monitoring başlat (interface, protect_network)
- [ ] **D8.2** — `POST /api/defense/stop` — Monitoring durdur
- [ ] **D8.3** — `GET /api/defense/status` — Aktif tehdit sayısı, blocklist boyutu
- [ ] **D8.4** — `GET /api/defense/threats` — Son 50 tehdit olayı
- [ ] **D8.5** — `GET /api/defense/firewall` — Aktif iptables kuralları
- [ ] **D8.6** — `POST /api/defense/whitelist/{ip}` — IP'yi koru
- [ ] **D8.7** — `DELETE /api/defense/block/{ip}` — Manuel unblock
- [ ] **D8.8** — `WebSocket /ws/defense` — Real-time threat stream

### Frontend — Defense Tab

- [ ] **D8.9** — Ana web UI'a "Defense" tab ekle
- [ ] **D8.10** — **Network Status Panel:** Live trafik grafiği (Chart.js), host listesi, tehdit sayacı
- [ ] **D8.11** — **Threat Feed Panel:** Real-time alert stream, renk kodlu severity, LLM reasoning accordion
- [ ] **D8.12** — **Control Panel:** Start/Stop butonu, whitelist formu, hassasiyet ayarı (düşük/orta/yüksek)
- [ ] **D8.13** — **Intelligence Panel:** Saldırı timeline, MITRE ATT&CK heatmap tablosu, honeypot logları
- [ ] **D8.14** — Active firewall rules tablosu (IP, neden, ne zaman sona erer, manual unblock butonu)

### Entegrasyon Test

- [ ] **D8.15** — `python main.py --mode defend --interface eth0 --protect-network 192.168.1.0/24` çalışmalı
- [ ] **D8.16** — Başka terminalde `nmap -sS 192.168.1.1` çalıştır → UI'da alert görünmeli
- [ ] **D8.17** — LLM analizi UI'da görünmeli (reasoning text)
- [ ] **D8.18** — Block IP sonrası `nmap` ping fails olmalı (iptables kuralı çalışmalı)
- [ ] **D8.19** — Honeypot: `ssh attacker@localhost -p 2222` → LLM fake response üretmeli
- [ ] **D8.20** — PDF/HTML defense raporu (tehdit özeti, istatistikler)
- [ ] **D8.21** — End-to-end test: defense mode + pentest mode simultaneously çalıştır

---

## 📊 Genel İlerleme Özeti

| Bölüm                       | Toplam Görev | Tamamlanan | Yüzde  |
| --------------------------- | ------------ | ---------- | ------ |
| Phase 1 (Config)            | 15           | 0          | 0%     |
| Phase 2 (LLM Client)        | 14           | 0          | 0%     |
| Phase 3 (BaseTool + Nmap)   | 15           | 0          | 0%     |
| Phase 3.5 (ToolRegistry) 🆕 | 10           | 0          | 0%     |
| Phase 4 (SearchSploit)      | 9            | 0          | 0%     |
| Phase 5 (Metasploit)        | 11           | 0          | 0%     |
| Phase 6 (Safety)            | 16           | 0          | 0%     |
| Phase 7 (Memory)            | 10           | 0          | 0%     |
| Phase 8 (Agent)             | 19           | 0          | 0%     |
| Phase 9 (Prompts)           | 11           | 0          | 0%     |
| Phase 10 (Database)         | 13           | 0          | 0%     |
| Phase 11 (Reporting)        | 10           | 0          | 0%     |
| Phase 12 (Web UI)           | 16           | 0          | 0%     |
| Phase 13 (CLI)              | 11           | 0          | 0%     |
| Phase 14 (Testing)          | 12           | 0          | 0%     |
| **Pentest Toplam**          | **192**      | **0**      | **0%** |
| Phase D1 (Sniffer)          | 12           | 0          | 0%     |
| Phase D2 (Detectors)        | 31           | 0          | 0%     |
| Phase D3 (Analyzer)         | 8            | 0          | 0%     |
| Phase D4 (LLM Defender)     | 14           | 0          | 0%     |
| Phase D5 (Responder)        | 17           | 0          | 0%     |
| Phase D6 (Honeypot)         | 12           | 0          | 0%     |
| Phase D7 (Defense DB)       | 13           | 0          | 0%     |
| Phase D8 (Defense UI)       | 21           | 0          | 0%     |
| **Defense Toplam**          | **128**      | **0**      | **0%** |
| **🎯 GENEL TOPLAM**         | **320**      | **0**      | **0%** |

---

## 📝 Hızlı Referans — Önemli Komutlar

```bash
# Pentest bot başlat
python main.py --target 192.168.1.0/24 --mode full_auto

# Sadece scan
python main.py --target 192.168.1.5 --mode scan_only

# Defense mode başlat (root gerekli)
sudo python main.py --mode defend --interface eth0 --protect-network 192.168.1.0/24

# Web UI başlat
python -m web.app
# → http://localhost:8000

# Test çalıştır
python -m pytest tests/ -v --cov=src --cov-report=html

# Coverage raporu gör
open htmlcov/index.html

# Metasploitable2 practice target başlat
docker run -d --name metasploitable -p 2222:22 -p 8080:80 tleemcjr/metasploitable2

# Defense test: kendi network'ünü scan et (uyarı tetiklemeli)
nmap -sS 192.168.1.1 -p 22,80,443
```

---

> 💡 **İpucu:** Her phase için önce testi yaz (TDD), sonra implementasyonu yaparak teste geçir.
>
> 🛡️ **Güvenlik:** Defense module'ü SADECE kendi ağında test et. `--protect-network` parametresini doğru ayarla.
>
> 📖 **Referans:** Detaylı mimari için `docs/07_NETWORK_DEFENSE_MODULE.md`'yi oku.
