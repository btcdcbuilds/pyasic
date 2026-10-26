"""Background work for as-built checks: import scans, mesh IFC, run checks."""

from __future__ import annotations

import struct
from pathlib import Path

import numpy as np

from sitecapture.db import BimModel, Scan, ScanCheck
from sitecapture.scan import deviation, geometry, ifcmesh, pointcloud

ANALYSIS_VOXEL_M = 0.01
MAX_ANALYSIS_POINTS = 4_000_000
MAX_VIEWER_POINTS = 1_500_000
ICP_POINTS = 40_000
ICP_MAX_DIST_M = 0.5


def read_viewer_bin(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with open(path, "rb") as f:
        (n,) = struct.unpack("<I", f.read(4))
        xyz = np.frombuffer(f.read(12 * n), dtype="<f4").reshape(n, 3)
        rgb = np.frombuffer(f.read(3 * n), dtype=np.uint8).reshape(n, 3)
    return xyz, rgb


def process_scan(storage, scan: Scan) -> None:
    """Read the source file into the analysis cloud and the viewer cloud."""
    src = Path(scan.source_path)
    if not storage.ensure(src):
        raise FileNotFoundError("scan file is missing from storage")
    cloud = pointcloud.load(src, ANALYSIS_VOXEL_M, MAX_ANALYSIS_POINTS)
    out = storage.project_dir(scan.project_id, "scans", str(scan.id))
    cloud_path = out / "cloud.npz"
    pointcloud.save_npz(cloud_path, cloud)
    vxyz, vrgb, _ = pointcloud.thin(
        cloud.xyz, cloud.rgb, MAX_VIEWER_POINTS, cloud.voxel_m
    )
    viewer_path = out / "viewer.bin"
    pointcloud.write_viewer_bin(viewer_path, vxyz, vrgb)
    storage.persist(cloud_path)
    storage.persist(viewer_path)
    scan.raw_points = cloud.raw_points
    scan.points = int(len(cloud.xyz))
    scan.voxel_m = round(cloud.voxel_m, 4)
    scan.viewer_points = int(len(vxyz))
    scan.has_color = cloud.has_color
    scan.origin = [float(v) for v in cloud.origin]
    scan.bounds = pointcloud.bounds(cloud.xyz)
    scan.cloud_path = str(cloud_path)
    scan.viewer_path = str(viewer_path)
    scan.status = "ready"
    scan.error = ""


def ensure_mesh(storage, bim: BimModel) -> dict:
    """Tessellate the IFC once; returns the mesh (verts, faces, origin) and meta."""
    if bim.mesh_path and storage.ensure(Path(bim.mesh_path)):
        return {
            **ifcmesh.load(Path(bim.mesh_path)),
            "elements": bim.mesh_meta["elements"],
        }
    if not bim.path or not storage.ensure(Path(bim.path)):
        raise FileNotFoundError("IFC file is missing from storage")
    mesh = ifcmesh.tessellate(Path(bim.path))
    out = storage.project_dir(bim.project_id, "bim", f"mesh_{bim.id}")
    mesh_path = out / "mesh.npz"
    viewer_path = out / "mesh.bin"
    ifcmesh.save(mesh_path, mesh)
    ifcmesh.write_viewer_bin(viewer_path, mesh)
    storage.persist(mesh_path)
    storage.persist(viewer_path)
    bim.mesh_path = str(mesh_path)
    bim.mesh_viewer_path = str(viewer_path)
    bim.mesh_meta = ifcmesh.meta(mesh)
    return mesh


def initial_transform(scan: Scan, mesh_origin, pairs, metric: bool) -> np.ndarray:
    if pairs:
        src = np.array([p[0] for p in pairs], dtype=np.float64)
        dst = np.array([p[1] for p in pairs], dtype=np.float64)
        return geometry.umeyama(src, dst, with_scale=not metric)
    # No picked points: assume scan and model share coordinates (e.g. both
    # in the site's survey grid), so only the stored origins differ.
    T = np.eye(4)
    T[:3, 3] = np.asarray(scan.origin) - np.asarray(mesh_origin)
    return T


def run_check(storage, check: ScanCheck) -> None:
    scan, bim = check.scan, check.bim_model
    if scan.status != "ready":
        raise ValueError("the scan is not processed yet")
    mesh = ensure_mesh(storage, bim)
    if not storage.ensure(Path(scan.cloud_path)) or not storage.ensure(
        Path(scan.viewer_path)
    ):
        raise FileNotFoundError("scan data is missing from storage")
    xyz, _, _ = pointcloud.load_npz(Path(scan.cloud_path))
    vxyz, _ = read_viewer_bin(Path(scan.viewer_path))
    metric = scan.metric
    T0 = initial_transform(scan, mesh["origin"], check.pairs, metric)
    rng = np.random.default_rng(0)
    sub = (
        xyz
        if len(xyz) <= ICP_POINTS
        else xyz[rng.choice(len(xyz), ICP_POINTS, replace=False)]
    )
    index = geometry.MeshIndex(mesh["verts"], mesh["faces"], max_dist=ICP_MAX_DIST_M)
    T, rms, near, iterations = geometry.icp(sub, index, T0, with_scale=not metric)
    pair_err = None
    if check.pairs:
        src = np.array([p[0] for p in check.pairs], dtype=np.float64)
        dst = np.array([p[1] for p in check.pairs], dtype=np.float64)
        pair_err = [
            round(1000 * float(e), 1)
            for e in np.linalg.norm(geometry.apply(T, src) - dst, axis=1)
        ]
    check.alignment = {
        "method": "picked points + ICP" if check.pairs else "shared coordinates + ICP",
        "rms_mm": round(1000 * rms, 1),
        "near_model_pct": round(100 * near, 1),
        "iterations": iterations,
        "scale": round(geometry.scale_of(T), 5),
        "pair_errors_mm": pair_err,
    }
    result = deviation.analyse(
        xyz, mesh, mesh["elements"], T, tolerance_m=check.tolerance_m, viewer_xyz=vxyz
    )
    out = storage.project_dir(check.project_id, "scans", str(scan.id))
    dev_path = out / f"check_{check.id}.bin"
    with open(dev_path, "wb") as f:
        f.write(result["viewer_deviation"].tobytes())
    storage.persist(dev_path)
    check.transform = [[float(v) for v in row] for row in T]
    check.summary = result["summary"]
    check.elements = result["elements"]
    check.deviation_path = str(dev_path)
    check.status = "ready"
    check.error = ""
