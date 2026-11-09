from datetime import datetime, timedelta, timezone

from tests.conftest import new_client, register


def iso(days_ago: float = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def test_profile_create_update_and_bmi(client):
    r = client.get("/api/v1/profile")
    assert r.status_code == 200 and r.json()["completion"] == 0 and r.json()["bmi"] is None
    r = client.put("/api/v1/profile", json={"full_name": "Sam Synthetic", "date_of_birth": "1990-05-01",
                                            "height_cm": 180, "weight_kg": 81, "blood_type": "O+"})
    assert r.status_code == 200
    body = r.json()
    assert body["bmi"] == 25.0 and body["completion"] > 0
    r = client.put("/api/v1/profile", json={"full_name": "Sam", "height_cm": 180})
    assert r.json()["bmi"] is None  # no weight -> no BMI


def test_profile_validation(client):
    assert client.put("/api/v1/profile", json={"date_of_birth": "2999-01-01"}).status_code == 422
    assert client.put("/api/v1/profile", json={"blood_type": "Z+"}).status_code == 422
    assert client.put("/api/v1/profile", json={"height_cm": 5}).status_code == 422


def test_conditions_and_allergies_crud(client):
    c = client.post("/api/v1/profile/conditions", json={"name": "Asthma", "status": "managed"}).json()
    a = client.post("/api/v1/profile/allergies", json={"allergen": "Penicillin", "severity": "severe"}).json()
    assert len(client.get("/api/v1/profile/conditions").json()) == 1
    r = client.put(f"/api/v1/profile/conditions/{c['id']}", json={"name": "Asthma", "status": "resolved"})
    assert r.json()["status"] == "resolved"
    assert client.delete(f"/api/v1/profile/allergies/{a['id']}").status_code == 200
    assert client.get("/api/v1/profile/allergies").json() == []


def test_measurements_record_validate_and_preserve_units(client):
    r = client.post("/api/v1/measurements", json={"type": "weight", "value": 176.4, "unit": "lb", "recorded_at": iso(1)})
    assert r.status_code == 201 and r.json()["unit"] == "lb" and r.json()["value"] == 176.4
    r = client.post("/api/v1/measurements", json={"type": "blood_pressure", "value": 120, "value2": 80,
                                                 "unit": "mmHg", "recorded_at": iso(0)})
    assert r.status_code == 201
    bad = [
        {"type": "weight", "value": 80, "unit": "mmHg", "recorded_at": iso()},
        {"type": "heart_rate", "value": 900, "unit": "bpm", "recorded_at": iso()},
        {"type": "blood_pressure", "value": 120, "unit": "mmHg", "recorded_at": iso()},
        {"type": "blood_pressure", "value": 80, "value2": 120, "unit": "mmHg", "recorded_at": iso()},
        {"type": "sleep", "value": 7, "unit": "hours", "recorded_at": iso(-2)},
    ]
    for b in bad:
        assert client.post("/api/v1/measurements", json=b).status_code == 422, b
    assert len(client.get("/api/v1/measurements").json()) == 2
    assert len(client.get("/api/v1/measurements?type=weight").json()) == 1


def test_analytics_bmi_only_with_height(client):
    client.post("/api/v1/measurements", json={"type": "weight", "value": 80, "unit": "kg", "recorded_at": iso(2)})
    a = client.get("/api/v1/analytics").json()
    assert a["series"]["bmi_calculated"] == []
    client.put("/api/v1/profile", json={"height_cm": 200})
    a = client.get("/api/v1/analytics").json()
    assert a["series"]["bmi_calculated"][0]["value"] == 20.0
    # lb normalized to kg for charts, original preserved
    client.post("/api/v1/measurements", json={"type": "weight", "value": 220.462, "unit": "lb", "recorded_at": iso(1)})
    pts = client.get("/api/v1/analytics").json()["series"]["weight"]
    assert pts[-1]["original_unit"] == "lb" and abs(pts[-1]["value"] - 100) < 0.1
    start = (datetime.now(timezone.utc) - timedelta(days=1, hours=12)).isoformat()
    a = client.get("/api/v1/analytics", params={"start": start}).json()
    assert len(a["series"]["weight"]) == 1


def test_symptoms_crud_chronological(client):
    client.post("/api/v1/symptoms", json={"name": "Headache", "started_at": iso(3), "severity": 4})
    s = client.post("/api/v1/symptoms", json={"name": "Cough", "started_at": iso(1), "severity": 2,
                                              "associated_symptoms": ["sore throat", " "]}).json()
    assert s["associated_symptoms"] == ["sore throat"]
    names = [x["name"] for x in client.get("/api/v1/symptoms").json()]
    assert names == ["Cough", "Headache"]
    r = client.put(f"/api/v1/symptoms/{s['id']}", json={"name": "Cough", "started_at": iso(1), "status": "resolved",
                                                        "resolved_at": iso(0)})
    assert r.json()["status"] == "resolved"
    assert client.post("/api/v1/symptoms", json={"name": "X", "started_at": iso(), "severity": 11}).status_code == 422
    assert client.delete(f"/api/v1/symptoms/{s['id']}").status_code == 200


def test_medications_crud_and_reminders(client):
    r = client.post("/api/v1/medications", json={"name": "Synthetic-ol", "dosage": "10 mg", "frequency": "daily",
                                                "reminder_enabled": True, "reminder_times": ["08:00", "20:00"]})
    assert r.status_code == 201 and r.json()["is_active"] is True
    mid = r.json()["id"]
    assert client.post(f"/api/v1/medications/{mid}/taken").json()["last_taken_at"] is not None
    assert client.post("/api/v1/medications", json={"name": "X", "reminder_times": ["25:00"]}).status_code == 422
    assert client.post("/api/v1/medications", json={"name": "X", "start_date": "2026-02-01",
                                                   "end_date": "2026-01-01"}).status_code == 422
    r = client.put(f"/api/v1/medications/{mid}", json={"name": "Synthetic-ol", "end_date": "2020-01-01"})
    assert r.json()["is_active"] is False
    assert client.delete(f"/api/v1/medications/{mid}").status_code == 200


def test_appointments_crud_cancel(client):
    when = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    a = client.post("/api/v1/appointments", json={"title": "GP check-up", "provider": "Dr. Example",
                                                  "scheduled_at": when, "questions": ["Ask about sleep"]}).json()
    assert a["status"] == "scheduled" and a["questions"] == ["Ask about sleep"]
    r = client.put(f"/api/v1/appointments/{a['id']}", json={"title": "GP check-up", "scheduled_at": when,
                                                           "consultation_notes": "Notes"})
    assert r.json()["consultation_notes"] == "Notes"
    assert client.post(f"/api/v1/appointments/{a['id']}/cancel").json()["status"] == "cancelled"
    assert client.delete(f"/api/v1/appointments/{a['id']}").status_code == 200


def test_dashboard_uses_real_data_and_empty_state(client):
    d = client.get("/api/v1/dashboard").json()
    assert d["bmi"] is None and d["recent_symptoms"] == [] and d["latest"]["weight"] == []
    client.put("/api/v1/profile", json={"height_cm": 170, "weight_kg": 70})
    client.post("/api/v1/measurements", json={"type": "heart_rate", "value": 64, "unit": "bpm", "recorded_at": iso()})
    d = client.get("/api/v1/dashboard").json()
    assert d["bmi"] == 24.2 and d["latest"]["heart_rate"][0]["value"] == 64


def test_summary_and_export(client):
    client.put("/api/v1/profile", json={"full_name": "Sam Synthetic"})
    client.post("/api/v1/symptoms", json={"name": "Fatigue", "started_at": iso(2)})
    r = client.get("/api/v1/reports/health-summary")
    assert r.status_code == 200 and "Fatigue" in r.text and "not been clinically verified" in r.text
    data = client.get("/api/v1/reports/export").json()
    assert data["symptoms"][0]["name"] == "Fatigue"
    assert "password_hash" not in data["account"]


def test_user_isolation_across_all_resources():
    a, b = new_client(), new_client()
    register(a)
    register(b)
    when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    ids = {
        "symptoms": a.post("/api/v1/symptoms", json={"name": "Private", "started_at": iso()}).json()["id"],
        "medications": a.post("/api/v1/medications", json={"name": "Private"}).json()["id"],
        "appointments": a.post("/api/v1/appointments", json={"title": "Private", "scheduled_at": when}).json()["id"],
        "measurements": a.post("/api/v1/measurements", json={"type": "heart_rate", "value": 70, "unit": "bpm",
                                                             "recorded_at": iso()}).json()["id"],
        "profile/conditions": a.post("/api/v1/profile/conditions", json={"name": "Private"}).json()["id"],
        "profile/allergies": a.post("/api/v1/profile/allergies", json={"allergen": "Private"}).json()["id"],
        "chat/conversations": a.post("/api/v1/chat/conversations", json={}).json()["id"],
    }
    for res, rid in ids.items():
        assert b.get(f"/api/v1/{res}").json() == [] if res != "chat/conversations" else True
        assert b.delete(f"/api/v1/{res}/{rid}").status_code == 404, res
    assert b.get(f"/api/v1/chat/conversations/{ids['chat/conversations']}").status_code == 404
    assert b.get(f"/api/v1/symptoms/{ids['symptoms']}").status_code == 404
    assert b.put(f"/api/v1/medications/{ids['medications']}", json={"name": "hijack"}).status_code == 404
    assert b.get("/api/v1/chat/conversations").json() == []
    # A still has everything
    assert len(a.get("/api/v1/symptoms").json()) == 1
