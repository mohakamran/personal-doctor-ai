<div align="center">

<img src="frontend/public/favicon.svg" width="84" alt="Personal Doctor AI logo" />

# Personal Doctor AI

### Your Personal AI Health Companion

A private, local-first health management platform with an AI health assistant — built with
**React**, **FastAPI**, **SQLite** and the **OpenAI Responses API**. Runs entirely on your Mac with one click.

<p>
<img alt="Python" src="https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white">
<img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.162-009688?logo=fastapi&logoColor=white">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white">
<img alt="SQLite" src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white">
<img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-Responses_API-412991?logo=openai&logoColor=white">
<img alt="macOS" src="https://img.shields.io/badge/macOS-one--click_launch-000000?logo=apple&logoColor=white">
<img alt="Tests" src="https://img.shields.io/badge/tests-69_passing-2ea44f">
</p>

[Features](#-features) ·
[Screenshots](#-screenshots) ·
[Quick start](#-quick-start) ·
[How to use](#-how-to-use) ·
[Architecture](#-architecture) ·
[Security](#-security--privacy) ·
[Docs](#-documentation)

<img src="docs/screenshots/02-dashboard.png" alt="Personal Doctor AI dashboard" width="100%" />

</div>

> [!IMPORTANT]
> **Personal Doctor AI is an AI health assistant, not a licensed physician.** It does not diagnose disease,
> prescribe or change medication, or replace professional medical care. It is not clinically validated and
> makes no regulatory-compliance claims. In an emergency, call your local emergency number.

---

## 📌 Overview

Personal Doctor AI brings everything about your personal health into one calm, professional workspace:
a conversational **AI Doctor** that explains things in plain language, a **health dashboard** built from
your own records, a **symptom journal**, **measurements & analytics**, **medication** and **appointment**
tracking, and **medical report understanding** for uploaded PDFs.

It is designed **privacy-first**: data lives in a local SQLite database on your Mac, your OpenAI API key is
encrypted at rest, and nothing is sent to an AI service unless you explicitly allow it.

### Highlights

- 💬 **AI Doctor chat** with real-time streaming, saved conversations and Markdown answers
- 🧠 **Context-aware** — optionally uses only the *relevant* parts of your health record
- 🚨 **Safety layer** that detects urgent warning signs *before* any AI call and shows emergency guidance
- 📄 **Lab-report understanding** — local PDF text extraction plus consent-gated AI explanations
- 📈 **Analytics** — blood pressure, weight, BMI, heart rate, sleep, glucose and water trends
- 🔐 **Secure by design** — Argon2 passwords, HttpOnly sessions, CSRF protection, encrypted API keys, per-user isolation
- 🍎 **One-click macOS experience** — `setup.command`, `launch.command`, `stop.command`

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🩺 AI Doctor
- Start, continue, rename and delete conversations
- **Streaming responses** (Server-Sent Events) with Markdown & timestamps
- Per-conversation **"Use my health info"** switch
- Shows which data categories were used for each answer
- One-click **conversation summaries** for consultations
- Version-controlled system instructions: no diagnosis, no prescribing, no invented values, honest uncertainty
- Configurable model, validated on connect

</td>
<td width="50%" valign="top">

### 🚨 Safety Service
- Rule-based detection of urgent symptoms (cardiac, stroke, breathing, anaphylaxis, severe bleeding, self-harm, poisoning…)
- Runs **before** the AI and **without** an API key
- Country-specific emergency numbers (or a custom number)
- Crisis-line guidance for self-harm
- Never produces risk scores

</td>
</tr>
<tr>
<td valign="top">

### 📊 Dashboard & Analytics
- Profile completion, weight & BMI, latest vitals
- Blood pressure, heart rate & sleep charts
- Recent symptoms, active medications, recent chats, upcoming appointments
- Analytics with **30d / 90d / 1y / all / custom** date filters
- Min / max / average stats, **CSV export**, downloadable **health summary**
- Empty states instead of fake data

</td>
<td valign="top">

### ❤️ My Health
- **Health profile** — demographics, height/weight (metric or imperial), blood type, family history, emergency contact
- **Medical history** — conditions & allergies
- **Symptom journal** — timeline with severity, duration, associated symptoms, status, "Ask AI"
- **Measurements** — weight, height, BMI, BP, heart rate, glucose, sleep, water; original values & units preserved

</td>
</tr>
<tr>
<td valign="top">

### 📄 Medical Records
- Upload PDFs (validated type, signature and size)
- Local text extraction with **PyMuPDF**
- Automatic detection of result lines (values, units, ranges)
- In-app PDF preview & download
- **AI explanation** with explicit per-document consent
- Follow-up chat grounded in the document text

</td>
<td valign="top">

### 💊 Medications & 📅 Appointments
- Medications as prescribed — dosage, frequency, instructions, dates, prescriber
- Optional local **reminders** + "mark as taken"
- Appointments with provider, specialty, location
- **Questions to ask** & consultation notes
- Cancel / complete; downloadable **consultation summary**

</td>
</tr>
<tr>
<td colspan="2" valign="top">

### ⚙️ Settings
**Account** (name, units, country, emergency number, password) · **AI configuration** (API key, model, test connection, save, remove) ·
**Privacy & consent** (granular switches) · **Data management** (full JSON export, account deletion) · **Appearance** (light / dark / system) · **About**

</td>
</tr>
</table>

---

## 📸 Screenshots

> All screenshots use **synthetic demo data** ("Alex Morgan" is a fictional person). AI replies shown were
> produced by a local test model.

<table>
<tr>
<td width="50%"><b>AI Doctor — streaming, context-aware chat</b><br/><img src="docs/screenshots/03-ai-doctor-chat.png" alt="AI Doctor chat"/></td>
<td width="50%"><b>Urgent-symptom safety escalation</b><br/><img src="docs/screenshots/04-safety-escalation.png" alt="Safety escalation"/></td>
</tr>
<tr>
<td><b>Health profile</b><br/><img src="docs/screenshots/05-health-profile.png" alt="Health profile"/></td>
<td><b>Medical history — conditions & allergies</b><br/><img src="docs/screenshots/06-medical-history.png" alt="Medical history"/></td>
</tr>
<tr>
<td><b>Symptom journal</b><br/><img src="docs/screenshots/07-symptom-journal.png" alt="Symptom journal"/></td>
<td><b>Measurements with trend chart</b><br/><img src="docs/screenshots/08-measurements.png" alt="Measurements"/></td>
</tr>
<tr>
<td><b>Medical records</b><br/><img src="docs/screenshots/09-medical-records.png" alt="Medical records"/></td>
<td><b>Verbatim text extraction from a lab report</b><br/><img src="docs/screenshots/10-document-extraction.png" alt="Document extraction"/></td>
</tr>
<tr>
<td><b>AI explanation of a lab report</b><br/><img src="docs/screenshots/11-document-ai-explanation.png" alt="AI document explanation"/></td>
<td><b>Medications & reminders</b><br/><img src="docs/screenshots/12-medications.png" alt="Medications"/></td>
</tr>
<tr>
<td><b>Appointments & consultation questions</b><br/><img src="docs/screenshots/13-appointments.png" alt="Appointments"/></td>
<td><b>Health analytics</b><br/><img src="docs/screenshots/14-health-analytics.png" alt="Health analytics"/></td>
</tr>
<tr>
<td><b>AI configuration</b><br/><img src="docs/screenshots/15-settings-ai.png" alt="AI settings"/></td>
<td><b>Privacy & consent controls</b><br/><img src="docs/screenshots/16-settings-privacy.png" alt="Privacy settings"/></td>
</tr>
<tr>
<td><b>Dark mode — dashboard</b><br/><img src="docs/screenshots/17-dashboard-dark.png" alt="Dark dashboard"/></td>
<td><b>Dark mode — AI Doctor</b><br/><img src="docs/screenshots/18-ai-doctor-dark.png" alt="Dark AI Doctor"/></td>
</tr>
<tr>
<td><b>Sign in</b><br/><img src="docs/screenshots/01-login.png" alt="Login"/></td>
<td align="center"><b>Responsive mobile layout</b><br/>
<img src="docs/screenshots/19-mobile-dashboard.png" alt="Mobile dashboard" width="45%"/>
<img src="docs/screenshots/20-mobile-chat.png" alt="Mobile chat" width="45%"/></td>
</tr>
</table>

---

## 🚀 Quick start

### Prerequisites

| Requirement | Version | Install |
|---|---|---|
| macOS | 13+ (Apple silicon or Intel) | — |
| Python | 3.12+ | `brew install python@3.12` or [python.org](https://www.python.org/downloads/macos/) |
| Node.js | 20+ (includes npm) | `brew install node` or [nodejs.org](https://nodejs.org/en/download) |
| OpenAI API key | optional — only for AI features | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

### Install & run

```bash
git clone https://github.com/mohakamran/personal-doctor-ai.git
```
```bash
cd personal-doctor-ai
```

Then, in Finder:

1. **Double-click `setup.command`** (first time only) — checks your tools, installs dependencies, generates
   secure local keys, creates the database and runs the test suites.
2. **Double-click `launch.command`** — starts the backend and frontend, waits until both are healthy and
   opens **http://localhost:5173** in your browser.
3. **Stop** with `Ctrl+C` in the launcher window, or double-click **`stop.command`**.

> 💡 If macOS says the file is from an unidentified developer, right-click it → **Open** → **Open**.
> From Terminal you can also run `./setup.command` and `./launch.command`.

| Service | URL |
|---|---|
| Application | http://localhost:5173 |
| Backend API | http://127.0.0.1:8000 |
| Interactive API docs | http://127.0.0.1:8000/docs |

Ports are configurable — see [INSTALLATION.md](INSTALLATION.md#changing-ports).

---

## 🧭 How to use

1. **Create an account** — it exists only on your computer.
2. **Complete your health profile** — *My Health → Health Profile*, then add conditions and allergies under
   *Medical History*.
3. **Connect the AI Doctor** *(optional)*
   1. *Settings → AI configuration* → paste your OpenAI API key and choose a model.
   2. Click **Test connection** → then **Save configuration** (the key is encrypted; only `sk-…1234` is shown).
   3. *Settings → Privacy* → enable **Allow sending my chat messages to OpenAI**, and optionally
      **Use my saved health information** and **Allow document analysis**.
4. **Talk to the AI Doctor** — ask a question; the answer streams in and the conversation is saved.
   Use **Summarize** to prepare for an appointment.
5. **Track your health** — log symptoms, measurements, medications and appointments; watch trends in
   **Health Analytics**.
6. **Understand a lab report** — *Medical Records → Upload PDF* → open it to see the verbatim extracted
   values → *AI explanation* (tick the consent box) → **Ask follow-up questions**.
7. **Before a visit** — add questions to the appointment and download the **Consultation summary**.
8. **Own your data** — *Settings → Data management* to export everything as JSON or delete your account.

A full walkthrough of every screen is in the **[User Guide](USER_GUIDE.md)**.

---

## 🏗 Architecture

```mermaid
flowchart LR
    U[Browser<br/>React SPA] -- "same-origin /api<br/>HttpOnly cookie + CSRF" --> V[Vite dev server<br/>localhost:5173]
    V -- proxy --> F[FastAPI<br/>127.0.0.1:8000]
    F --> R[Repositories<br/>per-user ownership]
    R --> DB[(SQLite)]
    F --> FS[[Local PDF storage]]
    F --> S{Safety service}
    S -- no urgent signs --> C[Context service<br/>relevant data only]
    C --> AI[OpenAI<br/>Responses API]
    S -- urgent signs --> E[Emergency guidance]
```

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query 5, React Hook Form + Zod, Recharts, Lucide icons |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2, Alembic |
| Data | SQLite (14 tables, UUID keys, UTC timestamps, cascading deletes, migrations) |
| AI | OpenAI Python SDK — Responses API with streaming, `store=False` |
| Documents | PyMuPDF text extraction |
| Security | Argon2id, PyJWT, Fernet (cryptography), CSRF double-submit, rate limiting |
| Testing | Pytest, Vitest, React Testing Library, launcher shell tests |

<details>
<summary><b>Project structure</b></summary>

```
personal-doctor-ai/
├── setup.command · launch.command · stop.command    # one-click macOS scripts
├── scripts/test_launch.sh                           # automated launcher test
├── backend/
│   ├── app/
│   │   ├── api/v1/          # auth, profile, health, symptoms, medications,
│   │   │                    # appointments, records, chat, settings
│   │   ├── services/        # ai, chat, context, safety, health, report, summary
│   │   ├── repositories/    # ownership-enforcing data access
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── security/        # passwords, tokens, encryption, rate limiting
│   │   ├── core/            # dependencies, errors, middleware, audit
│   │   └── prompts/         # version-controlled AI system instructions
│   ├── migrations/          # Alembic
│   └── tests/               # Pytest (mocked OpenAI)
├── frontend/src/
│   ├── pages/               # Dashboard, DoctorChat, HealthProfile, … Settings
│   ├── components/          # ui primitives, chat, dashboard, records
│   ├── layouts/ contexts/ services/ hooks/ schemas/ types/ utils/
│   └── test/                # Vitest + Testing Library
└── docs/screenshots/
```
</details>

Details: **[ARCHITECTURE.md](ARCHITECTURE.md)** · **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)**

---

## 🔐 Security & privacy

| Area | Protection |
|---|---|
| Passwords | Argon2id hashing, strength rules, timing-safe login |
| Sessions | JWT in **HttpOnly, SameSite=Strict** cookie — never in local/session storage |
| CSRF | Double-submit token enforced on every state-changing request |
| Isolation | Every query filtered by the signed-in user; other users' IDs return 404 |
| API keys | **Fernet-encrypted at rest**, master key kept outside the database, never returned or logged |
| Consent | Separate switches for chat, health context, conversation summaries and documents, plus per-document consent |
| Uploads | PDF signature + type + size checks, generated file names, path-traversal protection |
| Network | Backend bound to `127.0.0.1`, restricted CORS, security headers |
| Abuse | Rate limits on authentication and AI endpoints |
| Your rights | Full JSON export and permanent account deletion |

See **[SECURITY.md](SECURITY.md)** for the full design and its limitations.

---

## 🧪 Testing

| Suite | Command | Result |
|---|---|---|
| Backend (Pytest) | `cd backend && .venv/bin/python -m pytest -q` | **44 passed** |
| Frontend (Vitest) | `cd frontend && npx vitest run` | **11 passed** |
| Type check | `cd frontend && npx tsc -b` | clean |
| Launcher | `scripts/test_launch.sh` | **14 passed** |

Tests cover authentication, CSRF, rate limiting, user isolation, validation, migrations, AI connection
errors (invalid key, timeout, rate limit), consent enforcement, context retrieval, streaming, the safety
service, PDF upload/extraction/ownership, and one-click launch & shutdown. OpenAI is mocked — tests cost
nothing. A manual procedure for testing with a real key is in **[TESTING.md](TESTING.md)**.

---

## 🗂 Data & configuration

| What | Where |
|---|---|
| Database | `backend/data/personal_doctor_ai.db` |
| Uploaded documents | `backend/data/uploads/` |
| Automatic backups (before migrations) | `backend/data/backups/` |
| Secrets (generated by setup) | `backend/.env` — git-ignored |
| Logs | `logs/` |

Backup & restore instructions: [INSTALLATION.md](INSTALLATION.md#backup-and-restore).

---

## 🛣 Roadmap

- [ ] OCR for scanned (image-only) PDFs
- [ ] System notifications for medication reminders
- [ ] Production build served without the dev server
- [ ] Encryption of stored documents at rest
- [ ] Data import from wearables and health apps
- [ ] Additional AI providers

---

## 📚 Documentation

| Document | Contents |
|---|---|
| [INSTALLATION.md](INSTALLATION.md) | Prerequisites, setup, launch, ports, troubleshooting, backup & restore |
| [USER_GUIDE.md](USER_GUIDE.md) | Every module explained, API key setup, privacy controls |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Structure, data model, request flows |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | REST endpoints and error format |
| [SECURITY.md](SECURITY.md) | Security & privacy design, limitations |
| [TESTING.md](TESTING.md) | Automated suites and manual OpenAI test procedure |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

---

## ⚠️ Disclaimer

Personal Doctor AI provides general health information for educational purposes only. It is not a medical
device, has not been clinically validated, and does not claim HIPAA, GDPR or any other regulatory
compliance. Always consult a qualified healthcare professional about medical concerns. Use synthetic data
when evaluating the app.

## 📄 License

No open-source license has been chosen yet. All rights reserved by the author.

---

<div align="center">

**Built by [Kamran](https://github.com/mohakamran)**

If you find this project useful, consider giving it a ⭐

</div>
