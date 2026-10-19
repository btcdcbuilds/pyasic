import json

import numpy as np
import pytest

from sitecapture.pipeline import alignment, sfm
from sitecapture.pipeline.alignment import ControlPoint


def test_interpolation_between_control_points():
    cps = [
        ControlPoint(0, 0.1, 0.1),
        ControlPoint(4, 0.5, 0.1),
        ControlPoint(8, 0.5, 0.5),
    ]
    pos = alignment.interpolate_positions(10, cps)
    assert pos[0] == (0.1, 0.1)
    assert pos[2] == pytest.approx((0.3, 0.1))
    assert pos[6] == pytest.approx((0.5, 0.3))
    assert pos[9] is None  # after the last control point: not guessed


def test_similarity_recovers_known_transform():
    rng = np.random.default_rng(0)
    src = rng.uniform(-10, 10, size=(6, 2))
    theta = np.radians(37)
    rot = np.array([[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]])
    dst = 0.02 * src @ rot.T + np.array([0.4, 0.6])
    t = alignment.fit_similarity(src, dst)
    assert t.scale == pytest.approx(0.02)
    assert np.allclose(t.rotation, rot)
    assert t.rms_error < 1e-9


def test_similarity_handles_mirrored_axes():
    rng = np.random.default_rng(1)
    src = rng.uniform(-5, 5, size=(5, 2))
    dst = src * np.array([0.05, -0.05]) + 0.5  # y flipped, like image coordinates
    t = alignment.fit_similarity(src, dst)
    assert t.rms_error < 1e-9
    assert np.linalg.det(t.rotation) < 0


def test_trajectory_mapped_onto_plan():
    # An L-shaped walk in SfM units; user places only the start and end.
    traj = {i: (float(i), 0.0) for i in range(5)} | {
        5 + i: (4.0, float(i + 1)) for i in range(4)
    }
    cps = [ControlPoint(0, 0.1, 0.1), ControlPoint(8, 0.5, 0.5)]
    pos, t = alignment.positions_from_trajectory(9, traj, cps)
    assert t is not None
    assert pos[0] == (0.1, 0.1) and pos[8] == (0.5, 0.5)
    # Corner of the L is off the straight start-end line, unlike interpolation.
    straight = alignment.interpolate_positions(9, cps)[4]
    assert np.hypot(pos[4][0] - straight[0], pos[4][1] - straight[1]) > 0.05


def test_load_trajectory_from_opensfm(tmp_path):
    # Camera at centre c has translation t = -R c.
    centres = {
        0: np.array([0.0, 0, 0]),
        1: np.array([1.0, 0, 0]),
        2: np.array([1.0, 2, 0]),
    }
    rvec = np.array([0.0, 0.0, 0.3])
    rot = sfm._rodrigues(rvec)
    shots = {
        f"frame_{i:05d}.jpg": {
            "rotation": rvec.tolist(),
            "translation": (-rot @ c).tolist(),
        }
        for i, c in centres.items()
    }
    recon = tmp_path / "reconstruction.json"
    recon.write_text(
        json.dumps(
            [{"shots": {"frame_00009.jpg": shots["frame_00000.jpg"]}}, {"shots": shots}]
        )
    )
    loaded = sfm.load_trajectory(recon)
    assert set(loaded) == {0, 1, 2}  # largest reconstruction chosen
    for i, c in centres.items():
        assert np.allclose(loaded[i], c)
    plane = sfm.ground_plane(loaded)
    d01 = np.hypot(*np.subtract(plane[1], plane[0]))
    assert d01 == pytest.approx(1.0)  # distances preserved by the projection
