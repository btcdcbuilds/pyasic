"""Compare an aligned scan with the design model: per-point and per-element deviation.

Definitions used in the results (also shown in the UI and reports):

* distance: from each scan point to the nearest model surface.
* near the model: distance <= ``cutoff_m``. Points further away are counted
  as "not in the model" (clutter, temporary works, or elements built far from
  their design position).
* within tolerance: distance <= ``tolerance_m``.
* coverage: on the element's best-scanned side (its faces grouped by normal
  direction), the share of surface samples that scan points project onto:
  the closest surface point of a scan point within the cutoff lies in the
  same or a neighbouring 2.5 cm voxel (about 2.5 to 8.7 cm away).
* element status:
  - ``outside_scan``: less than 20% of the element lies in the scanned area
  - ``not_seen``: inside the scanned area but coverage < 20% or < 20 points
    (not built, hidden, or moved further than the cutoff)
  - ``ok``: >= 80% of its points within tolerance
  - ``check``: 50-80% within tolerance
  - ``deviates``: < 50% within tolerance
"""

from __future__ import annotations

import numpy as np

from sitecapture.scan import geometry, ifcmesh, pointcloud

STATUSES = ("ok", "check", "deviates", "not_seen", "outside_scan")
MAX_ANALYSIS_POINTS = 3_000_000
MAX_SURFACE_SAMPLES = 2_000_000
SEEN_VOXEL_M = 0.025  # a scan point within ~2.5-8.7 cm counts as "seen"
AREA_VOXEL_M = 0.5  # within ~0.5-1.7 m counts as "in the scanned area"


def surface_samples(verts, faces, face_elem, spacing, rng):
    """Random points on the mesh, about one per ``spacing``^2, with their element."""
    tri = verts[faces].astype(np.float64)
    area = (
        np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
        / 2
    )
    while True:
        expected = area / spacing**2
        if expected.sum() <= MAX_SURFACE_SAMPLES:
            break
        spacing *= 1.4
    # Integer count per face with the fractional part drawn at random.
    count = np.floor(expected).astype(np.int64)
    count += rng.random(len(expected)) < (expected - count)
    face = np.repeat(np.arange(len(faces)), count)
    u = rng.random((len(face), 2))
    flip = u.sum(axis=1) > 1
    u[flip] = 1 - u[flip]
    t = tri[face]
    pts = t[:, 0] + u[:, :1] * (t[:, 1] - t[:, 0]) + u[:, 1:] * (t[:, 2] - t[:, 0])
    return pts, face_elem[face], face, spacing


def _group_quantile(values, groups, n_groups, q):
    out = np.full(n_groups, np.nan)
    if not len(values):
        return out
    order = np.lexsort((values, groups))
    g, v = groups[order], values[order]
    counts = np.bincount(g, minlength=n_groups)
    starts = np.cumsum(counts) - counts
    has = counts > 0
    pos = starts[has] + np.floor(q * (counts[has] - 1)).astype(np.int64)
    out[has] = v[pos]
    return out


def analyse(
    scan_xyz: np.ndarray,
    mesh: dict,
    elements: list[dict],
    T: np.ndarray,
    tolerance_m: float = 0.025,
    cutoff_m: float | None = None,
    viewer_xyz: np.ndarray | None = None,
    seed: int = 0,
) -> dict:
    rng = np.random.default_rng(seed)
    cutoff = float(cutoff_m or max(0.1, 6 * tolerance_m))
    if len(scan_xyz) > MAX_ANALYSIS_POINTS:
        scan_xyz = scan_xyz[
            rng.choice(len(scan_xyz), MAX_ANALYSIS_POINTS, replace=False)
        ]
    pts = geometry.apply(T, scan_xyz)
    index = geometry.MeshIndex(mesh["verts"], mesh["faces"], max_dist=cutoff)
    d, tri, cp = index.query(pts)
    sign = index.signed(pts, cp, tri)
    face_elem = ifcmesh.face_element(elements, len(mesh["faces"]))
    near = np.isfinite(d)
    n_el = len(elements)
    el = face_elem[tri[near]]
    dn = d[near]
    sd = d[near] * sign[near]
    within = dn <= tolerance_m

    n_pts = np.bincount(el, minlength=n_el)
    n_within = np.bincount(el, weights=within, minlength=n_el)
    median = _group_quantile(dn, el, n_el, 0.5)
    p95 = _group_quantile(dn, el, n_el, 0.95)
    signed_median = _group_quantile(sd, el, n_el, 0.5)

    # Coverage and "in the scanned area" from samples on each element's surface.
    samples, sample_el, sample_face, spacing = surface_samples(
        mesh["verts"], mesh["faces"], face_elem, 0.1, rng
    )
    # A sample is "seen" when scan points project onto the surface near it
    # (closest points of scan points within the cutoff), however far off
    # they are, so a wall built out of position still counts as seen.
    seen = geometry.Occupancy(cp[near], SEEN_VOXEL_M).near(samples)
    in_area = geometry.Occupancy(pts, AREA_VOXEL_M).near(samples)
    # Coverage of each element's best-scanned side (faces grouped by the
    # dominant axis of their normal), so a wall scanned from one side still
    # counts as seen, while a missing wall touched only at its junctions does not.
    normals = index.normals[sample_face]
    axis = np.abs(normals).argmax(axis=1)
    side = axis * 2 + (normals[np.arange(len(axis)), axis] > 0)
    group = sample_el * 6 + side
    g_total = np.bincount(group, minlength=n_el * 6).reshape(n_el, 6)
    g_seen = np.bincount(group, weights=seen, minlength=n_el * 6).reshape(n_el, 6)
    n_samples = g_total.sum(axis=1)
    big_side = g_total >= np.maximum(10, 0.05 * n_samples[:, None])
    with np.errstate(invalid="ignore", divide="ignore"):
        side_cov = np.where(big_side, g_seen / g_total, 0.0)
        coverage = side_cov.max(axis=1)
        in_area_frac = (
            np.bincount(sample_el, weights=in_area, minlength=n_el) / n_samples
        )
        within_frac = n_within / n_pts

    out_elements = []
    status_counts = dict.fromkeys(STATUSES, 0)
    for i, e in enumerate(elements):
        cov = float(coverage[i]) if n_samples[i] else 0.0
        area_frac = float(in_area_frac[i]) if n_samples[i] else 0.0
        wf = float(within_frac[i]) if n_pts[i] else 0.0
        if area_frac < 0.2:
            status = "outside_scan"
        elif cov < 0.2 or n_pts[i] < 20:
            status = "not_seen"
        elif wf >= 0.8:
            status = "ok"
        elif wf >= 0.5:
            status = "check"
        else:
            status = "deviates"
        status_counts[status] += 1
        out_elements.append(
            {
                "guid": e["guid"],
                "type": e["type"],
                "name": e["name"],
                "storey": e["storey"],
                "status": status,
                "points": int(n_pts[i]),
                "within_pct": round(100 * wf, 1),
                "median_mm": (
                    None if np.isnan(median[i]) else round(1000 * float(median[i]), 1)
                ),
                "p95_mm": None if np.isnan(p95[i]) else round(1000 * float(p95[i]), 1),
                "signed_median_mm": (
                    None
                    if np.isnan(signed_median[i])
                    else round(1000 * float(signed_median[i]), 1)
                ),
                "coverage_pct": round(100 * cov, 1),
                "in_scan_pct": round(100 * area_frac, 1),
            }
        )

    edges = [0, tolerance_m / 2, tolerance_m, 2 * tolerance_m, cutoff]
    hist = np.histogram(dn, bins=edges)[0] if len(dn) else np.zeros(4, int)
    summary = {
        "tolerance_mm": round(1000 * tolerance_m, 1),
        "cutoff_mm": round(1000 * cutoff, 1),
        "points_analysed": int(len(pts)),
        "near_model_pct": round(100 * float(near.mean()), 1),
        "not_in_model_pct": round(100 * float((~near).mean()), 1),
        "within_tolerance_pct": (
            round(100 * float(within.mean()), 1) if len(dn) else 0.0
        ),
        "rms_mm": round(1000 * float(np.sqrt((dn**2).mean())), 1) if len(dn) else None,
        "histogram": [
            {
                "from_mm": round(1000 * a, 1),
                "to_mm": round(1000 * b, 1),
                "points": int(n),
            }
            for a, b, n in zip(edges[:-1], edges[1:], hist)
        ],
        "status_counts": status_counts,
        "elements": n_el,
        "coverage_sample_spacing_m": round(spacing, 3),
    }
    result = {"summary": summary, "elements": out_elements}
    if viewer_xyz is not None:
        vp = geometry.apply(T, viewer_xyz)
        vd, vt, vcp = index.query(vp)
        vs = index.signed(vp, vcp, vt)
        dev = np.full(len(vd), np.nan, dtype="<f4")
        ok = np.isfinite(vd)
        dev[ok] = vd[ok] * vs[ok]
        result["viewer_deviation"] = dev
    return result


def by_type(elements: list[dict]) -> list[dict]:
    """Status counts per IFC type, for reports."""
    rows: dict[str, dict] = {}
    for e in elements:
        r = rows.setdefault(
            e["type"], {"type": e["type"], "total": 0, **dict.fromkeys(STATUSES, 0)}
        )
        r["total"] += 1
        r[e["status"]] += 1
    return sorted(rows.values(), key=lambda r: -r["total"])
