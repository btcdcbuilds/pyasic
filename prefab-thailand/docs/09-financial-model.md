# 09 — Financial Model

**No prices, costs or volumes are assumed in this plan.** Every number must
come from a real quote. Below are the structure, the formulas, and the list of
quotes to collect. The calculator in [`tools/landed_cost.py`](../tools/landed_cost.py)
does the maths once the quotes are in.

## 1. Landed cost per unit (formula)

| Step | Formula |
|------|---------|
| FOB (THB) | FOB price (USD) × FX rate |
| CIF | FOB + share of ocean freight + share of insurance |
| Import duty | CIF × duty rate (**0% or 80%: unconfirmed, see doc 03**) |
| Import VAT | (CIF + duty) × 7%: reclaimable as input VAT if VAT-registered (cash-flow cost, not a final cost) |
| Local costs | Share of: inspection, port/D-O charges, broker fee, haulage, unloading, local electrical fit-out |
| **Landed cost** | CIF + duty + local costs (+ import VAT if not VAT-registered) |
| Selling price ex VAT | Landed cost ÷ (1 − target gross margin) |
| Selling price inc VAT | Price ex VAT × 1.07 |

## 2. Why the duty answer comes first (pure arithmetic, no assumptions)

| | Scenario A: duty 0% | Scenario B: duty 80% |
|-|---------------------|----------------------|
| CIF | 100 | 100 |
| Duty | 0 | 80 |
| Import VAT (7% of CIF + duty) | 7.0 | 12.6 |
| Total cash paid at customs | **107.0** | **192.6** |
| Cost after reclaiming VAT (VAT-registered) | **100** | **180** |

At 80% duty every unit costs 1.8× its CIF value before any local costs.
Competitors importing under a 0% preference would have a large price advantage.
**Confirm the rate in writing before paying the factory deposit.**

(Checked with `tools/landed_cost.py` on a test input of CIF = 100, duty 0% vs 80%.)

## 3. Quotes to collect

| # | Item | From | Into |
|---|------|------|------|
| 1 | FOB price per model + options | China supplier (PI) | `lines.csv` |
| 2 | Units per 40HC per model | Supplier | Freight allocation |
| 3 | Ocean freight 40HC China port → Laem Chabang | 2–3 forwarders | `shipment.csv` |
| 4 | Marine insurance | Forwarder / insurer | `shipment.csv` |
| 5 | HS code + duty rate (MFN and Form E) per item | 2 customs brokers | `lines.csv` |
| 6 | Broker fee, port charges, D/O | Broker / forwarder | `shipment.csv` |
| 7 | Haulage port → warehouse; crane/forklift for unloading | Local trucking | `shipment.csv` |
| 8 | Pre-shipment inspection | Inspection firms | `shipment.csv` |
| 9 | Screw piles FOB + install equipment | Pile supplier | `lines.csv` + capex |
| 10 | Furniture packs | Thai suppliers | Separate price list |
| 11 | Warehouse rent + deposit | Landlords (3 options) | Fixed costs |
| 12 | Flatbed truck with crane (used/new) + insurance | Dealers / insurer | Capex + fixed costs |
| 13 | Staff wages | Market check | Fixed costs |
| 14 | Software: hosting, DB, AI API usage, messaging fees (WhatsApp per-conversation pricing, LINE OA plan) | Providers' pricing pages | Fixed/variable costs |
| 15 | Accountant + lawyer retainers | Firms | Fixed costs |
| 16 | Company registration + licences | Lawyer | Start-up costs |

## 4. Start-up budget (fill in from the quotes)

| Category | Item | Amount (THB) | Source |
|----------|------|--------------|--------|
| Stock | First container: units + options + piles (landed) | TBD | landed_cost.py |
| Capex | Flatbed truck with crane | TBD | Dealer quote |
| Capex | Pile-driving equipment | TBD | Quote |
| Capex | Show unit fit-out + furniture | TBD | Quote |
| Premises | Warehouse deposit + first months' rent | TBD | Lease |
| Setup | Company, licences, trademark, legal templates | TBD | Lawyer quote |
| Setup | Website + agent build | TBD | Build estimate |
| Marketing | Launch ads + content (first 3 months) | TBD | Owner budget |
| Working capital | Wages, fuel, insurance, software for N months until sales cover costs | TBD | Monthly fixed-cost table × N |
| Contingency | 10–15% of the total (planning convention) | TBD | — |

## 5. Monthly fixed costs (fill in)

| Item | THB / month |
|------|-------------|
| Warehouse rent | TBD |
| Staff (incl. social security) | TBD |
| Truck: insurance, finance, maintenance (fuel is variable per job) | TBD |
| Software + AI + messaging | TBD |
| Accounting + legal retainer | TBD |
| Ads (base) | TBD |
| Utilities, phone, internet | TBD |
| **Total fixed** | TBD |

## 6. Break-even (formula)

| Metric | Formula |
|--------|---------|
| Gross profit per unit sold (incl. options/install/delivery) | Avg selling price ex VAT − avg landed cost − variable install/delivery cost |
| Break-even units / month | Total monthly fixed costs ÷ gross profit per unit |
| Truck hire contribution | Hire revenue − fuel − driver overtime − wear (per job) |
| Cash cycle | Days from paying the factory deposit → customer's final payment (target: pre-sell to shorten it) |

## 7. KPIs to track from day one

| KPI | Target (set after first month) |
|-----|--------------------------------|
| Leads per week by channel | — |
| Lead → quote % | — |
| Quote → deposit % | — |
| Cost per lead / per sale by channel | — |
| Avg order value (unit + extras) | — |
| Gross margin % per order | — |
| Days stock in warehouse | — |
| Truck utilisation % (own jobs + hire) | — |
| First-response time (AI) and escalation rate | — |
| Warranty claims per 10 units | — |
