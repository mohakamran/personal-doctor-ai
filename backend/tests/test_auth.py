from dataclasses import replace

from tests.conftest import new_client, register


def test_health_endpoint():
    r = new_client().get("/api/health")
    assert r.status_code == 200 and r.json()["database"] == "ok"


def test_register_sets_httponly_session_and_returns_user():
    c = new_client()
    r = c.post("/api/v1/auth/register", json={"email": "New@Example.com", "password": "Abcdefgh12", "display_name": "Ann"})
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "new@example.com" and "password_hash" not in body
    set_cookie = ",".join(r.headers.get_list("set-cookie"))
    assert "pdai_session=" in set_cookie and "HttpOnly" in set_cookie and "SameSite=strict" in set_cookie


def test_register_rejects_weak_password_and_duplicate_email():
    c = new_client()
    r = c.post("/api/v1/auth/register", json={"email": "weak@example.com", "password": "short", "display_name": "x"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    u = register(c)
    r = new_client().post("/api/v1/auth/register", json={"email": u["email"], "password": "Abcdefgh12", "display_name": "x"})
    assert r.status_code == 409


def test_login_logout_flow():
    u = register(new_client())
    c = new_client()
    r = c.post("/api/v1/auth/login", json={"email": u["email"], "password": u["password"]})
    assert r.status_code == 200
    assert c.get("/api/v1/auth/me").json()["email"] == u["email"]
    c.headers["X-CSRF-Token"] = c.cookies.get("pdai_csrf")
    assert c.post("/api/v1/auth/logout").status_code == 200
    c.cookies.clear()
    assert c.get("/api/v1/auth/me").status_code == 401


def test_invalid_credentials():
    u = register(new_client())
    c = new_client()
    r = c.post("/api/v1/auth/login", json={"email": u["email"], "password": "wrong-password1"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    r = c.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})
    assert r.status_code == 401


def test_unauthorized_access_to_private_endpoints():
    c = new_client()
    for path in ("/api/v1/profile", "/api/v1/measurements", "/api/v1/symptoms", "/api/v1/medications",
                 "/api/v1/appointments", "/api/v1/records", "/api/v1/chat/conversations", "/api/v1/settings/ai",
                 "/api/v1/dashboard"):
        assert c.get(path).status_code == 401, path


def test_tampered_token_rejected():
    c = new_client()
    c.cookies.set("pdai_session", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad")
    assert c.get("/api/v1/auth/me").status_code == 401


def test_csrf_required_for_unsafe_requests(client):
    token = client.headers.pop("X-CSRF-Token")
    r = client.put("/api/v1/profile", json={"full_name": "X"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    client.headers["X-CSRF-Token"] = "wrong"
    assert client.put("/api/v1/profile", json={"full_name": "X"}).status_code == 403
    client.headers["X-CSRF-Token"] = token
    assert client.put("/api/v1/profile", json={"full_name": "X"}).status_code == 200


def test_auth_rate_limit(monkeypatch):
    import app.api.v1.auth as auth_mod
    from app.config import get_settings
    limited = replace(get_settings(), auth_rate_limit_per_min=3)
    monkeypatch.setattr(auth_mod, "get_settings", lambda: limited)
    c = new_client()
    codes = [c.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "nope12345"}).status_code
             for _ in range(5)]
    assert codes[:3] == [401, 401, 401] and codes[3] == 429


def test_change_password_and_delete_account(client):
    r = client.post("/api/v1/auth/change-password", json={"current_password": "wrong", "new_password": "NewPassw0rd99"})
    assert r.status_code == 400
    r = client.post("/api/v1/auth/change-password",
                    json={"current_password": "Sup3rSecret!pw", "new_password": "NewPassw0rd99"})
    assert r.status_code == 200
    client.post("/api/v1/symptoms", json={"name": "Cough", "started_at": "2026-01-01T10:00:00Z"})
    r = client.request("DELETE", "/api/v1/auth/account", json={"password": "NewPassw0rd99", "confirm": "nope"})
    assert r.status_code == 422
    r = client.request("DELETE", "/api/v1/auth/account", json={"password": "NewPassw0rd99", "confirm": "DELETE"})
    assert r.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_stale_session_cookie_never_blocks_login_or_register():
    """Regression: an expired/invalid session cookie without a CSRF cookie must not block sign-in."""
    u = register(new_client())
    c = new_client()
    c.cookies.set("pdai_session", "stale.invalid.token")
    r = c.post("/api/v1/auth/login", json={"email": u["email"], "password": u["password"]})
    assert r.status_code == 200, r.text
    c2 = new_client()
    c2.cookies.set("pdai_session", "stale.invalid.token")
    r = c2.post("/api/v1/auth/register", json={"email": "fresh-" + u["email"], "password": "Abcdefgh12", "display_name": "F"})
    assert r.status_code == 201, r.text


def test_valid_session_still_requires_csrf_for_login():
    """Logging in while already signed in is allowed (exempt), but other writes still need CSRF."""
    c = new_client()
    u = register(c)
    c.headers.pop("X-CSRF-Token")
    assert c.post("/api/v1/auth/login", json={"email": u["email"], "password": u["password"]}).status_code == 200
    assert c.put("/api/v1/profile", json={"full_name": "X"}).status_code == 403


def test_unauthenticated_response_clears_stale_cookies():
    c = new_client()
    c.cookies.set("pdai_session", "stale.invalid.token")
    r = c.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert any("pdai_session=" in h and ("Max-Age=0" in h or "expires=" in h.lower()) for h in r.headers.get_list("set-cookie"))
