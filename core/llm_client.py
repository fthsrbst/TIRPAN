"""
Phase 2 — LLM Client

Providers:
  - OllamaClient   : local Ollama API (streaming)
  - OpenRouterClient: cloud via OpenRouter (httpx, retry, timeout)

Router:
  - LLMRouter: provider selection + fallback logic
"""

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

import httpx

from config import settings

logger = logging.getLogger(__name__)


# ── Base ──────────────────────────────────────────────────────────────────────

class LLMClient(ABC):
    """Abstract base — all LLM clients implement this."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        stream: bool = False,
    ) -> str:
        """Send a list of messages and return the full response."""
        ...

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict],
    ) -> AsyncIterator[str]:
        """Yields tokens one by one."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Is the provider reachable?"""
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
        async with httpx.AsyncClient(timeout=self.timeout) as client, client.stream(
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
    _RETRY_BASE_DELAY = 1.0   # seconds (exponential: 1, 2, 4)

    def __init__(self):
        self.api_key = settings.llm.api_key
        self.model = settings.llm.cloud_model
        self.timeout = 30.0

    @property
    def _current_key(self) -> str:
        """Always read the live api_key from settings (may be updated at runtime)."""
        import re
        key = settings.llm.api_key or self.api_key or ""
        return re.sub(r"[\s\x00-\x1f\x7f]", "", key)

    @property
    def _current_model(self) -> str:
        """Always read the live model from settings (may be updated at runtime)."""
        return settings.llm.cloud_model or self.model

    def _has_valid_key(self) -> bool:
        key = self._current_key
        return bool(key) and not key.startswith("sk-or-...")

    def _headers(self) -> dict:
        headers: dict = {
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/aegis-pentest",
            "X-Title": "AEGIS",
        }
        if self._has_valid_key():
            headers["Authorization"] = f"Bearer {self._current_key}"
        return headers

    async def chat(self, messages: list[dict], stream: bool = False) -> str:
        last_error: Exception | None = None

        for attempt in range(self._MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(
                        f"{self._BASE}/chat/completions",
                        headers=self._headers(),
                        json={
                            "model": self._current_model,
                            "messages": messages,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    choices = data.get("choices") or []
                    if not choices:
                        raise ValueError(f"OpenRouter returned empty choices: {data}")
                    return choices[0]["message"]["content"]

            except httpx.HTTPStatusError as e:
                last_error = e
                try:
                    body = e.response.json()
                except Exception:
                    body = e.response.text
                logger.error(
                    "OpenRouter HTTP %d on attempt %d/%d — model=%r body=%s",
                    e.response.status_code, attempt + 1, self._MAX_RETRIES,
                    self._current_model, body,
                )
                if e.response.status_code in (400, 401, 403):
                    # Non-retryable auth/validation errors — fail immediately
                    raise RuntimeError(f"OpenRouter {e.response.status_code}: {body}") from e
                if attempt < self._MAX_RETRIES - 1:
                    delay = self._RETRY_BASE_DELAY * (2 ** attempt)
                    await asyncio.sleep(delay)
            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self._MAX_RETRIES - 1:
                    delay = self._RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "OpenRouter timeout attempt %d/%d — retrying in %.1fs",
                        attempt + 1, self._MAX_RETRIES, delay,
                    )
                    await asyncio.sleep(delay)

        raise RuntimeError(
            f"OpenRouter failed after {self._MAX_RETRIES} attempts: {last_error}"
        )

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self.timeout) as client, client.stream(
            "POST",
            f"{self._BASE}/chat/completions",
            headers=self._headers(),
            json={
                "model": self._current_model,
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
                    choices = data.get("choices")
                    if not choices:
                        continue
                    token = choices[0].get("delta", {}).get("content", "")
                    if token:
                        yield token
                except (json.JSONDecodeError, IndexError):
                    continue

    async def is_available(self) -> bool:
        if not self._has_valid_key():
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
    Provider selection + fallback.

    Strategy:
      - settings.llm.provider == "ollama"      → OllamaClient
      - settings.llm.provider == "openrouter"  → OpenRouterClient
      - If the selected provider fails → fallback to the other
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
            fallback = self._fallback()
            if not await fallback.is_available():
                raise RuntimeError(
                    f"Primary LLM ({type(primary).__name__}) failed and fallback is not available: {e}"
                ) from e
            logger.warning(
                "Primary LLM failed (%s), trying fallback %s: %s",
                type(primary).__name__, type(fallback).__name__, e,
            )
            return await fallback.chat(messages, stream=stream)

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        primary = self._primary()
        try:
            async for token in primary.stream_chat(messages):
                yield token
        except Exception as e:
            fallback = self._fallback()
            if not await fallback.is_available():
                raise RuntimeError(
                    f"Primary stream ({type(primary).__name__}) failed and fallback is not available: {e}"
                ) from e
            logger.warning(
                "Primary stream failed (%s), trying fallback %s: %s",
                type(primary).__name__, type(fallback).__name__, e,
            )
            async for token in fallback.stream_chat(messages):
                yield token

    async def active_provider(self) -> str:
        """Return which provider is reachable."""
        if await self._primary().is_available():
            return type(self._primary()).__name__
        if await self._fallback().is_available():
            return type(self._fallback()).__name__
        return "none"

    @staticmethod
    def parse_json(response: str) -> dict:
        """
        Extract a JSON object from an LLM response.

        Handles:
        - Plain JSON
        - ```json ... ``` fenced blocks (anywhere in the text)
        - Chain-of-thought prose followed by a JSON object
        - Mixed prose + JSON (picks the last top-level ``{...}`` block)
        """
        import re as _re

        text = response.strip()
        if not text:
            raise json.JSONDecodeError("Empty response", text, 0)

        # 1. Plain JSON — fastest path
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 2. Fenced ```json ... ``` or ``` ... ``` block anywhere in the text
        m = _re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, _re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass

        # 3. Scan every '{' position (left-to-right) and try to parse from there.
        #    The LLM often writes chain-of-thought before the JSON object, so the
        #    first valid top-level object we encounter is the intended response.
        for i, ch in enumerate(text):
            if ch == "{":
                try:
                    return json.loads(text[i:])
                except json.JSONDecodeError:
                    continue

        # 4. Nothing worked — re-raise a clean error
        raise json.JSONDecodeError("No JSON object found in response", text, 0)


# Singleton
llm_router = LLMRouter()
