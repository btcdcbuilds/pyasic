"""Place capture frames on a drawing.

Two sources of position:

* **Control points** - the user taps where on the plan a few frames were taken
  (at minimum the start and end of the walk). Frames in between are linearly
  interpolated along the walk, which is accurate for straight runs and a
  reasonable first pass for anything else.
* **Structure-from-motion trajectory** - camera centres from OpenSfM/COLMAP in
  an arbitrary local frame. A 2D similarity transform (scale, rotation,
  translation, optionally mirrored) fitted to the control points maps the whole
  trajectory onto the plan, so frames between control points follow the real
  path instead of a straight line.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np

Point = tuple[float, float]


@dataclass(frozen=True)
class ControlPoint:
    frame_index: int
    x: float
    y: float


@dataclass
class Similarity2D:
    scale: float
    rotation: np.ndarray  # 2x2, may include a reflection
    translation: np.ndarray  # (2,)
    rms_error: float

    def apply(self, points: np.ndarray) -> np.ndarray:
        return self.scale * points @ self.rotation.T + self.translation


def parse_control_points(raw: Sequence[Mapping]) -> list[ControlPoint]:
    points = {
        int(p["frame_index"]): ControlPoint(
            int(p["frame_index"]), float(p["x"]), float(p["y"])
        )
        for p in raw
    }
    return [points[k] for k in sorted(points)]


def interpolate_positions(
    n_frames: int, control_points: Sequence[ControlPoint]
) -> list[Point | None]:
    """Linear interpolation between control points by frame index.

    Frames before the first or after the last control point stay unplaced
    rather than being guessed.
    """
    positions: list[Point | None] = [None] * n_frames
    cps = sorted(control_points, key=lambda c: c.frame_index)
    for cp in cps:
        if 0 <= cp.frame_index < n_frames:
            positions[cp.frame_index] = (cp.x, cp.y)
    for a, b in zip(cps, cps[1:]):
        span = b.frame_index - a.frame_index
        for i in range(max(a.frame_index + 1, 0), min(b.frame_index, n_frames)):
            t = (i - a.frame_index) / span
            positions[i] = (a.x + t * (b.x - a.x), a.y + t * (b.y - a.y))
    return positions


def _umeyama(src: np.ndarray, dst: np.ndarray, allow_reflection: bool) -> Similarity2D:
    mu_s, mu_d = src.mean(axis=0), dst.mean(axis=0)
    s_c, d_c = src - mu_s, dst - mu_d
    var_s = (s_c**2).sum() / len(src)
    if var_s == 0:
        raise ValueError("control points must be at distinct trajectory positions")
    cov = d_c.T @ s_c / len(src)
    u, sig, vt = np.linalg.svd(cov)
    d = np.eye(2)
    if not allow_reflection and np.linalg.det(u) * np.linalg.det(vt) < 0:
        d[1, 1] = -1
    rotation = u @ d @ vt
    scale = float(np.trace(np.diag(sig) @ d) / var_s)
    translation = mu_d - scale * rotation @ mu_s
    fitted = scale * src @ rotation.T + translation
    rms = float(np.sqrt(((fitted - dst) ** 2).sum(axis=1).mean()))
    return Similarity2D(scale, rotation, translation, rms)


def fit_similarity(src: Sequence[Point], dst: Sequence[Point]) -> Similarity2D:
    """Least-squares similarity from ``src`` to ``dst`` (needs >= 2 pairs).

    SfM frames are right-handed while image coordinates have y pointing down,
    so a mirrored fit is also tried. With exactly two points both fits are
    exact; the proper rotation is preferred unless mirroring is clearly
    better.
    """
    src_a, dst_a = np.asarray(src, float), np.asarray(dst, float)
    if len(src_a) < 2 or len(src_a) != len(dst_a):
        raise ValueError("need at least two matching point pairs")
    proper = _umeyama(src_a, dst_a, allow_reflection=False)
    if len(src_a) < 3:
        return proper
    mirrored = _umeyama(src_a, dst_a, allow_reflection=True)
    return mirrored if mirrored.rms_error < proper.rms_error * 0.5 else proper


def positions_from_trajectory(
    n_frames: int,
    trajectory: Mapping[int, Point],
    control_points: Sequence[ControlPoint],
) -> tuple[list[Point | None], Similarity2D | None]:
    """Map an SfM trajectory onto the drawing using the control points.

    Frames the reconstruction did not register fall back to interpolation.
    Returns the positions and the fitted transform (None if it couldn't be
    fitted, in which case everything is interpolated).
    """
    fallback = interpolate_positions(n_frames, control_points)
    usable = [c for c in control_points if c.frame_index in trajectory]
    if len(usable) < 2:
        return fallback, None
    transform = fit_similarity(
        [trajectory[c.frame_index] for c in usable], [(c.x, c.y) for c in usable]
    )
    positions = list(fallback)
    indices = [i for i in trajectory if 0 <= i < n_frames]
    if indices:
        mapped = transform.apply(np.asarray([trajectory[i] for i in indices], float))
        for i, (x, y) in zip(indices, mapped):
            positions[i] = (float(x), float(y))
    for cp in control_points:  # user-placed points always win
        if 0 <= cp.frame_index < n_frames:
            positions[cp.frame_index] = (cp.x, cp.y)
    return positions, transform
