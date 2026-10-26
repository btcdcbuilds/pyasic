"""Opus drafts an annotation for the part of a 360 frame the user picked."""

from __future__ import annotations

import tempfile
from pathlib import Path

from sitecapture.ai.claude import ask_json, image_block
from sitecapture.db import ANNOTATION_CATEGORIES
from sitecapture.pipeline import timeline

SYSTEM = """You help a residential builder annotate 360 site photos. You are \
shown the view in the direction the user clicked, with the clicked point at \
the centre of the image. Draft one annotation about what is at or right around \
the centre:

- category: defect (workmanship/quality issue), progress (stage reached), \
safety (hazard), or note (anything else, including questions).
- title: short, specific, under 80 characters.
- body: 1-4 sentences a site manager could act on. Name the element, its \
location in the view and what to check or do.

Describe only what is visible. If the image is too dark, blurred or unclear \
to judge, say so in the body and use category "note". If the user supplied a \
rough note, keep its meaning and improve its wording."""

SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": list(ANNOTATION_CATEGORIES)},
        "title": {"type": "string"},
        "body": {"type": "string"},
    },
    "required": ["category", "title", "body"],
    "additionalProperties": False,
}


def suggest_annotation(
    frame_image: Path,
    yaw_deg: float,
    pitch_deg: float,
    project_name: str,
    note: str = "",
    model: str = "claude-opus-5-5",
    client=None,
) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        view = timeline.flat_view(
            Path(frame_image),
            Path(tmp) / "view.jpg",
            yaw_deg=yaw_deg,
            pitch_deg=pitch_deg,
            fov_deg=70,
        )
        content = [
            {"type": "text", "text": f"Project: {project_name}"},
            image_block(view),
            {
                "type": "text",
                "text": (
                    f"User's rough note: {note}"
                    if note.strip()
                    else "No note from the user."
                ),
            },
        ]
        result = ask_json(
            content,
            SCHEMA,
            SYSTEM,
            model=model,
            effort="medium",
            max_tokens=8000,
            client=client,
        )
    result["title"] = result["title"].strip()[:200]
    return result
