# AEGIS — V2 Feature Specification (Archived)

> **Status:** Superseded
> **Replaced by:** [11_MULTI_AGENT_SPEC.md](11_MULTI_AGENT_SPEC.md)

This document described a single-agent V2 with incremental improvements over V1.

The V2 architecture has been redesigned as a full **multi-agent system** with a Brain
coordinator and 8 specialized agents. See the current spec:

**[11_MULTI_AGENT_SPEC.md](11_MULTI_AGENT_SPEC.md)** — Complete V2 multi-agent architecture specification

Features from this document that were merged into the new spec:
- Tool Health Check System → Section 11_MULTI_AGENT_SPEC.md (Tool Registry)
- Mission Brief / Permission flags → Section 12 (Safety Extensions)
- Plugin Architecture v2 (3 types) → Section 8 (New Tools) + 09_PLUGIN_SYSTEM.md
- Speed Profiles → included in Brain Agent mission config
- Self-Correction → included in Brain Agent failure handling
