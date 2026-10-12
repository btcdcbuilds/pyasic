"""Owner app: the business owner's view of their business(es).

Pages:  /owner/login, /owner (my businesses), /owner/<slug> (app)
JSON API under /owner/api/<slug>/... used by sites/static/owner.js.

Security: session cookie (signed, SameSite=Lax); every mutating API call must
send the X-Requested-With header (blocks cross-site form posts); owners only
see businesses linked to them in owner_sites; every content change is validated
and versioned so it can be undone.
"""

from __future__ import annotations

import os
import secrets
import time
from collections import defaultdict
from copy import deepcopy
from datetime import date, timedelta

from starlette.background import BackgroundTask
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Route

from webapp import ai_changes
from webapp.content import apply_update, diff_summary, validate_site
from webapp.core import MEDIA_DIR, SITES, STORE, env, media_files, rate_calendar, save_site
from webapp.pricing import PRESETS

MAX_UPLOAD = 8 * 1024 * 1024
IMAGE_TYPES = {b"\xff\xd8\xff": "jpg", b"\x89PNG": "png"}
_attempts: dict[str, list[float]] = defaultdict(list)


# ---------------------------------------------------------------- helpers
def _owner(request: Request) -> dict | None:
    oid = request.session.get("owner_id")
    return STORE.owner(oid) if oid else None


def _allowed(request: Request, slug: str) -> tuple[dict | None, dict | None]:
    o = _owner(request)
    if not o or slug not in STORE.owner_slugs(o["id"]) or slug not in SITES:
        return o, None
    return o, SITES[slug]


def _deny() -> JSONResponse:
    return JSONResponse({"error": "not found"}, status_code=404)


def _csrf_ok(request: Request) -> bool:
    return request.headers.get("x-requested-with") == "owner-app"


def _image_ext(head: bytes) -> str | None:
    for magic, ext in IMAGE_TYPES.items():
        if head.startswith(magic):
            return ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def _stats(site: dict) -> dict:
    today = date.today()
    upcoming = [b for b in STORE.list(site["slug"], days_back=0) if b["status"] != "cancelled"]
    week_end = (today + timedelta(days=7)).isoformat()

    def start(b):
        return b.get("date") or b.get("check_in") or ""

    out = {
        "pending": sum(1 for b in upcoming if b["status"] == "pending"),
        "next7": sum(1 for b in upcoming if start(b) <= week_end),
        "deposits_due": sum(1 for b in upcoming if b.get("deposit") and not b["deposit_paid"]),
        "ai_to_approve": sum(1 for r in STORE.ai_requests(site["slug"]) if r["status"] == "proposed"),
    }
    if site.get("rooms"):
        units = sum(r.get("units", 1) for r in site["rooms"])
        taken = sum(STORE.booked(site["slug"], "room", r["code"], today, today + timedelta(days=1))
                    for r in site["rooms"])
        out["tonight_occupancy"] = round(100 * taken / units) if units else 0
    return out


# ---------------------------------------------------------------- pages
async def login_page(request: Request) -> Response:
    if request.method == "POST":
        ip = request.client.host if request.client else "?"
        now = time.time()
        _attempts[ip] = [t for t in _attempts[ip] if now - t < 900]
        if len(_attempts[ip]) >= 10:
            return HTMLResponse(env.get_template("owner/login.html.j2").render(
                error="Too many attempts. Try again in 15 minutes."), status_code=429)
        form = await request.form()
        o = STORE.authenticate(str(form.get("username", "")), str(form.get("password", "")))
        if not o:
            _attempts[ip].append(now)
            return HTMLResponse(env.get_template("owner/login.html.j2").render(
                error="Wrong username or password / ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"), status_code=401)
        request.session.clear()
        request.session["owner_id"] = o["id"]
        return RedirectResponse("/owner", status_code=303)
    return HTMLResponse(env.get_template("owner/login.html.j2").render(error=None))


async def logout(request: Request) -> Response:
    request.session.clear()
    return RedirectResponse("/owner/login", status_code=303)


async def home(request: Request) -> Response:
    o = _owner(request)
    if not o:
        return RedirectResponse("/owner/login", status_code=303)
    slugs = [s for s in STORE.owner_slugs(o["id"]) if s in SITES]
    if len(slugs) == 1:
        return RedirectResponse(f"/owner/{slugs[0]}", status_code=303)
    cards = [{"site": SITES[s], "stats": _stats(SITES[s])} for s in slugs]
    return HTMLResponse(env.get_template("owner/home.html.j2").render(owner=o, cards=cards))


async def app_page(request: Request) -> Response:
    o, site = _allowed(request, request.path_params["slug"])
    if not o:
        return RedirectResponse("/owner/login", status_code=303)
    if not site:
        return HTMLResponse("Not found", status_code=404)
    others = [SITES[s] for s in STORE.owner_slugs(o["id"]) if s in SITES]
    return HTMLResponse(env.get_template("owner/app.html.j2").render(owner=o, site=site, others=others))


# ---------------------------------------------------------------- API
async def api_summary(request: Request) -> Response:
    _, site = _allowed(request, request.path_params["slug"])
    if not site:
        return _deny()
    slug = site["slug"]
    return JSONResponse({
        "site": site,
        "stats": _stats(site),
        "bookings": STORE.list(slug, days_back=7),
        "ai_requests": [{**r, "changes": diff_summary(site, r["proposal"]) if r["proposal"] else []}
                        for r in STORE.ai_requests(slug)],
        "history": STORE.site_history(slug),
        "media": media_files(slug),
        "calendar": rate_calendar(site, 45) if site.get("rooms") else [],
        "presets": PRESETS,
        "ai_enabled": bool(os.environ.get("ANTHROPIC_API_KEY")),
    })


async def api_booking(request: Request) -> Response:
    _, site = _allowed(request, request.path_params["slug"])
    if not site or not _csrf_ok(request):
        return _deny()
    body = await request.json()
    try:
        ok = STORE.update_booking(site["slug"], request.path_params["ref"],
                                  status=body.get("status"), deposit_paid=body.get("deposit_paid"))
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return JSONResponse(STORE.get_booking(site["slug"], request.path_params["ref"])) if ok else _deny()


def _save(o: dict, site: dict, new: dict, note: str) -> Response:
    errors = validate_site(new)
    if errors:
        return JSONResponse({"error": "Please fix these fields", "errors": errors}, status_code=400)
    if not diff_summary(site, new):
        return JSONResponse({"ok": True, "unchanged": True, "site": site})
    save_site(site["slug"], new, author=f"owner:{o['username']}", note=note)
    return JSONResponse({"ok": True, "site": new})


async def api_content(request: Request) -> Response:
    o, site = _allowed(request, request.path_params["slug"])
    if not site or not _csrf_ok(request):
        return _deny()
    incoming = (await request.json()).get("site")
    if not isinstance(incoming, dict):
        return JSONResponse({"error": "site missing"}, status_code=400)
    return _save(o, site, apply_update(site, incoming), "edited in owner app")


async def api_pricing(request: Request) -> Response:
    """Pricing settings + base rates. Body: {pricing: {...}, rates: {room_code: int}}."""
    o, site = _allowed(request, request.path_params["slug"])
    if not site or not site.get("rooms") or not _csrf_ok(request):
        return _deny()
    body = await request.json()
    new = deepcopy(site)
    pricing = {**(new.get("pricing") or {}), **(body.get("pricing") or {})}
    for k in [k for k, v in pricing.items() if v is None]:  # null = reset field to preset
        pricing.pop(k)
    new["pricing"] = pricing
    for room in new["rooms"]:
        if room["code"] in (body.get("rates") or {}):
            room["rate"] = body["rates"][room["code"]]
    return _save(o, site, new, "pricing updated")


async def api_fixed_price(request: Request) -> Response:
    """Fix (or clear, with price=null) one room's price for one night."""
    o, site = _allowed(request, request.path_params["slug"])
    if not site or not site.get("rooms") or not _csrf_ok(request):
        return _deny()
    body = await request.json()
    new = deepcopy(site)
    fixed = new.setdefault("pricing", {}).setdefault("fixed", {})
    room_fixed = fixed.setdefault(str(body.get("room")), {})
    if body.get("price") in (None, ""):
        room_fixed.pop(str(body.get("date")), None)
    else:
        room_fixed[str(body.get("date"))] = body.get("price")
    new["pricing"]["fixed"] = {k: v for k, v in fixed.items() if v}
    # drop past dates so the list stays short
    today = date.today().isoformat()
    for code in new["pricing"]["fixed"]:
        new["pricing"]["fixed"][code] = {d: p for d, p in new["pricing"]["fixed"][code].items() if d >= today}
    return _save(o, site, new, f"price fixed for {body.get('room')} {body.get('date')}")


async def api_photo_upload(request: Request) -> Response:
    _, site = _allowed(request, request.path_params["slug"])
    if not site or not _csrf_ok(request):
        return _deny()
    form = await request.form(max_files=10, max_part_size=MAX_UPLOAD)
    saved = []
    for f in form.getlist("photos"):
        data = await f.read(MAX_UPLOAD + 1)
        if len(data) > MAX_UPLOAD:
            return JSONResponse({"error": f"{f.filename}: larger than 8 MB"}, status_code=400)
        ext = _image_ext(data[:16])
        if not ext:
            return JSONResponse({"error": f"{f.filename}: only JPG, PNG or WebP photos"}, status_code=400)
        folder = MEDIA_DIR / site["slug"]
        folder.mkdir(parents=True, exist_ok=True)
        name = f"{int(time.time())}-{secrets.token_hex(4)}.{ext}"
        (folder / name).write_bytes(data)
        saved.append(f"/media/{site['slug']}/{name}")
    return JSONResponse({"saved": saved, "media": media_files(site["slug"])})


async def api_photo_delete(request: Request) -> Response:
    o, site = _allowed(request, request.path_params["slug"])
    if not site or not _csrf_ok(request):
        return _deny()
    name = request.path_params["name"]
    src = f"/media/{site['slug']}/{name}"
    path = MEDIA_DIR / site["slug"] / name
    if "/" in name or ".." in name or not path.is_file():
        return _deny()
    new = deepcopy(site)
    new["photos"] = [p for p in new.get("photos") or [] if p.get("src") != src]
    for room in new.get("rooms") or []:
        room["photos"] = [p for p in room.get("photos") or [] if p.get("src") != src]
    if diff_summary(site, new):
        resp = _save(o, site, new, "photo removed")
        if resp.status_code != 200:
            return resp
    path.unlink()
    return JSONResponse({"ok": True, "media": media_files(site["slug"]), "site": SITES[site["slug"]]})


async def api_ai_create(request: Request) -> Response:
    o, site = _allowed(request, request.path_params["slug"])
    if not site or not _csrf_ok(request):
        return _deny()
    text = str((await request.json()).get("text", "")).strip()
    if not 3 <= len(text) <= 2000:
        return JSONResponse({"error": "Write a request (3-2000 characters)"}, status_code=400)
    rid = STORE.add_ai_request(site["slug"], o["id"], text)
    task = BackgroundTask(ai_changes.propose, STORE, rid, deepcopy(site), media_files(site["slug"]))
    return JSONResponse(STORE.ai_request(rid), status_code=201, background=task)


async def api_ai_decide(request: Request) -> Response:
    o, site = _allowed(request, request.path_params["slug"])
    if not site or not _csrf_ok(request):
        return _deny()
    req = STORE.ai_request(int(request.path_params["rid"]))
    if not req or req["slug"] != site["slug"] or req["status"] != "proposed":
        return _deny()
    action = request.path_params["action"]
    if action not in ("approve", "reject"):
        return _deny()
    if action == "reject":
        STORE.update_ai_request(req["id"], status="rejected")
        return JSONResponse({"ok": True})
    new = apply_update(site, req["proposal"])
    errors = validate_site(new)
    if errors:
        return JSONResponse({"error": "This proposal no longer fits the site", "errors": errors}, status_code=400)
    save_site(site["slug"], new, author=f"ai:{req['id']}", note=req["text"][:200])
    STORE.update_ai_request(req["id"], status="applied")
    return JSONResponse({"ok": True, "site": new})


async def api_undo(request: Request) -> Response:
    o, site = _allowed(request, request.path_params["slug"])
    if not site or not _csrf_ok(request):
        return _deny()
    vid = (await request.json()).get("version_id")
    old = STORE.site_version(site["slug"], int(vid)) if str(vid).isdigit() else None
    if not old:
        return _deny()
    return _save(o, site, apply_update(site, old), f"restored version {vid}")


routes = [
    Route("/owner", home),
    Route("/owner/login", login_page, methods=["GET", "POST"]),
    Route("/owner/logout", logout, methods=["POST"]),
    Route("/owner/{slug}", app_page),
    Route("/owner/api/{slug}/summary", api_summary),
    Route("/owner/api/{slug}/bookings/{ref}", api_booking, methods=["POST"]),
    Route("/owner/api/{slug}/content", api_content, methods=["PUT"]),
    Route("/owner/api/{slug}/pricing", api_pricing, methods=["POST"]),
    Route("/owner/api/{slug}/fixed-price", api_fixed_price, methods=["POST"]),
    Route("/owner/api/{slug}/photos", api_photo_upload, methods=["POST"]),
    Route("/owner/api/{slug}/photos/{name}", api_photo_delete, methods=["DELETE"]),
    Route("/owner/api/{slug}/ai", api_ai_create, methods=["POST"]),
    Route("/owner/api/{slug}/ai/{rid:int}/{action:str}", api_ai_decide, methods=["POST"]),
    Route("/owner/api/{slug}/undo", api_undo, methods=["POST"]),
]
