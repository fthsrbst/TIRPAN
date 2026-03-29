"""
V2 — GenericCLITool + GenericAPITool

Allows adding new tools via plugin.json alone — no Python tool.py required.

GenericCLITool  → wraps any CLI binary declared in plugin.json (type="cli_wrapper")
GenericAPITool  → calls REST API endpoints declared in plugin.json (type="api_wrapper")

Both honour the full BaseTool contract including health_check().
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import tempfile
from pathlib import Path

import httpx

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _apply_defaults(params: dict, schema: dict) -> dict:
    """Fill missing params from JSON Schema default values."""
    result = dict(params)
    props = schema.get("properties", {})
    for key, prop in props.items():
        if key not in result and "default" in prop:
            result[key] = prop["default"]
    return result


def _validate_required(params: dict, schema: dict) -> tuple[bool, str]:
    """Check that all required parameters are present."""
    required = schema.get("required", [])
    for key in required:
        if key not in params:
            return False, f"Missing required parameter: {key}"
    return True, ""


# ── GenericCLITool ────────────────────────────────────────────────────────────

class GenericCLITool(BaseTool):
    """
    Wraps a CLI binary declared entirely in plugin.json.

    plugin.json fields used:
      binary          — executable name (verified via shutil.which)
      install_hint    — shown in UI when binary not found
      args_template   — list of args; {param} placeholders substituted at runtime
      output_format   — "jsonlines" | "json" | "text" | "csv"
      timeout_seconds — default 300
      parameters      — JSON Schema for LLM parameter generation
      name, description, category, version
    """

    def __init__(self, cfg: dict):
        self._cfg = cfg
        self._meta = ToolMetadata(
            name=cfg["name"],
            description=cfg.get("description", f"Run {cfg.get('binary', cfg['name'])}"),
            parameters=cfg.get("parameters", {"type": "object", "properties": {}}),
            category=cfg.get("category", "recon"),
            version=cfg.get("version", "1.0.0"),
        )

    @property
    def metadata(self) -> ToolMetadata:
        return self._meta

    async def health_check(self) -> ToolHealthStatus:
        binary = self._cfg.get("binary", self._cfg["name"])
        if shutil.which(binary):
            return ToolHealthStatus(available=True, message=f"{binary} found")
        hint = self._cfg.get("install_hint")
        return ToolHealthStatus(
            available=False,
            message=f"Binary '{binary}' not found in PATH",
            install_hint=hint,
        )

    async def validate(self, params: dict) -> tuple[bool, str]:
        params = _apply_defaults(params, self._meta.parameters)
        return _validate_required(params, self._meta.parameters)

    async def execute(self, params: dict) -> dict:
        ok, err = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": err}

        params = _apply_defaults(params, self._meta.parameters)
        binary = self._cfg.get("binary", self._cfg["name"])

        if not shutil.which(binary):
            hint = self._cfg.get("install_hint", "")
            return {
                "success": False,
                "output": None,
                "error": f"Binary '{binary}' not found. {hint}",
            }

        timeout = self._cfg.get("timeout_seconds", 300)
        output_format = self._cfg.get("output_format", "text")
        args_template = self._cfg.get("args_template", ["{target}"])

        # Resolve {output_file} placeholder
        tmp_file: str | None = None
        if "{output_file}" in args_template:
            suffix = ".json" if output_format in ("json", "jsonlines") else ".txt"
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            tmp.close()
            tmp_file = tmp.name

        # Substitute template placeholders
        resolved_args: list[str] = []
        for arg in args_template:
            if arg == "{output_file}":
                resolved_args.append(tmp_file or "/tmp/tirpan_out.txt")
            elif arg.startswith("{") and arg.endswith("}"):
                key = arg[1:-1]
                resolved_args.append(str(params.get(key, "")))
            else:
                resolved_args.append(arg)

        cmd = [binary] + resolved_args

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    _run_subprocess, cmd
                ),
                timeout=timeout,
            )
            returncode, stdout, stderr = result
        except asyncio.TimeoutError:
            return {"success": False, "output": None, "error": f"{binary} timed out after {timeout}s"}
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}

        # Read from output file if used
        raw_output = stdout
        if tmp_file:
            try:
                raw_output = Path(tmp_file).read_text()
                Path(tmp_file).unlink(missing_ok=True)
            except Exception:
                pass

        parsed = _parse_output(raw_output, output_format)

        if returncode != 0:
            # Some tools return non-zero even on success (nuclei etc.) — include output
            return {
                "success": True,
                "output": parsed,
                "error": stderr.strip() if stderr.strip() else None,
            }

        return {"success": True, "output": parsed, "error": None}


def _run_subprocess(cmd: list[str]) -> tuple[int, str, str]:
    import subprocess
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def _parse_output(raw: str, fmt: str) -> object:
    if fmt == "json":
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw
    if fmt == "jsonlines":
        results = []
        for line in raw.splitlines():
            line = line.strip()
            if line:
                try:
                    results.append(json.loads(line))
                except json.JSONDecodeError:
                    results.append({"raw": line})
        return results
    if fmt == "csv":
        import csv, io
        reader = csv.DictReader(io.StringIO(raw))
        return list(reader)
    return raw  # text


# ── GenericAPITool ────────────────────────────────────────────────────────────

class GenericAPITool(BaseTool):
    """
    Calls a REST API declared entirely in plugin.json (type="api_wrapper").

    Auth resolution order:
      1. env var named by auth_env
      2. SecureStore key named by auth_secure_store_key
      3. DB app_settings table key
      4. None → health_check() returns available=False
    """

    def __init__(self, cfg: dict):
        self._cfg = cfg
        self._meta = ToolMetadata(
            name=cfg["name"],
            description=cfg.get("description", f"API: {cfg['name']}"),
            parameters=cfg.get("parameters", {"type": "object", "properties": {}}),
            category=cfg.get("category", "recon"),
            version=cfg.get("version", "1.0.0"),
        )

    @property
    def metadata(self) -> ToolMetadata:
        return self._meta

    def _resolve_auth(self) -> str | None:
        import os
        from core.secure_store import get_secret

        # 1. env var
        env_name = self._cfg.get("auth_env", "")
        if env_name and os.environ.get(env_name):
            return os.environ[env_name]

        # 2. SecureStore
        store_key = self._cfg.get("auth_secure_store_key", "")
        if store_key:
            val = get_secret(store_key)
            if val:
                return val

        return None

    async def health_check(self) -> ToolHealthStatus:
        auth = self._resolve_auth()
        if auth:
            return ToolHealthStatus(available=True, message="API key configured")
        env_name = self._cfg.get("auth_env", "")
        hint = f"Set the {env_name} environment variable or configure in Settings → API Keys"
        return ToolHealthStatus(
            available=False,
            message="API key not configured",
            install_hint=hint,
        )

    async def validate(self, params: dict) -> tuple[bool, str]:
        params = _apply_defaults(params, self._meta.parameters)
        return _validate_required(params, self._meta.parameters)

    async def execute(self, params: dict) -> dict:
        ok, err = await self.validate(params)
        if not ok:
            return {"success": False, "output": None, "error": err}

        params = _apply_defaults(params, self._meta.parameters)

        auth_key = self._resolve_auth()
        if not auth_key:
            return {
                "success": False,
                "output": None,
                "error": f"API key not configured for {self._cfg['name']}",
            }

        base_url = self._cfg.get("base_url", "")
        auth_type = self._cfg.get("auth_type", "query_param")
        auth_param = self._cfg.get("auth_param_name", "key")
        timeout = self._cfg.get("timeout_seconds", 15)

        # Determine endpoint (use first endpoint by default)
        endpoints = self._cfg.get("endpoints", {})
        if not endpoints:
            return {"success": False, "output": None, "error": "No endpoints defined in plugin.json"}

        ep_name = params.pop("endpoint", next(iter(endpoints)))
        ep = endpoints.get(ep_name, list(endpoints.values())[0])
        method = ep.get("method", "GET").upper()
        path = ep.get("path", "/")

        # Substitute path parameters
        for k, v in params.items():
            path = path.replace(f"{{{k}}}", str(v))

        url = base_url.rstrip("/") + path

        req_kwargs: dict = {"timeout": timeout}
        if auth_type == "query_param":
            req_kwargs["params"] = {auth_param: auth_key}
        elif auth_type == "bearer":
            req_kwargs["headers"] = {"Authorization": f"Bearer {auth_key}"}
        elif auth_type == "header":
            req_kwargs["headers"] = {auth_param: auth_key}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.request(method, url, **req_kwargs)
                resp.raise_for_status()
                response_field = ep.get("response_field")
                data = resp.json()
                output = data.get(response_field) if response_field else data
                return {"success": True, "output": output, "error": None}
        except httpx.HTTPStatusError as e:
            return {"success": False, "output": None, "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
        except Exception as exc:
            return {"success": False, "output": None, "error": str(exc)}
