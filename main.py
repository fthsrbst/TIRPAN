"""
AEGIS — Main entry point.

Usage:
  python main.py                    # start server
  python main.py --host 0.0.0.0    # expose on network
  python main.py --port 8080
  python main.py --no-reload       # production mode
"""

import argparse
import logging
from pathlib import Path

import uvicorn
from config import settings
from core.tool_registry import ToolRegistry
from tools.nmap_tool import NmapTool
from tools.searchsploit_tool import SearchSploitTool

logger = logging.getLogger(__name__)


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(NmapTool())
    registry.register(SearchSploitTool())
    registry.load_plugins(Path("plugins/"))
    logger.info("Registry hazır — %d tool yüklendi.", len(registry))
    return registry


def parse_args():
    p = argparse.ArgumentParser(description="AEGIS Autonomous Pentesting Agent")
    p.add_argument("--host", default=settings.server.host)
    p.add_argument("--port", type=int, default=settings.server.port)
    p.add_argument("--no-reload", action="store_true")
    return p.parse_args()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    args = parse_args()
    reload = not args.no_reload

    registry = build_registry()

    print(f"\n  AEGIS  v0.1.0")
    print(f"  http://{args.host}:{args.port}")
    print(f"  Tools: {[t.metadata.name for t in registry.list_tools()]}\n")

    uvicorn.run(
        "web.app:app",
        host=args.host,
        port=args.port,
        reload=reload,
        log_level="info",
    )
