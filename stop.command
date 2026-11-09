#!/bin/bash
# Personal Doctor AI — stop services started by launch.command (only those; never unrelated processes).
cd "$(dirname "$0")" || exit 1
RUN_DIR="$(pwd)/.run"
stopped=0
stop_one() {  # name pidfile expected-command-pattern
  local pid
  [ -f "$2" ] || return
  pid="$(cat "$2")"
  if kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o command= | grep -qE "$3"; then
    pkill -TERM -P "$pid" 2>/dev/null
    kill -TERM "$pid" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
    echo "  ✓ Stopped $1 (pid $pid)"; stopped=1
  else
    echo "  - $1 was not running (stale pid file removed)"
  fi
  rm -f "$2"
}
echo "Stopping Personal Doctor AI..."
# Preferred: ask the launcher to shut down; it stops both services it started.
if [ -f "$RUN_DIR/launcher.pid" ]; then
  lp="$(cat "$RUN_DIR/launcher.pid")"
  if kill -0 "$lp" 2>/dev/null && ps -p "$lp" -o command= | grep -q "launch.command"; then
    kill -TERM "$lp" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$lp" 2>/dev/null || break; sleep 0.5; done
    echo "  ✓ Launcher stopped (pid $lp)"; stopped=1
  fi
  rm -f "$RUN_DIR/launcher.pid"
fi
# Fallback: stop any service still recorded (e.g. if the launcher window was force-closed).
stop_one frontend "$RUN_DIR/frontend.pid" "vite"
stop_one backend  "$RUN_DIR/backend.pid"  "uvicorn app.main:app"
[ $stopped -eq 1 ] && echo "Done. Your data is saved." || echo "Nothing to stop."
if [ -t 0 ] && [ -z "${PDAI_NONINTERACTIVE:-}" ]; then printf "Press Return to close..."; read -r _; fi
