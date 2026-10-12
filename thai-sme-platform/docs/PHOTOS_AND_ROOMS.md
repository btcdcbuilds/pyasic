# Photos and room types in the initial offer

Goal: the pitch preview shows the business's real photos and room types, so the owner sees
their own business, not a template, without breaking Google's or the OTAs' terms.

## Photos

| Stage | Source | How | Rules |
|---|---|---|---|
| **Pitch preview** | Google Maps photos of the business | Site YAML has `google_place_id` + `status: preview`. The server loads up to 6 photos **live** from the Places API on each view (`webapp/google_photos.py`): photo 1 is the mockup's main photo, the rest a gallery. Outreach sends the link, not a screenshot | Store only the place ID. No downloading, caching or re-hosting of images or photo names. Show "Google Maps" plus author names/links, in a separated block (done in the template) |
| **Live site (after sign-up)** | Owner's own photos | Owner sends them via LINE / portal, **or** adds our Google account as Manager on their Business Profile so we can list their own media through the Business Profile API | Customer-uploaded Maps photos belong to the photographer; don't use them without that person's permission |

| Fact | Source |
|---|---|
| Places content shown outside a Google map must carry Google Maps attribution; author attributions must be shown | https://developers.google.com/maps/documentation/places/web-service/policies |
| Only the place ID may be stored; no pre-fetching/caching/storing other content | same |
| Terms §3.2.3(a): no scraping/extracting Maps content for use outside the Services | https://cloud.google.com/maps-platform/terms |
| Place Photos SKU: 1,000 free/month, then $7 per 1,000 | https://developers.google.com/maps/billing-and-pricing/pricing |
| Contributors keep copyright in content they upload to Google | https://policies.google.com/terms |
| Business Profile Manager role; media list API needs approved API access (Business Profile managed 60+ days, application form) | https://support.google.com/business/answer/3403100 ; https://developers.google.com/my-business/content/prereqs |

**Still to check before scale-up:** the live Place Photos call uses `skipHttpRedirect=true` to get a
short-lived `photoUri`. Confirm it against the current Place Photos documentation on the first
real test with an API key.

## Room types

| Source | Allowed? | Notes |
|---|---|---|
| Business's own website / Facebook / LINE OA | Yes, as a **draft** | Marked `confirmed: false`; site shows a "Draft – to confirm" chip |
| Owner confirms on first call or chat | Yes, **preferred** | Then set `confirmed: true` and the base rates |
| Owner's channel manager / PMS export | Yes, with the owner's permission | — |
| Google Business Profile Lodging API | Amenities only | Has guest-unit attributes, no priced room catalogue |
| Booking.com / Agoda listings | **No scraping** | Booking.com terms ban automated copying; connectivity APIs are partner-only (Booking.com paused new providers) |

Skills: `owner_photos`, `room_catalogue` (in `skills/`). Agent: `build-preview` uses both.
