<div align="center">

<img src="logo.png" alt="TIRPAN" width="160"/>

# TIRPAN

**Otonom Etik Güvenlikli Zeka Sistemi**

*Kıdemli bir sızma testçisi gibi düşünen ve onun gibi davranan bir yapay zeka ajanı.*

[![Lisans](https://img.shields.io/badge/lisans-Ticari%20Olmayan-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com)
[![Testler](https://img.shields.io/badge/testler-681%20geçiyor-brightgreen.svg)]()
[![Kapsam](https://img.shields.io/badge/kapsam-83%25-green.svg)]()
[![Durum](https://img.shields.io/badge/durum-aktif%20geliştirme-orange.svg)]()
[![Yalnızca Yetkili Kullanım](https://img.shields.io/badge/kullanım-yalnızca%20yetkili%20ortamlar-red.svg)](docs/05_SAFETY_AND_LEGAL.md)

**Başka bir dilde oku:** [English](README.md)

</div>

---

TIRPAN'e bir hedef ve kapsam verin. Gerisini o halleder.

Ajan ağı tarar, servisleri sıralar, bilinen açıklarını arar, en iyi saldırı yolunu seçip çalıştırır, sızma sonrası keşif yapar ve CVSS puanlarıyla birlikte yapılandırılmış bir güvenlik açığı raporu üretir — tamamen özerk, gerçek zamanlı ve yerleşik bir durdurma anahtarıyla.

> **Yalnızca yetkili güvenlik testi ortamları içindir.** Lab ortamları, CTF yarışmaları ve açık yazılı izin alınan angajmanlar. [Yasal gereklilikleri okuyun.](docs/05_SAFETY_AND_LEGAL.md)

---

## Demo

[![TIRPAN Demo](https://img.youtube.com/vi/L7qgV6r2qiA/maxresdefault.jpg)](https://youtu.be/L7qgV6r2qiA)

---

## Nasıl Çalışır

TIRPAN bir **ReAct döngüsü** çalıştırır — Düşün, Harekete Geç, Gözlemle, Yansıt — angajman tamamlanana veya tüm hedefler karşılanana kadar kesintisiz devam eder.

```
Operatör:  "192.168.1.0/24'ü tara, bulduklarını exploit et, sızma sonrası veri topla."

TIRPAN:     [Düşünce]    Henüz host keşfedilmedi. Ping sweep başlatılıyor.
           [Eylem]      nmap_scan — 192.168.1.0/24 üzerinde ping sweep
           [Gözlem]     4 canlı host: .5, .10, .23, .42
           [Düşünce]    Tüm hostlarda paralel olarak tam servis tespiti çalıştırılıyor.
           [Eylem]      nmap_scan — servis taraması x4
           [Gözlem]     Host .5: SMB/445 (Windows Server 2008 R2), SSH/22, HTTP/80
           [Düşünce]    Eski bir Windows hostunda SMB. EternalBlue kontrol ediliyor.
           [Eylem]      searchsploit_search — "ms17-010"
           [Gözlem]     exploit/windows/smb/ms17_010_eternalblue — CVSS 9.8
           [Düşünce]    Kritik önem derecesi, yüksek güven. Post-komutlarla exploit çalıştırılıyor.
           [Eylem]      metasploit_run — ms17_010_eternalblue + post_commands
           [Gözlem]     Shell açıldı. Oturum 1. whoami: NT AUTHORITY\SYSTEM
           [Düşünce]    .5 üzerinde root shell. Keşif verisi kaydedildi. Sonraki hosta geçiliyor.
           ...
           [Eylem]      generate_report
           [Bitti]      3 kritik bulgu. HTML ve PDF raporlar kaydedildi.
```

Her adım web arayüzünde gerçek zamanlı görüntülenir. Her eylem denetim kaydına işlenir.

---

## Mevcut Yetenekler

| Yetenek | Detay |
|---------|-------|
| Ağ keşfi | Nmap + Masscan hızlı tarama + yerel alt ağların otomatik keşfi |
| Servis sıralaması | Port/servis/versiyon tespiti, NSE betikleri, SMB null session, Telnet, RSH |
| Exploit arama | Servis/versiyon bazlı SearchSploit/ExploitDB sorguları, CVE bilgi tabanı |
| Exploitation | Metasploit RPC, rsh, distcc, webdav, telnet, ssh yardımcıları |
| Web uygulama testi | WhatWeb, Nikto, Nuclei, ffuf, Gobuster, Arjun, sqlmap, WPScan, Commix |
| OSINT | theHarvester, subfinder, WHOIS, DNS sıralama (zone transfer) |
| Sızma sonrası | SSH + bind/reverse/ssh shell'ler, kalıcı oturum yönetimi, PTY desteği |
| Yanal hareket | CrackMapExec/NXC + Impacket (psexec, secretsdump, kerberoast, wmiexec) |
| Kimlik bilgisi saldırıları | Hydra brute-force, Hashcat + John the Ripper çevrimdışı kırma |
| Raporlama | CVSS v3.1 puanlamalı HTML/PDF raporlar, Jinja2 şablonları |
| Çok ajanlı (V2) | BrainAgent koordinatör + 7 uzman ajan (scanner, exploit, webapp, OSINT, post-exploit, lateral, reporting) |
| Shell kalıcılığı (V2) | Heartbeat izlemeli ve otomatik yeniden bağlantılı ShellManager |
| Ajanlar arası mesajlaşma (V2) | 20 mesaj tipiyle async pub/sub AgentMessageBus |
| Paylaşımlı görev durumu (V2) | MissionContext (hostlar, portlar, açıklıklar, kimlik bilgileri, loot, saldırı grafı) |
| Gerçek zamanlı arayüz | Ajan düşüncesi/eylemi/sonucu WebSocket akışı |
| Saldırı grafı | Compromise seviyesi görselleştirmeli React/TypeScript saldırı graf tuvali |
| Bilgi tabanı | Servis-exploit başarı hafızası + tam denetim kaydı (salt-eklenir) |
| Güvenlik | 10 kural + 5 izin bayrağı + never-scan listesi + kill switch |
| Savunma modülü | Blue-team ağ izleme, dedektör motoru, saldırgan profilleme, aldatma araçları |
| ML pipeline | XGBoost + scikit-learn exploit tahmincisi, bulgu sınıflandırıcı, saldırı yolu modeli |
| LLM sağlayıcıları | OpenRouter, Ollama, LM Studio, OpenCode Go — çalışma zamanında değiştirilebilir |
| Eğitim verisi | LLM fine-tuning için LoRA formatında JSONL yakalama |
| Eklenti sistemi | Python sınıfı, CLI sarmalayıcı, API sarmalayıcı — hepsi otomatik keşfedilir |

**`tools/` altında 33 kayıtlı araç:** `nmap_scan`, `masscan_scan`, `searchsploit_search`, `metasploit_run`, `ssh_exec`, `shell_exec`, `local_exec`, `whatweb_scan`, `nikto_scan`, `nuclei_scan`, `ffuf_scan`, `gobuster_scan`, `arjun_scan`, `sqlmap_scan`, `wpscan_scan`, `commix_scan`, `crackmapexec_exec`, `impacket_exec`, `theHarvester_scan`, `subfinder_scan`, `whois_lookup`, `dns_enum`, `telnet_probe`, `rsh_exec`, `distcc_exec`, `webdav_put`, `smb_enum`, `hydra_brute`, `hashcat_crack`, `john_crack`, `ddos_test`, `generate_report`, `report_finding`

Ortamda hangilerinin hazır olduğunu `GET /api/v1/tools/status` ile görebilirsiniz.

---

## Mimari

```
+----------------------------------------------------------+
|                         TIRPAN                            |
|                                                          |
|  +----------+     +----------------------------------+   |
|  | Web      |<--->|  FastAPI  —  REST + WebSocket    |   |
|  | Arayüzü  |     +----------------+-----------------+   |
|  +----------+                      |                     |
|                       +------------v-----------+         |
|                       |    ReAct Ajan Çekirdeği|         |
|                       |                        |         |
|                       |  Düşün  ->  Harekete   |         |
|                       |  Geç   ->  Yansıt      |         |
|                       |                        |         |
|                       |   +----------------+   |         |
|                       |   | Güvenlik       |   |         |
|                       |   | Katmanı        |   |         |
|                       |   +----------------+   |         |
|                       +------------+-----------+         |
|                                    |                     |
|                       +------------v-----------+         |
|                       |     Araç Kayıt Defteri |         |
|                       |                        |         |
|                       |  nmap_scan             |         |
|                       |  searchsploit_search   |         |
|                       |  metasploit_run        |         |
|                       |  ssh_exec              |         |
|                       |  shell_exec            |         |
|                       |  [+ eklentiler]  V2+   |         |
|                       +------------------------+         |
|                                                          |
|  +---------------------+  +--------------------------+   |
|  |      LLM Katmanı    |  |     SQLite Veritabanı    |   |
|  |  OpenRouter + Ollama|  |  Oturumlar / Bulgular /  |   |
|  |  (bulut veya yerel) |  |  Bilgi Tabanı / Denetim  |   |
|  +---------------------+  +--------------------------+   |
+----------------------------------------------------------+
```

**Tasarım ilkesi: küçük çekirdek, geniş araç yüzeyi.**
ReAct döngüsü, güvenlik katmanı ve LLM istemcisi sabittir. 33 araç `tools/` altında; özel entegrasyonlar `plugins/` ile eklenir.

V2 ile Brain ajan, MissionContext, async mesaj yolu, kalıcı shell yöneticisi ve 7 uzman ajan (scanner, exploit, webapp, OSINT, post-exploit, lateral, reporting) gelir. Hepsi Brain'in koordinasyonunda paralel çalışır. Ayrıntı için [docs/02_ARCHITECTURE.md](docs/02_ARCHITECTURE.md).

---

## Hızlı Başlangıç

**Gereksinimler:** Python 3.11+, Nmap 7.94+, Metasploit Framework 6.x, SearchSploit

```bash
# Kopyala
git clone https://github.com/fthsrbst/tirpan.git
cd tirpan

# Bağımlılıkları yükle
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Yapılandır
cp .env.example .env
# Bulut LLM için OPENROUTER_API_KEY, yerel çıkarım için OLLAMA_MODEL ayarla

# Metasploit RPC'yi başlat (exploitation için gerekli; yalnızca tarama modunda atla)
msfrpcd -P sifreniz -S

# Web arayüzünü başlat (V1 + V2 destekli)
python3 main.py
# http://localhost:8000 adresini aç

# Ya da terminal üzerinden başsız çalıştır (V1 tek ajan)
python3 main.py run --target 192.168.1.0/24 --mode full_auto --scope 192.168.1.0/24
```

**Docker ile hızlı lab kurulumu:**

```bash
# Savunmasız bir hedef başlat (Metasploitable 2)
docker run -d --name hedef tleemcjr/metasploitable2

# TIRPAN'i hedefe yönlendir
python3 main.py run --target $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' hedef)
```

---

## CLI Referansı

TIRPAN iki modda çalışır: **web arayüzü** (varsayılan, V1+V2) ve **terminal** (V1 başsız).

### Web Arayüzü

```bash
python3 main.py [--host HOST] [--port PORT] [--no-reload] [--log-level LEVEL]
```

| Bayrak | Varsayılan | Açıklama |
|--------|------------|----------|
| `--host` | `127.0.0.1` | Bağlama adresi |
| `--port` | `8000` | Dinleme portu |
| `--no-reload` | kapalı | Hot-reload'u devre dışı bırak |
| `--log-level` | `info` | debug / info / warning / error |

### Terminal Modu

```bash
python3 main.py run --target HEDEF [seçenekler]
```

| Bayrak | Varsayılan | Açıklama |
|--------|------------|----------|
| `--target` / `-t` | zorunlu | IP, CIDR, hostname veya URL |
| `--mode` / `-m` | `scan_only` | `full_auto` / `ask_before_exploit` / `scan_only` |
| `--scope` | `0.0.0.0/0` | Kesin CIDR sınırı — ajan bu aralığı terk edemez |
| `--exclude-ips` | — | Tamamen atlanacak IP'ler (virgülle ayrılmış) |
| `--exclude-ports` | — | Atlanacak portlar (virgülle ayrılmış) |
| `--time-limit` | `0` (yok) | N saniye sonra otomatik durdur |
| `--rate-limit` | `10` | Saniye başına maksimum istek |
| `--max-iterations` | `50` | Maksimum ajan karar döngüsü |
| `--no-dos-block` | kapalı | DoS kategorisi exploit'lere izin ver (tehlikeli) |
| `--no-destructive-block` | kapalı | Yıkıcı exploit'lere izin ver (tehlikeli) |
| `--output` / `-o` | `reports/` | Rapor çıktı dizini |

**Örnekler:**

```bash
# Yalnızca keşif — exploitation yok
python3 main.py run --target 10.0.0.0/24

# Kapsam kısıtlı ve zamanlı tam angajman
python3 main.py run --target 10.0.0.1 --mode full_auto --scope 10.0.0.0/24 --time-limit 3600

# Dışlamalarla tarama
python3 main.py run --target 192.168.1.0/24 --exclude-ips 192.168.1.1,192.168.1.254 --exclude-ports 22,3389
```

---

## Güvenlik Kısıtlamaları

TIRPAN her eylemde on yapılandırılabilir güvenlik kısıtlaması uygular. Bu kısıtlamalar LLM tarafından aşılamaz — herhangi bir araç çalışmadan önce ayrı bir katmanda değerlendirilir.

| Kısıtlama | Varsayılan | Açıklama |
|-----------|------------|----------|
| `allowed_cidr` | `0.0.0.0/0` | CIDR sınırı — ajan bu aralık dışındaki IP'leri hedef alamaz |
| `allow_exploit` | `true` | Yalnızca keşif modu için `false` yapın |
| `block_dos_exploits` | `true` | DoS exploit kategorilerini bloke eder |
| `block_destructive` | `true` | Yıkıcı modülleri bloke eder (wipe/encrypt) |
| `max_cvss_score` | `10.0` | CVSS tavanı |
| `session_max_seconds` | `0` | N saniye sonra otomatik durdurma (0 = sınırsız) |
| `max_requests_per_second` | `50` | Ağ aksamasını önlemek için hız sınırı |
| `excluded_ips` | `[]` | Her zaman atlanan IP'ler |
| `excluded_ports` | `[]` | Her zaman atlanan portlar |
| `allowed_port_min/max` | `1-65535` | Port aralığı kısıtı |

**Never-scan listesi:** DB + per-session dışlamalarından gelen sert blok listesi. İhlaller CRITICAL olarak loglanır ve her zaman engellenir.

---

## Görev Yapılandırması

Yapılandırılmış angajmanlar için TIRPAN, kapsam, izinler, kimlik bilgileri ve hedefleri kontrol eden bir `MissionBrief` yapılandırması kabul eder.

```json
{
  "target": "10.0.0.50",
  "mode": "full_auto",
  "target_type": "webapp",
  "speed_profile": "stealth",
  "objectives": ["flag.txt'yi bul", "/etc/shadow'u dök", "root erişimi elde et"],
  "known_tech": ["apache/2.4", "php/8.1"],
  "scope_notes": "Üretim sistemi. Yalnızca 80 ve 443 portları.",
  "allow_exploitation": true,
  "allow_post_exploitation": true,
  "allow_lateral_movement": false,
  "allow_persistence": false,
  "allow_credential_harvest": false,
  "allow_data_exfil": false,
  "excluded_targets": ["10.0.0.1", "10.0.0.254"]
}
```

**Hız profilleri:**

| Profil | Nmap zamanlaması | Davranış |
|--------|-----------------|----------|
| `stealth` | `-T1 --scan-delay 5s` | Yavaş, IDS-kaçınmalı, minimum log izi |
| `normal` | `-T3` | Dengeli, çoğu angajman için varsayılan |
| `aggressive` | `-T5 --min-rate 5000` | Maksimum hız, yalnızca lab ve CTF hedefleri |

**Desteklenen kimlik bilgisi türleri:** SSH (şifre veya anahtar), SMB/NTLM, SNMP, veritabanı (MySQL, PostgreSQL, MSSQL, MongoDB), HTTP (basic, digest, form, bearer token).

---

## Yol Haritası

TIRPAN iki aşamada geliştirilmiştir. V1 ağ düzeyinde temeldir, V2 çok ajanlı orkestrasyon ve genişletilmiş yetenekler ekler.

### V1 — Ağ Sızma Testi (tamamlandı)

- ReAct ajan döngüsü (Düşün, Harekete Geç, Gözlemle, Yansıt)
- Nmap / SearchSploit / Metasploit entegrasyonu
- SSH, bind shell, reverse shell ve betik çalıştırma ile sızma sonrası
- 10 güvenlik kısıtlaması ve durdurma anahtarı
- Gerçek zamanlı akışlı web arayüzü
- SQLite bilgi tabanı ve tam denetim kaydı
- CVSS v3.1 puanlamasıyla HTML ve PDF raporlar
- MissionBrief yapılandırılmış konfigürasyon
- Hız profilleri: stealth / normal / aggressive
- Eklenti mimarisi (altyapı hazır)

### V2 — Çok Ajanli Saldırı Yaşam Döngüsü (uygulandı)

**Pasif Keşif (OSINT)**
- theHarvester, subfinder, amass, crt.sh sertifika şeffaflığı, Shodan, WHOIS
- GitHub ve kaynak kod gizli bilgi taraması
- DNS zone transfer ve subdomain sıralaması

**Servis Sıralaması**
- SMB: enum4linux-ng, CrackMapExec (paylaşımlar, kullanıcılar, şifre politikası)
- LDAP / Active Directory: ldapsearch, ldapdomaindump
- SNMP, SMTP, Redis, MongoDB kimlik doğrulamasız erişim
- DNS brute-force ve zone transferları

**Web Uygulama Testi**
- Teknoloji tespiti: WhatWeb, WAF tespiti
- Dizin ve dosya keşfi: Feroxbuster, ffuf, Gobuster
- Güvenlik açığı taraması: Nuclei (9000+ şablon), Nikto
- SQL enjeksiyonu: sqlmap (tespit ve exploitation)
- Cross-site scripting: Dalfox, XSStrike
- Komut enjeksiyonu: Commix
- Sunucu taraflı şablon enjeksiyonu: tplmap
- SSRF, XXE, LFI/RFI, dosya yükleme bypass, açık yönlendirme
- JWT saldırıları, GraphQL sıralaması, OAuth yanlış yapılandırması
- HTTP istek kaçakçılığı ve deserialization güvenlik açıkları

**Active Directory Saldırıları**
- BloodHound-python veri toplama
- Impacket ile Kerberoasting ve AS-REP roasting
- Pass-the-hash: CrackMapExec, evil-winrm
- DCSync: impacket-secretsdump

**Kimlik Bilgisi Saldırıları**
- Çevrimiçi brute-force: Hydra, Medusa
- Hesap kilitleme korumalı credential spraying
- Çevrimdışı hash kırma: Hashcat, John the Ripper

**Sızma Sonrası**
- Otomatik linpeas / winpeas yükleme ve çalıştırma
- Hedefte özel kod üretimi, yükleme ve çalıştırma (LLM yazılı yükler)
- Yetki yükseltme yolu analizi

**Yanal Hareket**
- TCP tünelleme: Chisel, Socat
- Impacket psexec / wmiexec
- İç subnet keşfi ve pivot taraması

**CTF ve Bug Bounty Modları**
- Otomatik flag tespiti ve yakalaması (HTB, THM, CTFd)
- Bug bounty kapsam uygulaması ve kapsam dışı engelleme
- HackerOne / Bugcrowd için CVSS filtreli raporlama şablonları

**Altyapı**
- Kurulum ipuçlarıyla araç sağlık kontrol sistemi
- Eklenti türleri: Python sınıfı, CLI sarmalayıcı, REST API sarmalayıcı
- Kanıtlar, yeniden üretim adımları ve düzeltme önerileriyle yapılandırılmış `Finding` modeli
- CI/CD ve IDE entegrasyonu için SARIF çıktısı
- Yerel gömülü modellerle vektör arama bilgi tabanı (RAG)

---

## Eklenti Yazma

Eklentiler isteğe bağlıdır. Çekirdek ve genişletilmiş araçlar `tools/` altındadır; özel entegrasyonlar `plugins/` ile eklenir.

**Python sınıfı eklentisi** (karmaşık mantık):

```python
# plugins/benim_aracim/tool.py
from tools.base_tool import BaseTool, ToolMetadata

class BenimAracim(BaseTool):
    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="benim_aracim",
            description="X güvenlik açığını tarar.",
            parameters={
                "type": "object",
                "properties": {
                    "target": {"type": "string", "description": "IP veya hostname"}
                },
                "required": ["target"]
            },
            category="recon",
            version="1.0.0"
        )

    async def execute(self, params: dict) -> dict:
        target = params["target"]
        # implementasyon
        return {"success": True, "output": results, "error": None}
```

**CLI sarmalayıcı eklentisi** (V2 — Python gerekmez):

```json
{
  "name": "nuclei_scan",
  "type": "cli_wrapper",
  "binary": "nuclei",
  "install_hint": "go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest",
  "args_template": ["-u", "{target}", "-t", "{templates}", "-o", "{output_file}", "-json", "-silent"],
  "output_format": "jsonlines",
  "parameters": {
    "type": "object",
    "properties": {
      "target": {"type": "string"},
      "templates": {"type": "string", "default": "cves/"}
    },
    "required": ["target"]
  }
}
```

Ajan eklentileri otomatik olarak keşfeder, yükler ve kullanır — LLM'e kullanılabilir eylemler olarak sunmak dahil.

---

## XBOW ile Karşılaştırma

XBOW, otonom yapay zeka sızma testi için mevcut ticari referans noktasıdır. TIRPAN açık kaynak alternatifidir.

| Yetenek | XBOW | TIRPAN V1 | TIRPAN V2+ |
|---------|------|----------|-----------|
| Ağ tarama ve exploitation | Evet | Evet | Evet |
| YZ güdümlü ReAct döngüsü | Evet | Evet | Evet |
| Güvenlik kısıtlamaları | Evet | Evet | Evet |
| Oturumlar arası bilgi tabanı | Evet | Evet | Evet |
| Tam denetim kaydı | Evet | Evet | Evet |
| Web uygulama testi | Evet | Hayır | Evet |
| Active Directory saldırıları | Evet | Hayır | Evet |
| OSINT ve pasif keşif | Evet | Hayır | Evet |
| Başarısızlıkta öz-düzeltme | Evet | Hayır | Evet |
| Docker izolasyonlu araç çalıştırma | Evet | Hayır | Hayır |
| Çok ajanlı koordinatör mimarisi | Evet | Hayır | Evet |
| Açık kaynak | Hayır | Evet | Evet |
| Ücretsiz kullanım | Hayır | Evet | Evet |
| Genişletilebilir eklenti ekosistemi | Hayır | Evet | Evet |
| Yerel LLM desteği | Hayır | Evet | Evet |
| ML tabanlı exploit tahmini | Hayır | Hayır | Evet |
| Ağ savunması (blue team) | Hayır | Hayır | Evet |
| Saldırı grafı görselleştirme | Kısmi | Evet | Evet (React) |
| LoRA eğitim verisi yakalama | Hayır | Hayır | Evet |

Tam karşılaştırma: [docs/01_XBOW_COMPARISON.md](docs/01_XBOW_COMPARISON.md)

---

## Teknoloji Yığını

| Bileşen | Teknoloji |
|---------|-----------|
| Dil | Python 3.11+ |
| Web çerçevesi | WebSocket akışıyla FastAPI 0.110+ |
| LLM (bulut) | OpenRouter — Claude, GPT-4, Gemini ve diğerleri |
| LLM (bulut) | OpenCode Go — DeepSeek R1 ve diğerleri |
| LLM (yerel) | Ollama — Llama 3, Qwen, Mistral ve diğerleri |
| LLM (yerel) | LM Studio — yerel çıkarım sunucusu |
| Saldırı araçları | 33 araç: Nmap, Masscan, Metasploit, SearchSploit, Hydra, Hashcat, John, sqlmap, Nuclei, CrackMapExec, Impacket ve daha fazlası |
| Veritabanı | aiosqlite üzerinden SQLite (async) |
| Raporlama | Jinja2 + WeasyPrint (HTML ve PDF) |
| Ön uç | Vanilla HTML/CSS/JS + React/TypeScript saldırı graf tuvali (Vite + Cytoscape.js + Tailwind) |
| ML | scikit-learn + XGBoost — exploit tahmincisi, bulgu sınıflandırıcı, saldırı yolu modeli |
| Test | pytest + pytest-asyncio + pytest-cov — 22 dosyada 681 test |
| Linting | ruff + black |
| CLI | argparse + Rich |
| Eklenti yükleme | importlib (stdlib) |
| Savunma | Scapy tabanlı sniffing, kural tabanlı dedektörler, LLM destekli savunma ajanı |
| Eğitim verisi | LLM fine-tuning için LoRA formatında JSONL yakalama (Qwen3 ChatML) |

---

## Güvenli Test Ortamları

Sahip olmadığınız veya açık yazılı izin almadığınız sistemleri asla test etmeyin. Bunları kullanın:

| Ortam | Açıklama | Kurulum |
|-------|----------|---------|
| Metasploitable 2 | Kasıtlı olarak savunmasız Linux VM | `docker run -d tleemcjr/metasploitable2` |
| DVWA | Savunmasız web uygulaması | `docker run -d vulnerables/web-dvwa` |
| HackTheBox | CTF ve lab platformu | hackthebox.com |
| VulnHub | İndirilebilir savunmasız VM'ler | vulnhub.com |
| TryHackMe | Rehberli öğrenme laboratuvarları | tryhackme.com |

---

## Dokümantasyon

| Belge | Açıklama |
|-------|----------|
| [Mimari](docs/02_ARCHITECTURE.md) | Diyagramlı tam sistem tasarımı |
| [Gereksinimler](docs/03_PREREQUISITES.md) | Kurulum ve bağımlılık kurulumu |
| [Yol Haritası](docs/04_ROADMAP.md) | Tamamlanan ve planlanan özellik planı |
| [Güvenlik ve Hukuk](docs/05_SAFETY_AND_LEGAL.md) | 10 kısıtlama ve yasal gereksinimler |
| [XBOW Karşılaştırması](docs/01_XBOW_COMPARISON.md) | Özellik açığı analizi |
| [Eklenti Sistemi](docs/09_PLUGIN_SYSTEM.md) | Eklenti yazma kılavuzu |
| [Çok Ajanlı Spesifikasyon](docs/11_MULTI_AGENT_SPEC.md) | V2 çok ajanlı mimari |
| [Savunma Modülü](docs/07_NETWORK_DEFENSE_MODULE.md) | Blue team savunma mimarisi |
| [Lab Ortamı](docs/12_LAB_ENVIRONMENT.md) | VM tabanlı pratik lab kurulumu |
| [Master Checklist](docs/08_MASTER_CHECKLIST.md) | Detaylı uygulama ilerlemesi |
| [Öğrenme Yol Haritası](docs/10_LEARNING_ROADMAP.md) | Geliştiriciler için beceri ilerlemesi |

---

## Katkıda Bulunma

TIRPAN eklenti ekosistemi aracılığıyla büyümektedir. Katkılar memnuniyetle karşılanır:

- **Yeni eklentiler** — Eklenti kılavuzunu takip ederek yeni bir saldırı türü ekleyin
- **Çekirdek iyileştirmeler** — Ajan döngüsü, güvenlik katmanı, LLM istemcisi
- **Hata raporları** — GitHub üzerinde bir issue açın
- **Dokümantasyon** — Kurulum kılavuzlarını ve örnekleri iyileştirin

Yönergeler için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bakın.

---

## Yasal Sorumluluk Reddi

Bu yazılım yalnızca **yetkili güvenlik testi ortamlarında** kullanım için sağlanmaktadır — açık yazılı izin alınan sızma testi angajmanları, kontrollü lab ortamları, CTF yarışmaları ve akademik araştırma.

Bu yazılımı kullanarak şunları kabul etmiş olursunuz:

- Yalnızca sahip olduğunuz veya test etmek için açık yazılı izninizin olduğu sistemleri test edeceksiniz.
- Geçerli tüm yerel, ulusal ve uluslararası mevzuata uyumluluktan yalnızca siz sorumlusunuz.
- Sahip olmadığınız veya açık izninizin olmadığı sistemlere karşı yetkisiz kullanım, CFAA, Bilgisayar Kötüye Kullanım Yasası ve diğer yargı bölgelerindeki eşdeğer mevzuat kapsamında suç teşkil edebilir.

**Yazarlar, bu yazılımın kullanımından veya kötüye kullanımından kaynaklanan herhangi bir zarar, veri kaybı, hukuki sonuç veya başka bir zarara karşı hiçbir sorumluluk kabul etmez.**

---

## Lisans

[TIRPAN Ticari Olmayan Lisansı](LICENSE) — Kişisel, eğitimsel ve araştırma kullanımı için ücretsizdir. Ticari kullanım, yazarlardan açık yazılı izin gerektirir.

---

<div align="center">

[Bu depoyu yıldızla](https://github.com/fthsrbst/tirpan) · [Hata bildir](https://github.com/fthsrbst/tirpan/issues) · [Özellik talep et](https://github.com/fthsrbst/tirpan/issues)

</div>
