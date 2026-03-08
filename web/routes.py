"""
REST API routes.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from config import settings
import httpx

router = APIRouter(prefix="/api/v1")


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


@router.post("/config/ollama")
async def set_ollama_config(body: OllamaSettings):
    if body.base_url.startswith("http"):
        settings.ollama.base_url = body.base_url
    settings.ollama.model = body.model
    return {"ok": True}
