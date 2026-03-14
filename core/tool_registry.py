"""
Phase 3.5 — Tool Registry (Plugin Loader)

The agent discovers available tools from here.
Core tools are registered directly; plugins are loaded from the /plugins/ directory.

V2 additions:
  - health_check() support via run_health_checks()
  - Three plugin types: python_class | cli_wrapper | api_wrapper
  - list_for_llm(healthy_only=True) excludes unavailable tools
"""

import importlib
import json
import logging
from pathlib import Path

from tools.base_tool import BaseTool, ToolHealthStatus

logger = logging.getLogger(__name__)


class ToolNotFoundError(Exception):
    """Raised when a tool that is not in the registry is requested."""
    pass


class ToolRegistry:
    """Stores, manages, and exposes tools to the LLM."""

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}
        self._health: dict[str, ToolHealthStatus] = {}

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

    def list_for_llm(self, healthy_only: bool = True) -> list[dict]:
        """
        Returns tool definitions to be sent to the LLM.
        When healthy_only=True (default), tools with available=False are excluded.
        """
        result = []
        for tool in self._tools.values():
            status = self._health.get(tool.metadata.name)
            if healthy_only and status and not status.available:
                continue  # exclude unavailable tools from the LLM
            result.append(tool.to_llm_dict(health=status))
        return result

    def get_health(self, name: str) -> ToolHealthStatus | None:
        return self._health.get(name)

    def all_health(self) -> dict[str, ToolHealthStatus]:
        return dict(self._health)

    def __len__(self) -> int:
        return len(self._tools)

    # ------------------------------------------------------------------
    # Health Checks (V2)
    # ------------------------------------------------------------------

    async def run_health_checks(self) -> dict[str, ToolHealthStatus]:
        """
        Run health_check() on all registered tools.
        Called once at session start — results cached until next call.
        """
        import asyncio

        async def _check(name: str, tool: BaseTool):
            try:
                status = await tool.health_check()
            except Exception as exc:
                logger.warning("health_check failed for '%s': %s", name, exc)
                status = ToolHealthStatus(
                    available=False,
                    message=f"health_check error: {exc}",
                )
            self._health[name] = status
            if not status.available:
                logger.warning("Tool '%s' UNAVAILABLE: %s", name, status.message)
            elif status.degraded:
                logger.info("Tool '%s' DEGRADED: %s", name, status.message)
            else:
                logger.debug("Tool '%s' OK", name)

        await asyncio.gather(*[_check(n, t) for n, t in self._tools.items()])
        return dict(self._health)

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

        if not cfg.get("enabled", False):
            logger.debug("Plugin disabled, skipping: %s", plugin_name)
            return

        # --- dispatch on plugin type ---
        plugin_type = cfg.get("type", "python_class")

        try:
            match plugin_type:
                case "python_class":
                    required = {"name", "entry_point", "class_name"}
                    missing = required - cfg.keys()
                    if missing:
                        logger.warning("Plugin '%s' missing fields: %s", plugin_name, missing)
                        return
                    module = importlib.import_module(cfg["entry_point"])
                    cls = getattr(module, cfg["class_name"])
                    tool_instance = cls()

                case "cli_wrapper":
                    if "name" not in cfg or "binary" not in cfg:
                        logger.warning("Plugin '%s' (cli_wrapper) missing 'name' or 'binary'", plugin_name)
                        return
                    from core.generic_tools import GenericCLITool
                    tool_instance = GenericCLITool(cfg)

                case "api_wrapper":
                    if "name" not in cfg or "base_url" not in cfg:
                        logger.warning("Plugin '%s' (api_wrapper) missing 'name' or 'base_url'", plugin_name)
                        return
                    from core.generic_tools import GenericAPITool
                    tool_instance = GenericAPITool(cfg)

                case _:
                    logger.warning("Plugin '%s' has unknown type '%s' — skipping", plugin_name, plugin_type)
                    return

            self.register(tool_instance)
            logger.info("Plugin loaded: %s v%s (type=%s)", cfg["name"], cfg.get("version", "?"), plugin_type)

        except Exception as exc:  # noqa: BLE001
            logger.warning("Plugin '%s' could not be loaded — %s: %s", plugin_name, type(exc).__name__, exc)
