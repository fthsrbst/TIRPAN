# AEGIS — Öğrenme Yol Haritası

Projeyi yaparken öğreneceğin konular ve her konuda odaklanman gereken spesifik başlıklar.
Sıra önemli — her konu bir sonrakinin temeli.

---

## 1. OOP — Object-Oriented Programming

**Projedeki yeri:** `tools/base_tool.py`, `tools/nmap_tool.py`, `core/agent.py`, her yer.

### Odaklanman gerekenler:

- **Class tanımlamak** — `class MyClass:` sözdizimi, `__init__` metodu, `self`
- **Instance vs class attribute** — `self.x` ile `MyClass.x` farkı
- **Method tanımlamak** — instance method, ne zaman `self` alır
- **Inheritance (kalıtım)** — `class Child(Parent):` sözdizimi, parent'tan ne miras kalır
- **`super()`** — parent'ın `__init__`'ini çağırmak
- **Abstract class + abstractmethod** — `from abc import ABC, abstractmethod` — child class'ı bir metodu implement etmeye zorlamak
- **`@property` decorator** — metodu attribute gibi çağırmak (`tool.metadata` vs `tool.metadata()`)
- **Dunder metodlar** — `__str__`, `__repr__`, `__len__` (ne olduğunu bilmek yeterli)

### Projedeki somut kullanım:
```
BaseTool (abstract)
    ├── NmapTool (concrete)
    ├── SearchSploitTool (concrete)
    └── MetasploitTool (concrete)
```
`BaseTool` bir kontrat tanımlar: her tool `metadata` property'sine ve `execute()` metoduna sahip olmak zorunda.
Bunu bilmeden `tools/` klasörünü yazamazsın.

---

## 2. Type Hints + Pydantic

**Projedeki yeri:** `models/`, `config.py`, `tools/base_tool.py`

### Odaklanman gerekenler:

- **Temel type hints** — `str`, `int`, `bool`, `list[str]`, `dict[str, int]`, `tuple`
- **Optional** — `str | None` veya `Optional[str]`
- **Pydantic BaseModel** — class tanımlamak, field validation, default değerler
- **Field() ile validation** — `Field(gt=0)`, `Field(default=...)`, `Field(description=...)`
- **`.model_dump()`** — modeli dict'e çevirmek
- **Nested model** — bir modelin içinde başka model
- **`@validator` / `@field_validator`** — özel validation kuralı yazmak

---

## 3. async/await

**Projedeki yeri:** Projenin %90'ı. FastAPI, aiosqlite, httpx hepsi async.

### Odaklanman gerekenler:

- **`async def` ile `def` farkı** — neden async kullanıyoruz
- **`await` ne zaman yazılır** — sadece async fonksiyon çağrısı öncesi
- **`asyncio.run()`** — sync koddan async kodu başlatmak
- **`async with`** — async context manager (httpx client, db connection)
- **`async for`** — async generator'lardan okumak
- **`asyncio.gather()`** — birden fazla async işi aynı anda çalıştırmak
- **Event loop kavramı** — arka planda ne oluyor (derin bilmek şart değil, kavramsal yeterli)

---

## 4. subprocess — Dış Komut Çalıştırmak

**Projedeki yeri:** `tools/nmap_tool.py`, `tools/searchsploit_tool.py`

### Odaklanman gerekenler:

- **`subprocess.run()`** — basit komut çalıştırma
- **`capture_output=True`** — stdout/stderr'ı yakalamak
- **`check=True`** — hata durumunda exception fırlatmak
- **`asyncio.create_subprocess_exec()`** — async subprocess (projede bu kullanılıyor)
- **stdout/stderr okumak** — `.communicate()` ile
- **Timeout** — komutu belirli süre sonra öldürmek
- **Güvenlik:** shell injection nedir, neden `shell=True` tehlikeli

---

## 5. JSON + XML Parsing

**Projedeki yeri:** `tools/nmap_tool.py` (XML), LLM yanıtları (JSON)

### Odaklanman gerekenler:

**JSON:**
- `json.loads()` — string'den dict
- `json.dumps()` — dict'ten string
- Nested JSON'a erişmek — `data["key"]["subkey"]`
- `.get()` ile güvenli erişim

**XML (Nmap çıktısı için):**
- `xml.etree.ElementTree` — stdlib XML parser
- `ET.fromstring()` — string'den parse
- `.find()`, `.findall()` — eleman bulmak
- `.get("attribute")` — attribute okumak
- Nmap XML yapısını tanımak: `<host>`, `<port>`, `<service>` elemanları

---

## 6. HTTP API Çağrısı (httpx)

**Projedeki yeri:** `core/llm_client.py` — OpenRouter ve Ollama ile iletişim

### Odaklanman gerekenler:

- **`httpx.AsyncClient`** — async HTTP client
- **`client.post(url, json=..., headers=...)`** — POST isteği göndermek
- **Response okumak** — `.json()`, `.status_code`, `.text`
- **Header'lar** — Authorization, Content-Type
- **Timeout ayarlamak**
- **HTTPStatusError** — hatalı response'u yakalamak
- **Retry mantığı** — başarısız isteği tekrar denemek

---

## 7. SQL + SQLite (aiosqlite)

**Projedeki yeri:** `database/`

### Odaklanman gerekenler:

**SQL:**
- `CREATE TABLE` — tablo oluşturmak, kolon tipleri (`TEXT`, `INTEGER`, `REAL`, `BLOB`)
- `INSERT INTO` — kayıt eklemek
- `SELECT ... WHERE` — kayıt sorgulamak
- `UPDATE ... SET ... WHERE` — kayıt güncellemek
- `JOIN` — iki tabloyu birleştirmek
- `PRIMARY KEY`, `FOREIGN KEY` — ilişki kurmak
- `LIKE`, `ORDER BY`, `LIMIT`

**aiosqlite:**
- `async with aiosqlite.connect("db.sqlite") as db:` — bağlantı açmak
- `await db.execute(sql, params)` — sorgu çalıştırmak (parametre binding — SQL injection önleme)
- `await db.fetchall()`, `await db.fetchone()`
- `await db.commit()` — değişiklikleri kaydetmek

---

## 8. ipaddress Modülü

**Projedeki yeri:** `core/safety.py` — scope kontrolü

### Odaklanman gerekenler:

- `ipaddress.ip_address("192.168.1.5")` — IP objesi
- `ipaddress.ip_network("192.168.1.0/24")` — network objesi
- `ip in network` — IP'nin scope içinde olup olmadığı
- CIDR notation nedir (`/24`, `/16`, `/8`)
- Private IP aralıkları: `10.x`, `172.16-31.x`, `192.168.x`

---

## 9. ReAct Agent Pattern

**Projedeki yeri:** `core/agent.py` — projenin kalbi

### Odaklanman gerekenler:

- **ReAct döngüsü:** Reason → Act → Observe → Reflect
- **Tool calling pattern** — LLM'in JSON ile tool seçmesi
- **State yönetimi** — agent hangi aşamada, ne biliyor
- **Termination condition** — agent ne zaman durur
- **Error recovery** — tool başarısız olursa ne yapılır
- **Kavramsal okuma:** LangChain veya LlamaIndex dökümanlarındaki "ReAct agent" açıklamaları

---

## 10. Prompt Engineering

**Projedeki yeri:** `core/prompts.py`

### Odaklanman gerekenler:

- **System prompt** nedir, ne işe yarar
- **Few-shot prompting** — örnekle öğretmek
- **JSON output forcing** — LLM'i belirli formatta cevap vermeye zorlamak
- **Tool description yazımı** — LLM hangi tool'u ne zaman kullanacağını nasıl anlar
- **Context window yönetimi** — token limiti, sliding window

---

## 11. FastAPI (Web backend)

**Projedeki yeri:** `web/`

### Odaklanman gerekenler:

- **`@app.get()`, `@app.post()`** — endpoint tanımlamak
- **Path parameters, query parameters, request body**
- **Pydantic ile request/response validation**
- **Dependency injection** — `Depends()`
- **CORS middleware**
- **WebSocket** — `@app.websocket()`, `await ws.send_text()`, `await ws.receive_text()`
- **Background tasks**

---

## Onay Sirasi (Tavsiye)

```
[1] OOP                  ← simdi
[2] Type hints + Pydantic
[3] async/await
[4] subprocess + JSON/XML
[5] HTTP API (httpx)
[6] SQL + aiosqlite
[7] ipaddress modulu
[8] ReAct pattern (kavramsal)
[9] Prompt engineering
[10] FastAPI
```

Her konuyu bitirdikten sonra projede o konunun kullanıldığı dosyayı birlikte yazacagiz.
