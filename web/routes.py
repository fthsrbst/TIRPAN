"""
REST API routes.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import settings
from web.stats_state import token_counter
import httpx
import psutil
import subprocess
from database import db as database

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


# ── System Stats ───────────────────────────────────────────────────────────────

def _gpu_percent() -> int | None:
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
    # persist to DB
    await database.set_setting("ollama_base_url", body.base_url)
    await database.set_setting("ollama_model", body.model)
    return {"ok": True}
