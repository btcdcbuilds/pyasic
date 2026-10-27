import pytest

from sitecapture.pipeline import drawings, frames, timeline


def test_equirect_check(equirect_video, flat_video, tmp_path):
    frames.check_media(equirect_video)
    with pytest.raises(frames.MediaError, match="not 2:1"):
        frames.check_media(flat_video)
    raw = tmp_path / "VID_001.insv"
    raw.write_bytes(b"x")
    with pytest.raises(frames.MediaError, match="Insta360 Studio"):
        frames.check_media(raw)


def test_extract_frames(equirect_video, tmp_path):
    out = frames.extract_frames([equirect_video], tmp_path, interval_s=1.0)
    assert len(out) == 3
    assert [f.timestamp_s for f in out] == [0.0, 1.0, 2.0]
    assert all(f.path.exists() for f in out)


def test_render_pdf_pages(plan_pdf, tmp_path):
    pages = drawings.render_pages(plan_pdf, tmp_path)
    assert len(pages) == 2
    # 842 x 595 pt at 150 dpi = 1754.2 x 1239.6 px (PyMuPDF rounds outward)
    assert abs(pages[0].width_px - 1754) <= 1 and abs(pages[0].height_px - 1240) <= 1


def test_timelapse_and_flat_view(equirect_video, tmp_path):
    imgs = frames.extract_frames([equirect_video], tmp_path / "f", interval_s=1.0)
    video = timeline.make_timelapse(
        [f.path for f in imgs], tmp_path / "tl.mp4", yaw_deg=45, size=(640, 360)
    )
    assert video.stat().st_size > 0
    view = timeline.flat_view(imgs[0].path, tmp_path / "v.jpg")
    assert frames.probe_size(view) == (1280, 768)
