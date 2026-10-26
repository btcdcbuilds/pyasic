"""As-built checks: point cloud readers, alignment, deviation, API."""

import struct

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scan_fixtures import fake_scan, make_ifc, rot_z

from sitecapture.scan import deviation, geometry, ifcmesh, pointcloud

RNG = np.random.default_rng(7)
PTS = RNG.uniform([-3, -2, 0], [5, 4, 3], size=(5000, 3)) + [512000.0, 6960000.0, 20.0]
RGB = RNG.integers(0, 256, size=(5000, 3)).astype(np.uint8)


def write_ply(path, xyz, rgb, binary=True):
    header = (
        "ply\nformat {} 1.0\ncomment test\nelement vertex {}\n"
        "property double x\nproperty double y\nproperty double z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n"
    ).format("binary_little_endian" if binary else "ascii", len(xyz))
    with open(path, "wb") as f:
        f.write(header.encode())
        if binary:
            rec = np.zeros(
                len(xyz),
                dtype=[
                    ("x", "<f8"),
                    ("y", "<f8"),
                    ("z", "<f8"),
                    ("r", "u1"),
                    ("g", "u1"),
                    ("b", "u1"),
                ],
            )
            rec["x"], rec["y"], rec["z"] = xyz.T
            rec["r"], rec["g"], rec["b"] = rgb.T
            f.write(rec.tobytes())
        else:
            for p, c in zip(xyz, rgb):
                f.write(
                    f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {c[0]} {c[1]} {c[2]}\n".encode()
                )
    return path


def write_las(path, xyz, rgb, scale=0.001):
    """Minimal LAS 1.2, point format 2 (xyz + rgb)."""
    offset = np.floor(xyz.min(axis=0))
    head = bytearray(227)
    head[0:4] = b"LASF"
    head[24], head[25] = 1, 2
    struct.pack_into("<H", head, 94, 227)
    struct.pack_into("<I", head, 96, 227)
    head[104] = 2
    struct.pack_into("<H", head, 105, 26)
    struct.pack_into("<I", head, 107, len(xyz))
    struct.pack_into("<3d", head, 131, scale, scale, scale)
    struct.pack_into("<3d", head, 155, *offset)
    rec = np.zeros(
        len(xyz), dtype=[("xyz", "<i4", 3), ("rest", "u1", 8), ("rgb", "<u2", 3)]
    )
    rec["xyz"] = np.round((xyz - offset) / scale).astype(np.int32)
    rec["rgb"] = rgb.astype(np.uint16) * 257
    with open(path, "wb") as f:
        f.write(head)
        f.write(rec.tobytes())
    return path


def check_cloud(cloud, tol=0.002, color=True):
    got = cloud.xyz.astype(np.float64) + cloud.origin
    assert cloud.raw_points == len(PTS)
    assert len(got) == len(PTS)  # voxel tiny, nothing merged
    # Match each point read back to its nearest original.
    match = np.array([np.argmin(((PTS - g) ** 2).sum(axis=1)) for g in got])
    assert len(set(match)) == len(PTS)
    assert np.abs(got - PTS[match]).max() < tol
    if color:
        assert cloud.has_color
        assert (cloud.rgb == RGB[match]).all()


@pytest.mark.parametrize("binary", [True, False])
def test_ply(tmp_path, binary):
    path = write_ply(tmp_path / "a.ply", PTS, RGB, binary)
    check_cloud(
        pointcloud.load(path, voxel_m=1e-4), tol=1e-3 if binary else 2e-4 + 1e-3
    )


def test_las_and_text(tmp_path):
    check_cloud(pointcloud.load(write_las(tmp_path / "a.las", PTS, RGB), voxel_m=1e-4))
    with open(tmp_path / "a.pts", "w") as f:
        f.write(f"{len(PTS)}\n")
        for p, c in zip(PTS, RGB):
            f.write(f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} 0.5 {c[0]} {c[1]} {c[2]}\n")
    check_cloud(pointcloud.load(tmp_path / "a.pts", voxel_m=1e-4))
    np.savetxt(
        tmp_path / "b.csv", PTS, delimiter=",", fmt="%.4f", header="x,y,z", comments=""
    )
    check_cloud(pointcloud.load(tmp_path / "b.csv", voxel_m=1e-4), color=False)


def test_laz_and_e57(tmp_path):
    laspy = pytest.importorskip("laspy")
    pye57 = pytest.importorskip("pye57")
    las = laspy.create(point_format=2, file_version="1.2")
    las.header.offsets = np.floor(PTS.min(axis=0))
    las.header.scales = [0.001] * 3
    las.x, las.y, las.z = PTS.T
    las.red, las.green, las.blue = (RGB.astype(np.uint16) * 257).T
    try:
        las.write(str(tmp_path / "a.laz"))
    except Exception:  # noqa: BLE001 - no LAZ backend installed
        pytest.skip("laspy has no LAZ backend")
    check_cloud(pointcloud.load(tmp_path / "a.laz", voxel_m=1e-4))
    # Like a scanner: points in the scanner's frame plus the scan pose
    # (rotated 90 degrees about Z, at survey coordinates).
    station = np.floor(PTS.mean(axis=0))
    R = rot_z(90)[:3, :3]
    local = (PTS - station) @ R  # inverse rotation
    e57 = pye57.E57(str(tmp_path / "a.e57"), mode="w")
    e57.write_scan_raw(
        {
            "cartesianX": local[:, 0],
            "cartesianY": local[:, 1],
            "cartesianZ": local[:, 2],
            "colorRed": RGB[:, 0],
            "colorGreen": RGB[:, 1],
            "colorBlue": RGB[:, 2],
        },
        rotation=np.array([np.cos(np.pi / 4), 0, 0, np.sin(np.pi / 4)]),  # w, x, y, z
        translation=station,
    )
    e57.close()
    check_cloud(pointcloud.load(tmp_path / "a.e57", voxel_m=1e-4), tol=1e-5)


def test_downsample_caps_points(tmp_path):
    path = write_ply(tmp_path / "a.ply", PTS, RGB)
    cloud = pointcloud.load(path, voxel_m=1e-4, max_points=1000)
    assert len(cloud.xyz) <= 1000 and cloud.voxel_m > 1e-4


@pytest.fixture(scope="module")
def building(tmp_path_factory):
    path = make_ifc(tmp_path_factory.mktemp("ifc") / "room.ifc")
    return path, ifcmesh.tessellate(path)


def test_ifc_units_are_metres(tmp_path, building):
    _, mesh = building
    mm = ifcmesh.tessellate(make_ifc(tmp_path / "mm.ifc", length_unit_mm=True))
    assert ifcmesh.meta(mm)["bounds"] == ifcmesh.meta(mesh)["bounds"]
    size = (
        np.array(ifcmesh.meta(mesh)["bounds"]["max"])
        - ifcmesh.meta(mesh)["bounds"]["min"]
    )
    assert np.allclose(
        size, [8.0, 6.0, 3.0], atol=0.01
    )  # walls built inward from the 8 x 6 m outline


def _scan_and_truth(mesh, scale=1.0, defects=True):
    pose = rot_z(25)
    pose[:3, 3] = [100, 200, 5]
    world = fake_scan(mesh, mesh["elements"], pose, defects=defects)
    origin = np.floor(world.min(axis=0))
    scan = ((world - origin) * scale).astype(np.float32)
    A = np.diag([1 / scale] * 3 + [1.0])
    B = np.eye(4)
    B[:3, 3] = origin
    C = np.eye(4)
    C[:3, 3] = -mesh["origin"]
    truth = C @ pose @ B @ A  # scan local -> model local
    corners = np.array([[0, 0, 3], [8, 0, 3], [8, 6, 0], [0, 6, 3]]) - mesh["origin"]
    picked = geometry.apply(np.linalg.inv(truth), corners) + RNG.normal(
        scale=0.03 * scale, size=(4, 3)
    )
    return (
        scan,
        truth,
        [[list(map(float, s)), list(map(float, m))] for s, m in zip(picked, corners)],
    )


def _fit(mesh, scan, pairs, metric):
    T0 = geometry.umeyama(
        np.array([p[0] for p in pairs]),
        np.array([p[1] for p in pairs]),
        with_scale=not metric,
    )
    index = geometry.MeshIndex(mesh["verts"], mesh["faces"], max_dist=0.5)
    sub = scan[np.random.default_rng(0).choice(len(scan), 30000, replace=False)]
    return geometry.icp(sub, index, T0, with_scale=not metric)[0]


def _err(T, truth):
    probe = geometry.apply(
        np.linalg.inv(truth), np.array([[1, 1, 1], [5, 3, 2], [7, 5, 0.5]])
    )
    return np.abs(geometry.apply(T, probe) - geometry.apply(truth, probe)).max()


def test_alignment_and_statuses(building):
    _, mesh = building
    scan, truth, pairs = _scan_and_truth(mesh)
    T = _fit(mesh, scan, pairs, metric=True)
    assert _err(T, truth) < 0.003  # picked points were off by ~3 cm
    res = deviation.analyse(scan, mesh, mesh["elements"], T, tolerance_m=0.025)
    status = {e["name"]: e for e in res["elements"]}
    assert status["North"]["status"] == "not_seen"  # removed from the scan
    assert status["East"]["status"] == "deviates"  # built 60 mm out
    assert 50 < status["East"]["median_mm"] < 70
    for name in ("South", "West", "Floor"):
        assert status[name]["status"] == "ok", status[name]
        assert status[name]["median_mm"] < 4  # 3 mm scanner noise
    assert 0.5 < res["summary"]["not_in_model_pct"] < 3  # the pallet


def test_alignment_recovers_unknown_scale(building):
    """Photo-derived clouds have arbitrary scale; ICP solves for it.

    Only on a correctly built room: with defects, a scale error can explain a
    displaced wall as well as the displacement can (see the UI warning).
    """
    _, mesh = building
    scan, truth, pairs = _scan_and_truth(mesh, scale=0.37, defects=False)
    T = _fit(mesh, scan, pairs, metric=False)
    assert _err(T, truth) < 0.003
    assert abs(geometry.scale_of(T) - 1 / 0.37) < 1e-3


def _upload(c, project_id, data, filename):
    up = c.post(
        f"/api/projects/{project_id}/uploads",
        json={"filename": filename, "size": len(data)},
    ).json()
    assert "id" in up, up
    offset = 0
    while offset < len(data):
        r = c.put(
            f"/api/uploads/{up['id']}?offset={offset}",
            content=data[offset : offset + up["chunk_size"]],
        )
        assert r.status_code == 200, r.text
        offset = r.json()["received"]
    return up["id"]


def test_api_flow(client, settings, building, tmp_path, monkeypatch):
    ifc_path, mesh = building
    pid = client.post("/api/projects", json={"name": "Warehouse"}).json()["id"]
    with open(ifc_path, "rb") as f:
        r = client.post(f"/api/projects/{pid}/bim", files={"file": ("room.ifc", f)})
    assert r.status_code == 201, r.text
    bim_id = r.json()["id"]

    scan_xyz, truth, pairs = _scan_and_truth(mesh)
    world = scan_xyz.astype(np.float64) + [
        100,
        200,
        0,
    ]  # any offset; origin is re-derived
    ply = write_ply(
        tmp_path / "site.ply", world, np.full((len(world), 3), 180, np.uint8)
    )
    upload_id = _upload(client, pid, ply.read_bytes(), "site.ply")
    # A point cloud can't be used as a 360 walk.
    r = client.post(
        f"/api/projects/{pid}/captures/from-uploads", json={"upload_ids": [upload_id]}
    )
    assert r.status_code == 400
    r = client.post(
        f"/api/projects/{pid}/scans",
        json={"upload_id": upload_id, "name": "Level 1 scan"},
    )
    assert r.status_code == 201, r.text
    scan = client.get(f"/api/scans/{r.json()['id']}").json()
    assert scan["status"] == "ready", scan
    assert scan["metric"] and scan["points"] > 100000
    raw = client.get(scan["points_url"]).content
    n = struct.unpack("<I", raw[:4])[0]
    assert n == scan["viewer_points"] and len(raw) == 4 + 15 * n

    meta = client.get(f"/api/bim/{bim_id}/mesh").json()
    assert len(meta["elements"]) == 5
    mesh_bin = client.get(meta["mesh_url"]).content
    nv, nf = struct.unpack("<II", mesh_bin[:8])
    assert len(mesh_bin) == 8 + 12 * nv + 12 * nf

    # Picked pairs are in each one's local coordinates: move the scan side
    # from the fixture's frame to this upload's origin.
    local_pairs = [
        [list(np.array(s) + [100, 200, 0] - scan["origin"]), m] for s, m in pairs
    ]
    r = client.post(
        f"/api/scans/{scan['id']}/checks",
        json={"bim_model_id": bim_id, "pairs": local_pairs[:2]},
    )
    assert r.status_code == 400  # need 3+
    r = client.post(
        f"/api/scans/{scan['id']}/checks",
        json={"bim_model_id": bim_id, "pairs": local_pairs, "tolerance_mm": 25},
    )
    assert r.status_code == 201, r.text
    check = client.get(f"/api/checks/{r.json()['id']}").json()
    assert check["status"] == "ready", check["error"]
    assert check["alignment"]["rms_mm"] < 5
    assert max(check["alignment"]["pair_errors_mm"]) < 80
    by_name = {e["name"]: e["status"] for e in check["elements"]}
    assert by_name == {
        "North": "not_seen",
        "East": "deviates",
        "South": "ok",
        "West": "ok",
        "Floor": "ok",
    }
    dev = client.get(check["deviation_url"]).content
    assert len(dev) == 4 * scan["viewer_points"]

    # Issues pinned in 3D.
    east = next(e for e in check["elements"] if e["name"] == "East")
    r = client.post(
        f"/api/checks/{check['id']}/annotations",
        json={
            "position": [8.1, 3, 1.5],
            "element_guid": east["guid"],
            "category": "defect",
            "title": "East wall 60 mm out",
            "visible_to_client": True,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["check_id"] == check["id"] and r.json()["frame_id"] is None
    client.post(
        f"/api/checks/{check['id']}/annotations",
        json={
            "position": [4, 6, 1.5],
            "category": "note",
            "title": "Internal: confirm North wall",
        },
    )
    assert len(client.get(f"/api/projects/{pid}/annotations").json()) == 2

    # Report: tables are computed; Opus only adds commentary (mocked here).
    from sitecapture.ai import asbuilt

    seen = {}

    def fake_ask_json(content, schema, system, **kw):
        seen["facts"] = content[0]["text"]
        return {
            "overview": "Two walls need attention.",
            "priorities": [
                {
                    "element": "East",
                    "finding": "median 59 mm",
                    "action": "Survey and confirm",
                }
            ],
            "limitations": ["Scan from inside only."],
        }

    monkeypatch.setattr(asbuilt, "ask_json", fake_ask_json)
    r = client.post(f"/api/checks/{check['id']}/report")
    assert r.status_code == 200, r.text
    md = r.json()["report_markdown"]
    assert (
        "| Tolerance | 25.0 mm |" in md
        and "East" in md
        and "Two walls need attention." in md
    )
    assert '"status": "deviates"' in seen["facts"]
    assert client.get(f"/api/checks/{check['id']}/report.pdf").status_code == 200

    # Clients: read-only, and only shared issues.
    r = client.post(
        "/api/users",
        json={
            "email": "c@example.com",
            "name": "C",
            "password": "client password 1",
            "role": "client",
        },
    )
    cid = r.json()["id"]
    from sitecapture.api.app import create_app

    with TestClient(create_app(settings)) as c:
        c.post(
            "/api/auth/login",
            json={"email": "c@example.com", "password": "client password 1"},
        )
        assert c.get(f"/api/checks/{check['id']}").status_code == 404
        client.post(f"/api/projects/{pid}/members", json={"user_id": cid})
        assert c.get(f"/api/checks/{check['id']}").json()["status"] == "ready"
        assert len(c.get(f"/api/checks/{check['id']}/annotations").json()) == 1
        assert (
            c.post(
                f"/api/scans/{scan['id']}/checks", json={"bim_model_id": bim_id}
            ).status_code
            == 403
        )
        assert c.post(f"/api/checks/{check['id']}/report").status_code == 403

    # Without picked points the scan is assumed to share the model's
    # coordinates; this one doesn't, so the check fails cleanly.
    r = client.post(f"/api/scans/{scan['id']}/checks", json={"bim_model_id": bim_id})
    assert client.get(f"/api/checks/{r.json()['id']}").json()["status"] == "failed"
    assert client.delete(f"/api/scans/{scan['id']}").json() == {"ok": True}
