# AEGIS
### Autonomous Ethical Guardrailed Intelligence System

> An autonomous AI-powered penetration testing bot inspired by [XBOW](https://xbow.com).
> Give it a target and limits — it scans, finds vulnerabilities, and runs exploits. All decisions made by LLMs.

⚠️ **For authorized security testing only. Never test systems without explicit written permission.**

---

## 🎯 What It Does

1. **You provide**: Target IP/range + safety limits
2. **AI decides**: What to scan, what's vulnerable, which exploit to run
3. **Bot executes**: Port scanning → Exploit search → Exploitation
4. **You get**: Real-time updates + PDF report with CVSS scores

## 🏗️ Architecture

Single-agent **ReAct loop** (Reason → Act → Observe → Reflect) powered by:
- **LLM**: OpenRouter (Claude) for reasoning + Ollama for local tasks
- **Tools**: Nmap, SearchSploit, Metasploit RPC
- **Safety**: 10 guardrails + kill switch + full audit log
- **Storage**: SQLite (sessions, findings, exploit knowledge base)
- **UI**: Basic web dashboard with real-time chat

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [XBOW Comparison](docs/01_XBOW_COMPARISON.md) | How we compare to XBOW, feature by feature |
| [Architecture](docs/02_ARCHITECTURE.md) | Full technical architecture |
| [Prerequisites](docs/03_PREREQUISITES.md) | What to install, setup guide |
| [Roadmap](docs/04_ROADMAP.md) | V1 → V2 → V3 (XBOW level) evolution plan |
| [Safety & Legal](docs/05_SAFETY_AND_LEGAL.md) | Safety rules, legal requirements |
| [Learning Curriculum](docs/06_LEARNING_CURRICULUM.md) | What you learn in each build phase |

## 🚀 Quick Start

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
python main.py --target 192.168.1.0/24 --mode full_auto

# Or start web UI
python -m web.app
# Open http://localhost:8000
```

## 📋 Project Status

- [ ] Phase 1: Config & data models
- [ ] Phase 2: LLM client
- [ ] Phase 3: Nmap tool
- [ ] Phase 4: SearchSploit tool
- [ ] Phase 5: Metasploit RPC tool
- [ ] Phase 6: Safety system
- [ ] Phase 7: Session memory
- [ ] Phase 8: Agent core (ReAct loop)
- [ ] Phase 9: Prompt engineering
- [ ] Phase 10: Database
- [ ] Phase 11: Reporting
- [ ] Phase 12: Web UI
- [ ] Phase 13: CLI entry point
- [ ] Phase 14: Testing & polish

## 🛡️ Safety

- 10 configurable guardrails (scope, ports, exploit limits, rate limits, time limits)
- Kill switch (stop everything instantly)
- Full audit logging of every action
- Two modes: Full Auto or Ask Before Exploit

## 📄 License

MIT License — See [LICENSE](LICENSE)

---

> Built as a capstone project with the goal of growing into an XBOW-level open-source tool.
