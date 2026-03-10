"""
Phase 2 — LLM Client

Providers:
  - OllamaClient   : local Ollama API (streaming)
  - OpenRouterClient: cloud via OpenRouter (httpx, retry, timeout)

Router:
  - LLMRouter: provider seçimi + fallback logic
"""

import json
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


# ── Base ──────────────────────────────────────────────────────────────────────

class LLMClient(ABC):
    """Abstract base — tüm LLM client'lar bunu implement eder."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        stream: bool = False,
    ) -> str:
        """Mesaj listesi gönder, tam yanıt döndür."""
        ...

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict],
    ) -> AsyncIterator[str]:
        """Token token yield eder."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Provider erişilebilir mi?"""
        ...


# ── Ollama ────────────────────────────────────────────────────────────────────

class OllamaClient(LLMClient):
    """Ollama local API — http://localhost:11434"""

    def __init__(self):
        self.base_url = settings.ollama.base_url.rstrip("/")
        self.model = settings.ollama.model
        self.timeout = settings.ollama.timeout

    async def chat(self, messages: list[dict], stream: bool = False) -> str:
        if stream:
            result = []
            async for token in self.stream_chat(messages):
                result.append(token)
            return "".join(result)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"]

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield token
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False


# ── OpenRouter ────────────────────────────────────────────────────────────────

class OpenRouterClient(LLMClient):
    """OpenRouter cloud API — openrouter.ai/api/v1"""

    _BASE = "https://openrouter.ai/api/v1"
    _MAX_RETRIES = 3
    _RETRY_BASE_DELAY = 1.0   # saniye (exponential: 1, 2, 4)

    def __init__(self):
        self.api_key = settings.llm.api_key
        self.model = settings.llm.cloud_model
        self.timeout = 30.0

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/aegis-pentest",
            "X-Title": "AEGIS",
        }

    async def chat(self, messages: list[dict], stream: bool = False) -> str:
        last_error: Optional[Exception] = None

        for attempt in range(self._MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(
                        f"{self._BASE}/chat/completions",
                        headers=self._headers(),
                        json={
                            "model": self.model,
                            "messages": messages,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]

            except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
                last_error = e
                if attempt < self._MAX_RETRIES - 1:
                    delay = self._RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "OpenRouter attempt %d/%d failed: %s — retrying in %.1fs",
                        attempt + 1, self._MAX_RETRIES, e, delay,
                    )
                    await asyncio.sleep(delay)

        raise RuntimeError(
            f"OpenRouter failed after {self._MAX_RETRIES} attempts: {last_error}"
        )

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                f"{self._BASE}/chat/completions",
                headers=self._headers(),
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:]
                    if raw == "[DONE]":
                        break
                    try:
                        data = json.loads(raw)
                        token = (
                            data.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if token:
                            yield token
                    except json.JSONDecodeError:
                        continue

    async def is_available(self) -> bool:
        if not self.api_key or self.api_key.startswith("sk-or-..."):
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self._BASE}/models",
                    headers=self._headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False


# ── Router ────────────────────────────────────────────────────────────────────

class LLMRouter:
    """
    Provider seçimi + fallback.

    Strateji:
      - settings.llm.provider == "ollama"      → OllamaClient
      - settings.llm.provider == "openrouter"  → OpenRouterClient
      - Seçilen provider çökmüşse → diğerine fallback
    """

    def __init__(self):
        self._ollama = OllamaClient()
        self._openrouter = OpenRouterClient()

    def _primary(self) -> LLMClient:
        if settings.llm.provider == "openrouter":
            return self._openrouter
        return self._ollama

    def _fallback(self) -> LLMClient:
        if settings.llm.provider == "openrouter":
            return self._ollama
        return self._openrouter

    async def chat(self, messages: list[dict], stream: bool = False) -> str:
        primary = self._primary()
        try:
            return await primary.chat(messages, stream=stream)
        except Exception as e:
            logger.warning("Primary LLM failed (%s), trying fallback: %s", type(primary).__name__, e)
            return await self._fallback().chat(messages, stream=stream)

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        primary = self._primary()
        try:
            async for token in primary.stream_chat(messages):
                yield token
        except Exception as e:
            logger.warning("Primary stream failed (%s), trying fallback: %s", type(primary).__name__, e)
            async for token in self._fallback().stream_chat(messages):
                yield token

    async def active_provider(self) -> str:
        """Hangisi erişilebilir, onu döndür."""
        if await self._primary().is_available():
            return type(self._primary()).__name__
        if await self._fallback().is_available():
            return type(self._fallback()).__name__
        return "none"

    @staticmethod
    def parse_json(response: str) -> dict:
        """
        LLM yanıtından JSON çıkar.
        LLM bazen ```json ... ``` bloğu içine yazar, onu temizler.
        """
        text = response.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            # ilk ve son ``` satırlarını at
            inner = [l for l in lines[1:] if l.strip() != "```"]
            text = "\n".join(inner)
        return json.loads(text)


# Singleton
llm_router = LLMRouter()
