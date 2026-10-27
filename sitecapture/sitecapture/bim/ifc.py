"""IFC model import (open standard; exported by Revit, ArchiCAD, Tekla...).

Requires the optional ``ifcopenshell`` dependency (``pip install .[bim]``).
"""

from __future__ import annotations

from pathlib import Path

ELEMENT_TYPES = [
    "IfcWall",
    "IfcSlab",
    "IfcColumn",
    "IfcBeam",
    "IfcDoor",
    "IfcWindow",
    "IfcStair",
    "IfcRoof",
    "IfcCovering",
    "IfcFlowSegment",
]


def summarize(path: Path) -> dict:
    """Schema, project name, storeys and element counts of an IFC file."""
    import ifcopenshell

    model = ifcopenshell.open(str(path))
    projects = model.by_type("IfcProject")
    storeys = []
    for storey in model.by_type("IfcBuildingStorey"):
        storeys.append(
            {
                "global_id": storey.GlobalId,
                "name": storey.Name,
                "elevation": (
                    float(storey.Elevation) if storey.Elevation is not None else None
                ),
            }
        )
    storeys.sort(key=lambda s: (s["elevation"] is None, s["elevation"] or 0.0))
    counts = {}
    for ifc_type in ELEMENT_TYPES:
        try:
            n = len(model.by_type(ifc_type))
        except RuntimeError:  # type not in this schema version
            continue
        if n:
            counts[ifc_type] = n
    return {
        "schema": model.schema,
        "project": projects[0].Name if projects else None,
        "storeys": storeys,
        "element_counts": counts,
    }
