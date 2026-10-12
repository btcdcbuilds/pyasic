"""Multi-site web server for the pilot VPS.

Public:
  - every site by path  https://<platform-domain>/s/<slug>/  or by its own domain
    (sites/domains.yaml), booking API, PromptPay deposit QR, rates API
Owner app (webapp/owner.py):  /owner  - manage bookings, content, photos, pricing, Ask AI
Platform: /admin/<slug>?key=ADMIN_KEY, Caddy on-demand TLS check, /healthz

Run locally:  uvicorn webapp.app:app --reload     (from thai-sme-platform/)
Env: SECRET_KEY, ADMIN_KEY, DB_PATH/DATA_DIR, GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY,
     LINE_CHANNEL_ACCESS_TOKEN  (all optional for local testing; see docs/SETUP.md)
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import date

from starlette.applications import Starlette
from starlette.background import BackgroundTask
from starlette.middleware import Middleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from webapp import notify, owner
from webapp.booking import BookingError, booking_times, quote
from webapp.core import DOMAINS, MEDIA_DIR, SITES, SITES_DIR, STORE, env, rate_calendar
from webapp.google_photos import live_photos
from webapp.pricing import is_auto
from webapp.promptpay import qr_svg_data_uri

log = logging.getLogger(__name__)
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
if not os.environ.get("SECRET_KEY"):
    log.warning("SECRET_KEY not set: owner logins will reset on every restart")


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


def _notify_owners(site: dict, ref: str, booking: dict) -> None:
    text = notify.booking_message(site, ref, booking)
    for o in STORE.owners_for_site(site["slug"]):
        notify.push_line(o.get("line_user_id"), text)


async def api_book(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    if not site:
        return JSONResponse({"error": "not found"}, status_code=404)
    try:
        q = quote(site, await _form(request), date.today(), STORE.booked)
    except BookingError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    # Single process + no await between quote() and add(): the availability check
    # and the insert can't interleave with another booking.
    ref = STORE.add(site["slug"], q)
    body = {"ref": ref, **q}
    pp = (site.get("payments") or {}).get("promptpay_id")
    if pp and q.get("deposit"):
        body["promptpay_qr"] = qr_svg_data_uri(pp, q["deposit"])
    return JSONResponse(body, status_code=201, background=BackgroundTask(_notify_owners, site, ref, q))


async def api_rates(request: Request) -> Response:
    site = _site_or_404(request.path_params["slug"])
    if not site or not site.get("rooms"):
        return JSONResponse({"error": "not found"}, status_code=404)
    try:
        days = min(max(int(request.query_params.get("days", 14)), 1), 120)
    except ValueError:
        return JSONResponse({"error": "days must be a number"}, status_code=400)
    cal = rate_calendar(site, days)
    if not is_auto(site.get("pricing")):  # public sees published prices only
        for room in cal:
            for n in room["nights"]:
                if not (n["adjustments"] and n["adjustments"][0][0] == "fixed by owner"):
                    n["price"], n["adjustments"] = room["base"], []
    return JSONResponse({"mode": (site.get("pricing") or {}).get("mode", "suggest"), "rooms": cal})


async def media(request: Request) -> Response:
    slug, name = request.path_params["slug"], request.path_params["name"]
    path = (MEDIA_DIR / slug / name).resolve()
    if not str(path).startswith(str(MEDIA_DIR.resolve())) or not path.is_file():
        return PlainTextResponse("Not found", status_code=404)
    return FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})


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


async def privacy_for_host(request: Request) -> Response:
    """Privacy page on a customer's own domain (https://theirname.com/privacy)."""
    host = request.headers.get("host", "").split(":")[0].lower()
    if host in DOMAINS and DOMAINS[host] in SITES:
        return HTMLResponse(env.get_template("privacy.html.j2").render(site=SITES[DOMAINS[host]]))
    return PlainTextResponse("Not found", status_code=404)


async def healthz(request: Request) -> Response:
    return PlainTextResponse("ok")


app = Starlette(
    routes=[
        Route("/", home),
        Route("/healthz", healthz),
        Route("/internal/tls-check", tls_check),
        Route("/s/{slug}/", site_page),
        Route("/s/{slug}/privacy", privacy),
        Route("/privacy", privacy_for_host),
        Route("/api/{slug}/quote", api_quote, methods=["POST"]),
        Route("/api/{slug}/bookings", api_book, methods=["POST"]),
        Route("/api/{slug}/rates", api_rates),
        Route("/media/{slug}/{name}", media),
        Route("/admin/{slug}", admin),
        *owner.routes,
        Mount("/static", StaticFiles(directory=SITES_DIR / "static"), name="static"),
    ],
    middleware=[Middleware(SessionMiddleware, secret_key=SECRET_KEY, session_cookie="owner_session",
                           same_site="lax", https_only=os.environ.get("HTTPS_ONLY", "0") == "1",
                           max_age=14 * 24 * 3600)],
)

