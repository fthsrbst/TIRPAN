"""
Phase 3.5 — Tool Registry (Plugin Loader)

The agent discovers available tools from here.
Core tools are registered directly; plugins are loaded from the /plugins/ directory.
"""

import importlib
import json
import logging
from pathlib import Path

from tools.base_tool import BaseTool

logger = logging.getLogger(__name__)


class ToolNotFoundError(Exception):
    """Raised when a tool that is not in the registry is requested."""
    pass


class ToolRegistry:
    """Stores, manages, and exposes tools to the LLM."""

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    def register(self, tool: BaseTool) -> None:
        """Add a tool to the registry."""
        name = tool.metadata.name
        if name in self._tools:
            logger.warning("Tool '%s' already registered — overwriting.", name)
        self._tools[name] = tool
        logger.debug("Tool registered: %s", name)

    def get(self, name: str) -> BaseTool:
        """Get a tool by name; raises ToolNotFoundError if not found."""
        if name not in self._tools:
            raise ToolNotFoundError(f"Tool not found: '{name}'")
        return self._tools[name]

    def list_tools(self) -> list[BaseTool]:
        """Returns all registered tools."""
        return list(self._tools.values())

    def list_for_llm(self) -> list[dict]:
        """Returns tool definitions to be sent to the LLM."""
        return [tool.to_llm_dict() for tool in self._tools.values()]

    def __len__(self) -> int:
        return len(self._tools)

    # ------------------------------------------------------------------
    # Plugin Loader
    # ------------------------------------------------------------------

    def load_plugins(self, plugins_dir: Path) -> None:
        """
        Scan the /plugins/ directory; load each subdirectory
        that contains a plugin.json with enabled: true.
        """
        if not plugins_dir.exists():
            logger.debug("plugins/ directory not found, skipping: %s", plugins_dir)
            return

        for plugin_path in plugins_dir.iterdir():
            if not plugin_path.is_dir():
                continue

            config_file = plugin_path / "plugin.json"
            if not config_file.exists():
                continue

            self._load_single_plugin(config_file)

    def _load_single_plugin(self, config_file: Path) -> None:
        """Read a single plugin.json and register the tool."""
        plugin_name = config_file.parent.name

        # --- read plugin.json ---
        try:
            with config_file.open(encoding="utf-8") as f:
                cfg = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Plugin '%s' could not be loaded — invalid plugin.json: %s", plugin_name, exc)
            return

        # --- required fields ---
        required = {"name", "enabled", "entry_point", "class_name"}
        missing = required - cfg.keys()
        if missing:
            logger.warning("Plugin '%s' could not be loaded — missing fields: %s", plugin_name, missing)
            return

        if not cfg["enabled"]:
            logger.debug("Plugin disabled, skipping: %s", plugin_name)
            return

        # --- dynamic import ---
        try:
            module = importlib.import_module(cfg["entry_point"])
            cls = getattr(module, cfg["class_name"])
            tool_instance = cls()
            self.register(tool_instance)
            logger.info("Plugin loaded: %s v%s", cfg["name"], cfg.get("version", "?"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Plugin '%s' could not be loaded — %s: %s", plugin_name, type(exc).__name__, exc)
