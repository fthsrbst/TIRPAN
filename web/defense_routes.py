"""
TIRPAN Defense — REST API Routes

Endpoints:
  POST   /api/v1/defense/sessions              Create defense session
  GET    /api/v1/defense/sessions              List defense sessions
  GET    /api/v1/defense/sessions/{id}         Session detail
  POST   /api/v1/defense/sessions/{id}/start   Start monitoring
  POST   /api/v1/defense/sessions/{id}/stop    Stop monitoring
  PATCH  /api/v1/defense/sessions/{id}/mode    Switch manual/auto

  GET    /api/v1/defense/sessions/{id}/alerts        Get alerts
  PATCH  /api/v1/defense/alerts/{id}                 Update alert status
  GET    /api/v1/defense/sessions/{id}/blocks        Get blocks
  DELETE /api/v1/defense/blocks/{id}                 Remove block rule
  GET    /api/v1/defense/sessions/{id}/deceptions    Honeypots/canaries
  GET    /api/v1/defense/sessions/{id}/profiles      Attacker profiles
  GET    /api/v1/defense/sessions/{id}/events        Event stream

  POST   /api/v1/defense/sessions/{id}/inject         Operator message
  POST   /api/v1/defense/approval/{id}/respond         Approve/deny action
  GET    /api/v1/defense/sessions/{id}/detector        Detector status
  PATCH  /api/v1/defense/sessions/{id}/detector        Toggle detector
  POST   /api/v1/defense/sessions/{id}/battle         Enable battle mode
  DELETE /api/v1/defense/sessions/{id}/battle         Disable battle mode
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from database.repositories import (
    AttackerProfileRepository,
    DefenseAlertRepository,
    DefenseBlockRepository,
    DefenseDeceptionRepository,
    DefenseEventRepository,
    DefenseSessionRepository,
)
from defense.defense_session import (
    DefenseSession,
    all_sessions,
    get_session,
    register_session,
    unregister_session,
)

logger = logging.getLogger(__name__)

defense_router = APIRouter(prefix="/api/v1/defense", tags=["defense"])

# Repositories (shared, stateless)
_session_repo = DefenseSessionRepository()
_alert_repo = DefenseAlertRepository()
_block_repo = DefenseBlockRepository()
_deception_repo = DefenseDeceptionRepository()
_profile_repo = AttackerProfileRepository()
_event_repo = DefenseEventRepository()


# ── Request models ────────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    network: str
    name: Optional[str] = ""
    mode: Optional[str] = "manual"


class StartSessionRequest(BaseModel):
    remote_hosts: Optional[list[dict]] = None


class SwitchModeRequest(BaseModel):
    mode: str  # "manual" | "auto"


class UpdateAlertRequest(BaseModel):
    status: str  # "open" | "investigating" | "resolved" | "fp"


class InjectMessageRequest(BaseModel):
    message: str


class ApprovalResponseRequest(BaseModel):
    approved: bool


class ToggleDetectorRequest(BaseModel):
    detector: str
    enabled: bool


class BattleModeRequest(BaseModel):
    pentest_session_id: str


# ── Session endpoints ─────────────────────────────────────────────────────────

@defense_router.post("/sessions")
async def create_session(req: CreateSessionRequest):
    """Create a new defense session (does not start monitoring yet)."""
    if not req.network:
        raise HTTPException(status_code=400, detail="network is required")

    session = await _session_repo.create(
        network=req.network,
        name=req.name or f"Defense-{req.network}",
        mode=req.mode or "manual",
    )
    return {"success": True, "session": session}


@defense_router.get("/sessions")
async def list_sessions():
    """List all defense sessions."""
    sessions = await _session_repo.list_all()
    # Annotate with live status
    for s in sessions:
        live = get_session(s["id"])
        s["live"] = live is not None and live.is_running
        s["agent_state"] = live.agent_state if live else "stopped"
    return {"sessions": sessions}


@defense_router.get("/sessions/{session_id}")
async def get_session_detail(session_id: str):
    """Get session detail with live status."""
    session = await _session_repo.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    live = get_session(session_id)
    session["live"] = live is not None and live.is_running
    session["agent_state"] = live.agent_state if live else "stopped"
    session["detector_status"] = live.detector_status() if live else {}
    return {"session": session}


@defense_router.post("/sessions/{session_id}/start")
async def start_session(session_id: str, req: StartSessionRequest, background_tasks: BackgroundTasks):
    """Start monitoring for a defense session."""
    db_session = await _session_repo.get(session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    live = get_session(session_id)
    if live and live.is_running:
        return {"success": True, "message": "Already monitoring"}

    # Create the session manager
    defense_session = DefenseSession(
        session_id=session_id,
        network=db_session["network"],
        mode=db_session["mode"],
        progress_callback=None,  # Will be wired by WebSocket handler
        config={},
    )
    register_session(defense_session)

    # Start in background so HTTP response is immediate
    background_tasks.add_task(
        defense_session.start,
        remote_hosts=req.remote_hosts,
    )

    return {"success": True, "message": "Defense monitoring starting..."}


@defense_router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    """Stop monitoring for a defense session."""
    live = get_session(session_id)
    if not live:
        # Not live — just update DB
        await _session_repo.update_status(session_id, "idle")
        return {"success": True, "message": "Session was not active"}

    await live.stop()
    unregister_session(session_id)
    return {"success": True, "message": "Defense monitoring stopped"}


@defense_router.patch("/sessions/{session_id}/mode")
async def switch_mode(session_id: str, req: SwitchModeRequest):
    """Switch between manual and auto mode."""
    if req.mode not in ("manual", "auto"):
        raise HTTPException(status_code=400, detail="mode must be 'manual' or 'auto'")

    await _session_repo.update_mode(session_id, req.mode)

    live = get_session(session_id)
    if live:
        live.switch_mode(req.mode)

    return {"success": True, "mode": req.mode}


@defense_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a defense session (must be stopped first)."""
    live = get_session(session_id)
    if live and live.is_running:
        raise HTTPException(status_code=400, detail="Stop the session before deleting")

    ok = await _session_repo.delete(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")

    unregister_session(session_id)
    return {"success": True}


# ── Alert endpoints ───────────────────────────────────────────────────────────

@defense_router.get("/sessions/{session_id}/alerts")
async def get_alerts(session_id: str, severity: Optional[str] = None, limit: int = 100):
    """Get alerts for a defense session."""
    alerts = await _alert_repo.list_for_session(session_id, limit=limit, severity=severity)
    return {"alerts": alerts, "count": len(alerts)}


@defense_router.patch("/alerts/{alert_id}")
async def update_alert(alert_id: str, req: UpdateAlertRequest):
    """Update alert status (investigating, resolved, fp)."""
    valid_statuses = ("open", "investigating", "resolved", "fp")
    if req.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of: {valid_statuses}"
        )
    ok = await _alert_repo.update_status(alert_id, req.status)
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True, "status": req.status}


# ── Block endpoints ───────────────────────────────────────────────────────────

@defense_router.get("/sessions/{session_id}/blocks")
async def get_blocks(session_id: str, active_only: bool = False):
    """Get block rules for a defense session."""
    blocks = await _block_repo.list_for_session(session_id, active_only=active_only)
    return {"blocks": blocks, "count": len(blocks)}


@defense_router.delete("/blocks/{block_id}")
async def remove_block(block_id: str):
    """
    Deactivate a block rule.
    Note: This removes the DB record but does NOT remove the iptables rule.
    Use the shell or ssh_remote_cmd to remove actual iptables rules.
    """
    ok = await _block_repo.deactivate(block_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Block not found")
    return {"success": True, "message": "Block deactivated in DB. Remove iptables rule manually."}


# ── Deception endpoints ───────────────────────────────────────────────────────

@defense_router.get("/sessions/{session_id}/deceptions")
async def get_deceptions(session_id: str):
    """Get deception infrastructure for a defense session."""
    deceptions = await _deception_repo.list_for_session(session_id)
    return {"deceptions": deceptions, "count": len(deceptions)}


# ── Attacker profile endpoints ─────────────────────────────────────────────────

@defense_router.get("/sessions/{session_id}/profiles")
async def get_profiles(session_id: str):
    """Get attacker profiles for a defense session."""
    profiles = await _profile_repo.list_for_session(session_id)
    return {"profiles": profiles, "count": len(profiles)}


@defense_router.get("/sessions/{session_id}/profiles/{src_ip}")
async def get_profile(session_id: str, src_ip: str):
    """Get attacker profile for a specific IP."""
    profile = await _profile_repo.get_by_ip(session_id, src_ip)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": profile}


# ── Event stream endpoints ────────────────────────────────────────────────────

@defense_router.get("/sessions/{session_id}/events")
async def get_events(session_id: str, since: Optional[float] = None, limit: int = 200):
    """Get defense events for a session (for replay/history)."""
    events = await _event_repo.list_for_session(session_id, since=since, limit=limit)
    return {"events": events, "count": len(events)}


# ── Operator control endpoints ────────────────────────────────────────────────

@defense_router.post("/sessions/{session_id}/inject")
async def inject_message(session_id: str, req: InjectMessageRequest):
    """Send an operator message to the defense agent."""
    live = get_session(session_id)
    if not live or not live.is_running:
        raise HTTPException(status_code=400, detail="Session is not currently monitoring")

    live.inject_message(req.message)
    return {"success": True, "message": "Message injected into agent"}


@defense_router.post("/approval/{approval_id}/respond")
async def respond_approval(approval_id: str, req: ApprovalResponseRequest):
    """Approve or deny a pending agent action (manual mode)."""
    # Find which session has this approval
    for session in all_sessions():
        ok = await session.respond_to_approval(approval_id, req.approved)
        if ok:
            return {
                "success": True,
                "approval_id": approval_id,
                "approved": req.approved,
            }

    raise HTTPException(status_code=404, detail="Approval request not found or expired")


# ── Detector control ──────────────────────────────────────────────────────────

@defense_router.get("/sessions/{session_id}/detector")
async def get_detector_status(session_id: str):
    """Get detector enable/disable status."""
    live = get_session(session_id)
    if not live:
        return {"detectors": {}}
    return {"detectors": live.detector_status()}


@defense_router.patch("/sessions/{session_id}/detector")
async def toggle_detector(session_id: str, req: ToggleDetectorRequest):
    """Enable or disable a specific detector."""
    valid_detectors = ("port_scan", "brute_force", "arp_spoof", "dos", "lateral", "exfil")
    if req.detector not in valid_detectors:
        raise HTTPException(
            status_code=400,
            detail=f"detector must be one of: {valid_detectors}"
        )

    live = get_session(session_id)
    if live:
        live.set_detector_enabled(req.detector, req.enabled)

    return {"success": True, "detector": req.detector, "enabled": req.enabled}


# ── Battle mode ───────────────────────────────────────────────────────────────

@defense_router.post("/sessions/{session_id}/battle")
async def enable_battle_mode(session_id: str, req: BattleModeRequest):
    """Enable battle mode — connect defense to active pentest session."""
    live = get_session(session_id)
    if not live or not live.is_running:
        raise HTTPException(status_code=400, detail="Defense session is not monitoring")

    await live.enable_battle_mode(req.pentest_session_id)
    return {
        "success": True,
        "battle_mode": True,
        "pentest_session_id": req.pentest_session_id,
    }


@defense_router.delete("/sessions/{session_id}/battle")
async def disable_battle_mode(session_id: str):
    """Disable battle mode."""
    live = get_session(session_id)
    if live:
        await live.disable_battle_mode()
    return {"success": True, "battle_mode": False}
