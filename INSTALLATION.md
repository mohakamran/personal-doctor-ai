# Installation

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| macOS | 13+ (tested on 15.5, Apple silicon) | — |
| Python | 3.12 or newer | `brew install python@3.12` or <https://www.python.org/downloads/macos/> |
| Node.js | 20 or newer (includes npm) | `brew install node` or <https://nodejs.org/en/download> |
| Git | any (optional) | `xcode-select --install` |
| Homebrew | optional | <https://brew.sh> |

An OpenAI API key is needed only for AI features (<https://platform.openai.com/api-keys>). API usage is billed
by OpenAI separately.

## 1. Setup (once)

Double-click **`setup.command`** (or run `./setup.command` in Terminal). It:

1. Detects macOS and the processor architecture.
2. Checks Python 3.12+, Node.js 20+, npm, Git, Homebrew; if something is missing it offers `brew install …`
   (only with your confirmation) or prints the official download links.
3. Creates the Python virtual environment `backend/.venv` and installs `backend/requirements.txt`.
4. Installs frontend packages with `npm ci` (exact versions from `package-lock.json`).
5. Creates `backend/.env` from `backend/.env.example` **only if it doesn't exist**, then fills in placeholder
   secrets with freshly generated values (`JWT_SECRET`, `ENCRYPTION_KEY`). Existing values are never replaced.
6. Backs up an existing database to `backend/data/backups/`, then applies migrations (`alembic upgrade head`).
7. Runs the backend tests, frontend type check and frontend tests.
8. Prints the result.

Setup is safe to re-run (e.g. after updating the app).

## 2. Launch

Double-click **`launch.command`**. It verifies setup, checks the ports, applies any pending migrations
(with a backup first), starts FastAPI and Vite, waits until both are healthy and opens your browser once.

| Service | Default URL |
|---|---|
| App | <http://localhost:5173> |
| Backend | <http://127.0.0.1:8000> |
| API docs | <http://127.0.0.1:8000/docs> |

Both servers listen on localhost only — they are not reachable from your network.

Keep the launcher window open while you use the app. Stop with **Ctrl+C** or **`stop.command`**
(which only stops processes the launcher started).

### Changing ports

Create a file named `launcher.env` in the project root:

```bash
PDAI_BACKEND_PORT=8010
PDAI_FRONTEND_PORT=5180
# PDAI_NO_BROWSER=1   # don't open the browser automatically
```

If you change the frontend port, also set `FRONTEND_ORIGIN=http://localhost:5180` in `backend/.env`.

## Manual start (developers)

```bash
cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
cd frontend && npm run dev
```

## Troubleshooting

| Problem | Fix |
|---|---|
| "unidentified developer" when double-clicking | Right-click the file → Open → Open. Or run `chmod +x *.command` and start from Terminal. |
| "Initial setup has not been completed" | Run `setup.command`. |
| "Port 8000/5173 is already in use" | The launcher shows which program holds it. Close it or use `launcher.env` to change ports. If it's an old instance of this app, run `stop.command`. |
| Backend did not start | Read the last lines shown (full log in `logs/backend.log`). Usually `backend/.env` is missing secrets — re-run `setup.command`. |
| Frontend did not start | Re-run `setup.command` to reinstall npm packages; see `logs/frontend.log`. |
| "The saved API key could not be decrypted" | `ENCRYPTION_KEY` in `backend/.env` changed. Re-enter your OpenAI key in Settings. |
| AI errors (invalid key, model not available, quota) | Settings → AI configuration → Test connection shows the exact reason. Check billing/limits at platform.openai.com. |
| Uploaded scanned PDF shows "no text found" | Scanned images need OCR, which is a planned enhancement. |

## Backup and restore

All your data is in `backend/data/` (database + uploaded files) plus `backend/.env` (needed to decrypt saved
API keys).

**Back up** (with the app stopped):

```bash
cp -R backend/data ~/Desktop/pdai-backup-$(date +%Y%m%d) && cp backend/.env ~/Desktop/pdai-backup-$(date +%Y%m%d)/env.backup
```

**Restore**: stop the app, replace `backend/data` with your backup copy (and `backend/.env` if needed), then
launch. You can also export your data as JSON in Settings → Data management at any time.

The setup and launch scripts automatically copy the database to `backend/data/backups/` before applying
schema migrations.

## Uninstall

Stop the app and delete the project folder. This permanently deletes your local health data — export first.
