"""Shared state: database, site cache, templates, media folder."""

from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote_plus

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

from webapp.content import validate_site
from webapp.pricing import nightly_rate
from webapp.store import Store

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parent.parent
SITES_DIR = ROOT / "sites"
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)


def t(value) -> Markup:
    """Render a {th, en} dict as two spans; CSS shows the active language."""
    if isinstance(value, dict):
        return Markup("".join(
            f'<span lang="{lang}">{escape(value[lang])}</span>' for lang in ("th", "en") if lang in value))
    return Markup(escape(value))


def baht(n) -> str:
    return f"฿{int(n):,}"


env = Environment(loader=FileSystemLoader(SITES_DIR / "templates"),
                  autoescape=select_autoescape(["html", "j2"]))
env.filters.update(t=t, baht=baht, urlq=quote_plus)

STORE = Store(os.environ.get("DB_PATH", str(DATA_DIR / "bookings.db")))


def seed_from_yaml(force: bool = False) -> None:
    """Load sites/content/*.yaml into the database (only new slugs unless force)."""
    existing = set(STORE.site_slugs())
    for path in sorted((SITES_DIR / "content").glob("*.yaml")):
        site = yaml.safe_load(path.read_text(encoding="utf-8"))
        if site["slug"] in existing and not force:
            continue
        errors = validate_site(site)
        if errors:
            log.warning("seed %s has content problems: %s", site["slug"], errors[:5])
        STORE.save_site(site["slug"], site, author="seed", note=path.name)


def load_sites() -> dict[str, dict]:
    return {slug: STORE.get_site(slug) for slug in STORE.site_slugs()}


def load_domains() -> dict[str, str]:
    path = SITES_DIR / "domains.yaml"
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {host.lower(): slug for host, slug in (data.get("domains") or {}).items()}


seed_from_yaml()
SITES: dict[str, dict] = load_sites()
DOMAINS = load_domains()


def save_site(slug: str, data: dict, author: str, note: str = "") -> None:
    STORE.save_site(slug, data, author, note)
    SITES[slug] = data


def media_files(slug: str) -> list[str]:
    folder = MEDIA_DIR / slug
    if not folder.is_dir():
        return []
    return [f"/media/{slug}/{p.name}" for p in sorted(folder.iterdir(), key=lambda p: p.stat().st_mtime)
            if p.is_file()]


def rate_calendar(site: dict, days: int = 30) -> list[dict]:
    """Per room type and night: occupancy, suggested price, and why."""
    today = date.today()
    out = []
    for room in site.get("rooms", []):
        units = room.get("units", 1)
        nights = []
        for i in range(days):
            night = today + timedelta(days=i)
            taken = STORE.booked(site["slug"], "room", room["code"], night, night + timedelta(days=1))
            r = nightly_rate(room, site.get("pricing"), night, today, 100 * taken / units)
            nights.append({"date": night.isoformat(), "occupancy": round(100 * taken / units),
                           "booked": taken, "units": units, **r})
        out.append({"code": room["code"], "name": room["name"], "base": room["rate"], "nights": nights})
    return out
