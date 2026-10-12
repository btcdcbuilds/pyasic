"""Discovery agent tool: find candidate businesses via the official Places API (New).

No scraping. Only `place_id` is stored long-term; other fields go into a short-lived
cache that must be purged per Google Maps Platform terms.

Usage:
    GOOGLE_MAPS_API_KEY=... python -m research.places_discovery samui --max-pages 1
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

import requests
import yaml

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Field mask decides the billing SKU. websiteUri / phone fields cost more than id+name,
# so keep this list as short as the scorer needs.
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.types",
        "places.businessStatus",
        "places.rating",
        "places.userRatingCount",
        "places.websiteUri",
        "nextPageToken",
    ]
)

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "regions.yaml"

KIND_BY_TYPE = {
    "restaurant": "restaurant",
    "thai_restaurant": "restaurant",
    "seafood_restaurant": "restaurant",
    "cafe": "cafe",
    "coffee_shop": "cafe",
    "resort_hotel": "resort",
    "hotel": "hotel",
    "guest_house": "hotel",
    "bed_and_breakfast": "hotel",
    "lodging": "hotel",
    "spa": "spa",
    "tour_agency": "tour",
}


@dataclass
class Candidate:
    place_id: str
    region_id: str
    name: str
    kind: str
    rating: float | None
    review_count: int
    has_website: bool
    score: float = 0.0
    reasons: dict = field(default_factory=dict)


def kind_from_types(types: list[str]) -> str:
    for t in types:
        if t in KIND_BY_TYPE:
            return KIND_BY_TYPE[t]
    return "other"


def score(c: Candidate) -> Candidate:
    """Higher score = better prospect. Weights are a starting point to tune on real replies."""
    reasons = {}
    if not c.has_website:
        reasons["no_website"] = 40
    if c.rating is not None and c.rating >= 4.0:
        reasons["good_rating"] = 20
    if 20 <= c.review_count <= 1000:
        # Active enough to have customers, small enough to lack an agency.
        reasons["active_small_business"] = 20
    if c.kind in ("restaurant", "resort", "hotel", "cafe"):
        reasons["target_kind"] = 10
    c.reasons = reasons
    c.score = float(sum(reasons.values()))
    return c


def parse_place(place: dict, region_id: str) -> Candidate | None:
    if place.get("businessStatus") not in (None, "OPERATIONAL"):
        return None
    return score(
        Candidate(
            place_id=place["id"],
            region_id=region_id,
            name=place.get("displayName", {}).get("text", ""),
            kind=kind_from_types(place.get("types", [])),
            rating=place.get("rating"),
            review_count=int(place.get("userRatingCount", 0)),
            has_website=bool(place.get("websiteUri")),
        )
    )


def search(api_key: str, query: str, page_token: str | None = None) -> dict:
    body = {"textQuery": query, "regionCode": "TH", "languageCode": "th", "pageSize": 20}
    if page_token:
        body["pageToken"] = page_token
    resp = requests.post(
        SEARCH_URL,
        headers={"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": FIELD_MASK},
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def discover(region_id: str, api_key: str, max_pages: int = 1) -> list[Candidate]:
    config = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    queries = config["regions"][region_id]["queries"]
    seen: dict[str, Candidate] = {}
    for query in queries:
        token = None
        for _ in range(max_pages):
            data = search(api_key, query, token)
            for place in data.get("places", []):
                cand = parse_place(place, region_id)
                if cand and cand.place_id not in seen:
                    seen[cand.place_id] = cand
            token = data.get("nextPageToken")
            if not token:
                break
    return sorted(seen.values(), key=lambda c: c.score, reverse=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("region", choices=["bangkok", "samui", "nakhon_si_thammarat"])
    parser.add_argument("--max-pages", type=int, default=1)
    args = parser.parse_args(argv)

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("GOOGLE_MAPS_API_KEY is not set", file=sys.stderr)
        return 1
    results = discover(args.region, api_key, args.max_pages)
    print(json.dumps([asdict(c) for c in results], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
