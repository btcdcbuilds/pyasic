# 16 — Pricing Policy: Cost-Plus 25%

**Owner decision (2026-10-12):** one simple, fixed rule so agents can't make
pricing mistakes.

## The rule

| Item | Rule |
|------|------|
| Formula | **Selling price ex VAT = cost × 1.25**, rounded **up** to the next THB 100 |
| VAT | + 7% on top (customer sees ex-VAT, VAT and inc-VAT) |
| Who calculates | Only the script `tools/landed_cost.py` (units, piles, furniture bought in) or the back-office price-list sheet (services). **Agents never multiply prices themselves**: they only read the price list |
| Who can change it | Only the owner, by changing the single `markup` value. Every change is dated in the price list |
| Discounts | None by agents. Owner only |

## What counts as "cost"

The cost must be the same definition every time, or the 25% means nothing.

| Product / service | Cost = |
|-------------------|--------|
| Units, options, screw piles | **Landed cost per unit**: FOB + share of freight + insurance + duty (target 0%) + broker, port, haulage, unloading, inspection, local electrical fit-out (from `landed_cost.py`). Import VAT is excluded (reclaimable) |
| Furniture packs (bought in Thailand) | Supplier invoice price ex VAT + delivery to our warehouse |
| Delivery | Crane-truck hire quote for that zone + fuel/tolls if not included |
| Installation | Crew labour (hours × rate) + pile-driving equipment hire + licensed electrician fee |
| AC supply & install | Partner installer's quote ex VAT |
| Truck hire (once we own the truck) | Per-trip cost sheet: fuel, driver, wear, insurance share |

## What 25% markup means in practice

| | Value |
|-|-------|
| Markup on cost | 25% |
| Gross margin on selling price | 25 ÷ 125 = **20%** (a bit more after rounding up) |
| Check: cost THB 1,000 | Price THB 1,250 → rounded up to **THB 1,300** |
| Check: cost THB 1,200 | Price **THB 1,500** exactly |

(Checked with the calculator's `cost_plus_price` function.)

## ⚠️ What the 20% margin has to pay for

The "cost" above **does not include** running costs. They all come out of the 20%:

| Not in cost (paid from margin) |
|-------------------------------|
| Warehouse / bonded storage rent |
| Staff wages, social security |
| Ads and marketing |
| Software, AI and messaging fees |
| Accountant, lawyer, insurance |
| Warranty repairs, damaged stock |
| Company profit |

**Check this before launch:** monthly gross profit (units sold × average price × 20%)
must be higher than monthly running costs (doc 09 §5). If it isn't, either raise
the markup or put a fixed overhead charge per unit into "cost". That is the owner's call;
the agents just apply whatever single number is set.

## How it flows to customers

| Step | Who |
|------|-----|
| 1. New shipment's real quotes go into `landed_cost.py` (markup 0.25) | back-office (owner approves) |
| 2. Output becomes the price-list rows (`valid_from` = today) | back-office |
| 3. Sales agent quotes only from the price list (`prefab-quote` skill) | sales-support |
| 4. QA checks every quote line against the price list | qa-reviewer |
| 5. New shipment with different costs → new price rows; old rows end-dated | back-office |
