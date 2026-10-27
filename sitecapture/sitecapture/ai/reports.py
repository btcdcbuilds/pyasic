"""Progress reports written by Claude from matched 360 frames.

For a sample of locations on the drawing, the new capture's frame is paired
with the previous capture's frame at the same spot, and Claude compares them.
Claude reads images and writes text; the time-lapse video itself is made by
ffmpeg (see ``pipeline.timeline``).
"""

from __future__ import annotations

import base64
import math
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import anthropic

from sitecapture import media_tools
from sitecapture.db import Capture, Frame

SYSTEM_PROMPT = """You are a construction progress analyst. You are shown \
equirectangular 360 photos from site walks, paired by location on the floor \
plan: the earlier capture first, then the latest. Write a progress report for \
a site manager in Markdown with these sections:

## Summary
## Progress by location  (one row per location in a table: Location | Earlier | Latest | Change)
## Possible issues  (safety, quality, housekeeping, anything blocking work)
## Suggested follow-ups

Describe only what is visible. If a pair is too dark, blurred or obstructed to \
judge, say so for that location instead of guessing. Do not invent trades, \
quantities or dates that are not given or visible."""


@dataclass
class LocationPair:
    label: str
    x: float
    y: float
    latest: Frame
    earlier: Frame | None


def sample_pairs(
    latest: Capture, earlier: Capture | None, max_pairs: int = 8, radius: float = 0.03
) -> list[LocationPair]:
    """Evenly spaced placed frames from ``latest`` with their closest match in ``earlier``."""
    placed = [f for f in latest.frames if f.x is not None and f.y is not None]
    if not placed:
        return []
    step = max(1, math.ceil(len(placed) / max_pairs))
    chosen = placed[::step][:max_pairs]
    earlier_placed = [f for f in (earlier.frames if earlier else []) if f.x is not None]
    pairs = []
    for n, frame in enumerate(chosen, 1):
        match = None
        if earlier_placed:
            best = min(
                earlier_placed, key=lambda f: math.hypot(f.x - frame.x, f.y - frame.y)
            )
            if math.hypot(best.x - frame.x, best.y - frame.y) <= radius:
                match = best
        pairs.append(LocationPair(f"L{n}", frame.x, frame.y, frame, match))
    return pairs


def _encode(image: Path, width: int = 2048) -> str:
    """Downscale for the API and return base64 JPEG."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "img.jpg"
        subprocess.run(
            [
                media_tools.ffmpeg(),
                "-v",
                "error",
                "-y",
                "-i",
                str(image),
                "-vf",
                f"scale={width}:-2",
                "-q:v",
                "4",
                str(out),
            ],
            check=True,
        )
        return base64.standard_b64encode(out.read_bytes()).decode()


def _image_block(path: Path) -> dict:
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": _encode(path)},
    }


def build_content(
    project_name: str,
    latest: Capture,
    earlier: Capture | None,
    pairs: list[LocationPair],
) -> list[dict]:
    header = (
        f"Project: {project_name}\n"
        f"Latest capture: {latest.captured_at:%Y-%m-%d}"
        + (
            f"\nEarlier capture: {earlier.captured_at:%Y-%m-%d}"
            if earlier
            else "\nNo earlier capture: describe the current state only."
        )
        + (f"\nSite notes: {latest.notes}" if latest.notes else "")
    )
    content: list[dict] = [{"type": "text", "text": header}]
    for pair in pairs:
        content.append(
            {
                "type": "text",
                "text": f"Location {pair.label} (plan position x={pair.x:.3f}, y={pair.y:.3f})",
            }
        )
        if pair.earlier:
            content.append({"type": "text", "text": "Earlier:"})
            content.append(_image_block(Path(pair.earlier.image_path)))
        else:
            content.append(
                {"type": "text", "text": "Earlier: no matching photo at this location."}
            )
        content.append({"type": "text", "text": "Latest:"})
        content.append(_image_block(Path(pair.latest.image_path)))
    content.append({"type": "text", "text": "Write the progress report now."})
    return content


class ReportError(RuntimeError):
    pass


def generate_report(
    project_name: str,
    latest: Capture,
    earlier: Capture | None,
    model: str = "claude-opus-5-5",
    client: anthropic.Anthropic | None = None,
    max_pairs: int = 8,
) -> str:
    pairs = sample_pairs(latest, earlier, max_pairs=max_pairs)
    if not pairs:
        raise ReportError(
            "no frames are placed on the drawing yet; add control points first"
        )
    client = client or anthropic.Anthropic()
    content = build_content(project_name, latest, earlier, pairs)
    try:
        with client.beta.messages.stream(
            model=model,
            max_tokens=32000,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            # Retry server-side on Anthropic's recommended model if a safety
            # classifier declines the request.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": content}],
        ) as stream:
            message = stream.get_final_message()
    except anthropic.RateLimitError as exc:
        raise ReportError("Claude API rate limit reached; try again shortly") from exc
    except anthropic.APIStatusError as exc:
        raise ReportError(f"Claude API error {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise ReportError("could not reach the Claude API") from exc
    if message.stop_reason == "refusal":
        raise ReportError("the model declined to write this report")
    text = "".join(b.text for b in message.content if b.type == "text").strip()
    if not text:
        raise ReportError(f"empty response (stop_reason={message.stop_reason})")
    return text
