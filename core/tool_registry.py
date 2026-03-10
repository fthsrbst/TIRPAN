"""
Phase 3.5 — Tool Registry (Plugin Loader)

Agent hangi tool'ların var olduğunu buradan öğrenir.
Core tool'lar direkt register edilir; plugin'ler /plugins/ dizininden yüklenir.
"""

import importlib
import json
import logging
from pathlib import Path

from tools.base_tool import BaseTool

logger = logging.getLogger(__name__)


class ToolNotFoundError(Exception):
    """Registry'de olmayan tool istendiğinde fırlatılır."""
    pass


class ToolRegistry:
    """Tool'ları depolar, yönetir ve LLM'e tanıtır."""

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    def register(self, tool: BaseTool) -> None:
        """Bir tool'u registry'e ekle."""
        name = tool.metadata.name
        if name in self._tools:
            logger.warning("Tool '%s' zaten kayıtlı — üzerine yazılıyor.", name)
        self._tools[name] = tool
        logger.debug("Tool kayıtlı: %s", name)

    def get(self, name: str) -> BaseTool:
        """İsme göre tool getir; bulunamazsa ToolNotFoundError fırlatır."""
        if name not in self._tools:
            raise ToolNotFoundError(f"Tool bulunamadı: '{name}'")
        return self._tools[name]

    def list_tools(self) -> list[BaseTool]:
        """Kayıtlı tüm tool'ları döner."""
        return list(self._tools.values())

    def list_for_llm(self) -> list[dict]:
        """LLM'e gönderilecek tool tanımlarını döner."""
        return [tool.to_llm_dict() for tool in self._tools.values()]

    def __len__(self) -> int:
        return len(self._tools)

    # ------------------------------------------------------------------
    # Plugin Loader
    # ------------------------------------------------------------------

    def load_plugins(self, plugins_dir: Path) -> None:
        """
        /plugins/ dizinini tara; plugin.json içeren ve enabled:true olan
        her alt dizini yükle.
        """
        if not plugins_dir.exists():
            logger.debug("plugins/ dizini yok, atlanıyor: %s", plugins_dir)
            return

        for plugin_path in plugins_dir.iterdir():
            if not plugin_path.is_dir():
                continue

            config_file = plugin_path / "plugin.json"
            if not config_file.exists():
                continue

            self._load_single_plugin(config_file)

    def _load_single_plugin(self, config_file: Path) -> None:
        """Tek bir plugin.json'ı okuyup tool'u kaydet."""
        plugin_name = config_file.parent.name

        # --- plugin.json oku ---
        try:
            with config_file.open(encoding="utf-8") as f:
                cfg = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Plugin '%s' yüklenemedi — geçersiz plugin.json: %s", plugin_name, exc)
            return

        # --- zorunlu alanlar ---
        required = {"name", "enabled", "entry_point", "class_name"}
        missing = required - cfg.keys()
        if missing:
            logger.warning("Plugin '%s' yüklenemedi — eksik alanlar: %s", plugin_name, missing)
            return

        if not cfg["enabled"]:
            logger.debug("Plugin devre dışı, atlanıyor: %s", plugin_name)
            return

        # --- dinamik import ---
        try:
            module = importlib.import_module(cfg["entry_point"])
            cls = getattr(module, cfg["class_name"])
            tool_instance = cls()
            self.register(tool_instance)
            logger.info("Plugin yüklendi: %s v%s", cfg["name"], cfg.get("version", "?"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Plugin '%s' yüklenemedi — %s: %s", plugin_name, type(exc).__name__, exc)
