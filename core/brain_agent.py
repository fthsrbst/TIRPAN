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
import importlib
import json
import logging
import uuid
from typing import Any

from core.base_agent import AgentResult, AgentState, BaseAgent
from core.message_bus import AgentMessage, AgentMessageBus, MessageType
from core.soul_loader import SoulLoader
import core.debug_logger as dbg
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

    _soul = SoulLoader()

    def __init__(
        self,
        *,
        mission_context: MissionContext,
        message_bus: AgentMessageBus,
        # Optional dict of agent-type → constructor kwargs overrides
        agent_constructor_kwargs: dict[str, dict] | None = None,
        **base_kwargs,
    ):
        # Force agent_type = "brain"
        base_kwargs.setdefault("agent_type", "brain")
        super().__init__(**base_kwargs)

        self.ctx = mission_context
        self.bus = message_bus
        self._agent_ctor_kwargs = agent_constructor_kwargs or {}

        # Track spawned child agents: agent_id → asyncio.Task
        self._child_tasks: dict[str, asyncio.Task] = {}
        # Track active agents for system prompt injection: agent_id → agent_type
        self._active_agents: dict[str, str] = {}
        # Track child agent instances for pause/resume propagation: agent_id → BaseAgent
        self._child_agents: dict[str, BaseAgent] = {}
        # Cache of pending operator questions: correlation_id → Future
        self._operator_futures: dict[str, asyncio.Future] = {}
        # Set to True when mission_done meta-tool is called
        self._mission_done: bool = False

        # Subscribe to bus events so Brain can react to findings
        self.bus.register_agent(self.agent_id)
        self.bus.subscribe_global(self._on_bus_message)

    # ── BaseAgent abstract implementations ───────────────────────────────────

    def get_available_tools(self) -> list[str]:
        return self._META_TOOLS

    def build_messages(self) -> list[dict]:
        system = self._build_system_prompt()
        msgs: list[dict] = [{"role": "system", "content": system}]
        if not self.memory._messages:
            # First iteration — LLMs require at least one user message
            msgs.append({"role": "user", "content":
                f"Mission target: {self.ctx.target}. Begin the engagement now. "
                f"Spawn the appropriate first agent."
            })
        else:
            # Use build_context() for proper role mapping (tool_result → user)
            # and token budget enforcement
            msgs.extend(self.memory.build_context())
        return msgs

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
                self.emit_event("phase_changed", {"phase": phase})
        elif tool_name == "mission_done":
            self._mission_done = True

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
            import time as _time
            _t0 = _time.monotonic()
            try:
                result = await self._execute_tool(tool_name, params)
            except Exception as exc:
                self._log.error("Meta-tool '%s' raised: %s", tool_name, exc)
                dbg.tool_fail(self.agent_id, tool_name, str(exc))
                result = {"status": "error", "error": str(exc)}
            _dur = (_time.monotonic() - _t0) * 1000

            success = result.get("status") not in ("error",)
            if success:
                dbg.tool_ok(self.agent_id, tool_name, result, _dur)
            else:
                dbg.tool_fail(self.agent_id, tool_name, result.get("error", ""), _dur)
            self.emit_event("tool_result", {
                "tool": tool_name,
                "success": success,
                "output": result,
                "error": result.get("error"),
            })
            return {"success": success, "output": result, "error": result.get("error")}

        # ── Fallthrough: regular tools via BaseAgent ──────────────────────────
        return await super().act(action_dict)

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
            return {"status": "queued", "params": params}
        if tool_name == "ask_operator":
            return await self._ask_operator(params)
        if tool_name == "set_phase":
            return {"status": "ok", "phase": params.get("phase")}
        if tool_name == "mission_done":
            return {"status": "done", "action": "done"}
        return {"status": "error", "error": f"Unknown meta-tool: {tool_name}"}

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
        options = params.get("options", {})

        if agent_type not in _AGENT_REGISTRY:
            return {
                "status": "error",
                "error": f"Unknown agent_type '{agent_type}'. "
                         f"Available: {list(_AGENT_REGISTRY.keys())}",
            }

        # ── Dedup guard: prevent spawning same agent_type for same target ─────
        for aid, atype in self._active_agents.items():
            if atype == agent_type:
                task = self._child_tasks.get(aid)
                if task and not task.done():
                    return {
                        "status": "already_running",
                        "agent_id": aid,
                        "agent_type": agent_type,
                        "target": target,
                        "hint": f"A {agent_type} agent ({aid}) is already running. "
                                f"Use wait_for_agents(agent_ids: [\"{aid}\"]) to wait for it.",
                    }

        agent_id = f"{agent_type}-{uuid.uuid4().hex[:8]}"
        self.bus.register_agent(agent_id)

        # Build constructor kwargs for the child agent
        child_kwargs = {
            "agent_type":         agent_type,
            "agent_id":           agent_id,
            "mission_id":         self.mission_id,
            "tool_registry":      self._registry,
            "safety":             self._safety,
            "llm":                self._llm,
            "progress_callback":  self._progress_cb,
            "audit_repo":         self._audit_repo,
            "session_id":         self.session_id,
            # V2 additions
            "message_bus":        self.bus,
            "mission_context":    self.ctx,
            "target":             target,
            "task_type":          task_type,
        }
        # Pass options as a single dict — do NOT spread into constructor kwargs
        # (options keys like scan_type, ports etc. are not BaseAgent constructor params)
        child_kwargs["options"] = options
        # Override with any agent-specific kwargs from registry
        child_kwargs.update(self._agent_ctor_kwargs.get(agent_type, {}))

        # Dynamically import and instantiate
        module_path, class_name = _AGENT_REGISTRY[agent_type]
        try:
            mod = importlib.import_module(module_path)
            AgentClass = getattr(mod, class_name)
        except (ImportError, AttributeError) as exc:
            return {"status": "error", "error": f"Failed to import {agent_type}: {exc}"}

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

        return {
            "status": "spawned",
            "agent_id": agent_id,
            "agent_type": agent_type,
            "target": target,
        }

    async def _spawn_agents_batch(self, params: dict) -> dict:
        """
        Spawn multiple agents simultaneously.

        params:
            agents: list of dicts, each with the same fields as spawn_agent params
                    (agent_type, target, task_type, options)

        Returns summary of all spawn results.
        """
        agents_list = params.get("agents", [])
        if not agents_list:
            return {"status": "error", "error": "spawn_agents_batch requires 'agents' list"}

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
        await self.ctx.update_agent_status(AgentStatus(
            agent_id=agent_id, agent_type=agent_type, status="running"
        ))
        try:
            result: AgentResult = await agent.run()
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
        await self.ctx.update_agent_status(AgentStatus(
            agent_id=agent_id,
            agent_type=agent_type,
            status="done" if result.status in ("success", "partial") else "failed",
        ))
        return result

    # ── wait_for_agents ──────────────────────────────────────────────────────

    async def _wait_for_agents(self, params: dict) -> dict:
        """
        Block until all listed agent IDs complete (or timeout).

        Pause-aware: while Brain is paused, child agents are also paused.
        When Brain is resumed, waiting continues.

        params:
            agent_ids: list[str]
            timeout:   float (seconds, default 3600)
        """
        raw_ids = params.get("agent_ids", [])
        timeout: float = float(params.get("timeout", 3600))

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
            return {"status": "ok", "completed": [], "timed_out": [], "hint": "No agents to wait for."}

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
            # If Brain is paused, wait for resume before continuing
            if not self._pause_event.is_set():
                logger.info("BrainAgent: paused during wait_for_agents")
                while not self._pause_event.is_set():
                    if self._safety.kill_switch_triggered:
                        wait_task.cancel()
                        return {"status": "error", "error": "Kill switch triggered"}
                    await asyncio.sleep(0.3)
                logger.info("BrainAgent: resumed, continuing wait_for_agents")

            # Check kill switch
            if self._safety.kill_switch_triggered:
                wait_task.cancel()
                return {"status": "error", "error": "Kill switch triggered"}

            try:
                await asyncio.wait_for(asyncio.shield(wait_task), timeout=0.5)
            except asyncio.TimeoutError:
                continue  # still waiting — loop back to check pause

        completed = [aid for aid, r in done_results.items() if r is not None]
        timed_out = [aid for aid, r in done_results.items() if r is None]
        dbg.wait_done(self.agent_id, completed, timed_out)

        return {
            "status": "ok",
            "completed": completed,
            "timed_out": timed_out,
            "results": {
                aid: (r.payload if r else None)
                for aid, r in done_results.items()
            },
        }

    # ── kill_agent ───────────────────────────────────────────────────────────

    def _kill_agent(self, params: dict) -> dict:
        agent_id = params.get("agent_id", "")
        task = self._child_tasks.get(agent_id)
        if task and not task.done():
            task.cancel()
            self._child_tasks.pop(agent_id, None)
            self.emit_event("agent_killed", {"agent_id": agent_id})
            return {"status": "killed", "agent_id": agent_id}
        return {"status": "not_found", "agent_id": agent_id}

    def _handle_spawn_result(self, result: dict) -> None:
        # result from observe() has structure {"success": ..., "output": {"status": "spawned", ...}}
        # Unwrap to get the actual spawn result
        inner = result.get("output", result) if isinstance(result.get("output"), dict) else result
        if inner.get("status") == "spawned":
            aid = inner["agent_id"]
            atype = inner["agent_type"]
            self._active_agents[aid] = atype
            self._add_finding({
                "type": "agent_spawned",
                "agent_id": aid,
                "agent_type": atype,
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

    # ── ask_operator ──────────────────────────────────────────────────────────

    async def _ask_operator(self, params: dict) -> dict:
        """
        Pause and ask the human operator a question.
        In non-interactive mode, returns immediately with a timeout response.
        """
        question = params.get("question", "")
        timeout = float(params.get("timeout", 300))

        self.emit_event("ask_operator", {
            "question": question,
            "agent_id": self.agent_id,
        })
        self._state = AgentState.WAITING_FOR_OPERATOR

        # Brain waits for OPERATOR_REPLY on its own queue
        msg = await self.bus.receive(self.agent_id, timeout=timeout)
        if msg and msg.msg_type == MessageType.OPERATOR_REPLY:
            return {"status": "answered", "answer": msg.payload.get("answer", "")}
        return {"status": "timeout", "answer": ""}

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
            finding_type = msg.payload.get("finding_type") or msg.payload.get("type", "?")
            dbg.bus_finding(msg.sender_id, finding_type,
                            str(msg.payload.get("data", msg.payload))[:200])
            self._add_finding(msg.payload)
        elif msg.msg_type in (MessageType.AGENT_DONE, MessageType.AGENT_ERROR):
            aid = msg.payload.get("agent_id", "")
            status = msg.payload.get("status", "?")
            dbg.bus_agent_done(aid, msg.msg_type, status)
            self._active_agents.pop(aid, None)
            self._child_agents.pop(aid, None)
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
        return self._soul.build_brain_prompt(
            ctx_summary=ctx_summary,
            active_agents=self._active_agents,
            permissions=permissions,
        )

    # ── Handle terminal action ────────────────────────────────────────────────

    async def handle_terminal_action(self, action_dict: dict) -> bool:
        """mission_done (or legacy 'done') signals the end of the Brain loop."""
        tool = action_dict.get("action") or action_dict.get("tool", "")
        return tool in ("mission_done", "done") or self._mission_done

    # ── on_run_end ────────────────────────────────────────────────────────────

    async def on_run_end(self, final_state=None) -> None:
        """Cancel all running child agents on Brain exit."""
        for agent_id, task in list(self._child_tasks.items()):
            if not task.done():
                task.cancel()
                logger.info("BrainAgent: cancelled child %s on run_end", agent_id)
        self._child_tasks.clear()
        self._child_agents.clear()
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
) -> "BrainAgent":
    """
    Convenience factory for creating a BrainAgent with all required deps.

    Used by web/routes.py start_session (mode=v2_auto).
    """
    return BrainAgent(
        mission_context=mission_ctx,
        message_bus=message_bus,
        agent_type="brain",
        mission_id=session_id,
        session_id=session_id,
        tool_registry=tool_registry,
        safety=safety,
        progress_callback=progress_callback,
        audit_repo=audit_repo,
        max_iterations=max_iterations,
        # Brain needs more memory than child agents — it coordinates the
        # entire mission and must retain findings, agent results, and
        # strategic context across many iterations.
        memory_max_messages=120,
        memory_max_tokens=16384,
    )
