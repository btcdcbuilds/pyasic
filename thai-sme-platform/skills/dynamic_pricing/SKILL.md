---
name: dynamic_pricing
description: "Tune and monitor automatic room pricing for a hotel customer."
---

# dynamic_pricing

- Pricing config lives in `pricing:` in the site YAML (see docs/PRICING.md and the Baan Lom
  Talay sample). Modes: `suggest` (owner approves) is the default for new customers; switch to
  `auto` only when the owner agrees in writing (LINE message is fine; save it).
- Daily: read `/admin/<slug>` rate calendar; flag nights >= 90% booked more than 14 days out
  (price may be too low) and nights < 20% booked within 7 days (consider a promotion).
- Always keep floor_pct and ceiling_pct set. Do not set ceiling above 200% of base or create
  event surges that could be judged "unreasonably high" under the Prices of Goods and
  Services Act s.29 - escalate to the owner and platform owner instead.
- Never scrape OTA prices for competitor data; only licensed rate-shopping feeds.
