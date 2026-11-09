import json
from datetime import datetime, timezone

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import AISettings
from app.services import safety_service
from tests.conftest import FAKE_KEY, configure_ai, new_client, register


def test_missing_api_key_blocks_chat(client, fake_ai):
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Hello"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ai_not_configured"
    assert fake_ai.calls == []


def test_invalid_api_key_reports_error_and_is_not_saved(client, fake_ai):
    fake_ai.error = "auth"
    r = client.post("/api/v1/settings/ai/test", json={"api_key": FAKE_KEY, "model": "gpt-test-mini"})
    assert r.status_code == 200 and r.json()["ok"] is False and "rejected" in r.json()["message"]
    r = client.put("/api/v1/settings/ai", json={"api_key": FAKE_KEY, "model": "gpt-test-mini"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ai_invalid_key"
    assert client.get("/api/v1/settings/ai").json()["has_api_key"] is False


def test_unknown_model(client, fake_ai):
    fake_ai.error = "notfound"
    r = client.post("/api/v1/settings/ai/test", json={"api_key": FAKE_KEY, "model": "gpt-nope"})
    assert r.json()["ok"] is False and "not available" in r.json()["message"]


def test_successful_connection_key_encrypted_and_masked(client, fake_ai):
    r = client.post("/api/v1/settings/ai/test", json={"api_key": FAKE_KEY, "model": "gpt-test-mini"})
    assert r.json()["ok"] is True
    r = client.put("/api/v1/settings/ai", json={"api_key": FAKE_KEY, "model": "gpt-test-mini"})
    body = r.json()
    assert body["verified"] is True and body["has_api_key"] is True
    assert FAKE_KEY not in json.dumps(body) and body["masked_key"].endswith(FAKE_KEY[-4:])
    with SessionLocal() as s:
        row = s.scalar(select(AISettings).where(AISettings.encrypted_api_key.is_not(None)))
        assert row is not None and FAKE_KEY not in row.encrypted_api_key
    # models list filters non-chat models
    assert client.post("/api/v1/settings/ai/models", json={"model": "gpt-test-mini"}).json() == ["gpt-test", "gpt-test-mini"]
    # remove key
    r = client.delete("/api/v1/settings/ai/key")
    assert r.json()["has_api_key"] is False and r.json()["verified"] is False


def test_consent_required_before_chat(client, fake_ai):
    configure_ai(client, consent=False)
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Hi"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "consent_required"
    assert fake_ai.calls == []


def test_withdrawing_consent_disables_dependents(client, fake_ai):
    configure_ai(client, consent=True, context=True, documents=True)
    r = client.put("/api/v1/settings/privacy", json={"ai_consent": False}).json()
    assert r["use_health_context"] is False and r["allow_document_ai"] is False


def test_conversation_persistence_and_title(client, fake_ai):
    configure_ai(client)
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Why do I feel tired after lunch?"})
    assert r.status_code == 200, r.text
    assert r.json()["assistant_message"]["content"] == fake_ai.reply
    detail = client.get(f"/api/v1/chat/conversations/{conv['id']}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["title"].startswith("Why do I feel tired")
    # Second turn includes history
    client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "And in the evening?"})
    assert len(fake_ai.calls[-1]["input"]) == 3 and fake_ai.calls[-1]["store"] is False
    listed = client.get("/api/v1/chat/conversations").json()
    assert listed[0]["message_count"] == 4
    assert client.delete(f"/api/v1/chat/conversations/{conv['id']}").status_code == 200
    assert client.get(f"/api/v1/chat/conversations/{conv['id']}").status_code == 404


def test_context_retrieval_relevant_and_opt_in(client, fake_ai):
    client.put("/api/v1/profile", json={"date_of_birth": "1985-01-01", "height_cm": 175, "weight_kg": 70})
    client.post("/api/v1/profile/allergies", json={"allergen": "Penicillin"})
    client.post("/api/v1/medications", json={"name": "Synthetic-ol", "dosage": "5 mg"})
    client.post("/api/v1/measurements", json={"type": "blood_pressure", "value": 135, "value2": 85, "unit": "mmHg",
                                             "recorded_at": datetime.now(timezone.utc).isoformat()})
    configure_ai(client, context=True)
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Is my blood pressure ok?"})
    instr = fake_ai.calls[-1]["instructions"]
    assert "Penicillin" in instr and "Synthetic-ol" in instr and "135/85 mmHg" in instr
    assert set(r.json()["assistant_message"]["context_used"]) >= {"profile", "allergies", "medications", "measurements"}
    # Per-conversation opt-out
    conv2 = client.post("/api/v1/chat/conversations", json={"use_health_context": False}).json()
    client.post(f"/api/v1/chat/conversations/{conv2['id']}/messages", json={"content": "Is my blood pressure ok?"})
    assert "Penicillin" not in fake_ai.calls[-1]["instructions"]
    # Global opt-out
    client.put("/api/v1/settings/privacy", json={"use_health_context": False})
    client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Again?"})
    assert "Penicillin" not in fake_ai.calls[-1]["instructions"]


def test_context_never_leaks_other_users_data(fake_ai):
    a, b = new_client(), new_client()
    register(a)
    register(b)
    a.post("/api/v1/profile/allergies", json={"allergen": "SecretAllergenA"})
    configure_ai(b)
    conv = b.post("/api/v1/chat/conversations", json={}).json()
    b.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Any allergies on file?"})
    assert "SecretAllergenA" not in fake_ai.calls[-1]["instructions"]


def test_api_timeout_and_rate_limit_errors(client, fake_ai):
    configure_ai(client)
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    fake_ai.error = "timeout"
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Hello"})
    assert r.status_code == 504 and r.json()["error"]["code"] == "ai_timeout"
    fake_ai.error = "rate"
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "Hello"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "ai_rate_limited"
    # Failed turns are not persisted (the user can retry cleanly)
    assert client.get(f"/api/v1/chat/conversations/{conv['id']}").json()["messages"] == []


def test_streaming_reply_persists(client, fake_ai):
    configure_ai(client)
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    with client.stream("POST", f"/api/v1/chat/conversations/{conv['id']}/messages/stream",
                       json={"content": "Tell me about sleep"}) as r:
        body = "".join(r.iter_text())
    assert "event: delta" in body and "event: done" in body
    msgs = client.get(f"/api/v1/chat/conversations/{conv['id']}").json()["messages"]
    assert msgs[-1]["content"] == fake_ai.reply


def test_streaming_error_event(client, fake_ai):
    configure_ai(client)
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    fake_ai.error = "rate"
    with client.stream("POST", f"/api/v1/chat/conversations/{conv['id']}/messages/stream",
                       json={"content": "Hi"}) as r:
        body = "".join(r.iter_text())
    assert "event: error" in body and "ai_rate_limited" in body


def test_safety_escalation_bypasses_ai_even_without_key(client, fake_ai):
    client.patch("/api/v1/auth/me", json={"country_code": "GB"})
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/messages",
                    json={"content": "I have crushing chest pain spreading to my left arm and I'm sweating"})
    assert r.status_code == 200
    am = r.json()["assistant_message"]
    assert am["safety_flag"] == "cardiac" and "999" in am["content"]
    assert fake_ai.calls == []


def test_safety_rules_unit():
    assert safety_service.assess("I want to kill myself").category == "self_harm"
    assert safety_service.assess("my face is drooping and I have slurred speech").category == "stroke"
    assert safety_service.assess("I can't breathe").category == "breathing"
    assert not safety_service.assess("What are the warning signs of a heart attack?").triggered
    assert not safety_service.assess("I have a mild headache since yesterday").triggered
    assert "your local emergency number" in safety_service.urgent_response(
        safety_service.assess("I can't breathe"), None, None)
    assert "1122" in safety_service.urgent_response(safety_service.assess("I can't breathe"), "PK", None)
    assert "555" in safety_service.urgent_response(safety_service.assess("I can't breathe"), "US", "555")


def test_summarize_conversation(client, fake_ai):
    configure_ai(client)
    conv = client.post("/api/v1/chat/conversations", json={}).json()
    client.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={"content": "I've had a cough"})
    fake_ai.reply = "- The user reported a cough."
    r = client.post(f"/api/v1/chat/conversations/{conv['id']}/summarize")
    assert r.json()["summary"] == "- The user reported a cough."


def test_ai_key_never_in_logs(client, fake_ai, caplog):
    caplog.set_level("DEBUG")
    configure_ai(client)
    assert FAKE_KEY not in caplog.text
