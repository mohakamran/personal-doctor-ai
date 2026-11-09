# Testing

All automated tests use **synthetic data** and a **mocked OpenAI client** — they make no network calls and
cost nothing.

## Run everything

```bash
cd backend && .venv/bin/python -m pytest -q
```
```bash
cd frontend && npx tsc -b && npx vitest run
```
```bash
scripts/test_launch.sh
```
(`setup.command` runs the first two automatically. Stop the app before running `test_launch.sh`.)

## Backend (Pytest) — `backend/tests/`

The suite runs Alembic migrations against a fresh temporary SQLite database and upload folder.

| File | Covers |
|---|---|
| `test_auth.py` | health check, registration (HttpOnly/SameSite cookies), weak password & duplicate email, login/logout, invalid credentials, unauthorized access to every private endpoint, tampered token, **CSRF enforcement**, **auth rate limiting**, password change, account deletion |
| `test_health.py` | profile create/update + BMI only with valid height & weight, profile validation, conditions/allergies CRUD, measurement validation & **original-unit preservation**, analytics normalization/date filters/calculated BMI, symptoms (chronological), medications + reminders + active status, appointments + cancel, dashboard real data & empty state, summary & export (no password hash), **user isolation across all resources** |
| `test_ai.py` | missing key, **invalid key**, unknown model, **successful connection**, key encrypted in DB & masked in API, model listing, key removal, **consent enforcement**, consent withdrawal cascade, **conversation persistence** & history, **context retrieval** (relevant items; global & per-conversation opt-out), no cross-user context leakage, **API timeout**, **API rate limit**, failed turns not persisted, **streaming** success & error events, **safety escalation without AI**, safety rule unit tests (incl. non-triggering educational questions), summaries, key never logged |
| `test_documents.py` | **PDF upload & text extraction**, result-line detection, download, metadata edit, **invalid file rejection** (wrong type, fake PDF, empty, bad category), **file size limit**, filename path-traversal sanitisation, image-only PDF, **document ownership**, explain consent gates & success, follow-up questions with document context |

Latest result: **44 passed**.

## Frontend (Vitest + React Testing Library) — `frontend/src/test/`

| File | Covers |
|---|---|
| `api.test.ts` | CSRF header on unsafe requests only, same-origin credentials, ApiError mapping, validation message extraction, network failure message, no web-storage writes |
| `components.test.tsx` | Chat message Markdown rendering & context note, safety styling, user text not rendered as HTML, Login validation before API call, backend error display, formatting utils |

Plus `npx tsc -b` (strict type check). Latest result: **11 passed**, type check clean.

## Launcher — `scripts/test_launch.sh`

Starts `launch.command` on alternate ports (18765/15873) with a stub browser opener and checks:
scripts executable & valid syntax, **backend health**, **frontend serves app**, API proxy, **browser opened
exactly once**, backend bound to 127.0.0.1, pid files, **graceful shutdown via stop.command**, ports released,
pid files removed, shutdown message, **port-conflict detection**. Latest result: **14 passed**.

`setup.command` is exercised end-to-end by running it (it is idempotent and non-destructive).

## Manual test procedure — real OpenAI integration

Use a real key with a low spending limit and **synthetic health data only**.

1. Launch the app, register a test account (e.g. `tester@example.com`).
2. Settings → AI configuration:
   1. Enter an **invalid** key (e.g. `sk-invalid-0000000000000000000000`) and a model → **Test connection** →
      expect "OpenAI rejected the API key…". Save stays disabled.
   2. Enter your real key and a non-existent model (`gpt-does-not-exist`) → expect "model is not available".
   3. Enter a valid model (the field suggests models after a successful test) → **Test connection** → success
      → **Save configuration** → status "Connected", key shown as `sk-…abcd`.
   4. Reload the page: the key field is empty and only the masked key is shown.
   5. `sqlite3 backend/data/personal_doctor_ai.db "select encrypted_api_key from ai_settings"` shows ciphertext
      starting with `gAAAA`, never the key.
3. AI Doctor without consent → error "Please allow sending your messages to OpenAI…". Enable consent in Privacy.
4. Ask "What are common causes of tension headaches?" → reply streams; message and reply persist after reload.
5. Add synthetic profile data (allergy "Penicillin", medication "Cetirizine 10 mg"), enable "Use my saved
   health information", ask "Is there anything about my allergies I should mention to a dentist?" → the
   footnote shows "used your … allergies …" and the reply refers to the allergy as something you recorded.
6. Toggle "Use my health info" off for the conversation → ask again → reply should not know the allergy.
7. Send "I have crushing chest pain spreading to my left arm" → immediate urgent-care message with your
   country's emergency number; check OpenAI usage dashboard shows no request for that message.
8. Click **Summarize** → summary dialog appears; it also appears in the downloadable health summary.
9. Medical Records → upload a synthetic lab PDF → Extracted text tab shows values verbatim → AI explanation:
   button disabled until Privacy "Allow document analysis" is on and the consent box is ticked → explanation
   quotes values/units/ranges as written → **Ask follow-up questions** opens a document chat.
10. Error handling: temporarily disconnect from the internet and send a message → "Could not reach OpenAI";
    the message is not saved and can be retried.
11. **Remove API key** → AI Doctor shows "AI is not connected yet"; safety messages still work.

### Offline end-to-end check with a local mock
The OpenAI SDK honours `OPENAI_BASE_URL`. Starting the launcher with
`OPENAI_BASE_URL=http://127.0.0.1:<port>/v1 ./launch.command` points the backend at a local mock that
implements `/v1/models` and `/v1/responses` (incl. SSE streaming), allowing full UI testing of settings,
streaming chat and document explanation without a real key. This was used during development verification.
