# TIRPAN vs XBOW — Architecture Comparison

> XBOW is a well-funded professional penetration testing platform.
> This document tracks where TIRPAN stands relative to XBOW and where it's headed.

---

## Architecture Model

| Feature | XBOW | TIRPAN V1 | TIRPAN V2 |
|---|---|---|---|
| Agent model | Coordinator + Solver multi-agent | Single ReAct agent | Brain + 8 specialized agents |
| Parallelism | Hundreds of parallel solvers | Sequential | Parallel agents (default: 8) |
| Isolation | Each solver in isolated VM | Host execution | Host execution (V3: Docker) |
| Shell persistence | Sessions maintained across tasks | Sessions abandoned | Shell Manager (persistent, auto-reconnect) |
| Target scale | Thousands simultaneously | One at a time | Multiple concurrent |
| Agent specialization | Solvers specialized per domain | One agent does everything | One expert agent per domain |

---

## Testing Capabilities

| Capability | XBOW | TIRPAN V1 | TIRPAN V2 | Notes |
|---|---|---|---|---|
| Network port scanning | Yes | Yes (nmap) | Yes (masscan + nmap) | V2 adds masscan for speed |
| Service enumeration | Yes | Yes | Yes + NSE scripts | V2 adds SMB/SNMP/LDAP |
| CVE search | Yes | Yes (searchsploit) | Yes + cve_lookup | |
| Exploit execution | Yes | Yes (Metasploit) | Yes (Metasploit + manual) | |
| Web app scanning | Yes | No | Yes | nikto, nuclei, ffuf, sqlmap |
| Authenticated web testing | Yes | No | Yes | Credential reuse |
| OSINT | Yes | No | Yes | theHarvester, subfinder, DNS |
| Subdomain enumeration | Yes | No | Yes | subfinder, amass |
| Post-exploitation | Yes | Minimal | Deep | LinPEAS/WinPEAS, automated privesc |
| Privilege escalation | Yes | No | Yes | Automated path selection |
| Persistence | Yes | No | Yes (optional) | Gated behind permission flag |
| Credential harvesting | Yes | No | Yes (optional) | Gated behind permission flag |
| Lateral movement | Yes | No | Yes (optional) | Pass-the-hash, PSExec, etc. |
| AD attacks | Yes | No | Yes | Kerberoast, ASREPRoast, DCSync |
| Container/Docker escape | Yes | No | Yes (optional) | Gated behind permission flag |
| Cloud (AWS/Azure/GCP) | Yes | No | V3 | Future roadmap |
| OOB/blind injection | Yes | No | Partial (nuclei) | interactsh planned |
| DOM-based XSS | Yes | No | V3 | Requires headless browser |
| Source code analysis | Yes | No | V3 | Semgrep + LLM |
| Custom exploit generation | Yes | No | V3 | Sandboxed LLM code execution |

---

## AI & Decision Making

| Feature | XBOW | TIRPAN V1 | TIRPAN V2 |
|---|---|---|---|
| LLM provider | Proprietary | OpenRouter / Ollama / LM Studio | Same + per-agent model selection |
| Reasoning pattern | Multi-agent with specialized LLMs | Single ReAct loop | Brain + specialized agent LLMs |
| Self-correction | Yes | Basic (reflect step) | Full adaptive strategy |
| Failure handling | Automatic retry/pivot | Limited | Try differently → alternative vector → ask user |
| Knowledge base | Cross-campaign learning | Per-session KB | Per-session KB (V3: cross-campaign RAG) |
| Strategy adaptation | Yes | Limited | Yes (Brain adapts based on findings) |
| Environment detection | Yes | No | Yes (production vs staging vs lab) |
| Operator clarification | Yes | No | Yes (Brain asks if mission is ambiguous) |

---

## Infrastructure

| Feature | XBOW | TIRPAN V1 | TIRPAN V2 |
|---|---|---|---|
| Tool isolation | Docker per tool | Host | Host (V3: Docker) |
| Session persistence | Yes | No | Yes (Shell Manager) |
| Pivot/tunneling | Yes | No | Yes (ligolo-ng, chisel) |
| Health monitoring | Yes | No | Yes (heartbeat, auto-reconnect) |

---

## Reporting & Output

| Feature | XBOW | TIRPAN V1 | TIRPAN V2 |
|---|---|---|---|
| Real-time streaming | Yes | Yes (WebSocket) | Yes + per-agent feeds |
| HTML/PDF report | Yes | Yes | Yes + attack narrative |
| CVSS scoring | Yes | Yes | Yes |
| Evidence/PoC | Yes | Partial | Yes (commands run, raw output) |
| SARIF output | Yes | No | V3 |
| Bug bounty format | Yes | No | V3 |
| Credentials panel | N/A | No | Yes |
| Attack graph | Partial | Yes (basic) | Yes (compromise levels, attack paths) |

---

## Safety & Control

| Feature | XBOW | TIRPAN V1 | TIRPAN V2 |
|---|---|---|---|
| Safety guardrails | Yes | Yes (10 rules) | Yes (10 rules + 5 permission flags) |
| Kill switch | Yes | Yes | Yes (stops all agents) |
| Operator intervention | Yes | Pause/inject | Pause/inject per-agent |
| Audit logging | Yes | Yes | Yes (per-agent attribution) |

---

## Shared Concepts

Both TIRPAN and XBOW share these fundamental approaches:
- AI-driven decision making (LLM selects tools and strategies)
- Tool calling (structured JSON actions)
- Similar attack lifecycle (recon → scan → exploit → post-exploit → report)
- Safety guardrails with configurable scope
- Knowledge base for learning from successful attacks
- Real-time output streaming
- Operator kill switch
- Dual execution modes (automated + interactive)

---

## Gap Closure Plan

```
V1 (Complete)         V2 (Building)                    V3 (Future)
──────────────         ──────────────────────────       ──────────────────────────
Single agent      →    Brain + 8 specialized agents →   + Internal Reviewer agent
3 tools           →    50+ tools                    →   + Custom LLM exploit gen
Network only      →    + Web, OSINT, Post-exploit   →   + Source code analysis
No shell persist  →    + Shell Manager              →   + Docker-isolated tools
No lateral move   →    + Full lateral + pivoting    →   + Thousands simultaneous
No OSINT          →    + OSINT agent                →   + Cross-campaign RAG
Single LLM        →    Per-agent model selection    →   + Zero-day discovery
Basic report      →    + Attack narrative + creds   →   + SARIF + bug bounty
Sequential only   →    Parallel agents              →   + Cloud environments
```

---

## What Makes TIRPAN Different from XBOW

| Aspect | XBOW | TIRPAN |
|---|---|---|
| Access | Paid SaaS platform | Open source, self-hosted |
| Privacy | Cloud-based | Fully local option (Ollama) |
| Cost | Subscription | Free (pay only for LLM API if cloud) |
| Customization | Limited | Full control — add any tool as a plugin |
| Transparency | Black box | Full source code, all decisions visible |
| Lab use | Cloud target required | Works on local lab VMs |
| Operator control | Enterprise controls | Full configurable safety + permission flags |
