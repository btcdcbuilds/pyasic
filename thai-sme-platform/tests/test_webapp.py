import os
from datetime import date, timedelta

import pytest

os.environ.setdefault("ADMIN_KEY", "test-key")
os.environ["DB_PATH"] = ":memory:"

from starlette.testclient import TestClient  # noqa: E402

from webapp import app as appmod  # noqa: E402
from webapp.booking import BookingError, quote  # noqa: E402

TODAY = date.today()
D = lambda n: (TODAY + timedelta(days=n)).isoformat()  # noqa: E731
BASE = {"name": "Test", "contact": "0800000000", "consent": "true"}


@pytest.fixture
def client():
    return TestClient(appmod.app)


def test_all_five_sample_sites_render(client):
    assert len(appmod.SITES) == 5
    industries = {s["industry"] for s in appmod.SITES.values()}
    assert industries == {"restaurant", "cafe", "resort", "spa", "tour"}
    for slug in appmod.SITES:
        r = client.get(f"/s/{slug}/")
        assert r.status_code == 200, slug
        assert 'id="booking-form"' in r.text
        assert "Sample website" in r.text
        assert client.get(f"/s/{slug}/privacy").status_code == 200


def test_room_price_and_deposit():
    site = {**appmod.SITES["baan-lom-talay"], "pricing": {"mode": "suggest"}}  # base rates
    q = quote(site, {**BASE, "room": "sea", "check_in": D(10), "check_out": D(13), "guests": 2}, TODAY)
    assert q["nights"] == 3 and q["total"] == 7800 and q["deposit"] == 2340


def test_room_rejects_too_many_guests():
    site = appmod.SITES["baan-lom-talay"]
    with pytest.raises(BookingError):
        quote(site, {**BASE, "room": "garden", "check_in": D(1), "check_out": D(2), "guests": 3}, TODAY)


def test_tour_price_and_seat_limit():
    site = appmod.SITES["khanom-dolphin-trips"]
    form = {**BASE, "tour": "dolphin", "date": D(3), "departure": "07:00", "adults": 2, "children": 1}
    q = quote(site, form, TODAY)
    assert q["total"] == 2 * 800 + 500 and q["deposit"] == 1050
    with pytest.raises(BookingError, match="only 2 left"):
        quote(site, form, TODAY, booked=lambda *a: 8)


def test_spa_price_per_person():
    site = appmod.SITES["sabai-hands-massage"]
    q = quote(site, {**BASE, "service": "thai", "minutes": "90", "date": D(1), "time": "20:30", "people": 2}, TODAY)
    assert q["total"] == 1100
    with pytest.raises(BookingError):  # last start is 20:30
        quote(site, {**BASE, "service": "thai", "minutes": "90", "date": D(1), "time": "21:00", "people": 1}, TODAY)


def test_cafe_pickup_needs_notice_and_order():
    site = appmod.SITES["samui-morning-cafe"]
    with pytest.raises(BookingError):
        quote(site, {**BASE, "date": D(1), "time": "10:00", "note": "cake"}, TODAY)
    with pytest.raises(BookingError):
        quote(site, {**BASE, "date": D(2), "time": "10:00", "note": ""}, TODAY)
    assert quote(site, {**BASE, "date": D(2), "time": "10:00", "note": "cake"}, TODAY)["type"] == "pickup"


def test_consent_required():
    site = appmod.SITES["krua-baan-suan"]
    with pytest.raises(BookingError, match="consent"):
        quote(site, {**BASE, "consent": "false", "date": D(1), "time": "12:00", "party": 4}, TODAY)


def test_booking_flow_rooms_sell_out(client):
    form = {**BASE, "room": "family", "check_in": D(20), "check_out": D(22), "guests": 4}
    for _ in range(2):  # 2 family houses
        r = client.post("/api/baan-lom-talay/bookings", json=form)
        assert r.status_code == 201, r.text
        assert len(r.json()["ref"]) == 6
    r = client.post("/api/baan-lom-talay/bookings", json=form)
    assert r.status_code == 400 and "fully booked" in r.json()["error"]
    page = client.get("/admin/baan-lom-talay?key=test-key")
    assert page.status_code == 200 and page.text.count("Two-bedroom Family House x 2 nights") == 2


def test_admin_requires_key(client):
    assert client.get("/admin/baan-lom-talay").status_code == 404
    assert client.get("/admin/baan-lom-talay?key=wrong").status_code == 404


def test_domain_routing_and_tls_check(client):
    host = "sabai-hands-massage.sites.example.com"
    r = client.get("/", headers={"host": host})
    assert "Sabai Hands" in r.text
    assert client.get(f"/internal/tls-check?domain={host}").status_code == 200
    assert client.get("/internal/tls-check?domain=evil.example.org").status_code == 404


def test_room_auto_pricing_sums_nightly_rates():
    site = appmod.SITES["baan-lom-talay"]  # mode: auto
    q = quote(site, {**BASE, "room": "sea", "check_in": D(10), "check_out": D(13), "guests": 2}, TODAY)
    assert len(q["nightly"]) == 3
    assert q["total"] == sum(n["price"] for n in q["nightly"])
    for n in q["nightly"]:  # always within the owner's floor/ceiling
        assert 2600 * 0.8 <= n["price"] <= 2600 * 1.5


def test_rates_api(client):
    r = client.get("/api/baan-lom-talay/rates?days=7")
    assert r.status_code == 200 and r.json()["mode"] == "auto"
    assert len(r.json()["rooms"]) == 3 and len(r.json()["rooms"][0]["nights"]) == 7
    assert client.get("/api/baan-lom-talay/rates?days=abc").status_code == 400
    assert client.get("/api/krua-baan-suan/rates").status_code == 404


def test_preview_mockup_uses_live_google_photos(client, monkeypatch):
    fake = [{"src": "https://lh3.example/a", "authors": [{"name": "Nok", "uri": "https://maps.example/u"}]},
            {"src": "https://lh3.example/b", "authors": []}]
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "KEY")
    monkeypatch.setattr(appmod, "live_photos", lambda place_id, key: fake)
    site = {**appmod.SITES["krua-baan-suan"], "status": "preview", "google_place_id": "abc"}
    monkeypatch.setitem(appmod.SITES, "krua-baan-suan", site)
    html = client.get("/s/krua-baan-suan/").text
    assert 'src="https://lh3.example/a"' in html and "Google Maps · <a" in html  # hero, credited
    assert 'src="https://lh3.example/b"' in html                                  # gallery
    # Live (sold) sites never call Google
    monkeypatch.setitem(appmod.SITES, "krua-baan-suan", {**site, "status": "live"})
    assert "lh3.example" not in client.get("/s/krua-baan-suan/").text
