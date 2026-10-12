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
    site = appmod.SITES["baan-lom-talay"]
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
    assert page.status_code == 200 and page.text.count("Two-bedroom Family House") == 2


def test_admin_requires_key(client):
    assert client.get("/admin/baan-lom-talay").status_code == 404
    assert client.get("/admin/baan-lom-talay?key=wrong").status_code == 404


def test_domain_routing_and_tls_check(client):
    host = "sabai-hands-massage.sites.example.com"
    r = client.get("/", headers={"host": host})
    assert "Sabai Hands" in r.text
    assert client.get(f"/internal/tls-check?domain={host}").status_code == 200
    assert client.get("/internal/tls-check?domain=evil.example.org").status_code == 404
