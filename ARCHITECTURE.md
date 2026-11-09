# Architecture

```
Browser (React SPA, http://localhost:5173)
   │  same-origin /api/* requests (Vite dev proxy) — HttpOnly session cookie + CSRF header
   ▼
FastAPI (http://127.0.0.1:8000)
   ├── api/v1/*          route handlers (thin: validate → call service/repository → serialize)
   ├── services/*        business logic (chat orchestration, AI, safety, context, documents, summaries)
   ├── repositories/*    ownership-enforcing data access (every query filtered by user_id)
   ├── models/           SQLAlchemy 2 ORM (14 tables)        ──►  SQLite (backend/data/*.db)
   ├── schemas/          Pydantic v2 request/response models
   ├── security/         Argon2, JWT, CSRF, Fernet encryption, rate limiting
   └── core/             config deps, error handling, middleware, audit
                             │
                             └──►  OpenAI Responses API (only with user consent)
```

## Repository layout

```
Doctor-AI/
├── setup.command  launch.command  stop.command   one-click macOS scripts
├── scripts/test_launch.sh                         automated launcher test
├── backend/
│   ├── app/
│   │   ├── main.py            app factory, middleware, routers, /api/health
│   │   ├── config.py          settings from backend/.env
│   │   ├── api/v1/            auth, profile, health (measurements/analytics/dashboard/reports),
│   │   │                      symptoms, medications, appointments, records, chat, settings
│   │   ├── services/          ai_service, chat_service, context_service, safety_service,
│   │   │                      health_service, report_service, summary_service
│   │   ├── repositories/      OwnedRepository + per-model instances
│   │   ├── models/            ORM models
│   │   ├── schemas/           Pydantic schemas
│   │   ├── security/          passwords, tokens, encryption, rate_limit
│   │   ├── core/              deps, errors, middleware, audit
│   │   ├── database/          engine/session, declarative base, UTC datetime type
│   │   └── prompts/system_prompt_v1.md   version-controlled AI instructions
│   ├── migrations/            Alembic (0001_initial_schema)
│   ├── tests/                 Pytest suite (mocked OpenAI)
│   ├── data/                  database, uploads, backups (git-ignored)
│   ├── requirements.txt       pinned versions
│   └── .env.example
└── frontend/
    └── src/
        ├── pages/             Dashboard, DoctorChat, HealthProfile, MedicalHistory, Symptoms, Measurements,
        │                      HealthRecords, Medications, Appointments, Analytics, Settings, Login, Register
        ├── components/ui/     button, card, form (Input/Select/Textarea/Field/Switch), dialog, misc
        ├── components/{dashboard,chat,records}/
        ├── layouts/           AppLayout (sidebar + top bar), AuthLayout
        ├── services/          api.ts (fetch client, CSRF, SSE), auth.ts, endpoints.ts
        ├── contexts/          Auth, Toast, Theme
        ├── hooks/ schemas/ types/ utils/
        └── test/              Vitest + React Testing Library
```

## Data model

All tables use UUID string primary keys, UTC timestamps (`created_at`/`updated_at`), and foreign keys with
`ON DELETE CASCADE` to `users` (SQLite foreign keys are enabled per connection).

| Table | Purpose / notable columns |
|---|---|
| users | email (unique), Argon2 `password_hash`, display name, unit system, country, emergency number |
| health_profiles | 1:1 with user — demographics, height_cm, weight_kg, blood type, family history, emergency contact |
| medical_conditions | name, diagnosed_on, status |
| allergies | allergen, reaction, severity |
| medications | name, dosage, frequency, instructions, dates, prescriber, reminder settings, last_taken_at |
| health_measurements | type, value, value2 (diastolic), unit (original), recorded_at, source — index (user, type, time) |
| symptoms | name, description, started_at, duration, severity (1–10, self-reported), associated (JSON), status |
| medical_documents | metadata only; file stored at `data/uploads/<user>/<uuid>.pdf`; sha256; category; report date |
| document_extractions | verbatim text, page count, detected result lines, status, AI explanation + model + time |
| conversations | title, summary, optional document_id, per-conversation context switch |
| messages | role, content, safety_flag, model, context_used (which categories were shared) |
| appointments | title, provider, specialty, location, scheduled_at, status, notes, questions (JSON) |
| ai_settings | provider, Fernet-encrypted key + last4, model, verified flag, consent switches |
| audit_logs | action, resource type/id, success, time — never content |

Migrations: `alembic upgrade head` / `alembic downgrade -1` (reversible; batch mode for SQLite).

## Key flows

### Chat turn (`POST /chat/conversations/{id}/messages[/stream]`)
1. Ownership check (`OwnedRepository.get_owned`).
2. **Safety service** (regex rules) — if an urgent pattern matches, save the user message and a fixed
   emergency-guidance reply; no AI call.
3. Rate limit, then readiness: key present, verified, consent given (descriptive errors otherwise).
4. **Context service** (only if global *and* per-conversation context is on): profile basics, allergies,
   active conditions, active medications, ongoing/recent/mentioned symptoms, latest value per measurement
   (5 for mentioned types), optional prior summaries. For document conversations, the extracted text.
5. **AI service**: Responses API with `instructions` = system prompt + context, `input` = last 20 messages,
   `store=False`. Streaming yields `response.output_text.delta` events, relayed to the browser as SSE.
6. Both messages are persisted only after a successful reply (so a failed turn can be retried cleanly).

### Document upload & explanation
Upload → validate (extension, MIME, `%PDF-` magic bytes, size) → store under a generated name →
PyMuPDF extraction → result-line detection → saved. Explain → requires Privacy switch + per-request
consent → creates a document conversation → AI explains using verbatim text → explanation saved and
shown separately from the extracted content.

### Authentication
Login sets `pdai_session` (HttpOnly, SameSite=Strict JWT) and `pdai_csrf` (readable). The SPA echoes
`pdai_csrf` in `X-CSRF-Token` on unsafe requests; `CSRFMiddleware` rejects mismatches.

## Extensibility
The service/repository split keeps a later move to PostgreSQL, background workers, OCR (e.g. Tesseract),
vector search or other AI providers localised: add an implementation behind `ai_service` / `report_service`
and a new Alembic migration.
