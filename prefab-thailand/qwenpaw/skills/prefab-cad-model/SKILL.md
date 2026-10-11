---
name: prefab-cad-model
description: "Build CAD models and drawings of our prefab units and customer site arrangements in STEVE (via its MCP server): parametric unit parts from catalogue dimensions, a site design placing units and screw piles, ISO drawing sheets (PDF/DXF) and 3D exports. Use after prefab-site-layout has produced a laid-out site.json, or when a catalogue unit model needs creating or updating."
metadata:
  qwenpaw:
    emoji: "🏗️"
    requires: {}
---

# CAD Model (STEVE)

Requires the STEVE MCP server connected to this agent. Load `prefab-catalog`
first. STEVE has its own skills; read them with STEVE's `read_skill` before
working in their area: **steve-designs** (multi-unit sites), **steve-drawings**
(drawing sheets), **steve-materials** (mass). Use STEVE's `api_reference` to look
up calls instead of guessing them.

## A. Catalogue unit parts (one-time per model, re-done when drawings change)

1. `list_designs(search="UNIT-FX")`: reuse and update an existing part rather than making a new one.
2. Otherwise `write_design` a **part** named after the model code (e.g. `UNIT-FX-20 fold-out office`), with a docstring naming the supplier drawing and revision.
3. Every dimension is a top-level parameter copied from `catalog.md` (see [references/unit-template.md](references/unit-template.md)). If any needed value is `TBD`, stop and report what's missing.
4. Model the unfolded unit: floor, walls, roof as a shelled box, then door/window/AC-bracket openings at catalogue positions. Keep openings as separate features with clear ids (`door_1`, `window_1`, …) so options can toggle.
5. `generate_model`, then `inspect_model` to check overall dimensions against the catalogue, to the millimetre.

## B. Customer site design

1. `write_design` a **design** named `SITE <site_id> <customer short name>`.
2. `params.py`: nothing invented: only values derived from `site.json` and the catalogue.
3. `link_design` each catalogue unit part (pinned revision) and the pile-kit part if it exists.
4. Place units from `site.json`: convert each unit's `center_px` to metres with `m_per_px` (origin = the scale point `p1_px`; +X to the image right, +Y to the image *up*, so negate pixel y), `rotation_deg` about Z. Write placements to `assembly_data.py`, not inline in `main.py`.
5. Add a fit check (`design.fit_check`) so units and piles can't overlap.
6. Add the drawing sheets (steve-drawings):
   - Site plan: top view, ISO A3, `bom=True`
   - One sheet per unit model: front/top/right/iso, overall dimensions
   - Title block `fields`: our company name, `number` = site_id, `customer`, `date` = today. Leave `checked_by`/`approved_by` empty (a human fills them)
   - `notes` must include: "Concept drawing for planning and quotation only. Not for construction or permit submission unless checked and signed by a licensed engineer."
   - Don't invent tolerances, datums or approvals.
7. `generate_model` (full build), then check the `drawings` metadata for `overflow`, `dangling`, `dimension_problems`, `error`, and the fit check for overlaps. Fix and rebuild until clean.
8. Update `site.json`: `outputs.steve_document_id`, status `modelled`.
9. Hand off to QA Agent, then Sales Rep Steve. Tell them the drawings and 3D exports are in STEVE (Export → Drawing / Drawings SVG·DXF; the model export for GLB/STEP). You can't download them yourself.

## Engineering limits

- Structural simulation in STEVE may be used only as an internal sanity check. Never send simulation results to customers or call a design "safe", "certified" or "approved". Stacking, piles and anything structural go to the licensed engineer.
- Weight from STEVE is valid only after real materials and thicknesses are assigned (steve-materials); otherwise use the catalogue weight.
