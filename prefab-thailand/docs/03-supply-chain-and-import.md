# 03 — Supply Chain & Import

## 1. End-to-end flow

| Step | Who | Est. duration | Output / document |
|------|-----|---------------|-------------------|
| 1. Specs + PI agreed | Us + factory | 1–2 weeks | Signed Proforma Invoice (PI), drawings, component list |
| 2. Customs pre-check | Customs broker | 1–2 weeks (parallel) | Written HS classification, duty rate, Form E advice, TISI check |
| 3. Deposit paid | Us | — | Bank transfer record |
| 4. Production | Factory | ~30 days (owner's information) | Production photos/videos weekly |
| 5. Pre-shipment inspection | Third-party inspector (e.g. SGS, BV, QIMA, or independent) | 1–2 days | Inspection report with photos |
| 6. Balance paid, loading | Us + factory | 2–5 days | Loading photos, packing list |
| 7. Export + ocean freight | Freight forwarder | Transit time TBD by forwarder (China port → Laem Chabang / Bangkok) | Bill of Lading, Commercial Invoice, Packing List, **Form E** |
| 8. Import clearance | Customs broker | TBD | Import declaration, duty + VAT payment receipt |
| 9. Haul to warehouse + unload | Trucking + crane/forklift | 1 day | Delivery note, photos |
| 10. Incoming QC + stock | Us | 1–2 days | Stock records, defect list to factory |

> Durations other than the factory's 30 days are placeholders. Get them from the forwarder and broker.

## 2. Incoterms

| Option | What it means | Recommendation |
|--------|---------------|----------------|
| FOB (Chinese port) | Factory loads onto the ship; we control freight via our forwarder | **Preferred**: we control freight cost and insurance |
| CIF Laem Chabang | Factory books freight + insurance to Thai port | Easier, but less visibility on cost |
| DDP | Seller handles everything including Thai duties | Avoid unless the importer of record is clearly documented: we need correct import records for VAT input credit and liability |

## 3. ❗ Import duty: the critical unknown

| Scenario | Duty rate | Import VAT basis | Total import taxes as % of CIF |
|----------|-----------|------------------|-------------------------------|
| A: FTA preference applies (Form E), duty 0% | 0% | 7% × CIF | **7.0%** |
| B: MFN rate as listed by third-party site | 80% | 7% × (CIF + duty) = 7% × 1.8 CIF | **92.6%** |

Calculation: Thai import VAT is charged on CIF + duty. Scenario B = 80% + (7% × 180%) = 80% + 12.6% = 92.6%.
(Import VAT can usually be claimed back as input tax by a VAT-registered company; the duty cannot.)

**Actions (before any money is paid to the factory):**

| # | Action | Who |
|---|--------|-----|
| 1 | Send the supplier's spec sheets to 2 licensed Thai customs brokers; ask for the 8-digit HS code, the MFN rate and the ACFTA (Form E) rate | Owner / admin agent drafts the email |
| 2 | If unclear, apply for an **advance ruling** on classification from the Thai Customs Department | Broker |
| 3 | Confirm the factory can issue a valid Form E and meets the ACFTA rules of origin | Supplier |
| 4 | Check classification of screw piles and furniture separately (different HS chapters, different rates) | Broker |
| 5 | Add the confirmed rates to `tools/landed_cost.py` inputs | Admin agent |

Sources for the 80% figure: [treayo.com 940620](https://treayo.com/en/compare/940620), [treayo.com 940690](https://treayo.com/en/compare/940690) (third-party; **not** an official Thai Customs source).

## 4. Documents per shipment (checklist)

| Document | From | Needed for |
|----------|------|-----------|
| Commercial Invoice | Factory | Customs value |
| Packing List | Factory | Customs, unloading |
| Bill of Lading | Shipping line / forwarder | Releasing the cargo |
| Form E (ASEAN–China CO) | Factory (issued in China) | FTA duty preference |
| Marine cargo insurance certificate | Forwarder / insurer | Claims |
| TISI licences / certificates (for controlled electrical parts) | Factory / TISI | Customs release of controlled goods |
| Product drawings, spec sheets | Factory | Classification, customer docs |
| Pre-shipment inspection report | Inspector | Paying the balance |

## 5. Electrical & TISI compliance

| Component | TISI status (to confirm) | Plan |
|-----------|-------------------------|------|
| PVC-insulated copper cable | Listed as TISI compulsory ([TÜV SÜD](https://www.tuvsud.com/en-us/services/product-certification/thailand-tisi)) | Ask factory for TISI-certified cable, or fit Thai cable locally |
| Plugs & socket outlets | Commonly listed as mandatory in vendor summaries; confirm | Same |
| Circuit breakers / RCDs | **Not confirmed** | Confirm with TISI or a compliance consultant |
| LED lights / drivers | Confirm | Same |

**Fallback plan if the factory can't supply compliant parts:** order units with
conduit and back-boxes only, and have a **licensed Thai electrician** fit
TISI-marked cable, sockets and breakers in our warehouse before sale. This costs
labour but removes the customs risk and gives us a local compliance record.

## 6. Quality control

| Stage | Check |
|-------|-------|
| Sample | Order or inspect 1 sample unit (or a video inspection) before the full container |
| During production | Weekly photos/videos of the frame, panels and wiring |
| Pre-shipment | Third-party inspection: dimensions, welds, galvanising, panel damage, door/window operation, electrical continuity + insulation test, fold/unfold test |
| Arrival | Our own checklist per unit; photo record; defects reported to the factory within 7 days |
| Payment protection | Balance only after a passed inspection; ask for a retention (e.g. a % paid after arrival QC). Terms to negotiate |

## 7. Supplier communication (always online)

| Need | Tool | Notes |
|------|------|-------|
| Day-to-day chat | WeChat (personal) used by a human, plus WeCom (企业微信) for business | Automating personal WeChat with unofficial bots risks the account being banned: don't |
| AI assistance | Supplier agent drafts messages in Chinese, translates replies, tracks production milestones; a human sends or approves on WeChat | See doc 06 |
| Records | Every PI, invoice, photo and inspection report saved to the shared drive + linked to the purchase order in the CRM | |
