# 02 — Products & Options

All dimensions, weights and specs below are **to be confirmed from the
supplier's drawings**. The structure is what matters here: how we turn the
supplier's products into a clear, sellable catalogue.

## 1. Base product: fold-out / expandable unit

| Item | Requirement we give the supplier | Supplier to confirm |
|------|-------------------------------|---------------------|
| Type | Folding or expandable (wing) steel-frame unit | Model names, drawings |
| Sizes to stock | Start with 1–2 sizes only (e.g. a "20ft-equivalent" and a "40ft-equivalent" if offered) | Folded and unfolded dimensions, weight |
| Structure | Galvanised steel frame, corner castings or lifting points for crane/forklift | Steel grade, galvanising spec, wind-load rating |
| Walls / roof | Insulated sandwich panels (EPS / rock wool / PU options) | Panel thickness, fire rating of each core |
| Floor | Cement board or similar + vinyl finish | Floor load rating (kg/m²) |
| Doors / windows | Lockable steel door; aluminium sliding windows with insect screen | Sizes, glass type |
| Stacking | Must be stackable for accommodation (2 high minimum) | Max stack height, certified load calc |
| Electrical (pre-installed) | LED lights, power points, small consumer unit/switchboard with RCD/RCBO protection, **external inlet / connection point** | Full component list incl. brand and certifications (see doc 03 §5) |
| Thai compatibility | 220–230 V, 50 Hz; Thai-compatible sockets | Socket type, breaker ratings |
| AC readiness | Reinforced mounting point / bracket for split-type AC outdoor unit, pre-made sleeve for refrigerant pipes + drain, dedicated circuit | Included as option or standard |
| Units per shipping container | — | **How many folded units fit in a 40ft HC** (this drives freight cost per unit) |

### Questions for the supplier (send before ordering)

| # | Question |
|---|----------|
| 1 | Full drawings + spec sheets for each model, in English |
| 2 | How many folded units per 40HC, and the loading method (do they need a crane/forklift to unload?) |
| 3 | Certificates held: ISO 9001, CE, SGS/BV test reports, fire test reports for panels |
| 4 | Electrical component brands and their certifications; can they fit components we specify? |
| 5 | Warranty terms (structure, roof leaks, panels, electrics) |
| 6 | Spare parts availability and price list (panels, seals, hinges, locks) |
| 7 | Payment terms (e.g. deposit / balance before shipping) and whether they accept a retention after inspection |
| 8 | Will they issue **Form E** (ASEAN–China certificate of origin)? Through their local CIQ/CCPIT? |
| 9 | Can they put our brand on the units (nameplate/sticker) and in manuals? |
| 10 | Install manual + video; how long the unfolding takes and how many people it needs |

## 2. Option packs (how we sell it)

Keep options to a short, fixed menu so the AI agents and the website
configurator can price them without errors.

| Code | Option pack | Contents (draft) | Fitted where |
|------|-------------|------------------|--------------|
| BASE | Base unit | Shell, lights, power points, switchboard, external inlet | Factory |
| AC-R | AC-ready | Bracket, pipe sleeve, drain, dedicated AC circuit | Factory |
| AC-I | AC supplied & installed | Split-type AC (sized by m²), install by licensed partner | Thailand |
| INS+ | Upgraded insulation | Thicker / rock-wool panels (heat and fire) | Factory |
| WET | Wet room | Toilet + shower + basin + water heater, plumbing stubs | Factory (check feasibility on a folding unit) |
| SEC | Security | Window grilles, security door, padlock hasp | Factory or Thailand |
| SOL | Solar-ready (phase 2) | Roof mounting points + cable entry | Factory |
| BRAND | Customer branding | Vinyl logo wrap | Thailand |

## 3. Furniture packs

Source locally in Thailand at first (fast and no import risk), or add to the
China container if the supplier can consolidate furniture cheaply.

| Code | Pack | Contents (draft) | Target customer |
|------|------|------------------|-----------------|
| F-SITE | Site office | 2 desks, 2 chairs, plan table, filing cabinet, whiteboard | Contractors |
| F-EXEC | Manager office | Desk, executive chair, 2 visitor chairs, cabinet | Data-centre / client offices |
| F-MEET | Meeting | Table for 6, 6 chairs, TV bracket | Site meeting rooms |
| F-DORM | Dormitory | Bunk beds (steel), lockers, mattresses | Staff accommodation |
| F-HOME | Studio home | Bed, wardrobe, sofa, small kitchenette | Homeowners |

## 4. Screw piles

| Item | Notes |
|------|-------|
| Why | Unit sits level, above ground (flood and termite resistant), no concrete curing time, removable and reusable when relocating |
| Spec to source | Hot-dip galvanised steel, shaft diameter / length / helix size by soil type, adjustable head plate to match the unit's frame |
| Source | Same China supplier or a separate Chinese screw-pile factory; consolidate in the same container if possible |
| Installation | Hand-held driver for small piles; skid-steer / mini-excavator attachment for larger ones (buy or rent) |
| Engineering | Pile count/spacing per unit should be set by a **Thai licensed civil engineer** (Council of Engineers). Needed for stacked accommodation, and for customers who need a building permit |
| Stock | Kits per unit size (e.g. "Kit-20: N piles + heads + bolts") |

## 5. SKU structure (for website, Lazada, CRM, accounting)

```
UNIT-{model}-{size}           e.g. UNIT-FX-20
OPT-{code}-{size}             e.g. OPT-ACR-20
FURN-{code}                   e.g. FURN-F-SITE
PILE-KIT-{size}               e.g. PILE-KIT-20
SRV-DELIV-{zone}              e.g. SRV-DELIV-Z2
SRV-INSTALL-{size}            e.g. SRV-INSTALL-20
SRV-TRUCK-{halfday|day|trip}
```

A single **price list table** in the database (doc 07) is the only place
prices live. Website, Lazada listings, AI agents and quotes all read from it.
