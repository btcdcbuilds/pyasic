"""Recall: find what a spot on the drawing looked like at each capture."""

from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sitecapture import media_tools
from sitecapture.db import Capture, Frame


@dataclass
class TimelineEntry:
    capture: Capture
    frame: Frame
    distance: float


def nearest_frames(
    captures: Iterable[Capture], x: float, y: float, radius: float
) -> list[TimelineEntry]:
    """Closest placed frame to (x, y) in each capture, oldest capture first.

    ``radius`` is in normalised drawing units; captures with no frame inside
    it are left out.
    """
    entries = []
    for capture in captures:
        best = None
        for frame in capture.frames:
            if frame.x is None or frame.y is None:
                continue
            d = math.hypot(frame.x - x, frame.y - y)
            if d <= radius and (best is None or d < best[0]):
                best = (d, frame)
        if best:
            entries.append(TimelineEntry(capture, best[1], best[0]))
    entries.sort(key=lambda e: e.capture.captured_at)
    return entries


def make_timelapse(
    images: list[Path],
    out_path: Path,
    yaw_deg: float = 0.0,
    pitch_deg: float = 0.0,
    fov_deg: float = 90.0,
    seconds_per_frame: float = 1.0,
    size: tuple[int, int] = (1920, 1080),
) -> Path:
    """Render a time-lapse of one viewpoint across captures.

    Each equirectangular frame is reprojected to a flat view looking in the
    same direction with ffmpeg's ``v360`` filter, so the video shows a normal
    camera view rather than a stretched panorama.
    """
    if not images:
        raise ValueError("no frames for time-lapse")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    w, h = size
    v_fov = 2 * math.degrees(math.atan(math.tan(math.radians(fov_deg) / 2) * h / w))
    list_file = out_path.with_suffix(".txt")
    lines = []
    for img in images:
        lines.append(f"file '{Path(img).resolve()}'")
        lines.append(f"duration {seconds_per_frame}")
    # ffmpeg's concat demuxer ignores the last duration unless the final
    # file is listed again.
    lines.append(f"file '{Path(images[-1]).resolve()}'")
    list_file.write_text("\n".join(lines) + "\n")
    vf = (
        f"v360=e:flat:yaw={yaw_deg}:pitch={pitch_deg}:h_fov={fov_deg}:v_fov={v_fov:.3f}"
        f":w={w}:h={h},fps=30,format=yuv420p"
    )
    subprocess.run(
        [
            media_tools.ffmpeg(),
            "-v",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            str(out_path),
        ],
        check=True,
    )
    list_file.unlink(missing_ok=True)
    return out_path


def flat_view(
    image: Path, out_path: Path, yaw_deg: float = 0.0, fov_deg: float = 90.0
) -> Path:
    """Single perspective crop of a 360 frame (used for AI reports)."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1280, 768
    v_fov = 2 * math.degrees(math.atan(math.tan(math.radians(fov_deg) / 2) * h / w))
    subprocess.run(
        [
            media_tools.ffmpeg(),
            "-v",
            "error",
            "-y",
            "-i",
            str(image),
            "-vf",
            f"v360=e:flat:yaw={yaw_deg}:h_fov={fov_deg}:v_fov={v_fov:.3f}:w={w}:h={h}",
            "-frames:v",
            "1",
            str(out_path),
        ],
        check=True,
    )
    return out_path
