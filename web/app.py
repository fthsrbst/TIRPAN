"""
AEGIS — FastAPI application entry point.

Serves static frontend and provides:
  - REST API at /api/v1/...
  - WebSocket at /ws
"""

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from web.routes import router
from web.websocket_handler import handle_websocket

app = FastAPI(title="AEGIS", version="0.1.0")

# CORS — allow frontend dev server if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(router)

# WebSocket
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await handle_websocket(websocket)

# Static files — mount at root AFTER API routes so API takes priority.
# html=True enables SPA fallback (unknown paths → index.html).
app.mount("/", StaticFiles(directory=str(settings.static_dir), html=True), name="static")
