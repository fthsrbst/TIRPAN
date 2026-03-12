"""
REST API routes.
"""

import asyncio
import logging
import subprocess
import time
from typing import Optional

import httpx
import psutil
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from config import SafetyConfig, settings
from core.secure_store import async_get_secret, async_set_secret, get_secret
from database import db as database
from database.repositories import (
    AuditLogRepository,
    ExploitResultRepository,
    ScanResultRepository,
    SessionRepository,
    VulnerabilityRepository,
)
from web.stats_state import token_counter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")

# Repositories (shared, stateless)
_session_repo = SessionRepository()
_audit_repo = AuditLogRepository()
_scan_repo = ScanResultRepository()
_vuln_repo = VulnerabilityRepository()
_exploit_repo = ExploitResultRepository()


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# ── Ollama status ─────────────────────────────────────────────────────────────

@router.get("/ollama/status")
async def ollama_status():
    """Check if Ollama is reachable and list available models."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama.base_url}/api/tags")
            if resp.status_code == 200:
                models = [m["name"] for m in resp.json().get("models", [])]
                return {"online": True, "models": models, "current": settings.ollama.model}
            return {"online": False, "models": [], "current": settings.ollama.model}
    except Exception as e:
        return {"online": False, "models": [], "current": settings.ollama.model, "error": str(e)}


# ── Config ────────────────────────────────────────────────────────────────────

class OllamaSettings(BaseModel):
    base_url: str
    model: str


@router.get("/config/ollama")
async def get_ollama_config():
    return {
        "base_url": settings.ollama.base_url,
        "model": settings.ollama.model,
    }


# ── System Stats ───────────────────────────────────────────────────────────────

def _gpu_percent() -> Optional[int]:
    """Try to get GPU utilization via nvidia-smi. Returns None if unavailable."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2,
        )
        if result.returncode == 0:
            return int(result.stdout.strip().split("\n")[0])
    except Exception:
        pass
    return None


@router.get("/system/platform")
async def system_platform():
    """Return OS platform and privilege level for cross-platform UI adaptation."""
    from core.platform_utils import platform_name, is_elevated
    return {
        "platform": platform_name(),
        "is_elevated": is_elevated(),
    }


@router.get("/system/stats")
async def system_stats():
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    ram_used_gb = mem.used / (1024 ** 3)
    ram_total_gb = mem.total / (1024 ** 3)
    gpu = _gpu_percent()

    return {
        "cpu": round(cpu, 1),
        "ram_used_gb": round(ram_used_gb, 2),
        "ram_total_gb": round(ram_total_gb, 1),
        "gpu": gpu,
        "tokens": token_counter.total,
        "tokens_in": token_counter.total_input,
        "tokens_out": token_counter.total_output,
    }


# ── Conversations ─────────────────────────────────────────────────────────────

class NewConversation(BaseModel):
    title: str = "New Chat"

class UpdateTitle(BaseModel):
    title: str


@router.post("/conversations")
async def create_conversation(body: NewConversation):
    return await database.create_conversation(body.title)


@router.get("/conversations")
async def list_conversations():
    return await database.list_conversations()


@router.get("/conversations/{cid}")
async def get_conversation(cid: str):
    conv = await database.get_conversation(cid)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    messages = await database.get_messages(cid)
    return {**conv, "messages": messages}


@router.patch("/conversations/{cid}")
async def rename_conversation(cid: str, body: UpdateTitle):
    ok = await database.update_conversation_title(cid, body.title)
    if not ok:
        raise HTTPException(404, "Conversation not found")
    return {"ok": True}


@router.delete("/conversations/{cid}")
async def delete_conversation(cid: str):
    ok = await database.delete_conversation(cid)
    if not ok:
        raise HTTPException(404, "Conversation not found")
    return {"ok": True}


# ── Persistent Settings ────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings():
    return await database.get_all_settings()


@router.put("/settings/{key}")
async def set_setting(key: str, body: dict):
    await database.set_setting(key, body.get("value"))
    return {"ok": True}


@router.post("/config/ollama")
async def set_ollama_config_persisted(body: OllamaSettings):
    if body.base_url.startswith("http"):
        settings.ollama.base_url = body.base_url
    settings.ollama.model = body.model
    await database.set_setting("ollama_base_url", body.base_url)
    await database.set_setting("ollama_model", body.model)
    return {"ok": True}


# ── LM Studio ─────────────────────────────────────────────────────────────────

class LMStudioSettings(BaseModel):
    base_url: str
    model: str


@router.get("/lmstudio/status")
async def lmstudio_status():
    """Check if LM Studio is reachable and list available models."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.lmstudio.base_url}/v1/models")
            if resp.status_code == 200:
                data = resp.json()
                models = [m["id"] for m in data.get("data", [])]
                return {"online": True, "models": models, "current": settings.lmstudio.model}
            return {"online": False, "models": [], "current": settings.lmstudio.model}
    except Exception as e:
        return {"online": False, "models": [], "current": settings.lmstudio.model, "error": str(e)}


@router.get("/config/lmstudio")
async def get_lmstudio_config():
    return {
        "base_url": settings.lmstudio.base_url,
        "model": settings.lmstudio.model,
    }


@router.post("/config/lmstudio")
async def set_lmstudio_config(body: LMStudioSettings):
    if body.base_url.startswith("http"):
        settings.lmstudio.base_url = body.base_url
    settings.lmstudio.model = body.model
    await database.set_setting("lmstudio_base_url", body.base_url)
    await database.set_setting("lmstudio_model", body.model)
    return {"ok": True}


# ── Safety Config ─────────────────────────────────────────────────────────────

class SafetyConfigRequest(BaseModel):
    allowed_cidr: str = "10.0.0.0/8"
    allowed_port_min: int = 1
    allowed_port_max: int = 65535
    excluded_ips: str = ""           # comma-separated string from UI
    excluded_ports: str = ""         # comma-separated string from UI
    allow_exploit: bool = True
    block_dos_exploits: bool = True
    block_destructive: bool = True
    max_severity: str = "CRITICAL"   # LOW|MEDIUM|HIGH|CRITICAL
    session_max_seconds: int = 7200
    max_requests_per_second: int = 50


_SEVERITY_TO_CVSS = {"LOW": 3.9, "MEDIUM": 6.9, "HIGH": 8.9, "CRITICAL": 10.0}


@router.get("/config/safety")
async def get_safety_config():
    saved = await database.get_all_settings()
    return {
        "allowed_cidr": saved.get("safety_allowed_cidr", settings.safety.allowed_cidr),
        "allowed_port_min": int(saved.get("safety_port_min", settings.safety.allowed_port_min)),
        "allowed_port_max": int(saved.get("safety_port_max", settings.safety.allowed_port_max)),
        "excluded_ips": saved.get("safety_excluded_ips", ""),
        "excluded_ports": saved.get("safety_excluded_ports", ""),
        "allow_exploit": saved.get("safety_allow_exploit", "true") == "true",
        "block_dos_exploits": saved.get("safety_block_dos", "true") == "true",
        "block_destructive": saved.get("safety_block_destructive", "true") == "true",
        "max_severity": saved.get("safety_max_severity", "CRITICAL"),
        "session_max_seconds": int(saved.get("safety_time_limit", 7200)),
        "max_requests_per_second": int(saved.get("safety_rate_limit", 50)),
    }


@router.post("/config/safety")
async def save_safety_config(body: SafetyConfigRequest):
    await database.set_setting("safety_allowed_cidr", body.allowed_cidr)
    await database.set_setting("safety_port_min", str(body.allowed_port_min))
    await database.set_setting("safety_port_max", str(body.allowed_port_max))
    await database.set_setting("safety_excluded_ips", body.excluded_ips)
    await database.set_setting("safety_excluded_ports", body.excluded_ports)
    await database.set_setting("safety_allow_exploit", "true" if body.allow_exploit else "false")
    await database.set_setting("safety_block_dos", "true" if body.block_dos_exploits else "false")
    await database.set_setting("safety_block_destructive", "true" if body.block_destructive else "false")
    await database.set_setting("safety_max_severity", body.max_severity)
    await database.set_setting("safety_time_limit", str(body.session_max_seconds))
    await database.set_setting("safety_rate_limit", str(body.max_requests_per_second))

    # Update live settings
    settings.safety.allowed_cidr = body.allowed_cidr
    settings.safety.allowed_port_min = body.allowed_port_min
    settings.safety.allowed_port_max = body.allowed_port_max
    settings.safety.excluded_ips = [
        ip.strip() for ip in body.excluded_ips.split(",") if ip.strip()
    ]
    settings.safety.excluded_ports = [
        int(p.strip()) for p in body.excluded_ports.split(",") if p.strip().isdigit()
    ]
    settings.safety.allow_exploit = body.allow_exploit
    settings.safety.block_dos_exploits = body.block_dos_exploits
    settings.safety.block_destructive = body.block_destructive
    settings.safety.max_cvss_score = _SEVERITY_TO_CVSS.get(body.max_severity, 10.0)
    settings.safety.session_max_seconds = body.session_max_seconds
    settings.safety.max_requests_per_second = body.max_requests_per_second

    return {"ok": True}


# ── Metasploit Config ──────────────────────────────────────────────────────────

class MsfConfigRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 55553
    password: str = ""
    ssl: bool = False


@router.get("/config/msf")
async def get_msf_config():
    saved = await database.get_all_settings()
    return {
        "host": saved.get("msf_host", settings.msf.host),
        "port": int(saved.get("msf_port", settings.msf.port)),
        "password": "",  # never return password
        "ssl": saved.get("msf_ssl", "false") == "true",
    }


@router.post("/config/msf")
async def save_msf_config(body: MsfConfigRequest):
    await database.set_setting("msf_host", body.host)
    await database.set_setting("msf_port", str(body.port))
    if body.password:
        await async_set_secret("msf_password", body.password)
    await database.set_setting("msf_ssl", "true" if body.ssl else "false")

    # Update live settings
    settings.msf.host = body.host
    settings.msf.port = body.port
    if body.password:
        settings.msf.password = body.password
    settings.msf.ssl = body.ssl

    return {"ok": True}


# ── Sudo / Privilege Config ────────────────────────────────────────────────────

class SudoConfigRequest(BaseModel):
    password: str = ""


@router.get("/config/sudo")
async def get_sudo_config():
    from core.platform_utils import IS_WINDOWS, is_elevated
    if IS_WINDOWS:
        # Windows uses Administrator privileges — no password concept
        return {"platform": "windows", "is_elevated": is_elevated(), "has_password": False}
    return {"platform": "linux", "is_elevated": is_elevated(), "has_password": bool(settings.sudo_password)}


@router.post("/config/sudo")
async def save_sudo_config(body: SudoConfigRequest):
    from core.platform_utils import IS_WINDOWS
    if IS_WINDOWS:
        # No sudo password on Windows — silently succeed
        return {"ok": True}
    if body.password:
        await async_set_secret("sudo_password", body.password)
        settings.sudo_password = body.password
    return {"ok": True}


# ── OpenRouter Config ──────────────────────────────────────────────────────────

class OpenRouterSettings(BaseModel):
    api_key: str = ""
    cloud_model: str = ""


def _sanitize_api_key(key: str) -> str:
    """Strip whitespace and control characters from an API key."""
    import re
    return re.sub(r"[\s\x00-\x1f\x7f]", "", key or "")


def _resolve_openrouter_key(saved: dict) -> str:
    """Resolve API key: keychain → DB fallback → env/settings."""
    key = get_secret("openrouter_api_key")
    if not key:
        key = saved.get("openrouter_api_key", "") or settings.llm.api_key
    return _sanitize_api_key(key)


@router.get("/config/openrouter")
async def get_openrouter_config():
    saved = await database.get_all_settings()
    api_key = _resolve_openrouter_key(saved)
    return {
        "cloud_model": saved.get("cloud_model", settings.llm.cloud_model),
        "has_api_key": bool(api_key),
    }


@router.post("/config/openrouter")
async def save_openrouter_config(body: OpenRouterSettings):
    if body.api_key:
        clean_key = _sanitize_api_key(body.api_key)
        if clean_key:
            await async_set_secret("openrouter_api_key", clean_key)
            # Also persist to DB so key survives if keyring is unavailable
            await database.set_setting("openrouter_api_key", clean_key)
            settings.llm.api_key = clean_key
    if body.cloud_model:
        await database.set_setting("cloud_model", body.cloud_model)
        settings.llm.cloud_model = body.cloud_model
    return {"ok": True}


@router.get("/openrouter/models")
async def openrouter_models():
    """Fetch available models from OpenRouter API."""
    saved = await database.get_all_settings()
    key = _resolve_openrouter_key(saved)
    if not key or key.startswith("sk-or-..."):
        return {"models": [], "error": "No API key configured"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = sorted(m["id"] for m in data.get("data", []) if m.get("id"))
            return {"models": models}
    except Exception as e:
        return {"models": [], "error": str(e)}


# ── Nmap Config ────────────────────────────────────────────────────────────────

@router.get("/config/nmap")
async def get_nmap_config():
    from core.platform_utils import IS_WINDOWS, is_elevated, platform_name
    saved = await database.get_all_settings()
    return {
        "nmap_sudo": saved.get("nmap_sudo", "false") == "true",
        "platform": platform_name(),
        "is_elevated": is_elevated(),
    }


@router.post("/config/nmap")
async def save_nmap_config(body: dict):
    nmap_sudo = bool(body.get("nmap_sudo", False))
    await database.set_setting("nmap_sudo", "true" if nmap_sudo else "false")
    settings.nmap_sudo = nmap_sudo
    return {"ok": True}


# ── Pentest Sessions ───────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    target: str
    mode: str = "scan_only"
    # Optional per-session safety overrides
    allowed_cidr: Optional[str] = None
    allow_exploit: Optional[bool] = None
    block_dos: Optional[bool] = None
    block_destructive: Optional[bool] = None
    max_severity: Optional[str] = None
    time_limit: Optional[int] = None
    rate_limit: Optional[int] = None
    # Agent hints
    port_range: str = "1-65535"
    notes: str = ""
    # LLM selection
    provider: str = ""   # "ollama" | "lmstudio" | "openrouter"
    model: str = ""


async def _run_agent_task(
    session_id: str,
    agent,
    session_repo: SessionRepository,
    audit_repo: AuditLogRepository,
) -> None:
    """Background task: run the PentestAgent, update DB, broadcast events."""
    from web import session_manager

    try:
        await session_repo.update_status(session_id, "running")
        await audit_repo.log("SESSION_START", session_id=session_id)

        ctx = await agent.run()

        await session_repo.update_status(session_id, "done")
        await session_repo.update_stats(
            session_id,
            hosts_found=len(ctx.discovered_hosts),
            ports_found=ctx.total_ports,
            vulns_found=ctx.total_vulns,
            exploits_run=ctx.total_exploits,
        )
        await audit_repo.log(
            "SESSION_END",
            session_id=session_id,
            details={
                "hosts": len(ctx.discovered_hosts),
                "ports": ctx.total_ports,
                "vulns": ctx.total_vulns,
                "exploits": ctx.total_exploits,
                "iterations": ctx.iteration,
            },
        )
        await session_manager.broadcast(session_id, {
            "type": "session_done",
            "session_id": session_id,
            "hosts": len(ctx.discovered_hosts),
            "vulns": ctx.total_vulns,
            "exploits": ctx.total_exploits,
        })

    except asyncio.CancelledError:
        # Task was cancelled by the kill switch — preserve all findings, just mark stopped
        logger.warning("Agent task cancelled (emergency stop) for session %s", session_id)
        await session_repo.update_status(session_id, "stopped", "Emergency stop triggered by user")
        await audit_repo.log(
            "KILL_SWITCH",
            session_id=session_id,
            details={"reason": "Emergency stop — task cancelled"},
        )
        await session_manager.broadcast(session_id, {
            "type": "session_event",
            "session_id": session_id,
            "event": "kill_switch",
            "data": {},
        })

    except Exception as exc:
        logger.error("Agent task failed for session %s: %s", session_id, exc)
        await session_repo.update_status(session_id, "error", str(exc))
        await audit_repo.log(
            "SESSION_ERROR",
            session_id=session_id,
            details={"error": str(exc)},
        )
        await session_manager.broadcast(session_id, {
            "type": "session_error",
            "session_id": session_id,
            "error": str(exc),
        })

    finally:
        session_manager.cleanup(session_id)


@router.post("/sessions")
async def start_session(body: StartSessionRequest, background_tasks: BackgroundTasks):
    """Create and start a new pentest session."""
    from web import session_manager
    from core.agent import PentestAgent
    from core.safety import SafetyGuard
    from models.session import Session

    # Validate mode
    if body.mode not in ("full_auto", "ask_before_exploit", "scan_only"):
        raise HTTPException(400, f"Invalid mode: {body.mode}")

    if not body.target.strip():
        raise HTTPException(400, "Target IP or CIDR is required")

    # Build SafetyConfig — start from global settings, apply per-session overrides
    safety_cfg = SafetyConfig(
        allowed_cidr=body.allowed_cidr or body.target,
        allowed_port_min=settings.safety.allowed_port_min,
        allowed_port_max=settings.safety.allowed_port_max,
        excluded_ips=list(settings.safety.excluded_ips),
        excluded_ports=list(settings.safety.excluded_ports),
        allow_exploit=body.allow_exploit if body.allow_exploit is not None else settings.safety.allow_exploit,
        block_dos_exploits=body.block_dos if body.block_dos is not None else settings.safety.block_dos_exploits,
        block_destructive=body.block_destructive if body.block_destructive is not None else settings.safety.block_destructive,
        max_cvss_score=_SEVERITY_TO_CVSS.get(body.max_severity or "CRITICAL", 10.0),
        session_max_seconds=body.time_limit if body.time_limit is not None else settings.safety.session_max_seconds,
        max_requests_per_second=body.rate_limit if body.rate_limit is not None else settings.safety.max_requests_per_second,
    )

    # Persist session record
    session_data = await _session_repo.create(body.target.strip(), body.mode)
    session_id = session_data["id"]

    session_obj = Session(
        id=session_id,
        target=body.target.strip(),
        mode=body.mode,
        status="idle",
        created_at=session_data["created_at"],
        updated_at=session_data["updated_at"],
    )

    # Apply LLM provider/model overrides from the UI selection
    if body.provider in ("ollama", "openrouter"):
        settings.llm.provider = body.provider
    if body.model:
        if body.provider == "openrouter":
            settings.llm.cloud_model = body.model
        elif body.provider == "ollama":
            settings.ollama.model = body.model

    # Build agent
    guard = SafetyGuard(safety_cfg)
    progress_cb = session_manager.make_progress_callback(session_id)

    # Import tool registry bootstrapped in app lifespan
    try:
        from web.app_state import tool_registry as registry
    except ImportError:
        from core.tool_registry import ToolRegistry
        registry = ToolRegistry()

    agent = PentestAgent(
        session=session_obj,
        target=body.target.strip(),
        mode=body.mode,
        registry=registry,
        safety=guard,
        progress_callback=progress_cb,
        port_range=body.port_range,
        notes=body.notes,
    )

    # Launch background task
    task = asyncio.create_task(
        _run_agent_task(session_id, agent, _session_repo, _audit_repo)
    )
    session_manager.register(session_id, task, guard, agent)

    return {
        "session_id": session_id,
        "target": body.target,
        "mode": body.mode,
        "status": "running",
    }


@router.get("/sessions")
async def list_sessions():
    sessions = await _session_repo.list_all()
    # Annotate with live running status
    from web import session_manager
    for s in sessions:
        s["is_running"] = session_manager.is_running(s["id"])
    return sessions


@router.get("/sessions/{sid}")
async def get_session(sid: str):
    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    # Attach findings
    scan_results = await _scan_repo.get_for_session(sid)
    vulns = await _vuln_repo.get_for_session(sid)
    exploits = await _exploit_repo.get_for_session(sid)

    from web import session_manager
    session["is_running"] = session_manager.is_running(sid)
    session["scan_results"] = scan_results
    session["vulnerabilities"] = vulns
    session["exploit_results"] = exploits

    return session


@router.post("/sessions/{sid}/kill")
async def kill_session(sid: str):
    """Trigger emergency stop on a running session."""
    from web import session_manager

    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    killed = session_manager.kill(sid)
    if killed:
        # Status will be updated to "stopped" via CancelledError handler in _run_agent_task
        # but we pre-set it here in case the task was already done
        await _session_repo.update_status(sid, "stopped", "Emergency stop triggered by user")
        await _audit_repo.log(
            "KILL_SWITCH",
            session_id=sid,
            details={"reason": "Emergency stop triggered by user"},
        )
        return {"ok": True, "killed": True}

    return {"ok": True, "killed": False, "message": "Session not running or already stopped"}


@router.delete("/sessions/{sid}")
async def delete_session(sid: str):
    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")
    await _session_repo.delete(sid)
    return {"ok": True}


class RenameSessionRequest(BaseModel):
    name: str


@router.patch("/sessions/{sid}/name")
async def rename_session(sid: str, body: RenameSessionRequest):
    """Rename a pentest session with a user-friendly label."""
    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")
    ok = await _session_repo.update_name(sid, body.name.strip())
    if not ok:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


class InjectMessageRequest(BaseModel):
    message: str


@router.post("/sessions/{sid}/inject")
async def inject_session_message(sid: str, body: InjectMessageRequest):
    """Inject an operator message into the running agent's memory."""
    from web import session_manager

    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    msg = body.message.strip()
    if not msg:
        raise HTTPException(400, "Message cannot be empty")

    ok = session_manager.inject_message(sid, msg)
    return {"ok": ok}


@router.post("/sessions/{sid}/pause")
async def pause_session(sid: str):
    """Pause the running agent between iterations."""
    from web import session_manager

    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    ok = session_manager.pause_session(sid)
    if ok:
        await session_manager.broadcast(sid, {
            "type": "session_event",
            "session_id": sid,
            "event": "paused",
            "data": {},
        })
    return {"ok": ok}


@router.post("/sessions/{sid}/resume")
async def resume_session(sid: str):
    """Resume a paused agent."""
    from web import session_manager

    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    ok = session_manager.resume_session(sid)
    if ok:
        await session_manager.broadcast(sid, {
            "type": "session_event",
            "session_id": sid,
            "event": "resumed",
            "data": {},
        })
    return {"ok": ok}


# ── Reports ────────────────────────────────────────────────────────────────────

@router.get("/sessions/{sid}/report/html", response_class=HTMLResponse)
async def get_report_html(sid: str):
    """Generate and return HTML report for a session."""
    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    try:
        from reporting.report_generator import ReportGenerator
        generator = ReportGenerator()
        html = await generator.generate_html(sid)
        return HTMLResponse(content=html)
    except Exception as exc:
        logger.error("Report HTML generation failed: %s", exc)
        raise HTTPException(500, f"Report generation failed: {exc}")


@router.get("/sessions/{sid}/report/pdf")
async def get_report_pdf(sid: str):
    """Generate and return PDF report for a session."""
    session = await _session_repo.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    try:
        from reporting.report_generator import ReportGenerator
        generator = ReportGenerator()
        pdf_bytes = await generator.generate_pdf(sid)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="aegis-report-{sid[:8]}.pdf"'
            },
        )
    except Exception as exc:
        logger.error("Report PDF generation failed: %s", exc)
        raise HTTPException(500, f"PDF generation failed: {exc}")


# ── Audit Log ──────────────────────────────────────────────────────────────────

@router.get("/audit")
async def get_audit_log(
    session_id: str = "",
    event_type: str = "",
    search: str = "",
    limit: int = 200,
):
    """Return audit log entries with optional filtering."""
    if session_id:
        entries = await _audit_repo.get_for_session(session_id, limit=limit)
    else:
        entries = await _audit_repo.get_recent(limit=limit)

    # Filter by event type
    if event_type and event_type.upper() != "ALL":
        entries = [e for e in entries if e["event_type"].upper() == event_type.upper()]

    # Filter by search string
    if search:
        s = search.lower()
        entries = [
            e for e in entries
            if s in e.get("tool_name", "").lower()
            or s in e.get("target", "").lower()
            or s in e.get("event_type", "").lower()
            or s in str(e.get("details", "")).lower()
        ]

    return {"entries": entries, "total": len(entries)}
