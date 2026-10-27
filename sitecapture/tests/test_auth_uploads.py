import datetime as dt

import pymupdf
import pytest
from fastapi.testclient import TestClient
from test_api import ADMIN, FakeProvider, _setup

from sitecapture import auth
from sitecapture.db import Job, Report
from sitecapture.gpu import orchestrator


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_password_hashing():
    h = auth.hash_password("a long password")
    assert h.startswith("scrypt$") and "a long password" not in h
    assert auth.verify_password("a long password", h)
    assert not auth.verify_password("wrong password", h)
    assert not auth.verify_password("x", "garbage")


def test_api_requires_login(anon):
    assert anon.get("/api/projects").status_code == 401
    assert anon.get("/api/auth/me").status_code == 401
    assert anon.get("/healthz").status_code == 200
    assert anon.get("/ui/index.html").status_code == 200  # login page is public


def test_login_logout(anon):
    assert login(anon, ADMIN[0], "wrong password!").status_code == 401
    r = login(anon, ADMIN[0].upper(), ADMIN[1])  # email is case-insensitive
    assert r.status_code == 200 and r.json()["is_admin"]
    cookie = r.headers["set-cookie"]
    assert "httponly" in cookie.lower() and "samesite=lax" in cookie.lower()
    assert anon.get("/api/projects").status_code == 200
    anon.post("/api/auth/logout")
    assert anon.get("/api/projects").status_code == 401


def test_login_throttle():
    throttle = auth.LoginThrottle(max_failures=3, window_s=60)
    for _ in range(3):
        throttle.fail("a@b.c")
    assert throttle.blocked("a@b.c") and not throttle.blocked("x@b.c")
    throttle.clear("a@b.c")
    assert not throttle.blocked("a@b.c")


def test_throttle_through_api(anon):
    for _ in range(auth.MAX_FAILURES):
        login(anon, ADMIN[0], "wrong password!")
    r = login(anon, ADMIN[0], ADMIN[1])
    assert r.status_code == 429  # blocked even with the right password


def test_cross_site_post_refused(client):
    r = client.post(
        "/api/projects", json={"name": "x"}, headers={"Origin": "https://evil.example"}
    )
    assert r.status_code == 403
    r = client.post(
        "/api/projects", json={"name": "x"}, headers={"Origin": "http://testserver"}
    )
    assert r.status_code == 201


def test_user_management(client, settings):
    from sitecapture.api.app import create_app

    r = client.post(
        "/api/users", json={"email": "site@example.com", "password": "short"}
    )
    assert r.status_code == 400
    r = client.post(
        "/api/users",
        json={
            "email": "site@example.com",
            "name": "Sam",
            "password": "site password 1",
        },
    )
    assert r.status_code == 201
    uid = r.json()["id"]
    assert (
        client.post(
            "/api/users",
            json={"email": "site@example.com", "password": "site password 1"},
        ).status_code
        == 400
    )  # duplicate

    with TestClient(create_app(settings)) as other:
        assert login(other, "site@example.com", "site password 1").status_code == 200
        assert other.get("/api/projects").status_code == 200
        assert other.get("/api/users").status_code == 403  # not an admin
        # Change own password: other sessions end, this one continues.
        r = other.post(
            "/api/auth/password",
            json={
                "current_password": "site password 1",
                "new_password": "new site pass 2",
            },
        )
        assert r.status_code == 200
        assert other.get("/api/projects").status_code == 200

        # Admin deactivates the user: their session stops working.
        r = client.patch(f"/api/users/{uid}", json={"is_active": False})
        assert r.json()["is_active"] is False
        assert other.get("/api/projects").status_code == 401
        assert login(other, "site@example.com", "new site pass 2").status_code == 401

    me = client.get("/api/auth/me").json()
    assert (
        client.patch(f"/api/users/{me['id']}", json={"is_admin": False}).status_code
        == 400
    )


def test_chunked_upload_and_capture(client, plan_pdf, equirect_video, monkeypatch):
    import sitecapture.api.app as app_mod

    monkeypatch.setattr(app_mod, "CHUNK_SIZE", 4 * 1024)
    pid, did, _ = _setup(client, plan_pdf, equirect_video)
    data = equirect_video.read_bytes()
    assert len(data) > 3 * 4 * 1024  # really is split into several chunks

    r = client.post(
        f"/api/projects/{pid}/uploads", json={"filename": "VID_1.insv", "size": 10}
    )
    assert r.status_code == 400 and "Insta360 Studio" in r.json()["detail"]
    r = client.post(
        f"/api/projects/{pid}/uploads", json={"filename": "huge.mp4", "size": 10**13}
    )
    assert r.status_code == 413

    up = client.post(
        f"/api/projects/{pid}/uploads", json={"filename": "walk.mp4", "size": len(data)}
    ).json()
    step = up["chunk_size"]
    client.put(f"/api/uploads/{up['id']}?offset=0", content=data[:step])
    # A retried chunk with a stale offset is refused with where to resume.
    r = client.put(f"/api/uploads/{up['id']}?offset=0", content=data[:step])
    assert r.status_code == 409 and r.json()["detail"]["received"] == step
    # Resume from what the server says it has.
    offset = client.get(f"/api/uploads/{up['id']}").json()["received"]
    while offset < len(data):
        r = client.put(
            f"/api/uploads/{up['id']}?offset={offset}",
            content=data[offset : offset + step],
        )
        assert r.status_code == 200, r.text
        offset = r.json()["received"]
    assert r.json()["complete"]

    r = client.post(
        f"/api/projects/{pid}/captures/from-uploads",
        json={
            "upload_ids": [up["id"]],
            "drawing_id": did,
            "captured_at": "2026-09-15T08:00:00Z",
        },
    )
    assert r.status_code == 201, r.text
    cap = client.get(f"/api/captures/{r.json()['id']}").json()
    assert cap["frame_count"] == 3
    # The same upload can't be used twice.
    r = client.post(
        f"/api/projects/{pid}/captures/from-uploads", json={"upload_ids": [up["id"]]}
    )
    assert r.status_code == 409


def test_chunked_upload_rejects_non_360(client, flat_video):
    pid = client.post("/api/projects", json={"name": "P"}).json()["id"]
    data = flat_video.read_bytes()
    up = client.post(
        f"/api/projects/{pid}/uploads", json={"filename": "p.mp4", "size": len(data)}
    ).json()
    r = client.put(f"/api/uploads/{up['id']}?offset=0", content=data)
    assert r.status_code == 400 and "equirectangular" in r.json()["detail"]
    assert client.get(f"/api/uploads/{up['id']}").status_code == 404


def test_uploads_are_private_to_their_owner(client, settings):
    from sitecapture.api.app import create_app

    pid = client.post("/api/projects", json={"name": "P"}).json()["id"]
    up = client.post(
        f"/api/projects/{pid}/uploads", json={"filename": "a.mp4", "size": 5}
    ).json()
    client.post(
        "/api/users", json={"email": "b@example.com", "password": "b password 123"}
    )
    with TestClient(create_app(settings)) as other:
        login(other, "b@example.com", "b password 123")
        assert other.get(f"/api/uploads/{up['id']}").status_code == 404
        assert (
            other.put(f"/api/uploads/{up['id']}?offset=0", content=b"x").status_code
            == 404
        )


def test_report_pdf(client):
    pid = client.post("/api/projects", json={"name": "Block A"}).json()["id"]
    app = client.app
    with app.state.sessionmaker() as session:
        from sitecapture.db import Capture

        cap = Capture(
            project_id=pid, captured_at=dt.datetime(2026, 9, 8, tzinfo=dt.timezone.utc)
        )
        session.add(cap)
        session.flush()
        report = Report(
            project_id=pid,
            capture_id=cap.id,
            model="claude-opus-5-5",
            markdown="## Summary\nSlab poured.\n\n| Location | Change |\n|---|---|\n| L1 | Formwork removed |\n",
        )
        session.add(report)
        session.commit()
        rid = report.id
    r = client.get(f"/api/reports/{rid}.pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    text = pymupdf.open(stream=r.content, filetype="pdf")[0].get_text()
    assert "Block A" in text and "Slab poured." in text and "Formwork removed" in text


def test_reaper_terminates_stuck_jobs(
    client, settings, plan_pdf, equirect_video, monkeypatch
):
    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    fake = FakeProvider()
    monkeypatch.setattr(orchestrator, "get_provider", lambda s: fake)
    job_id = client.post(f"/api/captures/{cid}/reconstruct").json()["id"]
    with client.app.state.sessionmaker() as session:
        assert orchestrator.reap_stale_jobs(session, settings) == 0  # still fresh
        job = session.get(Job, job_id)
        job.created_at = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=7)
        session.commit()
        assert orchestrator.reap_stale_jobs(session, settings) == 1
    assert fake.terminated == ["inst-1"]
    assert client.get(f"/api/jobs/{job_id}").json()["status"] == "failed"
