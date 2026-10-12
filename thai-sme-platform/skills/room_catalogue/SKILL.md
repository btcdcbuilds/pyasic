---
name: room_catalogue
description: "Draft a hotel's room types for the pitch site from the business's OWN public sources, then confirm them with the owner."
---

# room_catalogue

Allowed sources (in this order):
1. The business's own website, Facebook/Instagram page, LINE OA.
2. The owner, after first contact (preferred: owner confirms names, sizes, bed types, capacity, units, base rate).
3. With the owner's authorisation: their channel manager / PMS export, or Google Business Profile Lodging data (amenities only - it has no priced room catalogue).

Never scrape Booking.com, Agoda or other OTAs - Booking.com's terms prohibit automated
copying and allow legal action. No public API returns another hotel's room types.

Output: `rooms:` entries in `sites/content/<slug>.yaml` with `confirmed: false` and a
`source:` note. The site shows a "Draft – to confirm" chip until the owner confirms;
then set `confirmed: true`. Leave `rate` empty rather than guessing a price.
