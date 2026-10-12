---
name: site_build
description: Build or update the full website from owner-supplied content in `business_content`.
---

# site_build

- Inputs: business_content (menu, rooms, photos, hours, prices) uploaded by the owner.
- Languages: Thai, English; add Chinese if the owner asks.
- Include: LINE / WhatsApp buttons, booking form, map embed via official Maps Embed.
- Hand off to site_qa before publishing.


Content format: `sites/content/<slug>.yaml` (see the 5 samples). Booking types: table, pickup,
room, slot, seats. Add the host to `sites/domains.yaml`. Run `python -m pytest -q tests` before publishing.
