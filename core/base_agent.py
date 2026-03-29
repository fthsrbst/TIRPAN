"""
TIRPAN V2 — BaseAgent

Abstract foundation for all TIRPAN agents.

Provides:
  - AgentState enum (shared across all agents, imported by core/agent.py)
  - ReAct loop: REASONING → ACTING → OBSERVING → REFLECTING
  - Pause / resume / kill / inject_message controls
  - Safety check wrapper (every tool call goes through SafetyGuard)
  - Event emission (progress_callback → WebSocket)
  - Repeated-failure guard (blocks stuck tool/module combos)
  - Connect-loop guard (detects shell_exec(connect) spam)
  - SessionMemory management
  - Audit logging

Subclasses must implement:
  - build_messages()       → full LLM message list (system + memory + context)
  - process_result()       → handle tool result, update state, accumulate findings
  - get_available_tools()  → list of tool names this agent may call

Subclasses may override:
  - reflect()                → post-iteration reflection (default: no-op)
  - handle_terminal_action() → detect loop-ending JSON actions
  - _summarize_tool_output() → compact tool output for LLM context window
  - on_run_start()           → called once at loop start
  - on_run_end()             → called once at loop end (cleanup)

V1 backward-compatibility:
  AgentState is defined here; core/agent.py re-exports it so existing imports
  (from core.agent import AgentState) continue to work unchanged.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from enum import Enum, auto
from typing import Any

from core.llm_client import LLMRouter, llm_router
from core.memory import SessionMemory
from core.safety import AgentAction, SafetyGuard
from core.tool_registry import ToolNotFoundError, ToolRegistry

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_DEFAULT_MAX_ITERATIONS = 150
_MAX_SAME_FAIL = 3           # failures before hard-blocking a tool/module
_CONNECT_LOOP_THRESHOLD = 2  # shell_exec(connect) already_open hits before nudge
_UNAVAILABLE_TOOL_LIMIT = 3  # consecutive unavailable-tool calls before warning
_UNAVAILABLE_TOOL_FORCE_DONE = 5  # consecutive unavailable-tool calls → force agent done

# ── Types ─────────────────────────────────────────────────────────────────────

ProgressCallback = Callable[[str, dict], None]
ApprovalCallback = Callable[[dict], Awaitable[bool]]


# ── Agent State Machine ───────────────────────────────────────────────────────

class AgentState(Enum):
    """
    States in the ReAct state machine.

    Shared by ALL agents (BaseAgent subclasses and the legacy PentestAgent).
    Defined here so specialized agents can import without touching core/agent.py.
    """
    IDLE = auto()
    REASONING = auto()
    ACTING = auto()
    OBSERVING = auto()
    REFLECTING = auto()
    DONE = auto()
    ERROR = auto()
    WAITING_FOR_OPERATOR = auto()  # post-report pause; exits on inject or kill


# ── Agent Result ──────────────────────────────────────────────────────────────

class AgentResult:
    """
    Structured result returned by BaseAgent.run().

    Brain Agent reads this to decide next steps:
      - status      : overall outcome
      - findings    : structured discoveries (hosts, vulns, creds, sessions, …)
      - iterations  : how many ReAct loops ran
      - error       : failure message if status == "failed"
    """

    def __init__(
        self,
        agent_id: str,
        agent_type: str,
        status: str,                      # "success" | "partial" | "failed" | "killed"
        findings: list[dict] | None = None,
        iterations: int = 0,
        error: str | None = None,
    ):
        self.agent_id = agent_id
        self.agent_type = agent_type
        self.status = status
        self.findings = findings or []
        self.iterations = iterations
        self.error = error

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "status": self.status,
            "findings": self.findings,
            "iterations": self.iterations,
            "error": self.error,
        }

    def __repr__(self) -> str:
        return (
            f"AgentResult(type={self.agent_type!r}, status={self.status!r}, "
            f"findings={len(self.findings)}, iters={self.iterations})"
        )


# ── BaseAgent ─────────────────────────────────────────────────────────────────

class BaseAgent(ABC):
    """
    Abstract base class for all TIRPAN V2 agents.

    The generic ReAct loop lives here. Specialized agents override the abstract
    methods to inject domain-specific logic (prompts, result handling, tools).

    PentestAgent (V1 legacy) will extend this class in Step 16 of the V2 plan.
    Until then, PentestAgent remains standalone and this class is used only by
    new specialized agents (ScannerAgent, ExploitAgent, BrainAgent, etc.).
    """

    def __init__(
        self,
        *,
        agent_type: str,
        mission_id: str,
        tool_registry: ToolRegistry | None = None,
        safety: SafetyGuard | None = None,
        llm: LLMRouter | None = None,
        progress_callback: ProgressCallback | None = None,
        agent_id: str | None = None,
        max_iterations: int = _DEFAULT_MAX_ITERATIONS,
        memory_max_messages: int = 50,
        memory_max_tokens: int = 4096,
        audit_repo: Any | None = None,
        # session_id kept for audit-log compatibility with existing repositories
        session_id: str | None = None,
    ):
        self.agent_id: str = agent_id or str(uuid.uuid4())
        self.agent_type: str = agent_type
        self.mission_id: str = mission_id
        # Fallback: treat mission_id as session_id for backward-compat audit calls
        self.session_id: str = session_id or mission_id

        self.memory = SessionMemory(
            max_messages=memory_max_messages,
            max_tokens=memory_max_tokens,
        )

        self._state = AgentState.IDLE
        self._registry: ToolRegistry = tool_registry or ToolRegistry()
        self._safety: SafetyGuard = safety or SafetyGuard()
        self._llm: LLMRouter = llm or llm_router
        self._max_iterations: int = max_iterations
        self._progress_cb: ProgressCallback | None = progress_callback
        self._audit_repo = audit_repo

        self._iteration: int = 0

        # Pause / resume
        self._pause_event = asyncio.Event()
        self._pause_event.set()          # not paused initially
        self._paused: bool = False
        self._stream_abort = asyncio.Event()

        # Operator inject
        self._has_pending_inject: bool = False

        # Hard-block registry: "tool_name" or "tool_name:module" → block count
        self._session_blocked_calls: dict[str, int] = {}

        # Accumulated findings — populated by _add_finding() inside process_result()
        self._findings: list[dict] = []

        self._log = logging.getLogger(f"tirpan.agent.{agent_type}")

    # ── Public properties ─────────────────────────────────────────────────────

    @property
    def state(self) -> AgentState:
        return self._state

    @property
    def is_paused(self) -> bool:
        return self._paused

    @property
    def iteration(self) -> int:
        return self._iteration

    # ── Abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    def build_messages(self) -> list[dict]:
        """
        Build the full LLM message list for the current iteration.

        Must return OpenAI-compatible format:
            [
                {"role": "system",    "content": "..."},
                {"role": "user",      "content": "..."},
                {"role": "assistant", "content": "..."},
                ...
            ]

        Typically: system prompt + memory.build_context() + action prompt.
        """
        ...

    @abstractmethod
    async def process_result(
        self, tool_name: str, result: dict, action_dict: dict
    ) -> None:
        """
        Handle a tool result: update internal state, persist to DB, collect findings.

        Called from observe() immediately after the result is added to memory.
        Use self._add_finding(finding_dict) to record discoveries.

        Parameters
        ----------
        tool_name   : name of the tool that was called
        result      : raw tool result {"success": bool, "output": any, "error": str|None}
        action_dict : the full action JSON the LLM produced
        """
        ...

    @abstractmethod
    def get_available_tools(self) -> list[str]:
        """
        Return the tool names this agent is allowed to call.

        Only these tools are shown to the LLM (ToolRegistry is the source of truth
        for all registered tools; this method acts as a per-agent filter).

        Return an empty list to allow all registered tools (use only for
        unrestricted agents like the legacy PentestAgent).
        """
        ...

    # ── Optional overrides ────────────────────────────────────────────────────

    async def reflect(self) -> None:
        """
        Optional post-iteration reflection.
        Default: no-op. Override to inject a reflection LLM call.
        """

    async def handle_terminal_action(self, action_dict: dict) -> bool:
        """
        Inspect action_dict and return True if the loop should stop.

        Default: {"action": "done"} terminates the loop.
        PentestAgent overrides this to handle "generate_report".
        Brain overrides this to handle its own terminal conditions.
        """
        return action_dict.get("action") == "done"

    async def on_run_start(self) -> None:
        """Called once at the beginning of run(). Override for initialization."""

    async def on_run_end(self, final_state: AgentState) -> None:
        """Called once at the end of run(). Override for cleanup / DB finalization."""

    def _summarize_tool_output(
        self, tool_name: str, raw_output: Any, success: bool
    ) -> str:
        """
        Convert raw tool output to a compact, LLM-friendly string.

        Default: JSON dump with 4 000-char hard cap.
        Override per tool category for smarter summarization (see PentestAgent).
        """
        result_str = json.dumps(raw_output, ensure_ascii=False, default=str)
        if len(result_str) > 4000:
            result_str = result_str[:4000] + " ... [truncated]"
        return result_str

    # ── Finding accumulation ──────────────────────────────────────────────────

    def _add_finding(self, finding: dict) -> None:
        """
        Record a structured finding.

        Findings are returned in AgentResult and emitted as WebSocket events so
        the Brain Agent and UI can react in real time.

        Common finding types:
            {"type": "host_discovered", "ip": "10.0.0.5"}
            {"type": "port_open", "ip": "10.0.0.5", "port": 80, "service": "http"}
            {"type": "vulnerability", "cve": "CVE-2024-XXXX", "cvss": 9.8}
            {"type": "exploit_success", "host": "10.0.0.5", "session_type": "meterpreter"}
            {"type": "credential", "host": "10.0.0.5", "username": "root"}
        """
        self._findings.append(finding)
        self.emit_event("finding", {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            **finding,
        })

    # ── Event emission ────────────────────────────────────────────────────────

    def emit_event(self, event_type: str, data: dict) -> None:
        """
        Emit a progress event via the registered progress_callback.

        Every event is stamped with agent_id and agent_type so the UI and Brain
        can route events to the correct panel / handler.
        """
        if self._progress_cb is None:
            return
        payload: dict = {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            **data,
        }
        try:
            self._progress_cb(event_type, payload)
        except Exception as exc:
            self._log.debug("emit_event(%s) failed: %s", event_type, exc)

    # ── Audit logging ─────────────────────────────────────────────────────────

    async def _audit(
        self,
        event_type: str,
        tool_name: str = "",
        target: str = "",
        details: dict | None = None,
    ) -> None:
        """Write to audit log if a repository is injected. Non-blocking."""
        if self._audit_repo is None:
            return
        try:
            await self._audit_repo.log(
                event_type,
                session_id=self.session_id,
                tool_name=tool_name,
                target=target,
                details=details or {},
            )
        except Exception as exc:
            self._log.debug("Audit log write failed: %s", exc)

    # ── Control methods ───────────────────────────────────────────────────────

    def pause(self) -> None:
        """
        Pause the agent.

        Aborts the active LLM stream immediately and blocks the next iteration
        until resume() is called.
        """
        self._pause_event.clear()
        self._stream_abort.set()
        self._paused = True
        self._log.info("Agent %s [%s] paused", self.agent_id, self.agent_type)

    def resume(self) -> None:
        """Resume the agent after a pause."""
        self._stream_abort.clear()
        self._pause_event.set()
        self._paused = False
        self._log.info("Agent %s [%s] resumed", self.agent_id, self.agent_type)

    def inject_message(self, message: str) -> None:
        """
        Inject an operator message into the agent's memory.

        The message will be included in the next LLM call and the agent will
        be instructed to acknowledge it before choosing the next action.
        """
        self.memory.add_user(f"[OPERATOR INTERRUPT]\n{message}")
        self._has_pending_inject = True
        self.emit_event("injected", {"message": message[:300]})
        self._log.info("Operator message injected into agent %s", self.agent_id)

    def kill(self) -> None:
        """
        Emergency stop. Triggers the SafetyGuard kill switch which causes the
        main loop to exit at the next iteration boundary.
        """
        self._safety.emergency_stop()
        self._log.warning("Kill triggered on agent %s", self.agent_id)

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def run(self) -> AgentResult:
        """
        Execute the ReAct loop until DONE, ERROR, or kill switch fires.

        State flow:
            IDLE → REASONING → ACTING → OBSERVING → REFLECTING → REASONING → …
            Any  → DONE  (terminal action returned by handle_terminal_action())
            Any  → ERROR (kill switch or unrecoverable failure)
            Any  → ERROR (asyncio.CancelledError — task was cancelled)

        Returns AgentResult containing all accumulated findings and final status.
        """
        self._state = AgentState.IDLE
        self.emit_event("agent_start", {"mission_id": self.mission_id})
        await self.on_run_start()
        self._state = AgentState.REASONING

        # Repeated-failure guard state
        _failure_counts: dict[str, int] = {}   # "tool|error_prefix" → consecutive count

        # Unavailable-tool loop breaker
        _unavailable_consecutive: int = 0

        # Connect-loop guard state
        _already_open_counts: dict[str, int] = {}  # session_key → count

        try:
            while self._state not in (AgentState.DONE, AgentState.ERROR):

                # ── Kill switch ───────────────────────────────────────────
                if self._safety.kill_switch_triggered:
                    self._log.warning(
                        "Kill switch active — stopping agent %s", self.agent_id
                    )
                    self.emit_event("kill_switch", {})
                    self._state = AgentState.ERROR
                    break

                # ── Pause gate ────────────────────────────────────────────
                if not self._pause_event.is_set():
                    while not self._pause_event.is_set():
                        if self._safety.kill_switch_triggered:
                            break
                        await asyncio.sleep(0.5)
                    if self._safety.kill_switch_triggered:
                        self.emit_event("kill_switch", {})
                        self._state = AgentState.ERROR
                        break

                # ── Max iterations guard ──────────────────────────────────
                if self._iteration >= self._max_iterations:
                    self._log.warning(
                        "Max iterations (%d) reached for agent %s",
                        self._max_iterations, self.agent_id,
                    )
                    self.emit_event("max_iterations", {"iteration": self._iteration})
                    self._state = AgentState.DONE
                    break

                self._iteration += 1
                self._log.info(
                    "Agent %s [%s] — iteration %d",
                    self.agent_id, self.agent_type, self._iteration,
                )

                # ── REASONING ─────────────────────────────────────────────
                self._state = AgentState.REASONING
                action_dict = await self.reason()

                if action_dict is None:
                    if self._stream_abort.is_set():
                        # Paused mid-stream — loop back to hit the pause gate
                        continue
                    # LLM failure or JSON parse error — brief pause then retry
                    await asyncio.sleep(1.0)
                    continue

                # ── Terminal action check ─────────────────────────────────
                is_terminal = await self.handle_terminal_action(action_dict)
                if is_terminal:
                    self._log.info(
                        "Agent %s received terminal action: %s",
                        self.agent_id, action_dict.get("action"),
                    )
                    self._state = AgentState.DONE
                    break

                # ── Parallel tools shortcut ───────────────────────────────
                if action_dict.get("action") == "parallel_tools":
                    tool_calls = action_dict.get("tools") or []
                    if not tool_calls:
                        self.memory.add_tool_result(
                            "TOOL_RESULT: parallel_tools\nSUCCESS: False\n"
                            "OUTPUT: parallel_tools received an empty tools list"
                        )
                        self._state = AgentState.REASONING
                        continue

                    try:
                        self._state = AgentState.ACTING
                        pairs = await self.act_parallel(tool_calls)

                        self._state = AgentState.OBSERVING
                        for sub_action, sub_result in pairs:
                            await self.observe(sub_result, sub_action)

                            # Per-call failure guard for parallel batch
                            if not sub_result.get("success"):
                                _ptool = sub_action.get("action", "unknown")
                                _perr = str(sub_result.get("error") or "")[:120]
                                _pfkey = f"{_ptool}|{_perr}"
                                _failure_counts[_pfkey] = (
                                    _failure_counts.get(_pfkey, 0) + 1
                                )
                                if _failure_counts[_pfkey] >= _MAX_SAME_FAIL:
                                    _failure_counts[_pfkey] = _MAX_SAME_FAIL - 1
                                    _pblk = _ptool
                                    if (
                                        _ptool == "metasploit_run"
                                        and sub_action.get("parameters", {}).get("module")
                                    ):
                                        _pblk = f"{_ptool}:{sub_action['parameters']['module']}"
                                    self._session_blocked_calls[_pblk] = (
                                        self._session_blocked_calls.get(_pblk, 0) + 1
                                    )
                                    self.memory.add_tool_result(
                                        f"[SYSTEM] '{_pblk}' failed {_MAX_SAME_FAIL} times "
                                        f"with error: {_perr!r}. PERMANENTLY BLOCKED this session.",
                                        pinned=True,
                                    )
                            else:
                                _ptool = sub_action.get("action", "unknown")
                                for k in list(_failure_counts):
                                    if k.startswith(f"{_ptool}|"):
                                        _failure_counts[k] = 0

                    except Exception as exc:
                        self._log.error("parallel_tools iteration failed: %s", exc)
                        self.emit_event("error", {"error": f"parallel_tools: {exc}"})

                    self._state = AgentState.REFLECTING
                    await self.reflect()
                    self._state = AgentState.REASONING
                    continue

                # ── ACTING ────────────────────────────────────────────────
                result: dict = {"success": False, "output": None, "error": None}
                try:
                    self._state = AgentState.ACTING
                    result = await self.act(action_dict)

                    # ── OBSERVING ─────────────────────────────────────────
                    self._state = AgentState.OBSERVING
                    await self.observe(result, action_dict)

                except Exception as exc:
                    self._log.error("act/observe failed: %s", exc)
                    self.emit_event("error", {"error": f"act/observe: {exc}"})
                    result = {"success": False, "output": None, "error": str(exc)}
                    self.memory.add_tool_result(
                        f"TOOL_RESULT: {action_dict.get('action', 'unknown')}\n"
                        f"SUCCESS: False\nOUTPUT: Internal error: {exc}"
                    )

                # ── Repeated-failure guard ─────────────────────────────────
                if not result.get("success"):
                    _tool = action_dict.get("action", "unknown")
                    _err = str(result.get("error") or "")[:120]
                    _fkey = f"{_tool}|{_err}"
                    _failure_counts[_fkey] = _failure_counts.get(_fkey, 0) + 1
                    if _failure_counts[_fkey] >= _MAX_SAME_FAIL:
                        _failure_counts[_fkey] = _MAX_SAME_FAIL - 1
                        _blk = _tool
                        if (
                            _tool == "metasploit_run"
                            and action_dict.get("parameters", {}).get("module")
                        ):
                            _blk = f"{_tool}:{action_dict['parameters']['module']}"
                        self._session_blocked_calls[_blk] = (
                            self._session_blocked_calls.get(_blk, 0) + 1
                        )
                        self._log.warning(
                            "Repeated-failure guard fired + hard-blocked %s: %s",
                            _blk, _err,
                        )
                        self.memory.add_tool_result(
                            f"[SYSTEM] '{_blk}' failed {_MAX_SAME_FAIL} times with "
                            f"error: {_err!r}. PERMANENTLY BLOCKED — do NOT retry.",
                            pinned=True,
                        )
                    # ── Unavailable-tool loop breaker ─────────────────────
                    _err_str = str(result.get("error") or "")
                    if "is not available to" in _err_str or "is permanently blocked" in _err_str:
                        _unavailable_consecutive += 1
                        if _unavailable_consecutive >= _UNAVAILABLE_TOOL_FORCE_DONE:
                            # Agent is stuck in an infinite loop calling unavailable tools.
                            # Force-stop to prevent wasting tokens.
                            self._log.error(
                                "Agent %s called unavailable tools %d times — force-stopping",
                                self.agent_id, _unavailable_consecutive,
                            )
                            self.memory.add_tool_result(
                                f"[SYSTEM] FORCE STOP: Agent called unavailable tools "
                                f"{_unavailable_consecutive} times. Terminating.",
                                pinned=True,
                            )
                            self._state = AgentState.DONE
                            break
                        elif _unavailable_consecutive >= _UNAVAILABLE_TOOL_LIMIT:
                            available = self.get_available_tools()
                            self.memory.add_tool_result(
                                f"[SYSTEM] You have called unavailable/blocked tools "
                                f"{_unavailable_consecutive} times in a row. "
                                f"Your ONLY available tools are: {available}. "
                                f"If none of these can accomplish your task, you MUST call "
                                f'"done" immediately. Do NOT try any other tool.',
                                pinned=True,
                            )
                            self._log.warning(
                                "Unavailable-tool loop breaker fired for agent %s "
                                "(%d consecutive unavailable calls)",
                                self.agent_id, _unavailable_consecutive,
                            )
                    else:
                        _unavailable_consecutive = 0
                else:
                    _tool = action_dict.get("action", "unknown")
                    _unavailable_consecutive = 0
                    for k in list(_failure_counts):
                        if k.startswith(f"{_tool}|"):
                            _failure_counts[k] = 0

                # ── Connect-loop guard ─────────────────────────────────────
                # Detect shell_exec(action=connect) returning "already_open" in a loop.
                if (
                    result.get("success")
                    and action_dict.get("action") == "shell_exec"
                ):
                    _p_action = action_dict.get("parameters", {}).get("action", "")
                    _out = result.get("output") or {}
                    if (
                        _p_action == "connect"
                        and isinstance(_out, dict)
                        and _out.get("status") == "already_open"
                    ):
                        _sk = _out.get("session_key", "unknown")
                        _already_open_counts[_sk] = (
                            _already_open_counts.get(_sk, 0) + 1
                        )
                        if _already_open_counts[_sk] >= _CONNECT_LOOP_THRESHOLD:
                            self.memory.add_tool_result(
                                f"[SYSTEM] shell_exec(connect) returned 'already_open' "
                                f"{_already_open_counts[_sk]} times for '{_sk}'. "
                                f"The session is OPEN. STOP calling connect — "
                                f"call exec or exec_script instead.",
                                pinned=True,
                            )
                    elif _p_action in ("exec", "exec_script"):
                        _sk = action_dict.get("parameters", {}).get("session_key", "")
                        if _sk:
                            _already_open_counts[_sk] = 0

                # ── REFLECTING ────────────────────────────────────────────
                self._state = AgentState.REFLECTING
                await self.reflect()
                self._state = AgentState.REASONING

        except asyncio.CancelledError:
            self._log.info("Agent %s task was cancelled", self.agent_id)
            self._state = AgentState.ERROR
            raise  # re-raise for proper asyncio task cleanup

        finally:
            await self.on_run_end(self._state)

        # ── Build final result ────────────────────────────────────────────
        final_status = {
            AgentState.DONE: "success",
            AgentState.ERROR: "failed",
        }.get(self._state, "partial")

        self.emit_event("agent_done", {
            "status": final_status,
            "iterations": self._iteration,
            "findings_count": len(self._findings),
        })

        return AgentResult(
            agent_id=self.agent_id,
            agent_type=self.agent_type,
            status=final_status,
            findings=list(self._findings),
            iterations=self._iteration,
        )

    # ── ReAct steps ───────────────────────────────────────────────────────────

    async def reason(self) -> dict | None:
        """
        REASON: stream LLM response, parse JSON action.

        Tokens are emitted as "llm_token" events for real-time UI streaming.
        Returns parsed action dict, or None on LLM / JSON-parse failure.
        """
        response = ""
        try:
            messages = self.build_messages()

            # Append urgency note when operator injected a message
            if self._has_pending_inject:
                messages[-1]["content"] += (
                    "\n\n⚠️ OPERATOR INTERRUPT ACTIVE: The operator sent a message "
                    "(marked [OPERATOR INTERRUPT] above). Acknowledge it in 'thought' "
                    "and adjust your plan before choosing the next action."
                )

            self.emit_event("llm_thinking_start", {})
            async for token in self._llm.stream_chat(messages):
                if self._stream_abort.is_set():
                    self._log.info(
                        "LLM stream aborted (pause) for agent %s", self.agent_id
                    )
                    return None
                response += token
                self.emit_event("llm_token", {"token": token})

            action_dict = LLMRouter.parse_json(response)
            self.memory.add_assistant(response)

            if self._has_pending_inject:
                self._has_pending_inject = False
                self.emit_event("operator_response", {
                    "thought": action_dict.get("thought", "")[:600],
                })

            self.emit_event("reasoning", {
                "thought": action_dict.get("thought", ""),
                "action": action_dict.get("action", ""),
                "reasoning": action_dict.get("reasoning", ""),
            })
            return action_dict

        except json.JSONDecodeError:
            self._log.warning(
                "Agent %s: LLM returned invalid JSON: %r",
                self.agent_id, response[:200],
            )
            hint = (
                "Your last response was empty. You MUST respond with a single valid JSON object."
                if not response.strip()
                else (
                    "Your last response contained prose but no valid JSON object. "
                    "Respond ONLY with a single valid JSON object — "
                    "no explanatory text, no markdown, no [REFLECTION] blocks. Just raw JSON."
                )
            )
            self.memory.add_user(hint)
            return None

        except Exception as exc:
            self._log.error("Agent %s reason() failed: %s", self.agent_id, exc)
            self.emit_event("error", {"error": str(exc)})
            return None

    async def act(self, action_dict: dict) -> dict:
        """
        ACT: validate the action through the safety pipeline, then execute the tool.

        Returns: {"success": bool, "output": any, "error": str | None}
        """
        tool_name = action_dict.get("action", "")
        params = action_dict.get("parameters", {})

        # ── Empty action guard ────────────────────────────────────────────
        if not tool_name:
            available = self.get_available_tools()
            hint = (
                "[SYSTEM] Your last response had an empty or missing 'action' field. "
                f"You MUST specify one of the available tools: {available}. "
                "Respond with a valid JSON object containing 'action' and 'parameters'."
            )
            self.memory.add_user(hint)
            return {"success": False, "output": None, "error": "empty action — see hint above"}

        # ── Hard block (repeated-failure blacklist) ────────────────────────
        _block_key = tool_name
        if tool_name == "metasploit_run" and params.get("module"):
            _block_key = f"{tool_name}:{params['module']}"
        if self._session_blocked_calls.get(_block_key, 0) > 0:
            msg = (
                f"[SYSTEM] '{_block_key}' is permanently blocked this session "
                f"after repeated failures. Choose a completely different approach."
            )
            self._log.warning("Hard block prevented call to %s", _block_key)
            return {"success": False, "output": None, "error": msg}

        # ── Tool availability check ────────────────────────────────────────
        available = self.get_available_tools()
        if available and tool_name not in available:
            msg = (
                f"Tool '{tool_name}' is not available to {self.agent_type} agent. "
                f"Available tools: {available}"
            )
            self.emit_event("error", {"error": msg})
            return {"success": False, "output": None, "error": msg}

        # ── Safety check ──────────────────────────────────────────────────
        raw_target = str(params.get("target") or params.get("target_ip") or "")
        # CIDR ranges are valid nmap targets but not single IPs — skip per-IP check
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
            self.emit_event("safety_block", {"reason": reason, "tool": tool_name})
            await self._audit(
                "SAFETY_BLOCK",
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
            self.emit_event("error", {"error": msg})
            return {"success": False, "output": None, "error": msg}

        # ── Execute ───────────────────────────────────────────────────────
        self.emit_event("tool_call", {"tool": tool_name, "params": params})
        await self._audit(
            "TOOL_CALL",
            tool_name=tool_name,
            target=raw_target,
            details={"params": params},
        )

        try:
            result = await tool.execute(params)
        except Exception as exc:
            self._log.error("Tool '%s' raised an exception: %s", tool_name, exc)
            result = {"success": False, "output": None, "error": str(exc)}

        # Truncate large outputs before sending over WebSocket (~4 KB limit)
        raw_output = result.get("output") or result.get("error")
        output_str = json.dumps(raw_output, ensure_ascii=False, default=str)
        if len(output_str) > 3000:
            output_str = output_str[:3000] + "\n... [truncated]"

        success = result.get("success", False)
        self.emit_event("tool_result", {
            "tool": tool_name,
            "success": success,
            "output": output_str,
            "error": result.get("error"),
        })
        await self._audit(
            "TOOL_RESULT",
            tool_name=tool_name,
            target=raw_target,
            details={
                "success": success,
                "error": result.get("error"),
                "summary": output_str[:500],
            },
        )
        return result

    async def act_parallel(
        self, tool_calls: list[dict]
    ) -> list[tuple[dict, dict]]:
        """
        Execute multiple independent tool calls concurrently via asyncio.gather.

        Each call goes through the full act() pipeline (safety → execute → audit).
        Hard cap at 10 concurrent calls to prevent runaway parallelism.

        Returns a list of (action_dict, result) pairs.
        """
        capped = tool_calls[:10]
        if len(tool_calls) > 10:
            dropped = [c.get("action", "?") for c in tool_calls[10:]]
            self._log.warning(
                "parallel_tools: capped %d calls to 10 (dropped: %s)",
                len(tool_calls), dropped,
            )
            self.memory.add_tool_result(
                f"[SYSTEM] parallel_tools capped at 10 concurrent calls. "
                f"Dropped: {dropped}. Issue another parallel_tools for the rest."
            )

        self.emit_event("parallel_start", {
            "count": len(capped),
            "tools": [c.get("action") for c in capped],
        })

        async def _safe_act(call: dict) -> tuple[dict, dict]:
            try:
                res = await self.act(call)
            except Exception as exc:
                self._log.error(
                    "parallel act() raised for %s: %s", call.get("action"), exc
                )
                res = {"success": False, "output": None, "error": str(exc)}
            return call, res

        raw = await asyncio.gather(
            *[_safe_act(c) for c in capped], return_exceptions=True
        )

        pairs: list[tuple[dict, dict]] = []
        for item in raw:
            if isinstance(item, Exception):
                self._log.error("parallel gather raised: %s", item)
            else:
                pairs.append(item)  # type: ignore[arg-type]

        self.emit_event("parallel_done", {"count": len(pairs)})
        return pairs

    async def observe(self, result: dict, action_dict: dict) -> None:
        """
        OBSERVE: add tool result to memory, then call process_result().

        Critical findings (pinned by process_result via memory.add_tool_result
        with pinned=True) survive the sliding-window truncation.
        """
        tool_name = action_dict.get("action", "")
        success = result.get("success", False)

        raw_output = result.get("output") or result.get("error")
        output_str = self._summarize_tool_output(tool_name, raw_output, success)

        content = (
            f"TOOL_RESULT: {tool_name}\n"
            f"SUCCESS: {success}\n"
            f"OUTPUT: {output_str}"
        )
        # Note: process_result() may call memory.add_tool_result() with pinned=True
        # for critical findings. The default observe() adds a non-pinned entry here.
        self.memory.add_tool_result(content, pinned=False)

        await self.process_result(tool_name, result, action_dict)

        self.emit_event("observation", {
            "tool": tool_name,
            "success": success,
        })
