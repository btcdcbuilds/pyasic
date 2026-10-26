"""Synthetic IFC building and scans of it, for as-built check tests."""

from __future__ import annotations

from pathlib import Path

import numpy as np

# name: (x, y, rotation_deg, length) for 0.2 m thick, 3 m high walls.
WALLS = {
    "South": (0.0, 0.0, 0, 8.0),
    "East": (8.0, 0.0, 90, 6.0),
    "North": (8.0, 6.0, 180, 8.0),
    "West": (0.0, 6.0, 270, 6.0),
}


def make_ifc(path: Path, length_unit_mm: bool = False) -> Path:
    import ifcopenshell.api
    from ifcopenshell.api import run

    m = run("project.create_file", version="IFC4")
    project = run("root.create_entity", m, ifc_class="IfcProject", name="Test")
    unit = run(
        "unit.add_si_unit",
        m,
        unit_type="LENGTHUNIT",
        prefix="MILLI" if length_unit_mm else None,
    )
    run("unit.assign_unit", m, units=[unit])
    k = 1000.0 if length_unit_mm else 1.0
    ctx = run("context.add_context", m, context_type="Model")
    body = run(
        "context.add_context",
        m,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=ctx,
    )
    site = run("root.create_entity", m, ifc_class="IfcSite")
    run("aggregate.assign_object", m, relating_object=project, products=[site])
    building = run("root.create_entity", m, ifc_class="IfcBuilding")
    run("aggregate.assign_object", m, relating_object=site, products=[building])
    storey = run("root.create_entity", m, ifc_class="IfcBuildingStorey", name="Ground")
    run("aggregate.assign_object", m, relating_object=building, products=[storey])
    for name, (x, y, rot, length) in WALLS.items():
        wall = run("root.create_entity", m, ifc_class="IfcWall", name=name)
        rep = run(
            "geometry.add_wall_representation",
            m,
            context=body,
            length=length * k,
            height=3.0 * k,
            thickness=0.2 * k,
        )
        run("geometry.assign_representation", m, product=wall, representation=rep)
        a = np.radians(rot)
        M = np.eye(4)
        M[:2, :2] = [[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]
        M[:3, 3] = [x * k, y * k, 0]
        run("geometry.edit_object_placement", m, product=wall, matrix=M)
        run("spatial.assign_container", m, relating_structure=storey, products=[wall])
    slab = run("root.create_entity", m, ifc_class="IfcSlab", name="Floor")
    rep = run(
        "geometry.add_slab_representation",
        m,
        context=body,
        depth=0.2 * k,
        polyline=[(0, 0), (8 * k, 0), (8 * k, 6 * k), (0, 6 * k)],
    )
    run("geometry.assign_representation", m, product=slab, representation=rep)
    M = np.eye(4)
    M[2, 3] = 0.0
    run("geometry.edit_object_placement", m, product=slab, matrix=M)
    run("spatial.assign_container", m, relating_structure=storey, products=[slab])
    m.write(str(path))
    return path


def rot_z(deg: float) -> np.ndarray:
    a = np.radians(deg)
    T = np.eye(4)
    T[:2, :2] = [[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]
    return T


def fake_scan(
    mesh: dict,
    elements: list[dict],
    scan_to_world: np.ndarray,
    seed: int = 1,
    defects: bool = True,
):
    """Points on the model surfaces as built: North wall missing, East wall 60 mm out
    (``defects=False``: everything built as designed).

    Returns world-frame points (float64) and the element names by type, so
    tests can check statuses. ``scan_to_world`` is the scanner's pose: points
    are returned in scanner coordinates (inverse applied).
    """
    from sitecapture.scan import deviation, ifcmesh

    rng = np.random.default_rng(seed)
    verts = mesh["verts"].astype(np.float64) + mesh["origin"]
    face_elem = ifcmesh.face_element(elements, len(mesh["faces"]))
    pts, el, _, _ = deviation.surface_samples(
        verts, mesh["faces"], face_elem, 0.03, rng
    )
    names = np.array([e["name"] for e in elements])
    if defects:
        keep = names[el] != "North"
        pts, el = pts[keep], el[keep]
        east = names[el] == "East"
        pts[east, 0] += 0.06
    # Only faces a scanner inside the room sees: drop points under the slab.
    pts = pts[pts[:, 2] > -0.05]
    pts += rng.normal(scale=0.003, size=pts.shape)
    clutter = rng.uniform([2, 2, 0.2], [3, 3, 1.2], size=(4000, 3))  # a pallet
    pts = np.concatenate([pts, clutter])
    inv = np.linalg.inv(scan_to_world)
    return pts @ inv[:3, :3].T + inv[:3, 3]
