# Changelog

## [1.0.0] — 2026-11-09

Initial release of Personal Doctor AI (local macOS MVP).

### Added
- FastAPI backend with SQLite (SQLAlchemy 2, Alembic migration `0001_initial_schema`, 14 tables).
- Authentication: registration, login, logout, current user, password change, account deletion; Argon2id,
  HttpOnly JWT cookie, CSRF double-submit protection, rate limiting.
- Health profile, medical conditions, allergies, symptom journal, measurements (8 types, original units
  preserved, plausibility validation), medications with local reminders, appointments with questions/notes.
- AI Doctor: OpenAI Responses API, SSE streaming, persistent conversations, Markdown, configurable model,
  relevant-context retrieval with global + per-conversation consent, conversation summaries,
  version-controlled system prompt, rule-based urgent-symptom safety service with country emergency numbers.
- Per-user encrypted (Fernet) OpenAI key storage, connection test, model discovery, key removal.
- Medical records: PDF upload validation, PyMuPDF extraction, result-line detection, PDF preview/download,
  consent-gated AI explanation and follow-up chat.
- Dashboard, health analytics (date filters, normalized charts, stats, CSV export), Markdown health summary,
  JSON data export.
- React 19 + Vite + TypeScript + Tailwind frontend with responsive layout, light/dark themes, accessible
  dialogs and forms, loading/empty/error states.
- `setup.command`, `launch.command`, `stop.command`; automated launcher test.
- Test suites: 44 backend (Pytest), 11 frontend (Vitest), 14 launcher checks.
- Documentation: README, INSTALLATION, USER_GUIDE, ARCHITECTURE, API_DOCUMENTATION, SECURITY, TESTING.
