---
name: site_preview
description: Fill a website template with public basics (name, area, type) to create a pitch preview.
---

# site_preview

- Templates: restaurant, cafe, resort, guesthouse (Thai + English).
- Use placeholder photos and a sample menu clearly marked as 'example'. Never copy
  photos, menus or reviews from Google, OTAs or social media.
- Output a preview URL and set stage `sample_built`.


Content format: copy a file from `sites/content/` (one per industry) and edit it. Render locally with
`uvicorn webapp.app:app` and open `/s/<slug>/`. Keep the sample banner on previews.
