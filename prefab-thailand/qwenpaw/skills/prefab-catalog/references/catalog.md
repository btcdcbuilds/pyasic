# Catalogue

**Supplier:** Henan Jinming Metal Material Co., Ltd. (Zhengzhou, Henan, China).
**Source:** supplier catalogue "Catalog-Henan_Jinming 2024" (28 pages), received 2026-10-12.
Page numbers below refer to that PDF. Values are **as printed by the supplier**.
`TBD` = not in the catalogue: ask the supplier, never guess.

## Which model are we buying?

The owner's quoted price (about USD 1,300 per mobile office) has **not yet been
matched to a model** in writing. The fold-out office described in the plan best
matches the **Folding Container House (FD-20)**. Confirm the model, the price
and the Incoterm on the supplier's proforma invoice.

## Units we can stock

| Code (ours) | Supplier name | Catalogue page | Size as shipped (L × W × H mm) | Size installed (L × W × H mm) | Units per 40HQ | Install (supplier claim) |
|-------------|---------------|----------------|-------------------------------|-------------------------------|----------------|--------------------------|
| **UNIT-FD-20** | Folding Container House | p.10 | 5800 × 2500 × **360** (see note 1) | 5800 × 2500 × **2450** (see note 1) | 12 | 2 workers, 10 min |
| UNIT-FP-20 | Folding And Packing Container | p.18 | 5800 × 2500 × 560 | 5800 × 2500 × 2650 | 6 | 2 workers, 2 min |
| UNIT-EX-20 | Expandable Container House (20ft) | p.12 | 5900 × 2200 × 2480 | 5900 × 6300 × 2480 | 2 | 5 workers, 10 min |
| UNIT-DT-20 | Detachable Container House | p.15 | Flat-packed parts (20GP = 8 units) | 5950 × 3000 × 2800 | 17 | 4 workers, 3 h |
| UNIT-FK-20 | Flat Pack Container House | p.17 | Flat-packed | 5950 × 2438 × 2896 | 6 | 4 workers, 2 h |

Note 1: page 10 prints "Folded Size 5800 × 2500 × 2450 H" and "Unfolded Size
5800 × 2500 × 360 H". These labels look swapped (a folded unit is the flat
one). The table shows the likely meaning. **Confirm with the supplier before
using the folded height for loading or truck plans.**

The catalogue also shows a 40ft expandable house (p.12) with no dimensions: `TBD`.

## Materials (as printed)

| Code | Frame | Walls | Roof / ceiling | Floor | Windows | Door |
|------|-------|-------|----------------|-------|---------|------|
| UNIT-FD-20 | Galvanised steel pipe; whole box glued for waterproofing | 50 mm rock wool sandwich panel | 50 mm rock wool sandwich panel | 15 mm MGO board | Aluminium alloy sliding | Fire-proof steel door |
| UNIT-FP-20 | 2.3 mm Q235B steel frame | 50 mm rock wool sandwich panel | 100 mm glass wool insulation (ceiling) | 18 mm cement board + PVC leather | UPVC double glass | TBD |
| UNIT-EX-20 | TBD | 75 mm rock wool / EPS sandwich panel | 50 mm EPS sandwich panel | 18 mm MGO board | TBD | TBD |
| UNIT-DT-20 | 2.3 mm Q235B galvanised steel | 50 mm rock wool sandwich panel | TBD | MGO board / cement fibre board | TBD | TBD |
| UNIT-FK-20 | 2.3 mm Q235B steel frame | 50 mm rock wool sandwich panel | 100 mm glass wool insulation (ceiling) | 18 mm cement board + PVC leather | UPVC double glass | TBD |

## Not in the catalogue (ask the supplier)

| Item | UNIT-FD-20 | Others |
|------|-----------|--------|
| Price (FOB) | Owner's figure about USD 1,300: confirm on PI | TBD |
| Weight per unit (kg) | TBD | TBD |
| Electrical fit-out (lights, sockets, switchboard, external inlet), Thai 220 V / 50 Hz, component brands and certificates | TBD | TBD |
| AC bracket / pipe sleeve option | TBD | TBD |
| Door and window positions and sizes (for drawings) | TBD | TBD |
| Max stacking height + load data | TBD | TBD |
| Floor load rating, wind rating | TBD | TBD |
| Warranty terms | TBD | TBD |
| Form E (China–ASEAN certificate of origin) available? | TBD | TBD |

## Certificates shown in the catalogue (p.3)

The catalogue shows ISO 9001, CE and Chinese patent certificates. **Ask for copies**
and check them before quoting them to customers. Don't claim any rating
(fire, wind, structural) that isn't on a certificate we hold a copy of.

## Other supplier products (not stocked: quote on request only)

Portable toilets (p.19), KT room prefab buildings (p.20), Apple capsule (p.21),
Space capsule (p.22), light-steel villa (p.23), house on wheels (p.24), steel
structure buildings (p.25). No sizes or specs in the catalogue: everything `TBD`.

## Option packs

| Code | Name | Changes to geometry (for CAD/layout) |
|------|------|--------------------------------------|
| AC-R | AC-ready | Outdoor-unit bracket on wall: TBD position/size |
| AC-I | AC supplied & installed | Outdoor unit footprint TBD (needs clearance, see layout rules) |
| INS+ | Upgraded insulation | None external |
| WET | Wet room | Internal partition TBD; drain/water stub positions TBD |
| SEC | Security | Grilles on windows; none to footprint |
| BRAND | Customer branding | None to geometry |

## Screw-pile kits

| Kit | For model | Piles (count) | Pile layout (grid, spacing mm) | Pile length / shaft Ø / helix Ø (mm) | Engineer ref |
|-----|-----------|---------------|-------------------------------|--------------------------------------|--------------|
| PILE-KIT-FD20 | UNIT-FD-20 | TBD | TBD | TBD | TBD (licensed engineer) |
| PILE-KIT-EX20 | UNIT-EX-20 | TBD | TBD | TBD | TBD (licensed engineer) |

## Layout footprints (for `site_overlay.py` dims.json)

Installed footprint, length × width in metres, from the table above:

```json
{
  "UNIT-FD-20": {"length_m": 5.8,  "width_m": 2.5},
  "UNIT-FP-20": {"length_m": 5.8,  "width_m": 2.5},
  "UNIT-EX-20": {"length_m": 5.9,  "width_m": 6.3},
  "UNIT-DT-20": {"length_m": 5.95, "width_m": 3.0},
  "UNIT-FK-20": {"length_m": 5.95, "width_m": 2.438}
}
```

## STEVE models

| Code | STEVE document | Status |
|------|----------------|--------|
| UNIT-FD-20 | `f056b551-6188-4501-a708-1a917f153377` ("UNIT-FD-20 Jinming folding container house (concept)") | Concept envelope: 5800 × 2500 × 2450 mm, 50 mm shell, built and checked 2026-10-12. No doors/windows yet (positions not in catalogue). Height depends on the p.10 label check |
