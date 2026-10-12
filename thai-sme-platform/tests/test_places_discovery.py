from research.places_discovery import parse_place


def test_no_website_scores_higher_than_with_website():
    base = {
        "id": "abc",
        "displayName": {"text": "Krua Samui"},
        "types": ["thai_restaurant", "restaurant"],
        "businessStatus": "OPERATIONAL",
        "rating": 4.5,
        "userRatingCount": 120,
    }
    without = parse_place(base, "samui")
    with_site = parse_place({**base, "id": "def", "websiteUri": "https://x.example"}, "samui")
    assert without.kind == "restaurant"
    assert without.score == 90
    assert with_site.score == 50


def test_closed_business_is_skipped():
    place = {"id": "x", "businessStatus": "CLOSED_PERMANENTLY"}
    assert parse_place(place, "bangkok") is None
