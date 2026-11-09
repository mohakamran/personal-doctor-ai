# API Documentation

Interactive OpenAPI docs are generated automatically while the backend runs:
**<http://127.0.0.1:8000/docs>** (Swagger UI) · <http://127.0.0.1:8000/redoc> · `/openapi.json`.

Base path: `/api/v1`. All endpoints except `/api/health`, `/auth/register` and `/auth/login` require the
session cookie. Unsafe methods (POST/PUT/PATCH/DELETE) with a session also require the `X-CSRF-Token` header
equal to the `pdai_csrf` cookie.

## Errors
```json
{ "error": { "code": "validation_error", "message": "Some fields are invalid.", "details": [{ "field": "value", "message": "..." }] } }
```
Common codes: `not_authenticated` (401), `invalid_credentials` (401), `csrf_failed` (403), `not_found` (404 —
also returned for other users' resources), `validation_error` (422), `rate_limited` (429), `email_taken` (409),
`file_too_large` (413), `unsupported_type` (415), `ai_not_configured`, `ai_not_verified`, `ai_invalid_key`,
`ai_model_not_found`, `consent_required`, `document_consent_required`, `ai_rate_limited` (429),
`ai_timeout` (504), `ai_connection_error` (502).

## Endpoints

### System
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness + database check |

### Auth (`/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/register` | `{email, password, display_name}` → user; sets session + CSRF cookies. Rate limited |
| POST | `/login` | `{email, password}` → user; sets cookies. Rate limited |
| POST | `/logout` | Clears cookies |
| GET / PATCH | `/me` | Current user / update `display_name, unit_system, country_code, emergency_number` |
| POST | `/change-password` | `{current_password, new_password}` |
| DELETE | `/account` | `{password, confirm: "DELETE"}` — deletes user, all data and files |

### Health profile (`/profile`)
| Method | Path | Description |
|---|---|---|
| GET / PUT | `` | Profile incl. computed `completion` % and `bmi` |
| GET / POST | `/conditions` | List / create `{name, diagnosed_on?, status, notes?}` |
| PUT / DELETE | `/conditions/{id}` | Update / delete |
| GET / POST | `/allergies` | List / create `{allergen, reaction?, severity?, notes?}` |
| PUT / DELETE | `/allergies/{id}` | Update / delete |

### Measurements, analytics, reports
| Method | Path | Description |
|---|---|---|
| GET | `/measurements?type=&start=&end=&limit=` | Newest first |
| POST | `/measurements` | `{type, value, value2?, unit, recorded_at, source?, notes?}`; unit + plausibility validated |
| PUT / DELETE | `/measurements/{id}` | Update / delete |
| GET | `/analytics?start=&end=` | Normalized series per type, calculated BMI series, stats |
| GET | `/dashboard` | Aggregated dashboard data |
| GET | `/reports/health-summary?days=90` | Markdown download (consultation preparation) |
| GET | `/reports/export` | Full JSON export (no secrets) |

Measurement types / units: `weight` (kg, lb) · `height` (cm, in) · `bmi` (kg/m2) · `blood_pressure` (mmHg,
`value`=systolic, `value2`=diastolic) · `heart_rate` (bpm) · `blood_glucose` (mg/dL, mmol/L) · `sleep` (hours) ·
`water` (ml, L, fl oz).

### Symptoms (`/symptoms`), Medications (`/medications`), Appointments (`/appointments`)
| Method | Path | Description |
|---|---|---|
| GET / POST | `/symptoms` | `{name, started_at, description?, duration?, severity 1–10?, associated_symptoms[], notes?, status}` |
| GET / PUT / DELETE | `/symptoms/{id}` | |
| GET / POST | `/medications` | `{name, dosage?, frequency?, instructions?, start_date?, end_date?, prescriber?, notes?, reminder_enabled, reminder_times[HH:MM]}` |
| PUT / DELETE | `/medications/{id}` | |
| POST | `/medications/{id}/taken` | Record a dose as taken (now) |
| GET / POST | `/appointments` | `{title, scheduled_at, provider?, specialty?, location?, status, reason?, consultation_notes?, questions[]}` |
| PUT / DELETE | `/appointments/{id}` | |
| POST | `/appointments/{id}/cancel` | Mark cancelled |

### Medical records (`/records`)
| Method | Path | Description |
|---|---|---|
| GET | `` | List documents (no file paths exposed) |
| POST | `` | multipart: `file` (PDF ≤ 15 MB), `title?`, `category`, `description?`, `report_date?` |
| GET / PATCH / DELETE | `/{id}` | Metadata / update / delete (file + extraction) |
| GET | `/{id}/file?download=false` | PDF stream (inline or attachment) |
| GET | `/{id}/extraction` | Verbatim text, detected result lines, AI explanation, linked conversation |
| POST | `/{id}/explain` | `{consent: true}` — requires Privacy "allow document analysis" |

Categories: `lab_report, imaging, prescription, discharge_summary, consultation, vaccination, insurance, other`.

### AI Doctor (`/chat`)
| Method | Path | Description |
|---|---|---|
| GET / POST | `/conversations` | List / create `{title?, use_health_context}` |
| GET / PATCH / DELETE | `/conversations/{id}` | Detail with messages / rename or toggle context / delete |
| POST | `/conversations/{id}/messages` | `{content}` → `{user_message, assistant_message, conversation}` |
| POST | `/conversations/{id}/messages/stream` | Same, as Server-Sent Events: `delta` `{text}` … `done` `{user_message, assistant_message}` or `error` `{code, message}` |
| POST | `/conversations/{id}/summarize` | Generates and stores an AI summary |

### Settings (`/settings`)
| Method | Path | Description |
|---|---|---|
| GET | `/ai` | Status: `has_api_key, masked_key, model, verified, consent flags` (never the key) |
| POST | `/ai/test` | `{api_key?, model}` → `{ok, message}`; minimal model-retrieve call; saves nothing |
| POST | `/ai/models` | `{api_key?, model}` → chat-capable model ids for the key |
| PUT | `/ai` | `{api_key?, model}` — re-verifies, then encrypts & saves |
| DELETE | `/ai/key` | Remove stored key |
| PUT | `/privacy` | `{ai_consent?, use_health_context?, include_conversation_summaries?, allow_document_ai?}` |

## Example (curl)
```bash
curl -c jar -b jar -H 'Content-Type: application/json' -d '{"email":"demo@example.com","password":"Demo-password-123","display_name":"Demo"}' http://127.0.0.1:8000/api/v1/auth/register
```
```bash
curl -b jar -c jar -H "X-CSRF-Token: $(awk '/pdai_csrf/{print $7}' jar)" -H 'Content-Type: application/json' -d '{"type":"heart_rate","value":64,"unit":"bpm","recorded_at":"2026-01-01T08:00:00Z"}' http://127.0.0.1:8000/api/v1/measurements
```
