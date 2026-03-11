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

    # Cleanup sessions that were left in "running" state from a previous crash/restart
    from database.repositories import SessionRepository
    _repo = SessionRepository()
    _orphans = await _repo.list_all()
    for _s in _orphans:
        if _s.get("status") == "running":
            await _repo.update_status(_s["id"], "error", "Server restarted — session interrupted")

    # Bootstrap tool registry
    from web.app_state import tool_registry
    from tools.nmap_tool import NmapTool
    from tools.searchsploit_tool import SearchSploitTool
    from tools.metasploit_tool import MetasploitTool

    tool_registry.register(NmapTool())
    tool_registry.register(SearchSploitTool())
    tool_registry.register(MetasploitTool())
    tool_registry.load_plugins(Path("plugins/"))

    yield


def create_app() -> FastAPI:
    """Factory used by tests and uvicorn."""
    application = FastAPI(title="AEGIS", version="0.1.0", lifespan=lifespan)

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
