# 15 — Securing 0% Import Duty (hard requirement)

**Owner decision (2026-10-11): the business only goes ahead if the units can
be imported at 0% duty.** At USD 20,000 the budget can't absorb the 80% MFN rate
(doc 11). Nothing is paid to the supplier until this gate passes.

## 1. Possible routes to 0%

| Route | What's needed | What we know | Status |
|-------|--------------|--------------|--------|
| **ACFTA (ASEAN–China FTA): Form E** | Goods meet ACFTA rules of origin; Form E issued in China; the product's HS line is at 0% in Thailand's ACFTA schedule | One commercial source says 9406 gets 0% with Form E; an ASEAN "Highly Sensitive List" document includes 9406.00 without saying which country. **Conflicting** | ❓ Broker to confirm |
| **RCEP: RCEP certificate of origin** | Goods meet RCEP origin rules; Thailand's RCEP schedule for China-origin goods at 0% for this line | Thailand's commitments are in RCEP Annex I; the line rate for 9406 wasn't found | ❓ Broker to confirm |
| Correct HS classification | The broker picks the correct 8-digit code for the actual product (a folding unit may classify differently from a site-built kit). **We use the correct code, not the cheapest one.** Mis-declaring is customs fraud | 9406.20 = modular steel building units; 9406.90 = other | ❓ Ask for an **advance ruling** from Thai Customs |
| Fallback: ASEAN-made units | If China-origin can't get 0%, a manufacturer inside ASEAN may qualify under ATIGA (ASEAN Trade in Goods Agreement) | Not researched yet | Only if the routes above fail |

## 2. Exact questions for the customs broker (send with the supplier's spec sheet)

| # | Question |
|---|----------|
| 1 | What is the correct 8-digit Thai HS code for this folding/expandable steel unit (fitted with wiring, lights, switchboard)? |
| 2 | What is the MFN duty rate for that code? |
| 3 | What is the ACFTA (Form E) rate for that code? Is it on Thailand's sensitive/highly sensitive list? |
| 4 | What is the RCEP rate for China-origin goods under that code? |
| 5 | What origin rule applies (e.g. regional value content %, change of tariff classification), and what must the factory provide to prove it? |
| 6 | Are the electrical parts inside treated as part of the unit for duty, and do they still need TISI licences at import? |
| 7 | Screw piles and furniture: HS codes and FTA rates? |
| 8 | Should we get an advance classification ruling from Thai Customs? How long does it take? |
| 9 | Can goods stored in a bonded warehouse keep the Form E / RCEP preference when released later? Is there a time limit? |
| 10 | What is your fee per shipment and for the ruling application? |

Ask **2 brokers** and get the answers **in writing**.

## 3. What the supplier must confirm

| # | Item |
|---|------|
| 1 | They can issue Form E (and/or RCEP CO) through CCPIT/customs in China |
| 2 | The product meets the origin rule the broker names (materials/value made in China) |
| 3 | Invoice, packing list and certificate details will match exactly (HS code, description, quantities, values) |
| 4 | The Form E is issued correctly and on time (keep an example from a previous shipment to Thailand if they have one) |

## 4. Gate

| Gate passes when | Evidence |
|------------------|----------|
| A licensed broker confirms in writing a 0% route for the exact product | Broker letter/email (+ advance ruling if recommended) |
| The supplier confirms they can issue the certificate | Supplier email + sample CO |
| `tools/landed_cost.py` with duty 0% and real quotes fits USD 20,000 | Calculator output saved in `research/` |

If the gate fails, stop and review the fallback route. Don't import at 80%.

Sources: [treayo.com 940620](https://treayo.com/en/compare/940620), [ASEAN HSL](https://asean.org/wp-content/uploads/2021/03/HIGH-SENSITIVE-LIST.pdf), [xilinkglobaltrade.com](https://xilinkglobaltrade.com/prefabricated-villa-china-thailand-ddp-sea-contractors) (commercial claim of 0% with Form E: unverified), [WTO Center VCCI – Thailand RCEP commitments](https://wtocenter.vn/rcep-market/30009-thailands-tariff-commitments-for-imports-under-rcep).
