# site.json format

One file per customer site, saved at
`<workspace>/sites/<customer_id>/<site_id>/site.json`. Every agent reads and
updates the same file. Units: metres and degrees. Image coordinates: pixels from
the top-left corner.

```json
{
  "site_id": "S-2026-0001",
  "customer_id": "C-0001",
  "status": "intake | measured | laid_out | modelled | qa_passed | sent",
  "location": {"lat": null, "lng": null, "address": ""},
  "measurements_confirmed_by_customer": false,
  "measurements": [
    {"label": "front boundary", "value_m": null, "source": "photo IMG_001.jpg"}
  ],
  "boundary_m": [[0, 0], [0, 0]],
  "boundary_px": [[0, 0], [0, 0]],
  "base_image": {
    "path": "base.jpg",
    "kind": "satellite | drone | sketch",
    "provider": "",
    "scale": {
      "method": "two_points",
      "p1_px": [0, 0], "p2_px": [0, 0], "distance_m": null,
      "m_per_px": null
    },
    "north_deg": null
  },
  "units": [
    {"label": "Office 1", "model": "UNIT-FX-20", "options": ["AC-R"],
     "center_px": [0, 0], "rotation_deg": 0}
  ],
  "access": {"gate_width_m": null, "road_notes": "", "overhead_lines": "unknown"},
  "checks": [],
  "outputs": {"layout_png": null, "layout_pdf": null, "steve_document_id": null,
              "drawing_pdf": null, "model_glb": null, "quote_pdf": null},
  "notes": []
}
```

Rules:

- `measurements_confirmed_by_customer` must be `true` before any layout is sent.
- `scale.distance_m` must come from a confirmed measurement, never estimated from the image.
- `boundary_px` is the property outline traced on the base image (used by `site_overlay.py`).
- Units reference catalogue model codes only; their dimensions are read from `catalog.md` at layout time.
