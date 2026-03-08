"""
AEGIS — Main entry point.

Usage:
  python main.py                    # start server
  python main.py --host 0.0.0.0    # expose on network
  python main.py --port 8080
  python main.py --no-reload       # production mode
"""

import argparse
import uvicorn
from config import settings


def parse_args():
    p = argparse.ArgumentParser(description="AEGIS Autonomous Pentesting Agent")
    p.add_argument("--host", default=settings.server.host)
    p.add_argument("--port", type=int, default=settings.server.port)
    p.add_argument("--no-reload", action="store_true")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    reload = not args.no_reload

    print(f"\n  AEGIS  v0.1.0")
    print(f"  http://{args.host}:{args.port}\n")

    uvicorn.run(
        "web.app:app",
        host=args.host,
        port=args.port,
        reload=reload,
        log_level="info",
    )
