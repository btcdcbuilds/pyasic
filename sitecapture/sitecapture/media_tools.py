"""Locate ffmpeg/ffprobe.

Uses the system binaries when installed (VPS, Docker). Otherwise falls back to
the static ffmpeg shipped in the ``imageio-ffmpeg`` package (Vercel), which
has no ffprobe, so :func:`probe_size` can parse ffmpeg's own output instead.
"""

from __future__ import annotations

import functools
import json
import re
import shutil
import subprocess
from pathlib import Path


class MediaProbeError(ValueError):
    pass


@functools.lru_cache(maxsize=1)
def ffmpeg() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise RuntimeError("ffmpeg is not installed") from exc
    return imageio_ffmpeg.get_ffmpeg_exe()


@functools.lru_cache(maxsize=1)
def ffprobe() -> str | None:
    return shutil.which("ffprobe")


# e.g. "Stream #0:0[0x1](und): Video: h264 (High), yuv420p(progressive), 512x256 [SAR 1:1 DAR 2:1], ..."
_VIDEO_SIZE = re.compile(r"Stream #\S+.*?: Video: .*?(\d{2,6})x(\d{2,6})")


def probe_size(path: Path) -> tuple[int, int]:
    probe = ffprobe()
    if probe:
        out = subprocess.run(
            [
                probe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        streams = json.loads(out).get("streams") or []
        if not streams:
            raise MediaProbeError(f"{Path(path).name}: no video/image stream found")
        return int(streams[0]["width"]), int(streams[0]["height"])
    # ffmpeg with no output file prints stream info to stderr and exits 1.
    err = subprocess.run(
        [ffmpeg(), "-hide_banner", "-i", str(path)], capture_output=True, text=True
    ).stderr
    match = _VIDEO_SIZE.search(err)
    if not match:
        raise MediaProbeError(f"{Path(path).name}: no video/image stream found")
    return int(match.group(1)), int(match.group(2))
