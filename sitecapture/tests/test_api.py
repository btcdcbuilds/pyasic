import json

import pytest
from fastapi.testclient import TestClient

from sitecapture.config import Settings
from sitecapture.gpu import orchestrator
from sitecapture.gpu.base import GpuProvider, Launched


class FakeProvider(GpuProvider):
    name = "fake"

    def __init__(self):
        self.launched, self.terminated = [], []

    def launch(self, spec, max_hourly_usd):
        self.launched.append(spec)
        return Launched("inst-1", 0.5)

    def status(self, instance_id):
        return "running"

    def terminate(self, instance_id):
        self.terminated.append(instance_id)


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENSFM_BIN", raising=False)
    return Settings(data_dir=tmp_path / "data", gpu_provider="local")


@pytest.fixture
def client(settings):
    from sitecapture.api.app import create_app

    with TestClient(create_app(settings)) as c:
        yield c


def _setup(client, plan_pdf, equirect_video, when="2026-09-01T08:00:00Z"):
    pid = client.post("/api/projects", json={"name": "Block A"}).json()["id"]
    with plan_pdf.open("rb") as f:
        drawings = client.post(
            f"/api/projects/{pid}/drawings",
            files={"file": ("level1.pdf", f, "application/pdf")},
        ).json()
    did = drawings[0]["id"]
    cid = _upload(client, pid, did, equirect_video, when)
    return pid, did, cid


def _upload(client, pid, did, video, when):
    with video.open("rb") as f:
        r = client.post(
            f"/api/projects/{pid}/captures",
            files=[("files", ("walk.mp4", f, "video/mp4"))],
            data={"drawing_id": str(did), "captured_at": when},
        )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_full_local_flow(client, plan_pdf, equirect_video):
    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    project = client.get(f"/api/projects/{pid}").json()
    assert len(project["drawings"]) == 2  # one per PDF page

    cap = client.get(f"/api/captures/{cid}").json()
    assert cap["frame_count"] == 3 and cap["placed_count"] == 0
    assert cap["jobs"][0]["status"] == "skipped"  # OpenSfM not installed in tests

    r = client.put(
        f"/api/captures/{cid}/control-points",
        json=[
            {"frame_index": 0, "x": 0.2, "y": 0.2},
            {"frame_index": 2, "x": 0.4, "y": 0.2},
        ],
    )
    cap = r.json()
    assert cap["placed_count"] == 3 and cap["status"] == "positioned"
    assert cap["frames"][1]["x"] == pytest.approx(0.3)

    # Second walk a week later, same route.
    cid2 = _upload(client, pid, did, equirect_video, "2026-09-08T08:00:00Z")
    client.put(
        f"/api/captures/{cid2}/control-points",
        json=[
            {"frame_index": 0, "x": 0.2, "y": 0.21},
            {"frame_index": 2, "x": 0.4, "y": 0.21},
        ],
    )

    tl = client.get(
        f"/api/projects/{pid}/timeline", params={"drawing_id": did, "x": 0.3, "y": 0.2}
    ).json()
    assert [e["capture_id"] for e in tl] == [cid, cid2]
    assert client.get(tl[0]["image_url"]).status_code == 200

    r = client.post(
        f"/api/projects/{pid}/timelapse", json={"drawing_id": did, "x": 0.3, "y": 0.2}
    )
    assert (
        r.status_code == 200
        and r.headers["content-type"] == "video/mp4"
        and len(r.content) > 0
    )


def test_rejects_non_360_and_bad_inputs(client, plan_pdf, equirect_video, flat_video):
    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    with flat_video.open("rb") as f:
        r = client.post(
            f"/api/projects/{pid}/captures",
            files=[("files", ("p.mp4", f, "video/mp4"))],
        )
    assert r.status_code == 400 and "equirectangular" in r.json()["detail"]
    r = client.put(
        f"/api/captures/{cid}/control-points",
        json=[{"frame_index": 99, "x": 0.1, "y": 0.1}],
    )
    assert r.status_code == 400
    r = client.post(
        f"/api/projects/{pid}/drawings",
        files={"file": ("x.pdf", b"not a pdf", "application/pdf")},
    )
    assert r.status_code == 400


def test_gpu_job_callbacks_terminate_instance(
    client, settings, plan_pdf, equirect_video, monkeypatch, tmp_path
):
    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    fake = FakeProvider()
    monkeypatch.setattr(orchestrator, "get_provider", lambda s: fake)

    job = client.post(f"/api/captures/{cid}/reconstruct").json()
    assert job["status"] == "running" and job["instance_id"] == "inst-1"
    token = fake.launched[0].env["SITECAPTURE_JOB_TOKEN"]
    assert fake.launched[0].env["SITECAPTURE_JOB_ID"] == str(job["id"])

    assert (
        client.get(
            f"/api/worker/jobs/{job['id']}", headers={"X-Job-Token": "wrong"}
        ).status_code
        == 403
    )
    manifest = client.get(
        f"/api/worker/jobs/{job['id']}", headers={"X-Job-Token": token}
    ).json()
    assert len(manifest["frames"]) == 3
    img = client.get(manifest["frames"][0]["url"], headers={"X-Job-Token": token})
    assert img.status_code == 200 and len(img.content) > 0

    # Worker reports an L-shaped path and a point cloud.
    traj = {"0": [0, 0], "1": [2, 0], "2": [2, 2]}
    r = client.post(
        f"/api/worker/jobs/{job['id']}/result",
        headers={"X-Job-Token": token},
        data={"trajectory": json.dumps(traj)},
        files={
            "model": (
                "model.ply",
                b"ply\nformat ascii 1.0\nend_header\n",
                "application/octet-stream",
            )
        },
    )
    assert r.json()["status"] == "succeeded"
    assert fake.terminated == ["inst-1"]

    cap = client.get(f"/api/captures/{cid}").json()
    assert cap["quality"] == 1.0 and cap["has_model"]
    # Two control points on the path's ends: middle frame follows the corner.
    cap = client.put(
        f"/api/captures/{cid}/control-points",
        json=[
            {"frame_index": 0, "x": 0.1, "y": 0.1},
            {"frame_index": 2, "x": 0.3, "y": 0.3},
        ],
    ).json()
    assert cap["alignment_rms"] == pytest.approx(0.0, abs=1e-9)
    mid = cap["frames"][1]
    assert (round(mid["x"], 6), round(mid["y"], 6)) in {(0.3, 0.1), (0.1, 0.3)}

    models = client.get(f"/api/projects/{pid}/models").json()
    assert models[0]["format"] == "ply"
    assert client.get(models[0]["url"]).content.startswith(b"ply")

    # Job is finished: further callbacks are refused.
    assert (
        client.get(
            f"/api/worker/jobs/{job['id']}", headers={"X-Job-Token": token}
        ).status_code
        == 409
    )


def test_worker_failure_releases_gpu(client, plan_pdf, equirect_video, monkeypatch):
    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    fake = FakeProvider()
    monkeypatch.setattr(orchestrator, "get_provider", lambda s: fake)
    job = client.post(f"/api/captures/{cid}/reconstruct").json()
    token = fake.launched[0].env["SITECAPTURE_JOB_TOKEN"]
    r = client.post(
        f"/api/worker/jobs/{job['id']}/fail",
        headers={"X-Job-Token": token},
        json={"reason": "boom"},
    )
    assert r.json()["status"] == "failed" and "boom" in r.json()["log"]
    assert fake.terminated == ["inst-1"]


def test_ifc_upload(client, tmp_path):
    ifcopenshell = pytest.importorskip("ifcopenshell")
    import ifcopenshell.guid

    model = ifcopenshell.file(schema="IFC4")
    model.createIfcProject(ifcopenshell.guid.new(), Name="Block A")
    for name, elev in (("Level 2", 3.5), ("Level 1", 0.0)):
        model.createIfcBuildingStorey(
            ifcopenshell.guid.new(), Name=name, Elevation=elev
        )
    for _ in range(3):
        model.createIfcWall(ifcopenshell.guid.new())
    path = tmp_path / "a.ifc"
    model.write(str(path))

    pid = client.post("/api/projects", json={"name": "P"}).json()["id"]
    with path.open("rb") as f:
        r = client.post(
            f"/api/projects/{pid}/bim",
            files={"file": ("a.ifc", f, "application/octet-stream")},
        )
    summary = r.json()["summary"]
    assert summary["project"] == "Block A"
    assert [s["name"] for s in summary["storeys"]] == ["Level 1", "Level 2"]
    assert summary["element_counts"] == {"IfcWall": 3}
