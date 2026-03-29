# TIRPAN V2 — Sprint Plan
> Geçici çalışma dosyası. Her adım onaylandıktan sonra yeni chat'te uygulanır.
> Tarih: 2026-03-29 | Branch: feature/v2-multi-agent-architecture

---

## GENEL HEDEF

V2 multi-agent sistemini **gerçek bir sertifikalı ethical hacker gibi** davranacak şekilde düzeltmek ve geliştirmek:
- Paralel agent spawn + gerçek hacker mindset
- Tüm promptları dışsal SOUL dosyalarına taşımak
- Detaylı debug logging (toggle'lanabilir)
- LoRA fine-tune için structured training data output
- Bugları düzeltmek (spawn race, nikto path, shell exec, metasploit params)

---

## MEVCUT BUGLAR (Logdan Tespit Edilenler)

### BUG-01: Agent Spawn Race Condition
**Sorun:** Brain `spawn_agent` çağırır → hemen `wait_for_agents` çağırır → ama child agent henüz bus'a register olmamış olabilir → AGENT_DONE mesajı wait'ten önce gelebilir → brain sonsuza kadar bekler.
**Dosya:** `core/brain_agent.py` → `_spawn_agent()` + `core/message_bus.py` → `wait_for_agent_done()`
**Kanıt:** Logda `[AGENT DONE] scanner-f472bfd8` çıkıyor ama brain'in wait_for_agents hâlâ devam ediyor

### BUG-02: Nikto Çıktısı Ana Dizine Yazıyor
**Sorun:** `tools/nikto_tool.py` nikto'yu CWD'de çalıştırıyor → `nikto_http_*.txt` dosyaları proje kökünde oluşuyor
**Çözüm:** `data/sessions/{session_id}/` dizinine yazmalı

### BUG-03: Metasploit Tool Parametre Tutarsızlığı
**Sorun:** Agent LLM'i `rhosts`, `rport` gibi Metasploit-internal isimleri kullanıyor ama tool `target_ip`, `target_port` istiyor → LLM birkaç kez deneyip hata yapıyor
**Dosya:** `tools/metasploit_tool.py`
**Kanıt:** Logda agent 3 kez parametre yanlışlığı yapıyor

### BUG-04: Shell Exec "Name or service not known"
**Sorun:** `shell_session_tool.py`'de `exec` action, `bind:192.168.56.101:6200` string'ini hostname olarak DNS'e soruyor → `-2 Name or service not known` hatası
**Çözüm:** session_key parse edilip IP:port ayrı alınmalı

### BUG-05: Brain Sequential Thinking (Mindset Sorunu)
**Sorun:** Brain scanner bitti → webapp spawn et → webapp bitti → exploit spawn et → sıralı çalışıyor
**Gerçek:** Scanner biter bitmez vsftpd, samba, webapp, telnet, rsh için **paralel** agent'lar spawn edilmeli

### BUG-06: Brain'e Yeterli Context Verilmiyor
**Sorun:** System prompt çok genel → "Metasploitable2" bulunduğunda ne yapacağını bilmiyor
**Çözüm:** SOUL dosyalarından zengin, dinamik context injection

---

## ADIMLAR

---

### ADIM 1: Debug Logging Altyapısı
**Amaç:** Sol panelde (bash console) her şeyi görmek — tool call giden/gelen, agent mesajları, hata detayları
**Durum:** ONAY BEKLİYOR

#### Ne Yapılacak:
1. `core/debug_logger.py` — merkezi debug logger
   - `DEBUG_MODE` env flag (varsayılan `true`)
   - `LOG_LEVEL`: `TRACE | DEBUG | INFO | WARN | ERROR`
   - Renk kodlu çıktı (ANSI escape) — tool call: cyan, error: red, agent msg: yellow, think: green
   - Tamamen devre dışı bırakılabilir (`DEBUG_MODE=false`)
2. Tüm tool call'larda `before_call` / `after_call` hook:
   ```
   [TOOL→] [agent_id] tool_name(params...)
   [TOOL←] [agent_id] tool_name → OK/FAIL (Xms)
   ```
3. Bus mesajlarında log:
   ```
   [BUS] AGENT_DONE scanner-f472bfd8 → 2 findings
   [BUS] FINDING open_ports from scanner-f472bfd8
   ```
4. Brain döngüsünde log:
   ```
   [BRAIN iter=3] THINK: "vsftpd 2.3.4 bulundu, exploit agent spawn et"
   [BRAIN iter=3] ACTION: spawn_agent(exploit, 192.168.56.101, exploit_vsftpd)
   [BRAIN iter=3] ACTIVE_AGENTS: [exploit-abc123, webapp-def456]
   ```
5. Race condition debug:
   ```
   [BUS] wait_for_agent_done("scanner-f472bfd8") registered at T+0ms
   [BUS] AGENT_DONE received for "scanner-f472bfd8" at T+12340ms
   [BUS] wait resolved for "scanner-f472bfd8" at T+12341ms
   ```

#### Dosyalar:
- `core/debug_logger.py` (yeni)
- `core/base_agent.py` (hook ekle)
- `core/message_bus.py` (log ekle)
- `core/brain_agent.py` (log ekle)
- `tools/base_tool.py` (before/after hook)

---

### ADIM 2: Kritik Bug Düzeltmeleri
**Amaç:** BUG-01, BUG-02, BUG-03, BUG-04'ü düzeltmek
**Durum:** ONAY BEKLİYOR

#### 2a: BUG-01 — Spawn Race Condition Düzeltme
**Dosya:** `core/message_bus.py`
**Çözüm:** `wait_for_agent_done()` içinde bir `asyncio.Event` veya `Future` kullanarak, AGENT_DONE mesajı wait'ten önce gelse bile yakalanması sağlanacak:
- Agent spawn edildiğinde `_pending_done[agent_id] = Future()` oluştur
- AGENT_DONE geldiğinde Future'ı resolve et
- wait_for_agent_done() bu Future'ı await et
- Eğer Future zaten resolved ise hemen dön

#### 2b: BUG-02 — Nikto Output Path
**Dosya:** `tools/nikto_tool.py`
**Çözüm:** Tool'a `session_id` parametresi ekle (opsiyonel), `data/sessions/{session_id}/nikto/` dizinine yaz. Session_id yoksa `data/nikto/` kullan.

#### 2c: BUG-03 — Metasploit Param Tutarlılığı
**Dosya:** `tools/metasploit_tool.py`
- Tool description'ı net yap: sadece `target_ip` ve `target_port` kabul edilir
- `rhosts`, `rport` gibi alias'lar otomatik dönüştürülsün (backward compat)
- LLM'e giden tool description'da parametre isimleri tek tip olsun

#### 2d: BUG-04 — Shell Exec DNS Hatası
**Dosya:** `tools/shell_session_tool.py`
**Çözüm:** `exec` action'da session_key'i `bind:IP:PORT` formatından parse et, socket bağlantısını doğrudan IP:PORT'a kur, DNS lookup yapma.

---

### ADIM 3: SOUL.md Sistemi — Dışsal Prompt Mimarisi
**Amaç:** Tüm hardcoded promptları dışsal dosyalara taşımak
**Durum:** ONAY BEKLİYOR

#### Dizin Yapısı:
```
souls/
├── BRAIN_SOUL.md          ← Brain'in kimliği, felsefesi, karar verme mantığı
├── SCANNER_SOUL.md        ← Scanner agent kimliği ve taktikleri
├── EXPLOIT_SOUL.md        ← Exploit agent kimliği ve yaklaşımı
├── WEBAPP_SOUL.md         ← Webapp agent kimliği
├── POST_EXPLOIT_SOUL.md   ← Post-exploit agent kimliği
├── OSINT_SOUL.md          ← OSINT agent kimliği
├── LATERAL_SOUL.md        ← Lateral movement kimliği
├── REPORTING_SOUL.md      ← Raporlama kimliği
├── HACKER_MINDSET.md      ← Tüm agent'lara inject edilen hacker felsefesi
├── PHASE_TACTICS.md       ← Her faz için taktikler (recon, scan, exploit, post)
└── TOOL_GUIDANCE.md       ← Tool kullanım rehberi (metasploit params, timeout handling vb.)
```

#### BRAIN_SOUL.md İçeriği:
- Kim olduğu: Deneyimli bir OSCP/CRTO sertifikalı penetration tester
- Düşünme biçimi: "Ne bulduk? Ne öğrendim? Sıradaki en mantıklı adım ne?"
- Paralel işlem mantığı: Scanner bitmeden bile exploit araştırmaya başla
- Mindset: Her servisi potential entry point olarak gör
- Risk değerlendirme: Yüksek CVSS → önce dene, ancak mantığını sorgula

#### HACKER_MINDSET.md İçeriği:
- Attack Surface Mapping: Her port bir hikaye anlatır
- Version-based CVE lookup önemi
- Default cred deneme mantığı
- WebDAV + PHP kombinasyonunun ne anlama geldiği
- Legacy servisler (telnet, rsh) = kritik zayıflık
- vsftpd 2.3.4 = ANINDA CVE-2011-2523 dene
- Samba 3.x = usermap_script (CVE-2007-2447)

#### SoulLoader Sınıfı (`core/soul_loader.py`):
```python
class SoulLoader:
    def load(self, soul_name: str) -> str
    def load_section(self, soul_name: str, section: str) -> str
    def build_agent_prompt(self, agent_type: str, context: dict) -> str
```

---

### ADIM 4: Hacker Mindset — Brain Agent Yeniden Yazımı
**Amaç:** Brain'i gerçek bir penetration tester gibi düşündürmek
**Durum:** ONAY BEKLİYOR

#### Mevcut Sorunlar:
1. Scanner biter → bir sonraki agent → scanner biter → bir sonraki...
2. "Nessus gibi çalışıyor" = port tarar, tool çalıştırır, next
3. CVE bilgisi yok, servis versiyonlarını analiz etmiyor
4. Paralel çalışmıyor

#### Hedef Davranış:
```
SCAN BITER → Brain şunları paralel spawn eder:
  - vsftpd 2.3.4 → exploit_agent(CVE-2011-2523)
  - Apache 2.2.8 + WebDAV → webapp_agent(web_scan + webdav_check)
  - Samba 3.x → exploit_agent(usermap_script)
  - SSH 4.7p1 → scanner_agent(brute force / known creds)
  - telnet/rsh (512,513,514) → exploit_agent(rsh_no_auth)
  - SMTP → osint_agent(email enumeration)

  HEPSI AYNI ANDA! wait_for_agents(all)
```

#### Brain Iteration Logic Değişikliği:
- **Paralel spawn zorunluluğu**: Scanner sonucu gelince, açık servisleri analiz et, tüm exploit/scan vektörlerini belirle, **tek iterasyonda** hepsini spawn et
- **Taktik düşünme**: Her servisi "bu servise nasıl girebilirim?" diye değerlendir
- **CVE mapping**: Bilinen versiyonları CVE veritabanıyla eşleştir
- **Kill chain**: Recon → Scan → Exploit → Post → Lateral → Persist → Report
- **Durum makinesi**: Her iterasyonda "ne biliyorum, ne öğrendim, ne yapmalıyım?"

---

### ADIM 5: Paralel Agent Matematik + Scheduler
**Amaç:** Brain'in doğru sayıda agent spawn etmesi ve yönetmesi
**Durum:** ONAY BEKLİYOR

#### Paralel Spawn Kuralları:
```python
MAX_PARALLEL_EXPLOIT_AGENTS = 5   # CPU/network yüküne göre
MAX_PARALLEL_SCANNER_AGENTS = 3
MAX_PARALLEL_WEBAPP_AGENTS = 2
MAX_TOTAL_AGENTS = 10
```

#### Spawn Priority Queue:
- CRITICAL (priority=1): Bilinen backdoor/RCE CVE'leri (vsftpd, samba usermap)
- HIGH (priority=2): Web scan, SMB enum
- MEDIUM (priority=3): Brute force, OSINT
- LOW (priority=4): Info gathering, banner grab

#### Brain'e Yeni Meta-Tool: `spawn_agents_batch`
```python
# Tek çağrıda birden fazla agent spawn et
spawn_agents_batch([
    {"agent_type": "exploit", "target": "192.168.56.101", "task_type": "exploit_vsftpd", ...},
    {"agent_type": "webapp", "target": "http://192.168.56.101", "task_type": "web_scan", ...},
    {"agent_type": "exploit", "target": "192.168.56.101", "task_type": "exploit_samba", ...},
])
```

---

### ADIM 6: LoRA Fine-Tune Training Data Format
**Amaç:** Her session'dan Qwen3-Coder-30B eğitimi için uygun JSONL çıktı üretmek
**Durum:** ONAY BEKLİYOR

#### Training Data Format:
```jsonl
{
  "instruction": "Metasploitable2 Linux hedefi üzerinde penetration test yap. Açık portlar: [21/ftp vsftpd 2.3.4, 22/ssh OpenSSH 4.7p1, 80/http Apache 2.2.8, 139/445/smb Samba 3.x]. Mission phase: SCANNING_COMPLETE",
  "input": {
    "target": "192.168.56.101",
    "discovered_services": [...],
    "phase": "exploitation",
    "permissions": {"allow_exploitation": true, ...}
  },
  "output": {
    "thought": "vsftpd 2.3.4, CVE-2011-2523 (CVSS 9.8) bilinen backdoor. Samba 3.x, CVE-2007-2447 usermap_script. Her ikisini paralel exploit et. Apache 2.2.8 + WebDAV ayrı webapp agent. rsh servisleri (512/513/514) çoğunlukla auth yok.",
    "action": "spawn_agents_batch",
    "parameters": {
      "agents": [
        {"agent_type": "exploit", "target": "192.168.56.101", "task_type": "exploit_vsftpd", "priority": "critical"},
        {"agent_type": "exploit", "target": "192.168.56.101", "task_type": "exploit_samba_usermap", "priority": "high"},
        {"agent_type": "webapp", "target": "http://192.168.56.101", "task_type": "web_scan_full", "priority": "high"},
        {"agent_type": "exploit", "target": "192.168.56.101", "task_type": "exploit_rsh_noauth", "priority": "medium"}
      ]
    }
  },
  "metadata": {
    "session_id": "3ee8c136-...",
    "iteration": 3,
    "timestamp": "2026-03-29T14:49:00Z",
    "outcome": "success",  // exploit_vsftpd got shell
    "tags": ["metasploitable2", "vsftpd", "cve-2011-2523", "parallel-exploit"]
  }
}
```

#### TrainingDataExporter Sınıfı (`core/training_data.py`):
- Her brain iteration'ını kaydet: thought + action + result
- Session sonunda `data/training/{session_id}.jsonl` yaz
- Başarılı exploit'ler pozitif örnek, başarısız olanlar negatif (ama yine kaydet)
- Tool call giden/gelen raw data'sı da dahil

---

### ADIM 7: Tool Eksiklikleri ve Geliştirmeler
**Amaç:** Eksik/kırık tool'ları tamamlamak
**Durum:** ONAY BEKLİYOR

#### 7a: Yeni Tool — `rsh_exec` (rsh/rexec/rlogin için)
- Port 512 (exec), 513 (login), 514 (shell) exploit
- `netkit-rsh` genellikle auth yok
- Tool: `rsh_exec(target_ip, command, port=514)`

#### 7b: Yeni Tool — `telnet_probe`
- Port 23 telnet banner grab + default cred deneme
- `admin/admin`, `root/root`, `root/` gibi default creds

#### 7c: Yeni Tool — `webdav_check`
- WebDAV enabled mi? PROPFIND, PUT, DELETE yetkileri var mı?
- PHP upload via WebDAV → shell upload

#### 7d: Yeni Tool — `smb_enum`
- smbclient ile share listele
- Null session ile bağlan
- Guest erişimi kontrol et

#### 7e: Mevcut Tool İyileştirme — `shell_exec`
- DNS hatası düzelt (BUG-04)
- `bind` tipi shell için raw socket kullan
- Timeout ekle (exec başına 30 saniye)
- Output'u truncate et (max 4096 char)

#### 7f: Mevcut Tool İyileştirme — `nikto_scan`
- Output directory düzelt (BUG-02)
- Timeout = 120s (300 çok uzun)
- `--maxtime=2m` flag ekle
- Tuning: `-T 13579a` (en önemli check'ler)

#### 7g: Mevcut Tool İyileştirme — `ffuf_scan`
- Default wordlist path'i kontrol et
- `/usr/share/wordlists/dirb/common.txt` veya `dirbuster/directory-list-2.3-small.txt`
- Sonuç yoksa alternatif wordlist dene

#### 7h: Mevcut Tool İyileştirme — `metasploit_run`
- Parametre alias'lar ekle: `rhosts` → `target_ip`, `rport` → `target_port`
- Tool description'ı netleştir
- `cmd/unix/interact` yerine module'ün default payload'ını otomatik seç

---

### ADIM 8: Session Storage & Artifact Management
**Amaç:** Her session'ın dosyalarını düzenli tutmak
**Durum:** ONAY BEKLİYOR

#### Dizin Yapısı:
```
data/
├── sessions/
│   └── {session_id}/
│       ├── artifacts/
│       │   ├── nikto/          ← nikto txt çıktıları
│       │   ├── nmap/           ← nmap xml çıktıları
│       │   ├── nuclei/         ← nuclei json çıktıları
│       │   └── ffuf/           ← ffuf json çıktıları
│       ├── loot/               ← post-exploit loot dosyaları
│       ├── screenshots/        ← web screenshots
│       └── report/             ← final HTML/PDF rapor
├── training/
│   └── {session_id}.jsonl      ← LoRA training data
└── tirpan.db                   ← SQLite DB
```

#### DB'ye Kaydedilecekler:
- Tüm tool call'lar (tool_name, params, result, duration, agent_id)
- Tüm findings (structured)
- Agent lifecycle (spawned, started, done, error)
- Brain iterations (thought, action, result)

---

### ADIM 9: Context Enrichment — Hacker Knowledge Base
**Amaç:** Brain'e servis → exploit mapping bilgisi vermek
**Durum:** ONAY BEKLİYOR

#### `souls/EXPLOIT_KB.md` — Bilinen CVE'ler ve Exploit'ler:
```markdown
## FTP
- vsftpd 2.3.4 → CVE-2011-2523 (CVSS 9.8) → msf: exploit/unix/ftp/vsftpd_234_backdoor
- ProFTPD 1.3.3c → CVE-2010-4221 → arbitrary code exec

## SSH
- OpenSSH < 7.7 → user enumeration (CVE-2018-15473)
- OpenSSH 4.x → old crypto, try default creds: root/root, root/toor

## SMB
- Samba 3.0.x-3.0.25rc3 → CVE-2007-2447 → msf: exploit/multi/samba/usermap_script
- Samba 3.5.0-4.4.14 → CVE-2017-7494 (SambaCry)

## HTTP
- Apache 2.2.8 → mod_negotiation CVE, WebDAV PUT
- PHP 5.2.4 → multiple RCE vulns

## RSH (512/513/514)
- Default: no authentication → rsh target cmd
- rexec: credentials often blank
```

#### Bu Knowledge Base dinamik olarak system prompt'a inject edilsin.

---

### ADIM 10: Integration Testing + Demo Run
**Amaç:** Tüm değişikliklerin Metasploitable2 üzerinde end-to-end testini yapmak
**Durum:** ONAY BEKLİYOR

#### Test Senaryosu:
- Target: 192.168.56.101 (Metasploitable2)
- Profile: AGGRESSIVE
- Beklenen:
  1. Scanner agent tüm portları bulsun
  2. Brain PARALEL exploit + webapp agent'lar spawn etsin
  3. vsftpd exploit başarılı olsun
  4. Post-exploit shell çalışsın (id, whoami, hostname)
  5. LoRA training data kaydedilsin
  6. Tüm artifacts doğru dizinde olsun
  7. Debug log'lar konsola yazılsın

---

## UYGULAMA SIRASI (Onay Sonrası)

```
ADIM 1 (Debug Logging)     → Onay → Yeni Chat → Uygula
ADIM 2 (Bug Fixes)         → Onay → Yeni Chat → Uygula
ADIM 3 (SOUL System)       → Onay → Yeni Chat → Uygula
ADIM 4 (Brain Mindset)     → Onay → Yeni Chat → Uygula
ADIM 5 (Parallel Spawn)    → Onay → Yeni Chat → Uygula
ADIM 6 (Training Data)     → Onay → Yeni Chat → Uygula
ADIM 7 (Tool Improvements) → Onay → Yeni Chat → Uygula
ADIM 8 (Storage)           → Onay → Yeni Chat → Uygula
ADIM 9 (Knowledge Base)    → Onay → Yeni Chat → Uygula
ADIM 10 (Integration Test) → Onay → Yeni Chat → Test
```

---

## ÖNEMLI KISITLAMALAR

- UI'ya dokunma (başka agent yapıyor)
- V1 sistemini bozma (backward compat)
- Her adım ayrı chat'te, bu onay belgesi referans olarak kullanılacak
- Test edilmeden bir sonraki adıma geçilmeyecek

---

## NOTLAR

- `souls/` dizini git'e commit edilecek (promptlar config gibi davranacak)
- `data/training/` dizini `.gitignore`'a eklenecek (hassas pentest data)
- Debug logging env var'la kontrol edilecek: `TIRPAN_DEBUG=true/false`
- LoRA training data formatı Qwen3 instruction-following formatına uygun olacak

---

_Son güncelleme: 2026-03-29 | Bu dosya sprint tamamlandığında silinecek_
