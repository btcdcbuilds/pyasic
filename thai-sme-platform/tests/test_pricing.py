from datetime import date

from webapp.pricing import nightly_rate

ROOM = {"rate": 2000}
CFG = {
    "mode": "auto", "floor_pct": 80, "ceiling_pct": 150, "weekend_pct": 10, "round_to": 50,
    "occupancy": [{"above": 50, "pct": 10}, {"above": 80, "pct": 25}],
    "last_minute": {"within_days": 3, "below_occupancy": 40, "pct": -15},
    "early_bird": {"beyond_days": 60, "pct": -5},
    "seasons": [{"name": "new-year", "from": "12-20", "to": "01-05", "pct": 30}],
}
TODAY = date(2026, 10, 12)  # a Monday


def test_quiet_weekday_is_base_rate():
    r = nightly_rate(ROOM, CFG, date(2026, 10, 20), TODAY, 0)  # Tuesday, 8 days ahead
    assert r["price"] == 2000 and r["adjustments"] == []


def test_weekend_and_high_occupancy_stack():
    r = nightly_rate(ROOM, CFG, date(2026, 10, 23), TODAY, 85)  # Friday
    # 2000 * 1.10 * 1.25 = 2750
    assert r["price"] == 2750
    assert [a[0] for a in r["adjustments"]] == ["weekend", "occupancy>80%"]


def test_last_minute_discount_only_when_empty():
    assert nightly_rate(ROOM, CFG, date(2026, 10, 14), TODAY, 10)["price"] == 1700
    assert nightly_rate(ROOM, CFG, date(2026, 10, 14), TODAY, 60)["price"] == 2200


def test_season_wraps_new_year_and_ceiling_applies():
    r = nightly_rate(ROOM, CFG, date(2027, 1, 2), TODAY, 95)  # Saturday, peak, nearly full
    # 2000 * 1.30 * 1.10 * 1.25 = 3575 -> capped at 150% = 3000
    assert r["price"] == 3000 and r["clamped"]
    before = nightly_rate(ROOM, CFG, date(2026, 12, 19), TODAY, 0)["adjustments"]
    assert not any(a[0].startswith("season") for a in before)


def test_floor_applies():
    cfg = {**CFG, "last_minute": {"within_days": 3, "below_occupancy": 40, "pct": -40}}
    assert nightly_rate(ROOM, cfg, date(2026, 10, 13), TODAY, 0)["price"] == 1600  # 80% floor


def test_no_config_means_base_rate():
    assert nightly_rate(ROOM, None, date(2026, 10, 24), TODAY, 100)["price"] == 2000


def test_discounts_do_not_stack():
    cfg = {**CFG, "seasons": [{"name": "low", "from": "10-01", "to": "10-31", "pct": -10}]}
    r = nightly_rate(ROOM, cfg, date(2026, 10, 14), TODAY, 0)  # low season + last minute
    assert [a[0] for a in r["adjustments"]] == ["last_minute"]
    assert r["price"] == 1700


def test_presets_change_aggressiveness():
    from webapp.pricing import published_rate
    night = date(2026, 10, 23)  # Friday, 11 days ahead
    prices = {p: nightly_rate(ROOM, {"preset": p}, night, TODAY, 70)["price"]
              for p in ("conservative", "balanced", "aggressive")}
    # conservative: 2000*1.05*1.05=2205->2200; balanced: 2000*1.10*1.10=2420->2400;
    # aggressive: 2000*1.15*1.25=2875->2900
    assert prices == {"conservative": 2200, "balanced": 2400, "aggressive": 2900}
    # owner override of a single field wins over the preset
    assert nightly_rate(ROOM, {"preset": "aggressive", "weekend_pct": 0}, night, TODAY, 70)["price"] == 2500
    # suggest mode publishes the base rate
    assert published_rate({"code": "x", **ROOM}, {"preset": "aggressive", "mode": "suggest"}, night, TODAY, 70) == 2000


def test_owner_fixed_price_wins_even_in_suggest_mode():
    from webapp.pricing import published_rate
    room = {"code": "sea", "rate": 2000}
    cfg = {"mode": "suggest", "fixed": {"sea": {"2026-12-31": 4500}}}
    assert nightly_rate(room, cfg, date(2026, 12, 31), TODAY, 0)["price"] == 4500
    assert published_rate(room, cfg, date(2026, 12, 31), TODAY, 0) == 4500
    assert published_rate(room, cfg, date(2026, 12, 30), TODAY, 0) == 2000
