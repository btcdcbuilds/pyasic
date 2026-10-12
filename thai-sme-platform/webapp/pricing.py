"""Automatic nightly room pricing.

Rule-based and explainable on purpose: an owner can see why tonight costs what it
costs, and the owner sets every lever plus a floor and a ceiling. Inputs per night:
  - base rate of the room type (owner)
  - season the night falls in (owner calendar; defaults per region in docs/PRICING.md)
  - day of week (Fri/Sat uplift)
  - how full that room type already is that night (occupancy)
  - how far ahead the guest is booking (last-minute / early-bird)
Optional later input: a competitor median rate from a licensed rate-shopping feed.

Price = base x product(1 + pct/100) for every rule that applies, clamped to
[floor, ceiling] and rounded. Premiums multiply; only the largest discount applies.
Keep the ceiling moderate: Thailand's Prices of Goods and Services Act s.29 prohibits
"unreasonably high" prices (see docs/PRICING.md). mode: "auto" applies it on the website;
"suggest" keeps the base rate on the website and shows suggestions to the owner.
"""

from __future__ import annotations

from datetime import date

DEFAULTS = {
    "mode": "suggest",
    "floor_pct": 80,
    "ceiling_pct": 160,
    "weekend_pct": 0,
    "occupancy": [],
    "last_minute": None,
    "early_bird": None,
    "seasons": [],
    "round_to": 50,
}

# Owner-facing "aggressiveness" presets. Starting points designed by us (not taken
# from any vendor); owners can override any single field. Ceilings stay <= 200%
# because of the Prices of Goods and Services Act s.29 (see docs/PRICING.md).
PRESETS = {
    "conservative": {  # protect occupancy, small moves
        "floor_pct": 85, "ceiling_pct": 125, "weekend_pct": 5,
        "occupancy": [{"above": 60, "pct": 5}, {"above": 80, "pct": 10}, {"above": 90, "pct": 15}],
        "last_minute": {"within_days": 2, "below_occupancy": 40, "pct": -10},
        "early_bird": None,
    },
    "balanced": {
        "floor_pct": 80, "ceiling_pct": 150, "weekend_pct": 10,
        "occupancy": [{"above": 50, "pct": 10}, {"above": 75, "pct": 20}, {"above": 90, "pct": 30}],
        "last_minute": {"within_days": 3, "below_occupancy": 50, "pct": -15},
        "early_bird": {"beyond_days": 90, "pct": -5},
    },
    "aggressive": {  # chase revenue when demand is strong, discount harder when empty
        "floor_pct": 70, "ceiling_pct": 180, "weekend_pct": 15,
        "occupancy": [{"above": 40, "pct": 10}, {"above": 65, "pct": 25}, {"above": 85, "pct": 40}],
        "last_minute": {"within_days": 5, "below_occupancy": 60, "pct": -20},
        "early_bird": {"beyond_days": 90, "pct": -8},
    },
}


def effective_config(cfg: dict | None) -> dict:
    """DEFAULTS <- preset (if any) <- owner's own overrides."""
    cfg = cfg or {}
    preset = PRESETS.get(cfg.get("preset"), {})
    return {**DEFAULTS, **preset, **{k: v for k, v in cfg.items() if k != "preset"}}


def _in_season(night: date, start: str, end: str) -> bool:
    """start/end are 'MM-DD'; ranges may wrap the new year (e.g. 12-20 to 01-05)."""
    key = night.strftime("%m-%d")
    return start <= key <= end if start <= end else key >= start or key <= end


def nightly_rate(room: dict, cfg: dict | None, night: date, today: date,
                 occupancy_pct: float) -> dict:
    """Return {'price', 'base', 'adjustments': [(label, pct)], 'clamped'}."""
    cfg = effective_config(cfg)
    base = room["rate"]
    fixed = (cfg.get("fixed") or {}).get(room.get("code"), {}).get(night.isoformat())
    if fixed:
        return {"price": int(fixed), "base": base, "adjustments": [("fixed by owner", 0)], "clamped": False}
    adj: list[tuple[str, int]] = []

    for s in cfg["seasons"]:
        if _in_season(night, s["from"], s["to"]):
            adj.append((f"season:{s['name']}", s["pct"]))
            break  # first matching season wins; list peak periods first

    if cfg["weekend_pct"] and night.weekday() in (4, 5):  # Fri, Sat nights
        adj.append(("weekend", cfg["weekend_pct"]))

    for step in sorted(cfg["occupancy"], key=lambda s: s["above"], reverse=True):
        if occupancy_pct > step["above"]:
            adj.append((f"occupancy>{step['above']}%", step["pct"]))
            break

    days_ahead = (night - today).days
    lm = cfg["last_minute"]
    if lm and days_ahead <= lm["within_days"] and occupancy_pct < lm["below_occupancy"]:
        adj.append(("last_minute", lm["pct"]))
    eb = cfg["early_bird"]
    if eb and days_ahead >= eb["beyond_days"]:
        adj.append(("early_bird", eb["pct"]))

    # Premiums stack; discounts don't - only the single largest discount applies
    # (same convention PriceLabs documents), so a quiet low-season night isn't
    # discounted twice.
    premiums = [a for a in adj if a[1] > 0]
    discounts = sorted((a for a in adj if a[1] < 0), key=lambda a: a[1])[:1]
    adj = premiums + discounts
    price = float(base)
    for _, pct in adj:
        price *= 1 + pct / 100
    floor, ceiling = base * cfg["floor_pct"] / 100, base * cfg["ceiling_pct"] / 100
    clamped = price < floor or price > ceiling
    price = min(max(price, floor), ceiling)
    step = cfg["round_to"] or 1
    price = int(round(price / step) * step)
    return {"price": price, "base": base, "adjustments": adj, "clamped": clamped}


def is_auto(cfg: dict | None) -> bool:
    return (cfg or {}).get("mode", DEFAULTS["mode"]) == "auto"


def published_rate(room: dict, cfg: dict | None, night: date, today: date, occupancy_pct: float) -> int:
    """Price the website charges: computed in auto mode, owner-fixed dates always honoured."""
    r = nightly_rate(room, cfg, night, today, occupancy_pct)
    if is_auto(cfg) or r["adjustments"] == [("fixed by owner", 0)]:
        return r["price"]
    return room["rate"]
