# TIRPAN — Learning Roadmap

Topics you will learn while building this project, and the specific areas to focus on within each topic.
Order matters — each topic is the foundation for the next.

---

## 1. OOP — Object-Oriented Programming

**Where it appears in the project:** `tools/base_tool.py`, `tools/nmap_tool.py`, `core/agent.py`, and nearly everywhere.

### What to focus on:

- **Defining a class** — `class MyClass:` syntax, `__init__` method, `self`
- **Instance vs class attribute** — difference between `self.x` and `MyClass.x`
- **Defining methods** — instance methods, when they take `self`
- **Inheritance** — `class Child(Parent):` syntax, what gets inherited from the parent
- **`super()`** — calling the parent's `__init__`
- **Abstract class + abstractmethod** — `from abc import ABC, abstractmethod` — forcing child classes to implement specific methods
- **`@property` decorator** — calling a method like an attribute (`tool.metadata` vs `tool.metadata()`)
- **Dunder methods** — `__str__`, `__repr__`, `__len__` (knowing they exist is enough)

### Concrete usage in the project:

```
BaseTool (abstract)
    ├── NmapTool (concrete)
    ├── SearchSploitTool (concrete)
    └── MetasploitTool (concrete)
```

`BaseTool` defines a contract: every tool must have a `metadata` property and an `execute()` method.
Without understanding this, you cannot write the `tools/` directory.

---

## 2. Type Hints + Pydantic

**Where it appears:** `models/`, `config.py`, `tools/base_tool.py`

### What to focus on:

- **Basic type hints** — `str`, `int`, `bool`, `list[str]`, `dict[str, int]`, `tuple`
- **Optional** — `str | None` or `Optional[str]`
- **Pydantic BaseModel** — defining a class, field validation, default values
- **Field() for validation** — `Field(gt=0)`, `Field(default=...)`, `Field(description=...)`
- **`.model_dump()`** — converting a model to a dict
- **Nested model** — a model containing another model
- **`@validator` / `@field_validator`** — writing custom validation rules

---

## 3. async/await

**Where it appears:** 90% of the project. FastAPI, aiosqlite, httpx — all async.

### What to focus on:

- **`async def` vs `def`** — why we use async
- **When to write `await`** — only before async function calls
- **`asyncio.run()`** — starting async code from synchronous code
- **`async with`** — async context manager (httpx client, db connection)
- **`async for`** — reading from async generators
- **`asyncio.gather()`** — running multiple async tasks at the same time
- **Event loop concept** — what's happening under the hood (conceptual understanding is enough)

---

## 4. subprocess — Running External Commands

**Where it appears:** `tools/nmap_tool.py`, `tools/searchsploit_tool.py`

### What to focus on:

- **`subprocess.run()`** — running a simple command
- **`capture_output=True`** — capturing stdout/stderr
- **`check=True`** — raising an exception on error
- **`asyncio.create_subprocess_exec()`** — async subprocess (used in this project)
- **Reading stdout/stderr** — via `.communicate()`
- **Timeout** — killing a command after a set time
- **Security:** what shell injection is, why `shell=True` is dangerous

---

## 5. JSON + XML Parsing

**Where it appears:** `tools/nmap_tool.py` (XML), LLM responses (JSON)

### What to focus on:

**JSON:**
- `json.loads()` — string to dict
- `json.dumps()` — dict to string
- Accessing nested JSON — `data["key"]["subkey"]`
- Safe access with `.get()`

**XML (for Nmap output):**
- `xml.etree.ElementTree` — stdlib XML parser
- `ET.fromstring()` — parse from string
- `.find()`, `.findall()` — finding elements
- `.get("attribute")` — reading attributes
- Knowing the Nmap XML structure: `<host>`, `<port>`, `<service>` elements

---

## 6. HTTP API Calls (httpx)

**Where it appears:** `core/llm_client.py` — communicating with OpenRouter and Ollama

### What to focus on:

- **`httpx.AsyncClient`** — async HTTP client
- **`client.post(url, json=..., headers=...)`** — sending a POST request
- **Reading the response** — `.json()`, `.status_code`, `.text`
- **Headers** — Authorization, Content-Type
- **Setting timeouts**
- **HTTPStatusError** — catching a bad response
- **Retry logic** — retrying a failed request

---

## 7. SQL + SQLite (aiosqlite)

**Where it appears:** `database/`

### What to focus on:

**SQL:**
- `CREATE TABLE` — creating a table, column types (`TEXT`, `INTEGER`, `REAL`, `BLOB`)
- `INSERT INTO` — inserting a record
- `SELECT ... WHERE` — querying records
- `UPDATE ... SET ... WHERE` — updating a record
- `JOIN` — joining two tables
- `PRIMARY KEY`, `FOREIGN KEY` — establishing relationships
- `LIKE`, `ORDER BY`, `LIMIT`

**aiosqlite:**
- `async with aiosqlite.connect("db.sqlite") as db:` — opening a connection
- `await db.execute(sql, params)` — running a query (parameter binding — prevents SQL injection)
- `await db.fetchall()`, `await db.fetchone()`
- `await db.commit()` — saving changes

---

## 8. ipaddress Module

**Where it appears:** `core/safety.py` — scope enforcement

### What to focus on:

- `ipaddress.ip_address("192.168.1.5")` — IP object
- `ipaddress.ip_network("192.168.1.0/24")` — network object
- `ip in network` — checking whether an IP is within scope
- What CIDR notation means (`/24`, `/16`, `/8`)
- Private IP ranges: `10.x`, `172.16-31.x`, `192.168.x`

---

## 9. ReAct Agent Pattern

**Where it appears:** `core/agent.py` — the heart of the project

### What to focus on:

- **The ReAct loop:** Reason → Act → Observe → Reflect
- **Tool calling pattern** — the LLM selecting a tool via JSON
- **State management** — what phase the agent is in, what it knows
- **Termination condition** — when does the agent stop
- **Error recovery** — what happens when a tool fails
- **Conceptual reading:** "ReAct agent" explanations in LangChain or LlamaIndex docs

---

## 10. Prompt Engineering

**Where it appears:** `core/prompts.py`

### What to focus on:

- **What a system prompt is** and what it does
- **Few-shot prompting** — teaching by example
- **Forcing JSON output** — making the LLM respond in a specific format
- **Writing tool descriptions** — how the LLM understands which tool to use and when
- **Context window management** — token limits, sliding window

---

## 11. FastAPI (Web Backend)

**Where it appears:** `web/`

### What to focus on:

- **`@app.get()`, `@app.post()`** — defining endpoints
- **Path parameters, query parameters, request body**
- **Request/response validation with Pydantic**
- **Dependency injection** — `Depends()`
- **CORS middleware**
- **WebSocket** — `@app.websocket()`, `await ws.send_text()`, `await ws.receive_text()`
- **Background tasks**

---

## Recommended Order

```
[1] OOP                  ← start here
[2] Type hints + Pydantic
[3] async/await
[4] subprocess + JSON/XML
[5] HTTP API (httpx)
[6] SQL + aiosqlite
[7] ipaddress module
[8] ReAct pattern (conceptual)
[9] Prompt engineering
[10] FastAPI
```

After completing each topic, we will write the corresponding project file together.
