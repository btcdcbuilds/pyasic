"""Turn uploaded 360 media into equirectangular frames.

Insta360 cameras record ``.insv`` files: unstitched dual-fisheye video. Those
must be exported to an equirectangular MP4 in Insta360 Studio (or the mobile
app) before upload; the camera's own stitching uses calibration data we don't
have. Equirectangular media is recognised by its 2:1 aspect ratio.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

VIDEO_EXTS = {".mp4", ".mov", ".m4v"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
RAW_INSTA360_EXTS = {".insv", ".insp"}


class MediaError(ValueError):
    pass


@dataclass
class ExtractedFrame:
    index: int
    path: Path
    timestamp_s: float


def probe_size(path: Path) -> tuple[int, int]:
    out = subprocess.run(
        [
            "ffprobe",
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
        raise MediaError(f"{path.name}: no video/image stream found")
    return int(streams[0]["width"]), int(streams[0]["height"])


def is_equirectangular(width: int, height: int, tolerance: float = 0.02) -> bool:
    return height > 0 and abs(width / height - 2.0) <= 2.0 * tolerance


def check_media(path: Path) -> None:
    ext = path.suffix.lower()
    if ext in RAW_INSTA360_EXTS:
        raise MediaError(
            f"{path.name}: raw Insta360 file. Export it as a 360 (equirectangular) "
            "MP4/JPG from Insta360 Studio first."
        )
    if ext not in VIDEO_EXTS | IMAGE_EXTS:
        raise MediaError(f"{path.name}: unsupported file type {ext}")
    width, height = probe_size(path)
    if not is_equirectangular(width, height):
        raise MediaError(
            f"{path.name}: {width}x{height} is not 2:1 equirectangular 360 media"
        )


def extract_frames(
    sources: list[Path], out_dir: Path, interval_s: float = 1.0
) -> list[ExtractedFrame]:
    """Extract one frame every ``interval_s`` from videos; copy photos as-is.

    Frames are numbered in upload order, so a walk split across several files
    stays one continuous sequence.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    frames: list[ExtractedFrame] = []
    offset_s = 0.0
    for src in sources:
        ext = src.suffix.lower()
        if ext in IMAGE_EXTS:
            target = out_dir / f"frame_{len(frames):05d}{ext}"
            shutil.copyfile(src, target)
            frames.append(ExtractedFrame(len(frames), target, offset_s))
            offset_s += interval_s
            continue
        tmp = out_dir / f"_{src.stem}"
        tmp.mkdir(exist_ok=True)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(src),
                "-vf",
                f"fps=1/{interval_s}",
                "-q:v",
                "2",
                str(tmp / "%05d.jpg"),
            ],
            check=True,
        )
        for i, extracted in enumerate(sorted(tmp.glob("*.jpg"))):
            target = out_dir / f"frame_{len(frames):05d}.jpg"
            extracted.replace(target)
            frames.append(
                ExtractedFrame(len(frames), target, offset_s + i * interval_s)
            )
        shutil.rmtree(tmp, ignore_errors=True)
        offset_s = frames[-1].timestamp_s + interval_s if frames else offset_s
    return frames
