"""
AEGIS — FastAPI application entry point.

Serves static frontend and provides:
  - REST API at /api/v1/...
  - WebSocket at /ws
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from web.routes import router
from web.websocket_handler import handle_websocket
from database.db import init_db


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

    _msf_pw = _load_secret_sync("msf_password")
    if _msf_pw:
        settings.msf.password = _msf_pw

    # sudo password is only relevant on Linux/macOS
    from core.platform_utils import IS_WINDOWS
    if not IS_WINDOWS:
        _sudo_pw = _load_secret_sync("sudo_password")
        if _sudo_pw:
            settings.sudo_password = _sudo_pw

    # Cleanup sessions that were left in "running" or "idle" state from a previous crash/restart.
    # "idle" sessions were created but the background task was killed before it could set status
    # to "running" (e.g. server reloaded immediately after a mission was launched).
    from database.repositories import SessionRepository
    _repo = SessionRepository()
    _orphans = await _repo.list_all()
    for _s in _orphans:
        if _s.get("status") in ("running", "idle"):
            await _repo.update_status(_s["id"], "error", "Server restarted — session interrupted")

    # Bootstrap tool registry
    from web.app_state import tool_registry
    from tools.nmap_tool import NmapTool
    from tools.searchsploit_tool import SearchSploitTool
    from tools.metasploit_tool import MetasploitTool
    from tools.ssh_tool import SSHTool

    tool_registry.register(NmapTool())
    tool_registry.register(SearchSploitTool())
    tool_registry.register(MetasploitTool())
    tool_registry.register(SSHTool())
    tool_registry.load_plugins(Path("plugins/"))

    yield


def create_app() -> FastAPI:
    """Factory used by tests and uvicorn."""
    import logging
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse

    application = FastAPI(title="AEGIS", version="0.1.0", lifespan=lifespan)

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(request, exc):
        logging.getLogger("aegis.validation").error(
            "422 on %s: %s", request.url.path, exc.errors()
        )
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
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
