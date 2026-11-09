from tests.conftest import configure_ai, make_pdf, new_client, register


def upload(client, data=None, name="labs.pdf", ctype="application/pdf", **form):
    data = make_pdf() if data is None else data
    return client.post("/api/v1/records", files={"file": (name, data, ctype)},
                       data={"category": "lab_report", **form})


def test_pdf_upload_extraction_and_listing(client):
    r = upload(client, title="Blood test", report_date="2026-01-15")
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["extraction_status"] == "success" and doc["page_count"] == 1
    assert "path" not in str(doc).lower() or "stored" not in str(doc)
    ext = client.get(f"/api/v1/records/{doc['id']}/extraction").json()
    assert "Hemoglobin 13.5 g/dL" in ext["text"]
    assert any("Glucose 92 mg/dL" in ln for ln in ext["lab_lines"])
    f = client.get(f"/api/v1/records/{doc['id']}/file")
    assert f.status_code == 200 and f.content.startswith(b"%PDF")
    r = client.patch(f"/api/v1/records/{doc['id']}", json={"description": "Annual", "category": "other"})
    assert r.json()["description"] == "Annual"


def test_invalid_file_rejection(client):
    assert upload(client, data=b"hello world", name="notes.txt", ctype="text/plain").status_code == 415
    assert upload(client, data=b"MZ\x90\x00 fake exe", name="evil.pdf").status_code == 415
    assert upload(client, data=b"", name="empty.pdf").status_code == 400
    assert upload(client, category="bogus").status_code == 422


def test_file_size_limit(client):
    big = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 10)  # MAX_UPLOAD_MB=1 in tests
    r = upload(client, data=big)
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"


def test_path_traversal_filename_is_sanitized(client):
    r = upload(client, name="../../etc/passwd.pdf")
    assert r.status_code == 201
    assert r.json()["original_filename"] == "passwd.pdf"


def test_empty_text_pdf(client):
    import pymupdf
    d = pymupdf.open()
    d.new_page()
    r = upload(client, data=d.tobytes())
    assert r.json()["extraction_status"] == "empty"


def test_document_ownership():
    a, b = new_client(), new_client()
    register(a)
    register(b)
    doc = upload(a).json()
    for path in ("", "/file", "/extraction"):
        assert b.get(f"/api/v1/records/{doc['id']}{path}").status_code == 404
    assert b.delete(f"/api/v1/records/{doc['id']}").status_code == 404
    assert b.get("/api/v1/records").json() == []
    assert a.delete(f"/api/v1/records/{doc['id']}").status_code == 200
    assert a.get(f"/api/v1/records/{doc['id']}").status_code == 404


def test_explain_requires_consent_then_works(client, fake_ai):
    doc = upload(client).json()
    configure_ai(client, documents=False)
    r = client.post(f"/api/v1/records/{doc['id']}/explain", json={"consent": True})
    assert r.status_code == 403 and r.json()["error"]["code"] == "document_consent_required"
    client.put("/api/v1/settings/privacy", json={"allow_document_ai": True})
    r = client.post(f"/api/v1/records/{doc['id']}/explain", json={"consent": False})
    assert r.status_code == 403
    assert fake_ai.calls == []
    fake_ai.reply = "**Key findings**: Hemoglobin 13.5 g/dL (13.0-17.0) as written."
    r = client.post(f"/api/v1/records/{doc['id']}/explain", json={"consent": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ai_explanation"] == fake_ai.reply and body["conversation_id"]
    assert "Hemoglobin 13.5 g/dL" in fake_ai.calls[-1]["instructions"]
    # Follow-up question in the document conversation includes the document text
    r = client.post(f"/api/v1/chat/conversations/{body['conversation_id']}/messages",
                    json={"content": "What does hemoglobin measure?"})
    assert r.status_code == 200 and "Glucose 92 mg/dL" in fake_ai.calls[-1]["instructions"]
