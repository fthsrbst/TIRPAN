"""
Phase 3.5 — ToolRegistry testleri

5 senaryo:
  1. Core tool register + get
  2. Olmayan tool → ToolNotFoundError
  3. load_plugins() — mock plugin yükleme
  4. enabled: false plugin yüklenmemeli
  5. Bozuk plugin.json → uygulama çökmemeli (WARNING log)
"""

import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from core.tool_registry import ToolRegistry, ToolNotFoundError
from tools.base_tool import BaseTool, ToolMetadata


# ------------------------------------------------------------------
# Yardımcı: sahte tool
# ------------------------------------------------------------------

class FakeTool(BaseTool):
    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="fake_tool",
            description="Test amaçlı sahte tool",
            parameters={"type": "object", "properties": {}},
            category="recon",
        )

    async def execute(self, params: dict) -> dict:
        return {"success": True, "output": "fake", "error": None}


class AnotherFakeTool(BaseTool):
    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="another_tool",
            description="İkinci sahte tool",
            parameters={"type": "object", "properties": {}},
            category="recon",
        )

    async def execute(self, params: dict) -> dict:
        return {"success": True, "output": "another", "error": None}


# ------------------------------------------------------------------
# 1. Core tool register + get
# ------------------------------------------------------------------

class TestRegisterAndGet:
    def test_register_and_get(self):
        registry = ToolRegistry()
        tool = FakeTool()
        registry.register(tool)

        retrieved = registry.get("fake_tool")
        assert retrieved is tool

    def test_register_multiple_tools(self):
        registry = ToolRegistry()
        registry.register(FakeTool())
        registry.register(AnotherFakeTool())

        assert len(registry) == 2

    def test_list_for_llm(self):
        registry = ToolRegistry()
        registry.register(FakeTool())

        result = registry.list_for_llm()
        assert len(result) == 1
        assert result[0]["name"] == "fake_tool"
        assert "description" in result[0]
        assert "parameters" in result[0]

    def test_list_tools(self):
        registry = ToolRegistry()
        registry.register(FakeTool())
        registry.register(AnotherFakeTool())

        tools = registry.list_tools()
        names = [t.metadata.name for t in tools]
        assert "fake_tool" in names
        assert "another_tool" in names


# ------------------------------------------------------------------
# 2. Olmayan tool → ToolNotFoundError
# ------------------------------------------------------------------

class TestToolNotFound:
    def test_get_nonexistent_raises(self):
        registry = ToolRegistry()
        with pytest.raises(ToolNotFoundError):
            registry.get("nonexistent_tool")

    def test_error_message_contains_name(self):
        registry = ToolRegistry()
        with pytest.raises(ToolNotFoundError, match="nonexistent_tool"):
            registry.get("nonexistent_tool")


# ------------------------------------------------------------------
# 3. load_plugins() — geçerli plugin yükleme
# ------------------------------------------------------------------

class TestLoadPlugins:
    def test_valid_plugin_loaded(self, tmp_path):
        # Sahte plugin dizini oluştur
        plugin_dir = tmp_path / "my_plugin"
        plugin_dir.mkdir()

        config = {
            "name": "my_plugin",
            "enabled": True,
            "entry_point": "tools.nmap_tool",  # gerçek mevcut modül
            "class_name": "NmapTool",
            "version": "1.0.0",
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(config))

        registry = ToolRegistry()
        registry.load_plugins(tmp_path)

        # NmapTool adı "nmap_scan" olduğu için onu kontrol et
        tool = registry.get("nmap_scan")
        assert tool is not None

    def test_nonexistent_plugins_dir(self, tmp_path):
        """Dizin yoksa sessizce geç, hata fırlatma."""
        registry = ToolRegistry()
        registry.load_plugins(tmp_path / "does_not_exist")
        assert len(registry) == 0


# ------------------------------------------------------------------
# 4. enabled: false → yüklenmemeli
# ------------------------------------------------------------------

class TestPluginDisabled:
    def test_disabled_plugin_not_loaded(self, tmp_path):
        plugin_dir = tmp_path / "disabled_plugin"
        plugin_dir.mkdir()

        config = {
            "name": "disabled_plugin",
            "enabled": False,
            "entry_point": "tools.nmap_tool",
            "class_name": "NmapTool",
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(config))

        registry = ToolRegistry()
        registry.load_plugins(tmp_path)

        assert len(registry) == 0


# ------------------------------------------------------------------
# 5. Bozuk plugin.json → uygulama çökmemeli
# ------------------------------------------------------------------

class TestMalformedPlugin:
    def test_invalid_json_does_not_crash(self, tmp_path):
        plugin_dir = tmp_path / "bad_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.json").write_text("{ THIS IS NOT JSON }")

        registry = ToolRegistry()
        registry.load_plugins(tmp_path)  # hata fırlatmamalı
        assert len(registry) == 0

    def test_missing_required_fields_does_not_crash(self, tmp_path):
        plugin_dir = tmp_path / "incomplete_plugin"
        plugin_dir.mkdir()

        config = {"name": "incomplete"}  # enabled, entry_point, class_name eksik
        (plugin_dir / "plugin.json").write_text(json.dumps(config))

        registry = ToolRegistry()
        registry.load_plugins(tmp_path)
        assert len(registry) == 0

    def test_bad_module_does_not_crash(self, tmp_path):
        plugin_dir = tmp_path / "bad_module"
        plugin_dir.mkdir()

        config = {
            "name": "bad_module",
            "enabled": True,
            "entry_point": "nonexistent.module.path",
            "class_name": "SomeClass",
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(config))

        registry = ToolRegistry()
        registry.load_plugins(tmp_path)
        assert len(registry) == 0
