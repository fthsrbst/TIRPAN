"""
TIRPAN V2 — BrainAgent

Meta-coordinator that spawns, monitors, and synthesises results from all
specialized agents.

Architecture:
  BrainAgent uses its own ReAct loop with a restricted set of meta-tools:
    spawn_agent     — launch a specialized agent for a target
    wait_for_agents — block until one or more agents complete
    kill_agent      — abort a running agent
    update_context  — write a finding into MissionContext
    ask_operator    — pause and request human input
    set_phase       — advance the mission phase
    mission_done    — signal completion and exit the loop

  It does NOT call nmap / metasploit / etc. directly — those belong to
  the specialized agents.

Key design decisions (K5):
  - Brain is the sole writer of MissionContext
  - Specialized agents PROPOSE updates via MessageBus (FINDING messages)
  - Brain decides what to integrate into the canonical context
  - Event-driven: Brain subscribes to FINDING / AGENT_DONE / AGENT_ERROR
    events and wakes up to process them

Integration:
  BrainAgent inherits BaseAgent so all loop guards, pause/kill controls,
  event emission, and audit logging are inherited for free.

  The run() method is inherited from BaseAgent:
    while iterations < max_iterations:
        action = await self.reason()
        result = await self.act(action)
        await self.observe(result, action)
        await self.reflect()
"""

from __future__ import annotations

import asyncio
import contextlib
import importlib
import inspect
import json
import logging
import re
import uuid
from typing import Any

from core.base_agent import AgentResult, AgentState, BaseAgent
from core.agent_model_config import normalize_agent_models
from core.message_bus import AgentMessage, AgentMessageBus, MessageType
from core.soul_loader import SoulLoader
from core.playbook import get_playbook
from core.training_data import get_collector as _get_training_collector
import core.debug_logger as dbg
from core.session_tracer import get_tracer as _get_tracer
from database.repositories import AgentInstanceRepository as _AgentInstanceRepo

_agent_instance_repo = _AgentInstanceRepo()
from core.mission_context import (
    AgentStatus,
    AttackEdge,
    AttackNode,
    HarvestedCredential,
    HostInfo,
    LootItem,
    MissionContext,
    PortInfo,
    SessionInfo,
    VulnInfo,
)

logger = logging.getLogger(__name__)


# ── Agent type → module / class mapping ──────────────────────────────────────
# Populated as specialized agents are implemented (Steps 6–13).
# Keys are the agent_type strings the LLM uses in spawn_agent calls.

_AGENT_REGISTRY: dict[str, tuple[str, str]] = {
    "scanner":      ("core.agents.scanner_agent",    "ScannerAgent"),
    "exploit":      ("core.agents.exploit_agent",    "ExploitAgent"),
    "post_exploit": ("core.agents.postexploit_agent","PostExploitAgent"),
    "webapp":       ("core.agents.webapp_agent",     "WebAppAgent"),
    "osint":        ("core.agents.osint_agent",      "OSINTAgent"),
    "lateral":      ("core.agents.lateral_agent",    "LateralMovementAgent"),
    "reporting":    ("core.agents.reporting_agent",  "ReportingAgent"),
}

_AGENT_TYPE_TO_MODEL_KEY: dict[str, str] = {
    "scanner": "scanner",
    "exploit": "exploit",
    "webapp": "webapp",
    "post_exploit": "postexploit",
    "lateral": "lateral",
    "osint": "osint",
    "reporting": "reporting",
}

_LEGACY_CHILD_MODEL_FALLBACK: dict[str, tuple[str, ...]] = {
    "exploit": ("scanner",),
    "webapp": ("scanner",),
    "lateral": ("osint",),
    "post_exploit": ("post_exploit",),
}


def _register_agent_type(agent_type: str, module_path: str, class_name: str) -> None:
    """Register a specialized agent class (called by each agent module at import time)."""
    _AGENT_REGISTRY[agent_type] = (module_path, class_name)


# ── BrainAgent ────────────────────────────────────────────────────────────────

class BrainAgent(BaseAgent):
    """
    Master coordinator.  Spawns specialized agents, synthesises findings,
    maintains MissionContext, and decides mission phase transitions.

    Required constructor kwargs (in addition to BaseAgent kwargs):
        mission_context: MissionContext
        message_bus:     AgentMessageBus
        agent_type:      "brain" (passed through)
    """

    # The brain uses meta-tools only
    _META_TOOLS = [
        "spawn_agent",
        "spawn_agents_batch",
        "wait_for_agents",
        "kill_agent",
        "update_context",
        "ask_operator",
        "set_phase",
        "mission_done",
    ]
    _MAX_ACTIVE_SHELLS_PER_HOST = 4

    _soul = SoulLoader()

    def __init__(
        self,
        *,
        mission_context: MissionContext,
        message_bus: AgentMessageBus,
        # Optional dict of agent-type → constructor kwargs overrides
        agent_constructor_kwargs: dict[str, dict] | None = None,
        # Per-agent model overrides: agent_type → {provider, model}
        agent_models: dict | None = None,
        **base_kwargs,
    ):
        # Force agent_type = "brain"
        base_kwargs.setdefault("agent_type", "brain")
        super().__init__(**base_kwargs)

        self.ctx = mission_context
        self.bus = message_bus
        self._agent_ctor_kwargs = agent_constructor_kwargs or {}
        self._agent_models: dict = normalize_agent_models(agent_models or {})

        # Track spawned child agents: agent_id → asyncio.Task
        self._child_tasks: dict[str, asyncio.Task] = {}
        # Track active agents for system prompt injection: agent_id → agent_type
        self._active_agents: dict[str, str] = {}
        # Track task_type per agent for dedup: agent_id → task_type
        self._active_agent_task_types: dict[str, str] = {}
        # Track target per agent for dedup: agent_id → target
        self._active_agent_targets: dict[str, str] = {}
        # Track spawn options per agent for port-based dedup: agent_id → options dict
        self._active_agent_options: dict[str, dict] = {}
        # Track child agent instances for pause/resume propagation: agent_id → BaseAgent
        self._child_agents: dict[str, BaseAgent] = {}
        # Cache of pending operator questions: correlation_id → Future
        self._operator_futures: dict[str, asyncio.Future] = {}
        # Set to True when mission_done meta-tool is called
        self._mission_done: bool = False
        self._mission_narrative: str = ""
        self._objective_confirmed: bool = False
        self._objective_confirm_msg: str = ""
        self._dispatch_blocked_reason: str = ""

        # Active shell sessions: shell_key → {host_ip, session_type, msf_session_id, module}
        self._active_shells: dict[str, dict] = {}
        self._shell_dedup_keys: set[str] = set()

        # Track failed exploit modules per host to prevent infinite retry by the LLM:
        # key = "module|host_ip", value = failure count
        self._exploit_failure_counts: dict[str, int] = {}
        # After this many failed attempts of the same module on the same host, block further spawns
        self._max_exploit_retries_per_module = 2

        # Training data capture — store per-iteration context for reflect()
        self._last_messages: list[dict] = []
        self._last_action: dict = {}
        self._last_result: dict = {}

        # Subscribe to bus events so Brain can react to findings
        self.bus.register_agent(self.agent_id)
        self.bus.subscribe_global(self._on_bus_message)

        # ── Concurrency cap for child agents ─────────────────────────────────
        # test3 forensics: 18 children spawned simultaneously caused 9 wall-clock
        # timeouts because the shared LLM API queue starved everyone.
        # Cap is read from app_settings.spawn_max_parallel (default 3).
        # Created lazily inside the running loop so the right loop owns it.
        self._spawn_semaphore: asyncio.Semaphore | None = None
        self._spawn_max_parallel: int = 3  # refreshed from settings on demand

        # ── Per-spawn ML success prediction cache ────────────────────────────
        # Filled by _spawn_agents_batch; consumed by _spawn_agent so the child
        # gets its own pre-attack probability in its task_type.
        self._pending_ml_pred: dict[str, float] = {}

    # ── BaseAgent abstract implementations ───────────────────────────────────

    def get_available_tools(self) -> list[str]:
        return self._META_TOOLS

    def build_messages(self) -> list[dict]:
        system = self._build_system_prompt()
        msgs: list[dict] = [{"role": "system", "content": system}]
        if not self.memory._messages:
            scope = [str(s).strip() for s in getattr(self.ctx, "scope", []) if str(s).strip()]
            scope_text = ", ".join(scope) if scope else "(scope not provided)"
            # First iteration — LLMs require at least one user message
            if getattr(self.ctx, "auto_targeting", False):
                msgs.append({
                    "role": "user",
                    "content": (
                        "No explicit target was provided by the operator. "
                        f"Mission scope: {scope_text}. "
                        "Act like a professional pentester: discover every reachable host in scope, "
                        "enumerate services/versions, identify vulnerabilities for each system, and "
                        "produce complete evidence-driven reporting. "
                        "Begin by spawning scanner agents for the full scope."
                    ),
                })
            else:
                msgs.append({
                    "role": "user",
                    "content": (
                        f"Mission target: {self.ctx.target}. Begin the engagement now. "
                        "Spawn the appropriate first agent."
                    ),
                })
        else:
            # Use build_context() for proper role mapping (tool_result → user)
            # and token budget enforcement
            msgs.extend(self.memory.build_context())
        # Cache for training data capture in reflect()
        self._last_messages = msgs
        # Schedule an async refresh of the ML toggle cache so that the NEXT
        # iteration's _build_attack_path_section sees up-to-date values.
        # The first iteration uses defaults (True); subsequent ones use the
        # latest persisted settings.
        try:
            asyncio.ensure_future(self._refresh_ml_flags())
        except Exception:
            pass
        return msgs

    async def _refresh_ml_flags(self) -> None:
        """Best-effort async fetch of ML injection settings — cached on self
        so the synchronous _build_attack_path_section can read them without
        blocking. Failures keep the previous (or default) values."""
        try:
            from database import db as _db
            self._ml_ttp_enabled = bool(await _db.get_setting("ml_inject_attack_path", True))
            self._ml_pred_enabled = bool(await _db.get_setting("ml_inject_exploit_pred", True))
            # Spawn block threshold; 0 disables. Default 0.15 — anything below
            # almost always wastes a turn (see test7 forensics).
            self._ml_min_spawn_prob = float(
                await _db.get_setting("ml_min_spawn_probability", 0.15) or 0.15
            )
        except Exception:
            # Default to enabled — preserves pre-change behavior.
            if not hasattr(self, "_ml_ttp_enabled"):
                self._ml_ttp_enabled = True
            if not hasattr(self, "_ml_pred_enabled"):
                self._ml_pred_enabled = True
            if not hasattr(self, "_ml_min_spawn_prob"):
                self._ml_min_spawn_prob = 0.15

    async def process_result(self, tool_name: str, result: dict, action_dict: dict) -> None:
        """Handle meta-tool results."""
        if tool_name == "spawn_agent":
            self._handle_spawn_result(result)
        elif tool_name == "spawn_agents_batch":
            pass  # _spawn_agents_batch already calls _handle_spawn_result per agent
        elif tool_name == "update_context":
            await self._handle_update_context(result, action_dict)
        elif tool_name == "set_phase":
            phase = action_dict.get("phase", "") or action_dict.get("parameters", {}).get("phase", "")
            if phase:
                await self.ctx.set_phase(phase)
                self.emit_event("phase_changed", {
                    "phase": phase,
                    "attack_phase": phase,  # JS updatePhaseFromEvent reads attack_phase
                })
        elif tool_name == "mission_done":
            self._mission_done = True
            params = action_dict.get("parameters", {})
            self._mission_narrative = (
                params.get("narrative", "")
                or params.get("summary", "")
                or action_dict.get("thought", "")
            )

    @staticmethod
    def _is_objective_confirm_message(message: str) -> bool:
        text = (message or "").strip().lower()
        if not text:
            return False
        if "operator confirmed" in text and ("objective" in text or "mission" in text):
            return True
        if "mission objective has been achieved" in text:
            return True
        if "mission objective achieved" in text:
            return True
        if "this is it" in text and "objective" in text:
            return True
        return False

    def _objectives_require_flag(self) -> bool:
        """
        Return True only when the operator explicitly asked for a flag/CTF objective.

        Without this signal, finding a "flag"-shaped string is just one more piece
        of evidence — never a reason to stop a full pentest in the middle of
        exploiting other discovered vulnerabilities.
        """
        objectives = getattr(getattr(self, "ctx", None), "objectives", None) or []
        if not objectives:
            return False
        flag_terms = (
            "flag", "ctf", "capture the flag", "htb", "hack the box",
            "thm", "tryhackme", "picoctf", "root.txt", "user.txt",
        )
        for obj in objectives:
            obj_l = str(obj or "").lower()
            if any(term in obj_l for term in flag_terms):
                return True
        return False

    def _cancel_all_children(self, reason: str) -> int:
        """Cancel all running child agents immediately."""
        def _schedule(coro_factory) -> None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return
            loop.create_task(coro_factory())

        cancelled = 0
        for aid, task in list(self._child_tasks.items()):
            if task.done():
                continue
            atype = self._active_agents.get(aid, "")
            task.cancel()
            cancelled += 1
            self.emit_event("agent_killed", {"agent_id": aid, "reason": reason})
            # Resolve any pending wait_for_agents join immediately.
            _schedule(lambda: self.bus.send(AgentMessage(
                msg_type=MessageType.AGENT_ERROR,
                sender_id=aid,
                payload={
                    "agent_id": aid,
                    "agent_type": atype,
                    "status": "cancelled",
                    "findings": [],
                    "iterations": 0,
                    "error": f"cancelled: {reason}",
                },
            )))

            # Best-effort DB status update for UI consistency.
            if self.session_id:
                async def _mark_cancelled(agent_id: str, cancel_reason: str) -> None:
                    with contextlib.suppress(Exception):
                        await _agent_instance_repo.update_status(
                            agent_id=agent_id,
                            status="failed",
                            error=f"cancelled: {cancel_reason}",
                        )
                _schedule(lambda: _mark_cancelled(aid, reason))
        if cancelled:
            self.emit_event("stop_propagation", {
                "reason": reason,
                "cancelled_child_agents": cancelled,
            })
        return cancelled

    def inject_message(self, message: str) -> None:
        """Handle operator messages with hard objective confirmation semantics."""
        super().inject_message(message)
        if not self._is_objective_confirm_message(message):
            return

        self._objective_confirmed = True
        self._objective_confirm_msg = (message or "")[:500]
        self._dispatch_blocked_reason = "objective_confirmed"
        cancelled = self._cancel_all_children("objective_confirmed")
        self._mission_done = True
        self.memory.add_user(
            "[SYSTEM] Operator confirmed the objective is achieved. "
            "Do not dispatch any more agents. End mission now."
        )
        self.emit_event("objective_transition", {
            "state": "confirmed",
            "reason": "operator_confirmation",
            "cancelled_child_agents": cancelled,
        })
        self.emit_event("dispatch_blocked", {
            "reason": self._dispatch_blocked_reason,
        })
        logger.info(
            "BrainAgent objective confirmed by operator; cancelled child_agents=%d",
            cancelled,
        )

    def kill(self) -> dict:
        """Emergency stop for Brain + running child agents."""
        super().kill()
        cancelled = self._cancel_all_children("emergency_stop")
        return {"children_cancelled": cancelled}

    # ── act() override — intercepts meta-tools before ToolRegistry ───────────

    async def act(self, action_dict: dict) -> dict:
        """
        BrainAgent override of BaseAgent.act().

        1. Normalises the LLM key: the brain system prompt uses "tool" but
           BaseAgent.act() reads "action".  Accept both.
        2. If the resolved tool name is one of _META_TOOLS, dispatch directly
           to _execute_tool() without touching the ToolRegistry.
        3. Otherwise fall through to BaseAgent.act() for regular tools.
        """
        # ── Key normalisation: accept {"tool": ...} or {"action": ...} ──────
        tool_name = action_dict.get("action") or action_dict.get("tool", "")
        if tool_name and "action" not in action_dict:
            # Add the canonical key so BaseAgent.act() works if we fall through
            action_dict = dict(action_dict)
            action_dict["action"] = tool_name

        params = action_dict.get("parameters", {})

        # ── Meta-tool fast path ───────────────────────────────────────────────
        if tool_name in self._META_TOOLS:
            self.emit_event("tool_call", {"tool": tool_name, "params": params})
            dbg.brain_iter(self.agent_id, self._iteration, self._active_agents)
            dbg.tool_call(self.agent_id, tool_name, params)
            _tracer = _get_tracer(self.session_id)
            _tracer.log_tool_call(self.agent_id, self.agent_type, self._iteration, tool_name, params)
            import time as _time
            _t0 = _time.monotonic()
            try:
                result = await self._execute_tool(tool_name, params)
            except Exception as exc:
                self._log.error("Meta-tool '%s' raised: %s", tool_name, exc)
                dbg.tool_fail(self.agent_id, tool_name, str(exc))
                result = {"success": False, "output": None, "error": str(exc)}
            _dur = (_time.monotonic() - _t0) * 1000

            success = self._meta_success(result)
            err = self._meta_error(result)
            if success:
                dbg.tool_ok(self.agent_id, tool_name, result, _dur)
            else:
                dbg.tool_fail(self.agent_id, tool_name, err, _dur)
            _tracer.log_tool_result(self.agent_id, self.agent_type, self._iteration, tool_name,
                                    {"success": success, "output": result, "error": err}, _dur)
            self.emit_event("tool_result", {
                "tool": tool_name,
                "success": success,
                "output": result,
                "error": err,
            })
            final = {"success": success, "output": result, "error": err}
            # Capture for training data (reflect() will write it)
            self._last_action = action_dict
            self._last_result = final
            return final

        # ── Fallthrough: regular tools via BaseAgent ──────────────────────────
        result = await super().act(action_dict)
        self._last_action = action_dict
        self._last_result = result
        return result

    @staticmethod
    def _meta_success(result: dict) -> bool:
        """Normalize legacy meta-tool status dicts into success/error contract."""
        if not isinstance(result, dict):
            return False
        if "success" in result:
            return bool(result.get("success"))
        return result.get("status") not in ("error", "failed")

    @staticmethod
    def _meta_error(result: dict) -> str | None:
        if not isinstance(result, dict):
            return "invalid meta-tool result"
        return result.get("error")

    def _kill_switch_is_set(self) -> bool:
        raw = getattr(self._safety, "kill_switch_triggered", False)
        return raw if isinstance(raw, bool) else False

    # ── Preset credential matching ─────────────────────────────────────────
    # MissionBrief carries operator-supplied creds; brain auto-injects them
    # into the matching child agent's options based on host_pattern.

    def _match_preset_cred(self, target: str, cred_kind: str):
        """Return the most specific operator-provided credential matching `target`.

        Lookup order: exact host match → CIDR match → wildcard ("*"). cred_kind
        is one of ssh|smb|snmp|db|web. Returns None when nothing matches.
        """
        if not target or not self.ctx:
            return None
        pool_attr = {
            "ssh":  "preset_ssh_credentials",
            "smb":  "preset_smb_credentials",
            "snmp": "preset_snmp_credentials",
            "db":   "preset_db_credentials",
            "web":  "preset_web_credentials",
        }.get(cred_kind)
        if not pool_attr:
            return None
        pool = getattr(self.ctx, pool_attr, None) or []
        if not pool:
            return None
        # Strip URL prefix if target is http(s)://...
        bare = target
        try:
            from urllib.parse import urlparse
            u = urlparse(target)
            if u.hostname:
                bare = u.hostname
        except Exception:
            pass

        import ipaddress
        wildcard_hit = None
        for cred in pool:
            pat = (getattr(cred, "host_pattern", "") or getattr(cred, "url_pattern", "") or "").strip()
            if not pat or pat == "*":
                wildcard_hit = wildcard_hit or cred
                continue
            if pat == bare or pat == target:
                return cred  # exact wins
            if "/" in pat and not pat.startswith("http"):
                try:
                    if ipaddress.ip_address(bare) in ipaddress.ip_network(pat, strict=False):
                        return cred
                except ValueError:
                    pass
            # url_pattern: prefix match for web creds
            if pat.startswith("http") and target.startswith(pat):
                return cred
        return wildcard_hit

    @staticmethod
    def _cred_to_dict(cred) -> dict:
        """Convert a credential dataclass to a child-agent-safe dict.
        Secrets are passed through — children need them — but we keep this
        method so the structure is consistent and easy to redact in logs."""
        from dataclasses import asdict, is_dataclass
        try:
            if is_dataclass(cred):
                return asdict(cred)
        except Exception:
            pass
        # Generic object → grab public attrs
        return {k: getattr(cred, k) for k in dir(cred)
                if not k.startswith("_") and not callable(getattr(cred, k, None))}

    # ── Meta-tool dispatch ────────────────────────────────────────────────────

    async def _execute_tool(self, tool_name: str, params: dict) -> dict:
        """Dispatch meta-tool calls to the appropriate internal handler."""
        if tool_name == "spawn_agent":
            return await self._spawn_agent(params)
        if tool_name == "spawn_agents_batch":
            return await self._spawn_agents_batch(params)
        if tool_name == "wait_for_agents":
            return await self._wait_for_agents(params)
        if tool_name == "kill_agent":
            return self._kill_agent(params)
        if tool_name == "update_context":
            return {"success": True, "status": "ok", "params": params, "error": None}
        if tool_name == "ask_operator":
            return await self._ask_operator(params)
        if tool_name == "set_phase":
            return {"success": True, "status": "ok", "phase": params.get("phase"), "error": None}
        if tool_name == "mission_done":
            return {"success": True, "status": "done", "action": "done", "error": None}
        return {"success": False, "status": "error", "output": None, "error": f"Unknown meta-tool: {tool_name}"}

    # ── spawn_agent ──────────────────────────────────────────────────────────

    async def _spawn_agent(self, params: dict) -> dict:
        """
        Spawn a specialized agent.

        params:
            agent_type: str   — "scanner" | "exploit" | "post_exploit" | ...
            target:     str   — IP / CIDR / URL
            task_type:  str   — task description passed to agent
            options:    dict  — agent-specific kwargs
        """
        agent_type = params.get("agent_type", "")
        target = params.get("target", "")
        task_type = params.get("task_type", "")
        options = dict(params.get("options", {}) or {})

        # Multi-target guard: LLM sometimes sends "ip1 ip2" or "ip1,ip2" as a single target.
        # Split and spawn one agent per IP — except for scanner agents which can scan multiple
        # targets natively, and CIDR ranges (which contain "/").
        if target and "/" not in target and agent_type != "scanner":
            import re as _re
            parts = [p.strip() for p in _re.split(r"[\s,;]+", target) if p.strip()]
            ipv4_parts = [p for p in parts if _re.match(r"^\d+\.\d+\.\d+\.\d+(?::\d+)?$", p)]
            if len(ipv4_parts) > 1:
                logger.info(
                    "Brain: multi-target detected (%s) — splitting into %d agents",
                    target, len(ipv4_parts),
                )
                spawned_ids = []
                for ip in ipv4_parts:
                    sub_params = dict(params)
                    sub_params["target"] = ip
                    sub_result = await self._spawn_agent(sub_params)
                    if sub_result.get("status") == "spawned":
                        spawned_ids.append(sub_result.get("agent_id"))
                return {
                    "success": True,
                    "status": "spawned_multi",
                    "agent_ids": spawned_ids,
                    "spawn_count": len(spawned_ids),
                    "hint": f"Split target into {len(ipv4_parts)} agents: {ipv4_parts}",
                }

        if self._dispatch_blocked_reason:
            reason = self._dispatch_blocked_reason
            self.emit_event("dispatch_blocked", {
                "reason": reason,
                "agent_type": agent_type,
                "target": target,
            })
            return {
                "success": False,
                "status": "blocked",
                "output": None,
                "error": f"Agent dispatch blocked: {reason}",
                "reason": reason,
            }

        if agent_type not in _AGENT_REGISTRY:
            return {
                "success": False,
                "status": "error",
                "error": f"Unknown agent_type '{agent_type}'. "
                         f"Available: {list(_AGENT_REGISTRY.keys())}",
            }

        # ── Exploit retry guard: block modules that have already failed N times on this host ──
        if agent_type == "exploit":
            _mod = str((options or {}).get("module") or task_type or "")
            if _mod:
                _retry_key = f"{_mod}|{target}"
                _retry_count = self._exploit_failure_counts.get(_retry_key, 0)
                if _retry_count >= self._max_exploit_retries_per_module:
                    logger.info(
                        "Brain: blocking duplicate exploit spawn %s on %s (already failed %dx)",
                        _mod, target, _retry_count,
                    )
                    return {
                        "success": False,
                        "status": "blocked",
                        "error": (
                            f"Module '{_mod}' has already failed {_retry_count} times on {target}. "
                            f"Try a different module or different host. "
                            f"Retry limit per (module,host) is {self._max_exploit_retries_per_module}."
                        ),
                        "reason": "max_retries_reached",
                    }

        # ── Port sanity check: catch truncated/wrong port numbers early ──
        _port_val = (options or {}).get("port")
        if _port_val is not None:
            try:
                _port_int = int(_port_val)
                if not (1 <= _port_int <= 65535):
                    logger.warning(
                        "Suspicious port value %r for agent %s/%s — "
                        "port must be 1-65535. Check spawn parameters.",
                        _port_val, agent_type, task_type,
                    )
            except (TypeError, ValueError):
                logger.warning(
                    "Non-integer port value %r for agent %s/%s",
                    _port_val, agent_type, task_type,
                )

        # ── Strict dedup: normalize task name + check active AND recent-done ──
        # test7 forensics: brain bypassed naive dedup by varying task_type:
        #   rsh_exec_shadow → rsh_exec_shadow_106 → rsh_exec_id_106 →
        #   rsh_exec_test → rsh_exec_id_106_v2 → rsh_exec_pwds (7 spawns,
        #   all rsh_exec(target=.106, action=check)). Same for ghostcat ×7
        #   and php_cgi ×4. ~17 of 35 exploit spawns were duplicates.
        #
        # Fix: build a dedup_key from the STABLE bits — agent_type, target,
        # port, module-or-tool, and a normalized task prefix that strips the
        # numeric/version suffixes brains tend to add. Check this against both
        # active AND recently-completed (last 60s) children.
        new_port = (options or {}).get("port")
        new_module = str((options or {}).get("module") or "")

        def _normalize_task(t: str) -> str:
            # Strip the [ml_success_prob=X.YY] and [has_cred=…] tags we add.
            t = re.sub(r"\s*\[(?:ml_success_prob|has_cred)=[^\]]+\]", "", str(t or ""))
            # Strip trailing _vN / _v2 / _retry / _N suffixes brain uses.
            t = re.sub(r"(?:_v\d+|_retry|_\d+)$", "", t.strip())
            # Strip trailing _<ip-octet> like _106 / _111 (host is already
            # in the dedup key separately).
            t = re.sub(r"_\d{1,3}$", "", t)
            return t.lower()

        norm_task = _normalize_task(task_type)
        dedup_key = (agent_type, target, new_port, new_module, norm_task)

        # Active check
        for aid, atype in self._active_agents.items():
            atask = self._active_agent_task_types.get(aid, "")
            atgt  = self._active_agent_targets.get(aid, "")
            aopts = self._active_agent_options.get(aid, {})
            aport = aopts.get("port")
            amod  = str(aopts.get("module") or "")
            akey  = (atype, atgt, aport, amod, _normalize_task(atask))
            if akey == dedup_key:
                task_obj = self._child_tasks.get(aid)
                if task_obj and not task_obj.done():
                    return {
                        "success": True,
                        "status": "already_running",
                        "agent_id": aid,
                        "agent_type": agent_type,
                        "task_type": task_type,
                        "target": target,
                        "hint": (
                            f"A {agent_type} agent ({aid}) targeting {target}:{aport} "
                            f"with the same approach ({norm_task!r}) is already running. "
                            f"Use wait_for_agents({{\"agent_ids\": [\"{aid}\"]}}) to wait for it. "
                            f"DO NOT re-spawn under a different task_type — rename does not "
                            f"reset the dedup key."
                        ),
                    }

        # Recent-done check (60s window) — stops brain from re-spawning the
        # same approach 5 seconds after it failed.
        import time as _t
        now = _t.time()
        if not hasattr(self, "_recent_done_keys"):
            self._recent_done_keys = {}  # dedup_key → (ts, agent_id, status)
        # Prune older entries (>120s) to keep the dict small.
        self._recent_done_keys = {
            k: v for k, v in self._recent_done_keys.items() if now - v[0] < 120
        }
        recent = self._recent_done_keys.get(dedup_key)
        if recent and now - recent[0] < 60:
            ts_age = int(now - recent[0])
            prev_aid, prev_status = recent[1], recent[2]
            return {
                "success": False,
                "status": "blocked",
                "reason": "recent_duplicate",
                "previous_agent_id": prev_aid,
                "previous_status": prev_status,
                "error": (
                    f"Same approach ({norm_task!r} on {target}:{new_port}) was just attempted "
                    f"by {prev_aid} {ts_age}s ago and ended {prev_status}. Retrying immediately "
                    f"is unlikely to help. Either use a DIFFERENT module/tool, target a DIFFERENT "
                    f"port/host, or wait 60s before re-trying."
                ),
            }

        # ── Exploit guard: don't spawn another exploit agent if we already have
        #    an active shell on this target — one shell is enough.
        if agent_type == "exploit":
            existing_shells = [
                s for s in self._active_shells.values()
                if s.get("host_ip") == target and s.get("status") == "active"
            ]
            if existing_shells:
                self.emit_event("exploit_spawn_skipped", {
                    "target": target,
                    "task_type": task_type,
                    "reason": "active_shell_exists",
                    "shell_key": existing_shells[0].get("shell_key"),
                })
                return {
                    "success": True,
                    "status": "skipped",
                    "agent_type": agent_type,
                    "target": target,
                    "hint": (
                        f"Active shell already exists on {target} "
                        f"({existing_shells[0].get('shell_key')}). "
                        "No new exploit needed — use post_exploit agent instead."
                    ),
                }

        agent_id = f"{agent_type}-{uuid.uuid4().hex[:8]}"
        self.bus.register_agent(agent_id)

        # ── Inject ML pre-attack success probability into task_type ─────────
        # Set by _spawn_agents_batch; the child agent sees it as a numeric hint
        # in its initial prompt so it can decide whether to bother with a
        # long-tail module. Tagged so prompts can grep for it; 0.0 hides it.
        try:
            ml_pred = float(self._pending_ml_pred.pop(
                (agent_type, target, task_type), 0.0
            ))
        except Exception:
            ml_pred = 0.0
        # Fallback: compute inline if the batch path didn't pre-score this one
        # (direct spawn_agent calls don't go through _spawn_agents_batch).
        if ml_pred == 0.0 and agent_type == "exploit":
            try:
                from ml.exploit_predictor import get_exploit_predictor
                _p = get_exploit_predictor()
                if _p is not None:
                    _mod = str((options or {}).get("module") or task_type or "")
                    _svc = str((options or {}).get("service") or "")
                    ml_pred = float(_p.predict_proba(
                        description=_mod + " " + _svc,
                        exploit_type=str((options or {}).get("exploit_type") or ""),
                        platform=str((options or {}).get("platform") or ""),
                        cvss_score=float((options or {}).get("cvss_score") or 0.0),
                        has_msf_module=1 if _mod.startswith(("exploit/", "auxiliary/")) else 0,
                    ))
            except Exception as _e:
                logger.debug("inline ML predict failed: %s", _e)
        if ml_pred > 0.0 and "[ml_success_prob=" not in (task_type or ""):
            task_type = f"{task_type} [ml_success_prob={ml_pred:.2f}]"

        # ── ML threshold block ──────────────────────────────────────────────
        # Reject spawns below the configured probability floor (default 0.15)
        # — they almost always waste a turn. test7 spawned ~15 such agents
        # despite the ML scoring loudly saying P=0.00 / 0.01 / 0.10.
        # ml_pred==0 means "no score" — those are allowed through (fairness:
        # we shouldn't block when we don't have an opinion).
        if (
            agent_type == "exploit"
            and ml_pred > 0.0
            and ml_pred < getattr(self, "_ml_min_spawn_prob", 0.15)
        ):
            self.emit_event("ml_spawn_blocked", {
                "agent_type": agent_type,
                "target": target,
                "task_type": task_type,
                "ml_pred": ml_pred,
                "threshold": getattr(self, "_ml_min_spawn_prob", 0.15),
            })
            return {
                "success": False,
                "status": "blocked",
                "reason": "ml_below_threshold",
                "ml_pred": ml_pred,
                "threshold": getattr(self, "_ml_min_spawn_prob", 0.15),
                "error": (
                    f"ML pre-attack probability {ml_pred:.2f} is below the "
                    f"current floor {getattr(self, '_ml_min_spawn_prob', 0.15):.2f}. "
                    f"This exploit is very unlikely to succeed; pick a different "
                    f"module/vector. Threshold is tunable in Settings → ML Models "
                    f"(ml_min_spawn_probability) or set it to 0 to disable."
                ),
            }

        # ── Inject operator-provided credentials matching this target ───────
        # If the operator supplied SSH/SMB/DB credentials in MissionBrief, find
        # the most specific match for `target` (host_pattern can be exact IP,
        # CIDR, or "*"). The child agent gets them in `options.*_credential`
        # and `task_type` is tagged so the prompt-side guidance fires.
        if target and agent_type in ("exploit", "post_exploit", "lateral"):
            matched_cred = self._match_preset_cred(target, "ssh")
            if matched_cred and "ssh_credential" not in options:
                options["ssh_credential"] = self._cred_to_dict(matched_cred)
                if "[has_cred=ssh]" not in (task_type or ""):
                    task_type = f"{task_type} [has_cred=ssh]"
            matched_smb = self._match_preset_cred(target, "smb")
            if matched_smb and "smb_credential" not in options:
                options["smb_credential"] = self._cred_to_dict(matched_smb)
                if "[has_cred=smb]" not in (task_type or ""):
                    task_type = f"{task_type} [has_cred=smb]"
            matched_db = self._match_preset_cred(target, "db")
            if matched_db and "db_credential" not in options:
                options["db_credential"] = self._cred_to_dict(matched_db)
                if "[has_cred=db]" not in (task_type or ""):
                    task_type = f"{task_type} [has_cred=db]"

        # For post_exploit agents: inject objectives into task_type AND pass the
        # most recently opened shell_key so the agent doesn't need to guess.
        if agent_type == "post_exploit":
            if self.ctx.objectives:
                obj_str = "; ".join(self.ctx.objectives)
                if obj_str not in task_type:
                    task_type = f"{task_type} | objectives: {obj_str}" if task_type else f"post_exploitation | objectives: {obj_str}"
            requested_key = options.get("shell_key")
            if requested_key:
                requested_shell = self._active_shells.get(requested_key)
                if not requested_shell or not await self._verify_shell_alive(requested_shell):
                    if requested_shell:
                        self._mark_shell_closed(requested_key, "dead before post_exploit")
                    options.pop("shell_key", None)

            # Auto-inject a verified live shell when missing.
            if "shell_key" not in options and self._active_shells:
                target_shell = await self._pick_live_shell_for_target(target)
                if target_shell:
                    options["shell_key"] = target_shell["shell_key"]

        # Per-agent-type memory budgets — exploit/post_exploit need larger context
        # to track multiple tool results; webapp/scanner are lighter workloads.
        _AGENT_MEMORY = {
            "exploit":      {"memory_max_tokens": 32768, "memory_max_messages": 40},
            "post_exploit": {"memory_max_tokens": 32768, "memory_max_messages": 40},
            "scanner":      {"memory_max_tokens": 16384, "memory_max_messages": 30},
            "webapp":       {"memory_max_tokens": 16384, "memory_max_messages": 30},
            "lateral":      {"memory_max_tokens": 32768, "memory_max_messages": 40},
            "reporting":    {"memory_max_tokens": 32768, "memory_max_messages": 40},
        }
        mem_defaults = _AGENT_MEMORY.get(agent_type, {"memory_max_tokens": 16384, "memory_max_messages": 30})

        # Resolve per-agent LLM — use explicit override if configured.
        # By default children use the global active router (not Brain's forced override).
        from core.llm_client import make_agent_llm
        child_llm = make_agent_llm("", "")
        _model_cfg = None
        _model_key = _AGENT_TYPE_TO_MODEL_KEY.get(agent_type, agent_type)
        if _model_key in self._agent_models:
            _model_cfg = self._agent_models[_model_key]
        elif agent_type in self._agent_models:
            # Safety net for non-canonical direct keys.
            _model_cfg = self._agent_models[agent_type]
        else:
            for legacy_key in _LEGACY_CHILD_MODEL_FALLBACK.get(agent_type, ()):
                if legacy_key in self._agent_models:
                    _model_cfg = self._agent_models[legacy_key]
                    break
        if _model_cfg and (_model_cfg.get("provider") or _model_cfg.get("model")):
            child_llm = make_agent_llm(
                _model_cfg.get("provider", ""),
                _model_cfg.get("model", ""),
            )

        # Build constructor kwargs for the child agent
        child_kwargs = {
            "agent_type":         agent_type,
            "agent_id":           agent_id,
            "mission_id":         self.mission_id,
            "tool_registry":      self._registry,
            "safety":             self._safety,
            "llm":                child_llm,
            "progress_callback":  self._progress_cb,
            "audit_repo":         self._audit_repo,
            "session_id":         self.session_id,
            # V2 additions
            "message_bus":        self.bus,
            "mission_context":    self.ctx,
            "target":             target,
            "task_type":          task_type,
            **mem_defaults,
        }
        # Override with any agent-specific kwargs from registry
        child_kwargs.update(self._agent_ctor_kwargs.get(agent_type, {}))

        # Dynamically import and instantiate
        module_path, class_name = _AGENT_REGISTRY[agent_type]
        try:
            mod = importlib.import_module(module_path)
            AgentClass = getattr(mod, class_name)
        except (ImportError, AttributeError) as exc:
            return {"success": False, "status": "error", "output": None, "error": f"Failed to import {agent_type}: {exc}"}

        # Pass options only to agents that explicitly accept it.
        try:
            init_params = inspect.signature(AgentClass.__init__).parameters
        except Exception:
            init_params = {}
        if "options" in init_params:
            child_kwargs["options"] = options

        agent = AgentClass(**child_kwargs)

        # Notify context
        await self.ctx.update_agent_status(AgentStatus(
            agent_id=agent_id,
            agent_type=agent_type,
            status="spawning",
            current_task=target,
        ))

        # Launch as asyncio task
        task = asyncio.create_task(self._run_child(agent, agent_id, agent_type))
        self._child_tasks[agent_id] = task
        self._child_agents[agent_id] = agent

        self.emit_event("agent_spawned", {
            "agent_id": agent_id,
            "agent_type": agent_type,
            "target": target,
        })
        dbg.agent_spawn(self.agent_id, agent_id, agent_type, target)
        logger.info("BrainAgent: spawned %s (id=%s) for %s", agent_type, agent_id, target)

        # Persist to DB so the Agent page can display this agent
        if self.session_id:
            try:
                await _agent_instance_repo.create(
                    session_id=self.session_id,
                    agent_id=agent_id,
                    agent_type=agent_type,
                    target=target,
                )
            except Exception:
                pass  # non-critical — don't break spawn if DB write fails

        spawn_result = {
            "success": True,
            "status": "spawned",
            "agent_id": agent_id,
            "agent_type": agent_type,
            "task_type": task_type,
            "target": target,
        }
        # Register in dedup tracking immediately (not waiting for process_result)
        self._active_agents[agent_id] = agent_type
        self._active_agent_task_types[agent_id] = task_type
        self._active_agent_targets[agent_id] = target
        self._active_agent_options[agent_id] = options or {}

        # Make this child visible in the attack graph straight away — operator
        # sees the agent node + a "targeting" edge to its host/service before
        # any tool call comes back.
        port_val = None
        try:
            raw_port = (options or {}).get("port")
            if raw_port is not None:
                port_val = int(raw_port)
        except (TypeError, ValueError):
            port_val = None
        try:
            await self.ctx.update_agent_status(AgentStatus(
                agent_id=agent_id, agent_type=agent_type,
                status="spawning", current_task=task_type or "",
            ))
            await self.ctx.link_agent_to_target(
                agent_id=agent_id, target=target, port=port_val,
                task_type=task_type or "",
            )
        except Exception:  # graph updates must never break spawn
            logger.debug("attack_graph link failed for %s", agent_id, exc_info=True)
        return spawn_result

    async def _spawn_agents_batch(self, params: dict) -> dict:
        """
        Spawn multiple agents simultaneously.

        params:
            agents: list of dicts, each with the same fields as spawn_agent params
                    (agent_type, target, task_type, options)

        Returns summary of all spawn results.
        """
        if self._dispatch_blocked_reason:
            reason = self._dispatch_blocked_reason
            self.emit_event("dispatch_blocked", {"reason": reason, "batch": True})
            return {
                "success": False,
                "status": "blocked",
                "output": None,
                "error": f"Agent dispatch blocked: {reason}",
                "reason": reason,
            }

        agents_list = params.get("agents", [])
        if not agents_list:
            return {"success": False, "status": "error", "output": None, "error": "spawn_agents_batch requires 'agents' list"}

        # ── Refresh runtime knobs from settings (cheap, every batch) ──────────
        # spawn_max_parallel: hard cap; default 3 keeps LLM queue healthy.
        # ml_inject_exploit_pred: gates per-module success-prob injection.
        _spawn_cap = 3
        _ml_pred_enabled = True
        try:
            from database import db as _db
            _spawn_cap = int(await _db.get_setting("spawn_max_parallel", 3) or 3)
            _ml_pred_enabled = bool(await _db.get_setting("ml_inject_exploit_pred", True))
        except Exception:
            pass
        # Clamp to a sane band.
        _spawn_cap = max(1, min(_spawn_cap, 16))
        self._spawn_max_parallel = _spawn_cap

        # ── ML pre-run prioritization (fixed API binding) ─────────────────────
        # Previous code called get_ml_predictor() / predict_success_probability()
        # which don't exist on ExploitPredictorML — the except branch swallowed
        # the AttributeError so sort never happened. Now we use the real API,
        # stash the per-agent probability via id(agent_dict) → prob, and pass it
        # into _spawn_agent so the child prompt + brain prompt can both render it.
        score_by_id: dict[int, float] = {}  # id(agent_params) → probability
        if _ml_pred_enabled:
            _predictor = None
            try:
                from ml.exploit_predictor import get_exploit_predictor
                _predictor = get_exploit_predictor()
            except Exception as _ml_e:
                logger.debug("ExploitPredictor import failed: %s", _ml_e)

            if _predictor is not None:
                for ap in agents_list:
                    if ap.get("agent_type") != "exploit":
                        continue
                    opts = ap.get("options") or {}
                    module = str(opts.get("module") or ap.get("task_type") or "")
                    service = str(opts.get("service") or "")
                    try:
                        prob = _predictor.predict_proba(
                            description=module + " " + service,
                            exploit_type=str(opts.get("exploit_type") or ""),
                            platform=str(opts.get("platform") or ""),
                            cvss_score=float(opts.get("cvss_score") or opts.get("cvss") or 0.0),
                            attack_vector=str(opts.get("attack_vector") or ""),
                            epss_score=float(opts.get("epss_score") or 0.0),
                            in_kev=int(opts.get("in_kev") or 0),
                            has_msf_module=1 if module.startswith(("exploit/", "auxiliary/")) else 0,
                            verified=int(opts.get("verified") or 0),
                        )
                        score_by_id[id(ap)] = float(prob)
                    except Exception as _e:
                        logger.debug("ML predict_proba failed for %s: %s", module, _e)

            # Sort: non-exploit first (always 0.99 weight), then exploits by score desc.
            def _ml_priority(ap: dict) -> float:
                if ap.get("agent_type") != "exploit":
                    return -0.99
                return -score_by_id.get(id(ap), 0.0)
            agents_list = sorted(agents_list, key=_ml_priority)

        # Hand pre-attack probabilities to _spawn_agent via the side-channel
        # cache so each child agent gets it in its task_type without changing
        # the spawn_agent signature surface.
        self._pending_ml_pred = {
            # key by (agent_type, target, task_type) tuple — unique enough
            (str(ap.get("agent_type")), str(ap.get("target")), str(ap.get("task_type"))):
            score_by_id.get(id(ap), 0.0)
            for ap in agents_list
            if id(ap) in score_by_id
        }

        spawned = []
        skipped = []
        errors = []

        for agent_params in agents_list:
            result = await self._spawn_agent(agent_params)
            status = result.get("status", "error")
            if status == "spawned":
                spawned.append({
                    "agent_id": result["agent_id"],
                    "agent_type": result["agent_type"],
                    "target": result.get("target", ""),
                })
                # Register for process_result handling (same as single spawn)
                self._handle_spawn_result(result)
            elif status == "already_running":
                skipped.append({
                    "agent_type": agent_params.get("agent_type"),
                    "reason": "already_running",
                    "agent_id": result.get("agent_id"),
                })
            else:
                errors.append({
                    "agent_type": agent_params.get("agent_type"),
                    "error": result.get("error", "unknown error"),
                })

        dbg.info(self.agent_id,
                 f"spawn_agents_batch: spawned={len(spawned)} skipped={len(skipped)} errors={len(errors)}")

        return {
            "success": True,
            "status": "ok",
            "spawned": spawned,
            "skipped": skipped,
            "errors": errors,
            "hint": (
                f"Spawned {len(spawned)} agents. "
                f"Now call: wait_for_agents({{\"agent_ids\": \"all\"}}) to wait for all."
                if spawned else "No new agents were spawned."
            ),
        }

    async def _run_child(
        self, agent: BaseAgent, agent_id: str, agent_type: str
    ) -> AgentResult:
        """Wrapper that runs a child agent and posts AGENT_DONE/ERROR to the bus."""
        dbg.info(agent_id, f"_run_child started → agent_type={agent_type}")

        # ── Concurrency gate: only spawn_max_parallel children run at once ──
        # Lazily create the semaphore in the running loop so we don't tie it to
        # the constructor's loop (which may not be the running one).
        if self._spawn_semaphore is None:
            self._spawn_semaphore = asyncio.Semaphore(max(1, int(self._spawn_max_parallel or 3)))

        sem_t0 = asyncio.get_event_loop().time()
        async with self._spawn_semaphore:
            sem_wait = asyncio.get_event_loop().time() - sem_t0
            if sem_wait > 0.5:
                dbg.info(agent_id, f"_run_child: waited {sem_wait:.1f}s for spawn slot")

            await self.ctx.update_agent_status(AgentStatus(
                agent_id=agent_id, agent_type=agent_type, status="running"
            ))
            if self.session_id:
                try:
                    await _agent_instance_repo.update_status(agent_id=agent_id, status="running")
                except Exception:
                    pass
            # Per-agent wall-clock timeout — kills hung agents that don't make progress.
            # Scanner: 600s (10min, big port ranges take time)
            # Exploit: 480s (8min, MSF exploits + multiple attempts)
            # Others:  300s (5min)
            # IMPORTANT: timer starts AFTER semaphore acquisition so a queued
            # child is not penalised for the wait it didn't choose.
            _agent_timeout_s = {"scanner": 600, "exploit": 480}.get(agent_type, 300)
            return await self._execute_child(agent, agent_id, agent_type, _agent_timeout_s)

    async def _execute_child(
        self, agent: BaseAgent, agent_id: str, agent_type: str, _agent_timeout_s: int,
    ) -> AgentResult:
        """Actual child execution — extracted so the semaphore-acquired path is
        a tight scope and the timeout never blames the queue wait."""
        try:
            result: AgentResult = await asyncio.wait_for(agent.run(), timeout=_agent_timeout_s)
        except asyncio.TimeoutError:
            logger.warning("Child agent %s (%s) hit wall-clock timeout %ds — killing",
                          agent_id, agent_type, _agent_timeout_s)
            dbg.agent_error(agent_id, f"wall-clock timeout {_agent_timeout_s}s")
            self.emit_event("agent_timeout", {
                "agent_id": agent_id, "agent_type": agent_type,
                "timeout_seconds": _agent_timeout_s,
            })
            if self.session_id:
                try:
                    await _agent_instance_repo.update_status(
                        agent_id=agent_id, status="failed",
                        error=f"wall-clock timeout {_agent_timeout_s}s",
                    )
                except Exception:
                    pass
            # test5 forensics: previously we returned here WITHOUT bus.send,
            # which left brain's wait_for_agent_done(aid) blocked on a future
            # that nobody ever resolved → wait_for_agents hung for 3600s and
            # the early-return condition never fired. Build a synthetic
            # AgentResult and fall through to the normal bus.send path so the
            # waiters wake up.
            result = AgentResult(
                agent_id=agent_id,
                agent_type=agent_type,
                status="failed",
                error=f"agent wall-clock timeout {_agent_timeout_s}s",
            )
        except asyncio.CancelledError:
            # External cancellation (e.g. shell-trigger cancel path, kill_agent,
            # orchestrator stop). Try to publish AGENT_ERROR best-effort, then
            # re-raise so asyncio's cancellation propagation stays correct.
            # The shell-trigger path already publishes its own AGENT_ERROR;
            # this is a belt-and-braces for any other cancel route.
            logger.info("Child agent %s cancelled", agent_id)
            dbg.agent_error(agent_id, "cancelled")
            with contextlib.suppress(Exception):
                await self.bus.send(AgentMessage(
                    msg_type=MessageType.AGENT_ERROR,
                    sender_id=agent_id,
                    payload={
                        "agent_id": agent_id,
                        "agent_type": agent_type,
                        "status": "cancelled",
                        "findings": [],
                        "iterations": 0,
                        "error": "cancelled",
                    },
                ))
            with contextlib.suppress(Exception):
                if self.session_id:
                    await _agent_instance_repo.update_status(
                        agent_id=agent_id, status="cancelled",
                    )
            raise
        except Exception as exc:
            logger.exception("Child agent %s raised: %s", agent_id, exc)
            dbg.agent_error(agent_id, str(exc))
            result = AgentResult(
                agent_id=agent_id,
                agent_type=agent_type,
                status="failed",
                error=str(exc),
            )

        msg_type = (
            MessageType.AGENT_DONE if result.status in ("success", "partial")
            else MessageType.AGENT_ERROR
        )
        await self.bus.send(AgentMessage(
            msg_type=msg_type,
            sender_id=agent_id,
            payload={
                "agent_id":    agent_id,
                "agent_type":  agent_type,
                "status":      result.status,
                "findings":    result.findings,
                "iterations":  result.iterations,
                "error":       result.error or "",
            },
        ))
        dbg.agent_done(agent_id, agent_type, result.status,
                       len(result.findings), result.iterations)
        final_status = "done" if result.status in ("success", "partial") else "failed"
        await self.ctx.update_agent_status(AgentStatus(
            agent_id=agent_id,
            agent_type=agent_type,
            status=final_status,
        ))

        # Update DB record so the Agent page reflects the final state
        if self.session_id:
            try:
                await _agent_instance_repo.update_status(
                    agent_id=agent_id,
                    status=final_status,
                    iterations=result.iterations,
                    findings=result.findings,
                    error=result.error or "",
                )
            except Exception:
                pass  # non-critical

        return result

    # ── wait_for_agents ──────────────────────────────────────────────────────

    async def _wait_for_agents(self, params: dict) -> dict:
        """
        Block until N (or all) listed agent IDs complete (or timeout).

        Pause-aware: while Brain is paused, child agents are also paused.
        When Brain is resumed, waiting continues.

        params:
            agent_ids: list[str] | "all"
            timeout:   float (seconds, default 3600)
            wait_count: int | "all" — return as soon as this many agents finish.
                        Default "all". Use a small N (e.g. 1) when you want to
                        re-plan as soon as the first result arrives instead of
                        blocking until every batch member finishes.

                        test4 forensics: brain spawned 8 children with cap=3,
                        then waited for ALL of them — staying blocked for the
                        entire ~15min serialization window even though it could
                        have re-planned after the first 2-3 results. With
                        wait_count=1 brain wakes up much earlier and can spawn
                        vectors for the second host while the first batch is
                        still draining.
        """
        raw_ids = params.get("agent_ids", [])
        timeout: float = float(params.get("timeout", 3600))
        raw_wait_count = params.get("wait_count", "all")

        # Support "all" shorthand to wait for all currently tracked agents
        if raw_ids == "all" or raw_ids == ["all"]:
            # 1. Currently running agents
            agent_ids = list(self._active_agents.keys())
            # 2. Tasks not yet done (may have been removed from _active_agents early)
            for aid, t in self._child_tasks.items():
                if not t.done() and aid not in agent_ids:
                    agent_ids.append(aid)
            # 3. Also include any that already completed (pre-resolved futures)
            #    so the caller gets a full picture of what ran
            if not agent_ids:
                agent_ids = list(self._child_tasks.keys())
        else:
            agent_ids = raw_ids if isinstance(raw_ids, list) else [raw_ids]

        if not agent_ids:
            dbg.warn(self.agent_id, "wait_for_agents called but no agents to wait for")
            return {"success": True, "status": "ok", "completed": [], "timed_out": [], "hint": "No agents to wait for.", "error": None}

        # Resolve wait_count → minimum # of children that must complete before
        # we return. "all" (default) preserves the original blocking semantics.
        if isinstance(raw_wait_count, str) and raw_wait_count.lower() == "all":
            wait_count_target = len(agent_ids)
        else:
            try:
                wait_count_target = max(1, min(int(raw_wait_count), len(agent_ids)))
            except (TypeError, ValueError):
                wait_count_target = len(agent_ids)

        dbg.wait_start(self.agent_id, agent_ids, timeout)
        done_results: dict[str, AgentMessage | None] = {}

        async def wait_one(aid: str):
            r = await self.bus.wait_for_agent_done(aid, timeout=timeout)
            done_results[aid] = r

        # Wrap actual waiting in a task so we can monitor pause state
        wait_task = asyncio.ensure_future(
            asyncio.gather(*[wait_one(aid) for aid in agent_ids])
        )

        # Poll loop: check pause state every 0.5s while waiting
        while not wait_task.done():
            if self._mission_done:
                wait_task.cancel()
                with contextlib.suppress(Exception):
                    await wait_task
                done_now = [aid for aid, r in done_results.items() if r is not None]
                return {
                    "success": True,
                    "status": "aborted",
                    "completed": done_now,
                    "timed_out": [],
                    "results": {
                        aid: (r.payload if r else None)
                        for aid, r in done_results.items()
                    },
                    "reason": "mission_done",
                    "error": None,
                }

            if self._dispatch_blocked_reason == "objective_confirmed":
                wait_task.cancel()
                with contextlib.suppress(Exception):
                    await wait_task
                done_now = [aid for aid, r in done_results.items() if r is not None]
                return {
                    "success": True,
                    "status": "aborted",
                    "completed": done_now,
                    "timed_out": [],
                    "results": {
                        aid: (r.payload if r else None)
                        for aid, r in done_results.items()
                    },
                    "reason": "objective_confirmed",
                    "error": None,
                }

            # If Brain is paused, wait for resume before continuing
            if not self._pause_event.is_set():
                logger.info("BrainAgent: paused during wait_for_agents")
                while not self._pause_event.is_set():
                    if self._kill_switch_is_set():
                        wait_task.cancel()
                        return {"success": False, "status": "error", "output": None, "error": "Kill switch triggered"}
                    await asyncio.sleep(0.3)
                logger.info("BrainAgent: resumed, continuing wait_for_agents")

            # Check kill switch
            if self._kill_switch_is_set():
                wait_task.cancel()
                return {"success": False, "status": "error", "output": None, "error": "Kill switch triggered"}

            # Early-return when wait_count_target has been met. The remaining
            # children keep running in the background; brain regains control
            # and can spawn new vectors / re-prioritise based on what just
            # came back. This is what stops the test4-style 15min freeze.
            if wait_count_target < len(agent_ids):
                done_so_far = sum(1 for r in done_results.values() if r is not None)
                if done_so_far >= wait_count_target:
                    completed = [aid for aid, r in done_results.items() if r is not None]
                    pending  = [aid for aid in agent_ids if aid not in done_results]
                    dbg.info(self.agent_id,
                             f"wait_for_agents early-return: {len(completed)}/"
                             f"{len(agent_ids)} done (target={wait_count_target}), "
                             f"{len(pending)} still running in background")
                    # Don't cancel — children continue; brain gets control back.
                    return {
                        "success": True,
                        "status": "partial",
                        "completed": completed,
                        "timed_out": [],
                        "still_running": pending,
                        "results": {
                            aid: (r.payload if r else None)
                            for aid, r in done_results.items()
                        },
                        "hint": (
                            f"{len(completed)} agents completed; {len(pending)} "
                            f"still running ({', '.join(pending[:5])}). Use "
                            f"wait_for_agents({{\"agent_ids\": {pending[:3]!r}}}) "
                            f"to wait for specific ones, or spawn new vectors "
                            f"while these finish in the background."
                        ),
                        "error": None,
                    }

            try:
                await asyncio.wait_for(asyncio.shield(wait_task), timeout=0.5)
            except asyncio.TimeoutError:
                continue  # still waiting — loop back to check pause

        completed = [aid for aid, r in done_results.items() if r is not None]
        timed_out = [aid for aid, r in done_results.items() if r is None]
        dbg.wait_done(self.agent_id, completed, timed_out)

        return {
            "success": True,
            "status": "ok",
            "completed": completed,
            "timed_out": timed_out,
            "results": {
                aid: (r.payload if r else None)
                for aid, r in done_results.items()
            },
            "error": None,
        }

    # ── kill_agent ───────────────────────────────────────────────────────────

    def _kill_agent(self, params: dict) -> dict:
        agent_id = params.get("agent_id", "")
        task = self._child_tasks.get(agent_id)
        if task and not task.done():
            atype = self._active_agents.get(agent_id, "")
            task.cancel()
            self._child_tasks.pop(agent_id, None)
            self.emit_event("agent_killed", {"agent_id": agent_id})
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None
            if loop is not None:
                loop.create_task(self.bus.send(AgentMessage(
                    msg_type=MessageType.AGENT_ERROR,
                    sender_id=agent_id,
                    payload={
                        "agent_id": agent_id,
                        "agent_type": atype,
                        "status": "cancelled",
                        "findings": [],
                        "iterations": 0,
                        "error": "cancelled: kill_agent",
                    },
                )))
            return {"success": True, "status": "killed", "agent_id": agent_id, "error": None}
        return {"success": False, "status": "not_found", "agent_id": agent_id, "error": f"Agent not found: {agent_id}"}

    def _handle_spawn_result(self, result: dict, options: dict | None = None) -> None:
        # result from observe() has structure {"success": ..., "output": {"status": "spawned", ...}}
        # Unwrap to get the actual spawn result
        inner = result.get("output", result) if isinstance(result.get("output"), dict) else result
        if inner.get("status") == "spawned":
            aid = inner["agent_id"]
            atype = inner["agent_type"]
            atask = inner.get("task_type", "")
            atgt  = inner.get("target", "")
            self._active_agents[aid] = atype
            self._active_agent_task_types[aid] = atask
            self._active_agent_targets[aid] = atgt
            self._active_agent_options[aid] = options or {}
            self._add_finding({
                "type": "agent_spawned",
                "agent_id": aid,
                "agent_type": atype,
                "task_type": atask,
            })

    # ── update_context ────────────────────────────────────────────────────────

    async def _handle_update_context(self, result: dict, action_dict: dict) -> None:
        """
        Brain integrates a finding into MissionContext.

        The LLM calls update_context with an 'item' dict describing what to add.
        """
        params = action_dict.get("parameters", action_dict)
        item = params.get("item", params)  # support both {item:{...}} and flat params
        item_type = item.get("type", "")

        if item_type == "host":
            ports = [
                PortInfo(number=p["number"], state=p.get("state", "open"),
                         service=p.get("service", ""), version=p.get("version", ""))
                for p in item.get("ports", [])
            ]
            await self.ctx.update_host(HostInfo(
                ip=item["ip"],
                hostname=item.get("hostname", ""),
                os_type=item.get("os_type", ""),
                ports=ports,
            ))

        elif item_type == "vulnerability":
            await self.ctx.add_vulnerability(VulnInfo(
                title=item.get("title", ""),
                host_ip=item.get("host_ip", ""),
                port=int(item.get("port", 0)),
                cve_id=item.get("cve_id", ""),
                cvss=float(item.get("cvss", 0.0)),
                description=item.get("description", ""),
            ))

        elif item_type == "session":
            await self.ctx.add_session(SessionInfo(
                session_id=item.get("session_id", str(uuid.uuid4())),
                host_ip=item.get("host_ip", ""),
                session_type=item.get("session_type", "shell"),
                privilege_level=int(item.get("privilege_level", 0)),
                username=item.get("username", ""),
            ))

        elif item_type == "credential":
            await self.ctx.add_credential(HarvestedCredential(
                source_host=item.get("source_host", ""),
                username=item.get("username", ""),
                password=item.get("password", ""),
                hash=item.get("hash", ""),
                credential_type=item.get("credential_type", "plaintext"),
                service=item.get("service", ""),
            ))

        elif item_type == "loot":
            await self.ctx.add_loot(LootItem(
                source_host=item.get("source_host", ""),
                loot_type=item.get("loot_type", "file"),
                description=item.get("description", ""),
                file_path=item.get("file_path", ""),
                content=item.get("content", ""),
            ))

        elif item_type == "lateral_edge":
            await self.ctx.add_lateral_edge(
                item.get("from_ip", ""),
                item.get("to_ip", ""),
                item.get("description", ""),
            )

    @staticmethod
    def _finding_value(payload: dict, *keys: str, default=None):
        nested = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        for key in keys:
            if payload.get(key) not in (None, ""):
                return payload.get(key)
            if nested.get(key) not in (None, ""):
                return nested.get(key)
        return default

    async def _db_persist_finding(self, payload: dict, finding_type: str) -> None:
        """Persist scan/vuln findings to DB tables in real-time during v2 agent runs."""
        if not self.session_id:
            return
        try:
            if finding_type in ("host", "host_discovered", "port_scan", "service_scan"):
                from database.repositories import ScanResultRepository
                _scan_repo = ScanResultRepository()
                ip = str(self._finding_value(payload, "ip", "host_ip", "host", "target_ip", default="")).strip()
                if not ip:
                    return
                ports_raw = self._finding_value(payload, "ports", "services", default=[]) or []
                hosts_payload = [{"ip": ip, "state": "up", "ports": [
                    {
                        "number": int(p.get("number", p.get("port", p.get("portid", 0)))),
                        "protocol": str(p.get("protocol", "tcp")),
                        "state": "open",
                        "service": str(p.get("service", p.get("name", "")) or ""),
                        "version": str(p.get("version", "") or ""),
                    }
                    for p in ports_raw if isinstance(p, dict)
                    and int(p.get("number", p.get("port", p.get("portid", 0))) or 0) > 0
                ]}]
                await _scan_repo.save(
                    session_id=self.session_id,
                    target=ip,
                    scan_type=finding_type,
                    hosts=hosts_payload,
                    duration_seconds=float(self._finding_value(payload, "duration_seconds", default=0.0) or 0.0),
                )

            elif finding_type in ("vulnerability", "vuln", "cve"):
                from database.repositories import VulnerabilityRepository
                _vuln_repo = VulnerabilityRepository()
                await _vuln_repo.save(
                    session_id=self.session_id,
                    vuln={
                        "title": str(self._finding_value(payload, "title", "name", "description", default="Potential vulnerability") or "Potential vulnerability"),
                        "description": str(self._finding_value(payload, "description", default="") or ""),
                        "cve_id": str(self._finding_value(payload, "cve_id", "cve", default="") or ""),
                        "cvss_score": float(self._finding_value(payload, "cvss_score", "cvss", "score", default=0.0) or 0.0),
                        "exploit_path": str(self._finding_value(payload, "exploit_path", "module", default="") or ""),
                        "service": str(self._finding_value(payload, "service", default="") or ""),
                        "host_ip": str(self._finding_value(payload, "host_ip", "ip", "host", default="") or ""),
                    },
                )

            elif finding_type in ("exploit_attempt", "exploit_run", "exploit_failed", "exploit_succeeded"):
                # Persist every exploit attempt (success or failure) so the
                # exploit_results table stays in sync with what actually ran.
                # ml_success_prob is computed inside ExploitResultRepository.save
                # via post_run_confidence(), so the row reflects the calibrated
                # outcome — not just the static pre-run estimate.
                from database.repositories import ExploitResultRepository
                _exp_repo = ExploitResultRepository()
                await _exp_repo.save(
                    session_id=self.session_id,
                    result={
                        "host_ip":   str(self._finding_value(payload, "host_ip", "ip", "host", "target_ip", default="") or ""),
                        "port":      int(self._finding_value(payload, "port", default=0) or 0),
                        "module":    str(self._finding_value(payload, "module", "exploit", "exploit_path", default="") or ""),
                        "payload":   str(self._finding_value(payload, "payload", default="") or ""),
                        "success":   bool(self._finding_value(payload, "success", "tool_success", default=False)),
                        "session_opened": int(bool(self._finding_value(payload, "session_opened", "shell_opened", default=False))),
                        "output":    str(self._finding_value(payload, "output", default="") or "")[:8000],
                        "error":     str(self._finding_value(payload, "error", default="") or "")[:2000],
                        "poc_output":str(self._finding_value(payload, "poc_output", default="") or "")[:8000],
                        "source_ip": str(self._finding_value(payload, "source_ip", default="") or ""),
                        "exploit_type": str(self._finding_value(payload, "exploit_type", default="remote") or "remote"),
                        "platform":  str(self._finding_value(payload, "platform", default="") or ""),
                        "cvss_score":float(self._finding_value(payload, "cvss_score", "cvss", default=0.0) or 0.0),
                    },
                )

            elif finding_type in ("session_opened", "shell_opened", "session"):
                # A successful shell counts as a successful exploit row with
                # session_opened=1 so the UI/reports can render foothold count.
                from database.repositories import ExploitResultRepository
                _exp_repo = ExploitResultRepository()
                await _exp_repo.save(
                    session_id=self.session_id,
                    result={
                        "host_ip":   str(self._finding_value(payload, "host_ip", "ip", "host", default="") or ""),
                        "port":      int(self._finding_value(payload, "port", default=0) or 0),
                        "module":    str(self._finding_value(payload, "module", "exploit", default="") or ""),
                        "payload":   str(self._finding_value(payload, "payload", default="") or ""),
                        "success":   True,
                        "session_opened": 1,
                        "output":    str(self._finding_value(payload, "output", default="shell opened") or "shell opened")[:8000],
                        "error":     "",
                        "exploit_type": str(self._finding_value(payload, "exploit_type", default="remote") or "remote"),
                        "platform":  str(self._finding_value(payload, "platform", default="") or ""),
                    },
                )

            elif finding_type in ("credential", "credential_found"):
                # Encrypt the secret before storing — the SecretStore handles
                # the keying. Falls back to plain text if SecretStore isn't
                # configured (best-effort: a missing key shouldn't lose data).
                from database.repositories import HarvestedCredentialRepository
                _cred_repo = HarvestedCredentialRepository()
                _secret = str(
                    self._finding_value(payload, "password", "secret", "hash", default="") or ""
                )
                _secret_enc = _secret
                try:
                    from core.secure_store import encrypt_value
                    _secret_enc = encrypt_value(_secret) if _secret else ""
                except Exception:
                    pass  # plain text fallback
                await _cred_repo.save(
                    session_id=self.session_id,
                    source_host=str(self._finding_value(payload, "source_host", "host_ip", "host", "ip", default="") or ""),
                    credential_type=str(self._finding_value(payload, "credential_type", "cred_type", default="plaintext") or "plaintext"),
                    username=str(self._finding_value(payload, "username", "user", default="") or ""),
                    secret_enc=_secret_enc,
                    hash_type=str(self._finding_value(payload, "hash_type", default="") or ""),
                    service=str(self._finding_value(payload, "service", default="") or ""),
                )

            elif finding_type in ("loot", "flag", "file_found"):
                from database.repositories import LootRepository
                _loot_repo = LootRepository()
                await _loot_repo.save(
                    session_id=self.session_id,
                    source_host=str(self._finding_value(payload, "source_host", "host_ip", "host", "ip", default="") or ""),
                    loot_type="flag" if finding_type == "flag" else str(self._finding_value(payload, "loot_type", default="file") or "file"),
                    description=str(self._finding_value(payload, "description", "title", default="") or ""),
                    source_path=str(self._finding_value(payload, "source_path", "file_path", "path", default="") or ""),
                    local_path=str(self._finding_value(payload, "local_path", default="") or ""),
                    content_preview=str(self._finding_value(payload, "content_preview", "preview", "content", default="") or ""),
                )
        except Exception as _e:
            logger.debug("_db_persist_finding failed (%s): %s", finding_type, _e)

        # Best-effort live counter refresh — keeps the dashboard from showing
        # 0/0/0/0 while the run is ongoing or paused. Cheap because it just
        # reads what we already maintain in MissionContext.
        try:
            await self._refresh_session_counters()
        except Exception as _e:
            logger.debug("_refresh_session_counters failed: %s", _e)

    async def _refresh_session_counters(self) -> None:
        """Push the current in-memory tallies to pentest_sessions so the
        dashboard counters track reality without waiting for session_done.
        Called after every persisted finding."""
        if not self.session_id:
            return
        try:
            from database.repositories import SessionRepository
            _sess_repo = SessionRepository()
            # In-memory MissionContext is the source of truth during the run.
            hosts_n = len(getattr(self.ctx, "hosts", {}) or {})
            ports_n = 0
            for h in (getattr(self.ctx, "hosts", {}) or {}).values():
                for p in getattr(h, "ports", []) or []:
                    if (getattr(p, "state", "") or "").lower() == "open":
                        ports_n += 1
            vulns_n = len(getattr(self.ctx, "vulnerabilities", []) or [])
            # exploits_run counts attempts (successful + failed); record_exploit_attempt
            # appends to attack_graph edges, so fall back to len() of exploit edges
            # if no explicit list is kept.
            try:
                exp_n = sum(
                    1 for e in self.ctx.attack_graph.edges
                    if getattr(e, "edge_type", "") == "exploit_attempt"
                )
            except Exception:
                exp_n = 0
            await _sess_repo.update_stats(
                session_id=self.session_id,
                hosts_found=hosts_n,
                ports_found=ports_n,
                vulns_found=vulns_n,
                exploits_run=exp_n,
            )
        except Exception as _e:
            logger.debug("update_stats failed: %s", _e)

    async def _integrate_finding_from_bus(self, payload: dict) -> None:
        """Best-effort automatic context integration for child-agent findings."""
        finding_type = str(self._finding_value(payload, "finding_type", "type", default="")).lower().strip()
        if not finding_type:
            return

        # Persist to normalized DB tables in real-time (parallel, best-effort)
        asyncio.ensure_future(self._db_persist_finding(payload, finding_type))

        if finding_type == "subdomain":
            subdomain = str(self._finding_value(payload, "subdomain", "domain", default="")).strip()
            if subdomain:
                await self.ctx.add_subdomain(subdomain)
            return

        if finding_type == "email":
            email = str(self._finding_value(payload, "email", default="")).strip()
            if email:
                await self.ctx.add_email(email)
            return

        if finding_type in ("host", "host_discovered"):
            ip = str(self._finding_value(payload, "ip", "host_ip", "host", "target_ip", default="")).strip()
            if not ip:
                return
            ports: list[PortInfo] = []
            for p in (self._finding_value(payload, "ports", default=[]) or []):
                if not isinstance(p, dict):
                    continue
                try:
                    number = int(p.get("number", p.get("port", p.get("portid", 0))))
                except Exception:
                    continue
                if number <= 0:
                    continue
                state = str(p.get("state", "open") or "open").lower()
                if state and state != "open":
                    continue
                ports.append(PortInfo(
                    number=number,
                    state="open",
                    service=str(p.get("service", p.get("name", "")) or ""),
                    version=str(p.get("version", "") or ""),
                ))

            os_raw = self._finding_value(payload, "os_type", "os", default="")
            os_type = str(os_raw.get("name", "") if isinstance(os_raw, dict) else (os_raw or ""))
            await self.ctx.update_host(HostInfo(
                ip=ip,
                hostname=str(self._finding_value(payload, "hostname", default="") or ""),
                os_type=os_type,
                ports=ports,
            ))
            return

        if finding_type in ("port_scan", "service_scan"):
            ip = str(self._finding_value(payload, "host", "ip", "host_ip", default="")).strip()
            if not ip:
                return
            ports: list[PortInfo] = []
            for svc in (self._finding_value(payload, "services", default=[]) or []):
                if not isinstance(svc, dict):
                    continue
                try:
                    number = int(svc.get("port", svc.get("number", svc.get("portid", 0))))
                except Exception:
                    continue
                if number <= 0:
                    continue
                ports.append(PortInfo(
                    number=number,
                    state="open",
                    service=str(svc.get("service", svc.get("name", "")) or ""),
                    version=str(svc.get("version", "") or ""),
                ))
            await self.ctx.update_host(HostInfo(ip=ip, ports=ports))
            return

        if finding_type == "os_detection":
            ip = str(self._finding_value(payload, "host", "ip", "host_ip", default="")).strip()
            if not ip:
                return
            os_raw = self._finding_value(payload, "os", default="")
            os_type = str(os_raw.get("name", "") if isinstance(os_raw, dict) else (os_raw or ""))
            await self.ctx.update_host(HostInfo(ip=ip, os_type=os_type))
            return

        if finding_type in ("vulnerability", "vuln", "cve"):
            await self.ctx.add_vulnerability(VulnInfo(
                title=str(self._finding_value(payload, "title", "name", "description", default="Potential vulnerability") or "Potential vulnerability"),
                host_ip=str(self._finding_value(payload, "host_ip", "ip", "host", default="") or ""),
                port=int(self._finding_value(payload, "port", default=0) or 0),
                service=str(self._finding_value(payload, "service", default="") or ""),
                cve_id=str(self._finding_value(payload, "cve_id", "cve", default="") or ""),
                cvss=float(self._finding_value(payload, "cvss_score", "cvss", "score", default=0.0) or 0.0),
                exploit_path=str(self._finding_value(payload, "exploit_path", "module", default="") or ""),
                description=str(self._finding_value(payload, "description", default="") or ""),
            ))
            return

        if finding_type in ("session", "session_opened", "shell_opened"):
            session_raw = self._finding_value(payload, "session_id", "msf_session_id", default="")
            session_id = str(session_raw) if session_raw not in (None, "") else str(uuid.uuid4())
            await self.ctx.add_session(SessionInfo(
                session_id=session_id,
                host_ip=str(self._finding_value(payload, "host_ip", "ip", "host", default=self.ctx.target) or self.ctx.target),
                session_type=str(self._finding_value(payload, "session_type", default="shell") or "shell"),
                privilege_level=int(self._finding_value(payload, "privilege_level", default=0) or 0),
                username=str(self._finding_value(payload, "username", default="") or ""),
            ))
            return

        if finding_type in ("credential", "credential_found"):
            hash_value = str(self._finding_value(payload, "hash", default="") or "")
            cred_type = str(self._finding_value(payload, "credential_type", default=("hash" if hash_value else "plaintext")) or "plaintext")
            await self.ctx.add_credential(HarvestedCredential(
                source_host=str(self._finding_value(payload, "source_host", "host_ip", "ip", default=self.ctx.target) or self.ctx.target),
                username=str(self._finding_value(payload, "username", default="") or ""),
                password=str(self._finding_value(payload, "password", default="") or ""),
                hash=hash_value,
                credential_type=cred_type,
                service=str(self._finding_value(payload, "service", default="") or ""),
            ))
            return

        if finding_type in ("flag", "loot", "file_found"):
            loot_type = "flag" if finding_type == "flag" else ("file" if finding_type == "file_found" else "data")
            await self.ctx.add_loot(LootItem(
                source_host=str(self._finding_value(payload, "host_ip", "ip", "host", default=self.ctx.target) or self.ctx.target),
                loot_type=loot_type,
                description=str(self._finding_value(payload, "description", "path", default=finding_type) or finding_type),
                file_path=str(self._finding_value(payload, "path", "file_path", default="") or ""),
                content=str(self._finding_value(payload, "content", default="") or ""),
            ))
            return

        if finding_type == "lateral_edge":
            from_ip = str(self._finding_value(payload, "from_ip", "source_ip", default="") or "")
            to_ip = str(self._finding_value(payload, "to_ip", "host_ip", "ip", default="") or "")
            if from_ip and to_ip:
                await self.ctx.add_lateral_edge(
                    from_ip,
                    to_ip,
                    str(self._finding_value(payload, "description", default="") or ""),
                )
            return

        if finding_type in ("exploit_attempt", "exploit_failed", "exploit_run"):
            host_ip = str(self._finding_value(payload, "host_ip", "ip", "target_ip", "host", default="") or "")
            module = str(self._finding_value(payload, "module", default="") or "")
            try:
                port_val = int(self._finding_value(payload, "port", "target_port", default=0) or 0)
            except (TypeError, ValueError):
                port_val = 0
            success_flag = self._finding_value(payload, "success", default=None)
            success = bool(success_flag) if success_flag is not None else False

            # Track failed attempts to prevent infinite retries by the LLM
            if not success and module and host_ip:
                _key = f"{module}|{host_ip}"
                self._exploit_failure_counts[_key] = self._exploit_failure_counts.get(_key, 0) + 1
                if self._exploit_failure_counts[_key] == self._max_exploit_retries_per_module:
                    self.emit_event("exploit_retry_limit_reached", {
                        "module": module, "host_ip": host_ip,
                        "count": self._exploit_failure_counts[_key],
                    })

            await self.ctx.record_exploit_attempt(
                agent_id=str(payload.get("agent_id", "") or ""),
                host_ip=host_ip,
                port=port_val or None,
                module=module,
                success=success,
                error=str(self._finding_value(payload, "error", default="") or ""),
            )
            return

    # ── ask_operator ──────────────────────────────────────────────────────────

    async def _ask_operator(self, params: dict) -> dict:
        """
        Pause and ask the human operator a question.

        In v2_auto mode there is no human watching the queue, so this used to
        burn 30-300s blocking on a reply that never comes (test6: 60s wasted).
        Now we short-circuit auto-mode runs and tell the brain "this tool is
        not available — keep working with what you already know."

        Operators that want interactivity can re-enable it via app_settings.
        """
        question = params.get("question", "")
        timeout = float(params.get("timeout", 300))

        # Skip the wait in non-interactive modes unless explicitly enabled.
        mode = str(getattr(self.ctx, "mode", "") or "").lower()
        is_auto = mode in ("v2_auto", "full_auto", "auto")
        allow_ask = True
        if is_auto:
            try:
                from database import db as _db
                allow_ask = bool(await _db.get_setting("allow_ask_operator_in_auto", False))
            except Exception:
                allow_ask = False

        if is_auto and not allow_ask:
            self.emit_event("ask_operator_skipped", {
                "question": question[:200],
                "reason": "auto_mode_no_listener",
            })
            return {
                "success": True,
                "status": "no_operator",
                "answer": "",
                "hint": (
                    "ask_operator is disabled in auto mode (no human listener). "
                    "Proceed using the information you already have: scan results "
                    "in MISSION STATE, EXPLOIT_KB, and your own reasoning. If you "
                    "really need data, spawn the agent that would obtain it."
                ),
                "error": None,
            }

        self.emit_event("ask_operator", {
            "question": question,
            "agent_id": self.agent_id,
        })
        self._state = AgentState.WAITING_FOR_OPERATOR

        # Brain waits for OPERATOR_REPLY on its own queue
        msg = await self.bus.receive(self.agent_id, timeout=timeout)
        if msg and msg.msg_type == MessageType.OPERATOR_REPLY:
            return {"success": True, "status": "answered", "answer": msg.payload.get("answer", ""), "error": None}
        return {"success": True, "status": "timeout", "answer": "", "error": None}

    # ── Pause / Resume propagation to child agents ─────────────────────────────

    def pause(self) -> None:
        """Pause Brain and all running child agents."""
        super().pause()
        for aid, child in self._child_agents.items():
            task = self._child_tasks.get(aid)
            if task and not task.done():
                child.pause()
                logger.info("BrainAgent: paused child %s", aid)

    def resume(self) -> None:
        """Resume Brain and all paused child agents."""
        super().resume()
        for aid, child in self._child_agents.items():
            task = self._child_tasks.get(aid)
            if task and not task.done():
                child.resume()
                logger.info("BrainAgent: resumed child %s", aid)

    # ── Bus event handler ─────────────────────────────────────────────────────

    async def _on_bus_message(self, msg: AgentMessage) -> None:
        """
        React to bus events from specialized agents.
        FINDING messages are accumulated for the next Brain iteration.
        """
        if msg.msg_type == MessageType.FINDING:
            # Queue finding for integration into next Brain iteration
            payload = msg.payload if isinstance(msg.payload, dict) else {}
            finding_type = payload.get("finding_type") or payload.get("type", "?")
            dbg.bus_finding(msg.sender_id, finding_type,
                            str(payload.get("data", payload))[:200])

            # Keep findings in the Brain result list, but avoid re-emitting
            # another "finding" UI event (specialized agents already emitted it).
            self._findings.append(payload)

            # Integrate into canonical MissionContext immediately.
            try:
                await self._integrate_finding_from_bus(payload)
            except Exception as exc:
                logger.debug("BrainAgent: finding integration failed: %s", exc)

            # Track shell sessions and broadcast to UI
            if finding_type in ("session", "session_opened", "shell_opened"):
                await self._register_shell(payload)
                # Cancel other exploit agents for the same target — one shell is enough.
                # Exploit agents running reverse/bind handlers will otherwise hang until timeout.
                #
                # test5 forensics: without bus.send(AGENT_ERROR) for cancelled
                # agents, brain's wait_for_agents stayed stuck because
                # wait_for_agent_done(aid) waits on a future that was never
                # resolved. The orphaned futures blocked the early-return
                # condition (done_so_far >= wait_count_target) for the full
                # 3600s default timeout. ALWAYS bus.send when cancelling.
                if not self._mission_done:
                    _pd = payload.get("data") if isinstance(payload.get("data"), dict) else {}
                    host_ip_for_cancel = payload.get("host_ip") or _pd.get("host_ip", "")
                    for aid, task in list(self._child_tasks.items()):
                        if task.done():
                            continue
                        atype = self._active_agents.get(aid, "")
                        atgt  = self._active_agent_targets.get(aid, "")
                        if atype == "exploit" and atgt == host_ip_for_cancel:
                            task.cancel()
                            self.emit_event("agent_killed", {
                                "agent_id": aid,
                                "reason": "shell_already_opened",
                            })
                            # Unblock anyone waiting on this agent_id.
                            try:
                                await self.bus.send(AgentMessage(
                                    msg_type=MessageType.AGENT_ERROR,
                                    sender_id=aid,
                                    payload={
                                        "agent_id": aid,
                                        "agent_type": atype,
                                        "status": "cancelled",
                                        "findings": [],
                                        "iterations": 0,
                                        "error": "cancelled: shell_already_opened",
                                    },
                                ))
                            except Exception as _e:
                                logger.debug("bus.send(cancelled) failed for %s: %s", aid, _e)
                            try:
                                await _agent_instance_repo.update_status(
                                    agent_id=aid, status="cancelled"
                                )
                            except Exception as _e:
                                logger.debug("Failed to mark agent %s cancelled: %s", aid, _e)

                # Reactively spawn a post_exploit agent if mission is still in progress.
                # This runs even while Brain is blocked in wait_for_agents, so the shell
                # doesn't sit idle waiting for the whole batch to finish.
                #
                # IMPORTANT: only spawn when there's actually a free semaphore
                # slot. The shell-cancel branch above already freed several by
                # cancelling sibling exploits; if it didn't, spawning here just
                # queues a post_exploit agent behind a saturated cap, which is
                # what caused the test5 freeze pattern in the first place.
                if not self._mission_done and self.ctx.allow_post_exploitation:
                    _nested = payload.get("data") if isinstance(payload.get("data"), dict) else {}
                    host_ip = payload.get("host_ip") or _nested.get("host_ip", "")
                    # Only spawn if no post_exploit agent is already active for this target
                    already_running = any(
                        atype == "post_exploit" and tgt == host_ip
                        for atype, tgt in zip(
                            self._active_agents.values(),
                            self._active_agent_targets.values(),
                        )
                    )

                    # Skip the auto-spawn when the registered shell is ephemeral
                    # — there's nothing to interact with. test7 wasted 30+
                    # iterations because post_exploit can't reattach to a one-
                    # shot msfconsole session that has already terminated.
                    shell_key_chk = payload.get("shell_key") or _nested.get("shell_key", "")
                    registered = self._active_shells.get(shell_key_chk) or {}
                    is_ephemeral = bool(
                        payload.get("ephemeral")
                        or _nested.get("ephemeral")
                        or registered.get("ephemeral")
                    )
                    if is_ephemeral:
                        self.emit_event("post_exploit_skipped", {
                            "shell_key": shell_key_chk,
                            "host_ip": host_ip,
                            "reason": "ephemeral_shell",
                        })

                    if not already_running and host_ip and not is_ephemeral:
                        shell_key = shell_key_chk
                        obj_str = "; ".join(self.ctx.objectives) if self.ctx.objectives else ""
                        task = f"post_exploitation | objectives: {obj_str}" if obj_str else "post_exploitation"
                        opts: dict = {}
                        if shell_key:
                            opts["shell_key"] = shell_key
                        await self._spawn_agent({
                            "agent_type": "post_exploit",
                            "target": host_ip,
                            "task_type": task,
                            "options": opts,
                        })
                # Also wake any wait_for_agents call sitting on early-return —
                # the shell event is meaningful progress; brain should re-plan
                # immediately even if its batch isn't fully drained.
                # (no-op: the AGENT_ERROR sends above already trigger this via
                #  the polling loop)

            # A flag-shaped finding only terminates the mission when the operator
            # explicitly asked for one. In a normal pentest, it is just another
            # piece of evidence and the remaining vectors must still be exercised.
            if finding_type == "flag" and not self._mission_done and self._objectives_require_flag():
                content = (
                    payload.get("content")
                    or payload.get("data", {}).get("content", "")
                    if isinstance(payload.get("data"), dict)
                    else payload.get("content", "")
                )
                self._mission_done = True
                self._cancel_all_children("flag_found")
                self.memory.add_user(
                    f"[SYSTEM] FLAG CAPTURED by agent {msg.sender_id}: {str(content)[:300]}. "
                    "Operator's flag objective is satisfied. Call mission_done immediately with the flag content in the summary."
                )
                self.emit_event("objective_achieved", {
                    "content": str(content)[:300],
                    "agent_id": msg.sender_id,
                })
                dbg.info(self.agent_id, f"Auto-stop: flag found by {msg.sender_id}")
            else:
                # Surface the flag as a finding but continue exercising every other
                # discovered vulnerability; do NOT kill sibling agents.
                if finding_type == "flag" and not self._mission_done:
                    content_preview = ""
                    raw_data = payload.get("data")
                    if isinstance(raw_data, dict):
                        content_preview = str(raw_data.get("content", ""))[:200]
                    if not content_preview:
                        content_preview = str(payload.get("content", ""))[:200]
                    self.memory.add_user(
                        f"[SYSTEM] Flag-shaped value captured by agent {msg.sender_id}: "
                        f"{content_preview}. Record it as evidence and CONTINUE — "
                        "the mission has no flag objective; finish exploiting every remaining vulnerability."
                    )
                # General objective match check — emit confirmation card + auto-stop if matched
                self._check_objective_match(msg.payload)
        elif msg.msg_type in (MessageType.AGENT_DONE, MessageType.AGENT_ERROR):
            aid = msg.payload.get("agent_id", "")
            status = msg.payload.get("status", "?")
            dbg.bus_agent_done(aid, msg.msg_type, status)
            atype = self._active_agents.pop(aid, "")
            atask = self._active_agent_task_types.pop(aid, "")
            atgt  = self._active_agent_targets.pop(aid, "")
            aopts = self._active_agent_options.pop(aid, {})
            self._child_agents.pop(aid, None)

            # ── Recent-done bookkeeping for the dedup guard ─────────────────
            # On every agent completion (success OR fail), record the dedup
            # key with a timestamp so a 60s re-spawn of the same approach is
            # rejected with "recent_duplicate". Reuses the same normalizer as
            # _spawn_agent so keys match. test7: this would have killed at
            # least 17 of the 35 exploit re-spawns.
            try:
                aport = (aopts or {}).get("port")
                amod  = str((aopts or {}).get("module") or "")
                if not hasattr(self, "_recent_done_keys"):
                    self._recent_done_keys = {}
                def _norm(t: str) -> str:
                    t = re.sub(r"\s*\[(?:ml_success_prob|has_cred)=[^\]]+\]", "", str(t or ""))
                    t = re.sub(r"(?:_v\d+|_retry|_\d+)$", "", t.strip())
                    t = re.sub(r"_\d{1,3}$", "", t)
                    return t.lower()
                key = (atype, atgt, aport, amod, _norm(atask))
                import time as _t
                self._recent_done_keys[key] = (_t.time(), aid, status)
            except Exception as _e:
                logger.debug("recent_done bookkeeping failed: %s", _e)
            # Save successful techniques to the persistent playbook
            if status in ("success", "partial"):
                self._record_playbook_entries(msg.payload)
            # Reflect final agent status in the attack graph
            try:
                await self.ctx.update_agent_status(AgentStatus(
                    agent_id=aid, agent_type=atype or "", status=status,
                ))
            except Exception:
                logger.debug("attack_graph agent-done update failed for %s", aid, exc_info=True)
            self.emit_event("child_agent_done", {
                "agent_id": aid,
                "findings": len(msg.payload.get("findings", [])),
            })

    # ── System prompt ────────────────────────────────────────────────────────

    def _build_system_prompt(self) -> str:
        ctx_summary = self.ctx.to_summary()
        permissions = {
            "allow_exploitation":      self.ctx.allow_exploitation,
            "allow_post_exploitation": self.ctx.allow_post_exploitation,
            "allow_lateral_movement":  self.ctx.allow_lateral_movement,
            "allow_persistence":       self.ctx.allow_persistence,
            "allow_credential_harvest":self.ctx.allow_credential_harvest,
            "allow_data_exfil":        self.ctx.allow_data_exfil,
        }
        # Inject relevant playbook entries based on discovered services
        pb = get_playbook()
        discovered = self._get_discovered_service_strings()
        playbook_section = pb.to_prompt_section(
            services=discovered if discovered else None,
            max_entries=12,
        )
        attack_path_section = self._build_attack_path_section()
        return self._soul.build_brain_prompt(
            ctx_summary=ctx_summary,
            active_agents=self._active_agents,
            permissions=permissions,
            playbook_section=playbook_section,
            discovered_services=discovered or None,
            attack_path_section=attack_path_section,
        )

    def _build_attack_path_section(self) -> str:
        """Ask the ML attack-path model for the next likely TTPs and render a
        short, decision-oriented block for the system prompt. Silent no-op if
        the model isn't trained/loadable.

        Honors two settings (both default True):
          - ml_inject_attack_path  → render TTP suggestions
          - ml_inject_exploit_pred → render per-module success probability
            for the modules linked to currently discovered services.
        """
        # Check settings (best-effort; failures default to enabled to preserve
        # existing behavior).
        ttp_enabled = True
        pred_enabled = True
        try:
            from database import db as _db
            # Both settings are async — we're in a sync function, so use the
            # running loop to fetch them. If no loop is running yet, just
            # fall back to defaults.
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # We're inside an async iteration — schedule and short-block.
                    # But since this function is sync, we can't await. Cache on
                    # the instance every brain iteration via _refresh_ml_flags().
                    ttp_enabled = bool(getattr(self, "_ml_ttp_enabled", True))
                    pred_enabled = bool(getattr(self, "_ml_pred_enabled", True))
            except Exception:
                pass
        except Exception:
            pass

        if not ttp_enabled and not pred_enabled:
            return ""

        try:
            from ml.attack_path import get_attack_path_suggester
        except Exception:
            return ""

        suggester = None
        try:
            suggester = get_attack_path_suggester()
        except Exception:
            return ""

        # Build the input the suggester needs from live MissionContext, not from
        # a DB snapshot — this stays fresh every iteration.
        services: list[str] = []
        platforms: list[str] = []
        host_count = 0
        try:
            for host in self.ctx.hosts.values():
                host_count += 1
                if host.os_type:
                    platforms.append(str(host.os_type).lower())
                for port in host.ports:
                    if (port.state or "").lower() != "open":
                        continue
                    if port.service:
                        services.append(str(port.service).lower())
        except Exception:
            pass

        used_ttps: list[str] = []
        try:
            for vuln in self.ctx.vulnerabilities:
                cls = getattr(vuln, "ml_cls", None) or {}
                if isinstance(cls, dict):
                    used_ttps.extend(cls.get("mitre_ttps", []) or [])
        except Exception:
            pass

        has_shell = bool(getattr(self.ctx, "active_sessions", []) or [])
        phase = (getattr(self.ctx, "phase", "scanning") or "scanning").lower()
        if phase in ("osint", "recon", "reconnaissance"):
            phase_key = "reconnaissance"
        elif phase in ("scan", "scanning", "port_scan"):
            phase_key = "scanning"
        elif phase in ("exploit", "exploitation"):
            phase_key = "exploitation"
        elif phase in ("post_exploit", "post_exploitation"):
            phase_key = "post_exploitation"
        elif phase in ("lateral", "lateral_movement"):
            phase_key = "lateral_movement"
        else:
            phase_key = phase or "exploitation"

        suggestions = []
        if ttp_enabled:
            try:
                if suggester is not None and suggester.is_built:
                    suggestions = suggester.suggest(
                        current_phase=phase_key,
                        services=list({s for s in services if s}),
                        used_ttps=list({t for t in used_ttps if t}),
                        top_n=6,
                        host_count=max(host_count, 1),
                        has_shell=has_shell,
                        platforms=list({p for p in platforms if p}),
                    )
                    model_label = "ml.attack_path"
                else:
                    from ml.attack_path import _fallback_suggestions
                    suggestions = _fallback_suggestions(
                        phase_key, 6, max(host_count, 1), has_shell,
                        list({p for p in platforms if p}),
                    )
                    model_label = "ml.attack_path (heuristic fallback)"
            except Exception as exc:
                logger.debug("attack_path suggest failed: %s", exc)
                suggestions = []
                model_label = ""

        # ── Per-service module success-probability table ──────────────────────
        # The TTP list is high-level (MITRE technique names). To turn it into
        # actionable signal, ask the exploit predictor for top modules per
        # discovered service. This is what the LLM actually needs when it
        # chooses spawn_agent params.
        module_lines: list[str] = []
        if pred_enabled:
            try:
                from ml.exploit_predictor import get_exploit_predictor
                _pred = get_exploit_predictor()
                if _pred is not None and services:
                    # Curated svc → candidate module pool. Kept short so the
                    # prompt stays compact; the LLM can still ask for others.
                    svc_modules = {
                        "ftp":         ["exploit/unix/ftp/vsftpd_234_backdoor", "exploit/windows/ftp/ms09_053_ftpd_nlst"],
                        "ssh":         ["auxiliary/scanner/ssh/ssh_login", "exploit/multi/ssh/sshexec"],
                        "telnet":      ["auxiliary/scanner/telnet/telnet_login"],
                        "smb":         ["exploit/windows/smb/ms17_010_eternalblue", "exploit/multi/samba/usermap_script", "auxiliary/scanner/smb/smb_login"],
                        "netbios-ssn": ["exploit/multi/samba/usermap_script", "auxiliary/scanner/smb/smb_login"],
                        "smtp":        ["auxiliary/scanner/smtp/smtp_enum"],
                        "http":        ["exploit/multi/http/struts2_content_type_ognl", "exploit/multi/http/tomcat_mgr_upload"],
                        "ajp13":       ["auxiliary/admin/http/tomcat_ghostcat"],
                        "mysql":       ["auxiliary/scanner/mysql/mysql_login", "exploit/multi/mysql/mysql_udf_payload"],
                        "postgresql":  ["auxiliary/scanner/postgres/postgres_login", "exploit/linux/postgres/postgres_payload"],
                        "vnc":         ["auxiliary/scanner/vnc/vnc_login", "auxiliary/scanner/vnc/vnc_none_auth"],
                        "irc":         ["exploit/unix/irc/unreal_ircd_3281_backdoor"],
                        "drb":         ["exploit/linux/misc/drb_remote_codeexec"],
                        "distccd":     ["exploit/unix/misc/distcc_exec"],
                        "java-rmi":    ["exploit/multi/misc/java_rmi_server"],
                        "rsh":         ["auxiliary/scanner/rservices/rsh_login"],
                        "nfs":         ["auxiliary/scanner/nfs/nfsmount"],
                    }
                    seen_svc = set()
                    scored: list[tuple[float, str, str]] = []  # (prob, svc, module)
                    for svc in services:
                        svc_key = next((k for k in svc_modules if k in svc), None)
                        if not svc_key or svc_key in seen_svc:
                            continue
                        seen_svc.add(svc_key)
                        for mod in svc_modules[svc_key]:
                            try:
                                p = float(_pred.predict_proba(
                                    description=mod,
                                    exploit_type="remote",
                                    platform=("linux" if "linux" in platforms else
                                              "windows" if "windows" in platforms else ""),
                                    has_msf_module=1,
                                ))
                                scored.append((p, svc_key, mod))
                            except Exception:
                                pass
                    scored.sort(key=lambda t: -t[0])
                    for p, svc, mod in scored[:10]:
                        bar = "█" * int(p * 10)
                        module_lines.append(f"  P={p:.2f} {bar:<10} {svc:<12} {mod}")
            except Exception as exc:
                logger.debug("exploit pred table failed: %s", exc)

        # Bail out when nothing useful is available.
        if not suggestions and not module_lines:
            return ""

        lines: list[str] = []
        if suggestions:
            lines.extend([
                "## NEXT-STEP TTP SUGGESTIONS",
                f"(advisory only — source: {model_label}; phase={phase_key}, services={len(services)},",
                f" used_ttps={len(used_ttps)}, has_shell={has_shell})",
                "",
            ])
            for s in suggestions:
                sd = s.to_dict() if hasattr(s, "to_dict") else s
                lines.append(
                    f"  {sd.get('ttp_id','?'):<10} {sd.get('tactic','?'):<22} "
                    f"conf={sd.get('confidence', 0):.2f}  {sd.get('ttp_name','?')}"
                )
            lines.append("")
            lines.append("Use these as a CHECKLIST of attacker techniques to consider — they do")
            lines.append("not replace your own reasoning. Skip any that don't fit the actual scan")
            lines.append("findings, and pursue concrete CVEs from EXPLOIT_KB first.")

        if module_lines:
            if lines:
                lines.append("")
            lines.append("## ML EXPLOIT SUCCESS RANKING (per discovered service)")
            lines.append("(P = pre-attack success probability from ml.exploit_predictor;")
            lines.append(" use this to PRIORITIZE which spawn_agent calls to make first.")
            lines.append(" Each spawned exploit also receives its own [ml_success_prob=X.YY] tag.)")
            lines.append("")
            lines.extend(module_lines)
        return "\n".join(lines)

    def _get_discovered_service_strings(self) -> list[str]:
        """Extract 'service version' strings from mission context for playbook lookup."""
        services = []
        try:
            for host in self.ctx.hosts.values():
                for port in host.ports:
                    svc = port.service or ""
                    ver = port.version or ""
                    if svc:
                        services.append(f"{svc} {ver}".strip())
        except Exception:
            pass
        return services

    # ── Shell session tracking ────────────────────────────────────────────────

    async def _is_msf_session_alive(self, session_id: int) -> bool:
        """Verify an MSF session ID is still alive in the backend."""
        try:
            from web.app_state import tool_registry as _tr
            msf_tool = _tr.get("metasploit_run")
        except Exception:
            msf_tool = None

        if msf_tool is None:
            return False

        try:
            result = await msf_tool.execute({"action": "sessions"})
        except Exception:
            return False

        if not result.get("success"):
            return False

        output = result.get("output") or {}
        sessions = output.get("sessions") or {}
        return str(session_id) in {str(k) for k in sessions.keys()}

    async def _verify_shell_alive(self, shell: dict) -> bool:
        if shell.get("status") != "active":
            return False

        msf_sid = shell.get("msf_session_id")
        if msf_sid is None:
            return True

        try:
            sid = int(msf_sid)
        except (TypeError, ValueError):
            return False
        return await self._is_msf_session_alive(sid)

    async def _register_shell(self, finding: dict) -> None:
        """Called when a child agent reports a shell/session opened.

        Marks the shell as ``ephemeral=True`` when MSF is in non-persistent
        msfconsole mode. test7 forensics: brain spawned 3 post_exploit agents
        thinking the shell was live, but each msfconsole subprocess had
        already exited and the session was gone. shell_exec(action=list)
        returned 0 sessions every time, post_ex spent 30+ iterations guessing
        shell_keys, then gave up. By exposing the ephemeral flag, brain can
        skip post_exploit spawn entirely and rely on the post_commands output
        already captured during the original exploit call.
        """
        import uuid as _uuid
        data = finding.get("data", finding)
        msf_sid = data.get("msf_session_id") or data.get("session_id", "")
        # Normalise msf_session_id: strip "msf-" prefix if present
        if str(msf_sid).startswith("msf-"):
            msf_sid = str(msf_sid)[4:]
        try:
            msf_sid = int(msf_sid) if msf_sid not in ("", None) else None
        except (ValueError, TypeError):
            msf_sid = None

        # Detect MSF persistence mode ONCE; reused for both the alive check
        # and the ephemeral flag below.
        msf_persistent = False
        try:
            from web.app_state import tool_registry as _tr
            _msf = _tr.get("metasploit_run")
            if _msf is not None:
                if getattr(_msf, "_client", None) is not None:
                    msf_persistent = True
                else:
                    try:
                        from config import settings as _settings
                        msf_persistent = bool(getattr(_settings.msf, "persistent_console", False))
                    except Exception:
                        pass
        except Exception:
            pass

        # Use msf-{id} as the canonical key so shell_io events from base_agent match
        if msf_sid is not None:
            # Only run the alive check when MSF is actually persistent;
            # otherwise we'd reject every single one-shot session.
            if msf_persistent:
                alive = await self._is_msf_session_alive(msf_sid)
                if not alive:
                    dbg.warn(self.agent_id, f"MSF session {msf_sid} is not alive; shell not registered")
                    return
            shell_key = f"msf-{msf_sid}"
        else:
            shell_key = data.get("shell_key") or f"shell-{_uuid.uuid4().hex[:8]}"
        host_ip = data.get("host_ip", self.ctx.target)
        session_type = data.get("session_type", "shell")
        module = data.get("module", "")
        dedup_key = f"{host_ip}|{msf_sid if msf_sid is not None else shell_key}|{module}"

        # Ephemeral when MSF subprocess is one-shot (session won't survive a
        # follow-up shell_exec/list/connect call). post_exploit auto-spawn
        # checks this flag and skips.
        # Raw bind shells (e.g. ingreslock 1524, vsftpd backdoor 6200) are
        # also ephemeral until a persistent re-connect tool exists.
        ephemeral = (msf_sid is not None and not msf_persistent) or (
            msf_sid is None and session_type in ("shell", "bind", "raw")
        )

        existing = self._active_shells.get(shell_key)
        if existing and existing.get("status") == "active":
            self.emit_event("shell_duplicate_ignored", {
                "shell_key": shell_key,
                "host_ip": host_ip,
                "reason": "already_active",
            })
            return

        if dedup_key in self._shell_dedup_keys:
            self.emit_event("shell_duplicate_ignored", {
                "shell_key": shell_key,
                "host_ip": host_ip,
                "reason": "duplicate_finding",
            })
            return

        active_for_host = [
            shell for shell in self._active_shells.values()
            if shell.get("host_ip") == host_ip and shell.get("status") == "active"
        ]
        if len(active_for_host) >= self._MAX_ACTIVE_SHELLS_PER_HOST:
            self.emit_event("shell_duplicate_ignored", {
                "shell_key": shell_key,
                "host_ip": host_ip,
                "reason": "host_shell_limit",
                "limit": self._MAX_ACTIVE_SHELLS_PER_HOST,
            })
            return

        self._active_shells[shell_key] = {
            "shell_key": shell_key,
            "host_ip": host_ip,
            "session_type": session_type,
            "msf_session_id": msf_sid,
            "module": module,
            "dedup_key": dedup_key,
            "status": "active",
            "ephemeral": ephemeral,
        }
        self._shell_dedup_keys.add(dedup_key)

        # Broadcast to UI so the Shell Panel shows the new shell
        self.emit_event("shell_open", {
            "shell_key": shell_key,
            "host_ip": host_ip,
            "session_type": session_type,
            "module": module,
            "msf_session_id": msf_sid,
            "ephemeral": ephemeral,
        })
        dbg.info(
            self.agent_id,
            f"Shell registered: {shell_key} @ {host_ip} "
            f"(msf={msf_sid}, ephemeral={ephemeral})",
        )

        # If the shell is ephemeral, push a hint into Brain's memory so the next
        # iteration sees "don't spawn post_exploit — use the post_commands
        # output you already have." This prevents the test7 failure where
        # post_exploit agents spent 10+ iterations guessing a dead shell_key.
        if ephemeral and not self._mission_done:
            self.memory.add_user(
                f"[SYSTEM] Shell {shell_key} on {host_ip} (module={module}) is EPHEMERAL "
                "(one-shot msfconsole — session already terminated). DO NOT spawn a "
                "post_exploit agent for it; the post_commands output captured during "
                "the original metasploit_run IS the post-ex evidence. Treat this as "
                "a 'proof-of-impact' shell, record the finding, and move to other "
                "vectors. Run a follow-up exploit with richer post_commands if you "
                "need more recon from this host."
            )

    def _mark_shell_closed(self, shell_key: str, reason: str = "connection lost") -> None:
        """Mark a shell as closed and broadcast to UI."""
        shell = self._active_shells.get(shell_key)
        if shell and shell["status"] == "active":
            dedup_key = shell.get("dedup_key")
            if dedup_key:
                self._shell_dedup_keys.discard(dedup_key)
            shell["status"] = "closed"
            self.emit_event("shell_closed", {
                "shell_key": shell_key,
                "host_ip": shell.get("host_ip", ""),
                "reason": reason,
            })
            dbg.info(self.agent_id, f"Shell closed: {shell_key} ({reason})")
        self._active_shells.pop(shell_key, None)

    async def _pick_live_shell_for_target(self, target: str) -> dict | None:
        preferred = [
            shell for shell in self._active_shells.values()
            if shell.get("host_ip") == target and shell.get("status") == "active"
        ]
        fallback = [
            shell for shell in self._active_shells.values()
            if shell.get("status") == "active"
        ]

        for shell in preferred + fallback:
            if await self._verify_shell_alive(shell):
                return shell
            self._mark_shell_closed(shell.get("shell_key", ""), "dead before post_exploit")
        return None

    async def exec_on_shell(self, shell_key: str, command: str) -> dict:
        """Execute a command on an active shell session (called by the UI)."""
        shell = self._active_shells.get(shell_key)
        if not shell:
            return {"success": False, "output": None, "error": f"Unknown shell: {shell_key}"}
        if shell["status"] != "active":
            return {"success": False, "output": None, "error": f"Shell {shell_key} is {shell['status']}"}

        # Broadcast the command to UI first so it appears immediately
        self.emit_event("shell_io", {
            "shell_key": shell_key,
            "direction": "input",
            "data": command,
        })

        msf_sid = shell.get("msf_session_id")
        if msf_sid is None:
            return {"success": False, "output": None, "error": "No MSF session ID; cannot exec"}

        try:
            from web.app_state import tool_registry as _tr
            msf_tool = _tr.get("metasploit_run")
        except Exception:
            msf_tool = None

        if msf_tool is None:
            return {"success": False, "output": None, "error": "MetasploitTool not available"}

        result = await msf_tool.execute({
            "action": "session_exec",
            "session_id": msf_sid,
            "command": command,
            "timeout": 30,
        })
        output_payload = result.get("output")
        if isinstance(output_payload, dict):
            output = output_payload.get("result") or output_payload.get("output") or ""
        else:
            output = output_payload or ""

        # Detect closed/lost session
        err_str = str(result.get("error") or "").lower()
        if not result.get("success") and any(
            kw in err_str for kw in ("not found", "closed", "disconnected", "no session", "dead")
        ):
            self._mark_shell_closed(shell_key, reason=err_str[:80])
            return {"success": False, "output": None, "error": f"Shell closed: {err_str}"}

        # Broadcast output to UI
        self.emit_event("shell_io", {
            "shell_key": shell_key,
            "direction": "output",
            "data": output,
        })

        if not result.get("success"):
            return {"success": False, "output": None, "error": str(result.get("error") or "exec failed")}
        return {"success": True, "output": str(output), "error": None}

    def list_shells(self) -> list[dict]:
        """Return all tracked shell sessions."""
        return list(self._active_shells.values())

    def _check_objective_match(self, finding: dict) -> bool:
        """If a finding satisfies an objective, emit confirmation and auto-stop.

        Shell openings are infrastructure — skip them.
        Concrete results (file content, loot, flags, credentials) trigger auto-stop.

        Returns True if an objective match was found (and mission was stopped).
        """
        if not self.ctx.objectives:
            return False
        data = finding.get("data", finding)
        if not isinstance(data, dict):
            data = {}
        finding_type = finding.get("type", finding.get("finding_type", ""))

        # Skip shell/session openings — steps toward the objective, not the objective itself
        if finding_type in ("session", "session_opened", "shell_opened"):
            return False

        # Build a short summary of what was found
        summary = ""
        if finding_type in ("loot", "flag", "credential", "credential_found"):
            summary = str(data.get("content") or data.get("value") or data.get("data") or finding)[:300]
        elif finding_type == "file_found":
            summary = f"File: {data.get('path','?')} — {str(data.get('content',''))[:200]}"

        if not summary:
            return False

        # Check if any objective keyword appears in the finding
        summary_lower = summary.lower()
        _STOP = {"find", "search", "get", "read", "show", "list", "dump", "look",
                 "check", "scan", "fetch", "locate", "grab", "inside", "open", "view",
                 "all", "any", "the", "and", "from", "with", "every"}
        for obj in self.ctx.objectives:
            obj_lower = obj.lower()
            keywords = [w for w in obj_lower.split() if len(w) > 3 and w not in _STOP]
            if not keywords:
                continue
            # Require ALL salient objective keywords (>=2) to appear — a single
            # generic word like "shell" or "system" must not auto-stop a mission.
            if len(keywords) >= 2:
                if not all(kw in summary_lower for kw in keywords):
                    continue
            else:
                if keywords[0] not in summary_lower:
                    continue
            self.emit_event("finding_confirm", {
                "summary": summary,
                "finding_type": finding_type,
                "objective": obj,
                "timeout_seconds": 30,
            })
            # Auto-stop: objective achieved
            if not self._mission_done:
                self._mission_done = True
                self._cancel_all_children("objective_achieved")
                self.memory.add_user(
                    f"[SYSTEM] Objective '{obj}' achieved: {summary[:200]}. "
                    "Call mission_done immediately."
                )
                dbg.info(self.agent_id, f"Objective matched: {obj!r}")
            return True
        return False

    def _record_playbook_entries(self, payload: dict) -> None:
        """
        Extract successful technique info from agent completion payload
        and persist to the playbook for future sessions.
        """
        pb = get_playbook()
        findings: list[dict] = payload.get("findings", [])
        agent_type = payload.get("agent_type", "")

        for finding in findings:
            ftype = finding.get("type", finding.get("finding_type", ""))

            # Shell opened
            if ftype in ("session_opened", "shell_opened", "session"):
                data = finding.get("data", finding)
                module = data.get("module", "")
                # Derive service from module path (e.g. exploit/unix/ftp/vsftpd_234_backdoor → vsftpd)
                # Fall back to explicit service field, then skip generic agent_type labels
                service = data.get("service", "")
                if not service and module:
                    last_part = module.split("/")[-1]  # e.g. "vsftpd_234_backdoor"
                    service = last_part.split("_")[0]  # e.g. "vsftpd"
                if not service:
                    service = ""  # don't store meaningless "exploit" label
                version = data.get("version", "")
                if service or module:  # skip entries with no useful info
                    pb.record(
                        service=service,
                        version=version,
                        technique=module or data.get("technique", ""),
                        result="shell",
                        cve=data.get("cve", ""),
                        module=module,
                        payload=data.get("payload", ""),
                        options=data.get("options", {}),
                        notes=data.get("notes", data.get("shell_output", "")[:120]),
                        session_id=self.session_id,
                    )
                    dbg.info(self.agent_id,
                             f"Playbook saved: shell via {module or service} {version}")

            # Credential harvested
            elif ftype in ("credential_found", "credential"):
                data = finding.get("data", finding)
                service = data.get("service", "")
                version = data.get("version", "")
                if service:
                    pb.record(
                        service=service,
                        version=version,
                        technique=data.get("method", "credential_harvest"),
                        result="credential",
                        notes=f"user={data.get('username','')} via {data.get('method','')}",
                        session_id=self.session_id,
                    )

    # ── LoRA training data capture ────────────────────────────────────────────

    async def reflect(self) -> None:
        """
        Post-iteration hook: save this Brain iteration to the training corpus.

        Called by BaseAgent.run() after every act/observe cycle.
        Only writes if we have a captured action from this iteration.
        """
        if not self._last_action or not self._last_messages:
            return
        try:
            _get_training_collector().record(
                session_id=self.session_id,
                iteration=self._iteration,
                messages=self._last_messages,
                action_dict=self._last_action,
                result=self._last_result,
                agent_type="brain",
            )
        except Exception as exc:
            logger.debug("training_data.record failed: %s", exc)
        finally:
            # Reset so a missed act() doesn't re-emit stale data
            self._last_action = {}
            self._last_result = {}

    # ── Handle terminal action ────────────────────────────────────────────────

    async def handle_terminal_action(self, action_dict: dict) -> bool:
        """mission_done (or legacy 'done') signals the end of the Brain loop."""
        tool = action_dict.get("action") or action_dict.get("tool", "")
        return tool in ("mission_done", "done") or self._mission_done

    # ── on_run_end ────────────────────────────────────────────────────────────

    async def on_run_end(self, final_state=None) -> None:
        """Cancel all running child agents on Brain exit."""
        self._cancel_all_children("brain_run_end")
        pending = [task for task in self._child_tasks.values() if not task.done()]
        if pending:
            with contextlib.suppress(Exception):
                await asyncio.wait(pending, timeout=2.0)
        self._child_tasks.clear()
        self._child_agents.clear()
        self._active_agents.clear()
        self._active_agent_task_types.clear()
        self._active_agent_targets.clear()
        self.bus.unregister_agent(self.agent_id)


# ── Factory helper ────────────────────────────────────────────────────────────

def make_brain(
    *,
    target: str,
    session_id: str,
    mission_brief,          # MissionBrief (avoid circular import — typed as Any)
    mission_ctx,            # MissionContext
    message_bus,            # AgentMessageBus
    tool_registry=None,
    safety=None,
    progress_callback=None,
    audit_repo=None,
    max_iterations: int = 100,
    agent_models: dict | None = None,
) -> "BrainAgent":
    """
    Convenience factory for creating a BrainAgent with all required deps.

    Used by web/routes.py start_session (mode=v2_auto).
    """
    normalized_agent_models = normalize_agent_models(agent_models or {})

    # Apply brain's own model override if configured
    brain_llm = None
    if normalized_agent_models.get("brain"):
        cfg = normalized_agent_models["brain"]
        if cfg.get("provider") or cfg.get("model"):
            from core.llm_client import make_agent_llm
            brain_llm = make_agent_llm(cfg.get("provider", ""), cfg.get("model", ""))

    return BrainAgent(
        mission_context=mission_ctx,
        message_bus=message_bus,
        agent_type="brain",
        mission_id=session_id,
        session_id=session_id,
        tool_registry=tool_registry,
        safety=safety,
        llm=brain_llm,
        progress_callback=progress_callback,
        audit_repo=audit_repo,
        max_iterations=max_iterations,
        agent_models=normalized_agent_models,
        # Brain needs more memory than child agents — it coordinates the
        # entire mission and must retain findings, agent results, and
        # strategic context across many iterations.
        memory_max_messages=120,
        memory_max_tokens=16384,
    )
