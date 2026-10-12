# Testing the sample sites

## Run locally (5 minutes)

```bash
cd thai-sme-platform
pip install -r requirements.txt
python -m webapp.manage create-owner demo "Demo Owner" all   # note the printed password
SECRET_KEY=dev ADMIN_KEY=demo uvicorn webapp.app:app --port 8000
```

Owner app: http://localhost:8000/owner (sign in as `demo`).

Open http://localhost:8000 — the index lists all five sample sites.
Owner bookings view: `http://localhost:8000/admin/<slug>?key=demo`.

Automated checks: `python -m pytest -q tests` (42 tests).

## Manual checklist (do on a phone and a laptop)

| # | Check | Sites |
|---|---|---|
| 1 | Page loads, Thai shows by default on a Thai phone; EN/ไทย button switches everything | All |
| 2 | Bottom bar (Call / LINE / WhatsApp / Book) visible on phone, hidden on desktop | All |
| 3 | Menu prices readable, spicy/vegetarian icons sensible | Restaurant, café |
| 4 | "Choose" on a room jumps to the form with that room selected; total and 30% deposit appear | Resort |
| 5 | Book the Family House 3 times for the same dates → the 3rd is refused "fully booked" (2 units) | Resort |
| 6 | Changing trip updates departure times; 11 people on one boat is refused | Tours |
| 7 | Changing treatment updates durations; 21:00 is not offered (last start 20:30) | Spa |
| 8 | Cake pre-order for tomorrow is refused (2 days' notice) | Café |
| 9 | Submitting without ticking privacy consent is blocked | All |
| 10 | Booking appears in `/admin/<slug>?key=…` | All |
| 11 | Privacy notice link works and reads correctly in both languages | All |
| 12 | Thai wording sounds natural to a Thai speaker (please have a Thai speaker review) | All |

## Pricing and photos checks

| # | Check |
|---|---|
| 13 | `/admin/baan-lom-talay?key=demo` shows a 30-night price calendar; hover a price to see why |
| 14 | Book several sea-view nights for one date → that night's price rises on the calendar |
| 15 | A room quote for a Fri/Sat night is 10% higher than a quiet weekday |
| 16 | With `GOOGLE_MAPS_API_KEY` set, a site YAML with `google_place_id` + `status: preview` shows a "Google Maps" photo block with author names |

## Owner app checks

| # | Check |
|---|---|
| 17 | Sign in on a phone; bottom tabs work; EN/ไทย switches everything |
| 18 | Make a booking on the public site, then Confirm it and mark "Deposit received" in Bookings |
| 19 | Change a menu price in Website → Save → the public site shows the new price; restore the old version from Change history |
| 20 | Upload a photo, make it the main photo, check the public site |
| 21 | Prices: switch Balanced → Aggressive and Suggest → Auto, save; tap a night and fix a price; book that night on the public site and check the total |
| 22 | Ask AI (needs ANTHROPIC_API_KEY): "Add FAQ: parking — free for 10 cars" → review the change list → Approve → check the public site |
| 23 | Book a resort room → PromptPay QR shows; **scan it with a real Thai banking app (don't pay) and check the amount** |

## Not built yet (next phase)

| Item | Plan |
|---|---|
| Automatic deposit confirmation | Gateway (Opn / Stripe Thailand) instead of the owner confirming PromptPay manually |
| Real photos | Owner uploads; placeholders show where they go |
| Password change / LINE Login | Owners currently get a password from us |
| Chinese / Russian | Add languages after Thai/English is approved |
