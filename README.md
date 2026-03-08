# AEGIS
### Autonomous Ethical Guardrailed Intelligence System

> An autonomous AI-powered penetration testing agent.
> Provide a target and define the scope — AEGIS plans the attack surface, identifies vulnerabilities, and determines exploitation paths. Every decision is made by the LLM.

**For authorized security testing only. Never test systems without explicit written permission.**

---

![AEGIS Dashboard](docs/screenshot.png)

---

## What It Does

1. **You provide** — Target IP or range, operational scope, and safety limits
2. **The agent decides** — What to scan, what is exploitable, and which exploit path to pursue
3. **The agent executes** — Host discovery, port enumeration, exploit search, and exploitation
4. **You receive** — Real-time reasoning output and a structured report with CVSS scores

## Architecture

Single-agent **ReAct loop** (Reason → Act → Observe → Reflect) powered by:

| Component | Technology |
|-----------|-----------|
| Reasoning engine | OpenRouter (Claude) for complex reasoning, Ollama / LM Studio for local inference |
| Offensive tools | Nmap, SearchSploit, Metasploit RPC |
| Safety layer | 10 configurable guardrails, kill switch, full audit log |
| Storage | SQLite — sessions, findings, exploit knowledge base |
| Interface | Web dashboard with real-time streaming chat |

## Documentation

| Document | Description |
|----------|-------------|
| [XBOW Comparison](docs/01_XBOW_COMPARISON.md) | Feature-by-feature comparison with XBOW |
| [Architecture](docs/02_ARCHITECTURE.md) | Full technical architecture and design decisions |
| [Prerequisites](docs/03_PREREQUISITES.md) | Installation and setup guide |
| [Roadmap](docs/04_ROADMAP.md) | V1 through V3 evolution plan |
| [Safety & Legal](docs/05_SAFETY_AND_LEGAL.md) | Guardrail rules and legal requirements |
| [Learning Curriculum](docs/06_LEARNING_CURRICULUM.md) | What each build phase teaches |

## Quick Start

```bash
# Clone
git clone <repo-url>
cd AEGIS

# Setup
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your API keys

# Run
python main.py
# Open http://localhost:8000
```

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Config and data models | pending |
| 2 | LLM client (Ollama + OpenRouter) | pending |
| 3 | Nmap tool | pending |
| 4 | SearchSploit tool | pending |
| 5 | Metasploit RPC tool | pending |
| 6 | Safety guardrail system | pending |
| 7 | Session memory | pending |
| 8 | Agent core — ReAct loop | pending |
| 9 | Prompt engineering | pending |
| 10 | Database layer | done |
| 11 | Reporting | pending |
| 12 | Web UI | in progress |
| 13 | CLI entry point | pending |
| 14 | Testing and polish | pending |

## Safety

- 10 configurable guardrails covering scope, port limits, exploit caps, rate limits, and time limits
- Kill switch to halt all activity immediately
- Full audit log of every agent action
- Two operational modes: Full Auto and Ask Before Exploit

## License

This project is licensed under the **AEGIS Non-Commercial License** — see [LICENSE](LICENSE) for full terms.

**In short:** Free to use, modify, and distribute for personal, educational, and research purposes. Commercial use of any kind requires explicit written permission from the maintainers.

---

> Built as a capstone project with the goal of growing into an XBOW-level open-source autonomous security agent.
