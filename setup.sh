#!/usr/bin/env bash
#
# TIRPAN — one-shot setup for a fresh clone.
#
# Creates the Python virtualenv, installs dependencies, and prepares .env.
# Safe to re-run (idempotent). The SQLite database is created and migrated
# automatically the first time you launch the server, so there is no DB step.
#
# Usage:
#   ./setup.sh                 # Python env + deps + .env
#   BUILD_NORMAL_UI=1 ./setup.sh   # also rebuild the "normal" React UI
#
set -euo pipefail
cd "$(dirname "$0")"

echo "==> TIRPAN setup"

# 1. Python virtualenv + dependencies ────────────────────────────────────────
if ! command -v python3 >/dev/null 2>&1; then
    echo "[!] python3 not found — install Python 3.11+ first." >&2
    exit 1
fi

if [ ! -d .venv ]; then
    echo "[*] Creating Python virtualenv (.venv)"
    python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "[*] Installing Python dependencies"
python -m pip install --upgrade pip >/dev/null
pip install -r requirements.txt

# 2. Environment file ─────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[*] Created .env from .env.example — edit it to set OPENROUTER_API_KEY / JWT_SECRET"
else
    echo "[*] .env already exists — leaving it untouched"
fi

# 3. Normal UI (React build) ──────────────────────────────────────────────────
# A prebuilt copy ships in web/static/normal/, so this is only needed when you
# have changed the sources under attack-graph-canvas/.
if [ "${BUILD_NORMAL_UI:-0}" = "1" ]; then
    if command -v npm >/dev/null 2>&1; then
        echo "[*] Rebuilding normal UI (attack-graph-canvas -> web/static/normal)"
        ( cd attack-graph-canvas && npm install && npm run build )
    else
        echo "[!] npm not found — skipping normal UI rebuild (prebuilt copy is already in web/static/normal)"
    fi
else
    echo "[*] Using the prebuilt normal UI in web/static/normal (set BUILD_NORMAL_UI=1 to rebuild)"
fi

echo
echo "==> Setup complete."
echo "    Next steps:"
echo "      1. (optional) create an admin user:"
echo "           python manage.py --email you@example.com --name \"You\" --password 'changeme123'"
echo "         …or just register the first account in the web UI (it becomes owner),"
echo "         …or seed demo accounts:  python seed_demo.py"
echo "      2. start the server:        python main.py"
echo "      3. open http://localhost:8000  (full UI)  ·  /normal/ (simplified UI)"
