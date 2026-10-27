"""Opus turns a client's design request into a brief and a concept floor plan.

The concept is a set of rectangular rooms in metres on the lot, so it can be
exported straight to CAD (DXF) for the drafting team to verify and develop.
It is a starting point for drafting, not a DA-ready drawing.
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from sitecapture import media_tools
from sitecapture.ai.claude import ask_json, image_block, pdf_block

SYSTEM = """You are an experienced residential building designer in Australia \
preparing a concept for a client's new home ahead of a Development Application \
(DA). You receive the client's block details, requirements, a free-text \
description and any attached survey, grading/contour plans, sketches or \
existing drawings.

Produce:
1. brief_markdown: a design brief for the drafting team in Markdown with \
sections: Site summary, Client requirements, Room schedule (table: Room | \
Approx. size | Notes), Site constraints & opportunities (orientation, slope, \
setbacks, easements, overlays you can see or that are stated), Assumptions.
2. questions: specific questions the team must ask the client before drafting \
(only things that are genuinely missing or contradictory).
3. concept: a single-dwelling concept floor plan as axis-aligned rectangles in \
metres. Origin (0,0) is the front-left corner of the lot as seen from the \
street; x runs along the frontage to the right, y runs from the street to the \
rear boundary. Keep every room inside the lot minus the setbacks, rooms on the \
same level must not overlap, and rooms should share walls (no gaps for \
corridors unless you add a Hall/Corridor room). Size rooms to common \
Australian standards for the brief. Put living areas toward north where the \
orientation is known. Use one entry in levels per storey.

Never invent survey data. If lot dimensions are not given or readable from the \
attachments, assume a 15 m x 30 m lot, say so in Assumptions, and ask in \
questions. State any setback you assumed. Numbers are metres with at most 2 \
decimals."""

ROOM = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "type": {
            "type": "string",
            "enum": [
                "living",
                "kitchen",
                "dining",
                "bedroom",
                "bathroom",
                "ensuite",
                "laundry",
                "wc",
                "garage",
                "hall",
                "entry",
                "study",
                "alfresco",
                "storage",
                "stairs",
                "other",
            ],
        },
        "x": {"type": "number"},
        "y": {"type": "number"},
        "width": {"type": "number"},
        "depth": {"type": "number"},
    },
    "required": ["name", "type", "x", "y", "width", "depth"],
    "additionalProperties": False,
}

SCHEMA = {
    "type": "object",
    "properties": {
        "brief_markdown": {"type": "string"},
        "questions": {"type": "array", "items": {"type": "string"}},
        "concept": {
            "type": "object",
            "properties": {
                "lot": {
                    "type": "object",
                    "properties": {
                        "width": {"type": "number"},
                        "depth": {"type": "number"},
                    },
                    "required": ["width", "depth"],
                    "additionalProperties": False,
                },
                "setbacks": {
                    "type": "object",
                    "properties": {
                        "front": {"type": "number"},
                        "rear": {"type": "number"},
                        "left": {"type": "number"},
                        "right": {"type": "number"},
                    },
                    "required": ["front", "rear", "left", "right"],
                    "additionalProperties": False,
                },
                "north_deg": {
                    "type": "number",
                    "description": "Direction of north measured clockwise from the plan's +y axis (toward the rear). 0 if unknown.",
                },
                "levels": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "rooms": {"type": "array", "items": ROOM},
                        },
                        "required": ["name", "rooms"],
                        "additionalProperties": False,
                    },
                },
                "notes": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["lot", "setbacks", "north_deg", "levels", "notes"],
            "additionalProperties": False,
        },
    },
    "required": ["brief_markdown", "questions", "concept"],
    "additionalProperties": False,
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_PDF_BYTES = 20 * 1024 * 1024


def _shrink_image(path: Path, out: Path) -> Path:
    """Downscale photos/sketches to <= 1600 px so they fit the API image limit."""
    subprocess.run(
        [
            media_tools.ffmpeg(),
            "-v",
            "error",
            "-y",
            "-i",
            str(path),
            "-vf",
            "scale='min(1600,iw)':-2",
            "-q:v",
            "4",
            str(out),
        ],
        check=True,
    )
    return out


def _fmt(d: dict) -> str:
    return (
        "\n".join(
            f"- {k.replace('_', ' ')}: {v}"
            for k, v in d.items()
            if v not in (None, "", [])
        )
        or "- (none given)"
    )


def build_content(request, files: list[tuple[str, str, Path]], tmp: Path) -> list[dict]:
    """``files``: (kind, filename, local path) for client-supplied inputs."""
    content: list[dict] = [
        {
            "type": "text",
            "text": (
                f"Design request: {request.title}\n\n"
                f"Block / site details:\n{_fmt(request.site or {})}\n\n"
                f"Requirements:\n{_fmt(request.requirements or {})}\n\n"
                f"Client's description:\n{request.description or '(none)'}"
            ),
        }
    ]
    skipped = []
    for i, (kind, name, path) in enumerate(files):
        ext = path.suffix.lower()
        if ext == ".pdf" and path.stat().st_size <= MAX_PDF_BYTES:
            content.append({"type": "text", "text": f"Attachment ({kind}): {name}"})
            content.append(pdf_block(path, title=name))
        elif ext in IMAGE_EXTS:
            content.append({"type": "text", "text": f"Attachment ({kind}): {name}"})
            content.append(image_block(_shrink_image(path, tmp / f"img{i}.jpg")))
        else:
            skipped.append(name)
    if skipped:
        content.append(
            {
                "type": "text",
                "text": "Also attached but not readable here (CAD/other formats): "
                + ", ".join(skipped),
            }
        )
    content.append(
        {"type": "text", "text": "Write the brief, questions and concept now."}
    )
    return content


def check_concept(concept: dict) -> list[str]:
    """Plain geometric checks on the model's concept, shown to the team."""
    warnings = []
    lot, sb = concept["lot"], concept["setbacks"]
    x0, y0 = sb["left"], sb["front"]
    x1, y1 = lot["width"] - sb["right"], lot["depth"] - sb["rear"]
    for level in concept["levels"]:
        rooms = level["rooms"]
        for r in rooms:
            if r["width"] <= 0 or r["depth"] <= 0:
                warnings.append(f"{level['name']}: {r['name']} has no size")
                continue
            if (
                r["x"] < x0 - 0.01
                or r["y"] < y0 - 0.01
                or r["x"] + r["width"] > x1 + 0.01
                or r["y"] + r["depth"] > y1 + 0.01
            ):
                warnings.append(
                    f"{level['name']}: {r['name']} extends outside the setbacks"
                )
        for i, a in enumerate(rooms):
            for b in rooms[i + 1 :]:
                ox = min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"])
                oy = min(a["y"] + a["depth"], b["y"] + b["depth"]) - max(a["y"], b["y"])
                if ox > 0.05 and oy > 0.05:
                    warnings.append(
                        f"{level['name']}: {a['name']} overlaps {b['name']} by {ox * oy:.1f} m²"
                    )
    return warnings


def concept_areas(concept: dict) -> dict:
    out = {}
    for level in concept["levels"]:
        out[level["name"]] = round(
            sum(r["width"] * r["depth"] for r in level["rooms"]), 1
        )
    return out


def generate(request, files, model: str = "claude-opus-5-5", client=None) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        content = build_content(request, files, Path(tmp))
        result = ask_json(
            content,
            SCHEMA,
            SYSTEM,
            model=model,
            effort="high",
            max_tokens=64000,
            client=client,
        )
    concept = result["concept"]
    concept["checks"] = check_concept(concept)
    concept["areas_m2"] = concept_areas(concept)
    return result
