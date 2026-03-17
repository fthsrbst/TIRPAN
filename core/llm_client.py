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
        """
        Extract a JSON object from an LLM response.

        Handles:
        - Plain JSON
        - ```json ... ``` fenced blocks
        - Chain-of-thought prose before/after JSON object
        - Balanced-brace extraction (JSON embedded in XML or other text)
        - MiniMax / Anthropic XML tool-call format:
            <invoke name="tool_name"><parameter name="p">v</parameter></invoke>
        - Parallel tools in XML: reconstructs {"action":"parallel_tools","tools":[...]}
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

        # 2. Fenced ```json ... ``` or ``` ... ``` block
        m = _re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, _re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass

        # 3. [ACTION] / [PARAMETERS] tag format — must be checked BEFORE balanced-brace
        #    extraction because metasploit_run has a parameter named "action" (e.g.
        #    "run", "session_exec") that would otherwise be mistaken for the tool name.
        #
        #    Matches either:
        #      [ACTION] tool_name\n[PARAMETERS] {...}
        #    or the parallel variant:
        #      [ACTION] parallel_tools\n[TOOLS] [...]
        action_tag_m = _re.search(
            r'\[ACTION\]\s*(\S+)\s*\n.*?\[PARAMETERS\]\s*(\{)',
            text, _re.DOTALL | _re.IGNORECASE,
        )
        if action_tag_m:
            ap_tool = action_tag_m.group(1).strip()
            brace_start = action_tag_m.start(2)
            # Walk forward with brace-depth to extract the complete {...} object
            ap_depth = 0
            ap_in_str = False
            ap_esc = False
            ap_end = brace_start
            for ap_i, ap_ch in enumerate(text[brace_start:], brace_start):
                if ap_esc:
                    ap_esc = False
                    continue
                if ap_ch == "\\" and ap_in_str:
                    ap_esc = True
                    continue
                if ap_ch == '"':
                    ap_in_str = not ap_in_str
                    continue
                if ap_in_str:
                    continue
                if ap_ch == "{":
                    ap_depth += 1
                elif ap_ch == "}":
                    ap_depth -= 1
                    if ap_depth == 0:
                        ap_end = ap_i + 1
                        break
            try:
                ap_params = json.loads(text[brace_start:ap_end])
                thought_m2 = _re.search(r'\[THOUGHT\]\s*(.*?)(?=\[ACTION\])', text, _re.DOTALL | _re.IGNORECASE)
                reasoning_m2 = _re.search(r'\[REASONING\]\s*(.*?)$', text, _re.DOTALL | _re.IGNORECASE)
                ap_thought = thought_m2.group(1).strip() if thought_m2 else f"Calling {ap_tool}."
                ap_reasoning = reasoning_m2.group(1).strip() if reasoning_m2 else ""
                if ap_tool == "parallel_tools":
                    ap_tools = ap_params if isinstance(ap_params, list) else ap_params.get("tools", [])
                    return {
                        "thought": ap_thought,
                        "action": "parallel_tools",
                        "tools": ap_tools,
                        "reasoning": ap_reasoning,
                    }
                return {
                    "thought": ap_thought,
                    "action": ap_tool,
                    "parameters": ap_params,
                    "reasoning": ap_reasoning,
                }
            except (json.JSONDecodeError, ValueError):
                pass  # fall through to balanced-brace

        # 4. Balanced-brace extraction — finds the outermost complete {...} block.
        #    Unlike step 3 in the old version, this uses a brace counter so it
        #    doesn't fail when there's trailing text after the JSON object.
        depth = 0
        start = -1
        in_string = False
        escape_next = False
        for i, ch in enumerate(text):
            if escape_next:
                escape_next = False
                continue
            if ch == "\\" and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start != -1:
                    candidate = text[start:i + 1]
                    try:
                        result = json.loads(candidate)
                        if isinstance(result, dict):
                            return result
                    except json.JSONDecodeError:
                        pass
                    start = -1  # reset and keep scanning for next candidate

        # 5. XML tool-call format — handles MiniMax, Anthropic-style, and similar:
        #      <invoke name="tool_name">
        #        <parameter name="p1">value</parameter>
        #        <parameter name="p2">{"key": "val"}</parameter>
        #      </invoke>
        #    Also handles <minimax:tool_call> wrappers around the invoke.
        invoke_match = _re.search(
            r'<invoke\s+name=["\']([^"\']+)["\']>(.*?)</invoke>',
            text, _re.DOTALL | _re.IGNORECASE,
        )
        if invoke_match:
            tool_name = invoke_match.group(1).strip()
            invoke_body = invoke_match.group(2)

            # Extract all <parameter name="...">...</parameter> pairs
            param_pairs = _re.findall(
                r'<parameter\s+name=["\']([^"\']+)["\']>(.*?)</parameter>',
                invoke_body, _re.DOTALL,
            )

            params: dict = {}
            for pname, pvalue in param_pairs:
                pvalue = pvalue.strip()
                # Try to decode as JSON first (arrays, objects, numbers)
                try:
                    params[pname] = json.loads(pvalue)
                except json.JSONDecodeError:
                    params[pname] = pvalue  # keep as string

            if tool_name == "parallel_tools":
                # Reconstruct the AEGIS parallel_tools format
                tools = params.get("tools", [])
                reasoning = params.get("reasoning", "")
                thought = params.get("thought", "Parallel tool execution.")
                return {
                    "thought": thought,
                    "action": "parallel_tools",
                    "tools": tools if isinstance(tools, list) else [],
                    "reasoning": reasoning,
                }
            else:
                # Single tool call — reconstruct as AEGIS action dict
                thought = params.pop("thought", f"Calling {tool_name}.")
                reasoning = params.pop("reasoning", "")
                return {
                    "thought": thought,
                    "action": tool_name,
                    "parameters": params,
                    "reasoning": reasoning,
                }

        # 6. [TOOL_CALL]...[/TOOL_CALL] format — some models use this wrapper:
        #      [TOOL_CALL]
        #      {tool => "parallel_tools", args => {
        #        --thought "..."
        #        --action "parallel_tools"
        #        --tools [{...}]
        #        --reasoning "..."
        #      }}
        #      [/TOOL_CALL]
        tool_call_block = _re.search(r'\[TOOL_CALL\](.*?)\[/TOOL_CALL\]', text, _re.DOTALL | _re.IGNORECASE)
        if tool_call_block:
            inner = tool_call_block.group(1)

            # Extract tool name from:  tool => "name"  or  tool: "name"
            name_m = _re.search(r'tool\s*(?:=>|:)\s*["\']([^"\']+)["\']', inner)
            tool_name = name_m.group(1).strip() if name_m else "unknown"

            # Extract --thought / --action / --reasoning as quoted strings
            thought_m = _re.search(r'--thought\s+"((?:[^"\\]|\\.)*)"', inner, _re.DOTALL)
            reasoning_m = _re.search(r'--reasoning\s+"((?:[^"\\]|\\.)*)"', inner, _re.DOTALL)
            thought = thought_m.group(1) if thought_m else f"Calling {tool_name}."
            reasoning = reasoning_m.group(1) if reasoning_m else ""

            # Extract --tools [...] array — use bracket-depth to find the complete array
            tools_start_m = _re.search(r'--tools\s*\[', inner)
            if tools_start_m and tool_name == "parallel_tools":
                arr_start = tools_start_m.end() - 1  # position of '['
                depth = 0
                arr_end = arr_start
                for idx, ch in enumerate(inner[arr_start:], arr_start):
                    if ch == '[':
                        depth += 1
                    elif ch == ']':
                        depth -= 1
                        if depth == 0:
                            arr_end = idx + 1
                            break
                try:
                    tools = json.loads(inner[arr_start:arr_end])
                    return {
                        "thought": thought,
                        "action": "parallel_tools",
                        "tools": tools if isinstance(tools, list) else [],
                        "reasoning": reasoning,
                    }
                except json.JSONDecodeError:
                    pass

            # Single tool or fallback — return minimal action dict
            return {
                "thought": thought,
                "action": tool_name,
                "parameters": {},
                "reasoning": reasoning,
            }

        # 7. Nothing worked — re-raise a clean error
        raise json.JSONDecodeError("No JSON object found in response", text, 0)


# Singleton
llm_router = LLMRouter()
