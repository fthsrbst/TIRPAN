"""
TIRPAN — FastAPI application entry point.

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

    # Restore cloud model saved via the configure page (not loaded by default on startup)
    _cloud_model = _all_settings.get("cloud_model", "")
    if _cloud_model:
        settings.llm.cloud_model = _cloud_model

    _msf_pw = _load_secret_sync("msf_password")
    if _msf_pw:
        settings.msf.password = _msf_pw

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
    from tools.shell_session_tool import ShellSessionTool

    tool_registry.register(NmapTool())
    tool_registry.register(SearchSploitTool())
    tool_registry.register(MetasploitTool())
    tool_registry.register(SSHTool())
    tool_registry.register(ShellSessionTool())

    # V2 tools — registered if available; graceful degradation if binary missing
    from tools.masscan_tool import MasscanTool
    from tools.nuclei_tool import NucleiTool
    from tools.ffuf_tool import FfufTool
    from tools.whatweb_tool import WhatWebTool
    from tools.nikto_tool import NiktoTool
    from tools.theharvester_tool import TheHarvesterTool
    from tools.subfinder_tool import SubfinderTool
    from tools.whois_tool import WhoisTool
    from tools.dns_tool import DnsTool
    from tools.crackmapexec_tool import CrackMapExecTool
    from tools.impacket_tool import ImpacketTool
    from tools.report_finding_tool import ReportFindingTool
    from tools.generate_report_tool import GenerateReportTool
    from tools.rsh_tool import RshTool
    from tools.distcc_tool import DistccTool
    from tools.webdav_tool import WebDavTool
    from tools.smb_enum_tool import SmbEnumTool
    from tools.telnet_tool import TelnetTool

    for _tool in (MasscanTool(), NucleiTool(), FfufTool(), WhatWebTool(),
                  NiktoTool(), TheHarvesterTool(), SubfinderTool(),
                  WhoisTool(), DnsTool(), CrackMapExecTool(), ImpacketTool(),
                  ReportFindingTool(), GenerateReportTool(),
                  RshTool(), DistccTool(), WebDavTool(), SmbEnumTool(), TelnetTool()):
        tool_registry.register(_tool)

    # Import specialized agents so they self-register into BrainAgent registry
    import core.agents.scanner_agent      # noqa: F401
    import core.agents.exploit_agent      # noqa: F401
    import core.agents.postexploit_agent  # noqa: F401
    import core.agents.webapp_agent       # noqa: F401
    import core.agents.osint_agent        # noqa: F401
    import core.agents.lateral_agent      # noqa: F401
    import core.agents.reporting_agent    # noqa: F401

    tool_registry.load_plugins(Path("plugins/"))

    yield


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
