"""Export a concept floor plan (rooms in metres) to DXF and PDF.

The DXF is a plain R12 file (no extra dependency) that opens in AutoCAD,
BricsCAD, ArchiCAD, Revit (import), DraftSight, LibreCAD and STEVE. Layers:
BOUNDARY (lot), SETBACK (buildable envelope), WALLS (room outlines), TEXT
(room names and sizes), NORTH (north arrow). Units: metres, origin at the
front-left lot corner, +Y toward the rear boundary.
"""

from __future__ import annotations

import math
from pathlib import Path

import pymupdf

LAYERS = {"BOUNDARY": 1, "SETBACK": 8, "WALLS": 7, "TEXT": 3, "NORTH": 5}


def _rect(x, y, w, d):
    return [(x, y), (x + w, y), (x + w, y + d), (x, y + d)]


def _room_label(r) -> tuple[str, str]:
    return (
        r["name"],
        f"{r['width']:.1f} x {r['depth']:.1f} m ({r['width'] * r['depth']:.1f} m2)",
    )


def _north_arrow(concept, length=2.5):
    """Arrow just outside the lot's rear-right corner."""
    lot = concept["lot"]
    cx, cy = lot["width"] + 3, lot["depth"] - 3
    a = math.radians(concept.get("north_deg", 0) or 0)
    dx, dy = math.sin(a) * length, math.cos(a) * length
    return (cx, cy), (cx + dx, cy + dy)


def to_dxf(concept: dict, title: str = "") -> str:
    out = [
        "0",
        "SECTION",
        "2",
        "HEADER",
        "9",
        "$INSUNITS",
        "70",
        "6",
        "0",
        "ENDSEC",
        "0",
        "SECTION",
        "2",
        "TABLES",
        "0",
        "TABLE",
        "2",
        "LAYER",
        "70",
        str(len(LAYERS)),
    ]
    for name, color in LAYERS.items():
        out += ["0", "LAYER", "2", name, "70", "0", "62", str(color), "6", "CONTINUOUS"]
    out += ["0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"]

    def line(layer, p, q):
        out.extend(
            [
                "0",
                "LINE",
                "8",
                layer,
                "10",
                f"{p[0]:.3f}",
                "20",
                f"{p[1]:.3f}",
                "30",
                "0",
                "11",
                f"{q[0]:.3f}",
                "21",
                f"{q[1]:.3f}",
                "31",
                "0",
            ]
        )

    def poly(layer, pts):
        for p, q in zip(pts, pts[1:] + pts[:1]):
            line(layer, p, q)

    def text(layer, p, h, s):
        out.extend(
            [
                "0",
                "TEXT",
                "8",
                layer,
                "10",
                f"{p[0]:.3f}",
                "20",
                f"{p[1]:.3f}",
                "30",
                "0",
                "40",
                f"{h:.3f}",
                "1",
                s.replace("\n", " "),
            ]
        )

    lot, sb = concept["lot"], concept["setbacks"]
    poly("BOUNDARY", _rect(0, 0, lot["width"], lot["depth"]))
    poly(
        "SETBACK",
        _rect(
            sb["left"],
            sb["front"],
            lot["width"] - sb["left"] - sb["right"],
            lot["depth"] - sb["front"] - sb["rear"],
        ),
    )
    # Levels side by side, each offset by the lot width + 6 m.
    for i, level in enumerate(concept["levels"]):
        ox = i * (lot["width"] + 6)
        if i:
            poly(
                "BOUNDARY",
                [(x + ox, y) for x, y in _rect(0, 0, lot["width"], lot["depth"])],
            )
        text(
            "TEXT", (ox, -2.0), 0.6, f"{level['name']}{' - ' + title if title else ''}"
        )
        for r in level["rooms"]:
            poly(
                "WALLS",
                [(x + ox, y) for x, y in _rect(r["x"], r["y"], r["width"], r["depth"])],
            )
            name, size = _room_label(r)
            text("TEXT", (r["x"] + ox + 0.2, r["y"] + r["depth"] / 2 + 0.1), 0.35, name)
            text(
                "TEXT", (r["x"] + ox + 0.2, r["y"] + r["depth"] / 2 - 0.45), 0.22, size
            )
    base, tip = _north_arrow(concept)
    line("NORTH", base, tip)
    text("NORTH", (tip[0] - 0.2, tip[1] + 0.3), 0.5, "N")
    out += ["0", "ENDSEC", "0", "EOF"]
    return "\n".join(out) + "\n"


def to_pdf(concept: dict, out_path: Path, title: str = "") -> Path:
    """One A3 landscape sheet per level, scaled to fit."""
    lot, sb = concept["lot"], concept["setbacks"]
    doc = pymupdf.open()
    W, H, M = 1190, 842, 50  # A3 points, margin
    for level in concept["levels"]:
        page = doc.new_page(width=W, height=H)
        scale = min(
            (W - 2 * M - 120) / (lot["width"] + 6), (H - 2 * M - 60) / lot["depth"]
        )

        def P(x, y):  # plan metres -> page points; +y (rear) goes up the page
            return pymupdf.Point(M + x * scale, H - M - 40 - y * scale)

        def rect(x, y, w, d, color, width, dashes=None):
            pts = [P(*p) for p in _rect(x, y, w, d)]
            page.draw_polyline(pts + [pts[0]], color=color, width=width, dashes=dashes)

        rect(0, 0, lot["width"], lot["depth"], (0.85, 0.2, 0.1), 1.2)
        rect(
            sb["left"],
            sb["front"],
            lot["width"] - sb["left"] - sb["right"],
            lot["depth"] - sb["front"] - sb["rear"],
            (0.5, 0.5, 0.55),
            0.6,
            "[4 3] 0",
        )
        for r in level["rooms"]:
            rect(r["x"], r["y"], r["width"], r["depth"], (0.1, 0.1, 0.15), 1.6)
            name, size = _room_label(r)
            c = P(r["x"] + 0.15, r["y"] + r["depth"] / 2)
            page.insert_text(
                (c.x, c.y - 2), name.upper(), fontsize=max(5, min(9, scale * 0.35))
            )
            page.insert_text(
                (c.x, c.y + 8),
                size,
                fontsize=max(4, min(7, scale * 0.25)),
                color=(0.35, 0.35, 0.4),
            )
        base, tip = _north_arrow(concept)
        page.draw_line(P(*base), P(*tip), color=(0.1, 0.3, 0.8), width=1.5)
        page.insert_text(
            P(tip[0] - 0.3, tip[1] + 0.6), "N", fontsize=12, color=(0.1, 0.3, 0.8)
        )
        page.insert_text(
            (M, H - 22),
            f"YCB CONCEPT - {title} - {level['name']} - NOT FOR CONSTRUCTION - "
            f"lot {lot['width']} x {lot['depth']} m - dimensions in metres",
            fontsize=8,
        )
        page.insert_text(
            (M, P(0, -1.5).y),
            "STREET / FRONT BOUNDARY",
            fontsize=8,
            color=(0.4, 0.4, 0.45),
        )
    doc.save(out_path)
    return out_path
