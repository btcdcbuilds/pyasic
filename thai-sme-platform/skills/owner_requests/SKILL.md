---
name: owner_requests
description: "Handle owners' 'Ask AI' change requests that need a human or are queued because no API key is configured."
---

# owner_requests

Requests live in the `ai_requests` table (status `queued`, `needs_human` or `failed`).

1. Read the request text and the current site content (`sites` table, or `/owner/api/<slug>/summary`).
2. If it is a content change (text, prices, hours, FAQ, photos already uploaded): make the change
   as a new proposal - set `proposal` to the full updated site JSON and `status` to `proposed`.
   The owner approves it in the app; never write straight to the live site.
3. Run the same validation (`webapp.content.validate_site`) before proposing.
4. If it needs the owner's input (missing price, licence number, photo), reply to the owner on
   LINE and set `status` to `needs_human` with a short Thai + English summary.
5. Never invent prices, licence numbers, awards or reviews. Never change slug, industry or
   booking type. Design changes beyond colours go to the build lead.
