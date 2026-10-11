#!/usr/bin/env python3
"""Draw prefab unit footprints to scale on a site image and measure gaps.

Usage:
    python3 site_overlay.py --site site.json --dims dims.json --out layout.png

site.json  the shared site file (prefab-catalog/references/site-json.md).
           Needs base_image.path, base_image.scale (two_points + distance_m,
           or m_per_px) and units[] with model, center_px, rotation_deg.
           Optional boundary_px: [[x, y], ...] property outline on the image.
dims.json  {"UNIT-FX-20": {"length_m": ..., "width_m": ...}, ...}: the
           unfolded footprint copied from catalog.md. Missing or TBD values
           stop the script; nothing is guessed.

Prints a JSON report (scale, unit-to-unit and unit-to-boundary gaps,
overlaps) and writes the annotated image.
"""
import argparse
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

DISCLAIMER = ("Concept layout for planning and quotation only. Not a survey. "
              "Not for permit submission unless checked by a licensed engineer.")


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(1)


def metres_per_px(scale):
    if scale.get("m_per_px"):
        return float(scale["m_per_px"])
    p1, p2, dist = scale.get("p1_px"), scale.get("p2_px"), scale.get("distance_m")
    if not (p1 and p2 and dist):
        fail("base_image.scale needs m_per_px, or p1_px + p2_px + distance_m (a confirmed measurement)")
    px = math.dist(p1, p2)
    if px == 0:
        fail("scale points are identical")
    return float(dist) / px


def footprint(center, length_px, width_px, rot_deg):
    cx, cy = center
    a = math.radians(rot_deg)
    ca, sa = math.cos(a), math.sin(a)
    corners = []
    for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = dx * length_px / 2, dy * width_px / 2
        corners.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return corners


def seg_point_dist(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return math.dist(p, a)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.dist(p, (ax + t * dx, ay + t * dy))


def edges(poly):
    return [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]


def point_in_poly(p, poly):
    x, y = p
    inside = False
    for (x1, y1), (x2, y2) in edges(poly):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def segments_cross(a, b, c, d):
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return (orient(a, b, c) * orient(a, b, d) < 0) and (orient(c, d, a) * orient(c, d, b) < 0)


def polys_overlap(p, q):
    if any(segments_cross(a, b, c, d) for a, b in edges(p) for c, d in edges(q)):
        return True
    return point_in_poly(p[0], q) or point_in_poly(q[0], p)


def poly_gap(p, q):
    """Smallest distance between polygon outlines (0 if they overlap)."""
    if polys_overlap(p, q):
        return 0.0
    return min(
        min(seg_point_dist(v, a, b) for v in p for a, b in edges(q)),
        min(seg_point_dist(v, a, b) for v in q for a, b in edges(p)),
    )


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", required=True)
    ap.add_argument("--dims", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    with open(args.site, encoding="utf-8") as f:
        site = json.load(f)
    with open(args.dims, encoding="utf-8") as f:
        dims = json.load(f)

    base = site.get("base_image") or {}
    img_path = base.get("path")
    if not img_path:
        fail("base_image.path missing")
    if not os.path.isabs(img_path):
        img_path = os.path.join(os.path.dirname(os.path.abspath(args.site)), img_path)
    mpp = metres_per_px(base.get("scale") or {})

    img = Image.open(img_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = ImageFont.load_default()

    polys = []
    for u in site.get("units", []):
        d = dims.get(u.get("model"))
        if not d or not isinstance(d.get("length_m"), (int, float)) or not isinstance(d.get("width_m"), (int, float)):
            fail(f"no confirmed footprint for model {u.get('model')!r} in dims file (catalog value TBD?)")
        poly = footprint(u["center_px"], d["length_m"] / mpp, d["width_m"] / mpp, u.get("rotation_deg", 0))
        polys.append((u.get("label", u["model"]), poly))
        draw.polygon(poly, fill=(255, 140, 0, 110), outline=(255, 90, 0, 255))
        draw.text((u["center_px"][0] - 20, u["center_px"][1] - 6), u.get("label", u["model"]), fill=(0, 0, 0, 255), font=font)

    boundary = site.get("boundary_px")
    if boundary:
        draw.line([tuple(p) for p in boundary] + [tuple(boundary[0])], fill=(0, 120, 255, 255), width=3)

    report = {"ok": True, "m_per_px": mpp, "unit_gaps_m": [], "boundary_gaps_m": [], "overlaps": [], "outside_boundary": []}
    for i in range(len(polys)):
        for j in range(i + 1, len(polys)):
            gap = poly_gap(polys[i][1], polys[j][1]) * mpp
            report["unit_gaps_m"].append({"a": polys[i][0], "b": polys[j][0], "gap_m": round(gap, 2)})
            if gap == 0:
                report["overlaps"].append([polys[i][0], polys[j][0]])
    if boundary:
        bpoly = [tuple(p) for p in boundary]
        for label, poly in polys:
            crosses = any(segments_cross(a, b, c, d) for a, b in edges(poly) for c, d in edges(bpoly))
            if crosses or not all(point_in_poly(v, bpoly) for v in poly):
                report["outside_boundary"].append(label)
            gap = min(seg_point_dist(v, a, b) for v in poly for a, b in edges(bpoly)) * mpp
            report["boundary_gaps_m"].append({"unit": label, "gap_m": round(gap, 2)})

    # Scale bar (whole metres, about a fifth of the image width)
    bar_m = max(1, round(img.size[0] * mpp / 5))
    bar_px = bar_m / mpp
    x0, y0 = 20, img.size[1] - 50
    draw.rectangle([x0 - 6, y0 - 18, x0 + bar_px + 40, y0 + 14], fill=(255, 255, 255, 200))
    draw.line([(x0, y0), (x0 + bar_px, y0)], fill=(0, 0, 0, 255), width=4)
    draw.text((x0, y0 - 16), f"{bar_m} m", fill=(0, 0, 0, 255), font=font)

    draw.rectangle([0, img.size[1] - 20, img.size[0], img.size[1]], fill=(255, 255, 255, 220))
    draw.text((6, img.size[1] - 16), DISCLAIMER, fill=(180, 0, 0, 255), font=font)

    Image.alpha_composite(img, overlay).convert("RGB").save(args.out)
    report["out"] = args.out
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
