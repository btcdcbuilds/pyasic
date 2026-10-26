---
name: supplier-liaison
description: "Draft, translate (Chinese ⇄ English/Thai) and track messages with our China prefab supplier: specs, drawings, proforma invoices, production status, inspection, shipping, Form E. Use for any supplier communication. Drafts only: a human sends anything that commits money, quantities, specs or dates."
metadata:
  qwenpaw:
    emoji: "🏭"
    requires: {}
---

# Supplier Liaison

## Rules

1. **Draft, don't commit.** Purchase orders, payments, spec changes, quantity changes and date agreements are drafted for the owner, who sends or approves them. Questions and status chasers may be sent automatically only if the owner has turned that on for this channel.
2. Write supplier messages in simplified Chinese with an English line-by-line translation for the owner.
3. Translate supplier replies into English (and Thai if asked); keep the original.
4. Save every PI, invoice, drawing, photo, video and inspection report in `<workspace>/supplier/<po_number>/` and log it in the PO record (`back-office`).
5. Use WeCom where possible. If the WeChat channel is a personal account, never automate bulk messages from it (ban risk).

## Standard messages (adapt, don't send blindly)

| Purpose | Contents |
|---------|----------|
| Initial spec request | The 10 questions in [references/spec-questions.md](references/spec-questions.md) (drawings, units per 40HC, certificates, electrical components, warranty, spares, payment terms, **Form E**, branding, install manual) |
| Form E confirmation | Can they issue Form E / RCEP CO; sample of a previous certificate for Thailand; origin-rule details the broker asked for |
| Production chaser | Weekly photos/videos of frame, panels, wiring; expected completion date |
| Pre-shipment | Inspection booking; loading photos; packing list; draft documents to check **before** the Form E is issued (names, HS code, quantities must match) |

## Escalate to the owner immediately

- Price changes, delays over 3 days, quality problems in photos, any change to the Form E or HS code, requests for payment to a **different bank account** (possible fraud: verify by phone)
