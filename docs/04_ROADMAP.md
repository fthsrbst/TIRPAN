# PenTestAI — Version Roadmap v2

## Vizyon

Açık kaynak otonom AI pentester. **Core küçük, plugin'ler büyük.**  
Network saldırısından başla, plugin sistemiyle her attack tipine genişle.

---

## Sürüm Felsefesi

```
V1 (Capstone):
  Sadece network-level saldırı.
  3 tool, 1 agent, sağlam temel.
  Plugin sistemi hazır ama plugin yok.

V2 (Community Growth):
  Web saldırı plugin'leri.
  Daha akıllı AI kararları.
  Docker izolasyonu.

V3 (XBOW Level):
  Multi-agent, source code analysis,
  zero-day discovery.
```

---

## V1 — Capstone Release

**Hedef:** 3 araçla tam çalışan, plugin'lere açık otonom pentest botu.

### Core Özellikler

- [x] ReAct agent loop (Reason → Act → Observe → Reflect)
- [ ] **ToolRegistry** — plugin loader altyapısı (core tool'lar built-in)
- [ ] Nmap port & servis tarama
- [ ] SearchSploit exploit arama
- [ ] Metasploit RPC exploit çalıştırma
- [ ] OpenRouter (Claude) + Ollama LLM desteği
- [ ] Full Auto + Ask Before Exploit modları
- [ ] 10 safety guardrail + kill switch
- [ ] Full audit logging
- [ ] SQLite veritabanı + knowledge base
- [ ] Session memory (chat history)
- [ ] Web UI — real-time streaming (WebSocket)
- [ ] PDF/HTML rapor + CVSS puanlama
- [ ] IP ve CIDR hedefleme

### V1 Scope Sınırları (Kasıtlı)

- **Sadece network-level** saldırı — web app tarama YOK
- **Tek agent** — paralel execution YOK
- **Host üzerinde çalışır** — Docker izolasyonu YOK
- **Plugin sistemi hazır** ama `/plugins/` klasörü **boş**
- ShellTool **YOK** (güvenlik riski)

### V1 Araçlar

| Tool                  | Dosya                        | Kategori       |
| --------------------- | ---------------------------- | -------------- |
| `nmap_scan`           | `tools/nmap_tool.py`         | recon          |
| `searchsploit_search` | `tools/searchsploit_tool.py` | exploit-search |
| `metasploit_run`      | `tools/metasploit_tool.py`   | exploit-exec   |

---

## V2 — Post-Capstone: Web Testing Plugins

**Hedef:** Plugin sistemiyle web uygulama saldırı kabiliyetleri ekle.

### Yeni Plugin'ler (her biri bağımsız PR)

- [ ] `web_scanner` plugin — XSS, SQLi, SSRF (Playwright)
- [ ] `nuclei_scanner` plugin — Template-based tarama
- [ ] `gobuster` plugin — Directory brute force
- [ ] `interactsh` plugin — Blind injection (OOB callbacks)
- [ ] `custom_payload` plugin — LLM exploit script yazar

### Core Geliştirmeler

- [ ] **Self-Correction** — Başarısız exploit → farklı strateji dene
- [ ] **Internal Reviewer** — İkinci LLM bulguları doğrular (false positive azaltır)
- [ ] **Docker izolasyonu** — Tool'lar container içinde çalışır
- [ ] **Multi-target parallel** — Birden fazla host aynı anda
- [ ] **Domain/URL support** — IP dışı hedefler
- [ ] **SARIF output** — Standart zafiyet rapor formatı
- [ ] **PoC generation** — Her bulgu için tekrarlanabilir kanıt
- [ ] **Network proxying** — Tam trafik izleme
- [ ] **Vector search (RAG)** — Daha akıllı knowledge base

### V2 Araçlar (plugin olarak gelir)

```
plugins/
├── web_scanner/    (Playwright + custom XSS/SQLi/SSRF)
├── nuclei/         (Nuclei templates)
├── gobuster/       (dir brute force)
├── interactsh/     (OOB callbacks)
└── custom_payload/ (LLM-generated scripts)
```

---

## V3 — XBOW Seviyesi

**Hedef:** Üretim kalitesi açık kaynak araç.

### Yeni Özellikler

- [ ] **Coordinator + Solver mimarisi** — Meta-agent özel çözücüler başlatır
- [ ] **İzole attack makineleri** — Her solver kendi container'ında
- [ ] **Source code analizi** — White-box testing (Semgrep + LLM)
- [ ] **Zero-day keşfi** — Novel zafiyet üzerine akıl yürütme
- [ ] **Custom tool generation** — LLM anında tool oluşturur
- [ ] **Sürekli öğrenme** — Her kampanyadan gelişme
- [ ] **CI/CD entegrasyonu** — GitHub Actions, GitLab CI plugin'leri
- [ ] **Bug bounty çıktısı** — HackerOne uyumlu rapor
- [ ] **Always-on monitoring** — Sürekli güvenlik testi
- [ ] Bulut ortamları (AWS, Azure, GCP)

---

## Opsiyonel: Defense Module

> Ana ürün değil — isteğe bağlı Blue Team eki.

```bash
# Attack mode (ana kullanım)
python main.py --target 192.168.1.0/24 --mode full_auto

# Defense mode (opsiyonel, ayrı başlatılır)
sudo python main.py --mode defend --interface eth0 --protect-network 192.168.1.0/24
```

Defense module ayrı bir process olarak çalışır ve ana attack workflow'unu etkilemez.  
Detay: [07_NETWORK_DEFENSE_MODULE.md](07_NETWORK_DEFENSE_MODULE.md)

---

## Timeline (Esnek)

```
2025 Q1-Q2   V1 Geliştirme (Capstone)
             └── Core agent, 3 tool, ToolRegistry, safety, web UI

2025 Q3-Q4   V2 Geliştirme (Community)
             └── Web plugin'leri, Docker, multi-target, akıllı AI

2026+        V3 Geliştirme (XBOW Seviyesi)
             └── Multi-agent, source analiz, zero-day

Sürekli      Açık Kaynak Topluluk
             └── Bug bounty'ler, katkılar, yeni plugin'ler
```

---

## V1 → XBOW Köprüsü

```
V1 (Capstone)          V2 (Growth)              V3 (XBOW Level)
──────────────         ──────────────            ──────────────
Single Agent    →      Single + Reviewer    →    Coordinator + Solvers
Network Only    →      + Web Plugins        →    + Source Code Analysis
3 Core Tools    →      + 5 Plugins          →    + Custom Tool Generation
Basic Retry     →      + Self-Correction    →    + Full Adaptation
Host Exec       →      + Docker Isolation   →    + Isolated Attack Machines
1 Target        →      + Multi-Target       →    + Thousands Simultaneous
SearchSploit    →      + Nuclei + NVD API   →    + Zero-Day Discovery
PDF Report      →      + SARIF + PoC        →    + Bug Bounty Integration
Plugin Altyapı  →      + Plugin Ekosistemi  →    + Plugin Marketplace
```

---

## Açık Kaynak Planı

### Lisans: MIT

### Depo Yapısı (yayınlandığında)

```
PenTestAI/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CHANGELOG.md
├── PLUGIN_GUIDE.md     ← Plugin yazma kılavuzu
├── docs/
├── src/
├── plugins/            ← Community plugin'leri buraya
├── tests/
├── docker/
└── .github/workflows/
```

### Topluluk Hedefleri

- Güvenlik araştırmacılarından katkı al
- Plugin ekosistemi (herkes yeni saldırı tipi yazabilir)
- Dökümantasyon wiki
- Discord/Matrix topluluğu
