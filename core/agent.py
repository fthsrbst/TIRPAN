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
from database.repositories import ScanResultRepository, SessionRepository, VulnerabilityRepository
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

    iteration: int = 0
    attack_phase: str = "DISCOVERY"  # DISCOVERY|PORT_SCAN|EXPLOIT_SEARCH|EXPLOITATION|DONE
    port_range: str = "1-65535"      # nmap port range hint passed to the LLM via prompt
    notes: str = ""                  # operator-supplied notes injected into every prompt

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
    ):
        self.session = session
        self.memory = SessionMemory()
        self._ctx = AgentContext(target=target, mode=mode, port_range=port_range, notes=notes)
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
        self._session_repo = SessionRepository()
        # Pause/resume control
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Not paused initially
        self._paused = False
        # Signals the active LLM stream to abort immediately on pause
        self._stream_abort = asyncio.Event()
        # Operator inject tracking
        self._has_pending_inject = False

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

            # ── ACTING ───────────────────────────────────────────────────
            self._state = AgentState.ACTING
            result = await self.act(action_dict)

            # ── OBSERVING ────────────────────────────────────────────────
            self._state = AgentState.OBSERVING
            await self.observe(result, action_dict)

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
            logger.error("LLM returned invalid JSON: %s", exc)
            self._emit("error", {"error": f"Invalid JSON from LLM: {exc}"})
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
        try:
            result = await tool.execute(params)
        except BaseException as exc:
            logger.error("Tool '%s' raised %s: %r", tool_name, type(exc).__name__, str(exc))
            result = {"success": False, "output": None, "error": str(exc) or f"{type(exc).__name__} (no message)"}
            if not isinstance(exc, Exception):
                raise

        # Truncate raw output so the WS event stays under ~4 KB
        raw_output = result.get("output") or result.get("error")
        output_str = json.dumps(raw_output, ensure_ascii=False, default=str)
        if len(output_str) > 3000:
            output_str = output_str[:3000] + "\n... [truncated]"

        self._emit(
            "tool_result",
            {
                "tool": tool_name,
                "success": result.get("success", False),
                "output": output_str,
                "error": result.get("error"),
            },
        )
        return result

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
        output_str = json.dumps(raw_output, ensure_ascii=False, default=str)
        if len(output_str) > 3000:
            output_str = output_str[:3000] + " ... [truncated]"

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

            elif tool_name == "searchsploit_search":
                vulns = output.get("vulnerabilities", [])
                for v in vulns:
                    await self._vuln_repo.save(session_id=self.session.id, vuln=v)

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

        # Advance phase when we have vulnerabilities and exploitation is allowed
        if (
            self._ctx.vulnerabilities
            and self._ctx.mode != "scan_only"
            and self._ctx.attack_phase == "EXPLOIT_SEARCH"
        ):
            self._ctx.attack_phase = "EXPLOITATION"
            logger.info("Phase → EXPLOITATION")
            self._emit("phase_change", {
                "attack_phase": "EXPLOITATION",
                "vulns": self._ctx.total_vulns,
            })

    def _process_metasploit_result(self, output: dict | list, params: dict) -> None:
        module = str(params.get("module", "unknown"))
        target_ip = str(params.get("target_ip", ""))
        session_id = None
        if isinstance(output, dict):
            session_id = output.get("session_id")
        summary = (
            f"{target_ip} | {module} | "
            f"session_id={session_id}"
        )
        self._ctx.exploit_results.append(summary)
        logger.info("Exploit result recorded: %s", summary)
