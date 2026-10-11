---
name: prefab-site-intake
description: "Collect and confirm a customer's site information for a prefab unit: measurement photos or sketches, location pin, drone or ground photos, access details. Creates site.json. Use when a customer wants a layout, a site plan, a 3D model on their land, or a delivery/installation quote. Do not use for general product questions."
metadata:
  qwenpaw:
    emoji: "📐"
    requires: {}
---

# Site Intake

Load `prefab-catalog` first for the `site.json` format and model codes.

## Steps

1. **Explain and get consent.** Tell the customer what we'll make (concept layout + 3D model + quote), that it's not a survey, and that their photos are used only for this job and deleted after the retention period. Link the privacy notice. Continue only after they agree.
2. **Ask for, in one message** (Thai or English, matching the customer):
   - location pin (LINE/WhatsApp location share)
   - photo of their measurements or a hand sketch with lengths in metres (boundary sides, distances to fences/house/trees)
   - gate width and a photo of the access road and gate
   - photos of the spot from ground level (slope, trees, overhead wires)
   - optional: top-down drone photo; title-deed (โฉนด) map
   - which unit(s) and options they're interested in, and how many
3. **Read the photos** with `view_image`. Write every number you read into `measurements[]` with its source photo.
4. **Repeat the numbers back** as a short table and ask the customer to confirm or correct them. Never fill in a missing measurement yourself. Set `measurements_confirmed_by_customer: true` only after they confirm.
5. **Pick the base image:** a drone photo if they sent one; otherwise a satellite image at the pin from the approved map provider (record `provider`). A sketch is the fallback.
6. **Save** `site.json` (status `measured`) under `<workspace>/sites/<customer_id>/<site_id>/` with the photos.
7. **Hand off** with `chat_with_agent` to `site-engineer`: pass the path to `site.json`.

## Escalate to a human instead of continuing

- The customer wants stacked/2-storey units, permit drawings, or more than 6 units
- Overhead power lines appear near the spot or access path
- The customer is unsure of measurements and asks us to "just estimate": offer a paid site visit instead
