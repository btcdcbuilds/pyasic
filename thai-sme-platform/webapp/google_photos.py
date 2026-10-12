"""Live Google Maps photos for PITCH PREVIEWS only.

Rules this module follows (Google Maps Platform terms / Places policies, see
docs/PHOTOS_AND_ROOMS.md):
  - Only the place ID is stored. Photo names and image bytes are fetched at render
    time and never written to disk or the database (no caching / no re-hosting).
  - Every photo is shown with "Google Maps" attribution plus the author attributions
    returned by the API, in a visually separated block.
  - Many Maps photos are taken by customers who keep their copyright. After a
    business signs up, replace these with photos the owner supplies or owns
    (owner upload, or the owner's own media via the Business Profile API).

Cost: one Place Details (photos field) call + one Place Photos call per photo per
page view. Fine for low-traffic previews; never use it on live customer sites.
"""

from __future__ import annotations

import logging

import requests

log = logging.getLogger(__name__)
PLACES = "https://places.googleapis.com/v1"


def live_photos(place_id: str, api_key: str, limit: int = 6, max_width: int = 1200,
                session=requests) -> list[dict]:
    """Return [{'src', 'authors': [{'name', 'uri'}]}]; [] on any error."""
    try:
        r = session.get(f"{PLACES}/places/{place_id}",
                        headers={"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": "photos"},
                        timeout=10)
        r.raise_for_status()
        out = []
        for photo in r.json().get("photos", [])[:limit]:
            m = session.get(f"{PLACES}/{photo['name']}/media",
                            params={"maxWidthPx": max_width, "skipHttpRedirect": "true"},
                            headers={"X-Goog-Api-Key": api_key}, timeout=10)
            m.raise_for_status()
            out.append({
                "src": m.json()["photoUri"],
                "authors": [{"name": a.get("displayName", ""), "uri": a.get("uri", "")}
                            for a in photo.get("authorAttributions", [])],
            })
        return out
    except (requests.RequestException, KeyError, ValueError) as e:
        log.warning("Places photos unavailable for %s: %s", place_id, e)
        return []
