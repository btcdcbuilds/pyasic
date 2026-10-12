---
name: site_preview
description: "Fill a website template with public basics (name, area, type) to create a pitch preview."
---

# site_preview

- Templates: restaurant, cafe, resort, guesthouse (Thai + English).
- Photos: show the business's Google Maps photos LIVE via the owner_photos skill (attributed,
  never downloaded). Room types: draft via the room_catalogue skill (marked "to confirm").
  Never copy photos, menus or reviews from OTAs or social media into our storage.
- Output a preview URL and set stage `sample_built`.


Content format: copy a file from `sites/content/` (one per industry) and edit it. Render locally with
`uvicorn webapp.app:app` and open `/s/<slug>/`. Keep the sample banner on previews.
