"""
Shared application state — holds the tool registry so routes can access it
without circular imports.
"""

from __future__ import annotations

from core.tool_registry import ToolRegistry

# Populated during FastAPI lifespan startup
tool_registry: ToolRegistry = ToolRegistry()
pty_manager = None
