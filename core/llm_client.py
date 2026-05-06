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
from core.llm_parser import parse_llm_json

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

def _resolve_local_url(url: str) -> str:
    """On WSL2, try to replace localhost/127.0.0.1 with the Windows host IP.

    WSL2 cannot reach Windows services at 127.0.0.1 — the host is reachable
    via the nameserver IP found in /etc/resolv.conf.
    """
    import os
    try:
        if not os.path.exists("/proc/version"):
            return url
        with open("/proc/version") as f:
            if "microsoft" not in f.read().lower():
                return url
        # We are in WSL2 — check if the URL targets localhost
        if not any(h in url for h in ("127.0.0.1", "localhost")):
            return url
        with open("/etc/resolv.conf") as f:
            for line in f:
                if line.startswith("nameserver"):
                    host_ip = line.split()[1].strip()
                    return url.replace("127.0.0.1", host_ip).replace("localhost", host_ip)
    except Exception:
        pass
    return url


class OllamaClient(LLMClient):
    """Ollama local API — http://localhost:11434"""

    def __init__(self):
        base = settings.ollama.base_url.rstrip("/")
        self.base_url = _resolve_local_url(base)
        self._original_base_url = base
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
                "options": {"num_predict": 8192},
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
        # _forced_model is set by make_agent_llm() for per-agent model overrides
        forced = getattr(self, "_forced_model", None)
        if forced:
            return forced
        return settings.llm.cloud_model or self.model

    def _has_valid_key(self) -> bool:
        key = self._current_key
        return bool(key) and not key.startswith("sk-or-...")

    def _headers(self) -> dict:
        headers: dict = {
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/tirpan-pentest",
            "X-Title": "TIRPAN",
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
                            "max_tokens": 8192,
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
        last_error: Exception | None = None

        for attempt in range(self._MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client, client.stream(
                    "POST",
                    f"{self._BASE}/chat/completions",
                    headers=self._headers(),
                    json={
                        "model": self._current_model,
                        "messages": messages,
                        "stream": True,
                        "max_tokens": 8192,
                    },
                ) as resp:
                    if resp.status_code >= 400:
                        await resp.aread()
                        body = resp.text
                        logger.error(
                            "OpenRouter stream_chat HTTP %d — model=%r body=%s",
                            resp.status_code, self._current_model, body[:1000],
                        )
                        if resp.status_code in (400, 401, 403):
                            raise RuntimeError(f"OpenRouter stream {resp.status_code}: {body[:500]}")
                        resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        raw = line[6:]
                        if raw == "[DONE]":
                            return
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
                    return  # stream completed successfully

            except (httpx.ConnectError, httpx.TimeoutException) as e:
                last_error = e
                if attempt < self._MAX_RETRIES - 1:
                    delay = self._RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "OpenRouter stream connect/DNS error attempt %d/%d — retrying in %.1fs: %s",
                        attempt + 1, self._MAX_RETRIES, delay, e,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "OpenRouter stream failed after %d attempts (DNS or network unreachable): %s",
                        self._MAX_RETRIES, e,
                    )
            except RuntimeError:
                raise
            except Exception as e:
                last_error = e
                logger.error("OpenRouter stream unexpected error: %s", e)
                break

        raise RuntimeError(
            f"OpenRouter stream failed after {self._MAX_RETRIES} attempts: {last_error}"
        )

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


# ── OpenCode Go ────────────────────────────────────────────────────────────────

class OpenCodeGoClient(LLMClient):
    """OpenCode Go subscription — low cost open coding models.
    OpenAI-compatible API at https://opencode.ai/zen/go/v1/chat/completions
    """

    _MAX_RETRIES = 3
    _RETRY_BASE_DELAY = 1.0

    @property
    def _base_url(self) -> str:
        return settings.opencode_go.base_url.rstrip("/")

    @property
    def _api_key(self) -> str:
        import re
        key = settings.opencode_go.api_key or ""
        return re.sub(r"[\s\x00-\x1f\x7f]", "", key)

    @property
    def _model(self) -> str:
        override = getattr(self, "_model_override", None)
        if override:
            return override
        return settings.opencode_go.model

    @property
    def _timeout(self) -> float:
        return settings.opencode_go.timeout

    def _has_valid_key(self) -> bool:
        key = self._api_key
        return bool(key) and not key.startswith("oc-go-...")

    def _headers(self) -> dict:
        headers: dict = {
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/tirpan-pentest",
            "X-Title": "TIRPAN",
        }
        key = self._api_key
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    async def chat(self, messages: list[dict], stream: bool = False) -> str:
        if stream:
            result = []
            async for token in self.stream_chat(messages):
                result.append(token)
            return "".join(result)

        last_error: Exception | None = None

        for attempt in range(self._MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(
                        f"{self._base_url}/chat/completions",
                        headers=self._headers(),
                        json={
                            "model": self._model,
                            "messages": messages,
                            "max_tokens": 8192,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    choices = data.get("choices") or []
                    if not choices:
                        raise ValueError(f"OpenCode Go returned empty choices: {data}")
                    return choices[0]["message"]["content"]

            except httpx.HTTPStatusError as e:
                last_error = e
                try:
                    body = e.response.json()
                except Exception:
                    body = e.response.text
                logger.error(
                    "OpenCode Go HTTP %d on attempt %d/%d — model=%r body=%s",
                    e.response.status_code, attempt + 1, self._MAX_RETRIES,
                    self._model, body,
                )
                if e.response.status_code in (400, 401, 403):
                    raise RuntimeError(f"OpenCode Go {e.response.status_code}: {body}") from e
                if attempt < self._MAX_RETRIES - 1:
                    delay = self._RETRY_BASE_DELAY * (2 ** attempt)
                    await asyncio.sleep(delay)
            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self._MAX_RETRIES - 1:
                    delay = self._RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "OpenCode Go timeout attempt %d/%d — retrying in %.1fs",
                        attempt + 1, self._MAX_RETRIES, delay,
                    )
                    await asyncio.sleep(delay)

        raise RuntimeError(
            f"OpenCode Go failed after {self._MAX_RETRIES} attempts: {last_error}"
        )

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        last_error: Exception | None = None

        for attempt in range(self._MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client, client.stream(
                    "POST",
                    f"{self._base_url}/chat/completions",
                    headers=self._headers(),
                    json={
                        "model": self._model,
                        "messages": messages,
                        "stream": True,
                        "max_tokens": 8192,
                    },
                ) as resp:
                    if resp.status_code >= 400:
                        await resp.aread()
                        body = resp.text
                        logger.error(
                            "OpenCode Go stream_chat HTTP %d — model=%r body=%s",
                            resp.status_code, self._model, body[:1000],
                        )
                        if resp.status_code in (400, 401, 403):
                            raise RuntimeError(f"OpenCode Go stream {resp.status_code}: {body[:500]}")
                        resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        raw = line[6:]
                        if raw == "[DONE]":
                            return
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
                    return

            except (httpx.ConnectError, httpx.TimeoutException) as e:
                last_error = e
                if attempt < self._MAX_RETRIES - 1:
                    delay = self._RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "OpenCode Go stream connect/network error attempt %d/%d — retrying in %.1fs: %s",
                        attempt + 1, self._MAX_RETRIES, delay, e,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "OpenCode Go stream failed after %d attempts: %s",
                        self._MAX_RETRIES, e,
                    )
            except RuntimeError:
                raise
            except Exception as e:
                last_error = e
                logger.error("OpenCode Go stream unexpected error: %s", e)
                break

        raise RuntimeError(
            f"OpenCode Go stream failed after {self._MAX_RETRIES} attempts: {last_error}"
        )

    async def is_available(self) -> bool:
        if not self._has_valid_key():
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self._base_url}/models",
                    headers=self._headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False


# ── LM Studio ─────────────────────────────────────────────────────────────────

class LMStudioClient(LLMClient):
    """LM Studio local API — OpenAI-compatible at http://127.0.0.1:1234/v1"""

    @property
    def _base_url(self) -> str:
        return settings.lmstudio.base_url.rstrip("/")

    @property
    def _model(self) -> str:
        # _model_override is set by make_agent_llm() for per-agent overrides
        override = getattr(self, "_model_override", None)
        if override:
            return override
        return settings.lmstudio.model or "local-model"

    @property
    def _timeout(self) -> float:
        return settings.lmstudio.timeout

    async def chat(self, messages: list[dict], stream: bool = False) -> str:
        if stream:
            result = []
            async for token in self.stream_chat(messages):
                result.append(token)
            return "".join(result)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/v1/chat/completions",
                json={"model": self._model, "messages": messages, "stream": False},
            )
            resp.raise_for_status()
            choices = resp.json().get("choices", [])
            return choices[0]["message"]["content"] if choices else ""

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self._timeout) as client, client.stream(
            "POST",
            f"{self._base_url}/v1/chat/completions",
            json={"model": self._model, "messages": messages, "stream": True},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:]
                if raw == "[DONE]":
                    return
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
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self._base_url}/v1/models")
                return resp.status_code == 200
        except Exception:
            return False


# ── Router ────────────────────────────────────────────────────────────────────

class LLMRouter:
    """
    Provider selection + fallback.

    Strategy:
      - settings.llm.provider == "ollama"      → OllamaClient
      - settings.llm.provider == "lmstudio"    → LMStudioClient
      - settings.llm.provider == "openrouter"  → OpenRouterClient
      - If the selected provider fails → fallback to Ollama
    """

    def __init__(self):
        self._ollama = OllamaClient()
        self._openrouter = OpenRouterClient()
        self._lmstudio = LMStudioClient()
        self._opencode_go = OpenCodeGoClient()

    def _primary(self) -> LLMClient:
        # _forced_provider is set by make_agent_llm() for per-agent overrides
        forced = getattr(self, "_forced_provider", None)
        if forced == "openrouter":
            return self._openrouter
        if forced == "opencode_go":
            return self._opencode_go
        if forced == "lmstudio":
            return self._lmstudio
        if forced == "ollama":
            return self._ollama
        if settings.llm.provider == "openrouter":
            return self._openrouter
        if settings.llm.provider == "opencode_go":
            return self._opencode_go
        if settings.llm.provider == "lmstudio":
            return self._lmstudio
        return self._ollama

    def _fallback(self) -> LLMClient:
        # Always fall back to Ollama (local)
        return self._ollama

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
                # Give a diagnostic hint for the most common WSL DNS failure
                hint = ""
                err_str = str(e).lower()
                if "name resolution" in err_str or "errno -3" in err_str or "connecterror" in err_str.lower():
                    hint = (
                        " | HINT: DNS resolution failed — check WSL network (try: echo 'nameserver 8.8.8.8' >> /etc/resolv.conf) "
                        "or configure Ollama as fallback in Settings."
                    )
                raise RuntimeError(
                    f"Primary stream ({type(primary).__name__}) failed and fallback is not available: {e}{hint}"
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
        """Bounded parser wrapper for extracting tool-call JSON from model output."""
        return parse_llm_json(response)

def make_agent_llm(provider: str, model: str) -> LLMRouter:
    """
    Create a new LLMRouter locked to a specific provider and model.

    Used for per-agent model overrides (e.g. brain uses OpenRouter claude-opus,
    while reporting uses Ollama mistral:7b).
    """
    router = LLMRouter()
    if provider and provider != "inherit":
        router._forced_provider = provider
    if model:
        if provider == "openrouter":
            router._openrouter._forced_model = model
        elif provider == "opencode_go":
            router._opencode_go._model_override = model
        elif provider == "lmstudio":
            router._lmstudio._model_override = model
        else:  # ollama
            router._ollama.model = model
    return router


# Singleton
llm_router = LLMRouter()
