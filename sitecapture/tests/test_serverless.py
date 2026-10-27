"""Serverless mode: files kept in the database, local disk wiped between requests."""

import shutil

import pytest
from fastapi.testclient import TestClient

from sitecapture import media_tools
from sitecapture.config import Settings
from sitecapture.pipeline import frames

ADMIN = ("admin@example.com", "correct horse battery")


@pytest.fixture
def sl_settings(tmp_path, settings):
    # Reuse the shared fixture's database choice (SQLite or Postgres).
    db_url = settings.database_url
    if db_url.startswith("sqlite"):
        db_url = f"sqlite:///{tmp_path / 'db.sqlite'}"  # outside the wiped dir
    return Settings(
        data_dir=tmp_path / "ephemeral",
        database_url=db_url,
        gpu_provider="local",
        admin_email=ADMIN[0],
        admin_password=ADMIN[1],
        reaper_interval_min=0,
        file_store="db",
        inline_processing=True,
        chunk_mb=0.004,  # ~4 KB, so the test video spans several chunks
    )


def wipe(settings):
    """What a fresh serverless instance sees: an empty disk."""
    shutil.rmtree(settings.data_dir, ignore_errors=True)
    settings.data_dir.mkdir(parents=True)


def test_files_survive_a_fresh_disk(sl_settings, plan_pdf, equirect_video):
    from sitecapture.api.app import create_app

    with TestClient(create_app(sl_settings)) as c:
        c.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        pid = c.post("/api/projects", json={"name": "Demo"}).json()["id"]
        with plan_pdf.open("rb") as f:
            did = c.post(
                f"/api/projects/{pid}/drawings",
                files={"file": ("plan.pdf", f, "application/pdf")},
            ).json()[0]["id"]
        wipe(sl_settings)

        data = equirect_video.read_bytes()
        up = c.post(
            f"/api/projects/{pid}/uploads",
            json={"filename": "walk.mp4", "size": len(data)},
        ).json()
        step = up["chunk_size"]
        assert step < len(data) / 2
        offset = 0
        while offset < len(data):
            r = c.put(
                f"/api/uploads/{up['id']}?offset={offset}",
                content=data[offset : offset + step],
            )
            assert r.status_code == 200, r.text
            offset = r.json()["received"]
            wipe(sl_settings)  # every chunk lands on a "new machine"

        r = c.post(
            f"/api/projects/{pid}/captures/from-uploads",
            json={"upload_ids": [up["id"]], "drawing_id": did},
        )
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        # Inline processing: frames are ready when the request returns.
        cap = c.get(f"/api/captures/{cid}").json()
        assert cap["status"] == "frames_ready" and cap["frame_count"] == 3
        wipe(sl_settings)

        assert c.get(f"/api/drawings/{did}/image").status_code == 200
        img = c.get(cap["frames"][0]["image_url"])
        assert img.status_code == 200 and img.content[:2] == b"\xff\xd8"  # JPEG

        c.put(
            f"/api/captures/{cid}/control-points",
            json=[
                {"frame_index": 0, "x": 0.2, "y": 0.5},
                {"frame_index": 2, "x": 0.6, "y": 0.5},
            ],
        )
        # Second walk, then a time-lapse from a wiped disk.
        r = c.post(
            f"/api/projects/{pid}/uploads",
            json={"filename": "w2.mp4", "size": len(data)},
        )
        up2 = r.json()
        offset = 0
        while offset < len(data):
            offset = c.put(
                f"/api/uploads/{up2['id']}?offset={offset}",
                content=data[offset : offset + step],
            ).json()["received"]
        cid2 = c.post(
            f"/api/projects/{pid}/captures/from-uploads",
            json={"upload_ids": [up2["id"]], "drawing_id": did},
        ).json()["id"]
        c.put(
            f"/api/captures/{cid2}/control-points",
            json=[
                {"frame_index": 0, "x": 0.2, "y": 0.5},
                {"frame_index": 2, "x": 0.6, "y": 0.5},
            ],
        )
        wipe(sl_settings)
        r = c.post(
            f"/api/projects/{pid}/timelapse",
            json={"drawing_id": did, "x": 0.4, "y": 0.5},
        )
        assert r.status_code == 200 and len(r.content) > 0

    # A brand-new app instance (new "deployment") still logs in and sees data.
    wipe(sl_settings)
    with TestClient(create_app(sl_settings)) as c2:
        c2.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        assert [p["name"] for p in c2.get("/api/projects").json()] == ["Demo"]


def test_probe_without_ffprobe(monkeypatch, equirect_video, plan_pdf, tmp_path):
    from sitecapture.pipeline import drawings

    expected = frames.probe_size(equirect_video)
    png = drawings.render_pages(plan_pdf, tmp_path)[0]
    monkeypatch.setattr(media_tools, "ffprobe", lambda: None)
    assert frames.probe_size(equirect_video) == expected
    assert frames.probe_size(png.image_path) == (png.width_px, png.height_px)
    bad = tmp_path / "x.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(frames.MediaError):
        frames.probe_size(bad)


def test_chunked_pdf_drawing(sl_settings, plan_pdf):
    from sitecapture.api.app import create_app

    with TestClient(create_app(sl_settings)) as c:
        c.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        pid = c.post("/api/projects", json={"name": "Demo"}).json()["id"]
        data = plan_pdf.read_bytes()
        up = c.post(
            f"/api/projects/{pid}/uploads",
            json={"filename": "Level plans.pdf", "size": len(data)},
        ).json()
        offset = 0
        while offset < len(data):
            r = c.put(
                f"/api/uploads/{up['id']}?offset={offset}",
                content=data[offset : offset + up["chunk_size"]],
            )
            assert r.status_code == 200, r.text
            offset = r.json()["received"]
            wipe(sl_settings)
        # A PDF can't become a site walk.
        r = c.post(
            f"/api/projects/{pid}/captures/from-uploads",
            json={"upload_ids": [up["id"]]},
        )
        assert r.status_code == 400
        r = c.post(
            f"/api/projects/{pid}/drawings/from-upload", json={"upload_id": up["id"]}
        )
        assert r.status_code == 201, r.text
        pages = r.json()
        assert [p["name"] for p in pages] == ["Level plans (p1)", "Level plans (p2)"]
        wipe(sl_settings)
        assert c.get(pages[1]["image_url"]).status_code == 200

        # Non-PDF content with a .pdf name is rejected when the upload completes.
        up = c.post(
            f"/api/projects/{pid}/uploads", json={"filename": "fake.pdf", "size": 4}
        ).json()
        r = c.put(f"/api/uploads/{up['id']}?offset=0", content=b"nope")
        assert r.status_code == 400 and "not a PDF" in r.json()["detail"]
