"""Test setup: isolated temp database + upload dir, migrations applied, mocked OpenAI client."""
from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace

from cryptography.fernet import Fernet

_TMP = Path(tempfile.mkdtemp(prefix="pdai-tests-"))
os.environ.update({
    "APP_ENV": "test",
    "JWT_SECRET": "test-jwt-secret-" + uuid.uuid4().hex,
    "ENCRYPTION_KEY": Fernet.generate_key().decode(),
    "DATABASE_URL": f"sqlite:///{_TMP / 'test.db'}",
    "UPLOAD_DIR": str(_TMP / "uploads"),
    "MAX_UPLOAD_MB": "1",
    "AUTH_RATE_LIMIT_PER_MIN": "1000",
    "AI_RATE_LIMIT_PER_MIN": "1000",
    "DEFAULT_OPENAI_MODEL": "gpt-test-mini",
})

import httpx  # noqa: E402
import openai  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BACKEND = Path(__file__).resolve().parent.parent
_cfg = Config(str(BACKEND / "alembic.ini"))
_cfg.set_main_option("script_location", str(BACKEND / "migrations"))
command.upgrade(_cfg, "head")

from app.main import app  # noqa: E402
from app.security.rate_limit import limiter  # noqa: E402
from app.services import ai_service  # noqa: E402

FAKE_KEY = "sk-test-" + "a" * 40


def _req() -> httpx.Request:
    return httpx.Request("POST", "https://api.openai.com/v1/responses")


def make_error(kind: str) -> Exception:
    if kind == "auth":
        return openai.AuthenticationError("bad key", response=httpx.Response(401, request=_req()), body=None)
    if kind == "rate":
        return openai.RateLimitError("slow down", response=httpx.Response(429, request=_req()), body=None)
    if kind == "timeout":
        return openai.APITimeoutError(request=_req())
    if kind == "notfound":
        return openai.NotFoundError("no model", response=httpx.Response(404, request=_req()), body=None)
    raise ValueError(kind)


class FakeOpenAI:
    """Mimics the subset of the OpenAI SDK we use. Records calls for assertions."""

    def __init__(self) -> None:
        self.error: str | None = None
        self.reply = "This is general health information, not a diagnosis."
        self.calls: list[dict] = []
        self.keys_seen: list[str] = []
        outer = self

        class Models:
            def retrieve(self, model: str):
                if outer.error:
                    raise make_error(outer.error)
                return SimpleNamespace(id=model)

            def list(self):
                if outer.error:
                    raise make_error(outer.error)
                return [SimpleNamespace(id=i) for i in ("gpt-test-mini", "gpt-test", "text-embedding-3-small")]

        class Responses:
            def create(self, **kw):
                outer.calls.append(kw)
                if outer.error:
                    raise make_error(outer.error)
                if kw.get("stream"):
                    words = outer.reply.split(" ")
                    return iter([SimpleNamespace(type="response.output_text.delta", delta=w + (" " if i < len(words) - 1 else ""))
                                 for i, w in enumerate(words)] + [SimpleNamespace(type="response.completed")])
                return SimpleNamespace(output_text=outer.reply)

        self.models = Models()
        self.responses = Responses()

    def factory(self, api_key: str):
        self.keys_seen.append(api_key)
        return self


@pytest.fixture(autouse=True)
def _reset():
    limiter.reset()
    yield
    ai_service.set_client_factory(None)


@pytest.fixture
def fake_ai() -> FakeOpenAI:
    fake = FakeOpenAI()
    ai_service.set_client_factory(fake.factory)
    return fake


def new_client() -> TestClient:
    return TestClient(app)


def register(client: TestClient, email: str | None = None, password: str = "Sup3rSecret!pw") -> dict:
    email = email or f"user-{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password, "display_name": "Test User"})
    assert r.status_code == 201, r.text
    client.headers["X-CSRF-Token"] = client.cookies.get("pdai_csrf")
    return {"email": email, "password": password, **r.json()}


@pytest.fixture
def client() -> TestClient:
    c = new_client()
    register(c)
    return c


def configure_ai(client: TestClient, consent: bool = True, context: bool = True, documents: bool = False) -> None:
    r = client.put("/api/v1/settings/ai", json={"api_key": FAKE_KEY, "model": "gpt-test-mini"})
    assert r.status_code == 200, r.text
    r = client.put("/api/v1/settings/privacy", json={"ai_consent": consent, "use_health_context": context,
                                                     "allow_document_ai": documents})
    assert r.status_code == 200, r.text


def make_pdf(text: str = "Hemoglobin 13.5 g/dL (13.0-17.0)\nGlucose 92 mg/dL (70-99)") -> bytes:
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72
    for line in text.splitlines():
        page.insert_text((72, y), line)
        y += 18
    data = doc.tobytes()
    doc.close()
    return data
