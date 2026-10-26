# 11 — Starting Budget & Warehouse Near the Port

## 1. Owner inputs (given 2026-10-11)

| Input | Value | Source |
|-------|-------|--------|
| Shareholders | All Thai | Owner |
| Starting budget | USD 20,000 | Owner |
| Unit price (mobile office) | about USD 1,300 each (assumed FOB China: confirm the Incoterm on the PI) | Owner / supplier |
| Units per 40ft container | **Unknown: ask the supplier** | — |

**Thai shareholders:** this removes the Foreign Business Act issue (README issue #2). Any foreign
director or employee still needs a work permit.

## 2. What USD 20,000 covers (arithmetic only)

The table uses USD 1,300 per unit. Duty and VAT are worked out on **FOB**, which
gives the *minimum*: the real base is CIF (FOB + freight + insurance), which is
higher. Freight, broker, port, haulage, warehouse, company setup, website and
truck are **not** included, because those quotes aren't in yet.

| Units | FOB total | Budget left after FOB | **Duty 0%**: min import VAT | 0%: FOB + VAT | 0%: left for everything else | **Duty 80%**: min duty + VAT | 80%: FOB + duty + VAT |
|------:|----------:|---------------:|-------------:|-----------:|------------:|--------------:|------------:|
| 6 | 7,800 | 12,200 | 546 | 8,346 | 11,654 | 7,222.80 | 15,022.80 |
| 8 | 10,400 | 9,600 | 728 | 11,128 | 8,872 | 9,630.40 | **20,030.40 (over budget)** |
| 10 | 13,000 | 7,000 | 910 | 13,910 | 6,090 | 12,038.00 | 25,038.00 (over budget) |
| 12 | 15,600 | 4,400 | 1,092 | 16,692 | 3,308 | 14,445.60 | 30,045.60 (over budget) |
| 14 | 18,200 | 1,800 | 1,274 | 19,474 | 526 | 16,853.20 | 35,053.20 (over budget) |

Formulas: duty = 80% × FOB; VAT = 7% × (FOB + duty). Checked with a script.

### What this means

| Finding | Consequence |
|---------|-------------|
| At 80% duty, even **8 units** exceed USD 20,000 before freight or any other cost | The business can't launch on this budget unless the 0% Form E rate applies, or duty is deferred (see §3) |
| At 0% duty, about **8–10 units** leave roughly USD 6,000–8,900 for freight, clearance, warehouse, setup and marketing | Feasible but tight. The freight quote decides it |
| A truck with a crane is **not affordable** in this budget | Phase 1: hire a crane truck (รถเฮี๊ยบ / รถเครน) per delivery from a local operator (get 3 quotes), charge the delivery to the customer. Buy the truck from profits |
| A full container may hold more units than we can afford | Ask the supplier for per-container capacity. Options: fill the container with fewer units plus cheaper items (screw piles, furniture), or share/LCL |
| Import VAT is reclaimable (VAT-registered company), but it's still cash at the border | Register for VAT before the shipment arrives |

### Phase-1 budget plan (fill in from quotes)

| Item | USD | Basis |
|------|----:|-------|
| Units (N × 1,300) | TBD | Supplier PI |
| Screw piles for N units | TBD | Supplier quote |
| Ocean freight + insurance | TBD | Forwarder quote |
| Duty + import VAT | TBD | Broker's written rate |
| Broker, port charges, haulage, unloading | TBD | Quotes |
| Company registration + accountant setup | TBD | Quotes |
| Warehouse / yard (first months) or bonded storage fees | TBD | Quotes |
| Website + agents (mostly our own build; hosting and API costs) | TBD | Pricing pages |
| Launch ads | TBD | Owner decision |
| Reserve (≥ 10%) | TBD | — |
| **Total** | **≤ 20,000** | |

## 3. Warehouse near the port: duty deferral

What you heard is **partly right**: duty can be **deferred** (paid later) but
not avoided, because our goods are sold inside Thailand.

| Option | How it works | Duty | Fit for us |
|--------|-------------|------|-----------|
| **Public / general bonded warehouse** (operated by a licensed logistics company) | Goods are stored under customs control without paying duty or VAT on arrival. Duty is paid when goods are released for sale in Thailand ([Lexology](https://www.lexology.com/library/detail.aspx?g=746d374e-ef20-4e09-90c5-bc0b25de471a), [Fig Tree](https://figtreethailand.com/what-is-a-bonded-warehouse-in-thailand-and-could-it-work-for-your-business/)) | Deferred until release; storage commonly cited as up to 2 years, extendable | **Good fit for cash flow**: release and pay duty per unit as each one is sold, instead of all at once. We rent space and pay storage + handling fees. No licence of our own needed |
| Own bonded warehouse | We get our own customs licence | Deferred | Not for phase 1: licensing, security and bonding requirements |
| Customs Free Zone | Treated as outside Thai customs territory; duty suspended while goods stay in the zone or are re-exported ([DITP Free Zone PDF](https://onestopservice.ditp.go.th/download/file/6.%20Free%20Zone.pdf), [Benoit & Partners](https://benoit-partners.com/thai-customs-free-zones/)) | Paid when goods leave for domestic sale | Mainly built for manufacturers and re-exporters. Little benefit for a pure domestic reseller |
| BOI / EEC incentives | Tax holidays for targeted activities in Chonburi, Rayong, Chachoengsao ([Forvis Mazars](https://www.forvismazars.com/th/en/insights/doing-business-in-thailand/legal/revised-investment-incentives-in-eec)) | — | The listed activities are R&D, advanced tech, infrastructure. One source says BOI generally doesn't promote pure trading ([Tetra](https://www.tetraconsultants.com/jurisdictions/register-company-in-thailand/thailand-free-trade-zones/)). **Unlikely for us**: verify with BOI |

**Important:** deferring duty doesn't fix the 80% problem. It only spreads the
payment over time. The Form E rate is still the deciding question.

### Practical setup near Laem Chabang

| Step | Action |
|------|--------|
| 1 | Ask 2–3 Laem Chabang / Sriracha logistics firms for **bonded-warehouse** storage quotes for folded units (per unit per month + handling + release paperwork per release) |
| 2 | Check whether they allow a **show unit** in their yard. If not, keep the show unit (duty paid) at a small rented yard or the first customer's site, with their permission |
| 3 | Plan releases: customer pays deposit → we file a release declaration → pay duty + VAT on that unit → deliver |
| 4 | Confirm with the broker whether Form E (if it applies) can still be used for goods released from bonded storage, and how long the Form E stays valid |

The Laem Chabang / Sriracha / Chonburi area also suits the target customers:
EEC industrial estates and data-centre projects are in Chonburi/Rayong, and
Bangkok is reachable by motorway. (This is a location argument, not a tax
incentive.)

## 4. Update 2026-10-12: Jinming catalogue

The catalogue says a 40HQ container holds **12 Folding Container Houses**
(UNIT-FD-20, p.10). If the USD 1,300 price is for that model (not yet confirmed):

| Item | USD | Basis |
|------|----:|-------|
| 12 units × 1,300 (one full 40HQ) | 15,600 | Owner's price × catalogue capacity |
| Minimum import VAT at 0% duty (7% × FOB; real base is CIF, so higher) | 1,092 | Arithmetic |
| **Left from 20,000 for freight, insurance, broker, port, haulage, unloading, storage, company setup, website, ads** | **3,308** | 20,000 − 15,600 − 1,092 |
| Duty at 80% instead (FOB basis) + VAT | 14,445.60 | Not affordable: full container would cost 30,045.60 before freight |

**Reading:** a full container of 12 folding units at 0% duty leaves only about
USD 3,300 for everything else. That's very likely too little once ocean freight
and clearance are quoted. Options to put to the owner once freight quotes arrive:

| Option | Effect |
|--------|--------|
| Order fewer units (e.g. 8) and fill the space with screw piles / furniture | Lowers FOB spend; keeps one container |
| Pre-sell with deposits before ordering | Customer money funds part of the order |
| Bonded storage, pay VAT per unit on release | Spreads the import VAT payment |
| Add funds | Simplest, if available |

Selling price under the cost-plus 25% rule (doc 16) can only be worked out
once the landed cost is known from real quotes.
