---
name: prefab-catalog
description: "Source of truth for our prefab unit models, real dimensions, option packs, screw-pile kits, layout clearance rules and the site.json format. Load before quoting, laying out a site, building a CAD model, or answering any question about unit sizes, options or what fits on a site. Do not use for prices (prices come only from the price list via prefab-quote)."
metadata:
  qwenpaw:
    emoji: "📦"
    requires: {}
---

# Prefab Catalog

This skill holds facts other skills depend on. Read the reference that applies:

| Need | Read |
|------|------|
| Unit dimensions, weights, options, pile kits | [references/catalog.md](references/catalog.md) |
| Minimum clearances and layout checks | [references/layout-rules.md](references/layout-rules.md) |
| The `site.json` format passed between agents | [references/site-json.md](references/site-json.md) |

## Rules

1. Use only values written in these references. If a value is `TBD`, say it is not confirmed yet and ask `ops-manager`, who gets the answer from the owner; never estimate or invent a dimension, weight or rating.
2. Prices never come from this skill. Use `prefab-quote`.
3. If a customer asks for something not in the catalogue (custom size, 3-storey stacking, special fire rating), hand off to `ops-manager` for an owner decision.
