import subprocess
from pathlib import Path

import pymupdf as fitz
import pytest


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
