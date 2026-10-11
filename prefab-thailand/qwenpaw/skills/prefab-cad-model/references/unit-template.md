# Unit part template (STEVE, CadQuery-based, millimetres)

Starting point for a catalogue unit part. Replace every `None` with the value
from `prefab-catalog/references/catalog.md` before building; a `None` left in
must stop the build rather than be guessed. Check each call with STEVE's
`api_reference` before use (the signatures below were checked for `extrude` and
`shell`).

```python
"""UNIT-FX-20 fold-out office (unfolded). Source: supplier drawing <ref> rev <rev>.
Parameters set the unfolded outer size, wall/roof/floor thickness and openings."""
from steve import Model

length = None        # mm Unfolded outer length   (catalog.md)
width = None         # mm Unfolded outer width    (catalog.md)
height = None        # mm Outer height            (catalog.md)
wall = None          # mm Wall panel thickness    (supplier spec)

model = Model()

with model.sketch("sketch_1", on="XY", name="Footprint") as s:
    s.rect("r1", (-length / 2, -width / 2), (length / 2, width / 2))
model.extrude("extrude_1", "sketch_1", distance=height)

# Hollow the box: closed shell (walls, floor and roof all `wall` thick)
model.shell("shell_1", remove=[], thickness=wall)

# Openings: add door_1, window_1 ... as sketches on the wall faces at the
# catalogue positions, cut with op="cut" through one wall only. Look up face
# names after the first build (read_design / inspect_model), don't guess them.

result = model.result()
```

Notes:

- Model the **unfolded** state for layouts and drawings. A folded-state part
  (for truck/container loading drawings) can be a second part later.
- Keep option geometry (AC outdoor bracket, window grilles) as separate,
  suppressible features (`suppressed=True` when the option isn't ordered).
