"""
Phase 8 — Agent Core (ReAct Loop)

PentestAgent implements the Reason → Act → Observe → Reflect loop.

Attack phase progression (tracked in AgentContext):
  DISCOVERY → PORT_SCAN → EXPLOIT_SEARCH → EXPLOITATION → DONE

The agent never executes shell commands directly.
All actions go through ToolRegistry → SafetyGuard → Tool.execute().
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum, auto

from core.llm_client import LLMRouter, llm_router
from core.memory import SessionMemory
from core.prompts import PromptBuilder
from core.safety import AgentAction, SafetyGuard
from core.tool_registry import ToolNotFoundError, ToolRegistry
from database.repositories import AuditLogRepository, ExploitResultRepository, ScanResultRepository, SessionRepository, VulnerabilityRepository
from models.mission import MissionBrief
from models.session import Session

logger = logging.getLogger(__name__)

# ── Types ──────────────────────────────────────────────────────────────────────

ProgressCallback = Callable[[str, dict], None]
ApprovalCallback = Callable[[dict], Awaitable[bool]]

_DEFAULT_MAX_ITERATIONS = 50


# ── Agent State Machine ────────────────────────────────────────────────────────

class AgentState(Enum):
    """States in the ReAct state machine."""
    IDLE = auto()
    REASONING = auto()
    ACTING = auto()
    OBSERVING = auto()
    REFLECTING = auto()
    DONE = auto()
    ERROR = auto()


# ── Agent Context ──────────────────────────────────────────────────────────────

@dataclass
class AgentContext:
    """
    Mutable runtime state for a single pentest run.

    Passed to PromptBuilder so every prompt contains an up-to-date picture of
    what has been discovered so far.
    """
    target: str
    mode: str  # "full_auto" | "ask_before_exploit" | "scan_only"

    # Accumulated findings (human-readable summaries for prompt injection)
    discovered_hosts: list[str] = field(default_factory=list)
    scan_results: list[str] = field(default_factory=list)
    vulnerabilities: list[str] = field(default_factory=list)
    exploit_results: list[str] = field(default_factory=list)

    # Internal work queues (drive the LLM's guidance)
    hosts_pending_port_scan: list[str] = field(default_factory=list)
    hosts_pending_exploit_search: list[str] = field(default_factory=list)

    # Active MSF sessions (session_id → target_ip).
    # NOTE: msfconsole fallback sessions are NOT persistent — they close when
    # msfconsole exits. Do NOT use session_exec on these; use post_commands instead.
    active_sessions: dict[int, str] = field(default_factory=dict)

    # Post-exploitation recon collected via post_commands in the run call.
    # Keyed by target_ip, value is the collected output.
    post_exploit_data: dict[str, str] = field(default_factory=dict)

    iteration: int = 0
    attack_phase: str = "DISCOVERY"  # DISCOVERY|PORT_SCAN|EXPLOIT_SEARCH|EXPLOITATION|POST_EXPLOIT|DONE
    port_range: str = "1-65535"      # nmap port range hint passed to the LLM via prompt
    notes: str = ""                  # operator-supplied notes injected into every prompt
    mission: MissionBrief = None     # V2: full mission brief (set post-init)

    def __post_init__(self):
        if self.mission is None:
            object.__setattr__(self, "mission", MissionBrief())

        # If target is a single IP (not CIDR), pre-register it as discovered so
        # the agent can proceed directly to PORT_SCAN without a redundant ping sweep.
        import re as _re
        if (
            self.target
            and "/" not in self.target
            and _re.match(r"^\d{1,3}(\.\d{1,3}){3}$", self.target)
            and self.target not in self.discovered_hosts
        ):
            self.discovered_hosts.append(self.target)
            self.hosts_pending_port_scan.append(self.target)
            self.attack_phase = "PORT_SCAN"
            logger.debug(
                "Single-IP target — pre-registered %s as discovered, phase=PORT_SCAN",
                self.target,
            )

    # ── Convenience properties ─────────────────────────────────────────────

    @property
    def total_ports(self) -> int:
        return len(self.scan_results)

    @property
    def total_vulns(self) -> int:
        return len(self.vulnerabilities)

    @property
    def total_exploits(self) -> int:
        return len(self.exploit_results)


# ── PentestAgent ───────────────────────────────────────────────────────────────

class PentestAgent:
    """
    Autonomous ReAct pentesting agent.

    Orchestrates the full attack lifecycle:
      host discovery → port scan → exploit search → exploitation → report

    Usage:
        agent = PentestAgent(
            session=session,
            target="192.168.1.0/24",
            mode="full_auto",
            registry=registry,
        )
        ctx = await agent.run()
    """

    def __init__(
        self,
        session: Session,
        target: str,
        mode: str = "full_auto",
        registry: ToolRegistry | None = None,
        safety: SafetyGuard | None = None,
        llm: LLMRouter | None = None,
        max_iterations: int = _DEFAULT_MAX_ITERATIONS,
        progress_callback: ProgressCallback | None = None,
        approval_callback: ApprovalCallback | None = None,
        port_range: str = "1-65535",
        notes: str = "",
        audit_repo: AuditLogRepository | None = None,
        mission: MissionBrief | None = None,
    ):
        self.session = session
        self.memory = SessionMemory()
        mb = mission or MissionBrief(port_range=port_range, scope_notes=notes)
        self._ctx = AgentContext(
            target=target,
            mode=mode,
            port_range=mb.port_range,
            notes=mb.scope_notes or notes,
            mission=mb,
        )
        self._state = AgentState.IDLE
        self._registry = registry or ToolRegistry()
        self._safety = safety or SafetyGuard()
        self._llm = llm or llm_router
        self._prompt_builder = PromptBuilder()
        self._max_iterations = max_iterations
        self._progress_cb = progress_callback
        self._approval_cb = approval_callback
        # DB repositories for real-time persistence
        self._scan_repo = ScanResultRepository()
        self._vuln_repo = VulnerabilityRepository()
        self._exploit_repo = ExploitResultRepository()
        self._session_repo = SessionRepository()
        self._audit_repo = audit_repo or AuditLogRepository()
        # Pause/resume control
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Not paused initially
        self._paused = False
        # Signals the active LLM stream to abort immediately on pause
        self._stream_abort = asyncio.Event()
        # Operator inject tracking
        self._has_pending_inject = False
        # Hard-block registry: tool or tool:module combos that have exceeded the
        # failure guard. These are blocked at act() level — the LLM cannot bypass
        # them by ignoring injected memory messages.
        self._session_blocked_calls: dict[str, int] = {}

    # ── Public properties ─────────────────────────────────────────────────────

    @property
    def state(self) -> AgentState:
        return self._state

    @property
    def context(self) -> AgentContext:
        return self._ctx

    @property
    def is_paused(self) -> bool:
        return self._paused

    # ── Seed context (resume from saved mission) ────────────────────────────────

    def reset_context(self) -> None:
        """Clear all accumulated findings and memory so context can be re-seeded."""
        self._ctx.discovered_hosts.clear()
        self._ctx.scan_results.clear()
        self._ctx.vulnerabilities.clear()
        self._ctx.exploit_results.clear()
        self._ctx.hosts_pending_port_scan.clear()
        self._ctx.hosts_pending_exploit_search.clear()
        self.memory = type(self.memory)()  # fresh SessionMemory instance

    def seed_context_from_findings(
        self,
        scan_results_from_db: list[dict],
        vulnerabilities_from_db: list[dict],
        attack_phase: str = "EXPLOITATION",
        exploit_results_from_db: list[dict] | None = None,
        events_up_to: list[dict] | None = None,
        source_iteration: int | None = None,
    ) -> None:
        """Load saved findings into context so the agent can resume.

        Parameters
        ----------
        scan_results_from_db : nmap scan results from DB
        vulnerabilities_from_db : vuln records from DB
        attack_phase : phase to set on the context
        exploit_results_from_db : past exploit attempts from DB (optional)
        events_up_to : session events up to the selected iteration (optional)
            Used to replay conversation history into SessionMemory.
        source_iteration : which iteration we're forking from (optional, for logging)
        """
        for sr in scan_results_from_db:
            hosts = sr.get("hosts") or []
            for host in hosts:
                ip = str(host.get("ip", ""))
                state = str(host.get("state", "up"))
                if ip and state == "up" and ip not in self._ctx.discovered_hosts:
                    self._ctx.discovered_hosts.append(ip)
                for port in host.get("ports") or []:
                    if port.get("state") != "open":
                        continue
                    port_num = port.get("number", 0)
                    service = str(port.get("service", ""))
                    version = str(port.get("version", ""))
                    summary = f"{ip}:{port_num} {service} {version}".strip()
                    if summary and summary not in self._ctx.scan_results:
                        self._ctx.scan_results.append(summary)

        for v in vulnerabilities_from_db:
            title = str(v.get("title", v))
            cve = str(v.get("cve_id", ""))
            summary = f"{title} [{cve}]".strip() if cve else title
            if summary and summary not in self._ctx.vulnerabilities:
                self._ctx.vulnerabilities.append(summary)

        if exploit_results_from_db:
            for er in exploit_results_from_db:
                module = er.get("module", "")
                success = er.get("success", False)
                error = er.get("error", "")
                summary = f"{'✓' if success else '✗'} {module}"
                if error:
                    summary += f" — {error[:80]}"
                if summary not in self._ctx.exploit_results:
                    self._ctx.exploit_results.append(summary)

        # Replay events into SessionMemory so the LLM has conversation context
        if events_up_to:
            self._replay_events_into_memory(events_up_to, source_iteration)

        self._ctx.hosts_pending_port_scan.clear()
        self._ctx.hosts_pending_exploit_search.clear()
        self._ctx.attack_phase = attack_phase
        self._ctx.iteration = source_iteration or 0
        logger.info(
            "Context seeded: %d hosts, %d ports, %d vulns, %d exploits → phase=%s (from iter %s)",
            len(self._ctx.discovered_hosts),
            len(self._ctx.scan_results),
            len(self._ctx.vulnerabilities),
            len(self._ctx.exploit_results),
            attack_phase,
            source_iteration,
        )
        self._emit("phase_change", {"attack_phase": attack_phase})

    def _replay_events_into_memory(self, events: list[dict], source_iteration: int | None) -> None:
        """Replay session events into the agent's SessionMemory.

        Reconstructs the assistant/tool conversation so the LLM has prior
        context when resuming from a specific iteration.
        """
        summary_parts = []
        for ev in events:
            et = ev.get("event_type", "")
            data = ev.get("data", {})
            if et == "reasoning":
                thought = data.get("thought", "")
                action = data.get("action", "")
                reasoning = data.get("reasoning", "")
                entry = f"THOUGHT: {thought}"
                if reasoning:
                    entry += f"\nREASONING: {reasoning}"
                if action:
                    entry += f"\nACTION: {action}"
                summary_parts.append(entry)
            elif et == "tool_result":
                tool = data.get("tool", "")
                success = data.get("success", False)
                output = str(data.get("output", ""))[:500]
                summary_parts.append(
                    f"TOOL_RESULT: {tool}\nSUCCESS: {success}\nOUTPUT: {output}"
                )
            elif et == "reflection":
                refl = data.get("reflection", "")
                if refl:
                    summary_parts.append(f"REFLECTION: {refl}")

        if summary_parts:
            iter_label = f" (iteration {source_iteration})" if source_iteration else ""
            header = (
                f"[SYSTEM] You are resuming a pentest mission from a checkpoint{iter_label}. "
                f"Below is a summary of what was done before this checkpoint. "
                f"Continue from where the previous run left off. Do NOT repeat already-completed actions.\n\n"
            )
            full_summary = header + "\n---\n".join(summary_parts[-30:])
            self.memory.add_user(full_summary)

    # ── Pause / Resume / Inject ────────────────────────────────────────────────

    def pause(self) -> None:
        """Pause the agent — aborts the active LLM stream and blocks next iteration."""
        self._pause_event.clear()
        self._stream_abort.set()   # signals the running stream_chat loop to stop
        self._paused = True
        logger.info("Agent paused for session %s", self.session.id)

    def resume(self) -> None:
        """Resume the agent after pausing."""
        self._stream_abort.clear()
        self._pause_event.set()
        self._paused = False
        logger.info("Agent resumed for session %s", self.session.id)

    def inject_message(self, message: str) -> None:
        """Inject an operator message into the agent's memory for the next iteration."""
        self.memory.add_user(f"[OPERATOR INTERRUPT]\n{message}")
        self._has_pending_inject = True
        self._emit("injected", {"message": message[:300]})
        logger.info("Operator message injected into agent memory")

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def run(self) -> AgentContext:
        """
        Execute the full ReAct loop until DONE or ERROR.

        State transitions:
          IDLE → REASONING → ACTING → OBSERVING → REFLECTING → REASONING → ...
          Any → DONE  (generate_report action received)
          Any → ERROR (kill switch or unrecoverable failure)

        Returns the final AgentContext (findings, statistics).
        """
        self._emit("start", {"target": self._ctx.target, "mode": self._ctx.mode})
        self._state = AgentState.REASONING

        # Repeated-failure guard: track (tool, error_fingerprint) → consecutive count.
        # After _MAX_SAME_FAIL identical failures we inject a system message so the
        # LLM stops retrying a broken/unavailable tool.
        _MAX_SAME_FAIL = 3
        _failure_counts: dict[str, int] = {}  # key: "tool_name|error_prefix"

        while self._state not in (AgentState.DONE, AgentState.ERROR):

            # ── Kill switch ───────────────────────────────────────────────
            if self._safety.kill_switch_triggered:
                logger.warning("Kill switch active — stopping agent immediately")
                self._emit("kill_switch", {})
                self._state = AgentState.ERROR
                break

            # ── Pause gate — wait until resumed or kill switch fires ──────
            if not self._pause_event.is_set():
                while not self._pause_event.is_set():
                    if self._safety.kill_switch_triggered:
                        break
                    await asyncio.sleep(0.5)
                # Re-check kill switch after unpausing
                if self._safety.kill_switch_triggered:
                    self._emit("kill_switch", {})
                    self._state = AgentState.ERROR
                    break

            # ── Max iterations guard ─────────────────────────────────────
            if self._ctx.iteration >= self._max_iterations:
                logger.warning(
                    "Max iterations (%d) reached — forcing stop",
                    self._max_iterations,
                )
                self._emit("max_iterations", {"iteration": self._ctx.iteration})
                self._state = AgentState.DONE
                break

            self._ctx.iteration += 1
            logger.info(
                "--- Iteration %d | Phase: %s | Hosts: %d ---",
                self._ctx.iteration,
                self._ctx.attack_phase,
                len(self._ctx.discovered_hosts),
            )

            # ── REASONING ────────────────────────────────────────────────
            self._state = AgentState.REASONING
            action_dict = await self.reason()

            if action_dict is None:
                if self._stream_abort.is_set():
                    # Pause was requested mid-stream — go back to top to hit the pause gate
                    continue
                # LLM call failed for another reason; brief pause before retry
                await asyncio.sleep(1.0)
                continue

            # ── Terminal action ───────────────────────────────────────────
            if action_dict.get("action") == "generate_report":
                self._emit(
                    "generate_report",
                    {
                        "hosts": len(self._ctx.discovered_hosts),
                        "vulns": self._ctx.total_vulns,
                        "exploits": self._ctx.total_exploits,
                    },
                )
                self._state = AgentState.DONE
                break

            # ── Ask-before-exploit gate ───────────────────────────────────
            if (
                self._ctx.mode == "ask_before_exploit"
                and action_dict.get("action") == "metasploit_run"
            ):
                approved = await self._ask_user_approval(action_dict)
                if not approved:
                    self.memory.add_user(
                        "User declined this exploit. "
                        "Try a different approach or move to the next target."
                    )
                    self._state = AgentState.REASONING
                    continue

            # ── Parallel tool execution ───────────────────────────────────
            if action_dict.get("action") == "parallel_tools":
                tool_calls = action_dict.get("tools") or []
                if not tool_calls:
                    self.memory.add_tool_result(
                        "TOOL_RESULT: parallel_tools\nSUCCESS: False\n"
                        "OUTPUT: parallel_tools received empty tools list"
                    )
                    self._state = AgentState.REASONING
                    continue

                try:
                    self._state = AgentState.ACTING
                    pairs = await self.act_parallel(tool_calls)

                    self._state = AgentState.OBSERVING
                    for sub_action, sub_result in pairs:
                        await self.observe(sub_result, sub_action)
                except Exception as exc:
                    logger.error("parallel_tools iteration failed: %s", exc)
                    self._emit("error", {"error": f"parallel_tools failed: {exc}"})

                self._state = AgentState.REFLECTING
                await self.reflect()
                self._state = AgentState.REASONING
                continue

            # ── ACTING ───────────────────────────────────────────────────
            try:
                self._state = AgentState.ACTING
                result = await self.act(action_dict)

                # ── OBSERVING ────────────────────────────────────────────
                self._state = AgentState.OBSERVING
                await self.observe(result, action_dict)
            except Exception as exc:
                logger.error("act/observe failed: %s", exc)
                self._emit("error", {"error": f"act/observe failed: {exc}"})
                result = {"success": False, "output": None, "error": str(exc)}
                self.memory.add_tool_result(
                    f"TOOL_RESULT: {action_dict.get('action', 'unknown')}\n"
                    f"SUCCESS: False\nOUTPUT: Internal error: {exc}"
                )

            # ── Repeated-failure guard ────────────────────────────────────
            if not result.get("success"):
                _tool = action_dict.get("action", "unknown")
                _err = str(result.get("error") or "")[:120]
                _fkey = f"{_tool}|{_err}"
                _failure_counts[_fkey] = _failure_counts.get(_fkey, 0) + 1
                if _failure_counts[_fkey] >= _MAX_SAME_FAIL:
                    # Keep at _MAX_SAME_FAIL-1 so the guard fires again after just 1 more failure
                    _failure_counts[_fkey] = _MAX_SAME_FAIL - 1
                    # Build block key (tool, or tool:module for metasploit)
                    _blk_params = action_dict.get("parameters", {})
                    _blk_key = _tool
                    _blk_module = ""
                    if _tool == "metasploit_run" and _blk_params.get("module"):
                        _blk_module = _blk_params["module"]
                        _blk_key = f"{_tool}:{_blk_module}"
                    self._session_blocked_calls[_blk_key] = (
                        self._session_blocked_calls.get(_blk_key, 0) + 1
                    )
                    _msg = (
                        f"[SYSTEM] '{_blk_key}' has failed {_MAX_SAME_FAIL} times with the "
                        f"same error: {_err!r}. It is now PERMANENTLY BLOCKED this session — "
                        f"any future call to it will be rejected automatically. "
                        f"You MUST move to a completely different exploit module or tool. "
                        f"Do not attempt '{_blk_key}' again."
                    )
                    logger.warning("Repeated-failure guard fired + hard-blocked %s: %s", _blk_key, _err)
                    self.memory.add_tool_result(_msg)
            else:
                # Reset failure count on success
                _tool = action_dict.get("action", "unknown")
                for k in list(_failure_counts.keys()):
                    if k.startswith(f"{_tool}|"):
                        _failure_counts[k] = 0

            # ── REFLECTING ───────────────────────────────────────────────
            self._state = AgentState.REFLECTING
            await self.reflect()

            self._state = AgentState.REASONING

        self._emit(
            "done",
            {
                "iterations": self._ctx.iteration,
                "hosts": len(self._ctx.discovered_hosts),
                "vulns": self._ctx.total_vulns,
                "exploits": self._ctx.total_exploits,
                "final_state": self._state.name,
            },
        )
        return self._ctx

    # ── ReAct steps ───────────────────────────────────────────────────────────

    async def reason(self) -> dict | None:
        """
        REASON: send current context to the LLM, receive next action as JSON.

        Streams tokens to subscribers in real-time via llm_token events.
        Returns the parsed action dict, or None on LLM / JSON parse failure.
        """
        try:
            messages = self._prompt_builder.build_full_prompt(
                context=self._ctx,
                memory=self.memory,
                tools=self._registry.list_for_llm(),
            )

            # If operator injected a message, append a priority note to the final user turn
            if self._has_pending_inject:
                messages[-1]["content"] += (
                    "\n\n⚠️ OPERATOR INTERRUPT ACTIVE: The operator has sent you a message "
                    "(marked [OPERATOR INTERRUPT] in the conversation above). "
                    "You MUST acknowledge it in your 'thought' field and adjust your plan "
                    "accordingly before choosing the next action."
                )

            # Stream tokens so the UI shows the LLM "thinking" in real-time
            self._emit("llm_thinking_start", {})
            response = ""
            async for token in self._llm.stream_chat(messages):
                if self._stream_abort.is_set():
                    # Pause was requested — discard partial response, stop streaming
                    logger.info("LLM stream aborted by pause request")
                    return None
                response += token
                self._emit("llm_token", {"token": token})

            action_dict = LLMRouter.parse_json(response)

            self.memory.add_assistant(response)

            # Emit a dedicated operator_response event when responding to an inject
            if self._has_pending_inject:
                self._has_pending_inject = False
                self._emit("operator_response", {
                    "thought": action_dict.get("thought", "")[:600],
                })

            self._emit(
                "reasoning",
                {
                    "thought": action_dict.get("thought", ""),
                    "action": action_dict.get("action", ""),
                    "reasoning": action_dict.get("reasoning", ""),
                    "attack_phase": self._ctx.attack_phase,
                },
            )
            return action_dict

        except json.JSONDecodeError as exc:
            logger.error("LLM returned invalid JSON: %s | response=%r", exc, response[:200] if response else "")
            self._emit("error", {"error": f"Invalid JSON from LLM: {exc}"})
            # Inject a corrective hint — covers both empty and prose-only responses
            hint = (
                "Your last response was empty. You MUST respond with a single valid JSON object. No prose."
                if not response.strip()
                else (
                    "Your last response contained prose/chain-of-thought but no valid JSON object. "
                    "You MUST respond with ONLY a single valid JSON object — no explanatory text, "
                    "no [REFLECTION] blocks, no markdown. Just the raw JSON."
                )
            )
            self.memory.add_user(hint)
            return None

        except Exception as exc:
            logger.error("Reasoning step failed: %s", exc)
            self._emit("error", {"error": str(exc)})
            return None

    async def act(self, action_dict: dict) -> dict:
        """
        ACT: validate the action through the safety pipeline, then execute the tool.

        Returns tool result dict: {"success": bool, "output": any, "error": str|None}
        """
        tool_name = action_dict.get("action", "")
        params = action_dict.get("parameters", {})

        # ── Hard block: repeated-failure blacklist ─────────────────────────
        # Keys are "tool_name" or "tool_name:module_path" for metasploit calls.
        # Once a combo lands here it cannot run again in this session.
        _block_key = tool_name
        if tool_name == "metasploit_run" and params.get("module"):
            _block_key = f"{tool_name}:{params['module']}"
        if self._session_blocked_calls.get(_block_key, 0) > 0:
            _block_msg = (
                f"[SYSTEM] '{_block_key}' is permanently blocked this session after "
                f"repeated identical failures. This call will NOT execute. "
                f"You MUST choose a completely different approach or tool."
            )
            logger.warning("Hard block prevented call to %s", _block_key)
            return {"success": False, "output": None, "error": _block_msg}

        # ── Safety check ─────────────────────────────────────────────────
        raw_target = str(params.get("target") or params.get("target_ip") or "")
        # CIDR network ranges (e.g. "10.0.0.0/24") are valid nmap targets but
        # not valid single IPs — skip per-IP scope check for them.
        target_ip_for_safety = raw_target if "/" not in raw_target else ""

        agent_action = AgentAction(
            tool_name=tool_name,
            target_ip=target_ip_for_safety,
            target_port=int(params.get("target_port") or params.get("port") or 0),
            exploit_module=str(params.get("module") or ""),
            exploit_category=str(params.get("category") or ""),
            cvss_score=float(params.get("cvss_score") or 0.0),
        )
        ok, reason = self._safety.validate_action(agent_action)
        if not ok:
            self._emit("safety_block", {"reason": reason, "tool": tool_name})
            await self._audit_repo.log(
                "SAFETY_BLOCK",
                session_id=self.session.id,
                tool_name=tool_name,
                target=raw_target,
                details={"reason": reason},
            )
            return {
                "success": False,
                "output": None,
                "error": f"Safety rule blocked this action: {reason}",
            }

        # ── Tool lookup ───────────────────────────────────────────────────
        try:
            tool = self._registry.get(tool_name)
        except ToolNotFoundError:
            msg = f"Unknown tool requested: '{tool_name}'"
            self._emit("error", {"error": msg})
            return {"success": False, "output": None, "error": msg}

        # ── Execute ───────────────────────────────────────────────────────
        self._emit("tool_call", {"tool": tool_name, "params": params})
        await self._audit_repo.log(
            "TOOL_CALL",
            session_id=self.session.id,
            tool_name=tool_name,
            target=raw_target,
            details={"params": params},
        )
        try:
            result = await tool.execute(params)
        except Exception as exc:
            logger.error("Tool '%s' raised an exception: %s", tool_name, exc)
            result = {"success": False, "output": None, "error": str(exc)}

        # Truncate raw output so the WS event stays under ~4 KB
        raw_output = result.get("output") or result.get("error")
        output_str = json.dumps(raw_output, ensure_ascii=False, default=str)
        if len(output_str) > 3000:
            output_str = output_str[:3000] + "\n... [truncated]"

        success = result.get("success", False)
        self._emit(
            "tool_result",
            {
                "tool": tool_name,
                "success": success,
                "output": output_str,
                "error": result.get("error"),
            },
        )
        await self._audit_repo.log(
            "TOOL_RESULT",
            session_id=self.session.id,
            tool_name=tool_name,
            target=raw_target,
            details={
                "success": success,
                "error": result.get("error"),
                "summary": output_str[:500] if output_str else None,
            },
        )
        return result

    async def act_parallel(self, tool_calls: list[dict]) -> list[tuple[dict, dict]]:
        """
        Execute multiple independent tool calls concurrently via asyncio.gather.

        Each call goes through the full act() pipeline (safety check → execute → audit).
        Returns a list of (action_dict, result) pairs — one per successfully dispatched call.
        """
        # Hard cap to prevent runaway parallelism
        capped = tool_calls[:10]
        if len(tool_calls) > 10:
            logger.warning(
                "parallel_tools: capped %d calls to 10", len(tool_calls)
            )

        self._emit("parallel_start", {"count": len(capped), "tools": [c.get("action") for c in capped]})

        async def _safe_act(call: dict) -> tuple[dict, dict]:
            try:
                result = await self.act(call)
            except Exception as exc:
                logger.error("parallel_tools: act() raised for %s: %s", call.get("action"), exc)
                result = {"success": False, "output": None, "error": str(exc)}
            return call, result

        raw = await asyncio.gather(*[_safe_act(c) for c in capped], return_exceptions=True)

        pairs: list[tuple[dict, dict]] = []
        for item in raw:
            if isinstance(item, Exception):
                logger.error("parallel_tools: gather raised: %s", item)
            else:
                pairs.append(item)

        self._emit("parallel_done", {"count": len(pairs)})
        return pairs

    @staticmethod
    def _summarize_tool_output(tool_name: str, raw_output, success: bool) -> str:
        """
        Convert raw tool output to a compact, LLM-friendly summary.

        Strategy (from published research):
        - metasploit_run : extract MSF key lines ([+]/[-]/[!]) + critical fields
        - nmap_scan      : compact ip:port:service rows, drop raw host blobs
        - others         : hard truncation at 2000 chars

        This prevents context bloat from multi-KB MSF console dumps while
        preserving the information the agent actually needs to reason about.
        """
        import re as _re

        _ANSI = _re.compile(r"\x1b\[[0-9;]*[mGKHF]")

        if tool_name == "metasploit_run" and isinstance(raw_output, dict):
            msf_raw = raw_output.get("output", "")
            key_lines: list[str] = []
            if isinstance(msf_raw, str):
                for line in msf_raw.splitlines():
                    clean = _ANSI.sub("", line).strip()
                    # Keep important MSF status lines and AEGIS debug tags
                    if _re.match(r"^\[[\+\-!\*]\]", clean) or "AEGIS_CMD_OUT" in clean:
                        key_lines.append(clean)
            summary = {
                "success":              raw_output.get("success"),
                "session_id":           raw_output.get("session_id"),
                "error":                raw_output.get("error"),
                "post_command_output":  (raw_output.get("post_command_output") or "")[:600],
                "key_lines":            key_lines[-25:],   # last 25 important lines
            }
            return json.dumps(summary, ensure_ascii=False)

        if tool_name == "nmap_scan" and isinstance(raw_output, dict):
            rows: list[str] = []
            for host in raw_output.get("hosts", []):
                ip = host.get("ip", "")
                for port in host.get("ports", []):
                    if port.get("state") == "open":
                        rows.append(
                            f"{ip}:{port['number']} {port.get('service','')} "
                            f"{port.get('version','')}".strip()
                        )
            compact = {
                "target":     raw_output.get("target"),
                "hosts_up":   len([h for h in raw_output.get("hosts", []) if h.get("state") == "up"]),
                "open_ports": rows[:60],
                "os":         next((h.get("os") for h in raw_output.get("hosts", []) if h.get("os")), None),
            }
            return json.dumps(compact, ensure_ascii=False)

        # Default: JSON dump with hard cap
        result_str = json.dumps(raw_output, ensure_ascii=False, default=str)
        if len(result_str) > 2000:
            result_str = result_str[:2000] + " ... [truncated]"
        return result_str

    async def observe(self, result: dict, action_dict: dict) -> None:
        """
        OBSERVE: add tool result to memory, update context statistics, persist to DB.

        Critical findings (vulns, successful exploits) are pinned in memory
        so they survive the sliding-window truncation.
        """
        tool_name = action_dict.get("action", "")
        success = result.get("success", False)

        # Pin findings that the LLM must remember long-term
        pinned = success and tool_name in {"searchsploit_search", "metasploit_run"}

        raw_output = result.get("output") or result.get("error")
        output_str = self._summarize_tool_output(tool_name, raw_output, success)

        content = (
            f"TOOL_RESULT: {tool_name}\n"
            f"SUCCESS: {success}\n"
            f"OUTPUT: {output_str}"
        )
        self.memory.add_tool_result(content, pinned=pinned)

        self._update_context(tool_name, result, action_dict)
        self._emit("observation", {
            "tool": tool_name,
            "success": success,
            "attack_phase": self._ctx.attack_phase,
        })

        # Persist findings to DB so reports and real-time stats are accurate
        await self._persist_findings(tool_name, result, action_dict)

    async def _persist_findings(self, tool_name: str, result: dict, action_dict: dict) -> None:
        """Save scan results and vulnerabilities to DB after each tool call."""
        if not result.get("success"):
            return
        output = result.get("output")
        if output is None or not isinstance(output, dict):
            return
        params = action_dict.get("parameters", {})

        try:
            if tool_name == "nmap_scan":
                hosts = output.get("hosts", [])
                if hosts:
                    await self._scan_repo.save(
                        session_id=self.session.id,
                        target=str(params.get("target", "")),
                        scan_type=str(params.get("scan_type", "ping")),
                        hosts=hosts,
                        duration_seconds=float(output.get("duration_seconds", 0.0)),
                    )
                    open_ports = [
                        f"{p['port']}/{p.get('protocol','tcp')} {p.get('service','')}"
                        for h in hosts for p in h.get("ports", [])
                        if p.get("state") == "open"
                    ]
                    await self._audit_repo.log(
                        "NMAP_SCAN",
                        session_id=self.session.id,
                        tool_name="nmap_scan",
                        target=str(params.get("target", "")),
                        details={
                            "hosts_found": len(hosts),
                            "open_ports": open_ports[:30],
                            "scan_type": str(params.get("scan_type", "ping")),
                            "duration_seconds": float(output.get("duration_seconds", 0.0)),
                        },
                    )

            elif tool_name == "searchsploit_search":
                vulns = output.get("vulnerabilities", [])
                for v in vulns:
                    await self._vuln_repo.save(session_id=self.session.id, vuln=v)
                if vulns:
                    await self._audit_repo.log(
                        "EXPLOIT_FOUND",
                        session_id=self.session.id,
                        tool_name="searchsploit_search",
                        target=str(params.get("query", "")),
                        details={
                            "count": len(vulns),
                            "exploits": [
                                {"title": v.get("title", ""), "path": v.get("path", ""), "cvss": v.get("cvss_score")}
                                for v in vulns[:10]
                            ],
                        },
                    )

            elif tool_name == "metasploit_run":
                action = str(params.get("action", "run"))
                exploit_success = bool(output.get("session_opened"))
                poc_out = output.get("post_command_output", "")

                # Save exploit attempt record (always, even on failure)
                if action == "run":
                    await self._exploit_repo.save(
                        session_id=self.session.id,
                        result={
                            "host_ip": str(params.get("target_ip", params.get("target", ""))),
                            "port": int(params.get("target_port") or params.get("port") or 0),
                            "module": str(params.get("module", "")),
                            "payload": str(params.get("payload", output.get("payload", ""))),
                            "success": exploit_success,
                            "session_opened": int(output.get("session_opened") or 0),
                            "output": str(output.get("output", ""))[:2000],
                            "error": str(output.get("error", "")),
                            "poc_output": poc_out,
                        },
                    )

                await self._audit_repo.log(
                    "METASPLOIT_RUN",
                    session_id=self.session.id,
                    tool_name="metasploit_run",
                    target=str(params.get("target_ip", params.get("target", ""))),
                    details={
                        "module": str(params.get("module", "")),
                        "payload": str(params.get("payload", "")),
                        "port": params.get("target_port") or params.get("port"),
                        "session_opened": exploit_success,
                        "output_summary": str(output.get("output", ""))[:300],
                    },
                )

            # Update live counters in the session record after every relevant tool call
            if tool_name in ("nmap_scan", "searchsploit_search", "metasploit_run"):
                await self._session_repo.update_stats(
                    self.session.id,
                    hosts_found=len(self._ctx.discovered_hosts),
                    ports_found=len(self._ctx.scan_results),
                    vulns_found=len(self._ctx.vulnerabilities),
                    exploits_run=len(self._ctx.exploit_results),
                )
        except Exception as exc:
            logger.warning("Failed to persist findings to DB: %s", exc)

    async def reflect(self) -> None:
        """
        REFLECT: ask the LLM for a brief tactical update.

        Reflection is non-critical — any failure is logged and silently skipped.
        The reflection text is added to memory as context for the next reasoning step.
        """
        try:
            messages = self._prompt_builder.build_reflection_messages(
                context=self._ctx,
                memory=self.memory,
            )
            self._emit("llm_reflecting_start", {})
            reflection = ""
            async for token in self._llm.stream_chat(messages):
                reflection += token
                self._emit("llm_token", {"token": token})
            self.memory.add_assistant(f"[REFLECTION] {reflection}")
            self._emit("reflection", {"content": reflection[:300]})
        except Exception as exc:
            logger.warning("Reflection step failed (non-critical): %s", exc)

    # ── Private helpers ───────────────────────────────────────────────────────

    def _emit(self, event: str, data: dict) -> None:
        """Fire the progress callback if one is registered."""
        if self._progress_cb is not None:
            try:
                self._progress_cb(event, data)
            except Exception as exc:
                logger.warning("Progress callback raised an error: %s", exc)

    async def _ask_user_approval(self, action_dict: dict) -> bool:
        """
        Request user approval for an exploit in ask_before_exploit mode.

        If no approval callback is set, auto-approves (full-auto behaviour).
        On callback failure, denies the action (fail-safe).
        """
        if self._approval_cb is None:
            logger.info("No approval callback — auto-approving exploit action")
            return True
        try:
            return bool(await self._approval_cb(action_dict))
        except Exception as exc:
            logger.error("Approval callback failed: %s — denying action", exc)
            return False

    def _update_context(
        self,
        tool_name: str,
        result: dict,
        action_dict: dict,
    ) -> None:
        """
        Parse a successful tool result and update AgentContext stats.

        Drives phase advancement and work-queue maintenance so the LLM always
        sees an accurate picture of remaining work.
        """
        if not result.get("success"):
            return
        output = result.get("output")
        if output is None:
            return
        params = action_dict.get("parameters", {})

        if tool_name == "nmap_scan":
            self._process_nmap_result(output, params)
        elif tool_name == "searchsploit_search":
            self._process_searchsploit_result(output, params)
        elif tool_name == "metasploit_run":
            self._process_metasploit_result(output, params)

    def _process_nmap_result(self, output: dict | list, params: dict) -> None:
        scan_type = str(params.get("scan_type", "ping"))
        target = str(params.get("target", ""))

        if not isinstance(output, dict):
            return

        hosts = output.get("hosts", [])
        for host in hosts:
            ip = str(host.get("ip", ""))
            state = str(host.get("state", "down"))

            if state == "up" and ip and ip not in self._ctx.discovered_hosts:
                self._ctx.discovered_hosts.append(ip)
                self._ctx.hosts_pending_port_scan.append(ip)
                logger.info("Discovered live host: %s", ip)

            for port in host.get("ports", []):
                if port.get("state") != "open":
                    continue
                port_num = port.get("number", 0)
                service = str(port.get("service", ""))
                version = str(port.get("version", ""))
                summary = f"{ip}:{port_num} {service} {version}".strip()
                if summary not in self._ctx.scan_results:
                    self._ctx.scan_results.append(summary)
                    if service or version:
                        self._ctx.hosts_pending_exploit_search.append(
                            f"{ip}:{port_num}:{service}:{version}"
                        )

        # Remove scanned host from port-scan queue
        if scan_type in ("service", "os", "full") and target in self._ctx.hosts_pending_port_scan:
            self._ctx.hosts_pending_port_scan.remove(target)

        # Phase advancement
        if (
            scan_type == "ping"
            and self._ctx.attack_phase == "DISCOVERY"
            and self._ctx.discovered_hosts
        ):
            self._ctx.attack_phase = "PORT_SCAN"
            logger.info("Phase → PORT_SCAN  (%d live hosts)", len(self._ctx.discovered_hosts))
            self._emit("phase_change", {
                "attack_phase": "PORT_SCAN",
                "hosts": len(self._ctx.discovered_hosts),
            })

        if (
            scan_type in ("service", "os", "full")
            and not self._ctx.hosts_pending_port_scan
            and self._ctx.attack_phase == "PORT_SCAN"
        ):
            self._ctx.attack_phase = "EXPLOIT_SEARCH"
            logger.info("Phase → EXPLOIT_SEARCH")
            self._emit("phase_change", {
                "attack_phase": "EXPLOIT_SEARCH",
                "ports": self._ctx.total_ports,
            })

    def _process_searchsploit_result(self, output: dict | list, params: dict) -> None:
        vulns: list = []
        if isinstance(output, list):
            vulns = output
        elif isinstance(output, dict):
            vulns = output.get("vulnerabilities", []) or output.get("results", [])

        for vuln in vulns:
            if isinstance(vuln, dict):
                title = str(vuln.get("title", vuln))
                cve = str(vuln.get("cve_id", ""))
                cve_str = f" [{cve}]" if cve else ""
                summary = f"{title}{cve_str}"
            else:
                summary = str(vuln)
            if summary not in self._ctx.vulnerabilities:
                self._ctx.vulnerabilities.append(summary)

        # Advance phase when we have vulnerabilities and exploitation is allowed.
        # Also fires if agent skipped discovery (KNOWN TECH shortcut) — in that
        # case attack_phase may still be DISCOVERY or PORT_SCAN.
        if (
            self._ctx.vulnerabilities
            and self._ctx.mode != "scan_only"
            and self._ctx.attack_phase in ("DISCOVERY", "PORT_SCAN", "EXPLOIT_SEARCH")
        ):
            self._ctx.attack_phase = "EXPLOITATION"
            logger.info("Phase → EXPLOITATION")
            self._emit("phase_change", {
                "attack_phase": "EXPLOITATION",
                "vulns": self._ctx.total_vulns,
            })

    def _process_metasploit_result(self, output: dict | list, params: dict) -> None:
        action = str(params.get("action", "run"))
        module = str(params.get("module", "unknown"))
        target_ip = str(params.get("target_ip", ""))

        if action == "session_exec":
            # session_exec doesn't produce a new exploit result — it's post-exploitation
            return

        session_id = None
        if isinstance(output, dict):
            session_id = output.get("session_id")
        summary = (
            f"{target_ip} | {module} | "
            f"session_id={session_id}"
        )
        self._ctx.exploit_results.append(summary)
        logger.info("Exploit result recorded: %s", summary)

        # Track opened sessions so the agent knows which shells are available
        if session_id is not None:
            self._ctx.active_sessions[session_id] = target_ip
            logger.info("Session %s registered for %s", session_id, target_ip)

            if self._ctx.attack_phase == "EXPLOITATION":
                self._ctx.attack_phase = "POST_EXPLOIT"
                logger.info("Phase → POST_EXPLOIT (session %s opened)", session_id)
                self._emit("phase_change", {
                    "attack_phase": "POST_EXPLOIT",
                    "session_id": session_id,
                })

        # Store post_command_output in context so every subsequent prompt sees it.
        # This prevents the agent from trying session_exec to re-collect already-gathered data.
        if isinstance(output, dict):
            post_out = output.get("post_command_output")
            if post_out and target_ip:
                self._ctx.post_exploit_data[target_ip] = post_out
                logger.info("post_exploit_data stored for %s (%d chars)", target_ip, len(post_out))
