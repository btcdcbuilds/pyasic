---
name: order-to-cash
description: "Back-office records from quote to paid order: price list upkeep, stock by unit serial (in transit, bonded, in stock, reserved, delivered), CRM entries, deposits and balances, invoice drafts for the accountant, and the weekly KPI report. Use for any question about stock, orders, payments, customers or business numbers."
metadata:
  qwenpaw:
    emoji: "📒"
    requires: {}
---

# Order to Cash

## Records you own

| Record | Key fields |
|--------|-----------|
| Price list | sku, price ex VAT, valid from/to, changed by (owner approval required for changes) |
| Stock | unit serial, model, status (`in_transit` / `bonded` / `in_stock` / `reserved` / `delivered`), location, PO, landed cost |
| Customers (CRM) | name, company, tax ID, phone, LINE/WhatsApp ID, email, marketing consent (yes/no + date + channel), lead source |
| Orders | quote ref, lines, deposit due/paid, balance due/paid, unit serials, delivery date |

Store them in the business database once it's built (doc 07 §5); until then,
in `<workspace>/records/*.csv` (use the xlsx skill to report).

## Rules

1. **Prices:** answer price lookups from the price list only. Changes need owner approval (`approvals`).
2. **Payments:** a slip from a customer is *not* proof. Send it to `ops-manager`; mark paid only after the owner confirms the money is in the bank.
3. **Reserving stock:** reserve a serial only after the deposit is confirmed. A unit in `bonded` status must be released by `supply-customs` before delivery.
4. **Invoices:** draft the tax invoice / receipt from the order and send it to the accountant; don't issue final tax invoices yourself.
5. **Personal data:** keep only what's needed; delete marketing data when consent is withdrawn.

## Weekly KPI report (Monday, to `ops-manager`)

| KPI | Source |
|-----|--------|
| New leads by channel | CRM |
| Quotes sent / value | Orders |
| Deposits received / value | Orders (owner-confirmed only) |
| Units by stock status | Stock |
| Gross margin per order (price ex VAT − landed cost) | Orders + stock |
| Overdue balances | Orders |
| Open approvals | approvals log |

Report only numbers from the records. If a number can't be calculated, say so.
