"""Structure-from-motion for 360 walks, using OpenSfM.

OpenSfM supports equirectangular ("spherical") cameras directly, which avoids
cutting each frame into cube faces. This module runs on the GPU worker; the
API server only needs :func:`load_trajectory` / :func:`ground_plane`.

The OpenSfM commands used are the standard pipeline stages
(extract_metadata ... reconstruct, then undistort/compute_depthmaps for a
dense point cloud). Pin the OpenSfM version in the worker image.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Mapping

import numpy as np

SPARSE_STEPS = [
    "extract_metadata",
    "detect_features",
    "match_features",
    "create_tracks",
    "reconstruct",
]
DENSE_STEPS = ["undistort", "compute_depthmaps"]

_FRAME_RE = re.compile(r"frame_(\d+)")


def prepare_dataset(frames: list[Path], dataset: Path) -> Path:
    images = dataset / "images"
    images.mkdir(parents=True, exist_ok=True)
    for frame in frames:
        shutil.copyfile(frame, images / frame.name)
    (dataset / "camera_models_overrides.json").write_text(
        json.dumps({"all": {"projection_type": "spherical"}})
    )
    # Frames come from a continuous walk, so only match each frame with its
    # neighbours in time instead of every pair (quadratic in frame count).
    (dataset / "config.yaml").write_text(
        "processes: 8\n" "matching_order_neighbors: 20\n" "feature_process_size: 2048\n"
    )
    return dataset


def run_opensfm(dataset: Path, dense: bool = True, log=print) -> Path:
    binary = os.environ.get("OPENSFM_BIN", "opensfm")
    for step in SPARSE_STEPS + (DENSE_STEPS if dense else []):
        log(f"opensfm {step}")
        subprocess.run([binary, step, str(dataset)], check=True)
    return dataset / "reconstruction.json"


def _rodrigues(rvec: np.ndarray) -> np.ndarray:
    theta = float(np.linalg.norm(rvec))
    if theta < 1e-12:
        return np.eye(3)
    k = rvec / theta
    kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(theta) * kx + (1 - np.cos(theta)) * kx @ kx


def frame_index_from_name(name: str) -> int | None:
    match = _FRAME_RE.search(name)
    return int(match.group(1)) if match else None


def load_trajectory(reconstruction_json: Path) -> dict[int, np.ndarray]:
    """Camera centres (3D) keyed by frame index, from the largest reconstruction."""
    reconstructions = json.loads(Path(reconstruction_json).read_text())
    if not reconstructions:
        return {}
    largest = max(reconstructions, key=lambda r: len(r.get("shots", {})))
    centres: dict[int, np.ndarray] = {}
    for name, shot in largest["shots"].items():
        index = frame_index_from_name(name)
        if index is None:
            continue
        rotation = _rodrigues(np.asarray(shot["rotation"], float))
        translation = np.asarray(shot["translation"], float)
        centres[index] = -rotation.T @ translation
    return centres


def ground_plane(centres: Mapping[int, np.ndarray]) -> dict[int, tuple[float, float]]:
    """Project camera centres onto the walk's dominant plane.

    A site walk is close to planar, so the two largest principal axes of the
    camera positions span the floor. This avoids depending on which axis the
    reconstruction chose as "up".
    """
    if len(centres) < 3:
        return {i: (float(c[0]), float(c[1])) for i, c in centres.items()}
    keys = list(centres)
    pts = np.stack([centres[k] for k in keys])
    mean = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - mean, full_matrices=False)
    plane = (pts - mean) @ vt[:2].T
    return {k: (float(p[0]), float(p[1])) for k, p in zip(keys, plane)}
