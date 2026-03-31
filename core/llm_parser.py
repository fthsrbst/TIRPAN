"""
Bounded parser for LLM action JSON extraction.
"""

from __future__ import annotations

import json
import re

_MAX_INPUT_CHARS = 32000
_MAX_BRACE_DEPTH = 64
_MAX_BRACE_CANDIDATES = 128


def parse_llm_json(response: str) -> dict:
    """
    Extract a JSON action object from an LLM response using bounded heuristics.
    """
    text = (response or "").strip()
    if not text:
        raise json.JSONDecodeError("Empty response", text, 0)
    if len(text) > _MAX_INPUT_CHARS:
        text = text[:_MAX_INPUT_CHARS]

    # 1) Plain JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2) Fenced block
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    # 3) [ACTION]/[PARAMETERS]
    action_tag = re.search(
        r"\[ACTION\]\s*(\S+)\s*\n.*?\[PARAMETERS\]\s*(\{)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if action_tag:
        tool_name = action_tag.group(1).strip()
        brace_start = action_tag.start(2)
        end = _find_matching_brace(text, brace_start)
        if end is not None:
            try:
                params = json.loads(text[brace_start:end])
                thought_m = re.search(r"\[THOUGHT\]\s*(.*?)(?=\[ACTION\])", text, re.DOTALL | re.IGNORECASE)
                reasoning_m = re.search(r"\[REASONING\]\s*(.*?)$", text, re.DOTALL | re.IGNORECASE)
                thought = thought_m.group(1).strip() if thought_m else f"Calling {tool_name}."
                reasoning = reasoning_m.group(1).strip() if reasoning_m else ""
                if tool_name == "parallel_tools":
                    tools = params if isinstance(params, list) else params.get("tools", [])
                    return {
                        "thought": thought,
                        "action": "parallel_tools",
                        "tools": tools,
                        "reasoning": reasoning,
                    }
                return {
                    "thought": thought,
                    "action": tool_name,
                    "parameters": params,
                    "reasoning": reasoning,
                }
            except (json.JSONDecodeError, ValueError):
                pass

    # 4) Balanced-brace extraction with candidate/depth limits
    candidates = 0
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
            if depth > _MAX_BRACE_DEPTH:
                depth = 0
                start = -1
                continue
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                candidates += 1
                if candidates > _MAX_BRACE_CANDIDATES:
                    break
                candidate = text[start:i + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    pass
                start = -1
            elif depth < 0:
                depth = 0

    # 5) XML invoke format
    invoke_match = re.search(
        r"<invoke\s+name=[\"']([^\"']+)[\"']>(.*?)</invoke>",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if invoke_match:
        tool_name = invoke_match.group(1).strip()
        invoke_body = invoke_match.group(2)
        param_pairs = re.findall(
            r"<parameter\s+name=[\"']([^\"']+)[\"']>(.*?)</parameter>",
            invoke_body,
            re.DOTALL,
        )
        params: dict = {}
        for pname, pvalue in param_pairs:
            value = pvalue.strip()
            try:
                params[pname] = json.loads(value)
            except json.JSONDecodeError:
                params[pname] = value
        if tool_name == "parallel_tools":
            tools = params.get("tools", [])
            return {
                "thought": params.get("thought", "Parallel tool execution."),
                "action": "parallel_tools",
                "tools": tools if isinstance(tools, list) else [],
                "reasoning": params.get("reasoning", ""),
            }
        thought = params.pop("thought", f"Calling {tool_name}.")
        reasoning = params.pop("reasoning", "")
        return {
            "thought": thought,
            "action": tool_name,
            "parameters": params,
            "reasoning": reasoning,
        }

    # 6) [TOOL_CALL] wrapper
    tool_call_block = re.search(r"\[TOOL_CALL\](.*?)\[/TOOL_CALL\]", text, re.DOTALL | re.IGNORECASE)
    if tool_call_block:
        inner = tool_call_block.group(1)
        name_m = re.search(r"tool\s*(?:=>|:)\s*[\"']([^\"']+)[\"']", inner)
        tool_name = name_m.group(1).strip() if name_m else "unknown"
        thought_m = re.search(r'--thought\s+"((?:[^"\\]|\\.)*)"', inner, re.DOTALL)
        reasoning_m = re.search(r'--reasoning\s+"((?:[^"\\]|\\.)*)"', inner, re.DOTALL)
        thought = thought_m.group(1) if thought_m else f"Calling {tool_name}."
        reasoning = reasoning_m.group(1) if reasoning_m else ""

        tools_start_m = re.search(r"--tools\s*\[", inner)
        if tools_start_m and tool_name == "parallel_tools":
            arr_start = tools_start_m.end() - 1
            arr_end = _find_matching_bracket(inner, arr_start)
            if arr_end is not None:
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

        return {
            "thought": thought,
            "action": tool_name,
            "parameters": {},
            "reasoning": reasoning,
        }

    raise json.JSONDecodeError("No JSON object found in response", text, 0)


def _find_matching_brace(text: str, start: int) -> int | None:
    depth = 0
    in_str = False
    esc = False
    for idx, ch in enumerate(text[start:], start):
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
            if depth > _MAX_BRACE_DEPTH:
                return None
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return idx + 1
    return None


def _find_matching_bracket(text: str, start: int) -> int | None:
    depth = 0
    for idx, ch in enumerate(text[start:], start):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return idx + 1
    return None
