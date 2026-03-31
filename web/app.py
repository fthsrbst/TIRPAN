"""
TIRPAN — FastAPI application entry point.

Serves static frontend and provides:
  - REST API at /api/v1/...
  - WebSocket at /ws
"""

from contextlib import asynccontextmanager
import asyncio
import logging
import os
import shutil

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from core.registry_builder import build_tool_registry
from web.routes import router
from web.websocket_handler import handle_websocket
from database.db import init_db

_logger = logging.getLogger(__name__)


def _resolve_cors_origins() -> list[str]:
    raw = (settings.server.allowed_origins or "").strip()
    if not raw:
        return ["http://localhost:8000", "http://127.0.0.1:8000"]

    if raw == "*":
        unsafe_env = os.getenv("SERVER_UNSAFE_CORS_WILDCARD", "").strip().lower()
        unsafe = unsafe_env in {"1", "true", "yes", "on"}
        if settings.server.reload or unsafe:
            return ["*"]
        _logger.warning(
            "SERVER_ALLOWED_ORIGINS='*' ignored in non-dev mode. "
            "Use explicit origins or set SERVER_UNSAFE_CORS_WILDCARD=true."
        )
        return ["http://localhost:8000", "http://127.0.0.1:8000"]

    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:8000", "http://127.0.0.1:8000"]


async def _start_msfrpcd() -> "asyncio.subprocess.Process | None":
    """Start msfrpcd for persistent MSF session support.

    Returns the subprocess if we launched it, or None if it was already running
    or couldn't be started.
    """
    if not settings.msf.auto_start_msfrpcd:
        _logger.info("msfrpcd auto-start is disabled by configuration")
        return None

    # Check if msfrpcd is already listening
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(settings.msf.host, settings.msf.port),
            timeout=2.0,
        )
        writer.close()
        await writer.wait_closed()
        _logger.info("msfrpcd already running on %s:%d", settings.msf.host, settings.msf.port)
        return None
    except (ConnectionRefusedError, OSError, asyncio.TimeoutError):
        pass

    # Find msfrpcd binary
    msfrpcd_bin = (
        settings.msf.msfrpcd_path
        or shutil.which("msfrpcd")
        or "/usr/bin/msfrpcd"
    )
    if not os.path.isfile(msfrpcd_bin):
        _logger.warning("msfrpcd not found at %s — persistent sessions unavailable", msfrpcd_bin)
        return None

    cmd = [
        msfrpcd_bin,
        "-P", settings.msf.password,
        "-p", str(settings.msf.port),
        "-a", settings.msf.host,
        "-f",  # foreground — we manage the lifecycle
    ]
    if not settings.msf.ssl:
        cmd += ["-S"]  # disable SSL (must match MetasploitTool._connect ssl=False)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    _logger.info("Started msfrpcd (pid=%d) on %s:%d", proc.pid, settings.msf.host, settings.msf.port)

    # Poll until ready (up to 30 s)
    for i in range(30):
        await asyncio.sleep(1)
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(settings.msf.host, settings.msf.port),
                timeout=1.0,
            )
            writer.close()
            await writer.wait_closed()
            _logger.info("msfrpcd ready after %ds", i + 1)
            return proc
        except (ConnectionRefusedError, OSError, asyncio.TimeoutError):
            continue

    _logger.warning("msfrpcd did not become ready in 30 s — will fall back to msfconsole")
    return proc


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # Load secrets from OS keychain into live settings (DB fallback if keyring unavailable)
    import re as _re
    from core.secure_store import async_get_secret
    from database.db import get_all_settings

    _all_settings = await get_all_settings()

    def _load_secret_sync(key: str) -> str:
        from core.secure_store import get_secret
        return get_secret(key) or _all_settings.get(key, "")

    _or_key = _re.sub(r"[\s\x00-\x1f\x7f]", "", _load_secret_sync("openrouter_api_key"))
    if _or_key:
        settings.llm.api_key = _or_key

    # Restore cloud model saved via the configure page (not loaded by default on startup)
    _cloud_model = _all_settings.get("cloud_model", "")
    if _cloud_model:
        settings.llm.cloud_model = _cloud_model

    _msf_pw = _load_secret_sync("msf_password")
    if _msf_pw:
        settings.msf.password = _msf_pw

    # Start msfrpcd for persistent session support (non-blocking — exploits fall back to
    # msfconsole subprocess if RPC isn't ready yet)
    _msfrpcd_proc = await _start_msfrpcd()
    if _msfrpcd_proc is None:
        _logger.info("msfrpcd startup: using existing daemon or fallback mode")
    else:
        _logger.info("msfrpcd startup: managed process enabled (pid=%s)", _msfrpcd_proc.pid)

    # sudo password is only relevant on Linux/macOS
    from core.platform_utils import IS_WINDOWS
    if not IS_WINDOWS:
        _sudo_pw = _load_secret_sync("sudo_password")
        if _sudo_pw:
            settings.sudo_password = _sudo_pw

    # LoRA training data toggle
    _training_val = _all_settings.get("collect_training_data", None)
    if _training_val is not None:
        settings.collect_training_data = str(_training_val).lower() not in ("false", "0", "no")

    # Cleanup sessions that were left in "running" or "idle" state from a previous crash/restart.
    # "idle" sessions were created but the background task was killed before it could set status
    # to "running" (e.g. server reloaded immediately after a mission was launched).
    from database.repositories import SessionRepository
    _repo = SessionRepository()
    try:
        _orphans = await _repo.list_all()
    except Exception as exc:
        _logger.warning("Startup orphan-session cleanup skipped (DB unavailable/locked): %s", exc)
        _orphans = []
    for _s in _orphans:
        if _s.get("status") in ("running", "idle"):
            await _repo.update_status(_s["id"], "error", "Server restarted — session interrupted")

    # Bootstrap shared tool registry
    from web import app_state
    app_state.tool_registry = build_tool_registry(include_extended=True, load_plugins=True)

    # Import specialized agents so they self-register into BrainAgent registry
    import core.agents.scanner_agent      # noqa: F401
    import core.agents.exploit_agent      # noqa: F401
    import core.agents.postexploit_agent  # noqa: F401
    import core.agents.webapp_agent       # noqa: F401
    import core.agents.osint_agent        # noqa: F401
    import core.agents.lateral_agent      # noqa: F401
    import core.agents.reporting_agent    # noqa: F401
    yield

    # ── Shutdown: stop msfrpcd if we launched it ──────────────────────────────
    if _msfrpcd_proc is not None:
        try:
            _msfrpcd_proc.terminate()
            await asyncio.wait_for(_msfrpcd_proc.wait(), timeout=5.0)
            _logger.info("msfrpcd stopped cleanly")
        except Exception:
            _msfrpcd_proc.kill()


def create_app() -> FastAPI:
    """Factory used by tests and uvicorn."""
    import logging
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse

    application = FastAPI(title="TIRPAN", version="0.1.0", lifespan=lifespan)

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(request, exc):
        logging.getLogger("tirpan.validation").error(
            "422 on %s: %s", request.url.path, exc.errors()
        )
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    application.add_middleware(
        CORSMiddleware,
        allow_origins=_resolve_cors_origins(),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(router)

    @application.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await handle_websocket(websocket)

    application.mount(
        "/",
        StaticFiles(directory=str(settings.static_dir), html=True),
        name="static",
    )
    return application


# Module-level singleton (used by uvicorn and direct imports)
app = create_app()
