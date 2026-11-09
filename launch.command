#!/bin/bash
# Personal Doctor AI — start backend + frontend, open the browser, stop cleanly on Ctrl+C.
set -u
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
RUN_DIR="$ROOT/.run"
LOG_DIR="$ROOT/logs"
[ -f "$ROOT/launcher.env" ] && . "$ROOT/launcher.env"   # optional overrides (ports, PDAI_NO_BROWSER)
BACKEND_PORT="${PDAI_BACKEND_PORT:-8000}"
FRONTEND_PORT="${PDAI_FRONTEND_PORT:-5173}"
BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
APP_URL="http://localhost:$FRONTEND_PORT"
OPEN_CMD="${PDAI_OPEN_CMD:-open}"   # overridable for automated tests
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$*"; }
pause_exit() { if [ -t 0 ]; then printf "\nPress Return to close..."; read -r _; fi; exit "${1:-1}"; }

echo
bold "Personal Doctor AI — Launcher"
echo "──────────────────────────────────────────────"

# 1–2. Setup + dependencies
if [ ! -f "$ROOT/.setup_complete" ] || [ ! -x "$BACKEND/.venv/bin/uvicorn" ] || [ ! -d "$FRONTEND/node_modules" ] || [ ! -f "$BACKEND/.env" ]; then
  fail "Initial setup has not been completed."
  echo "  Double-click setup.command first, then run launch.command again."
  pause_exit 1
fi
command -v node >/dev/null 2>&1 || { fail "Node.js not found. Run setup.command."; pause_exit 1; }
command -v curl >/dev/null 2>&1 || { fail "curl not found."; pause_exit 1; }
ok "Setup verified"

mkdir -p "$RUN_DIR" "$LOG_DIR"

is_ours() {  # pidfile -> 0 if process alive
  [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null
}
if is_ours "$RUN_DIR/backend.pid" && is_ours "$RUN_DIR/frontend.pid"; then
  ok "Personal Doctor AI is already running at $APP_URL"
  [ "${PDAI_NO_BROWSER:-0}" = "1" ] || $OPEN_CMD "$APP_URL"
  exit 0
fi
rm -f "$RUN_DIR/backend.pid" "$RUN_DIR/frontend.pid"

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if port_busy "$p"; then
    fail "Port $p is already in use by another program:"
    lsof -nP -iTCP:"$p" -sTCP:LISTEN | sed 's/^/      /'
    echo "  Close that program, or choose other ports by creating launcher.env with e.g.:"
    echo "      PDAI_BACKEND_PORT=8010"
    echo "      PDAI_FRONTEND_PORT=5180"
    pause_exit 1
  fi
done
ok "Ports $BACKEND_PORT and $FRONTEND_PORT are free"

# Apply pending migrations (backup first). Never destructive.
cd "$BACKEND" || exit 1
CUR="$(.venv/bin/alembic current 2>/dev/null | awk '{print $1}' | tail -1)"
HEAD="$(.venv/bin/alembic heads 2>/dev/null | awk '{print $1}' | tail -1)"
if [ "$CUR" != "$HEAD" ]; then
  DB="$BACKEND/data/personal_doctor_ai.db"
  mkdir -p "$BACKEND/data/backups"
  [ -f "$DB" ] && cp "$DB" "$BACKEND/data/backups/personal_doctor_ai-$(date +%Y%m%d-%H%M%S).db"
  if .venv/bin/alembic upgrade head >>"$LOG_DIR/backend.log" 2>&1; then ok "Database updated to the latest schema"
  else fail "Database migration failed. See logs/backend.log"; pause_exit 1; fi
fi

BACK_PID=""; FRONT_PID=""
cleanup() {
  local code="${1:-0}"
  trap - INT TERM HUP EXIT
  echo
  bold "Stopping Personal Doctor AI..."
  for pid in $FRONT_PID $BACK_PID; do
    [ -n "$pid" ] || continue
    pkill -TERM -P "$pid" 2>/dev/null   # children (e.g. esbuild)
    kill -TERM "$pid" 2>/dev/null
  done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    alive=0; for pid in $FRONT_PID $BACK_PID; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ $alive -eq 0 ] && break; sleep 0.5
  done
  for pid in $FRONT_PID $BACK_PID; do kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null; done
  rm -f "$RUN_DIR/backend.pid" "$RUN_DIR/frontend.pid" "$RUN_DIR/launcher.pid"
  ok "Stopped. Your data is saved."
  exit "$code"
}
trap cleanup INT TERM HUP EXIT
echo $$ > "$RUN_DIR/launcher.pid"

# 3. Backend
bold "Starting services"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --no-access-log >>"$LOG_DIR/backend.log" 2>&1 &
BACK_PID=$!
disown "$BACK_PID" 2>/dev/null   # we manage it ourselves; avoids shell job-noise on exit
echo "$BACK_PID" > "$RUN_DIR/backend.pid"

# 4. Frontend (bound to localhost only)
cd "$FRONTEND" || exit 1
PDAI_BACKEND_URL="$BACKEND_URL" PDAI_FRONTEND_PORT="$FRONTEND_PORT" \
  ./node_modules/.bin/vite --host localhost --port "$FRONTEND_PORT" --strictPort >>"$LOG_DIR/frontend.log" 2>&1 &
FRONT_PID=$!
disown "$FRONT_PID" 2>/dev/null
echo "$FRONT_PID" > "$RUN_DIR/frontend.pid"
cd "$ROOT" || exit 1

# 5. Health checks
wait_for() {  # name url pid
  local i
  for i in $(seq 1 60); do
    if ! kill -0 "$3" 2>/dev/null; then return 2; fi
    if curl -fs -o /dev/null --max-time 2 "$2"; then return 0; fi
    sleep 0.5
  done
  return 1
}
if wait_for backend "$BACKEND_URL/api/health" "$BACK_PID"; then ok "Backend healthy   → $BACKEND_URL (API docs: $BACKEND_URL/docs)"
else
  fail "The backend did not start. Last log lines:"
  tail -n 20 "$LOG_DIR/backend.log" | sed 's/^/      /'
  echo "  Recovery: run setup.command again, or check backend/.env. Full log: logs/backend.log"
  cleanup 1
fi
if wait_for frontend "$APP_URL" "$FRONT_PID"; then ok "Frontend ready    → $APP_URL"
else
  fail "The frontend did not start. Last log lines:"
  tail -n 20 "$LOG_DIR/frontend.log" | sed 's/^/      /'
  echo "  Recovery: run setup.command again to reinstall npm packages. Full log: logs/frontend.log"
  cleanup 1
fi

# 6–7. Open the browser once
echo
bold "Personal Doctor AI is running:  $APP_URL"
[ "${PDAI_NO_BROWSER:-0}" = "1" ] || $OPEN_CMD "$APP_URL"
echo "  Keep this window open. Press Ctrl+C (or run stop.command) to stop."

# 8. Keep running; stop both if either exits.
while kill -0 "$BACK_PID" 2>/dev/null && kill -0 "$FRONT_PID" 2>/dev/null; do sleep 2; done
fail "A service stopped unexpectedly. See the logs/ folder."
cleanup 1
