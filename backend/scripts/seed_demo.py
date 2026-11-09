"""Create a demo account filled with SYNTHETIC health data (fictional person "Alex Morgan").

Usage (with the app running):
    cd backend && .venv/bin/python scripts/seed_demo.py            # create (or recreate) the demo account
    cd backend && .venv/bin/python scripts/seed_demo.py --delete   # remove the demo account and its data

It uses the public API, so all validation and ownership rules apply. The demo login is written to
backend/data/demo_account.txt (git-ignored). No AI features are configured — add your own key in Settings.
"""
from __future__ import annotations

import random
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pymupdf

API = "http://127.0.0.1:8000/api/v1"
EMAIL = "alex.demo@example.com"
CREDS = Path(__file__).resolve().parent.parent / "data" / "demo_account.txt"
NOTE = "demo data"


def read_creds() -> tuple[str, str] | None:
    if not CREDS.exists():
        return None
    kv = dict(line.split("=", 1) for line in CREDS.read_text().splitlines() if "=" in line)
    return kv.get("email"), kv.get("password")


def delete_existing() -> bool:
    creds = read_creds()
    if not creds:
        return False
    c = httpx.Client()
    if c.post(f"{API}/auth/login", json={"email": creds[0], "password": creds[1]}).status_code != 200:
        return False
    r = c.request("DELETE", f"{API}/auth/account", json={"password": creds[1], "confirm": "DELETE"},
                  headers={"X-CSRF-Token": c.cookies["pdai_csrf"]})
    return r.status_code == 200


def make_pdf(lines: list[str]) -> bytes:
    d = pymupdf.open()
    p = d.new_page()
    y = 72
    for line in lines:
        p.insert_text((60, y), line, fontname="cour", fontsize=10)
        y += 16
    return d.tobytes()


def main() -> None:
    try:
        httpx.get("http://127.0.0.1:8000/api/health", timeout=3).raise_for_status()
    except Exception:
        sys.exit("The backend is not running. Start the app with launch.command first.")

    if delete_existing():
        print("Removed previous demo account.")
    if "--delete" in sys.argv:
        CREDS.unlink(missing_ok=True)
        print("Demo account deleted.")
        return

    password = "Demo-" + secrets.token_hex(5) + "7"
    c = httpx.Client(timeout=30)
    r = c.post(f"{API}/auth/register", json={"email": EMAIL, "password": password, "display_name": "Alex Morgan"})
    if r.status_code == 409:
        sys.exit(f"{EMAIL} already exists but its password is unknown. Delete it in the app first.")
    r.raise_for_status()
    CREDS.parent.mkdir(parents=True, exist_ok=True)
    CREDS.write_text(f"# Demo account with SYNTHETIC data (fictional person)\nemail={EMAIL}\npassword={password}\n")
    CREDS.chmod(0o600)
    c.headers["X-CSRF-Token"] = c.cookies["pdai_csrf"]

    def post(path: str, body: dict | None = None, **kw) -> dict:
        resp = c.post(API + path, json=body, **kw) if body is not None else c.post(API + path, **kw)
        if resp.status_code >= 300:
            raise SystemExit(f"POST {path} failed: {resp.status_code} {resp.text}")
        return resp.json()

    rnd = random.Random(42)
    now = datetime.now(timezone.utc)

    def at(days_ago: float, hour: int) -> str:
        t = (now - timedelta(days=days_ago)).replace(hour=hour, minute=rnd.randint(0, 55), second=0, microsecond=0)
        return min(t, now - timedelta(minutes=rnd.randint(10, 120))).isoformat()

    # Account & profile
    c.patch(f"{API}/auth/me", json={"country_code": "US"}).raise_for_status()
    c.put(f"{API}/profile", json={
        "full_name": "Alex Morgan", "date_of_birth": "1988-04-12", "sex": "Male", "height_cm": 178,
        "weight_kg": 81.4, "blood_type": "O+",
        "family_history": "Father: type 2 diabetes (diagnosed at 55). Mother: high blood pressure.",
        "emergency_contact_name": "Jordan Morgan", "emergency_contact_relation": "Partner",
        "emergency_contact_phone": "+1 555 0100"}).raise_for_status()
    for cond in [{"name": "Seasonal allergic rhinitis", "status": "managed", "diagnosed_on": "2015-05-01"},
                 {"name": "Mild intermittent asthma", "status": "managed", "diagnosed_on": "2009-09-01"},
                 {"name": "Vitamin D deficiency", "status": "resolved", "diagnosed_on": "2024-02-10",
                  "notes": "Resolved after supplementation"}]:
        post("/profile/conditions", cond)
    for a in [{"allergen": "Penicillin", "reaction": "Hives", "severity": "moderate"},
              {"allergen": "Grass pollen", "reaction": "Sneezing, itchy eyes", "severity": "mild"},
              {"allergen": "Shellfish", "reaction": "Lip swelling", "severity": "severe"}]:
        post("/profile/allergies", a)

    # Measurements: ~13 months. Daily for the last 90 days, weekly before that.
    n = 0
    weight = 86.8
    for d in range(400, -1, -1):
        recent = d <= 90
        if not recent and d % 7:
            continue
        progress = (400 - d) / 400                      # gentle downward weight trend
        weight = 86.8 - 5.2 * progress + rnd.uniform(-0.4, 0.4)
        if recent and d % 2 == 0 or not recent:
            sys_ = round(132 - 8 * progress + rnd.uniform(-6, 6))
            dia = round(85 - 4 * progress + rnd.uniform(-4, 4))
            post("/measurements", {"type": "blood_pressure", "value": sys_, "value2": dia, "unit": "mmHg",
                                   "recorded_at": at(d, 8), "notes": NOTE}); n += 1
            post("/measurements", {"type": "heart_rate", "value": round(72 - 6 * progress + rnd.uniform(-5, 5)),
                                   "unit": "bpm", "recorded_at": at(d, 8)}); n += 1
        if d % 3 == 0 or not recent:
            # Some older entries in pounds to show unit conversion (originals preserved).
            if d > 200:
                post("/measurements", {"type": "weight", "value": round(weight / 0.45359237, 1), "unit": "lb",
                                       "recorded_at": at(d, 7), "source": "imported"}); n += 1
            else:
                post("/measurements", {"type": "weight", "value": round(weight, 1), "unit": "kg",
                                       "recorded_at": at(d, 7)}); n += 1
        sleep_h = round(min(9.5, max(4.8, rnd.gauss(7.0 + (0.6 if d % 7 in (0, 6) else 0), 0.7))), 1)
        post("/measurements", {"type": "sleep", "value": sleep_h, "unit": "hours", "recorded_at": at(d, 7)}); n += 1
        if d % 6 == 0:
            if d > 150:
                post("/measurements", {"type": "blood_glucose", "value": round(rnd.uniform(5.2, 5.9), 1),
                                       "unit": "mmol/L", "recorded_at": at(d, 7), "notes": "fasting"}); n += 1
            else:
                post("/measurements", {"type": "blood_glucose", "value": rnd.randint(88, 106), "unit": "mg/dL",
                                       "recorded_at": at(d, 7), "notes": "fasting"}); n += 1
        if recent:
            post("/measurements", {"type": "water", "value": rnd.choice([1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6]),
                                   "unit": "L", "recorded_at": at(d, 21)}); n += 1
    post("/measurements", {"type": "height", "value": 178, "unit": "cm", "recorded_at": at(380, 9)}); n += 1

    # Symptoms
    symptoms = [
        {"name": "Tension-type headache", "description": "Dull pressure across the forehead, worse late afternoon after screen work.",
         "started_at": at(3, 15), "duration": "3 days, intermittent", "severity": 4,
         "associated_symptoms": ["neck stiffness", "eye strain"], "status": "ongoing"},
        {"name": "Lower back pain", "description": "After moving furniture. Better with stretching.", "started_at": at(9, 18),
         "duration": "1 week", "severity": 5, "associated_symptoms": [], "status": "improving"},
        {"name": "Dry cough", "description": "Mostly at night.", "started_at": at(24, 22), "duration": "6 days",
         "severity": 3, "associated_symptoms": ["sore throat"], "status": "resolved", "resolved_at": at(18, 10)},
        {"name": "Sneezing and itchy eyes", "started_at": at(60, 9), "duration": "2 weeks", "severity": 2,
         "associated_symptoms": ["runny nose"], "status": "resolved", "resolved_at": at(45, 9)},
        {"name": "Heartburn", "description": "After late, heavy meals.", "started_at": at(130, 23), "duration": "A few evenings",
         "severity": 3, "status": "resolved", "resolved_at": at(120, 9)},
        {"name": "Ankle sprain (left)", "description": "Rolled ankle while running.", "started_at": at(210, 17),
         "duration": "2 weeks", "severity": 6, "associated_symptoms": ["swelling", "bruising"], "status": "resolved",
         "resolved_at": at(195, 9)},
    ]
    for s in symptoms:
        post("/symptoms", s)

    # Medications
    meds = [
        {"name": "Cetirizine", "dosage": "10 mg", "frequency": "Once daily", "instructions": "Take in the evening",
         "start_date": "2026-03-15", "prescriber": "Dr. Sofia Rivera", "reminder_enabled": True, "reminder_times": ["21:00"]},
        {"name": "Salbutamol inhaler", "dosage": "100 mcg per puff", "frequency": "As needed",
         "instructions": "1–2 puffs before exercise", "start_date": "2024-01-15", "prescriber": "Dr. Sofia Rivera"},
        {"name": "Vitamin D3", "dosage": "1000 IU", "frequency": "Once daily", "start_date": "2024-02-15",
         "reminder_enabled": True, "reminder_times": ["08:00"]},
        {"name": "Ibuprofen", "dosage": "200 mg", "frequency": "Up to 3 times daily with food", "start_date": "2026-05-20",
         "end_date": "2026-06-02", "notes": "Short course for ankle sprain"},
    ]
    for m in meds:
        post("/medications", m)

    # Appointments
    appts = [
        {"title": "Annual check-up", "provider": "Dr. Sofia Rivera", "specialty": "General practice",
         "location": "Riverside Family Clinic", "scheduled_at": (now + timedelta(days=4)).replace(hour=15, minute=30).isoformat(),
         "reason": "Routine review and lab results",
         "questions": ["Discuss fasting glucose and HbA1c from my lab report", "Recurring afternoon headaches — screen time?",
                       "Is my blood pressure trend okay?"]},
        {"title": "Allergy follow-up", "provider": "Dr. Wei Chen", "specialty": "Allergy & immunology",
         "location": "City Allergy Center", "scheduled_at": (now + timedelta(days=21)).replace(hour=10, minute=0).isoformat(),
         "questions": ["Should I carry an epinephrine auto-injector for shellfish?"]},
        {"title": "Physiotherapy session", "provider": "Move Well Physio", "specialty": "Physiotherapy",
         "scheduled_at": (now + timedelta(days=9)).replace(hour=17, minute=0).isoformat(), "reason": "Lower back pain"},
        {"title": "Dental cleaning", "provider": "Bright Smile Dental", "scheduled_at": (now - timedelta(days=40)).isoformat(),
         "status": "completed", "consultation_notes": "No issues found. Next cleaning in 6 months."},
        {"title": "Sports medicine review", "provider": "Dr. Patel", "specialty": "Sports medicine",
         "scheduled_at": (now - timedelta(days=200)).isoformat(), "status": "completed",
         "consultation_notes": "Grade 1 ankle sprain. Rest, ice, gradual return to running."},
        {"title": "Eye exam", "provider": "Clear Vision Optometry", "scheduled_at": (now - timedelta(days=15)).isoformat(),
         "status": "cancelled"},
    ]
    for a in appts:
        post("/appointments", a)

    # Medical records (synthetic PDFs)
    lab = make_pdf(["RIVERSIDE LABORATORY SERVICES", "SYNTHETIC SAMPLE REPORT - NOT REAL PATIENT DATA",
                    "Patient: Alex Morgan     Collected: 2026-10-30", "", "COMPLETE BLOOD COUNT",
                    "Hemoglobin            13.9 g/dL      (13.0 - 17.0)", "WBC                   6.2 x10^9/L    (4.0 - 11.0)",
                    "Platelets             245 x10^9/L    (150 - 400)", "", "METABOLIC PANEL",
                    "Glucose (fasting)     104 mg/dL      (70 - 99)   H", "Creatinine            0.9 mg/dL      (0.7 - 1.3)",
                    "LDL Cholesterol       142 mg/dL      (< 130)     H", "HDL Cholesterol       48 mg/dL       (> 40)",
                    "HbA1c                 5.8 %          (4.0 - 5.6) H", "Vitamin D (25-OH)     34 ng/mL       (30 - 100)"])
    vit = make_pdf(["RIVERSIDE LABORATORY SERVICES", "SYNTHETIC SAMPLE REPORT - NOT REAL PATIENT DATA",
                    "Patient: Alex Morgan     Collected: 2024-02-05", "", "Vitamin D (25-OH)     14 ng/mL       (30 - 100)  L"])
    xray = make_pdf(["CITY IMAGING CENTER - SYNTHETIC DEMO REPORT", "Exam: X-ray left ankle, 2 views   Date: 2026-04-22",
                     "Findings: No fracture or dislocation. Mild soft tissue swelling laterally.",
                     "Impression: No acute osseous abnormality."])
    docs = [(lab, "riverside-blood-panel-2026.pdf", "Blood panel — Riverside Lab", "lab_report", "2026-10-30", "Annual blood panel"),
            (vit, "vitamin-d-2024.pdf", "Vitamin D test", "lab_report", "2024-02-05", None),
            (xray, "ankle-xray.pdf", "Left ankle X-ray", "imaging", "2026-04-22", "After running injury")]
    for data, fname, title, cat, date, desc in docs:
        form = {"category": cat, "title": title, "report_date": date}
        if desc:
            form["description"] = desc
        post("/records", files={"file": (fname, data, "application/pdf")}, data=form)

    print(f"Demo account ready: {EMAIL}")
    print(f"  {n} measurements, {len(symptoms)} symptoms, {len(meds)} medications, {len(appts)} appointments, {len(docs)} documents")
    print(f"  Login details saved to {CREDS}")


if __name__ == "__main__":
    main()
