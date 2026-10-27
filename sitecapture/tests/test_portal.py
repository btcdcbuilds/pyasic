"""Client access, annotations and design requests."""

import io

import ezdxf
import pytest
from conftest import ADMIN
from fastapi.testclient import TestClient
from test_api import _setup

CLIENT = ("client@example.com", "client password 1")


def login(c, email, password):
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


@pytest.fixture
def client_user(client):
    r = client.post(
        "/api/users",
        json={
            "email": CLIENT[0],
            "name": "Casey Client",
            "password": CLIENT[1],
            "role": "client",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def as_client(settings, client_user):
    from sitecapture.api.app import create_app

    with TestClient(create_app(settings)) as c:
        login(c, *CLIENT)
        yield c


def test_client_sees_only_member_projects_read_only(
    client, as_client, client_user, plan_pdf, equirect_video
):
    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    other = client.post("/api/projects", json={"name": "Someone else"}).json()["id"]

    assert as_client.get("/api/projects").json() == []
    assert as_client.get(f"/api/projects/{pid}").status_code == 404
    client.post(f"/api/projects/{pid}/members", json={"user_id": client_user["id"]})
    assert [p["id"] for p in as_client.get("/api/projects").json()] == [pid]
    assert as_client.get(f"/api/projects/{other}").status_code == 404

    cap = as_client.get(f"/api/captures/{cid}").json()
    assert cap["frame_count"] == 3 and cap["jobs"] == []
    assert as_client.get(cap["frames"][0]["image_url"]).status_code == 200
    assert as_client.get(f"/api/drawings/{did}/image").status_code == 200

    # Read-only: every editing action is refused.
    assert as_client.post("/api/projects", json={"name": "x"}).status_code == 403
    assert (
        as_client.put(f"/api/captures/{cid}/control-points", json=[]).status_code == 403
    )
    assert (
        as_client.post(
            f"/api/projects/{pid}/uploads", json={"filename": "a.mp4", "size": 5}
        ).status_code
        == 403
    )
    assert as_client.post(f"/api/captures/{cid}/report").status_code == 403
    assert as_client.get("/api/users").status_code == 403

    client.delete(f"/api/projects/{pid}/members/{client_user['id']}")
    assert as_client.get(f"/api/captures/{cid}").status_code == 404


def test_annotations_and_client_visibility(
    client, as_client, client_user, plan_pdf, equirect_video
):
    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    client.post(f"/api/projects/{pid}/members", json={"user_id": client_user["id"]})
    frame_id = client.get(f"/api/captures/{cid}").json()["frames"][1]["id"]

    r = client.post(
        f"/api/frames/{frame_id}/annotations",
        json={
            "yaw": 30,
            "pitch": -10,
            "category": "defect",
            "title": "Cracked tile",
            "body": "Replace before handover",
        },
    )
    assert r.status_code == 201, r.text
    internal = r.json()
    assert internal["author"] == "Admin" and not internal["visible_to_client"]
    shared = client.post(
        f"/api/frames/{frame_id}/annotations",
        json={
            "yaw": -45,
            "pitch": 5,
            "category": "progress",
            "title": "Frame complete",
            "visible_to_client": True,
        },
    ).json()
    assert (
        client.post(
            f"/api/frames/{frame_id}/annotations",
            json={"yaw": 0, "pitch": 0, "category": "bogus", "title": "x"},
        ).status_code
        == 400
    )

    assert len(client.get(f"/api/captures/{cid}/annotations").json()) == 2
    seen = as_client.get(f"/api/captures/{cid}/annotations").json()
    assert [a["id"] for a in seen] == [shared["id"]]  # client sees shared only
    assert (
        as_client.post(
            f"/api/frames/{frame_id}/annotations",
            json={"yaw": 0, "pitch": 0, "category": "note", "title": "x"},
        ).status_code
        == 403
    )

    r = client.patch(
        f"/api/annotations/{internal['id']}",
        json={"status": "resolved", "visible_to_client": True},
    )
    assert r.json()["status"] == "resolved"
    assert len(as_client.get(f"/api/projects/{pid}/annotations").json()) == 2
    assert (
        len(
            client.get(
                f"/api/projects/{pid}/annotations", params={"status": "open"}
            ).json()
        )
        == 1
    )
    client.delete(f"/api/annotations/{shared['id']}")
    assert len(client.get(f"/api/captures/{cid}/annotations").json()) == 1


def test_annotation_suggest_uses_claude(client, plan_pdf, equirect_video, monkeypatch):
    from sitecapture.ai import annotate

    pid, did, cid = _setup(client, plan_pdf, equirect_video)
    frame_id = client.get(f"/api/captures/{cid}").json()["frames"][0]["id"]
    seen = {}

    def fake_ask_json(content, schema, system, **kw):
        seen["image"] = any(b["type"] == "image" for b in content)
        seen["note"] = content[-1]["text"]
        assert schema["properties"]["category"]["enum"] == [
            "defect",
            "progress",
            "safety",
            "note",
        ]
        return {
            "category": "safety",
            "title": "  Open edge without guard rail ",
            "body": "Install edge protection.",
        }

    monkeypatch.setattr(annotate, "ask_json", fake_ask_json)
    r = client.post(
        f"/api/frames/{frame_id}/annotations/suggest",
        json={"yaw": 90, "pitch": 10, "note": "edge"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {
        "category": "safety",
        "title": "Open edge without guard rail",
        "body": "Install edge protection.",
    }
    assert seen == {"image": True, "note": "User's rough note: edge"}


def _upload(c, url, data, filename):
    up = c.post(url, json={"filename": filename, "size": len(data)}).json()
    assert "id" in up, up
    r = c.put(f"/api/uploads/{up['id']}?offset=0", content=data)
    assert r.status_code == 200, r.text
    return up["id"]


CONCEPT = {
    "brief_markdown": "## Site summary\n15 x 32 m lot.",
    "questions": ["Is there an easement along the rear boundary?"],
    "concept": {
        "lot": {"width": 15, "depth": 32},
        "setbacks": {"front": 6, "rear": 3, "left": 1, "right": 1},
        "north_deg": 0,
        "levels": [
            {
                "name": "Ground",
                "rooms": [
                    {
                        "name": "Garage",
                        "type": "garage",
                        "x": 1,
                        "y": 6,
                        "width": 6,
                        "depth": 6,
                    },
                    {
                        "name": "Living",
                        "type": "living",
                        "x": 1,
                        "y": 12,
                        "width": 13,
                        "depth": 8,
                    },
                ],
            }
        ],
        "notes": ["Living faces north."],
    },
}


def test_design_request_flow(client, as_client, client_user, plan_pdf, monkeypatch):
    from sitecapture.ai import design

    # Client lodges a request with block details and attachments.
    r = as_client.post(
        "/api/design-requests",
        json={
            "title": "Smith residence",
            "site": {
                "address": "12 Example St",
                "lot_width_m": 15,
                "lot_depth_m": 32,
                "slope": "1.2 m fall to rear",
            },
            "requirements": {
                "storeys": 1,
                "bedrooms": 4,
                "bathrooms": 2,
                "garage_spaces": 2,
            },
            "description": "Open plan living at the back facing the yard.",
        },
    )
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "submitted"

    url = f"/api/design-requests/{rid}/uploads"
    survey = _upload(as_client, url, plan_pdf.read_bytes(), "survey.pdf")
    r = as_client.post(
        f"/api/design-requests/{rid}/files",
        json={"upload_id": survey, "kind": "survey"},
    )
    assert r.status_code == 201, r.text
    bad = as_client.post(url, json={"filename": "virus.exe", "size": 3})
    assert bad.status_code == 400
    # Clients can't add deliverables or change status.
    up2 = _upload(as_client, url, b"%PDF-1.4 fake", "x.pdf")
    assert (
        as_client.post(
            f"/api/design-requests/{rid}/files", json={"upload_id": up2, "kind": "cad"}
        ).status_code
        == 403
    )
    assert (
        as_client.patch(
            f"/api/design-requests/{rid}", json={"status": "lodged"}
        ).status_code
        == 403
    )
    assert as_client.post(f"/api/design-requests/{rid}/ai-concept").status_code == 403

    # Another client can't see it.
    client.post(
        "/api/users",
        json={
            "email": "other@example.com",
            "password": "other password 1",
            "role": "client",
        },
    )
    from sitecapture.api.app import create_app

    with TestClient(create_app(client.app.state.settings)) as other:
        login(other, "other@example.com", "other password 1")
        assert other.get(f"/api/design-requests/{rid}").status_code == 404
        assert other.get("/api/design-requests").json() == []

    # Team generates the AI brief + concept CAD.
    captured = {}

    def fake_ask_json(content, schema, system, **kw):
        captured["types"] = [b["type"] for b in content]
        return {**CONCEPT, "concept": {**CONCEPT["concept"]}}

    monkeypatch.setattr(design, "ask_json", fake_ask_json)
    r = client.post(f"/api/design-requests/{rid}/ai-concept")
    assert r.status_code == 200, r.text
    staff_view = r.json()
    assert "document" in captured["types"]  # survey PDF was sent to Opus
    assert staff_view["status"] == "in_review"
    assert staff_view["ai_questions"] == CONCEPT["questions"]
    assert staff_view["concept"]["areas_m2"] == {"Ground": 140.0}
    assert staff_view["concept"]["checks"] == []
    concept_files = [f for f in staff_view["files"] if f["kind"] == "concept"]
    assert sorted(f["filename"].rsplit(".", 1)[1] for f in concept_files) == [
        "dxf",
        "pdf",
    ]
    dxf = next(f for f in concept_files if f["filename"].endswith(".dxf"))
    doc = ezdxf.read(io.StringIO(client.get(dxf["url"]).text))
    assert {"BOUNDARY", "WALLS", "TEXT"} <= {layer.dxf.name for layer in doc.layers}

    # Client doesn't see the team's working files or AI brief...
    client_view = as_client.get(f"/api/design-requests/{rid}").json()
    assert client_view["ai_brief"] is None and client_view["concept"] is None
    assert all(f["kind"] != "concept" for f in client_view["files"])
    assert as_client.get(dxf["url"]).status_code == 404
    # ...until the team shares it.
    client.patch(f"/api/design-files/{dxf['id']}", json={"visible_to_client": True})
    assert as_client.get(dxf["url"]).status_code == 200

    # Comments: internal notes stay internal.
    client.post(
        f"/api/design-requests/{rid}/comments",
        json={"body": "Check easement", "internal": True},
    )
    client.post(
        f"/api/design-requests/{rid}/comments",
        json={"body": "Concept attached for review"},
    )
    as_client.post(
        f"/api/design-requests/{rid}/comments",
        json={"body": "Looks great", "internal": True},
    )
    bodies = [
        c["body"]
        for c in as_client.get(f"/api/design-requests/{rid}").json()["comments"]
    ]
    assert bodies == [
        "Concept attached for review",
        "Looks great",
    ]  # client can't post internal notes

    # Status moves on; client edits are then locked.
    assert (
        client.patch(f"/api/design-requests/{rid}", json={"status": "drafting"}).json()[
            "status"
        ]
        == "drafting"
    )
    assert (
        client.patch(f"/api/design-requests/{rid}", json={"status": "nope"}).status_code
        == 400
    )
    assert (
        as_client.patch(
            f"/api/design-requests/{rid}", json={"description": "changed"}
        ).status_code
        == 409
    )
    assert [r["id"] for r in client.get("/api/design-requests").json()] == [rid]


def test_design_cad_checks():
    from sitecapture.ai.design import check_concept

    c = {
        **CONCEPT["concept"],
        "levels": [
            {
                "name": "G",
                "rooms": [
                    {
                        "name": "A",
                        "type": "other",
                        "x": 1,
                        "y": 6,
                        "width": 5,
                        "depth": 5,
                    },
                    {
                        "name": "B",
                        "type": "other",
                        "x": 4,
                        "y": 8,
                        "width": 5,
                        "depth": 5,
                    },
                    {
                        "name": "C",
                        "type": "other",
                        "x": 12,
                        "y": 6,
                        "width": 5,
                        "depth": 5,
                    },
                ],
            }
        ],
    }
    warnings = check_concept(c)
    assert "G: C extends outside the setbacks" in warnings
    assert any(w.startswith("G: A overlaps B") for w in warnings)
