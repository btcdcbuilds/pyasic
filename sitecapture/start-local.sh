#!/usr/bin/env bash
# Run YCB Site Capture on this computer (macOS / Linux).
# First run: creates .venv, installs the app, and asks for the admin login.
# Data (database + uploads) is kept in ./local-data. Open http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"

PY=""
for c in python3.13 python3.12 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 12))'; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "Python 3.12 or newer is needed: https://www.python.org/downloads/" >&2
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "Setting up (first run only, a few minutes)..."
  "$PY" -m venv .venv
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install ".[bim,scan]"
fi

export SITECAPTURE_DATA_DIR="$PWD/local-data"
mkdir -p "$SITECAPTURE_DATA_DIR"
if [ ! -f "$SITECAPTURE_DATA_DIR/sitecapture.db" ]; then
  echo "Create the first admin login."
  read -r -p "Email: " SITECAPTURE_ADMIN_EMAIL
  while true; do
    read -r -s -p "Password (10+ characters): " SITECAPTURE_ADMIN_PASSWORD; echo
    [ ${#SITECAPTURE_ADMIN_PASSWORD} -ge 10 ] && break
    echo "Too short, try again."
  done
  export SITECAPTURE_ADMIN_EMAIL SITECAPTURE_ADMIN_PASSWORD
fi

echo "YCB Site Capture: http://localhost:8000  (Ctrl+C to stop)"
( sleep 3; (command -v open >/dev/null && open http://localhost:8000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8000) || true ) >/dev/null 2>&1 &
exec .venv/bin/python -m uvicorn sitecapture.api.app:app --host 127.0.0.1 --port 8000
