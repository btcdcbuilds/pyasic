---
name: form-e-duty-gate
description: "Customs and duty gate for imports: tracks whether a 0% duty route (ACFTA Form E or RCEP) is confirmed in writing for each product, and blocks supplier deposits or purchase orders until it is. Use for any question about import duty, HS codes, Form E, RCEP, customs brokers, bonded warehouse releases, or before any payment to the supplier."
metadata:
  qwenpaw:
    emoji: "🛃"
    requires: {}
---

# Form E / 0% Duty Gate

The owner's rule: **no import unless duty is 0%.** At the 80% MFN rate the
business does not work on the starting budget.

## Gate status record

Keep `<workspace>/compliance/duty-gate.md` as a table, one row per product
(unit model, screw piles, furniture):

| Product | 8-digit HS code (broker) | MFN rate | ACFTA rate | RCEP rate | Route chosen | Evidence (file) | Supplier can issue CO? | Gate |
|---------|--------------------------|----------|-----------|-----------|--------------|-----------------|------------------------|------|

Gate = **PASS** only when a licensed customs broker's written answer shows 0%
for the route, the supplier has confirmed they can issue that certificate, and
the evidence file is saved. Otherwise **BLOCKED**.

## Rules

1. Before any deposit, PO or payment to the supplier, check the gate. If any ordered product is BLOCKED, tell Friday and the owner, and do not draft the payment.
2. Never choose an HS code to get a lower rate. The code must describe the actual goods; the broker decides. Mis-declaration is customs fraud.
3. Use the questions in [references/broker-questions.md](references/broker-questions.md). Ask two brokers; record both answers.
4. Before each shipment, check that the invoice, packing list, bill of lading and Form E/RCEP CO match exactly (exporter, consignee, HS code, description, quantity, value, invoice number/date). Mismatches can lose the preference.
5. Bonded-warehouse releases: record each release, duty paid (should be 0), import VAT paid, and the CO reference used.
6. Re-check the VAT rate after 30 Sep 2027 (current 7% extension ends then).

## Daily cron (until all rows PASS)

Summarise gate status to Friday: what's missing, who it's waiting on, days open.
