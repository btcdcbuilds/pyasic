"""Booking validation and pricing for the five booking types.

Pure functions: given a site's content (from sites/content/*.yaml) and a submitted
form, return a normalised booking with price and deposit, or raise BookingError.
Availability checks that need stored bookings take a `booked` callback.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Callable

from webapp.pricing import is_auto, nightly_rate


class BookingError(ValueError):
    pass


# booked(site_slug, kind, key, start, end) -> int units/seats already taken
BookedFn = Callable[[str, str, str, date, date], int]


def _date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise BookingError(f"{field}: invalid date")


def _int(value, field: str, lo: int, hi: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise BookingError(f"{field}: must be a number")
    if not lo <= n <= hi:
        raise BookingError(f"{field}: must be between {lo} and {hi}")
    return n


def _choice(value, options, field: str):
    if value not in options:
        raise BookingError(f"{field}: not available")
    return value


def _deposit(total: int, percent: int | None) -> int:
    return math.ceil(total * percent / 100) if percent else 0


def _slot_times(cfg: dict) -> list[str]:
    start = datetime.strptime(cfg["open"], "%H:%M")
    last = datetime.strptime(cfg["last_start"], "%H:%M")
    out = []
    while start <= last:
        out.append(start.strftime("%H:%M"))
        start += timedelta(minutes=cfg["step_minutes"])
    return out


def booking_times(site: dict) -> list[str]:
    cfg = site["booking"]
    return _slot_times(cfg) if cfg["type"] == "slot" else list(cfg.get("times", []))


def quote(site: dict, form: dict, today: date, booked: BookedFn | None = None) -> dict:
    """Validate a booking request and compute its price. Raises BookingError."""
    booked = booked or (lambda *a: 0)
    cfg = site["booking"]
    kind = cfg["type"]

    name = (form.get("name") or "").strip()
    contact = (form.get("contact") or "").strip()
    if not name or not contact:
        raise BookingError("name and contact are required")
    if str(form.get("consent")).lower() not in ("true", "on", "1", "yes"):
        raise BookingError("consent to the privacy notice is required")

    out = {"type": kind, "name": name[:100], "contact": contact[:100],
           "note": (form.get("note") or "").strip()[:500], "total": None, "deposit": 0}

    if kind == "table":
        d = _date(form.get("date"), "date")
        if d < today:
            raise BookingError("date: must be today or later")
        out.update(date=d.isoformat(), time=_choice(form.get("time"), cfg["times"], "time"),
                   party=_int(form.get("party"), "party", 1, cfg["max_party"]))
        out["summary"] = f"Table for {out['party']} on {out['date']} {out['time']}"

    elif kind == "pickup":
        d = _date(form.get("date"), "date")
        if d < today + timedelta(days=cfg.get("lead_days", 0)):
            raise BookingError(f"date: needs {cfg.get('lead_days', 0)} days' notice")
        if not out["note"]:
            raise BookingError("note: tell us what you would like to order")
        out.update(date=d.isoformat(), time=_choice(form.get("time"), cfg["times"], "time"))
        out["summary"] = f"Pickup order on {out['date']} {out['time']}"

    elif kind == "room":
        rooms = {r["code"]: r for r in site["rooms"]}
        room = rooms[_choice(form.get("room"), rooms, "room")]
        ci, co = _date(form.get("check_in"), "check_in"), _date(form.get("check_out"), "check_out")
        if ci < today:
            raise BookingError("check_in: must be today or later")
        nights = (co - ci).days
        if not 1 <= nights <= cfg.get("max_nights", 30):
            raise BookingError("check_out: must be after check-in (max stay applies)")
        guests = _int(form.get("guests"), "guests", 1, room["capacity"])
        if booked(site["slug"], "room", room["code"], ci, co) >= room.get("units", 1):
            raise BookingError("room: fully booked for those dates")
        nightly = []
        for i in range(nights):
            night = ci + timedelta(days=i)
            occ = booked(site["slug"], "room", room["code"], night, night + timedelta(days=1))
            r = nightly_rate(room, site.get("pricing"), night, today,
                             100 * occ / room.get("units", 1))
            price = r["price"] if is_auto(site.get("pricing")) else room["rate"]
            nightly.append({"date": night.isoformat(), "price": price})
        total = sum(n["price"] for n in nightly)
        out.update(room=room["code"], check_in=ci.isoformat(), check_out=co.isoformat(),
                   nights=nights, nightly=nightly, guests=guests, total=total,
                   deposit=_deposit(total, cfg.get("deposit_percent")))
        out["summary"] = f"{room['name']['en']} x {nights} nights from {out['check_in']}"

    elif kind == "slot":
        services = {s["code"]: s for s in site["services"]}
        svc = services[_choice(form.get("service"), services, "service")]
        prices = {str(o["minutes"]): o["price"] for o in svc["options"]}
        minutes = _choice(str(form.get("minutes")), prices, "minutes")
        d = _date(form.get("date"), "date")
        if d < today:
            raise BookingError("date: must be today or later")
        people = _int(form.get("people"), "people", 1, cfg["max_people"])
        out.update(service=svc["code"], minutes=int(minutes), date=d.isoformat(),
                   time=_choice(form.get("time"), _slot_times(cfg), "time"), people=people,
                   total=prices[minutes] * people)
        out["summary"] = f"{svc['name']['en']} {minutes} min x {people} on {out['date']} {out['time']}"

    elif kind == "seats":
        tours = {t["code"]: t for t in site["tours"]}
        tour = tours[_choice(form.get("tour"), tours, "tour")]
        d = _date(form.get("date"), "date")
        if d <= today:
            raise BookingError("date: tours must be booked at least one day ahead")
        dep = _choice(form.get("departure"), tour["departures"], "departure")
        adults = _int(form.get("adults"), "adults", 1, tour["seats"])
        children = _int(form.get("children") or 0, "children", 0, tour["seats"])
        taken = booked(site["slug"], "seats", f"{tour['code']}@{dep}", d, d)
        if adults + children > tour["seats"] - taken:
            raise BookingError(f"seats: only {max(tour['seats'] - taken, 0)} left")
        total = adults * tour["price_adult"] + children * tour["price_child"]
        out.update(tour=tour["code"], date=d.isoformat(), departure=dep, adults=adults,
                   children=children, total=total,
                   deposit=_deposit(total, cfg.get("deposit_percent")))
        out["summary"] = f"{tour['name']['en']} {dep} on {out['date']}: {adults}A {children}C"

    else:
        raise BookingError(f"unknown booking type {kind}")
    return out
