#!/bin/bash
# Personal Doctor AI — one-time setup for macOS.
# Safe to re-run: never overwrites backend/.env or the database; existing data is backed up before migrations.
set -u
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
ok()    { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn()  { printf "  \033[33m!\033[0m %s\n" "$*"; }
fail()  { printf "  \033[31m✗\033[0m %s\n" "$*"; }
ask()   { local a; printf "  %s [y/N] " "$1"; read -r a; [ "$a" = "y" ] || [ "$a" = "Y" ]; }
finish() { echo; printf "Press Return to close this window..."; read -r _; exit "${1:-0}"; }

echo
bold "Personal Doctor AI — Setup"
echo "──────────────────────────────────────────────"

# 1–2. Platform
bold "1. System"
if [ "$(uname -s)" != "Darwin" ]; then fail "This script is for macOS."; finish 1; fi
ok "macOS $(sw_vers -productVersion)"
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then ok "Apple silicon (arm64)"; BREW_PREFIX=/opt/homebrew; else ok "Intel ($ARCH)"; BREW_PREFIX=/usr/local; fi
export PATH="$BREW_PREFIX/bin:$PATH"

# 3–8. Tools
bold "2. Required tools"
MISSING=""
HAVE_BREW=0
if command -v brew >/dev/null 2>&1; then ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"; HAVE_BREW=1
else warn "Homebrew not found (optional, makes installing Python/Node easy): https://brew.sh"; fi

PYTHON=""
for c in python3.13 python3.12 "$BREW_PREFIX/bin/python3.13" "$BREW_PREFIX/bin/python3.12" python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
    PYTHON="$(command -v "$c")"; break
  fi
done
if [ -n "$PYTHON" ]; then ok "Python $("$PYTHON" -c 'import platform; print(platform.python_version())') ($PYTHON)"
else fail "Python 3.12+ not found"; MISSING="$MISSING python@3.12"; fi

if command -v node >/dev/null 2>&1 && node -e 'process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)'; then ok "Node.js $(node -v)"
else fail "Node.js 20+ not found"; MISSING="$MISSING node"; fi
if command -v npm >/dev/null 2>&1; then ok "npm $(npm -v)"; else fail "npm not found (comes with Node.js)"; fi
if command -v git >/dev/null 2>&1; then ok "Git $(git --version | awk '{print $3}')"; else warn "Git not found (optional). Install with: xcode-select --install"; fi
command -v curl >/dev/null 2>&1 || { fail "curl not found"; finish 1; }

if [ -n "$MISSING" ]; then
  echo
  warn "Missing:$MISSING"
  if [ $HAVE_BREW -eq 1 ] && ask "Install them now with Homebrew (brew install$MISSING)?"; then
    brew install $MISSING || { fail "Homebrew install failed."; finish 1; }
    echo "  Re-run setup.command to continue."; finish 0
  else
    echo "  Install manually from official sources, then run setup.command again:"
    echo "    Python 3.12+: https://www.python.org/downloads/macos/   (or: brew install python@3.12)"
    echo "    Node.js 20+:  https://nodejs.org/en/download            (or: brew install node)"
    finish 1
  fi
fi

# 10–11. Backend environment
bold "3. Backend (Python)"
if [ -x "$BACKEND/.venv/bin/python" ]; then ok "Virtual environment exists (backend/.venv)"
else
  "$PYTHON" -m venv "$BACKEND/.venv" || { fail "Could not create virtual environment."; finish 1; }
  ok "Created virtual environment (backend/.venv)"
fi
VPY="$BACKEND/.venv/bin/python"
echo "  Installing Python packages (this can take a minute)..."
"$VPY" -m pip install --quiet --upgrade pip >/dev/null 2>&1
if "$VPY" -m pip install --quiet -r "$BACKEND/requirements.txt"; then ok "Python packages installed"
else fail "pip install failed. Check your internet connection and run setup again."; finish 1; fi

# 12. Frontend
bold "4. Frontend (Node.js)"
cd "$FRONTEND" || finish 1
if [ -f package-lock.json ]; then INSTALL_CMD="npm ci --no-audit --no-fund"; else INSTALL_CMD="npm install --no-audit --no-fund"; fi
echo "  Installing npm packages (this can take a minute)..."
if $INSTALL_CMD >/tmp/pdai-npm-install.log 2>&1; then ok "npm packages installed"
else fail "npm install failed. See /tmp/pdai-npm-install.log"; finish 1; fi
cd "$ROOT" || finish 1

# 13–14. Environment configuration + secrets
bold "5. Configuration"
ENV_FILE="$BACKEND/.env"
if [ -f "$ENV_FILE" ]; then
  ok "backend/.env already exists — keeping it"
else
  cp "$BACKEND/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Created backend/.env from .env.example"
fi
# Fill in placeholder secrets only (never replaces real values).
"$VPY" - "$ENV_FILE" <<'PY'
import re, secrets, sys
from cryptography.fernet import Fernet
path = sys.argv[1]
text = open(path).read()
changed = []
def fill(name, value):
    global text
    m = re.search(rf"^{name}=(.*)$", text, re.M)
    if m is None:
        text += f"\n{name}={value}\n"; changed.append(name)
    elif not m.group(1).strip() or m.group(1).strip().startswith("change-me"):
        text = text[:m.start()] + f"{name}={value}" + text[m.end():]; changed.append(name)
fill("JWT_SECRET", secrets.token_urlsafe(48))
fill("ENCRYPTION_KEY", Fernet.generate_key().decode())
open(path, "w").write(text)
print("  \033[32m✓\033[0m Generated secure local keys: " + ", ".join(changed) if changed else "  \033[32m✓\033[0m Secure keys already configured")
PY
chmod 600 "$ENV_FILE"
warn "Keep backend/.env private. If you lose ENCRYPTION_KEY, saved API keys must be re-entered."

# 15. Database
bold "6. Database"
mkdir -p "$BACKEND/data/uploads" "$BACKEND/data/backups"
chmod 700 "$BACKEND/data" 2>/dev/null
DB="$BACKEND/data/personal_doctor_ai.db"
if [ -f "$DB" ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  cp "$DB" "$BACKEND/data/backups/personal_doctor_ai-$STAMP.db" && ok "Existing database backed up to backend/data/backups/"
fi
cd "$BACKEND" || finish 1
if .venv/bin/alembic upgrade head >/tmp/pdai-migrate.log 2>&1; then ok "Database ready (migrations applied)"
else fail "Migration failed. See /tmp/pdai-migrate.log"; finish 1; fi

# 16. Checks
bold "7. Checks"
if .venv/bin/python -m pytest -q >/tmp/pdai-backend-tests.log 2>&1; then ok "Backend tests passed ($(tail -1 /tmp/pdai-backend-tests.log | sed 's/=//g' | xargs))"
else warn "Some backend tests failed. See /tmp/pdai-backend-tests.log"; fi
cd "$FRONTEND" || finish 1
if npx tsc -b >/tmp/pdai-typecheck.log 2>&1; then ok "Frontend type check passed"; else warn "Type check failed. See /tmp/pdai-typecheck.log"; fi
if npx vitest run >/tmp/pdai-frontend-tests.log 2>&1; then ok "Frontend tests passed"; else warn "Some frontend tests failed. See /tmp/pdai-frontend-tests.log"; fi
cd "$ROOT" || finish 1

chmod +x "$ROOT/launch.command" "$ROOT/stop.command" "$ROOT/setup.command" 2>/dev/null
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$ROOT/.setup_complete"

# 17. Result
echo
bold "Setup complete ✔"
echo "  Start the app:  double-click launch.command"
echo "  Stop the app:   press Ctrl+C in the launcher window, or double-click stop.command"
echo "  Database:       backend/data/personal_doctor_ai.db"
echo "  Uploaded files: backend/data/uploads/"
finish 0
