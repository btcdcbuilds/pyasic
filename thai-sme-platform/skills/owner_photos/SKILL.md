---
name: owner_photos
description: "Get the business's photos legitimately: live Google Maps photos for the pitch preview, then the owner's own photos for the live site."
---

# owner_photos

Pitch preview (before sale):
- Set `google_place_id` and `status: preview` in the site YAML. The server shows up to 6
  photos live from the Places API with "Google Maps" and author attributions: the first
  becomes the mockup's main (hero) photo, the rest a gallery.
- In outreach, send the mockup LINK, not a screenshot (a screenshot is a stored copy).
- Never download, store or re-host Google Maps images or photo names - only the place ID
  may be stored. Requires env GOOGLE_MAPS_API_KEY. Cost: Place Photos SKU, 1,000 free/month.

After sign-up (live site):
- Ask the owner to send photos via LINE or the owner portal, OR to add our Google account
  as a Manager on their Business Profile so we can list their own media
  (Business Profile API `accounts.locations.media.list`; API access must be approved first).
- Customer-uploaded Maps photos belong to the people who took them: do not use them on the
  live site without that person's permission.
- Save chosen photos to our storage and list them under `photos:` with a `credit` if needed;
  remove `status: preview`.
