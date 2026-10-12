"""Multi-site web server for the pilot VPS.

Serves every site in sites/content/*.yaml:
  - by path:   https://<platform-domain>/s/<slug>/
  - by domain: any host listed in sites/domains.yaml (custom or subdomain)
plus a booking API, an owner bookings page and Caddy's on-demand TLS check.

Run locally:  uvicorn webapp.app:app --reload     (from thai-sme-platform/)
Env: ADMIN_KEY (owner pages), DB_PATH (default data/bookings.db)
"""

from __future__ import annotations

import os
import secrets
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote_plus

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from webapp.booking import BookingError, booking_times, quote
from webapp.google_photos import live_photos
from webapp.pricing import is_auto, nightly_rate
from webapp.store import Store

ROOT = Path(__file__).resolve().parent.parent
SITES_DIR = ROOT / "sites"


def load_sites() -> dict[str, dict]:
    sites = {}
    for path in sorted((SITES_DIR / "content").glob("*.yaml")):
        site = yaml.safe_load(path.read_text(encoding="utf-8"))
        sites[site["slug"]] = site
    return sites


def load_domains() -> dict[str, str]:
    path = SITES_DIR / "domains.yaml"
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {host.lower(): slug for host, slug in (data.get("domains") or {}).items()}


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

SITES = load_sites()
DOMAINS = load_domains()
os.makedirs(ROOT / "data", exist_ok=True)
STORE = Store(os.environ.get("DB_PATH", str(ROOT / "data" / "bookings.db")))
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def preview_photos(site: dict) -> list[dict]:
    """Google Maps photos, live and attributed, only for unsold pitch previews."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if site.get("status") != "preview" or site.get("photos") or not site.get("google_place_id") or not key:
        return []
    return live_photos(site["google_place_id"], key)


def render_site(site: dict, base: str) -> HTMLResponse:
    html = env.get_template("site.html.j2").render(
        site=site, base=base, times=booking_times(site), today=date.today().isoformat(),
        google_photos=preview_photos(site))
    return HTMLResponse(html)


def _site_or_404(slug: str) -> dict | None:
    return SITES.get(slug)


async def home(request: Request) -> Response:
    host = request.headers.get("host", "").split(":")[0].lower()
    if host in DOMAINS and DOMAINS[host] in SITES:
        return render_site(SITES[DOMAINS[host]], base="")
    return HTMLResponse(env.get_template("index.html.j2").render(sites=SITES.values()))


async def site_page(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    if not site:
        return PlainTextResponse("Not found", status_code=404)
    return render_site(site, base=f"/s/{site['slug']}")


async def privacy(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    if not site:
        return PlainTextResponse("Not found", status_code=404)
    return HTMLResponse(env.get_template("privacy.html.j2").render(site=site))


async def _form(request: Request) -> dict:
    if request.headers.get("content-type", "").startswith("application/json"):
        return await request.json()
    return dict(await request.form())


async def api_quote(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    if not site:
        return JSONResponse({"error": "not found"}, status_code=404)
    try:
        q = quote(site, await _form(request), date.today(), STORE.booked)
    except BookingError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return JSONResponse(q)


async def api_book(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    if not site:
        return JSONResponse({"error": "not found"}, status_code=404)
    try:
        q = quote(site, await _form(request), date.today(), STORE.booked)
    except BookingError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    ref = STORE.add(site["slug"], q)
    # TODO: notify owner via LINE Messaging API / WhatsApp; create payment link if deposit > 0.
    return JSONResponse({"ref": ref, **q}, status_code=201)


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


async def api_rates(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    if not site or not site.get("rooms"):
        return JSONResponse({"error": "not found"}, status_code=404)
    try:
        days = min(max(int(request.query_params.get("days", 14)), 1), 120)
    except ValueError:
        return JSONResponse({"error": "days must be a number"}, status_code=400)
    cal = rate_calendar(site, days)
    if not is_auto(site.get("pricing")):  # public sees the published (base) rate only
        for room in cal:
            for n in room["nights"]:
                n["price"], n["adjustments"] = room["base"], []
    return JSONResponse({"mode": (site.get("pricing") or {}).get("mode", "suggest"), "rooms": cal})


async def admin(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    key = request.query_params.get("key", "")
    if not site or not ADMIN_KEY or not secrets.compare_digest(key, ADMIN_KEY):
        return PlainTextResponse("Not found", status_code=404)
    return HTMLResponse(env.get_template("admin.html.j2").render(
        site=site, bookings=STORE.list(site["slug"]),
        calendar=rate_calendar(site, 30) if site.get("rooms") else [],
        pricing_mode=(site.get("pricing") or {}).get("mode", "suggest")))


async def tls_check(request: Request) -> Response:
    """Caddy on_demand_tls `ask` endpoint: only issue certs for hosts we serve."""
    domain = request.query_params.get("domain", "").lower()
    return PlainTextResponse("ok" if domain in DOMAINS else "no", status_code=200 if domain in DOMAINS else 404)


async def healthz(request: Request) -> Response:
    return PlainTextResponse("ok")


app = Starlette(routes=[
    Route("/", home),
    Route("/healthz", healthz),
    Route("/internal/tls-check", tls_check),
    Route("/s/{slug}/", site_page),
    Route("/s/{slug}/privacy", privacy),
    Route("/api/{slug}/quote", api_quote, methods=["POST"]),
    Route("/api/{slug}/bookings", api_book, methods=["POST"]),
    Route("/api/{slug}/rates", api_rates),
    Route("/admin/{slug}", admin),
    Mount("/static", StaticFiles(directory=SITES_DIR / "static"), name="static"),
])
