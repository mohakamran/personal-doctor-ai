# User Guide

Personal Doctor AI helps you understand and organise your health information. It is an AI assistant — not a
doctor. It won't diagnose you, prescribe, or change medication, and it doesn't replace your clinician.

## Getting started

1. **Create an account** (email + password of at least 10 characters with letters and numbers). Your account
   exists only on this computer.
2. **Fill in your Health Profile** (My Health → Health Profile). Everything is optional; the completion bar
   on the dashboard shows progress.
3. **Turn on the AI Doctor** (optional):
   1. Settings → **AI configuration**.
   2. Paste your OpenAI API key (from <https://platform.openai.com/api-keys>).
   3. Enter or pick a model (the field suggests models available to your key after a successful test).
   4. Click **Test connection** — you'll see success or the exact reason it failed.
   5. Click **Save configuration**. The key is encrypted and only its last 4 characters are ever shown.
   6. Settings → **Privacy** → turn on **Allow sending my chat messages to OpenAI**.

   OpenAI charges your account for API usage. Use **Remove API key** at any time.

## Dashboard
A summary of what *you* have recorded: profile completion, weight and BMI, latest blood pressure, heart rate
and sleep, charts, recent symptoms, active medications, recent conversations and upcoming appointments.
Empty sections tell you how to add data — the app never invents values. **Talk to AI Doctor** starts a chat.

## AI Doctor
- Type a question and press **Enter** (Shift+Enter for a new line). Replies stream in as they're written.
- Conversations are saved automatically; pick one from the list to continue, or delete it.
- **Use my health info** (per conversation) shares only relevant saved details — e.g. age, allergies, active
  conditions and medications, ongoing symptoms, the latest measurements. Under each reply you can see which
  kinds of information were used. The global switch is in Settings → Privacy.
- **Summarize** creates a short AI summary of the conversation for your records or a consultation. If you
  enable "Include summaries of previous conversations", up to three summaries can provide continuity.
- **Urgent symptoms:** if a message describes possible emergency signs (e.g. crushing chest pain with arm
  pain, stroke signs, severe breathing difficulty, thoughts of self-harm), the app immediately shows emergency
  guidance instead of an ordinary answer — even without an API key. Set your country (or a custom number) in
  Settings → Account so the right emergency number is shown. This is a simple safety net, not a triage tool.

## My Health
- **Health Profile** — name, date of birth, sex, height, weight, blood type, family history, emergency contact.
  Units follow Settings → Account → Measurement units (stored internally in metric). BMI appears only when
  both height and weight are present and is a screening figure, not a diagnosis.
- **Medical History** — conditions (active / managed / resolved) and allergies with reaction and severity.
- **Symptoms** — a timeline of symptoms with start time, duration, your 1–10 severity rating, associated
  symptoms and status. **Ask AI** opens a chat pre-filled with that symptom.
- **Measurements** — weight, height, BMI, blood pressure (systolic/diastolic), heart rate, blood glucose,
  sleep and water. Values and units are stored exactly as entered. Filter by type to see a trend chart.

## Medical Records
1. **Upload PDF** (up to 15 MB) with a title, category, report date and description.
2. Text is extracted **on your computer**. Open a document to see:
   - **Extracted text** — verbatim content plus lines that look like results (values, units, ranges).
   - **Original PDF** — preview; **Download** saves a copy.
   - **AI explanation** — requires "Allow document analysis" in Privacy *and* ticking the consent box for that
     document. Only the extracted text is sent, never the file. The explanation is clearly labelled as
     AI-generated. **Ask follow-up questions** continues in a chat that has the document as context.
3. Scanned (image-only) PDFs have no extractable text; OCR is planned.

## Medications
Record medications exactly as prescribed: dosage, frequency, instructions, dates, prescriber, notes. Turn on
reminders and enter times (HH:MM) to see a daily schedule while the app is open and in the notifications
bell; **Taken** records when you marked a dose. Set an end date to move a medication to "Past".
The app never recommends medications or dose changes.

## Appointments
Add appointments with provider, specialty, location, date/time and reason. Write **questions to ask**
(one per line) and afterwards record **consultation notes**. **Cancel** marks an appointment cancelled.
**Consultation summary** downloads a Markdown summary of your profile, conditions, allergies, medications,
recent symptoms, measurements and upcoming questions to bring along.

## Health Analytics
Pick 30 days, 90 days, 1 year, all time or a custom range. Charts show blood pressure, weight, calculated BMI,
heart rate, sleep, glucose and water, with min/max/average. Mixed units are converted for charts only (e.g.
lb → kg); your originals are kept. **Export CSV** downloads raw measurements; **Health summary** downloads a
Markdown report. Charts show your data only — no conclusions are drawn.

## Settings
- **Account** — name, units, country/emergency number, password.
- **AI configuration** — provider, API key, model, connection status, test/save/remove.
- **Privacy** — consent switches (see above). Turning off the main consent disables all AI sharing.
- **Data management** — download everything as JSON, download a health summary, delete your account
  (permanently removes all data and files; requires your password and typing DELETE).
- **Appearance** — light (default), dark or system theme.
- **About** — version, limitations, API docs link.

## Privacy at a glance
- Data is stored locally in SQLite and a private uploads folder.
- Nothing is sent to OpenAI unless you enable it; requests are sent with OpenAI response storage disabled.
- Your API key is encrypted at rest and never shown or logged.
- Use synthetic data if you're just trying the app.
