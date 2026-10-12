---
name: prospect_qualify
description: Score a found business and record what it is missing (website, booking, LINE OA, OTA listing).
---

# prospect_qualify

- Use only the business's own public website/social pages and OTA search pages.
- Fill `has_website`, `on_ota`, `line_oa_id`, `contact_email` where publicly listed.
- Never collect personal data of individuals; business contact points only (PDPA).
- Move stage to `qualified` when score >= 60, else leave as `found`.
