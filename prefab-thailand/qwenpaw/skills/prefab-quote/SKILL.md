---
name: prefab-quote
description: "Build a customer quote for prefab units, options, screw piles, furniture, delivery, installation and truck hire strictly from the approved price list. Use whenever a customer asks for a price or quote. Never state a price from memory or calculate one outside this workflow."
metadata:
  qwenpaw:
    emoji: "🧾"
    requires: {}
---

# Quote

## Source of prices

The only valid prices are rows in the price list (`price_list` table, managed
by Dex Database Agent) that are currently valid (`valid_from` ≤ today ≤
`valid_to`). If a SKU has no valid price, say the price is being confirmed and
hand off to a human. Never estimate.

## Steps

1. Confirm the line items with the customer: model code, quantity, options, furniture packs, pile kits, delivery postcode/zone, installation yes/no.
2. Ask Dex Database Agent (`chat_with_agent`) for the current price of each SKU and stock status. Delivery is priced by zone; truck hire by trip/half-day/day.
3. Total = sum(qty × unit price ex VAT). VAT = 7% of the total ex VAT (Thai VAT rate valid to 30 Sep 2027: re-check after that date). Show ex-VAT, VAT and inc-VAT totals.
4. Quote validity: as set in the price list settings (default to be set by the owner). Payment terms: standard deposit/balance terms from the terms of sale. Attach the terms-of-sale link.
5. **Approval:** if the total exceeds the auto-approve threshold, or any line is custom, discounted or not in the price list, send the draft to Friday for human approval before sending.
6. Generate the PDF quote (docx/pdf skill), save it to the site folder, update `site.json` `outputs.quote_pdf` if it belongs to a site job.
7. Send to the customer with: what's included/excluded, delivery assumptions (access per the site checklist), the permit responsibility note ("the buyer is responsible for local permits; we provide drawings to help").

## Never

- Promise delivery dates for stock that isn't in the warehouse
- Offer discounts (only Friday/owner can approve)
- Say a permit isn't needed
