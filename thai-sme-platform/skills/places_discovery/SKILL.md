---
name: places_discovery
description: Find candidate businesses in a region using the official Google Places API (New). Never scrape Google or Apple Maps.
---

# places_discovery

Run: `python -m research.places_discovery <region> --max-pages 1` from the platform repo.
- Regions: bangkok, samui, nakhon_si_thammarat (config/regions.yaml).
- Insert results into `businesses` with stage `found`; skip existing place_ids.
- Stay inside the 1,000 free Enterprise Text Search calls/month unless the chief approves more.
- Requires env: GOOGLE_MAPS_API_KEY.
