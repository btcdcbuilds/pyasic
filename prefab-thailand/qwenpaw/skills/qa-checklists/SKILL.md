---
name: qa-checklists
description: "Independent checks before anything technical or financial goes to a customer: site layouts, STEVE drawing packs and 3D models, and quotes. Use when another agent sends work for review. Returns PASS or a numbered fix list; never fixes the work itself."
metadata:
  qwenpaw:
    emoji: "🔍"
    requires: {}
---

# QA Checklists

Load `prefab-catalog`. Check against the files, not against what the sending
agent says. Reply with **PASS** or **FIX** plus numbered items. Record the result
in `site.json` `checks[]` (or the quote record).

## Layout (layout.png + site.json)

| # | Check |
|---|-------|
| 1 | `measurements_confirmed_by_customer` is true |
| 2 | Scale comes from a confirmed measurement (`distance_m` matches a confirmed `measurements[]` entry) |
| 3 | Re-measure one unit on the image: length/width in pixels × `m_per_px` matches the catalogue footprint within 2% |
| 4 | No overlaps; no unit outside the boundary (script report) |
| 5 | Gaps listed; none called "compliant" where the rule is TBD |
| 6 | Scale bar, labels and the disclaimer are visible on the image |
| 7 | Escalation cases (stacking, >6 units, power lines, slope) were sent to a human |

## Drawing pack / 3D model (STEVE)

| # | Check |
|---|-------|
| 1 | Build has no errors; `drawings` metadata has no `overflow`, `dangling`, `dimension_problems` |
| 2 | Unit overall dimensions (inspect_model) match `catalog.md` to the millimetre |
| 3 | Unit placements match `site.json` (positions, rotations) |
| 4 | Fit check: no interferences |
| 5 | Title block: company, site_id, customer, date; `checked_by`/`approved_by` empty |
| 6 | Disclaimer note present on every sheet |
| 7 | No invented tolerances, approvals, certifications or "safe" claims |

## Quote

| # | Check |
|---|-------|
| 1 | Every line's price matches a currently valid price-list row (ask `back-office`); no line priced by hand, no discount without owner approval |
| 2 | Quantities and options match what the customer asked for / the layout |
| 3 | VAT 7% computed on the ex-VAT total; totals add up |
| 4 | Validity, payment terms, inclusions/exclusions, permit note present |
| 5 | Above threshold / discount / custom line → owner approval recorded |
