"""
TIRPAN Defense — Session Lifecycle Manager

Manages the lifecycle of a defense session:
  - Creates/starts/stops the NetworkMonitor
  - Creates/starts/stops the DefenseAgent
  - Wires alert callbacks (detector → agent → WebSocket)
  - Persists session state to DB

One DefenseSession instance per active defense monitoring session.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable

from database.repositories import (
    DefenseAlertRepository,
    DefenseBlockRepository,
    DefenseDeceptionRepository,
    DefenseEventRepository,
    DefenseSessionRepository,
    AttackerProfileRepository,
)
from defense.defense_agent import DefenseAgent
from defense.monitor import NetworkMonitor

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, dict], None]


class DefenseSession:
    """
    Lifecycle manager for a single defense session.

    Creates and wires together:
      NetworkMonitor (packet/log capture) →
      DefenseAgent (LLM reasoning) →
      ProgressCallback (WebSocket events to UI)
    """

    def __init__(
        self,
        session_id: str,
        network: str,
        mode: str,
        progress_callback: ProgressCallback | None = None,
        config: dict | None = None,
        db_path=None,
    ):
        self.session_id = session_id
        self.network = network
        self.mode = mode
        self._progress_cb = progress_callback
        self._config = config or {}

        # Repositories
        self._session_repo = DefenseSessionRepository(db_path)
        self._alert_repo = DefenseAlertRepository(db_path)
        self._block_repo = DefenseBlockRepository(db_path)
        self._deception_repo = DefenseDeceptionRepository(db_path)
        self._profile_repo = AttackerProfileRepository(db_path)
        self._event_repo = DefenseEventRepository(db_path)

        # Components (created on start)
        self._monitor: NetworkMonitor | None = None
        self._agent: DefenseAgent | None = None
        self._running = False

    async def start(self, remote_hosts: list[dict] | None = None) -> None:
        """
        Start the defense session:
        1. Update DB status → 'monitoring'
        2. Create and start NetworkMonitor
        3. Create and start DefenseAgent
        """
        if self._running:
            return

        await self._session_repo.update_status(
            self.session_id, "monitoring", started_at=time.time()
        )

        # Defense agent (wires to WebSocket)
        self._agent = DefenseAgent(
            defense_sid=self.session_id,
            network=self.network,
            mode=self.mode,
            alert_repo=self._alert_repo,
            block_repo=self._block_repo,
            deception_repo=self._deception_repo,
            profile_repo=self._profile_repo,
            event_repo=self._event_repo,
            progress_callback=self._progress_cb,
            config=self._config,
        )

        # Network monitor (wires to detector → agent alerts)
        def _on_detector_alert(alert: dict) -> None:
            """Called by DetectorEngine when a rule threshold is crossed."""
            if self._agent:
                self._agent.inject_alert(alert)
            if self._progress_cb:
                self._progress_cb("defense_detector_alert", {
                    "defense_sid": self.session_id,
                    **alert,
                })

        self._monitor = NetworkMonitor(
            alert_callback=_on_detector_alert,
            network=self.network,
            config=self._config,
        )

        await self._monitor.start(remote_hosts=remote_hosts)
        await self._agent.start()
        self._running = True

        logger.info(
            "DefenseSession started: %s network=%s mode=%s remote_hosts=%d",
            self.session_id, self.network, self.mode, len(remote_hosts or []),
        )

        if self._progress_cb:
            self._progress_cb("defense_session_started", {
                "defense_sid": self.session_id,
                "network": self.network,
                "mode": self.mode,
            })

    async def stop(self) -> None:
        """Stop monitoring and agent, update DB status."""
        if not self._running:
            return

        self._running = False

        if self._agent:
            await self._agent.stop()
            self._agent = None

        if self._monitor:
            await self._monitor.stop()
            self._monitor = None

        await self._session_repo.update_status(
            self.session_id, "idle", stopped_at=time.time()
        )

        logger.info("DefenseSession stopped: %s", self.session_id)
        if self._progress_cb:
            self._progress_cb("defense_session_stopped", {
                "defense_sid": self.session_id,
            })

    def switch_mode(self, mode: str) -> None:
        """Switch agent mode (manual ↔ auto)."""
        self.mode = mode
        if self._agent:
            self._agent.switch_mode(mode)

    def inject_message(self, message: str) -> None:
        """Send an operator message to the agent."""
        if self._agent:
            self._agent.inject_message(message)

    async def respond_to_approval(self, approval_id: str, approved: bool) -> bool:
        """Forward an approval response to the agent."""
        if self._agent:
            return await self._agent.respond_to_approval(approval_id, approved)
        return False

    def inject_from_pentest(self, event_type: str, event_data: dict) -> None:
        """
        Battle mode: forward a pentest event to the defense agent.
        Called by the session orchestration layer.
        """
        if self._agent and self._agent._battle_mode:
            self._agent.handle_red_team_event(event_type, event_data)

    async def enable_battle_mode(self, pentest_session_id: str) -> None:
        if self._agent:
            await self._agent.enable_battle_mode(pentest_session_id)

    async def disable_battle_mode(self) -> None:
        if self._agent:
            await self._agent.disable_battle_mode()

    def detector_status(self) -> dict:
        """Return current detector enable/disable status."""
        if self._monitor:
            return self._monitor.detector.status()
        return {}

    def set_detector_enabled(self, detector_name: str, enabled: bool) -> None:
        if self._monitor:
            self._monitor.detector.set_enabled(detector_name, enabled)

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def agent_state(self) -> str:
        if not self._agent:
            return "stopped"
        return self._agent.state.name.lower()


# ── Global session registry ───────────────────────────────────────────────────

_ACTIVE_SESSIONS: dict[str, DefenseSession] = {}


def get_session(session_id: str) -> DefenseSession | None:
    return _ACTIVE_SESSIONS.get(session_id)


def register_session(session: DefenseSession) -> None:
    _ACTIVE_SESSIONS[session.session_id] = session


def unregister_session(session_id: str) -> None:
    _ACTIVE_SESSIONS.pop(session_id, None)


def all_sessions() -> list[DefenseSession]:
    return list(_ACTIVE_SESSIONS.values())
