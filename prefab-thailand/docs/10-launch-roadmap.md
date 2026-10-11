# 10 — Launch Roadmap

Weeks are indicative. **Gate 1 and Gate 2 are hard stops**: don't pay the
factory until both pass.

## Phase 0: Validate (weeks 1–3)

| # | Task | Owner | Output |
|---|------|-------|--------|
| 0.1 | Send the question list (doc 02 §1) to the supplier; get drawings, specs, component list, FOB prices, units per 40HC | Owner | Supplier pack |
| 0.2 | **Customs broker x2: HS code, MFN + Form E duty rate, TISI check** | Owner | Written advice → **Gate 1** |
| 0.3 | Lawyer meeting (doc 08 §8 questions) | Owner | Structure + permit + truck-hire opinion → **Gate 2** |
| 0.4 | Accountant chosen; VAT/company registration plan | Owner | Engagement letter |
| 0.5 | Competitor research (15+ sellers) | Research agent | `research/competitors.csv` |
| 0.6 | Freight quotes x3, inspection quote, haulage quote | Owner / admin agent | Quotes in `shipment.csv` |
| 0.7 | Run `landed_cost.py` with real numbers in both duty scenarios; set prices vs competitors | Owner | Go / no-go decision |

**Gate 1:** duty rate confirmed in writing and the business works at that rate.
**Gate 2:** a legal structure is available that fits the owners; no blocker on selling units.

## Phase 1: Set up (weeks 3–8)

| # | Task | Output |
|---|------|--------|
| 1.1 | Register company, bank account, VAT, importer registration | Registered entity |
| 1.2 | Choose name, logo; trademark filing; domains | Brand |
| 1.3 | Warehouse shortlist → lease signed (after lawyer review) | Premises |
| 1.4 | Negotiate supplier agreement + PI; agree inspection + Form E | Signed PI |
| 1.5 | Place order (deposit) → production starts (~30 days) | PO |
| 1.6 | Source truck with crane, insurance, driver; confirm DLT licence for hire | Truck ready |
| 1.7 | Engineer: standard pile layouts per unit size; stacking calc | Drawings |
| 1.8 | Legal templates: terms of sale, warranty, reservation, handover, truck job sheet, privacy notice | Templates |

## Phase 2: Build sales machine (weeks 4–10, in parallel)

| # | Task | Output |
|---|------|--------|
| 2.1 | LINE OA, Facebook Page, WhatsApp Business, Meta Business verification, Lazada seller account | Channels live |
| 2.2 | Website v1 (doc 07 §6) | Site live |
| 2.3 | Knowledge base + price list + agent phase A–B (doc 06 §4) | Bot answering + quoting |
| 2.4 | Brand character: name, avatar, voice guide, first 20 posts/articles | Content bank |
| 2.5 | Pre-sale campaign: reservation deposits + B2B LOIs | Pre-orders |

## Phase 3: First container lands (weeks ~9–14, depends on transit)

| # | Task | Output |
|---|------|--------|
| 3.1 | Pre-shipment inspection passed → balance paid → loaded | Inspection report |
| 3.2 | Clearance with Form E; haul; unload; incoming QC | Stock in warehouse |
| 3.3 | Show unit built, furnished, filmed | Content + showroom |
| 3.4 | Deliver pre-orders; collect reviews and case studies | First happy customers |
| 3.5 | Turn on paid ads with "in stock" offers | Lead flow |

## Phase 4: Scale (after first container)

| # | Task | Trigger |
|---|------|---------|
| 4.1 | Re-order (container 2) | Stock below the reorder point (set from sales speed) |
| 4.2 | Rental fleet | Repeat contractor demand |
| 4.3 | Agents phase D–F (dispatch, support, Lazada, finance) | Volume |
| 4.4 | Move this plan to its own repository + build the full app | When the owner decides |

## Immediate next 5 actions (this week)

| # | Action |
|---|--------|
| 1 | Answer the 6 owner decisions in the README |
| 2 | Message the supplier for drawings, spec sheets, component list, FOB prices, units per 40HC |
| 3 | Contact 2 licensed customs brokers with the specs (duty + Form E + TISI) |
| 4 | Book an initial meeting with a Thai business lawyer and an accounting firm |
| 5 | Shortlist warehouse areas |
