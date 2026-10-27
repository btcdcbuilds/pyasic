import datetime as dt
from types import SimpleNamespace

import pytest

from sitecapture.ai import reports
from sitecapture.db import Capture, Frame
from sitecapture.pipeline import frames


class FakeStream:
    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.message


class FakeClient:
    def __init__(self, message):
        self.calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))
        self.message = message

    def _stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream(self.message)


def _capture(paths, day, offset=0.0):
    c = Capture(captured_at=dt.datetime(2026, 9, day, tzinfo=dt.timezone.utc), notes="")
    c.frames = [
        Frame(index=i, image_path=str(p), x=0.1 + 0.1 * i + offset, y=0.5)
        for i, p in enumerate(paths)
    ]
    return c


@pytest.fixture
def two_captures(equirect_video, tmp_path):
    imgs = [f.path for f in frames.extract_frames([equirect_video], tmp_path, 1.0)]
    return _capture(imgs, 1), _capture(imgs, 8, offset=0.005)


def test_report_request_and_text(two_captures):
    earlier, latest = two_captures
    msg = SimpleNamespace(
        stop_reason="end_turn",
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text="## Summary\nOK"),
        ],
    )
    client = FakeClient(msg)
    text = reports.generate_report("Block A", latest, earlier, client=client)
    assert text == "## Summary\nOK"
    call = client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["thinking"] == {"type": "adaptive"}
    assert call["fallbacks"] == "default" and call["betas"] == [
        "server-side-fallback-2026-07-01"
    ]
    images = [b for b in call["messages"][0]["content"] if b["type"] == "image"]
    assert len(images) == 6  # 3 locations x (earlier + latest)


def test_report_refusal_and_unplaced(two_captures):
    earlier, latest = two_captures
    client = FakeClient(SimpleNamespace(stop_reason="refusal", content=[]))
    with pytest.raises(reports.ReportError, match="declined"):
        reports.generate_report("P", latest, earlier, client=client)
    for f in latest.frames:
        f.x = f.y = None
    with pytest.raises(reports.ReportError, match="no frames are placed"):
        reports.generate_report("P", latest, earlier, client=client)
