"""
TIRPAN Defense — Defense Agent

Autonomous blue team LLM agent that:
  1. Receives alerts from the DetectorEngine via an asyncio queue
  2. Runs ReAct loops to analyze, profile attackers, and respond
  3. Manages deception infrastructure (honeypots, canaries)
  4. Predicts attacker next moves and pre-hardens targets
  5. Supports manual (approval-required) and auto modes

The agent uses the same LLMRouter as the red team agents but with
a completely different system prompt and tool set.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from collections.abc import Callable
from enum import Enum, auto
from typing import Any

from core.llm_client import llm_router

from defense.attacker_profiler import AttackerProfiler
from defense.predictor import KillChainPredictor
from defense.prompts import (
    build_analysis_prompt,
    build_battle_mode_prompt,
    build_defense_system_prompt,
    build_prediction_prompt,
)
from defense.tools.alert_tool import CreateAlertTool
from defense.tools.block_tool import BlockIpTool
from defense.tools.canary_tool import DeployCanaryTool
from defense.tools.deception_tool import DeceptionOpsTool
from defense.tools.harden_tool import HardenServiceTool
from defense.tools.honeypot_tool import DeployHoneypotTool
from defense.tools.log_analysis_tool import AnalyzeLogsTool
from defense.tools.network_survey_tool import NetworkSurveyTool
from defense.tools.pcap_tool import CapturePcapTool
from defense.tools.ssh_remote_tool import SshRemoteCmdTool
from defense.tools.update_profile_tool import UpdateAttackerProfileTool

logger = logging.getLogger(__name__)

# ── Agent state ───────────────────────────────────────────────────────────────


class DefenseAgentState(Enum):
    IDLE = auto()
    MONITORING = auto()      # Passive watch between alerts
    ANALYZING = auto()       # Processing an alert with LLM
    RESPONDING = auto()      # Executing a tool
    WAITING_APPROVAL = auto()  # Manual mode: waiting for human
    STOPPED = auto()


ProgressCallback = Callable[[str, dict], None]


# ── Defense Tool Registry ─────────────────────────────────────────────────────

class DefenseToolRegistry:
    """Lightweight tool registry for defense-specific tools."""

    def __init__(self, tools: list):
        self._tools: dict[str, Any] = {t.metadata.name: t for t in tools}

    def get(self, name: str):
        return self._tools.get(name)

    def all_tool_defs(self) -> list[dict]:
        return [t.metadata.model_dump() for t in self._tools.values()]

    def all_tool_descriptions(self) -> str:
        lines = []
        for t in self._tools.values():
            m = t.metadata
            lines.append(f"  {m.name}: {m.description[:120]}")
        return "\n".join(lines)


# ── LLM JSON extractor ────────────────────────────────────────────────────────

_JSON_RE = re.compile(r"\{[\s\S]*\}", re.MULTILINE)


def _extract_json(text: str) -> dict | None:
    """Extract the first valid JSON object from LLM output."""
    text = text.strip()
    # Try direct parse first
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    # Regex fallback
    m = _JSON_RE.search(text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return None


# ── Defense Agent ─────────────────────────────────────────────────────────────


class DefenseAgent:
    """
    Autonomous blue team defense agent.

    Designed to run indefinitely as a background task, consuming alerts
    from an asyncio.Queue and responding with LLM-driven decisions.
    """

    MAX_ITERATIONS_PER_ALERT = 8  # Max LLM steps per alert before returning to monitoring

    def __init__(
        self,
        defense_sid: str,
        network: str,
        mode: str,
        alert_repo,
        block_repo,
        deception_repo,
        profile_repo,
        event_repo,
        progress_callback: ProgressCallback | None = None,
        config: dict | None = None,
    ):
        self.agent_id = str(uuid.uuid4())
        self.defense_sid = defense_sid
        self.network = network
        self.mode = mode  # 'manual' | 'auto'

        self._alert_repo = alert_repo
        self._block_repo = block_repo
        self._deception_repo = deception_repo
        self._profile_repo = profile_repo
        self._event_repo = event_repo
        self._progress_cb = progress_callback
        self._config = config or {}

        self._state = DefenseAgentState.IDLE
        self._running = False
        self._alert_queue: asyncio.Queue[dict] = asyncio.Queue()
        self._task: asyncio.Task | None = None

        # Pending approvals: approval_id → (action_dict, event)
        self._pending_approvals: dict[str, tuple[dict, asyncio.Event]] = {}

        # In-memory profiler
        self._profiler = AttackerProfiler()
        self._predictor = KillChainPredictor(self._profiler)

        # Battle mode
        self._battle_mode = False
        self._battle_pentest_sid: str | None = None

        # Tool instances
        self._registry = self._build_registry()

    def _build_registry(self) -> DefenseToolRegistry:
        def cb(event_type: str, data: dict) -> None:
            self._emit(event_type, data)

        tools = [
            CreateAlertTool(self.defense_sid, self._alert_repo, cb),
            UpdateAttackerProfileTool(self.defense_sid, self._profile_repo, cb),
            BlockIpTool(),
            DeployHoneypotTool(cb),
            DeployCanaryTool(cb),
            AnalyzeLogsTool(),
            NetworkSurveyTool(),
            CapturePcapTool(),
            HardenServiceTool(),
            SshRemoteCmdTool(),
            DeceptionOpsTool(cb),
        ]
        return DefenseToolRegistry(tools)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start the agent's background task."""
        if self._running:
            return
        self._running = True
        self._state = DefenseAgentState.MONITORING
        self._task = asyncio.create_task(self._main_loop())
        logger.info("DefenseAgent started: sid=%s network=%s mode=%s",
                    self.defense_sid, self.network, self.mode)
        self._emit("defense_status", {
            "status": "monitoring",
            "network": self.network,
            "mode": self.mode,
        })

    async def stop(self) -> None:
        """Stop the agent gracefully."""
        self._running = False
        self._state = DefenseAgentState.STOPPED
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("DefenseAgent stopped: sid=%s", self.defense_sid)
        self._emit("defense_status", {"status": "stopped"})

    def inject_alert(self, alert: dict) -> None:
        """Inject a detector alert into the processing queue."""
        self._alert_queue.put_nowait(alert)

    def inject_message(self, message: str) -> None:
        """Inject an operator message (will be processed as a special alert)."""
        self._alert_queue.put_nowait({
            "alert_type": "OPERATOR_MESSAGE",
            "severity": "LOW",
            "details": {"message": message},
            "timestamp": time.time(),
        })

    def switch_mode(self, mode: str) -> None:
        """Switch between manual and auto mode."""
        self.mode = mode
        self._emit("defense_status", {"mode": mode})
        logger.info("DefenseAgent mode switched to: %s", mode)

    async def enable_battle_mode(self, pentest_session_id: str) -> None:
        """Enable battle mode — connect to active pentest session."""
        self._battle_mode = True
        self._battle_pentest_sid = pentest_session_id
        self._emit("defense_status", {
            "battle_mode": True,
            "pentest_sid": pentest_session_id,
        })
        logger.info("Battle mode enabled: pentest_sid=%s", pentest_session_id)

    async def disable_battle_mode(self) -> None:
        self._battle_mode = False
        self._battle_pentest_sid = None
        self._emit("defense_status", {"battle_mode": False})

    # ── Approval management ───────────────────────────────────────────────────

    async def respond_to_approval(self, approval_id: str, approved: bool) -> bool:
        """Called by the API route when operator approves/denies an action."""
        entry = self._pending_approvals.get(approval_id)
        if not entry:
            return False
        action_dict, event = entry
        action_dict["_approved"] = approved
        event.set()
        return True

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def _main_loop(self) -> None:
        """Main event loop: wait for alerts, process them."""
        while self._running:
            try:
                # Wait for next alert (with timeout for periodic tasks)
                try:
                    alert = await asyncio.wait_for(
                        self._alert_queue.get(), timeout=30.0
                    )
                except asyncio.TimeoutError:
                    # Periodic monitoring cycle — check for new log events
                    await self._periodic_monitoring_cycle()
                    continue

                if not self._running:
                    break

                self._state = DefenseAgentState.ANALYZING
                await self._process_alert(alert)
                self._state = DefenseAgentState.MONITORING
                self._alert_queue.task_done()

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.exception("DefenseAgent main loop error")
                await asyncio.sleep(1)

    async def _periodic_monitoring_cycle(self) -> None:
        """
        Run every 30 seconds when no alerts are pending.
        Checks if any prediction has high enough confidence to warrant pre-action.
        """
        profiles = self._profiler.all_profiles()
        for profile in profiles:
            if profile.next_move_conf >= 0.75 and profile.next_move:
                # High confidence prediction — run a pre-hardening LLM cycle
                self._emit("defense_reasoning", {
                    "thought": (
                        f"Proactive monitoring: attacker {profile.src_ip} predicted to attempt "
                        f"{profile.next_move} (conf: {profile.next_move_conf:.0%}). "
                        f"Running pre-emptive hardening cycle."
                    ),
                    "phase": "proactive",
                })
                prediction_alert = {
                    "alert_type": "PREDICTION",
                    "severity": "MEDIUM",
                    "src_ip": profile.src_ip,
                    "details": {
                        "predicted_ttp": profile.next_move,
                        "confidence": profile.next_move_conf,
                    },
                    "timestamp": time.time(),
                }
                await self._process_alert(prediction_alert)
                break  # One proactive cycle per monitoring period

    # ── Alert processing ──────────────────────────────────────────────────────

    async def _process_alert(self, alert: dict) -> None:
        """Run a ReAct loop to analyze and respond to a single alert."""
        src_ip = alert.get("src_ip", "")
        alert_type = alert.get("alert_type", "UNKNOWN")

        # Update in-memory profile
        if src_ip:
            profile = self._profiler.update_from_alert(alert)
        else:
            profile = None

        # Fetch existing DB profile
        db_profile = None
        if src_ip:
            db_profile = await self._profile_repo.get_by_ip(self.defense_sid, src_ip)

        # Fetch recent alerts for context
        recent_alerts = await self._alert_repo.list_for_session(
            self.defense_sid, limit=10
        )

        # Build context for LLM
        if alert_type == "PREDICTION":
            user_msg = build_prediction_prompt(
                attacker_profile=db_profile or (profile.__dict__ if profile else {}),
                recent_alerts=recent_alerts,
                network=self.network,
            )
        elif alert_type == "OPERATOR_MESSAGE":
            user_msg = alert.get("details", {}).get("message", "")
        else:
            user_msg = build_analysis_prompt(
                alert=alert,
                attacker_profile=db_profile,
            )

        system_msg = build_defense_system_prompt(
            network=self.network,
            mode=self.mode,
        )

        # Emit that we're starting analysis
        self._emit("defense_reasoning", {
            "thought": f"Received {alert_type} alert from {src_ip or 'unknown'}. Beginning analysis...",
            "phase": "analyzing",
            "alert_type": alert_type,
            "src_ip": src_ip,
        })

        # ReAct loop for this alert
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ]

        for iteration in range(self.MAX_ITERATIONS_PER_ALERT):
            if not self._running:
                break

            # Call LLM
            action_dict = await self._call_llm(messages)
            if not action_dict:
                break

            thought = action_dict.get("thought", "")
            action = action_dict.get("action", "")
            params = action_dict.get("parameters", {})

            # Emit reasoning token
            self._emit("defense_reasoning", {
                "thought": thought,
                "action": action,
                "phase": "reasoning",
                "iteration": iteration,
            })

            # Terminal actions
            if action in ("done", "monitor", ""):
                break

            # Tool execution
            result = await self._execute_action(action, params)

            # Format tool result for next LLM turn
            result_summary = self._summarize_result(action, result)
            messages.append({"role": "assistant", "content": json.dumps(action_dict)})
            messages.append({"role": "user", "content": f"Tool result for {action}:\n{result_summary}\n\nContinue. What is your next action?"})

            # Trim context if getting long
            if len(messages) > 20:
                # Keep system + first user message + last 8 exchanges
                messages = messages[:2] + messages[-16:]

        # Persist the event
        await self._event_repo.append(
            self.defense_sid,
            "agent_cycle_complete",
            {"alert_type": alert_type, "src_ip": src_ip, "iterations": iteration + 1},
        )

    # ── LLM call ──────────────────────────────────────────────────────────────

    async def _call_llm(self, messages: list[dict]) -> dict | None:
        """Call the LLM and return parsed JSON action."""
        full_response = ""

        async def _stream_cb(token: str) -> None:
            nonlocal full_response
            full_response += token
            self._emit("defense_token", {"content": token})

        try:
            await llm_router.stream(
                messages=messages,
                on_token=_stream_cb,
            )
        except Exception as exc:
            logger.warning("LLM call failed: %s", exc)
            return None

        action = _extract_json(full_response)
        if not action:
            logger.warning("Could not parse JSON from LLM: %r", full_response[:200])
            return {"thought": full_response[:500], "action": "monitor", "parameters": {}}

        return action

    # ── Action execution ──────────────────────────────────────────────────────

    async def _execute_action(self, tool_name: str, params: dict) -> dict:
        """Execute a tool, handling manual approval if needed."""
        # Check if this action needs approval in manual mode
        if self.mode == "manual" and self._requires_approval(tool_name):
            approved = await self._request_approval(tool_name, params)
            if not approved:
                self._emit("defense_reasoning", {
                    "thought": f"Operator denied action: {tool_name}",
                    "phase": "denied",
                })
                return {"success": False, "output": None, "error": "Denied by operator"}

        self._state = DefenseAgentState.RESPONDING
        tool = self._registry.get(tool_name)

        if not tool:
            return {"success": False, "output": None,
                    "error": f"Unknown tool: {tool_name}"}

        try:
            result = await tool.execute(params)
            self._emit("defense_action", {
                "tool": tool_name,
                "params": params,
                "success": result.get("success", False),
                "output": result.get("output"),
            })

            # Persist block actions to DB
            if tool_name == "block_ip" and result.get("success"):
                output = result.get("output", {})
                await self._block_repo.create(
                    defense_sid=self.defense_sid,
                    block_type=params.get("action", "DROP"),
                    target_ip=params.get("ip", ""),
                    reason=params.get("reason", "defense agent"),
                    target_port=params.get("port"),
                    rule_id=output.get("rule_id"),
                )
                self._emit("defense_block", {
                    "ip": params.get("ip"),
                    "action": params.get("action"),
                    "rule_id": output.get("rule_id"),
                    "reason": params.get("reason"),
                })

            # Persist honeypot/canary to DB
            if tool_name in ("deploy_honeypot", "deploy_canary") and result.get("success"):
                output = result.get("output", {})
                await self._deception_repo.create(
                    defense_sid=self.defense_sid,
                    deception_type="HONEYPOT" if tool_name == "deploy_honeypot" else "CANARY",
                    bind_port=output.get("port"),
                    fake_service=output.get("fake_service") or output.get("canary_type"),
                    details=output,
                )
                self._emit("defense_deception", {
                    "deception_type": "HONEYPOT" if tool_name == "deploy_honeypot" else "CANARY",
                    "port": output.get("port"),
                    "details": output,
                })

            return result

        except Exception as exc:
            logger.exception("Tool execution error: %s", tool_name)
            return {"success": False, "output": None, "error": str(exc)}
        finally:
            self._state = DefenseAgentState.ANALYZING

    def _requires_approval(self, tool_name: str) -> bool:
        """Tools that require human approval in manual mode."""
        return tool_name in {
            "block_ip", "harden_service", "ssh_remote_cmd", "deception_ops"
        }

    async def _request_approval(self, tool_name: str, params: dict) -> bool:
        """
        Emit an approval request and wait for operator response.
        Returns True if approved, False if denied (or timed out).
        """
        approval_id = str(uuid.uuid4())[:8]
        event = asyncio.Event()
        action_dict: dict = {"tool": tool_name, "params": params}
        self._pending_approvals[approval_id] = (action_dict, event)

        self._emit("defense_approval_request", {
            "approval_id": approval_id,
            "tool": tool_name,
            "params": params,
        })
        self._state = DefenseAgentState.WAITING_APPROVAL

        try:
            # Wait up to 5 minutes for approval
            await asyncio.wait_for(event.wait(), timeout=300.0)
            approved = action_dict.get("_approved", False)
        except asyncio.TimeoutError:
            approved = False
            logger.warning("Approval request timed out: %s", approval_id)
        finally:
            self._pending_approvals.pop(approval_id, None)

        return approved

    # ── Event emission ────────────────────────────────────────────────────────

    def _emit(self, event_type: str, data: dict) -> None:
        if self._progress_cb:
            try:
                self._progress_cb(event_type, {
                    "defense_sid": self.defense_sid,
                    "agent_id": self.agent_id,
                    **data,
                })
            except Exception as exc:
                logger.debug("emit failed: %s", exc)

    # ── Battle mode integration ───────────────────────────────────────────────

    def handle_red_team_event(self, event_type: str, event_data: dict) -> None:
        """
        Called by the session manager when a pentest event occurs (battle mode).
        Immediately injects a high-priority alert into the queue.
        """
        if not self._battle_mode:
            return

        defense_state = {
            "active_blocks": 0,   # Would query DB in real impl
            "active_honeypots": 0,
            "open_alerts": 0,
            "profiles": len(self._profiler.all_profiles()),
        }

        battle_alert = {
            "alert_type": "BATTLE_MODE_EVENT",
            "severity": "HIGH",
            "src_ip": event_data.get("target", ""),
            "details": {
                "red_team_event": event_type,
                "event_data": event_data,
                "battle_prompt": build_battle_mode_prompt(
                    event_type, event_data, defense_state
                ),
            },
            "timestamp": time.time(),
        }
        self._alert_queue.put_nowait(battle_alert)

    # ── Output formatting ─────────────────────────────────────────────────────

    def _summarize_result(self, tool_name: str, result: dict) -> str:
        success = result.get("success", False)
        output = result.get("output")
        error = result.get("error")

        if not success:
            return f"FAILED: {error}"

        if tool_name == "analyze_logs" and isinstance(output, dict):
            top_attackers = output.get("top_attackers", [])[:5]
            summary_parts = [f"Log analysis complete. {output.get('total_lines', 0)} lines parsed."]
            if top_attackers:
                summary_parts.append("Top attackers by failed login count:")
                for a in top_attackers:
                    summary_parts.append(f"  {a['ip']}: {a['attempts']} attempts")
            if output.get("successful_logins"):
                summary_parts.append(f"Successful logins: {output['successful_logins'][:3]}")
            if output.get("suspicious_commands"):
                summary_parts.append(f"Suspicious commands: {output['suspicious_commands'][:3]}")
            return "\n".join(summary_parts)

        if tool_name == "network_survey" and isinstance(output, dict):
            hosts = output.get("hosts", [])
            up_hosts = [h for h in hosts if h.get("state") == "up"]
            summary_parts = [
                f"Network survey of {output.get('target')}: "
                f"{len(up_hosts)}/{len(hosts)} hosts up"
            ]
            for h in up_hosts[:10]:
                ports = [f"{p['number']}/{p['service']}" for p in h.get("open_ports", [])[:5]]
                summary_parts.append(f"  {h['ip']}: {', '.join(ports) or 'no open ports'}")
            return "\n".join(summary_parts)

        # Generic
        output_str = json.dumps(output, ensure_ascii=False, default=str)
        if len(output_str) > 2000:
            output_str = output_str[:2000] + " ... [truncated]"
        return f"SUCCESS: {output_str}"

    @property
    def state(self) -> DefenseAgentState:
        return self._state

    @property
    def is_running(self) -> bool:
        return self._running
