import io
import json
import struct
import zlib
from datetime import date, timedelta

import pytest
from starlette.testclient import TestClient

from webapp import ai_changes
from webapp import app as appmod
from webapp.core import STORE, SITES

H = {"X-Requested-With": "owner-app"}
D = lambda n: (date.today() + timedelta(days=n)).isoformat()  # noqa: E731


def tiny_png() -> bytes:
    raw = b"\x00\xff\x00\x00"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


@pytest.fixture(scope="module")
def owners():
    STORE.create_owner("hotel", "Khun Hotel", "pw-hotel-123", ["baan-lom-talay"])
    STORE.create_owner("multi", "Khun Multi", "pw-multi-123", ["krua-baan-suan", "samui-morning-cafe"])
    return True


def login(user, pw):
    c = TestClient(appmod.app)
    r = c.post("/owner/login", data={"username": user, "password": pw}, follow_redirects=False)
    assert r.status_code == 303, r.text
    return c


def test_login_required_and_wrong_password(owners):
    c = TestClient(appmod.app)
    assert c.get("/owner", follow_redirects=False).status_code == 303
    assert c.post("/owner/login", data={"username": "hotel", "password": "nope"}).status_code == 401
    assert c.get("/owner/api/baan-lom-talay/summary").status_code == 404


def test_owner_sees_only_their_businesses(owners):
    c = login("multi", "pw-multi-123")
    home = c.get("/owner")
    assert "Krua Baan Suan" in home.text and "Samui Morning" in home.text and "Baan Lom Talay" not in home.text
    assert c.get("/owner/api/krua-baan-suan/summary").status_code == 200
    assert c.get("/owner/api/baan-lom-talay/summary").status_code == 404
    assert c.get("/owner/baan-lom-talay").status_code == 404
    # single-business owner goes straight to the app
    h = login("hotel", "pw-hotel-123")
    assert h.get("/owner", follow_redirects=False).headers["location"] == "/owner/baan-lom-talay"
    assert "Prices" in h.get("/owner/baan-lom-talay").text


def test_mutations_need_csrf_header(owners):
    c = login("multi", "pw-multi-123")
    site = c.get("/owner/api/krua-baan-suan/summary").json()["site"]
    assert c.put("/owner/api/krua-baan-suan/content", json={"site": site}).status_code == 404
    assert c.put("/owner/api/krua-baan-suan/content", json={"site": site}, headers=H).status_code == 200


def test_edit_menu_price_validates_and_versions(owners):
    c = login("multi", "pw-multi-123")
    site = c.get("/owner/api/krua-baan-suan/summary").json()["site"]
    site["menu"][0]["items"][0]["price"] = 135
    site["slug"] = "hacked"            # locked fields are ignored
    site["booking"]["type"] = "room"
    r = c.put("/owner/api/krua-baan-suan/content", json={"site": site}, headers=H)
    assert r.status_code == 200
    assert SITES["krua-baan-suan"]["menu"][0]["items"][0]["price"] == 135
    assert SITES["krua-baan-suan"]["slug"] == "krua-baan-suan" and SITES["krua-baan-suan"]["booking"]["type"] == "table"
    assert "135" in c.get("/s/krua-baan-suan/").text.replace(",", "")
    bad = json.loads(json.dumps(site))
    bad["menu"][0]["items"][0]["price"] = -5
    r = c.put("/owner/api/krua-baan-suan/content", json={"site": bad}, headers=H)
    assert r.status_code == 400 and any("price" in e for e in r.json()["errors"])
    # undo to the version before the edit
    hist = c.get("/owner/api/krua-baan-suan/summary").json()["history"]
    assert hist[0]["author"] == "owner:multi"
    r = c.post("/owner/api/krua-baan-suan/undo", json={"version_id": hist[1]["id"]}, headers=H)
    assert r.status_code == 200
    assert SITES["krua-baan-suan"]["menu"][0]["items"][0]["price"] == 120


def test_booking_confirm_and_deposit(owners):
    pub = TestClient(appmod.app)
    r = pub.post("/api/baan-lom-talay/bookings", json={"room": "garden", "check_in": D(40), "check_out": D(42),
                 "guests": 2, "name": "Guest", "contact": "0811111111", "consent": "true"})
    assert r.status_code == 201
    ref = r.json()["ref"]
    assert r.json()["promptpay_qr"].startswith("data:image/svg+xml")  # sample has a PromptPay ID
    c = login("hotel", "pw-hotel-123")
    r = c.post(f"/owner/api/baan-lom-talay/bookings/{ref}", json={"status": "confirmed", "deposit_paid": True}, headers=H)
    assert r.status_code == 200 and r.json()["status"] == "confirmed" and r.json()["deposit_paid"] is True
    assert c.post(f"/owner/api/baan-lom-talay/bookings/{ref}", json={"status": "weird"}, headers=H).status_code == 400


def test_pricing_preset_rates_and_fixed_night(owners):
    c = login("hotel", "pw-hotel-123")
    r = c.post("/owner/api/baan-lom-talay/pricing", headers=H,
               json={"pricing": {"preset": "aggressive", "ceiling_pct": None, "floor_pct": None, "weekend_pct": None,
                                 "occupancy": None, "last_minute": None, "early_bird": None},
                     "rates": {"sea": 2800}})
    assert r.status_code == 200, r.text
    site = SITES["baan-lom-talay"]
    assert site["pricing"]["preset"] == "aggressive" and "ceiling_pct" not in site["pricing"]
    assert next(x for x in site["rooms"] if x["code"] == "sea")["rate"] == 2800
    assert c.post("/owner/api/baan-lom-talay/pricing", headers=H, json={"pricing": {"ceiling_pct": 300}}).status_code == 400
    r = c.post("/owner/api/baan-lom-talay/fixed-price", headers=H, json={"room": "sea", "date": D(3), "price": 5000})
    assert r.status_code == 200
    cal = c.get("/owner/api/baan-lom-talay/summary").json()["calendar"]
    night = next(n for n in next(x for x in cal if x["code"] == "sea")["nights"] if n["date"] == D(3))
    assert night["price"] == 5000
    c.post("/owner/api/baan-lom-talay/fixed-price", headers=H, json={"room": "sea", "date": D(3), "price": None})
    assert D(3) not in SITES["baan-lom-talay"]["pricing"].get("fixed", {}).get("sea", {})


def test_photo_upload_assign_and_delete(owners):
    c = login("hotel", "pw-hotel-123")
    r = c.post("/owner/api/baan-lom-talay/photos", headers=H, files=[("photos", ("a.png", tiny_png(), "image/png"))])
    assert r.status_code == 200, r.text
    src = r.json()["saved"][0]
    assert c.get(src).status_code == 200
    bad = c.post("/owner/api/baan-lom-talay/photos", headers=H, files=[("photos", ("x.png", b"not an image", "image/png"))])
    assert bad.status_code == 400
    site = c.get("/owner/api/baan-lom-talay/summary").json()["site"]
    site["photos"] = [{"src": src}]
    assert c.put("/owner/api/baan-lom-talay/content", json={"site": site}, headers=H).status_code == 200
    assert f'src="{src}"' in c.get("/s/baan-lom-talay/").text
    name = src.rsplit("/", 1)[1]
    assert c.delete(f"/owner/api/baan-lom-talay/photos/{name}", headers=H).status_code == 200
    assert SITES["baan-lom-talay"].get("photos") == []
    assert c.get(src).status_code == 404


class FakeAI:
    """Stands in for the Anthropic client: returns a canned structured answer."""
    def __init__(self, change):
        self.change = change


def test_ai_request_proposes_then_owner_approves(owners, monkeypatch):
    def fake_ask(client, site, text, photos, feedback):
        new = json.loads(json.dumps(site))
        new["faq"].append({"q": {"th": "มีที่จอดรถไหม", "en": "Is there parking?"},
                           "a": {"th": "มี ฟรี 10 คัน", "en": "Yes, free for 10 cars."}})
        return {"needs_human": False, "summary_en": "Added a parking FAQ.", "summary_th": "เพิ่มคำถามเรื่องที่จอดรถแล้ว",
                "updated_site_json": json.dumps(new, ensure_ascii=False)}
    monkeypatch.setattr(ai_changes, "_ask", fake_ask)
    monkeypatch.setattr(ai_changes, "_client", lambda: FakeAI(None))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    c = login("multi", "pw-multi-123")
    n_faq = len(SITES["samui-morning-cafe"]["faq"])
    r = c.post("/owner/api/samui-morning-cafe/ai", json={"text": "Add FAQ: parking - yes, free for 10 cars"}, headers=H)
    assert r.status_code == 201
    reqs = c.get("/owner/api/samui-morning-cafe/summary").json()["ai_requests"]
    assert reqs[0]["status"] == "proposed" and any("faq" in ch for ch in reqs[0]["changes"])
    assert len(SITES["samui-morning-cafe"]["faq"]) == n_faq          # not live yet
    r = c.post(f"/owner/api/samui-morning-cafe/ai/{reqs[0]['id']}/approve", json={}, headers=H)
    assert r.status_code == 200
    assert len(SITES["samui-morning-cafe"]["faq"]) == n_faq + 1
    assert "Is there parking?" in c.get("/s/samui-morning-cafe/").text


def test_ai_invalid_proposal_fails_safely(owners, monkeypatch):
    def bad_ask(client, site, text, photos, feedback):
        new = json.loads(json.dumps(site))
        new["menu"][0]["items"][0]["price"] = "free"
        return {"needs_human": False, "summary_en": "x", "summary_th": "x",
                "updated_site_json": json.dumps(new, ensure_ascii=False)}
    monkeypatch.setattr(ai_changes, "_ask", bad_ask)
    monkeypatch.setattr(ai_changes, "_client", lambda: None)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    c = login("multi", "pw-multi-123")
    c.post("/owner/api/krua-baan-suan/ai", json={"text": "make everything free"}, headers=H)
    req = c.get("/owner/api/krua-baan-suan/summary").json()["ai_requests"][0]
    assert req["status"] == "failed" and "Validation failed" in req["error"]


def test_ai_without_key_is_queued_for_team(owners):
    c = login("multi", "pw-multi-123")
    c.post("/owner/api/krua-baan-suan/ai", json={"text": "Please redesign my logo"}, headers=H)
    req = c.get("/owner/api/krua-baan-suan/summary").json()["ai_requests"][0]
    assert req["status"] == "queued" and "team" in req["summary"]
