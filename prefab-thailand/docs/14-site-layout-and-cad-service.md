# 14 — Site Layout & CAD Service ("We draw it on your land")

Customers send a photo of their measurements (tape-measure notes, a hand
sketch, title-deed map) and optionally a drone photo. Our AI engineering agents
return:

| Deliverable | Format | Made by |
|-------------|--------|---------|
| Site layout on a satellite or drone image, to scale | PNG + PDF | Layla Layout (`prefab-site-layout`) |
| CAD site plan + unit drawings (plan, elevations, pile layout) | PDF / DXF (STEVE drawings) | Cad Carl (`prefab-cad-model`) |
| 3D model of their configured unit(s) on the site | GLB (web/Android AR) + STEP | Cad Carl via STEVE |
| Quote matching the layout | PDF | Sales Rep Steve (`prefab-quote`) |

## 1. Inputs we accept

| Input | What we extract | Notes |
|-------|-----------------|-------|
| Photo of written measurements / sketch | Boundary lengths, distances to fences/house/trees, gate width | `view_image` reads it; agent repeats the numbers back to the customer to confirm **before** drawing |
| Location pin (LINE/WhatsApp location) | Lat/long for the satellite image | |
| Drone photo (top-down) | Site image with real detail | Best when straight down; scale fixed from one known measurement (e.g. gate width) |
| Title-deed (โฉนด) map or a LandsMaps screenshot | Parcel shape | The Department of Lands' LandsMaps app shows parcels; check its terms before using screenshots in our output |
| Ground photos | Slope, access road, overhead wires, trees | Needed for delivery/crane planning |

## 2. Satellite imagery: licensing

| Source | Notes |
|--------|-------|
| Commercial map APIs (Google Maps Platform, Mapbox, Esri, etc.) | Each has terms on attribution, caching and exporting images into PDFs. **Pick one provider and check its terms for "static image in a customer document" before launch** |
| Customer drone photo | No third-party licence issue; best detail |
| Our own drone (later) | Drone registration/permits apply in Thailand (CAAT / NBTC): verify before flying |

## 3. Accuracy rules

| Rule | Why |
|------|-----|
| Scale always comes from a customer-confirmed measurement (or a known map scale), never guessed from the image | Image-only scale can be badly off |
| Every output says: "Concept layout for planning and quotation only. Not a survey. Not for permit submission unless checked by a licensed engineer/surveyor." | Liability + Building Control Act (doc 08) |
| Show clearances: unit to boundary, unit to unit, access path width for the delivery truck/crane | Practical installation check |
| Flag anything under the minimum gaps in `references/layout-rules.md` (set with the engineer) | Thai setback rules vary by area and building type: the engineer sets defaults, and the customer checks locally |
| Stacked (2-storey) layouts always go to a human engineer | Structural + fire safety |

## 4. Process & time targets

| Step | Owner | Target |
|------|-------|--------|
| 1. Collect inputs + confirm measurements | Sales Rep Steve | Same conversation |
| 2. Layout on image | Layla Layout | Set after testing |
| 3. CAD model + drawings | Cad Carl + STEVE | Set after testing |
| 4. QA check | QA Agent | — |
| 5. Send to customer with quote | Sales Rep Steve | — |
| 6. Customer edits ("move it 2 m left") | Loop to step 2 | — |

## 5. Website version

The same pipeline sits behind the website (doc 07 §6): upload photos → the job
goes to Layla/Carl → the customer gets a link with the layout, an AR-ready 3D model
and a quote. Uploaded photos are personal data (PDPA): consent + auto-delete.

## 6. What STEVE is used for

| STEVE feature (from its skills) | Our use |
|--------------------------------|---------|
| Parametric parts + multi-component designs (`params.py`, one component per file, `design.pattern`) | Unit models driven by catalogue dimensions; several units + piles placed on a site |
| Linking saved parts at a pinned revision | Each catalogue unit is saved once and linked into every customer site design |
| Engineering drawings (ISO sheets, views, BOM, title block, PDF/SVG/DXF) | Customer drawing pack with our title block and disclaimer note |
| Materials (mass) | Unit weight for crane/truck planning (only once real materials and thicknesses are modelled) |
| Structural simulation (`simulation-structural`) | Early check of pile/stacking ideas. **Never a replacement for a licensed engineer's sign-off** |
| Fit checks (interference/clearance) | Units and piles don't clash; clearances between stacked units |

Note: STEVE pricing and usage limits may change; check the current plan before relying on it at volume.
