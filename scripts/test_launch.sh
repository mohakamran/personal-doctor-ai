#!/bin/bash
# Automated launcher test: starts launch.command on alternate ports, checks backend + frontend health,
# verifies the browser-open call happens exactly once, then stops via stop.command and checks shutdown.
# Usage: scripts/test_launch.sh   (requires setup.command to have been run)
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
BP=18765; FP=15873
TMP="$(mktemp -d)"
OPENLOG="$TMP/open.log"
cat > "$TMP/fake-open" <<SH
#!/bin/bash
echo "\$@" >> "$OPENLOG"
SH
chmod +x "$TMP/fake-open"
pass=0; failn=0
check() { if eval "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1"; failn=$((failn+1)); fi; }

if [ -f .run/launcher.pid ] && kill -0 "$(cat .run/launcher.pid)" 2>/dev/null; then
  echo "Personal Doctor AI is currently running. Stop it first (stop.command), then re-run this test."; exit 2
fi
echo "Launcher test (backend :$BP, frontend :$FP)"
check "launch.command is executable" '[ -x launch.command ] && [ -x stop.command ] && [ -x setup.command ]'
check "scripts have valid bash syntax" 'bash -n setup.command && bash -n launch.command && bash -n stop.command'

PDAI_BACKEND_PORT=$BP PDAI_FRONTEND_PORT=$FP PDAI_OPEN_CMD="$TMP/fake-open" ./launch.command > "$TMP/launch.out" 2>&1 &
LPID=$!
for i in $(seq 1 90); do grep -q "Keep this window open" "$TMP/launch.out" && break; sleep 0.5; done

check "backend health check responds" 'curl -fs http://127.0.0.1:$BP/api/health | grep -q "\"status\":\"ok\""'
check "frontend serves the app" 'curl -fs http://localhost:$FP/ | grep -q "Personal Doctor AI"'
check "frontend proxies the API" 'curl -fs http://localhost:$FP/api/health | grep -q ok'
check "browser opened exactly once with app URL" '[ "$(cat "$OPENLOG" 2>/dev/null)" = "http://localhost:$FP" ]'
check "backend bound to 127.0.0.1 only" '! lsof -nP -iTCP:$BP -sTCP:LISTEN | grep -q "\*:$BP"'
check "pid files written" '[ -f .run/backend.pid ] && [ -f .run/frontend.pid ] && [ -f .run/launcher.pid ]'

PDAI_NONINTERACTIVE=1 ./stop.command </dev/null > "$TMP/stop.out" 2>&1
for i in $(seq 1 20); do kill -0 $LPID 2>/dev/null || break; sleep 0.5; done
check "launcher exited after stop.command" '! kill -0 $LPID 2>/dev/null'
check "backend port released" '! lsof -nP -iTCP:$BP -sTCP:LISTEN >/dev/null 2>&1'
check "frontend port released" '! lsof -nP -iTCP:$FP -sTCP:LISTEN >/dev/null 2>&1'
check "pid files cleaned up" '[ ! -f .run/backend.pid ] && [ ! -f .run/frontend.pid ]'
check "graceful shutdown message" 'grep -q "Stopped. Your data is saved." "$TMP/launch.out"'

# Port-conflict detection
python3 -c "import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1',$BP)); s.listen(); time.sleep(8)" &
HOLD=$!; sleep 0.7
if lsof -nP -iTCP:$BP -sTCP:LISTEN >/dev/null 2>&1; then
  PDAI_BACKEND_PORT=$BP PDAI_FRONTEND_PORT=$FP PDAI_NO_BROWSER=1 ./launch.command </dev/null > "$TMP/conflict.out" 2>&1 &
  CPID=$!
  for i in $(seq 1 20); do kill -0 $CPID 2>/dev/null || break; sleep 0.5; done
  if kill -0 $CPID 2>/dev/null; then PDAI_NONINTERACTIVE=1 ./stop.command </dev/null >/dev/null 2>&1; fi
else
  echo "conflict-holder could not bind" > "$TMP/conflict.out"
fi
check "port conflict is detected and reported" 'grep -q "already in use" "$TMP/conflict.out"'
kill $HOLD 2>/dev/null; wait $HOLD 2>/dev/null

echo "Result: $pass passed, $failn failed"
rm -rf "$TMP"
[ $failn -eq 0 ]
