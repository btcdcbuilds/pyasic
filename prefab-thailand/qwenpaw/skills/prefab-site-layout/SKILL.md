---
name: prefab-site-layout
description: "Place prefab units to scale on a customer's satellite, drone or sketch image and measure clearances, producing a layout image and updating site.json. Use after prefab-site-intake has a site.json with customer-confirmed measurements, or when a customer asks to move or add units on an existing layout."
metadata:
  qwenpaw:
    emoji: "🗺️"
    requires: {}
---

# Site Layout

Load `prefab-catalog` first (catalogue dimensions, layout rules, site.json format).

## Preconditions (stop and hand back to sales if any fail)

- `measurements_confirmed_by_customer` is `true`
- every unit's model has confirmed (not `TBD`) footprint dimensions in `catalog.md`
- the base image exists

## Steps

1. **Set the scale.** On the base image, find two points whose real distance is a confirmed measurement (e.g. the gate posts, a boundary side). Write `p1_px`, `p2_px` and `distance_m` into `base_image.scale`. If no confirmed measurement is visible in the image, stop and ask sales to get one.
2. **Trace the boundary** as `boundary_px` (pixel corners, in order) using the customer's sketch/deed and the image.
3. **Place units:** set `center_px` and `rotation_deg` for each unit. Default rules: keep units inside the boundary, doors facing the access path, AC outdoor units on the side away from neighbours, leave the truck/crane access path clear.
4. **Write `dims.json`** next to `site.json`: each model's *unfolded* footprint `length_m` and `width_m`, copied from `catalog.md`.
5. **Run the script** (cwd = this skill's directory):
   ```
   python3 scripts/site_overlay.py --site <site_dir>/site.json --dims <site_dir>/dims.json --out <site_dir>/layout.png
   ```
6. **Check the JSON report** against `layout-rules.md`:
   - any `overlaps` or `outside_boundary`: fix the placement and re-run
   - gaps below a rule's minimum: fix, or list them for the customer
   - where a rule's minimum is `TBD`: report the measured gap but don't call it compliant
7. **Look at `layout.png`** with `view_image` to confirm it reads correctly (labels visible, scale bar present, disclaimer present).
8. **Update `site.json`**: `outputs.layout_png`, `checks` (copy the report), status `laid_out`.
9. **Hand off** to the CAD agent (Cad Carl) with `chat_with_agent`, passing the `site.json` path.

## Customer edits

"Move it 2 m left" → convert metres to pixels with `m_per_px`, update `center_px`, re-run from step 5. Keep a note of each change in `notes[]`.

## Never

- Estimate scale from the image alone
- Remove or shrink the disclaimer on the image
- Say a layout meets local setback or permit rules
