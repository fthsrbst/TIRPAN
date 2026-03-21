---
name: V2 Multi-Agent Implementation
description: AEGIS V2 multi-agent architecture redesign - 16-step implementation plan with Sonnet 4.6 prompts
type: project
---

AEGIS V2 multi-agent architecture implementation in progress.

**Why:** V1 single-agent (PentestAgent) is sequential, slow, not specialized. V2 replaces with Brain Agent + 7 specialized agents running in parallel.

**How to apply:**
- Implementation plan at docs/V2_IMPLEMENTATION_PLAN.md
- 16 ordered steps, each with a detailed Sonnet 4.6 prompt
- Steps 1-5 are foundation (BaseAgent, MissionContext, MessageBus, DB, ShellManager, Brain)
- Steps 6-13 are specialized agents + tools
- Steps 14-15 are API/UI
- Step 16 is PentestAgent migration (riskiest - 329 existing tests)

**Key architectural decisions (K1-K7):**
- K1: Permission flags unified in MissionBrief (single source of truth)
- K2: ShellManager wraps existing ShellSessionTool + MetasploitTool
- K3: harvested_credentials is NEW table (separate from operator credentials v5)
- K4: Brain has its own phase system (mission_phases table), legacy phases kept
- K5: Event-driven + Brain hybrid (agents emit findings, Brain listens + spawns)
- K6: Typed tool outputs via Pydantic
- K7: asyncio.Semaphore(1) for Metasploit RPC serialization
