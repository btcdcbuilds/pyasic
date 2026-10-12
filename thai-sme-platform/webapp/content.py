"""Validation for site content edited by owners or proposed by the AI.

Nothing reaches a live site without passing validate_site(). Owners and the AI
may change content, prices, photos and pricing settings, but never the site's
identity (slug, industry, booking type) or its preview/live status.
"""

from __future__ import annotations

import re
from copy import deepcopy

LOCKED = ("slug", "industry", "region", "status", "google_place_id")
TOP_LEVEL = {
    "slug", "industry", "region", "status", "google_place_id", "theme", "name", "tagline",
    "about", "contact", "hours", "highlights", "menu", "delivery", "rooms", "services",
    "tours", "booking", "faq", "legal", "photos", "pricing", "payments",
}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MMDD = re.compile(r"^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
CODE = re.compile(r"^[a-z0-9][a-z0-9-]{0,29}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TAGS = {"spicy", "vegetarian", "vegan", "halal", "new", "popular"}


class Errors(list):
    def need(self, cond: bool, msg: str) -> bool:
        if not cond:
            self.append(msg)
        return cond


def _text(e: Errors, v, path: str, maxlen: int = 300, required: bool = True) -> None:
    if v is None and not required:
        return
    e.need(isinstance(v, str) and len(v) <= maxlen and (v.strip() or not required),
           f"{path}: text up to {maxlen} characters")


def _bi(e: Errors, v, path: str, maxlen: int = 300, required: bool = True) -> None:
    """Bilingual text {th, en}."""
    if v is None and not required:
        return
    if e.need(isinstance(v, dict), f"{path}: needs Thai and English text"):
        for lang in ("th", "en"):
            _text(e, v.get(lang), f"{path}.{lang}", maxlen, required)


def _int(e: Errors, v, path: str, lo: int, hi: int) -> None:
    e.need(isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi,
           f"{path}: whole number {lo}-{hi}")


def _list(e: Errors, v, path: str, maxlen: int = 100) -> list:
    if v is None:
        return []
    if e.need(isinstance(v, list) and len(v) <= maxlen, f"{path}: list of up to {maxlen}"):
        return v
    return []


def _url(e: Errors, v, path: str, slug: str) -> None:
    e.need(isinstance(v, str) and (v.startswith(f"/media/{slug}/") or v.startswith("https://")),
           f"{path}: must be an uploaded photo or an https:// link")


def _photos(e: Errors, v, path: str, slug: str) -> None:
    for i, p in enumerate(_list(e, v, path, 30)):
        if e.need(isinstance(p, dict), f"{path}[{i}]: photo"):
            _url(e, p.get("src"), f"{path}[{i}].src", slug)
            _text(e, p.get("alt"), f"{path}[{i}].alt", 200, required=False)
            _text(e, p.get("credit"), f"{path}[{i}].credit", 200, required=False)


def _codes(e: Errors, items: list, path: str) -> None:
    codes = [i.get("code") for i in items if isinstance(i, dict)]
    for c in codes:
        e.need(isinstance(c, str) and bool(CODE.match(c)), f"{path}: code '{c}' must be lowercase letters/numbers/-")
    e.need(len(codes) == len(set(codes)), f"{path}: codes must be unique")


def validate_site(s: dict) -> list[str]:
    e = Errors()
    if not e.need(isinstance(s, dict), "site must be an object"):
        return e
    slug = s.get("slug", "")
    unknown = set(s) - TOP_LEVEL
    e.need(not unknown, f"unknown sections: {sorted(unknown)}")

    theme = s.get("theme") or {}
    for k in ("primary", "accent", "surface", "ink"):
        e.need(bool(HEX.match(str(theme.get(k, "")))), f"theme.{k}: colour like #1a2b3c")
    _text(e, theme.get("hero_icon"), "theme.hero_icon", 8)

    _bi(e, s.get("name"), "name", 80)
    _bi(e, s.get("tagline"), "tagline", 200)
    _bi(e, s.get("about"), "about", 1500)

    c = s.get("contact") or {}
    _text(e, c.get("phone"), "contact.phone", 30)
    _text(e, c.get("line_id"), "contact.line_id", 40)
    e.need(bool(re.match(r"^\d{8,15}$", str(c.get("whatsapp", "")))), "contact.whatsapp: digits only, e.g. 66812345678")
    _text(e, c.get("email"), "contact.email", 120, required=False)
    _bi(e, c.get("address"), "contact.address", 300)
    _text(e, c.get("map_query"), "contact.map_query", 200)

    for i, h in enumerate(_list(e, s.get("hours"), "hours", 14)):
        _bi(e, h.get("days"), f"hours[{i}].days", 40)
        t = h.get("time")
        (_bi if isinstance(t, dict) else _text)(e, t, f"hours[{i}].time", 40)
    for i, h in enumerate(_list(e, s.get("highlights"), "highlights", 8)):
        _text(e, h.get("icon"), f"highlights[{i}].icon", 8)
        _text(e, h.get("th"), f"highlights[{i}].th", 80)
        _text(e, h.get("en"), f"highlights[{i}].en", 80)

    for i, cat in enumerate(_list(e, s.get("menu"), "menu", 30)):
        _bi(e, cat.get("category"), f"menu[{i}].category", 60)
        for j, it in enumerate(_list(e, cat.get("items"), f"menu[{i}].items", 100)):
            _bi(e, it.get("name"), f"menu[{i}].items[{j}].name", 120)
            _int(e, it.get("price"), f"menu[{i}].items[{j}].price", 0, 1_000_000)
            e.need(set(it.get("tags") or []) <= TAGS, f"menu[{i}].items[{j}].tags: one of {sorted(TAGS)}")
    for i, d in enumerate(_list(e, s.get("delivery"), "delivery", 6)):
        _text(e, d.get("name"), f"delivery[{i}].name", 40)
        e.need(isinstance(d.get("url"), str) and (d["url"] == "#" or d["url"].startswith("https://")),
               f"delivery[{i}].url: https:// link")

    rooms = _list(e, s.get("rooms"), "rooms", 30)
    _codes(e, rooms, "rooms")
    for i, r in enumerate(rooms):
        _bi(e, r.get("name"), f"rooms[{i}].name", 80)
        _bi(e, r.get("desc"), f"rooms[{i}].desc", 400)
        _int(e, r.get("capacity"), f"rooms[{i}].capacity", 1, 50)
        _int(e, r.get("units", 1), f"rooms[{i}].units", 1, 500)
        _int(e, r.get("rate"), f"rooms[{i}].rate", 1, 1_000_000)
        _photos(e, r.get("photos"), f"rooms[{i}].photos", slug)

    services = _list(e, s.get("services"), "services", 40)
    _codes(e, services, "services")
    for i, sv in enumerate(services):
        _bi(e, sv.get("name"), f"services[{i}].name", 80)
        opts = _list(e, sv.get("options"), f"services[{i}].options", 6)
        e.need(len(opts) >= 1, f"services[{i}].options: at least one duration")
        for j, o in enumerate(opts):
            _int(e, o.get("minutes"), f"services[{i}].options[{j}].minutes", 5, 600)
            _int(e, o.get("price"), f"services[{i}].options[{j}].price", 0, 1_000_000)

    tours = _list(e, s.get("tours"), "tours", 30)
    _codes(e, tours, "tours")
    for i, tr in enumerate(tours):
        _bi(e, tr.get("name"), f"tours[{i}].name", 80)
        _bi(e, tr.get("desc"), f"tours[{i}].desc", 400)
        deps = _list(e, tr.get("departures"), f"tours[{i}].departures", 12)
        e.need(len(deps) >= 1 and all(isinstance(d, str) and HHMM.match(d) for d in deps),
               f"tours[{i}].departures: times like 09:30")
        _int(e, tr.get("price_adult"), f"tours[{i}].price_adult", 0, 1_000_000)
        _int(e, tr.get("price_child"), f"tours[{i}].price_child", 0, 1_000_000)
        _int(e, tr.get("seats"), f"tours[{i}].seats", 1, 500)

    for i, f in enumerate(_list(e, s.get("faq"), "faq", 20)):
        _bi(e, f.get("q"), f"faq[{i}].q", 200)
        _bi(e, f.get("a"), f"faq[{i}].a", 800)
    _bi(e, s.get("legal"), "legal", 200, required=False)
    _photos(e, s.get("photos"), "photos", slug)

    b = s.get("booking") or {}
    kind = b.get("type")
    e.need(kind in ("table", "pickup", "room", "slot", "seats"), "booking.type")
    if kind in ("table", "pickup"):
        times = _list(e, b.get("times"), "booking.times", 48)
        e.need(len(times) >= 1 and all(isinstance(t, str) and HHMM.match(t) for t in times),
               "booking.times: times like 18:30")
    if kind == "table":
        _int(e, b.get("max_party"), "booking.max_party", 1, 500)
    if kind == "pickup":
        _int(e, b.get("lead_days", 0), "booking.lead_days", 0, 60)
    if kind == "room":
        e.need(len(rooms) >= 1, "rooms: at least one room type")
        _int(e, b.get("max_nights", 30), "booking.max_nights", 1, 365)
    if kind == "slot":
        e.need(len(services) >= 1, "services: at least one treatment")
        for k in ("open", "last_start"):
            e.need(bool(HHMM.match(str(b.get(k, "")))), f"booking.{k}: time like 10:00")
        _int(e, b.get("step_minutes"), "booking.step_minutes", 5, 240)
        _int(e, b.get("max_people"), "booking.max_people", 1, 50)
    if kind == "seats":
        e.need(len(tours) >= 1, "tours: at least one trip")
    if "deposit_percent" in b:
        _int(e, b["deposit_percent"], "booking.deposit_percent", 0, 100)

    p = s.get("pricing")
    if p is not None and e.need(isinstance(p, dict), "pricing: settings"):
        e.need(p.get("mode", "suggest") in ("off", "suggest", "auto"), "pricing.mode: off, suggest or auto")
        e.need(p.get("preset", "balanced") in ("conservative", "balanced", "aggressive"),
               "pricing.preset: conservative, balanced or aggressive")
        if "floor_pct" in p:
            _int(e, p["floor_pct"], "pricing.floor_pct", 50, 100)
        if "ceiling_pct" in p:
            _int(e, p["ceiling_pct"], "pricing.ceiling_pct", 100, 200)  # s.29 guardrail
        for i, se in enumerate(_list(e, p.get("seasons"), "pricing.seasons", 20)):
            _text(e, se.get("name"), f"pricing.seasons[{i}].name", 40)
            e.need(bool(MMDD.match(str(se.get("from", "")))) and bool(MMDD.match(str(se.get("to", "")))),
                   f"pricing.seasons[{i}]: dates like 12-20")
            _int(e, se.get("pct"), f"pricing.seasons[{i}].pct", -50, 100)
        fixed = p.get("fixed") or {}
        room_codes = {r.get("code") for r in rooms if isinstance(r, dict)}
        if e.need(isinstance(fixed, dict), "pricing.fixed"):
            for code, dates in fixed.items():
                e.need(code in room_codes, f"pricing.fixed: unknown room '{code}'")
                for d, price in (dates or {}).items():
                    e.need(bool(DATE.match(d)), f"pricing.fixed.{code}: date like 2026-12-31")
                    _int(e, price, f"pricing.fixed.{code}.{d}", 1, 1_000_000)

    pay = s.get("payments")
    if pay:
        e.need(bool(re.match(r"^(0\d{9}|\d{13})$", str(pay.get("promptpay_id", "")))),
               "payments.promptpay_id: 10-digit mobile (0812345678) or 13-digit ID")
    return list(e)


def apply_update(current: dict, incoming: dict) -> dict:
    """Owner/AI update: take incoming content but keep locked identity fields."""
    new = deepcopy(incoming)
    for k in LOCKED:
        if k in current:
            new[k] = current[k]
        else:
            new.pop(k, None)
    new.setdefault("booking", {})["type"] = current["booking"]["type"]
    return new


def diff_summary(old: dict, new: dict, path: str = "") -> list[str]:
    """Human-readable list of changed paths, for the owner's approval screen."""
    out: list[str] = []
    if isinstance(old, dict) and isinstance(new, dict):
        for k in sorted(set(old) | set(new), key=str):
            p = f"{path}.{k}" if path else str(k)
            if k not in old:
                out.append(f"+ {p}")
            elif k not in new:
                out.append(f"- {p}")
            else:
                out.extend(diff_summary(old[k], new[k], p))
    elif isinstance(old, list) and isinstance(new, list):
        for i in range(max(len(old), len(new))):
            p = f"{path}[{i}]"
            if i >= len(old):
                out.append(f"+ {p}")
            elif i >= len(new):
                out.append(f"- {p}")
            else:
                out.extend(diff_summary(old[i], new[i], p))
    elif old != new:
        out.append(f"~ {path}: {old!r} → {new!r}")
    return out
