import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import subprocess
from pathlib import Path

import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient

from sitecapture.config import Settings


@pytest.fixture(scope="session")
def media_dir(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("media")


@pytest.fixture(scope="session")
def equirect_video(media_dir) -> Path:
    """3 s, 2:1 test video standing in for an exported Insta360 walk."""
    path = media_dir / "walk.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=512x256:rate=10:duration=3",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )
    return path


@pytest.fixture(scope="session")
def flat_video(media_dir) -> Path:
    path = media_dir / "phone.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x360:rate=10:duration=1",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )
    return path


@pytest.fixture(scope="session")
def plan_pdf(media_dir) -> Path:
    path = media_dir / "level1.pdf"
    doc = fitz.open()
    for label in ("Level 1", "Level 2"):
        page = doc.new_page(width=842, height=595)  # A4 landscape, points
        page.draw_rect(fitz.Rect(50, 50, 792, 545))
        page.insert_text((60, 80), label)
    doc.save(path)
    return path


ADMIN = ("admin@example.com", "correct horse battery")  # also in test_api


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENSFM_BIN", raising=False)
    # Set SITECAPTURE_TEST_DATABASE_URL to run against Postgres; tables are
    # dropped before each test.
    db_url = os.environ.get("SITECAPTURE_TEST_DATABASE_URL", "")
    if db_url:
        from sqlalchemy import create_engine

        from sitecapture.db import Base

        engine = create_engine(db_url)
        Base.metadata.drop_all(engine)
        engine.dispose()
    return Settings(
        data_dir=tmp_path / "data",
        database_url=db_url,
        gpu_provider="local",
        admin_email=ADMIN[0],
        admin_password=ADMIN[1],
        reaper_interval_min=0,
    )


@pytest.fixture
def anon(settings):
    from sitecapture.api.app import create_app

    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def client(anon):
    r = anon.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
    assert r.status_code == 200, r.text
    return anon
