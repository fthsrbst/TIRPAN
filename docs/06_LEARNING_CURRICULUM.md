# TIRPAN — Learning Curriculum

## How This Project Teaches You to Code

Each phase of building TIRPAN teaches you specific programming concepts. You'll go from beginner-intermediate to someone who can build complex AI-powered systems.

---

## Phase 1: Configuration & Data Models
**Files**: `config.py`, `models/target.py`, `models/scan_result.py`, etc.

### What you'll learn:
- **Pydantic models** — How to define data structures with automatic validation
- **Type hints** — Making Python code self-documenting
- **Dataclasses** — Python's built-in way to create data containers
- **Environment variables** — Secure configuration with `.env` files
- **Project setup** — Virtual environments, requirements.txt, project layout

### Key concept: Pydantic
```python
from pydantic import BaseModel

class Target(BaseModel):
    ip: str                    # Type hint: must be a string
    port_range: str = "1-65535"  # Default value
    scan_only: bool = False    # Boolean flag
    
target = Target(ip="192.168.1.5")  # Pydantic validates the data
```

---

## Phase 2: LLM Client
**File**: `core/llm_client.py`

### What you'll learn:
- **Async/await** — Non-blocking code (Python's way of doing things in parallel)
- **HTTP API calls** — How to talk to web services (OpenRouter API)
- **JSON parsing** — Working with structured data
- **Abstraction pattern** — One interface for multiple backends (OpenRouter + Ollama)
- **Error handling** — Try/except, retries, timeouts

### Key concept: Async/Await
```python
import httpx

async def call_llm(prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(  # 'await' = don't block while waiting
            "https://openrouter.ai/api/v1/chat/completions",
            json={"model": "claude-3.5-sonnet", "messages": [{"role": "user", "content": prompt}]}
        )
        return response.json()["choices"][0]["message"]["content"]
```

---

## Phase 3: Nmap Tool (OOP)
**Files**: `tools/base_tool.py`, `tools/nmap_tool.py`

### What you'll learn:
- **Object-Oriented Programming** — Classes, methods, attributes
- **Inheritance** — Base class → child class pattern
- **Abstract methods** — Forcing child classes to implement specific methods
- **subprocess** — Running external commands from Python
- **XML parsing** — Nmap outputs XML, we parse it

### Key concept: Inheritance
```python
from abc import ABC, abstractmethod

class BaseTool(ABC):             # Abstract base class
    @abstractmethod
    async def execute(self, params):  # Every tool MUST implement this
        pass

class NmapTool(BaseTool):        # Inherits from BaseTool
    async def execute(self, params):
        # Run nmap and return parsed results
        ...
```

---

## Phase 4: SearchSploit Tool
**File**: `tools/searchsploit_tool.py`

### What you'll learn:
- **String parsing** — Extracting data from text output
- **Regular expressions (regex)** — Pattern matching in strings
- **CLI integration** — Wrapping command-line tools in Python

---

## Phase 5: Metasploit RPC Tool
**File**: `tools/metasploit_tool.py`

### What you'll learn:
- **RPC protocol** — Remote Procedure Calls (calling functions on another program)
- **Network programming** — Connecting to services over network
- **Session management** — Managing active exploit sessions
- **pymetasploit3 library** — Python wrapper for Metasploit

---

## Phase 6: Safety System
**File**: `core/safety.py`

### What you'll learn:
- **IP mathematics** — CIDR notation, subnet checking (`ipaddress` module)
- **Input validation** — Checking everything before acting
- **Guard clauses** — Early returns for invalid states
- **Security thinking** — How to build defensive code

### Key concept: CIDR checking
```python
import ipaddress

def is_in_scope(target_ip: str, scope: str) -> bool:
    network = ipaddress.ip_network(scope)
    ip = ipaddress.ip_address(target_ip)
    return ip in network  # True if IP is within the network range
```

---

## Phase 7: Session Memory
**File**: `core/memory.py`

### What you'll learn:
- **Data structures** — Lists, dictionaries, deques
- **Context management** — How to maintain conversation context for LLMs
- **Token counting** — Managing LLM context window limits

---

## Phase 8: The Agent (The Core!)
**File**: `core/agent.py`

### What you'll learn:
- **State machines** — Managing program state through transitions
- **ReAct pattern** — The core AI agent pattern (Reason → Act → Observe → Reflect)
- **Async orchestration** — Coordinating multiple async operations
- **Design patterns** — Strategy pattern, observer pattern

### This is the most important phase. Everything else feeds into this.

---

## Phase 9: Prompt Engineering
**File**: `core/prompts.py`

### What you'll learn:
- **Prompt engineering** — How to instruct LLMs effectively
- **System prompts** — Setting AI behavior and constraints
- **Template strings** — Dynamic prompt generation
- **Few-shot examples** — Teaching LLMs by example

---

## Phase 10: Database
**Files**: `database/db.py`, `database/repositories.py`, `database/knowledge_base.py`

### What you'll learn:
- **SQL** — CREATE TABLE, INSERT, SELECT, JOIN, WHERE
- **Async database** — Non-blocking database operations
- **Repository pattern** — Separating data access from business logic
- **Schema design** — How to model data in tables

---

## Phase 11: Reporting
**Files**: `reporting/report_generator.py`, `reporting/cvss.py`

### What you'll learn:
- **Jinja2 templates** — HTML template rendering
- **PDF generation** — Converting HTML to PDF (WeasyPrint)
- **CVSS algorithm** — How vulnerability scoring works
- **File I/O** — Reading and writing files

---

## Phase 12: Web UI
**Files**: `web/app.py`, `web/routes.py`, `web/websocket_handler.py`, `web/static/`

### What you'll learn:
- **FastAPI** — Modern Python web framework
- **REST API design** — GET, POST, DELETE endpoints
- **WebSockets** — Real-time bidirectional communication
- **HTML/CSS/JS** — Basic frontend development
- **Fetch API** — Making API calls from JavaScript

---

## Phase 13: CLI Entry Point
**File**: `main.py`

### What you'll learn:
- **argparse** — Command-line argument parsing
- **Application orchestration** — Wiring everything together
- **Entry point pattern** — How programs start

---

## Phase 14: Testing
**Files**: `tests/`

### What you'll learn:
- **pytest** — Python's most popular test framework
- **Mocking** — Simulating external dependencies in tests
- **Test-driven thinking** — Writing tests to verify behavior
- **Debugging** — Finding and fixing bugs systematically

---

## Skills Summary

After completing all 14 phases, you'll understand:

| Category | Skills |
|----------|--------|
| **Python Core** | Async/await, type hints, dataclasses, decorators, context managers |
| **OOP** | Classes, inheritance, abstract methods, design patterns |
| **Web Development** | FastAPI, REST APIs, WebSockets, HTML/CSS/JS |
| **Database** | SQL, SQLite, async DB, schema design |
| **AI/LLM** | API integration, prompt engineering, ReAct agents, tool calling |
| **Networking** | IP math, CIDR, sockets, HTTP, RPC protocols |
| **Security** | Input validation, safety guards, audit logging, CVSS |
| **DevOps** | Docker, virtual environments, project structure |
| **Testing** | pytest, mocking, debugging, error handling |
