# PenTestAI — Plugin Sistemi Spesifikasyonu

> **Amaç:** Core'a dokunmadan yeni saldırı capabilityleri ekleyebilmek.  
> V1'de 3 built-in tool var, geri her şey plugin ile gelecek.

---

## Neden Plugin Sistemi?

| Yöntem                  | Sorun                                                                           |
| ----------------------- | ------------------------------------------------------------------------------- |
| Tool'ları core'a gömmek | XSS eklersen Nmap koduna dokunman gerekiyor = patlama riski                     |
| Her şeyi baştan yazmak  | Metasploit güncellenince tüm sistem etkileniyor                                 |
| **Plugin sistemi** ✅   | XSS tool'u yaz → `/plugins/web_scan/` klasörüne koy → sisteme bildir → çalıştır |

---

## Plugin vs Core Tool Ayrımı

| Kategori                     | Örnekler                          | Nerede            |
| ---------------------------- | --------------------------------- | ----------------- |
| **Core Tools** (V1 built-in) | Nmap, SearchSploit, Metasploit    | `tools/`          |
| **Plugin Tools** (V2+)       | WebScan, Nuclei, Gobuster, SQLMap | `plugins/<isim>/` |

### Kural:

- Bir tool **network-level, bağımsız çalışıyor, kurulum gerektirmiyor** → `tools/` (core)
- Bir tool **dış bağımlılık, belirli hedef tipi, opsiyonel** → `plugins/` (plugin)

---

## Plugin Anatomi (Her Plugin Tam Olarak Şunu İçerir)

```
plugins/
└── web_scanner/            ← Plugin klasörü (lowercase, underscore)
    ├── plugin.json         ← Manifest (ZORUNLU)
    ├── tool.py             ← Ana tool implementasyonu (ZORUNLU)
    ├── requirements.txt    ← Plugin'e özgü bağımlılıklar (opsiyonel)
    └── README.md           ← Kullanım kılavuzu (önerilen)
```

---

## `plugin.json` Şeması (Tam Spec)

```json
{
  "name": "web_scanner",
  "version": "1.0.0",
  "display_name": "Web Vulnerability Scanner",
  "description": "XSS, SQLi ve SSRF tespiti için headless browser tabanlı tarayıcı.",
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

### Alan Açıklamaları

| Alan                | Tip    | Açıklama                                                 |
| ------------------- | ------ | -------------------------------------------------------- |
| `name`              | string | Benzersiz plugin kimliği (klasör adıyla aynı)            |
| `version`           | semver | Plugin versiyonu                                         |
| `enabled`           | bool   | `false` → yüklenmez, etkinleştirmek için `true` yap      |
| `entry_point`       | string | `modul.yolu.SınıfAdı` (importlib bunu kullanır)          |
| `requires_packages` | list   | pip ile kurulacak bağımlılıklar                          |
| `min_core_version`  | semver | Bu plugin hangi core versiyonundan itibaren çalışır      |
| `safety_level`      | enum   | `"low"` / `"medium"` / `"high"` — kullanıcıya gösterilir |
| `target_type`       | enum   | `"ip"` / `"url"` / `"cidr"` / `"any"`                    |

---

## `tool.py` Şablonu (Kopyala-Yapıştır)

```python
# plugins/web_scanner/tool.py
from tools.base_tool import BaseTool, ToolMetadata

class WebScannerTool(BaseTool):
    """
    Headless browser kullanarak XSS, SQLi, SSRF tespiti yapar.
    Playwright gerektirir.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="web_scan",
            description=(
                "Web uygulamasını XSS, SQLi ve SSRF açıkları için tara. "
                "Sadece URL hedefleri için kullan, IP adresi değil."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Taranacak URL (örn: http://target.com/login)"
                    },
                    "scan_type": {
                        "type": "string",
                        "enum": ["xss", "sqli", "ssrf", "all"],
                        "description": "Hangi zafiyet türleri aransın"
                    },
                    "depth": {
                        "type": "integer",
                        "default": 2,
                        "description": "Kaç link derinliğine kadar taransın"
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
            # Burada Playwright veya özel tarama kodu
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
        # Asıl tarama implementasyonu
        ...
```

---

## Plugin Etkinleştirme

```bash
# Yöntem 1: plugin.json'u düzenle
# plugins/web_scanner/plugin.json → "enabled": true

# Yöntem 2: CLI ile (V2 hedef)
python main.py --enable-plugin web_scanner

# Yöntem 3: Web UI'dan (V2 hedef)
# Settings → Plugins → Web Scanner → Enable
```

---

## Mevcut + Planlı Plugin Listesi

| Plugin Adı             | Durum        | Versiyon | Açıklama                       |
| ---------------------- | ------------ | -------- | ------------------------------ |
| `web_scanner`          | 📋 Planlandı | V2       | XSS, SQLi, SSRF (Playwright)   |
| `nuclei_scanner`       | 📋 Planlandı | V2       | Nuclei template-based tarama   |
| `gobuster`             | 📋 Planlandı | V2       | Directory/file brute force     |
| `interactsh`           | 📋 Planlandı | V2       | OOB (blind injection) tespiti  |
| `sqlmap_plugin`        | 📋 Planlandı | V2       | Otomatik SQL injection         |
| `ffuf_plugin`          | 📋 Planlandı | V2       | Web fuzzing                    |
| `custom_payload`       | 📋 Planlandı | V2       | LLM'in kod yazdığı exploit     |
| `source_code_analyzer` | 📋 Planlandı | V3       | Semgrep + LLM white-box analiz |

---

## ToolRegistry Entegrasyon Akışı

```
main.py başladığında:
  1. ToolRegistry() oluştur
  2. Core tools register et:
       registry.register(NmapTool())
       registry.register(SearchSploitTool())
       registry.register(MetasploitTool())
  3. registry.load_plugins(Path("plugins/")) çağır
       → Her plugin.json oku
       → enabled: true olanları importlib ile yükle
       → registry.register(PluginToolClass())
  4. Agent'a registry'yi inject et
  5. Agent, LLM'e tool listesini registry.list_for_llm() ile verir
```

---

## Plugin Yazarken Dikkat Edilecekler

### ✅ Yapılması Gerekenler

- `BaseTool`'dan miras al, sözleşmeyi boz
- `metadata.description` detaylı yaz — LLM bunu okuyarak ne zaman kullanacağına karar verir
- Her zaman `{"success": bool, "output": any, "error": str|None}` döndür
- Exception'ları yakala, kontrolsüz fırlatma
- `plugin.json`'da `min_core_version` belirt

### ❌ Yapılmaması Gerekenler

- Core dosyalarına (`core/`, `tools/`, `database/`) dokunma
- Global state tutma (stateless ol)
- `config.py`'yi doğrudan import etme → constructor'dan inject et
- Engellenmiş komutları çalıştırma (`safety.py` zaten bloklar ama bilerek deneme)

---

## V1 Referans: Core Tool Listesi

V1'de yalnızca bu 3 tool built-in gelir:

| Tool Adı              | Dosya                        | Ne Yapar                                |
| --------------------- | ---------------------------- | --------------------------------------- |
| `nmap_scan`           | `tools/nmap_tool.py`         | Port tarama, host keşfi, servis tespiti |
| `searchsploit_search` | `tools/searchsploit_tool.py` | Exploit veritabanı arama                |
| `metasploit_run`      | `tools/metasploit_tool.py`   | Exploit çalıştırma, oturum yönetimi     |

Ve 1 built-in "meta-tool" (tool değil, internal action):

| Meta-action       | Ne Yapar                                    |
| ----------------- | ------------------------------------------- |
| `generate_report` | Session bulgularından PDF/HTML rapor üretir |
| `finish`          | Agent döngüsünü sonlandırır                 |
