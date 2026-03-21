# AEGIS V2 — Harmonized Implementation Plan

> **Amaç:** Mevcut V1 altyapısını minimum değişiklikle multi-agent mimariye dönüştürmek.
> **Prensip:** Her adım kendi başına çalışır, bir sonrakine bağımlıdır ama V1 hiçbir zaman kırılmaz.
> **Uygulama:** Her adım Sonnet 4.6 ile, aşağıdaki prompt'lar kullanılarak yapılacak.

---

## Mimari Kararlar (Tutarsızlık Çözümleri)

### K1: Permission Flag Birleştirmesi
- MissionBrief'teki `allow_exploitation`, `allow_post_exploitation`, `allow_lateral_movement` KALACAK
- Eksik olanlar EKLENECEK: `allow_persistence`, `allow_credential_harvest`, `allow_data_exfil`
- MissionContext, MissionBrief'ten bu bayrakları miras alacak — tek kaynak MissionBrief

### K2: ShellManager = ShellSessionTool'un evrimi
- Yeni bir ShellManager sınıfı YAZILACAK, ShellSessionTool'un `_SESSIONS` mantığını kapsayacak
- ShellSessionTool deprecate EDİLMEYECEK — ShellManager'ın içinde tool interface olarak yaşayacak
- Metasploit session'ları da ShellManager altına taşınacak

### K3: Credentials tabloları ayrı kalacak
- Mevcut `credentials` (v5) = operator tarafından verilen encrypted store → OLDUĞU GİBİ KALACAK
- Yeni `harvested_credentials` tablosu = agent'ların bulduğu credentials → YENİ TABLO

### K4: Phase sistemi genişletilecek
- Mevcut linear phase (DISCOVERY→...→DONE) = tek agent backward compat için KALACAK
- Brain Agent kendi phase sistemini kullanacak (mission_phases tablosu)
- Specialized agent'lar phase bildirmeyecek, sadece finding/result bildirecek

### K5: Event-Driven + Brain Hybrid
- Agent'lar finding yayınlayacak (event-driven)
- Brain finding'leri dinleyip strateji güncelleyecek (reactive)
- Ama task spawn kararları hâlâ Brain'de (hierarchical)
- Böylece Brain bottleneck olmaz, ama kontrol kaybetmez

### K6: Tool Output Typing
- Her tool kategorisi için Pydantic output modeli tanımlanacak
- Mevcut `{"success": bool, "output": any}` interface korunacak ama output typed olacak
- Agent'lar arası veri akışı bu typed output üzerinden

### K7: Metasploit Concurrency
- asyncio.Semaphore(1) ile Metasploit RPC erişimi serialize edilecek
- Queue-based: agent'lar Metasploit komutlarını kuyruğa koyar, sırayla çalışır
- Shell Manager bu kuyruğu yönetir

---

## ADIM 1: BaseAgent Abstract Class

**Dosyalar:** `core/base_agent.py` (YENİ)

**Ne yapıyor:**
PentestAgent'taki ReAct loop'un ortak kısımlarını (state machine, LLM call, safety check,
event emission, pause/resume/kill) abstract bir sınıfa çıkarır. PentestAgent bunu extend eder.

**Neden önce bu:**
Tüm specialized agent'lar bu sınıftan türeyecek. Bu olmadan hiçbir agent yazılamaz.

**Bağımlılıklar:** Yok — ilk adım.

---

## ADIM 2: MissionContext + AgentMessageBus

**Dosyalar:** `core/mission_context.py` (YENİ), `core/message_bus.py` (YENİ)

**Ne yapıyor:**
- MissionContext: Tüm agent'ların okuduğu, sadece Brain'in yazdığı shared state
- AgentMessageBus: asyncio.Queue tabanlı pub/sub, agent'lar arası mesajlaşma

**Neden ikinci:**
Brain Agent ve tüm specialized agent'lar bunlara bağımlı. Altyapı olmazsa koordinasyon yok.

**Bağımlılıklar:** Adım 1 (BaseAgent tipi referans)

---

## ADIM 3: Database Migration v9 — Multi-Agent Tabloları

**Dosyalar:** `database/db.py` (GÜNCELLE), `database/repositories.py` (GÜNCELLE)

**Ne yapıyor:**
- `agent_instances` tablosu
- `agent_messages` tablosu
- `shell_sessions` tablosu
- `harvested_credentials` tablosu (mevcut credentials'tan FARKLI)
- `loot` tablosu
- `mission_phases` tablosu
- `network_nodes` + `network_edges` tabloları
- Her tablo için repository sınıfı

**Neden üçüncü:**
Agent'lar DB'ye yazacak — tablolar hazır olmalı. Ama agent kodu gerektirmez.

**Bağımlılıklar:** Yok (bağımsız yazılabilir ama mantıksal olarak Adım 1-2 ile paralel)

---

## ADIM 4: ShellManager Service

**Dosyalar:** `core/shell_manager.py` (YENİ)

**Ne yapıyor:**
- Mevcut ShellSessionTool'un `_SESSIONS` global dict'ini kapsüller
- Metasploit RPC session'larını da yönetir
- Health monitoring (heartbeat)
- Session registry (type, privilege, exploit info)
- Command routing (agent → shell manager → target)
- Auto-reconnect
- asyncio.Semaphore ile Metasploit RPC serialization

**Neden dördüncü:**
Post-Exploitation ve Lateral Movement agent'ları buna bağımlı. Brain da session durumunu
buradan okuyacak.

**Bağımlılıklar:** Adım 3 (shell_sessions tablosu)

---

## ADIM 5: BrainAgent

**Dosyalar:** `core/brain_agent.py` (YENİ)

**Ne yapıyor:**
- BaseAgent'ı extend eder ama ReAct loop yerine Plan → Delegate → Evaluate loop kullanır
- Meta-tools: spawn_agent, wait_for_agent, kill_agent, ask_user, broadcast_update
- MissionContext'i yönetir (tek writer)
- Dependency graph'a göre paralel agent spawn
- Strategy planning + re-planning on critical findings
- Agent failure handling (retry with different approach → ask user)

**Neden beşinci:**
Specialized agent'ların koordinatörü. Ama önce altyapı (BaseAgent, MessageBus, DB, ShellManager) hazır olmalı.

**Bağımlılıklar:** Adım 1, 2, 3, 4

---

## ADIM 6: ScannerAgent (İlk Specialized Agent)

**Dosyalar:** `core/agents/scanner_agent.py` (YENİ)

**Ne yapıyor:**
- BaseAgent'ı extend eder
- Mevcut NmapTool'u kullanır + yeni masscan tool
- Brain'den task alır → scan → result'ı MissionContext'e bildir
- İlk specialized agent olduğu için tüm agent lifecycle test edilir

**Neden altıncı:**
En basit specialized agent — mevcut nmap tool'u var, sadece wrapper.
Brain → Agent → Tool → Result → Brain döngüsünü valide eder.

**Bağımlılıklar:** Adım 1, 2, 5

---

## ADIM 7: ExploitAgent

**Dosyalar:** `core/agents/exploit_agent.py` (YENİ)

**Ne yapıyor:**
- Mevcut SearchSploit + Metasploit tool'larını kullanır
- CVE lookup, exploit seçimi, payload seçimi
- Shell Manager'a session kaydı
- Failure → alternatif payload → alternatif exploit → Brain'e rapor

**Bağımlılıklar:** Adım 1, 2, 4 (ShellManager), 5

---

## ADIM 8: PostExploitAgent

**Dosyalar:** `core/agents/postexploit_agent.py` (YENİ), `tools/linpeas_tool.py` (YENİ)

**Ne yapıyor:**
- Shell Manager üzerinden komut çalıştırır
- LinPEAS/WinPEAS upload + run
- Privilege escalation girişimleri
- Credential harvesting → harvested_credentials tablosu
- Persistence mekanizmaları (izin bayrakları kontrollü)

**Bağımlılıklar:** Adım 1, 2, 3, 4, 5

---

## ADIM 9: Yeni Tool Implementasyonları (Batch 1)

**Dosyalar:** `tools/masscan_tool.py`, `tools/nuclei_tool.py`, `tools/ffuf_tool.py`,
`tools/whatweb_tool.py`, `tools/nikto_tool.py`

**Ne yapıyor:**
Her biri BaseTool subclass — binary'yi çalıştırır, output'u parse eder, typed result döner.

**Bağımlılıklar:** Yok (BaseTool zaten var)

---

## ADIM 10: WebAppAgent

**Dosyalar:** `core/agents/webapp_agent.py` (YENİ)

**Ne yapıyor:**
- HTTP/HTTPS portları tespit edilince Brain tarafından spawn edilir
- whatweb → ffuf → nuclei → sqlmap pipeline
- CMS-specific scanners (wpscan)

**Bağımlılıklar:** Adım 1, 2, 5, 9 (tools)

---

## ADIM 11: OSINTAgent

**Dosyalar:** `core/agents/osint_agent.py` (YENİ), `tools/theharvester_tool.py`,
`tools/subfinder_tool.py`, `tools/whois_tool.py`, `tools/dns_tool.py`

**Ne yapıyor:**
- Domain hedeflerde otomatik spawn
- theHarvester, subfinder, WHOIS, DNS enumeration
- Subdomain/email/IP çıktılarını MissionContext'e yazar

**Bağımlılıklar:** Adım 1, 2, 5

---

## ADIM 12: LateralMovementAgent

**Dosyalar:** `core/agents/lateral_agent.py` (YENİ), `tools/crackmapexec_tool.py`,
`tools/impacket_tool.py`

**Ne yapıyor:**
- Compromised host üzerinden internal scan
- Harvested credential spray
- Pivot/tunnel setup
- network_nodes/network_edges güncelleme

**Bağımlılıklar:** Adım 1, 2, 3, 4, 5, 8 (credentials from PostExploit)

---

## ADIM 13: ReportingAgent (Refactor)

**Dosyalar:** `core/agents/reporting_agent.py` (YENİ), `reporting/report_generator.py` (GÜNCELLE)

**Ne yapıyor:**
- Mevcut report generator'ı multi-agent findings ile genişletir
- Executive summary, attack narrative, remediation
- Credentials/loot özeti
- Incremental rapor desteği

**Bağımlılıklar:** Adım 1, 2, 3, 5

---

## ADIM 14: API + WebSocket Güncellemeleri

**Dosyalar:** `web/routes.py` (GÜNCELLE), `web/websocket_handler.py` (GÜNCELLE),
`web/session_manager.py` (GÜNCELLE)

**Ne yapıyor:**
- Yeni endpoint'ler: agent management, shells, credentials, loot, attack-graph, mission-context
- Yeni WebSocket event'leri: agent_spawned, shell_opened, credential_found, vb.
- Brain'in mission start flow'una entegrasyonu

**Bağımlılıklar:** Adım 1-5 (core altyapı)

---

## ADIM 15: UI — Agent Orchestra Panel

**Dosyalar:** `web/static/index.html` (GÜNCELLE), `web/static/app.js` (GÜNCELLE),
`web/static/style.css` (GÜNCELLE)

**Ne yapıyor:**
- Brain feed + sub-agent card grid
- Enhanced attack graph (compromise levels, attack paths)
- Credentials/Loot panelleri
- Per-agent model selector
- Mission context live view

**Bağımlılıklar:** Adım 14 (API endpoint'ler)

---

## ADIM 16: PentestAgent → BaseAgent Migration

**Dosyalar:** `core/agent.py` (GÜNCELLE)

**Ne yapıyor:**
- PentestAgent artık BaseAgent'ı extend eder
- V1 backward compatibility korunur
- Brain olmadan tek başına çalışabilir (legacy mode)

**Neden en son:**
BaseAgent zaten Adım 1'de yazıldı ama PentestAgent'ın migration'ı tüm testler geçtikten sonra yapılmalı.

**Bağımlılıklar:** Adım 1, tüm testlerin geçmesi

---

# ADIM DETAYLI PROMPTLAR

Aşağıdaki her prompt, Sonnet 4.6'ya verilecek tam talimat. Her prompt:
- Bağlam (hangi dosyaları okumalı)
- Tam gereksinim listesi
- Tutarsızlık çözüm kararları
- Mevcut kodla entegrasyon noktaları
- Test gereksinimleri

içerir.

---

## PROMPT 1: BaseAgent Abstract Class

```
GÖREV: core/base_agent.py dosyasını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/agent.py (tamamını oku — 72KB, PentestAgent'ın ReAct loop'u, AgentState enum, AgentContext)
- core/memory.py (SessionMemory — bounded conversation history)
- core/safety.py (SafetyGuard — 10-rule pipeline, AgentAction)
- core/llm_client.py (LLMRouter — multi-provider LLM routing)
- core/tool_registry.py (ToolRegistry — tool management)
- tools/base_tool.py (BaseTool contract, ToolMetadata, ToolHealthStatus)

GEREKSİNİMLER:

1. BaseAgent abstract sınıfı oluştur. Bu sınıf PentestAgent'taki ortak mantığı extract eder:

```python
class BaseAgent(ABC):
    """
    Tüm AEGIS agent'larının base class'ı.
    ReAct loop (reason → act → observe → reflect) çalıştırır.
    """
```

2. Constructor parametreleri:
   - agent_id: str (unique, uuid default)
   - agent_type: str ("brain", "scanner", "exploit", "osint", "webapp", "postexploit", "lateral", "reporting")
   - mission_id: str
   - tool_registry: ToolRegistry
   - safety: SafetyGuard
   - llm_router: LLMRouter (mevcut global instance veya override)
   - progress_callback: Optional[Callable] (WebSocket event emission)
   - config: dict (agent-specific config: model override, max_iterations, vb.)

3. State Machine — AgentState enum'u core/agent.py'den IMPORT et (duplicate etme):
   IDLE → REASONING → ACTING → OBSERVING → REFLECTING → DONE/ERROR/WAITING_FOR_OPERATOR

4. Core abstract metotlar (subclass'lar override edecek):
   - async def build_system_prompt(self) -> str
   - async def build_action_prompt(self) -> str
   - async def process_result(self, tool_name: str, result: dict) -> None
   - def get_available_tools(self) -> list[str]  # bu agent'ın kullanabileceği tool isimleri

5. Core concrete metotlar (PentestAgent'tan extract — logic aynı kalsın):
   - async def run(self) -> dict  # main loop, PentestAgent.run()'dan adapt et
   - async def reason(self) -> dict  # LLM'i çağır, JSON action parse et
   - async def act(self, action: dict) -> dict  # SafetyGuard → tool.execute()
   - async def observe(self, tool_name: str, result: dict) -> None  # process + emit event
   - async def reflect(self) -> None  # optional LLM reflection
   - async def emit_event(self, event_type: str, data: dict) -> None  # progress_callback wrapper
   - async def emit_finding(self, finding: dict) -> None  # finding event + optional DB persist
   - def pause(self) / resume() / inject_message(msg) / kill()  # control methods

6. SessionMemory entegrasyonu:
   - Her agent kendi SessionMemory instance'ına sahip
   - Constructor'da oluştur, max_messages ve max_tokens config'den alınsın

7. Safety entegrasyonu:
   - act() metodu SafetyGuard.check() çağırmalı (mevcut PentestAgent'takiyle aynı mantık)
   - Safety block → event emit + log

8. Event emission formatı (mevcut WebSocket event sistemiyle uyumlu):
   ```python
   await self.emit_event("reasoning", {"agent_id": self.agent_id, "agent_type": self.agent_type, "thought": "..."})
   await self.emit_event("tool_call", {"agent_id": self.agent_id, "tool": "nmap_scan", "params": {...}})
   await self.emit_event("tool_result", {"agent_id": self.agent_id, "tool": "nmap_scan", "success": True, "output": "..."})
   ```
   Mevcut event_type'lar korunsun, sadece agent_id ve agent_type field'ları eklensin.

9. Guard mantığı (PentestAgent'tan):
   - Repeated failure guard (3 identical failures → block)
   - Max iterations guard
   - Kill switch check her iteration başında

10. LLM çağrısı:
    - self._llm_router.ask() veya stream() kullan (mevcut API)
    - System prompt = build_system_prompt() (abstract, her agent kendi promptını verir)
    - Action prompt = build_action_prompt() (abstract)
    - JSON response parse (mevcut PentestAgent'taki _parse_action mantığı)

11. Tool execution:
    - get_available_tools() → bu agent'ın kullanabileceği tool'lar
    - Agent sadece kendi tool'larını görsün (LLM'e sadece onlar gönderilsin)
    - tool_registry.get(name).execute(params)

12. Result format (run() dönüşü):
    ```python
    {
        "agent_id": str,
        "agent_type": str,
        "status": "success" | "partial" | "failed" | "killed",
        "findings": list[dict],
        "iterations": int,
        "error": str | None
    }
    ```

13. Logging:
    - logger = logging.getLogger(f"aegis.agent.{agent_type}")
    - Her state transition logla

DİKKAT EDİLECEKLER:
- PentestAgent'ı BOZMA. BaseAgent ayrı bir dosya. PentestAgent henüz BaseAgent'ı extend etmeyecek (bu Adım 16'da yapılacak).
- Import cycle'lardan kaçın. BaseAgent, PentestAgent'ı import etmemeli.
- asyncio best practices: proper cancellation handling, try/except CancelledError
- Type hints kullan ama aşırı karmaşıklaştırma

TEST GEREKSİNİMLERİ:
- tests/test_base_agent.py oluştur
- Mock LLM, mock ToolRegistry, mock SafetyGuard ile test et
- State transitions test et (IDLE → REASONING → ACTING → ...)
- Pause/resume/kill test et
- Safety block event emission test et
- Max iterations guard test et
- En az 15 test yaz
```

---

## PROMPT 2: MissionContext + AgentMessageBus

```
GÖREV: core/mission_context.py ve core/message_bus.py dosyalarını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- models/mission.py (MissionBrief — permission flags, scope, credentials)
- core/base_agent.py (Adım 1'de oluşturduğun BaseAgent)
- models/scan_result.py (Host, Port data modelleri)
- models/vulnerability.py (Vulnerability modeli)
- models/exploit_result.py (ExploitResult)
- database/repositories.py (mevcut repository pattern)

=== DOSYA 1: core/mission_context.py ===

GEREKSİNİMLER:

1. MissionContext dataclass — tüm mission state'i tutar:

```python
@dataclass
class MissionContext:
    # ── Identity ──
    mission_id: str
    target: str | list[str]
    scope: list[str]           # allowed CIDR ranges
    mode: str                  # "full_auto" | "ask_before_exploit" | "scan_only"
    environment_type: str      # "production" | "staging" | "lab" | "unknown"
    operator_notes: str

    # ── Permission flags (MissionBrief'ten miras — TEK KAYNAK) ──
    allow_exploitation: bool = False
    allow_post_exploitation: bool = False
    allow_lateral_movement: bool = False
    allow_persistence: bool = False           # YENİ
    allow_credential_harvest: bool = False     # YENİ
    allow_data_exfil: bool = False            # YENİ
    allow_docker_escape: bool = False
    allow_browser_recon: bool = False

    # ── Discovery state ──
    domains: list[str]
    subdomains: list[str]
    ip_addresses: list[str]
    emails: list[str]

    # ── Scan results ──
    hosts: dict[str, HostInfo]   # ip → HostInfo

    # ── Vulnerabilities ──
    vulnerabilities: list[VulnInfo]

    # ── Access ──
    active_sessions: list[SessionInfo]
    credentials: list[HarvestedCredential]

    # ── Progress ──
    phase: str
    completed_tasks: list[str]
    active_agents: dict[str, AgentStatus]

    # ── Intelligence ──
    attack_graph: AttackGraph
    loot: list[LootItem]
```

2. Yardımcı dataclass'lar (aynı dosyada):
   - HostInfo: ip, hostname, os_type, os_version, ports: list[PortInfo], compromise_level: int
   - PortInfo: number, state, service, version, scripts: dict
   - VulnInfo: title, cve_id, cvss, host_ip, port, service, exploit_path
   - SessionInfo: session_id, host_ip, type, privilege_level, username, status
   - HarvestedCredential: source_host, username, password, hash, hash_type, credential_type, service, valid_on
   - AgentStatus: agent_id, agent_type, status, current_task, started_at, progress
   - LootItem: source_host, loot_type, description, content, file_path
   - AttackGraph: nodes: list[AttackNode], edges: list[AttackEdge]
   - AttackNode: id, ip, hostname, compromise_level, node_type
   - AttackEdge: from_node, to_node, edge_type, description, timestamp

3. MissionContext factory method:
   ```python
   @classmethod
   def from_mission_brief(cls, mission_id: str, brief: MissionBrief, target: str) -> "MissionContext":
       """MissionBrief'ten MissionContext oluştur — permission flag'leri doğrudan aktar."""
   ```

4. Thread-safe okuma/yazma:
   - asyncio.Lock kullan
   - read metotları lock almadan okuyabilir (eventually consistent OK)
   - write metotları lock ile serialize edilsin
   - update_host(), add_vulnerability(), add_credential(), add_session(), vb. helper metotlar

5. Snapshot/serialize:
   - to_dict() → JSON-serializable dict (DB persist ve API response için)
   - to_summary() → Brain LLM'ine verilecek kısa özet string

=== DOSYA 2: core/message_bus.py ===

GEREKSİNİMLER:

1. AgentMessage dataclass:
```python
@dataclass
class AgentMessage:
    id: str                    # uuid
    from_agent: str            # agent_id veya "brain" veya "user"
    to_agent: str              # agent_id veya "brain" veya "broadcast"
    message_type: str          # "task" | "result" | "finding" | "status" | "question" | "answer" | "kill" | "inject"
    priority: str              # "critical" | "high" | "normal" | "low"
    payload: dict
    correlation_id: str        # request/response eşleştirme
    timestamp: float           # time.time()
```

2. TaskPayload helper (Brain → Agent):
```python
@dataclass
class TaskPayload:
    task_description: str       # doğal dil görev açıklaması
    context: dict              # ilgili MissionContext subset'i
    constraints: dict          # scope, time limit, tool restrictions
    success_criteria: list[str] # tamamlanma koşulları
    timeout: float             # saniye
```

3. AgentMessageBus sınıfı:
```python
class AgentMessageBus:
    def __init__(self, mission_id: str):
        self._queues: dict[str, asyncio.Queue] = {}  # agent_id → inbox
        self._subscribers: dict[str, list[Callable]]  = {}  # event_type → callbacks
        self._history: list[AgentMessage] = []        # tüm mesajlar (DB persist için)
```

4. Core API:
   - register_agent(agent_id) → Queue oluştur
   - unregister_agent(agent_id) → Queue temizle
   - send(message: AgentMessage) → hedef agent'ın queue'suna koy
   - broadcast(message: AgentMessage) → tüm agent'lara gönder
   - receive(agent_id, timeout) → kendi queue'sundan al (async)
   - subscribe(event_type, callback) → finding/status event'lerini dinle
   - get_history(agent_id=None) → mesaj geçmişi

5. Brain'e özel:
   - wait_for_result(correlation_id, timeout) → belirli bir task'ın sonucunu bekle
   - get_pending_questions() → cevaplanmamış agent soruları

6. DB persistence:
   - Her mesaj agent_messages tablosuna yazılsın (async, non-blocking)
   - Repository injection: constructor'a repository parametre olarak gelsin

7. WebSocket bridge:
   - on_message callback: her mesaj WebSocket'e de emit edilsin (agent_message event)

DİKKAT EDİLECEKLER:
- asyncio.Queue thread-safe — ama subscriber callback'leri exception-safe olmalı
- Message history memory'de sınırlı tutulsun (son 1000 mesaj), DB'de sınırsız
- Deadlock riski: Brain wait_for_result + agent send_to_brain aynı anda → timeout ile çöz

TEST GEREKSİNİMLERİ:
- tests/test_mission_context.py: oluşturma, update, thread-safety, serialization
- tests/test_message_bus.py: send/receive, broadcast, timeout, history
- En az 20 test toplam
```

---

## PROMPT 3: Database Migration v9

```
GÖREV: database/db.py'ye v9 migration ekle ve database/repositories.py'ye yeni repository sınıfları ekle.

BAĞLAM — Önce şu dosyaları oku ve anla:
- database/db.py (tamamını oku — mevcut migration sistemi v1-v8)
- database/schema.sql (mevcut pentest tabloları)
- database/repositories.py (mevcut repository pattern)
- core/mission_context.py (Adım 2'de oluşturulan MissionContext dataclass'ları)

GEREKSİNİMLER:

1. database/db.py'de init_db() fonksiyonuna v9 migration ekle:

```sql
-- v9: Multi-agent architecture tables

-- Agent instances — her spawn edilen agent'ın kaydı
CREATE TABLE IF NOT EXISTS agent_instances (
    id              TEXT PRIMARY KEY,
    mission_id      TEXT NOT NULL,
    agent_type      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'spawning',
    task_description TEXT,
    llm_provider    TEXT,
    llm_model       TEXT,
    parent_agent_id TEXT,
    started_at      REAL,
    finished_at     REAL,
    result_json     TEXT,
    error_message   TEXT,
    iterations      INTEGER DEFAULT 0,
    FOREIGN KEY (mission_id) REFERENCES pentest_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_instances_mission ON agent_instances(mission_id, status);

-- Agent messages — inter-agent iletişim logu
CREATE TABLE IF NOT EXISTS agent_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id      TEXT NOT NULL,
    from_agent      TEXT NOT NULL,
    to_agent        TEXT NOT NULL,
    message_type    TEXT NOT NULL,
    priority        TEXT DEFAULT 'normal',
    payload_json    TEXT,
    correlation_id  TEXT,
    created_at      REAL DEFAULT (unixepoch('now','subsec'))
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_mission ON agent_messages(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_messages_correlation ON agent_messages(correlation_id);

-- Shell sessions — persistent shell tracking
CREATE TABLE IF NOT EXISTS shell_sessions (
    id                  TEXT PRIMARY KEY,
    mission_id          TEXT NOT NULL,
    host_ip             TEXT NOT NULL,
    port                INTEGER,
    session_type        TEXT NOT NULL,
    privilege_level     INTEGER DEFAULT 0,
    username            TEXT,
    os_type             TEXT,
    os_version          TEXT,
    msf_session_id      INTEGER,
    exploit_used        TEXT,
    exploit_options_json TEXT,
    status              TEXT DEFAULT 'active',
    last_heartbeat      REAL,
    opened_at           REAL,
    closed_at           REAL,
    FOREIGN KEY (mission_id) REFERENCES pentest_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_shell_sessions_mission ON shell_sessions(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_shell_sessions_host ON shell_sessions(host_ip, status);

-- Harvested credentials — agent'ların bulduğu credentials (mevcut credentials tablosundan FARKLI)
CREATE TABLE IF NOT EXISTS harvested_credentials (
    id              TEXT PRIMARY KEY,
    mission_id      TEXT NOT NULL,
    source_host     TEXT,
    username        TEXT,
    password        TEXT,
    hash            TEXT,
    hash_type       TEXT,
    private_key     TEXT,
    credential_type TEXT,
    service         TEXT,
    valid_on        TEXT,
    found_by_agent  TEXT,
    created_at      REAL DEFAULT (unixepoch('now','subsec')),
    FOREIGN KEY (mission_id) REFERENCES pentest_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_harvested_creds_mission ON harvested_credentials(mission_id);

-- Loot — exfiltrated data
CREATE TABLE IF NOT EXISTS loot (
    id              TEXT PRIMARY KEY,
    mission_id      TEXT NOT NULL,
    source_host     TEXT,
    source_path     TEXT,
    loot_type       TEXT,
    description     TEXT,
    content         TEXT,
    file_path       TEXT,
    found_by_agent  TEXT,
    created_at      REAL DEFAULT (unixepoch('now','subsec')),
    FOREIGN KEY (mission_id) REFERENCES pentest_sessions(id)
);

-- Mission phases — high-level phase tracking
CREATE TABLE IF NOT EXISTS mission_phases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id      TEXT NOT NULL,
    phase_name      TEXT NOT NULL,
    status          TEXT DEFAULT 'pending',
    started_at      REAL,
    finished_at     REAL,
    summary         TEXT,
    FOREIGN KEY (mission_id) REFERENCES pentest_sessions(id)
);

-- Network topology — attack graph data
CREATE TABLE IF NOT EXISTS network_nodes (
    id              TEXT PRIMARY KEY,
    mission_id      TEXT NOT NULL,
    ip_address      TEXT NOT NULL,
    hostname        TEXT,
    os_type         TEXT,
    os_version      TEXT,
    domain          TEXT,
    is_domain_controller INTEGER DEFAULT 0,
    compromise_level INTEGER DEFAULT 0,
    first_seen      REAL,
    last_seen       REAL,
    FOREIGN KEY (mission_id) REFERENCES pentest_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_network_nodes_mission ON network_nodes(mission_id);

CREATE TABLE IF NOT EXISTS network_edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id      TEXT NOT NULL,
    from_node       TEXT NOT NULL,
    to_node         TEXT NOT NULL,
    edge_type       TEXT,
    description     TEXT,
    created_at      REAL DEFAULT (unixepoch('now','subsec')),
    FOREIGN KEY (mission_id) REFERENCES pentest_sessions(id)
);
```

2. database/repositories.py'ye yeni repository sınıfları ekle:

- AgentInstanceRepository:
  - create(mission_id, agent_id, agent_type, task, provider, model, parent_id) → dict
  - update_status(agent_id, status, result_json=None, error=None, iterations=None)
  - get(agent_id) → dict | None
  - list_by_mission(mission_id) → list[dict]
  - list_active(mission_id) → list[dict]

- AgentMessageRepository:
  - save(message: AgentMessage) → int
  - get_by_mission(mission_id, limit=100) → list[dict]
  - get_by_correlation(correlation_id) → list[dict]

- ShellSessionRepository:
  - save(session_data: dict) → dict
  - update_status(session_id, status, last_heartbeat=None)
  - get(session_id) → dict | None
  - list_active(mission_id) → list[dict]
  - list_by_host(host_ip, mission_id) → list[dict]

- HarvestedCredentialRepository:
  - save(cred_data: dict) → dict
  - list_by_mission(mission_id) → list[dict]
  - list_by_host(host_ip) → list[dict]

- LootRepository:
  - save(loot_data: dict) → dict
  - list_by_mission(mission_id) → list[dict]

- MissionPhaseRepository:
  - create(mission_id, phase_name) → dict
  - update_status(phase_id, status, summary=None)
  - list_by_mission(mission_id) → list[dict]

- NetworkGraphRepository:
  - add_node(node_data: dict) → dict
  - update_node(node_id, updates: dict)
  - add_edge(edge_data: dict) → dict
  - get_graph(mission_id) → dict  # {nodes: [...], edges: [...]}

3. Mevcut migration pattern'ını aynen takip et:
   - try/except ile idempotent olsun
   - schema_migrations tablosuna kaydet
   - Logger ile migration versiyonunu logla

4. Repository'ler mevcut pattern'ı takip etsin:
   - Tüm metotlar async
   - db_path parametresi opsiyonel (test için)
   - aiosqlite.connect kullan
   - Row factory ile dict döndür

DİKKAT EDİLECEKLER:
- Mevcut credentials tablosu (v5) DOKUNMA — bu operator store. Yeni tablo harvested_credentials.
- unixepoch() SQLite 3.38+ gerektirir — Kali'de sorun olmaz ama fallback olarak REAL default yaz
- Foreign key'ler referans bütünlüğü için ama SQLite'da enforce edilmesi PRAGMA foreign_keys=ON gerektirir — mevcut kodda yoksa ekleme

TEST GEREKSİNİMLERİ:
- tests/test_database.py'ye v9 migration testleri ekle
- Her repository için CRUD testi
- En az 25 test
```

---

## PROMPT 4: ShellManager Service

```
GÖREV: core/shell_manager.py dosyasını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- tools/shell_session_tool.py (TAMAMINI oku — mevcut shell management, _SESSIONS dict, SSH/bind/reverse)
- tools/metasploit_tool.py (TAMAMINI oku — RPC session management, session_exec, sessions action)
- core/mission_context.py (Adım 2 — SessionInfo dataclass)
- database/repositories.py (Adım 3 — ShellSessionRepository)
- core/message_bus.py (Adım 2 — event emission)

GEREKSİNİMLER:

1. ShellManager sınıfı — singleton service, LLM KULLANMAZ:

```python
class ShellManager:
    """
    Tüm aktif shell session'larının single source of truth'u.
    Agent'lar asla doğrudan Metasploit/ShellSession ile konuşmaz — buradan geçer.
    """
    def __init__(self, mission_id: str, message_bus: AgentMessageBus, msf_config: dict):
        self._sessions: dict[str, ManagedSession] = {}
        self._msf_semaphore = asyncio.Semaphore(1)  # Metasploit RPC serialize
        self._heartbeat_task: asyncio.Task | None = None
        self._mission_id = mission_id
        self._message_bus = message_bus
        self._repo = ShellSessionRepository()
```

2. ManagedSession dataclass:
```python
@dataclass
class ManagedSession:
    session_id: str
    host_ip: str
    port: int
    session_type: str          # "meterpreter" | "shell" | "ssh" | "web_shell"
    privilege_level: int       # 0=www-data, 1=user, 2=service, 3=root/SYSTEM
    username: str
    os_type: str              # "linux" | "windows" | "macos"
    os_version: str
    msf_session_id: int | None
    exploit_used: str | None
    exploit_options: dict | None
    status: str               # "active" | "lost" | "closed"
    last_heartbeat: float
    opened_at: float
    # Internal references (not persisted)
    _shell_key: str | None     # ShellSessionTool session key
    _ssh_client: object | None # paramiko SSHClient reference
```

3. Session Registration (Exploit Agent çağırır):
   - register_session(host_ip, port, session_type, msf_session_id, exploit_used, exploit_options, privilege_level, username, os_type) → session_id
   - İç mantık: ManagedSession oluştur, DB'ye kaydet, event emit ("shell_opened")
   - Mevcut ShellSessionTool._SESSIONS ile senkronize et (eğer SSH/bind session ise)

4. Session Query API (tüm agent'lar kullanır):
   - get_session(host_ip, min_privilege=0) → ManagedSession | None  # en yüksek privilege'lı session
   - list_sessions() → list[ManagedSession]
   - session_info(session_id) → ManagedSession | None
   - has_session(host_ip) → bool

5. Command Execution (agent'lar buradan komut çalıştırır):
   - execute(session_id, command, timeout=60) → str  # output
   - İç mantık:
     a. Session type kontrol et
     b. Meterpreter → MetasploitTool session_exec (semaphore ile)
     c. SSH → ShellSessionTool exec (doğrudan)
     d. Shell → ShellSessionTool exec (doğrudan)
     e. Timeout handling, output truncation

6. File Operations:
   - upload_file(session_id, local_path, remote_path) → bool
   - download_file(session_id, remote_path) → bytes | None
   - İç mantık: session type'a göre Meterpreter upload/download veya SSH scp

7. Session Upgrade:
   - upgrade_session(session_id) → bool  # shell → meterpreter upgrade attempt
   - Meterpreter'a yükselemezse False dön, mevcut session'ı koru

8. Health Monitoring:
   - start_heartbeat(interval=30) → asyncio task başlat
   - _heartbeat_loop(): her session için:
     a. Meterpreter: sysinfo komutu gönder
     b. SSH: echo test
     c. Shell: echo test
     d. Timeout → status = "lost", event emit ("shell_lost")
   - stop_heartbeat()

9. Auto-Reconnect:
   - _attempt_reconnect(session: ManagedSession) → bool
   - exploit_used ve exploit_options kaydedilmişse → MetasploitTool ile tekrar exploit
   - SSH session ise → SSH reconnect
   - Başarılı → status = "active", event emit ("shell_reconnected")
   - Başarısız → Brain'e bildir

10. Session Close:
    - close_session(session_id) → None  # graceful close
    - close_all() → None  # mission end cleanup

11. Metasploit RPC Serialization:
    - _msf_execute(command) wrapper: semaphore acquire → execute → release
    - Tüm Metasploit RPC çağrıları bu wrapper üzerinden

12. Event Emission:
    - "shell_opened": {session_id, host_ip, type, privilege_level}
    - "shell_lost": {session_id, host_ip, reason}
    - "shell_reconnected": {session_id, host_ip}
    - WebSocket + MessageBus'a gönder

13. DB Persistence:
    - Her session değişikliğinde ShellSessionRepository güncelle
    - Mission resume: DB'den session'ları yükle (ama reconnect gerekebilir)

DİKKAT EDİLECEKLER:
- ShellSessionTool ve MetasploitTool'u MODIFY ETME — ShellManager onları KULLANIR, onların yerine geçmez
- ShellSessionTool._SESSIONS global dict'ine referans tut ama ownership ShellManager'da olsun
- asyncio.Semaphore(1) ile Metasploit RPC tek seferde tek komut
- Heartbeat task'ı CancelledError handle etmeli (mission kill)
- Session drop sırasında agent'lar execute() çağırırsa: ConnectionLost exception → agent retry logic'e bırak

TEST GEREKSİNİMLERİ:
- tests/test_shell_manager.py
- Mock MetasploitTool, mock ShellSessionTool
- Session register/query/execute/close lifecycle
- Heartbeat failure → shell_lost event
- Reconnect logic
- Semaphore serialization (2 concurrent execute çağrısı)
- En az 15 test
```

---

## PROMPT 5: BrainAgent

```
GÖREV: core/brain_agent.py dosyasını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/base_agent.py (Adım 1 — BaseAgent abstract class, ReAct loop)
- core/mission_context.py (Adım 2 — MissionContext, tüm helper dataclass'lar)
- core/message_bus.py (Adım 2 — AgentMessageBus, TaskPayload)
- core/shell_manager.py (Adım 4 — ShellManager)
- core/agent.py (PentestAgent — ilham kaynağı, ama Brain farklı çalışır)
- core/prompts.py (PromptBuilder — mevcut prompt system, system prompt pattern)
- models/mission.py (MissionBrief — permission flags)

GEREKSİNİMLER:

1. BrainAgent sınıfı — BaseAgent'ı extend eder AMA farklı loop kullanır:

```python
class BrainAgent(BaseAgent):
    """
    Koordinatör agent. Düşünce döngüsü:
    PLAN → DELEGATE → MONITOR → EVALUATE → (re-PLAN veya DONE)

    ReAct loop'tan farkı:
    - Brain doğrudan tool çalıştırmaz (meta-tool'lar hariç)
    - Brain agent spawn eder ve sonuçlarını değerlendirir
    - Brain paralel agent'lar çalıştırabilir
    """
```

2. Constructor ek parametreler:
   - mission_context: MissionContext
   - message_bus: AgentMessageBus
   - shell_manager: ShellManager
   - agent_factory: Callable  # agent type → BaseAgent instance oluşturucu
   - max_concurrent_agents: int = 8

3. Meta-Tools (Brain'in LLM'ine sunulan tool'lar — gerçek pentest tool'ları DEĞİL):

```python
BRAIN_TOOLS = [
    {
        "name": "spawn_agent",
        "description": "Bir specialized agent başlat. Agent türleri: scanner, exploit, osint, webapp, postexploit, lateral, reporting",
        "parameters": {
            "agent_type": "string — scanner|exploit|osint|webapp|postexploit|lateral|reporting",
            "task_description": "string — agent'a verilecek görev açıklaması (doğal dil)",
            "context": "object — ilgili bilgiler (target IP'ler, bulunan portlar, vb.)",
            "priority": "string — critical|high|normal|low",
            "timeout": "number — saniye (default: 600)"
        }
    },
    {
        "name": "wait_for_agents",
        "description": "Belirtilen agent'ların tamamlanmasını bekle",
        "parameters": {
            "agent_ids": "array of string — beklenecek agent ID'leri",
            "timeout": "number — maksimum bekleme süresi (saniye)"
        }
    },
    {
        "name": "kill_agent",
        "description": "Çalışan bir agent'ı durdur",
        "parameters": {
            "agent_id": "string"
        }
    },
    {
        "name": "ask_user",
        "description": "Operatöre soru sor — belirsiz durumlar, onay gereken kararlar için",
        "parameters": {
            "question": "string"
        }
    },
    {
        "name": "update_strategy",
        "description": "Mission stratejisini güncelle ve yeni phase başlat",
        "parameters": {
            "new_phase": "string",
            "reasoning": "string — neden strateji değişiyor",
            "next_steps": "array of string"
        }
    },
    {
        "name": "write_finding",
        "description": "Önemli bir bulguyu kaydet",
        "parameters": {
            "category": "string — vuln|credential|access|config|info",
            "data": "object"
        }
    },
    {
        "name": "generate_report",
        "description": "Mission raporunu oluştur (genellikle son adım)",
        "parameters": {
            "report_type": "string — interim|final"
        }
    }
]
```

4. Brain Loop (run() override):
```python
async def run(self):
    # 1. PLAN: Mission parametrelerini analiz et, ilk strateji oluştur
    plan = await self._create_initial_plan()

    # 2. EXECUTE PLAN: Her adımı sırayla veya paralel çalıştır
    while not self._is_done() and self._iteration < self._max_iterations:
        # a. Mevcut durumu değerlendir
        assessment = await self._assess_situation()

        # b. LLM'den sonraki aksiyonu al (meta-tool seçimi)
        action = await self.reason()

        # c. Meta-tool çalıştır
        result = await self._execute_meta_tool(action)

        # d. Sonucu değerlendir, MissionContext güncelle
        await self._evaluate_and_update(result)

        # e. Kritik finding geldi mi kontrol et (mid-loop event check)
        await self._check_critical_findings()

        self._iteration += 1

    # 3. FINALIZE: Rapor oluştur, kaynakları temizle
    await self._finalize_mission()
```

5. Agent Spawn Mekanizması:
   - spawn_agent meta-tool çağrıldığında:
     a. agent_factory(agent_type) ile yeni agent instance oluştur
     b. TaskPayload oluştur (description, context, constraints, success_criteria)
     c. asyncio.create_task(agent.run()) ile arka planda başlat
     d. AgentInstanceRepository'ye kaydet
     e. MessageBus'a register et
     f. Event emit: "agent_spawned"
     g. agent_id döndür

6. Parallel Agent Coordination:
   - wait_for_agents: asyncio.gather(*[wait_single(aid) for aid in agent_ids])
   - Her agent result geldiğinde MissionContext'i güncelle
   - Dependency graph: Brain LLM buna karar verir (prompt'ta encode edilir)

7. Critical Finding Fast Path:
   - MessageBus'tan "finding" type mesajları dinle
   - priority="critical" olanları hemen değerlendir (shell opened, root access, vb.)
   - Gerekirse mevcut planı revize et

8. Failure Handling:
   - Agent "failed" → Brain LLM'e rapor et, alternatif yaklaşım sor
   - 3 ardışık failure → ask_user
   - Agent timeout → kill + Brain'e bildir

9. System Prompt (build_system_prompt override):
```
Sen AEGIS'in Brain Agent'ısın — senior pentester gibi düşünürsün.

Görevin: Bir penetrasyon testi mission'ını koordine etmek.

Kullanabildiğin araçlar:
{meta_tools}

Mevcut mission durumu:
{mission_context.to_summary()}

Aktif agent'lar:
{active_agents_summary}

Kurallar:
1. Asla doğrudan pentest tool'u çalıştırma — agent spawn et
2. Mümkün olduğunda agent'ları paralel çalıştır
3. Permission flag'leri kontrol et: {permission_flags}
4. Kritik bulgu geldiğinde stratejiyi hemen güncelle
5. Emin olmadığında operatöre sor (ask_user)
6. Her agent'a net, spesifik görev ver — genel olmayan talimatlar
```

10. Action Prompt (build_action_prompt override):
```
Son gelişmeler:
{recent_events}

Tamamlanan görevler:
{completed_tasks}

Bekleyen sonuçlar:
{pending_results}

Şu anda ne yapmalısın? JSON formatında cevap ver:
{"tool": "spawn_agent|wait_for_agents|kill_agent|ask_user|update_strategy|write_finding|generate_report", "params": {...}}
```

11. MissionContext güncelleme:
    - Scanner result → hosts, ports, services güncelle
    - Exploit result → active_sessions, attack_graph güncelle
    - OSINT result → domains, subdomains, emails güncelle
    - PostExploit result → credentials, loot güncelle
    - Her güncelleme sonrası to_summary() yeniden oluştur

DİKKAT EDİLECEKLER:
- Brain kendi ReAct loop'unu run etmeli (BaseAgent.run() KULLANMA, override et)
- agent_factory pattern: Brain agent type bilir ama concrete class import etmez
- asyncio task management: agent task'ları doğru cancel edilmeli
- LLM response parsing: meta-tool JSON format, fallback handling
- MissionContext write lock: sadece Brain yazar, agent'lar propose eder (MessageBus üzerinden)

TEST GEREKSİNİMLERİ:
- tests/test_brain_agent.py
- Mock agent factory, mock LLM, mock message bus
- Plan → spawn → wait → evaluate cycle
- Parallel agent spawn
- Critical finding fast path
- Agent failure handling
- ask_user flow
- En az 20 test
```

---

## PROMPT 6: ScannerAgent

```
GÖREV: core/agents/ dizinini oluştur, core/agents/__init__.py ve core/agents/scanner_agent.py dosyalarını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/base_agent.py (Adım 1 — BaseAgent)
- core/mission_context.py (Adım 2 — MissionContext, HostInfo, PortInfo)
- core/message_bus.py (Adım 2 — AgentMessageBus)
- tools/nmap_tool.py (mevcut NmapTool — scan types, output format)
- core/agent.py'deki reason/act/observe metotları (ReAct pattern referansı)

GEREKSİNİMLER:

1. ScannerAgent(BaseAgent) — network scanning specialist:

```python
class ScannerAgent(BaseAgent):
    """
    Network discovery ve service enumeration uzmanı.
    Strateji: masscan (hızlı/geniş) → nmap (hedefli/derin) → script scan (servis-spesifik)
    """
    ALLOWED_TOOLS = ["nmap_scan", "masscan"]  # sadece bunları kullanabilir
```

2. build_system_prompt() override:
```
Sen AEGIS Scanner Agent'ısın — network enumeration uzmanısın.

Görevin: {task_description}

Kullanabildiğin araçlar:
{tools}

Strateji:
1. İlk olarak hızlı port taraması yap (nmap ile top ports veya belirtilen port aralığı)
2. Bulunan açık portlara servis/versiyon tespiti yap
3. İlginç servislere NSE script taraması yap
4. OS detection gerekiyorsa yap

Hedef: {target}
Kısıtlamalar: {constraints}
Port aralığı: {port_range}
Hız profili: {speed_profile}

Her adımda JSON formatında cevap ver:
{"tool": "nmap_scan", "params": {...}}

Tüm portları taradığında ve servisleri tespit ettiğinde:
{"tool": "done", "params": {"summary": "..."}}
```

3. build_action_prompt() override:
   - Şimdiye kadar bulunan host'lar ve portlar
   - Hangi host'lar henüz taranmadı
   - Hangi portlara servis tespiti yapılmadı

4. process_result() override:
   - nmap_scan sonucunu parse et
   - Yeni host/port bulunduğunda finding emit et
   - MissionContext'e update önerisi gönder (MessageBus üzerinden)

5. get_available_tools() → ["nmap_scan", "masscan"] (ileride masscan eklenecek, şimdilik sadece nmap)

6. Scanning Strategy Logic:
   - Phase 1: Host discovery (nmap ping scan)
   - Phase 2: Port scan (top-1000 veya full range)
   - Phase 3: Service/version detection (bulunan portlara)
   - Phase 4: NSE scripts (ilginç servislere: http, smb, ssl, vb.)
   - Phase 5: OS detection (istenirse)
   - Her phase tamamlandığında finding emit et

7. Result format:
```python
{
    "status": "success",
    "findings": [
        {"type": "host_discovered", "ip": "10.0.0.5", "os": "Linux"},
        {"type": "port_open", "ip": "10.0.0.5", "port": 80, "service": "http", "version": "nginx 1.24"},
        {"type": "port_open", "ip": "10.0.0.5", "port": 22, "service": "ssh", "version": "OpenSSH 8.9"},
    ],
    "hosts_scanned": 5,
    "ports_found": 12
}
```

8. __init__.py:
```python
from core.agents.scanner_agent import ScannerAgent
# diğerleri eklendikçe buraya import edilecek
```

DİKKAT EDİLECEKLER:
- NmapTool'un mevcut API'sini kullan — tool'u modify etme
- NmapTool output format: {"success": true, "output": {"hosts": [{"ip": "...", "ports": [...]}]}}
- Scanner sadece recon yapar, ASLA exploit çalıştırmaz
- Çok büyük subnet'lerde (>/16) ilk scan'i sınırla, Brain'e rapor et

TEST GEREKSİNİMLERİ:
- tests/test_scanner_agent.py
- Mock NmapTool ile scan lifecycle testi
- Phase progression testi
- Finding emission testi
- En az 10 test
```

---

## PROMPT 7: ExploitAgent

```
GÖREV: core/agents/exploit_agent.py dosyasını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/base_agent.py (BaseAgent)
- core/agents/scanner_agent.py (Adım 6 — pattern referansı)
- core/shell_manager.py (Adım 4 — session registration)
- core/mission_context.py (Adım 2)
- tools/searchsploit_tool.py (mevcut SearchSploitTool)
- tools/metasploit_tool.py (mevcut MetasploitTool — run, search, sessions, session_exec)
- database/knowledge_base.py (mevcut KnowledgeBase — successful exploit tracking)

GEREKSİNİMLER:

1. ExploitAgent(BaseAgent):
   ALLOWED_TOOLS = ["searchsploit_search", "metasploit_run"]

2. Task context'ten alacakları:
   - target_host: str (IP)
   - target_port: int
   - service: str
   - version: str
   - known_vulns: list (Scanner'dan gelen CVE'ler)

3. Exploitation Strategy (LLM prompt'ta encode):
   a. KnowledgeBase'den bu service+version için bilinen exploit var mı kontrol et
   b. searchsploit ile exploit ara
   c. CVE + CVSS'e göre prioritize et (yüksek CVSS, güvenilir exploit önce)
   d. Metasploit'te check() desteği varsa önce check çalıştır
   e. Exploit çalıştır, başarısızsa alternatif payload dene
   f. 3 başarısız deneme → farklı exploit dene
   g. 5 toplam başarısızlık → Brain'e rapor et, guidance iste

4. Shell Manager entegrasyonu:
   - Exploit başarılı + session açıldıysa → ShellManager.register_session() çağır
   - Event emit: "exploit_success" + "shell_opened"
   - Exploit info'yu (module + options) kaydet (reconnect için)

5. Safety entegrasyonu:
   - mode == "ask_before_exploit" → Brain üzerinden user'a sor (ask_user message)
   - mode == "scan_only" → exploit ÇALIŞTIRMA, sadece vulnerability rapor et
   - allow_exploitation == False → çalıştırma

6. Result format:
```python
{
    "status": "success|partial|failed",
    "findings": [
        {"type": "vulnerability", "cve": "CVE-2024-XXXX", "cvss": 9.8, "host": "10.0.0.5", "port": 80},
        {"type": "exploit_success", "module": "exploit/linux/http/...", "session_type": "meterpreter", "privilege": 1},
    ],
    "sessions_opened": 1,
    "attempts": 5,
    "failures": [{"module": "...", "reason": "..."}]
}
```

DİKKAT EDİLECEKLER:
- MetasploitTool.execute({"action": "run", ...}) mevcut API'yi kullan
- Meterpreter session ID'si MetasploitTool output'unda "session_opened" field'ında
- KnowledgeBase.record_success() çağır başarılı exploit'lerde
- LHOST auto-detection mevcut MetasploitTool'da var — override etme

TEST GEREKSİNİMLERİ:
- tests/test_exploit_agent.py
- Mock tools ile exploit lifecycle
- Success → ShellManager registration
- Failure → retry → escalate to Brain
- Safety block (scan_only mode)
- En az 12 test
```

---

## PROMPT 8: PostExploitAgent

```
GÖREV: core/agents/postexploit_agent.py dosyasını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/base_agent.py (BaseAgent)
- core/shell_manager.py (Adım 4 — execute, upload_file, download_file)
- core/mission_context.py (Adım 2 — HarvestedCredential, LootItem)
- database/repositories.py (Adım 3 — HarvestedCredentialRepository, LootRepository)
- core/agents/scanner_agent.py (Adım 6 — pattern referansı)

GEREKSİNİMLER:

1. PostExploitAgent(BaseAgent):
   - Shell Manager üzerinden komut çalıştırır (doğrudan tool kullanmaz, ShellManager.execute() kullanır)
   - ALLOWED_TOOLS = []  # Tool registry'den tool kullanmaz, ShellManager API kullanır

2. PostExploit'in özel tool'ları (BaseTool DEĞİL, internal metotlar):
   - Bunlar ShellManager.execute() üzerinden shell komutları çalıştıran helper'lar
   - Brain bunları bilmez — PostExploit kendi LLM'i ile karar verir

3. Phase 1 — Local Enumeration:
   - run_linpeas(session_id): LinPEAS script'ini upload et, çalıştır, output'u parse et
   - enumerate_users(session_id): cat /etc/passwd, id, whoami, sudo -l
   - enumerate_services(session_id): ps aux, ss -tlnp, systemctl list-units
   - enumerate_network(session_id): ip addr, ip route, arp -a, ss -tlnp
   - enumerate_files(session_id, paths): find / -name "*.conf" -o -name "*.key" 2>/dev/null
   - check_sudo(session_id): sudo -l
   - check_suid(session_id): find / -perm -4000 -type f 2>/dev/null
   - process_list(session_id): ps auxf

4. Phase 2 — Privilege Escalation:
   - getsystem(session_id): Meterpreter → ShellManager üzerinden getsystem
   - sudo_exploit(session_id, binary): sudo -l output'a göre GTFOBins exploit
   - suid_exploit(session_id, binary): SUID binary exploit
   - kernel_exploit(session_id): uname -a → kernel exploit match
   - Her girişim sonrası privilege level kontrol et: id, whoami

5. Phase 3 — Persistence (SADECE allow_persistence=True ise):
   - add_ssh_key(session_id): ~/.ssh/authorized_keys'e key ekle
   - add_cron(session_id, command): crontab -e
   - add_service(session_id): systemd service oluştur

6. Phase 4 — Credential Harvesting (SADECE allow_credential_harvest=True ise):
   - dump_shadow(session_id): cat /etc/shadow (root gerekir)
   - find_credentials(session_id): grep -r "password" /etc/ /home/ /var/www/
   - dump_ssh_keys(session_id): find / -name "id_rsa" -o -name "id_ed25519"
   - dump_history(session_id): cat ~/.bash_history, ~/.mysql_history
   - Her bulunan credential → HarvestedCredentialRepository.save()

7. System Prompt:
```
Sen AEGIS Post-Exploitation Agent'ısın.

Görevin: {task_description}
Hedef host: {host_ip}
Mevcut privilege: {current_privilege}
OS: {os_type} {os_version}

İzinler:
- Persistence: {"İZİN VAR" if allow_persistence else "YASAK"}
- Credential Harvest: {"İZİN VAR" if allow_credential_harvest else "YASAK"}

Strateji:
1. Önce sistemi enumera et (users, services, network, interesting files)
2. Privilege escalation dene (sudo, SUID, kernel exploit)
3. {if allowed} Persistence mekanizması kur
4. {if allowed} Credential'ları topla

Komut çalıştırmak için:
{"action": "execute", "command": "..."}

LinPEAS çalıştırmak için:
{"action": "run_linpeas"}

Bittiğinde:
{"action": "done", "summary": "..."}
```

8. LLM integration:
   - PostExploit kendi LLM'i ile çalışır (daha hafif model OK)
   - Shell komut çıktılarını analiz edip sonraki adıma karar verir
   - LinPEAS output'u çok büyük olabilir — özet çıkart, önemli finding'leri pinle

9. Permission check:
   - Her phase başında MissionBrief permission flag'ini kontrol et
   - İzin yoksa o phase'i atla, Brain'e "skipped: no permission" bildir

DİKKAT EDİLECEKLER:
- ShellManager.execute() timeout'u uzun tut (LinPEAS 2-3 dakika sürebilir)
- Output truncation: >64KB output'u keserek LLM'e ver
- Windows vs Linux komutları: os_type'a göre seç
- Privilege level değişirse ShellManager'a bildir (session upgrade)

TEST GEREKSİNİMLERİ:
- tests/test_postexploit_agent.py
- Mock ShellManager ile enumeration lifecycle
- Permission flag kontrolü (persistence yasak → skip)
- Credential harvest → DB save
- Privilege escalation flow
- En az 12 test
```

---

## PROMPT 9: Tool Implementations (Batch 1)

```
GÖREV: 5 yeni tool implementasyonu oluştur:
- tools/masscan_tool.py
- tools/nuclei_tool.py
- tools/ffuf_tool.py
- tools/whatweb_tool.py
- tools/nikto_tool.py

BAĞLAM — Önce şu dosyaları oku ve anla:
- tools/base_tool.py (BaseTool contract, ToolMetadata, ToolHealthStatus)
- tools/nmap_tool.py (TAMAMINI oku — mevcut tool pattern: metadata, validate, execute, health_check, output parsing)
- core/tool_registry.py (nasıl register edildiğini anlamak için)

GENEL PATTERN (her tool için):

1. BaseTool subclass
2. metadata property: name, description, parameters (JSON Schema), category
3. validate(): parametre kontrolü
4. execute(): binary çalıştır, output parse et, structured dict dön
5. health_check(): binary mevcut mu kontrol et (shutil.which)
6. Error handling: binary yoksa, timeout, permission denied

=== tools/masscan_tool.py ===

- name: "masscan"
- category: "recon"
- Parameters:
  - target: str (IP veya CIDR, ZORUNLU)
  - port_range: str (default "1-65535")
  - rate: int (default 1000, packets/sec)
  - top_ports: int (optional — set edilirse port_range yerine)
- Execute: `masscan {target} -p{port_range} --rate={rate} -oJ -` (JSON output to stdout)
- Output parse: masscan JSON → list of {ip, port, proto, state}
- Health check: `which masscan`
- install_hint: "apt install masscan"

=== tools/nuclei_tool.py ===

- name: "nuclei"
- category: "vuln-scan"
- Parameters:
  - target: str (URL, ZORUNLU)
  - templates: str (optional — template path veya tag: "cves", "misconfig", "exposed-panels")
  - severity: str (optional — "critical,high,medium")
  - rate_limit: int (default 150)
- Execute: `nuclei -u {target} -t {templates} -severity {severity} -rate-limit {rate_limit} -jsonl`
- Output parse: JSONL → list of {template_id, name, severity, matched_url, description, cve_id}
- Health check: `which nuclei`
- install_hint: "go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest"

=== tools/ffuf_tool.py ===

- name: "ffuf"
- category: "web"
- Parameters:
  - url: str (FUZZ keyword içermeli, ZORUNLU) — örnek: "http://target/FUZZ"
  - wordlist: str (default "/usr/share/wordlists/dirb/common.txt")
  - extensions: str (optional — ".php,.html,.txt")
  - method: str (default "GET")
  - filter_code: str (optional — "404,403")
  - filter_size: str (optional — response size filter)
  - rate: int (default 100)
- Execute: `ffuf -u {url} -w {wordlist} -e {extensions} -mc all -fc {filter_code} -rate {rate} -o /tmp/ffuf_{uuid}.json -of json`
- Output parse: JSON results → list of {url, status, size, words, lines}
- Health check: `which ffuf`
- install_hint: "apt install ffuf"

=== tools/whatweb_tool.py ===

- name: "whatweb"
- category: "web"
- Parameters:
  - target: str (URL, ZORUNLU)
  - aggression: int (default 1, range 1-4)
- Execute: `whatweb {target} -a {aggression} --log-json=-`
- Output parse: JSON → {url, technologies: [{name, version, category}], headers, server}
- Health check: `which whatweb`
- install_hint: "apt install whatweb"

=== tools/nikto_tool.py ===

- name: "nikto"
- category: "web"
- Parameters:
  - target: str (URL veya host:port, ZORUNLU)
  - tuning: str (optional — "123456789abc" nikto tuning options)
  - timeout: int (default 300)
  - ssl: bool (default false)
- Execute: `nikto -h {target} {-ssl if ssl} -Format json -output /tmp/nikto_{uuid}.json -maxtime {timeout}s`
- Output parse: JSON → {host, port, vulnerabilities: [{id, description, method, url, osvdb}]}
- Health check: `which nikto`
- install_hint: "apt install nikto"

HER TOOL İÇİN DİKKAT EDİLECEKLER:
- asyncio.create_subprocess_exec kullan (subprocess.run DEĞİL — async olmalı)
- Timeout: asyncio.wait_for ile enforce et
- Output boyutu: >1MB output'u kes, uyarı logla
- Temp dosyaları temizle (finally bloğunda)
- Binary path: shutil.which ile bul, bulamazsa health_check'te unavailable
- Error output (stderr) loglama
- JSON parse hatası → fallback raw text output

TEST GEREKSİNİMLERİ:
- tests/test_new_tools.py (veya her tool için ayrı test dosyası)
- Her tool için: validate (valid/invalid params), health_check mock, execute mock
- Binary yokken graceful fail
- Timeout handling
- Output parsing (sample output ile)
- En az 5 test per tool = 25 test toplam
```

---

## PROMPT 10: WebAppAgent

```
GÖREV: core/agents/webapp_agent.py dosyasını oluştur.

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/base_agent.py (BaseAgent)
- core/agents/scanner_agent.py (pattern referansı)
- tools/whatweb_tool.py, tools/ffuf_tool.py, tools/nuclei_tool.py, tools/nikto_tool.py (Adım 9)
- core/mission_context.py (Adım 2)

GEREKSİNİMLER:

1. WebAppAgent(BaseAgent):
   ALLOWED_TOOLS = ["whatweb", "ffuf", "nuclei", "nikto"]
   Tetikleme: Brain, HTTP/HTTPS port bulunca spawn eder

2. Task context:
   - target_url: str (http://host:port)
   - known_tech: list (varsa MissionBrief'ten)

3. Web Testing Strategy (LLM prompt'ta):
   a. whatweb → teknoloji tespiti (CMS, framework, server)
   b. ffuf → dizin/dosya enumeration
   c. nuclei → CVE + misconfiguration taraması
   d. nikto → genel web server taraması
   e. CMS tespit edilirse → ek tarama (wpscan ileride eklenecek)
   f. Bulunan endpoint'lere → parametre tespiti ve vuln scan

4. Result format:
```python
{
    "status": "success",
    "findings": [
        {"type": "technology", "name": "WordPress", "version": "6.4"},
        {"type": "directory", "url": "/admin/", "status": 200},
        {"type": "vulnerability", "template": "CVE-2024-XXXX", "severity": "high", "url": "..."},
    ],
    "directories_found": 15,
    "vulnerabilities_found": 3
}
```

DİKKAT EDİLECEKLER:
- Her web port için ayrı WebAppAgent spawn edilebilir (paralel)
- Tool çıktıları büyük olabilir — özetleyerek LLM'e ver
- Rate limiting: target'ı DDoS etme, tool rate parametrelerini kullan

TEST GEREKSİNİMLERİ:
- tests/test_webapp_agent.py
- Mock tools ile web scan lifecycle
- Technology detection → focused scan
- En az 8 test
```

---

## PROMPT 11: OSINTAgent

```
GÖREV: core/agents/osint_agent.py ve 4 yeni OSINT tool oluştur:
- tools/theharvester_tool.py
- tools/subfinder_tool.py
- tools/whois_tool.py
- tools/dns_tool.py

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/base_agent.py (BaseAgent)
- core/agents/scanner_agent.py (pattern referansı)
- tools/nmap_tool.py (tool pattern referansı)
- core/mission_context.py (domains, subdomains, emails, ip_addresses)

=== TOOL'LAR ===

tools/theharvester_tool.py:
- name: "theharvester"
- Parameters: domain (str), sources (str, default "all"), limit (int, default 500)
- Execute: `theHarvester -d {domain} -b {sources} -l {limit} -f /tmp/harvest_{uuid}`
- Output: emails, hosts, ips

tools/subfinder_tool.py:
- name: "subfinder"
- Parameters: domain (str), recursive (bool, default false)
- Execute: `subfinder -d {domain} -oJ`
- Output: subdomains list

tools/whois_tool.py:
- name: "whois_lookup"
- Parameters: target (str — domain or IP)
- Execute: `whois {target}` — Python whois library de kullanılabilir
- Output: registrar, org, creation_date, expiration_date, nameservers, asn

tools/dns_tool.py:
- name: "dns_lookup"
- Parameters: domain (str), record_type (str, default "A"), zone_transfer (bool, default false), nameserver (str, optional)
- Execute: `dig {domain} {record_type}` + zone transfer: `dig axfr @{ns} {domain}`
- Output: records list

=== OSINTAgent ===

1. OSINTAgent(BaseAgent):
   ALLOWED_TOOLS = ["theharvester", "subfinder", "whois_lookup", "dns_lookup"]
   Tetikleme: Brain, domain hedef verildiğinde spawn eder

2. Strategy:
   a. WHOIS → domain registration info
   b. DNS enumeration (A, MX, NS, TXT, PTR)
   c. Zone transfer attempt
   d. Subdomain enumeration (subfinder)
   e. Email/host harvesting (theHarvester)
   f. Bulunan subdomain'lere DNS lookup

3. Result: enriched target profile (domains, subdomains, IPs, emails, ASN info)

TEST GEREKSİNİMLERİ:
- Her tool için 5 test = 20
- Agent lifecycle testi = 8
- Toplam 28 test
```

---

## PROMPT 12: LateralMovementAgent

```
GÖREV: core/agents/lateral_agent.py ve 2 yeni tool oluştur:
- tools/crackmapexec_tool.py
- tools/impacket_tool.py

BAĞLAM — Önce oku:
- core/base_agent.py, core/shell_manager.py, core/mission_context.py
- core/agents/postexploit_agent.py (pattern — ShellManager kullanımı)
- database/repositories.py (NetworkGraphRepository, HarvestedCredentialRepository)

GEREKSİNİMLER:

1. LateralMovementAgent(BaseAgent):
   ALLOWED_TOOLS = ["crackmapexec", "impacket"]
   + ShellManager.execute() üzerinden pivot komutları

2. Tetikleme: Brain, privileged session + harvested credentials + scope'ta başka host'lar varsa spawn eder.

3. Strategy:
   a. Compromised host'tan internal network scan (ShellManager.execute → nmap/arp)
   b. Harvested credential'ları yeni host'lara dene (crackmapexec spray)
   c. Başarılı credential → SSH/SMB/WinRM ile bağlan
   d. network_nodes ve network_edges tablosunu güncelle
   e. Yeni compromised host → Brain'e bildir (Brain PostExploit spawn edebilir)

4. Permission: allow_lateral_movement == True OLMALI

5. tools/crackmapexec_tool.py:
   - name: "crackmapexec"
   - Parameters: protocol (smb|ssh|winrm), target (str), username, password/hash, command (optional)
   - Execute: `crackmapexec {proto} {target} -u {user} -p {pass}`
   - Output: success/fail per host, admin access

6. tools/impacket_tool.py:
   - name: "impacket"
   - Parameters: module (psexec|smbexec|wmiexec|secretsdump|kerberoast), target, credentials, options
   - Execute: ilgili impacket script'i
   - Output: module-specific

TEST GEREKSİNİMLERİ:
- 10 tool testi + 10 agent testi = 20
```

---

## PROMPT 13: ReportingAgent

```
GÖREV: core/agents/reporting_agent.py oluştur ve reporting/report_generator.py'yi güncelle.

BAĞLAM — Önce oku:
- core/base_agent.py (BaseAgent)
- reporting/report_generator.py (TAMAMINI oku — mevcut HTML/PDF report generation)
- reporting/cvss.py (CVSS scoring)
- core/mission_context.py (MissionContext — tüm findings)
- database/repositories.py (tüm repository'ler)

GEREKSİNİMLER:

1. ReportingAgent(BaseAgent):
   - Tool kullanmaz — LLM ile rapor metni üretir
   - MissionContext + DB'den tüm bulguları okur
   - Mevcut report_generator'ı çağırır

2. Rapor bölümleri:
   a. Executive Summary (non-technical, LLM üretir)
   b. Attack Narrative (saldırı hikayesi, LLM üretir)
   c. Technical Findings (DB'den, structured)
   d. Credentials & Loot summary
   e. Risk Matrix (CVSS scoring, mevcut cvss.py)
   f. Remediation Recommendations (LLM üretir)
   g. Attack Graph (network_nodes/edges'den)

3. report_generator.py güncellemeleri:
   - Yeni section'lar ekle (credentials, loot, attack narrative)
   - Multi-agent findings format desteği
   - Mevcut generate_html_report / generate_pdf_report API'sini koru

4. Incremental reporting:
   - generate_interim_report() → mevcut bulguların anlık raporu
   - generate_final_report() → tam rapor

TEST GEREKSİNİMLERİ:
- 10 test (report generation, section'lar, multi-agent findings)
```

---

## PROMPT 14: API + WebSocket Güncellemeleri

```
GÖREV: web/routes.py, web/websocket_handler.py ve web/session_manager.py'yi güncelle.

BAĞLAM — Önce şu dosyaları oku ve anla:
- web/routes.py (TAMAMINI oku — mevcut endpoint'ler, mission start flow)
- web/websocket_handler.py (TAMAMINI oku — mevcut event streaming)
- web/session_manager.py (TAMAMINI oku — mevcut task/guard/agent registry)
- core/brain_agent.py (Adım 5)
- core/shell_manager.py (Adım 4)
- core/mission_context.py (Adım 2)

GEREKSİNİMLER:

1. Mission Start Flow güncelleme (POST /api/v1/missions/start):
   - Mevcut: PentestAgent oluştur + asyncio task başlat
   - Yeni: mode="multi_agent" parametre eklentisi
     - mode="multi_agent" → BrainAgent oluştur + MissionContext + MessageBus + ShellManager
     - mode="legacy" (veya parametre yoksa) → mevcut PentestAgent flow (backward compat)

2. Yeni endpoint'ler:

```python
# Agent management
@router.get("/api/v1/missions/{mid}/agents")           # list spawned agents
@router.get("/api/v1/missions/{mid}/agents/{aid}")      # agent details
@router.post("/api/v1/missions/{mid}/agents/{aid}/kill") # kill agent

# Shell sessions
@router.get("/api/v1/missions/{mid}/shells")            # list active shells
@router.post("/api/v1/missions/{mid}/shells/{sid}/exec") # manual command
@router.get("/api/v1/missions/{mid}/shells/{sid}/info")  # session info

# Harvested credentials
@router.get("/api/v1/missions/{mid}/harvested-credentials")

# Loot
@router.get("/api/v1/missions/{mid}/loot")

# Attack graph (enhanced)
@router.get("/api/v1/missions/{mid}/attack-graph")      # network topology + attack paths

# Mission context
@router.get("/api/v1/missions/{mid}/context")           # Brain's view of mission state

# Per-agent model config
@router.get("/api/v1/config/agent-models")
@router.post("/api/v1/config/agent-models")
```

3. WebSocket event güncellemeleri:
   - Mevcut "session_event" formatını koru
   - Yeni event types ekle:
     - agent_spawned: {agent_id, agent_type, task}
     - agent_message: {from, to, type, payload}
     - agent_done: {agent_id, status, summary}
     - shell_opened: {session_id, host_ip, type, privilege}
     - shell_lost: {session_id, host_ip}
     - shell_reconnected: {session_id, host_ip}
     - credential_found: {host, username, type}
     - loot_collected: {host, type, description}
     - lateral_success: {source_host, target_host}
     - privesc_success: {host, from_level, to_level}
     - pivot_established: {host, network}

4. session_manager.py güncellemesi:
   - Mevcut register(session_id, task, guard, agent) kalacak
   - Yeni: register_brain(session_id, brain_agent, mission_context, message_bus, shell_manager)
   - Brain'in sub-agent'larını da track et

DİKKAT EDİLECEKLER:
- Mevcut endpoint'leri BOZMA — yeni endpoint'ler ek olarak gelsin
- Backward compatibility: eski client'lar eski event format'ı alsın
- Session manager'da memory leak riski: agent cleanup doğru yapılmalı

TEST GEREKSİNİMLERİ:
- Her endpoint için API testi (httpx async client)
- WebSocket event format testi
- Legacy mode backward compat testi
- En az 20 test
```

---

## PROMPT 15: UI — Agent Orchestra Panel

```
GÖREV: web/static/index.html, web/static/app.js ve web/static/style.css'yi güncelle.

BAĞLAM — Önce şu dosyaları oku ve anla:
- web/static/index.html (TAMAMINI oku — mevcut UI layout, Tailwind CSS)
- web/static/app.js (TAMAMINI oku — mevcut event handling, WebSocket, DOM manipulation)
- web/static/style.css (mevcut custom styles)
- Adım 14'teki yeni API endpoint'leri ve WebSocket event'leri

GEREKSİNİMLER:

1. Agent Orchestra View (yeni tab veya mevcut Pentest view'ın genişletilmesi):

   a. Brain Feed (üst kısım):
      - Brain'in düşünce akışı (reasoning event'leri, agent_id="brain" olan)
      - Strategy decision'lar highlight
      - Compact format: "[BRAIN] Scanner spawn ediliyor → 10.0.0.0/24 taraması"

   b. Sub-Agent Grid (orta kısım):
      - Her aktif agent için card:
        - Sol: Agent type icon (🔍 Scanner, ⚡ Exploit, 🌐 Web, 🔑 PostExploit, 🔗 Lateral, 📊 Report, 🕵️ OSINT)
        - Başlık: Agent type + ID (kısa)
        - Status badge: 🟢 running, 🟡 waiting, 🔴 failed, ⚪ done
        - Current action: "nmap scanning 10.0.0.5..."
        - Mini progress: iterations / max_iterations
        - Expandable: tool output stream
      - Grid layout: 2-3 columns, responsive
      - Agent tamamlandığında card grayed out, başarılıysa yeşil border

   c. Mission Timeline (alt kısım):
      - Phase progression bar
      - Key findings markers (shell opened, root achieved, vb.)
      - Zaman damgalı event listesi

2. Enhanced Attack Graph:
   - Mevcut attack graph'ı genişlet
   - Node renkleri: gray=unknown, blue=discovered, yellow=access, orange=user, red=root
   - Edge tipleri: dashed=scan, solid=exploit, bold=lateral
   - Node click → host details panel
   - Attack path visualization (attacker → pivots → target)

3. Credentials Panel (yeni tab veya panel):
   - Tablo: Host | Username | Type | Hash/Password | Service | Found By
   - Sortable columns
   - Copy button (password/hash)
   - GET /api/v1/missions/{mid}/harvested-credentials'dan veri çek

4. Loot Panel:
   - Tablo: Host | Path | Type | Description | Preview
   - Text loot → inline preview
   - File loot → download link
   - GET /api/v1/missions/{mid}/loot'dan veri çek

5. Per-Agent Model Selector (Config panelinde):
   - Agent type listesi: Brain, Scanner, Exploit, OSINT, WebApp, PostExploit, Lateral, Reporting
   - Her biri için model dropdown (mevcut model listesinden)
   - Preset'ler: "All Cloud", "All Local", "Brain Cloud + Rest Local"
   - POST /api/v1/config/agent-models

6. Mission Context Panel (yeni panel veya mevcut findings'in genişletilmesi):
   - Brain'in mevcut mission view'ı
   - Hosts discovered, services found, vulns, sessions, credentials, loot
   - Auto-update (WebSocket event'leri ile)

7. WebSocket Event Handling:
   - agent_spawned → yeni agent card ekle
   - agent_message → ilgili agent card'da göster
   - agent_done → card'ı tamamlandı olarak işaretle
   - shell_opened → attack graph'a node ekle/güncelle
   - credential_found → credentials panel'e satır ekle
   - Mevcut event handling'i BOZMA — yeni event'ler ek olarak handle edilsin

DİKKAT EDİLECEKLER:
- Vanilla JS — React/Vue KULLANMA (mevcut pattern)
- Tailwind CSS — mevcut dark mode design language'ı koru
- Responsive: mobile'da tek sütun, desktop'ta multi-column
- Performance: çok fazla DOM update → requestAnimationFrame veya batch update
- Mevcut Pentest view legacy mode'da (single agent) çalışmaya devam etmeli

TEST GEREKSİNİMLERİ:
- Manuel test (UI testi)
- WebSocket event handler'ların doğru DOM update yapması
```

---

## PROMPT 16: PentestAgent → BaseAgent Migration

```
GÖREV: core/agent.py'yi güncelle — PentestAgent artık BaseAgent'ı extend etsin.

BAĞLAM — Önce şu dosyaları oku ve anla:
- core/agent.py (TAMAMINI oku — mevcut PentestAgent)
- core/base_agent.py (Adım 1 — BaseAgent)
- tests/test_agent.py (TAMAMINI oku — mevcut testler)

GEREKSİNİMLER:

1. PentestAgent(BaseAgent) olsun — mevcut PentestAgent'taki tüm işlevsellik KORUNSUN

2. BaseAgent'a taşınmış metotları sil, super() çağır:
   - run() → super().run() + PentestAgent-specific initialization
   - act() → super().act() + PentestAgent-specific guard logic
   - emit_event → super().emit_event (ama mevcut progress_callback uyumluluğu koru)

3. PentestAgent-specific metotları override olarak tut:
   - build_system_prompt() → mevcut PromptBuilder kullanımı
   - build_action_prompt() → mevcut context-based prompt
   - process_result() → mevcut observe logic (host/port/vuln güncelleme)
   - get_available_tools() → tüm tool'lar (PentestAgent sınırlanmamış)

4. AgentState enum'u core/agent.py'de KALSIN (başka agent'lar import edecek)

5. AgentContext KALSIN — PentestAgent'a özel state

6. Mevcut tüm testlerin GEÇMES GEREKİR — hiçbir test kırılmamalı

7. Legacy mode: BrainAgent olmadan PentestAgent tek başına çalışabilmeli (mevcut gibi)

DİKKAT EDİLECEKLER:
- Bu en riskli adım — 329 mevcut testi kırabilir
- Incremental refactor: önce import ekle, sonra inheritance, sonra metot taşıma
- Her adımda test çalıştır
- Mevcut API (constructor parametreleri) korunsun

TEST GEREKSİNİMLERİ:
- TÜM mevcut testler geçmeli
- Yeni testler: BaseAgent üzerinden PentestAgent çalışması
- Legacy mode (Brain olmadan) çalışması
```

---

## MissionBrief Güncellemesi (Adım 2 ile birlikte yapılacak)

```
GÖREV: models/mission.py'ye eksik permission flag'leri ekle.

Mevcut MissionBrief'e şu field'ları ekle:

    # ── Yeni V2 Permission flags ──────────────────────────────────────
    allow_persistence: bool = False
    allow_credential_harvest: bool = False
    allow_data_exfil: bool = False

Bu 3 satırı mevcut permission flags bölümüne ekle (allow_browser_recon'dan sonra).
Başka hiçbir şeyi değiştirme.
```
