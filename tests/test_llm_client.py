"""
Phase 2 — LLM Client unit tests (mocked HTTP)
Run: python -m pytest tests/test_llm_client.py -v
"""
import json
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from core.llm_client import OllamaClient, OpenRouterClient, LLMRouter


# ── Helpers ───────────────────────────────────────────────────────────────────

MESSAGES = [{"role": "user", "content": "Hello"}]


def make_ollama_response(content: str) -> dict:
    return {"message": {"content": content}, "done": True}


def make_openrouter_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


# ── OllamaClient ──────────────────────────────────────────────────────────────

class TestOllamaClient:

    @pytest.mark.asyncio
    async def test_chat_returns_content(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = make_ollama_response("Merhaba!")

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__.return_value = mock_client
            mock_client.post = AsyncMock(return_value=mock_resp)

            client = OllamaClient()
            result = await client.chat(MESSAGES)
            assert result == "Merhaba!"

    @pytest.mark.asyncio
    async def test_is_available_true(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get = AsyncMock(return_value=mock_resp)

            client = OllamaClient()
            assert await client.is_available() is True

    @pytest.mark.asyncio
    async def test_is_available_false_on_error(self):
        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get = AsyncMock(side_effect=Exception("connection refused"))

            client = OllamaClient()
            assert await client.is_available() is False

    @pytest.mark.asyncio
    async def test_stream_chat_yields_tokens(self):
        lines = [
            json.dumps({"message": {"content": "Mer"}, "done": False}),
            json.dumps({"message": {"content": "haba"}, "done": False}),
            json.dumps({"message": {"content": "!"}, "done": True}),
        ]

        async def fake_aiter_lines():
            for line in lines:
                yield line

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.aiter_lines = fake_aiter_lines

        mock_stream_ctx = MagicMock()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = MagicMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.stream.return_value = mock_stream_ctx

            client = OllamaClient()
            tokens = []
            async for token in client.stream_chat(MESSAGES):
                tokens.append(token)

        assert tokens == ["Mer", "haba", "!"]


# ── OpenRouterClient ──────────────────────────────────────────────────────────

class TestOpenRouterClient:

    @pytest.mark.asyncio
    async def test_chat_returns_content(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = make_openrouter_response("Yanıt!")

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__.return_value = mock_client
            mock_client.post = AsyncMock(return_value=mock_resp)

            with patch("core.llm_client.settings") as mock_settings:
                mock_settings.llm.api_key = "sk-or-test"
                mock_settings.llm.cloud_model = "claude-sonnet-4-6"

                client = OpenRouterClient()
                client.api_key = "sk-or-test"
                result = await client.chat(MESSAGES)
                assert result == "Yanıt!"

    @pytest.mark.asyncio
    async def test_retry_on_timeout(self):
        import httpx as _httpx

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = make_openrouter_response("Geç yanıt")

        call_count = 0

        async def post_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise _httpx.TimeoutException("timeout")
            return mock_resp

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__.return_value = mock_client
            mock_client.post = AsyncMock(side_effect=post_side_effect)

            with patch("asyncio.sleep", new_callable=AsyncMock):
                client = OpenRouterClient()
                client.api_key = "sk-or-test"
                result = await client.chat(MESSAGES)
                assert result == "Geç yanıt"
                assert call_count == 2

    @pytest.mark.asyncio
    async def test_fails_after_max_retries(self):
        import httpx as _httpx

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__.return_value = mock_client
            mock_client.post = AsyncMock(
                side_effect=_httpx.TimeoutException("timeout")
            )

            with patch("asyncio.sleep", new_callable=AsyncMock):
                client = OpenRouterClient()
                client.api_key = "sk-or-test"
                with pytest.raises(RuntimeError, match="OpenRouter failed"):
                    await client.chat(MESSAGES)

    @pytest.mark.asyncio
    async def test_is_available_false_without_key(self):
        client = OpenRouterClient()
        client.api_key = ""
        assert await client.is_available() is False

    @pytest.mark.asyncio
    async def test_is_available_false_with_placeholder_key(self):
        client = OpenRouterClient()
        client.api_key = "sk-or-..."
        assert await client.is_available() is False


# ── LLMRouter ─────────────────────────────────────────────────────────────────

class TestLLMRouter:

    @pytest.mark.asyncio
    async def test_parse_json_plain(self):
        raw = '{"action": "nmap_scan", "target": "10.0.0.1"}'
        result = LLMRouter.parse_json(raw)
        assert result["action"] == "nmap_scan"

    @pytest.mark.asyncio
    async def test_parse_json_with_code_block(self):
        raw = '```json\n{"action": "done"}\n```'
        result = LLMRouter.parse_json(raw)
        assert result["action"] == "done"

    @pytest.mark.asyncio
    async def test_parse_json_invalid_raises(self):
        with pytest.raises(json.JSONDecodeError):
            LLMRouter.parse_json("bu json değil")

    @pytest.mark.asyncio
    async def test_router_uses_primary(self):
        router = LLMRouter()
        router._primary = MagicMock(return_value=AsyncMock())
        router._primary().chat = AsyncMock(return_value="yanıt")

        with patch("core.llm_client.settings") as mock_settings:
            mock_settings.llm.provider = "ollama"
            result = await router.chat(MESSAGES)
            assert result == "yanıt"

    @pytest.mark.asyncio
    async def test_router_fallback_on_primary_failure(self):
        router = LLMRouter()

        router._ollama.chat = AsyncMock(side_effect=Exception("ollama down"))
        router._openrouter.chat = AsyncMock(return_value="fallback yanıt")

        with patch("core.llm_client.settings") as mock_settings:
            mock_settings.llm.provider = "ollama"
            result = await router.chat(MESSAGES)
            assert result == "fallback yanıt"
