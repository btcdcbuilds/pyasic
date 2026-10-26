"""Tessellate an IFC model into one triangle mesh with per-element ranges.

Uses ifcopenshell's geometry engine in world coordinates. Vertices are
converted from the file's length unit to metres and stored relative to an
``origin`` so large site coordinates keep precision in float32.
"""

from __future__ import annotations

import multiprocessing
import struct
from pathlib import Path

import numpy as np

# Not physical: spaces, openings, zones and annotation helpers.
SKIP_TYPES = {
    "IfcSpace",
    "IfcOpeningElement",
    "IfcVirtualElement",
    "IfcAnnotation",
    "IfcGrid",
    "IfcSite",
}


def tessellate(path: Path) -> dict:
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.element as util
    import ifcopenshell.util.unit

    model = ifcopenshell.open(str(path))
    # Geometry comes back in the file's length unit (e.g. mm); convert to metres.
    to_m = float(ifcopenshell.util.unit.calculate_unit_scale(model))
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    it = ifcopenshell.geom.iterator(
        settings, model, max(1, multiprocessing.cpu_count())
    )
    verts, faces, elements = [], [], []
    n_verts = n_faces = 0
    if it.initialize():
        while True:
            shape = it.get()
            el = model.by_guid(shape.guid)
            ifc_type = el.is_a()
            if ifc_type not in SKIP_TYPES:
                v = (
                    np.asarray(shape.geometry.verts, dtype=np.float64).reshape(-1, 3)
                    * to_m
                )
                f = np.asarray(shape.geometry.faces, dtype=np.int64).reshape(-1, 3)
                if len(v) and len(f):
                    storey = util.get_container(el)
                    elements.append(
                        {
                            "guid": shape.guid,
                            "type": ifc_type,
                            "name": el.Name or "",
                            "storey": getattr(storey, "Name", None) or "",
                            "face_start": n_faces,
                            "face_count": len(f),
                        }
                    )
                    verts.append(v)
                    faces.append(f + n_verts)
                    n_verts += len(v)
                    n_faces += len(f)
            if not it.next():
                break
    if not elements:
        raise ValueError("the IFC file has no 3D geometry")
    v = np.concatenate(verts)
    origin = np.floor(v.min(axis=0))
    return {
        "verts": (v - origin).astype(np.float32),
        "faces": np.concatenate(faces).astype(np.uint32),
        "origin": origin,
        "elements": elements,
        "schema": model.schema,
        "unit_scale": to_m,
    }


def face_element(elements: list[dict], n_faces: int) -> np.ndarray:
    """Element index for every face."""
    out = np.empty(n_faces, dtype=np.int64)
    for i, e in enumerate(elements):
        out[e["face_start"] : e["face_start"] + e["face_count"]] = i
    return out


def save(path: Path, mesh: dict) -> None:
    with open(path, "wb") as f:
        np.savez(f, verts=mesh["verts"], faces=mesh["faces"], origin=mesh["origin"])


def load(path: Path) -> dict:
    with np.load(path) as d:
        return {"verts": d["verts"], "faces": d["faces"], "origin": d["origin"]}


def write_viewer_bin(path: Path, mesh: dict) -> None:
    """``[uint32 nverts][uint32 nfaces][float32 verts][uint32 faces]`` little endian."""
    with open(path, "wb") as f:
        f.write(struct.pack("<II", len(mesh["verts"]), len(mesh["faces"])))
        f.write(np.ascontiguousarray(mesh["verts"], dtype="<f4").tobytes())
        f.write(np.ascontiguousarray(mesh["faces"], dtype="<u4").tobytes())


def meta(mesh: dict) -> dict:
    v = mesh["verts"]
    return {
        "origin": [float(x) for x in mesh["origin"]],
        "vertex_count": int(len(v)),
        "face_count": int(len(mesh["faces"])),
        "bounds": {
            "min": [round(float(x), 4) for x in v.min(axis=0)],
            "max": [round(float(x), 4) for x in v.max(axis=0)],
        },
        "elements": mesh["elements"],
        "schema": mesh.get("schema"),
    }
