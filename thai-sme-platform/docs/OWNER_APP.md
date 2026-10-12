# Owner app

The business owner's app at `https://<platform>/owner`. It's built for phones first, in Thai and
English. One login can manage several businesses.

## Screens

| Tab | What the owner can do |
|---|---|
| **Today** | Counts: bookings to confirm, next 7 days, deposits not yet received, rooms full tonight, AI changes waiting for approval. The next 5 bookings. A "make your website better" checklist (add photos, add PromptPay, add FAQs, turn on auto pricing, confirm draft rooms) |
| **Bookings** | Filter upcoming / pending / past / all. Confirm, cancel, mark deposit received. Tap-to-call the guest |
| **Website** | Edit every section: name, tagline, about, contact, PromptPay, hours, menu (categories, dishes, prices, 🌶️/🌿 tags), rooms, treatments and durations, trips and departures, highlights, FAQ, delivery links, booking settings, colours. Save is validated; **change history with one-tap restore** |
| **Photos** | Upload JPG/PNG/WebP (max 8 MB), set the main photo, add to the gallery, attach to a room, delete |
| **Prices** (hotels) | Mode **Off / Suggest / Auto**; aggressiveness **Careful / Balanced / Aggressive**; fine-tune lowest/highest price and weekend uplift; base rate per room; seasons and events; **45-night calendar**: tap any night to fix your own price; revenue estimate (suggested vs base) |
| **Ask AI** | Type a request in Thai or English, or tap an example. AI proposes the change and shows the list of what will change; **nothing goes live until the owner taps Approve**. Without an API key, requests queue for our team |

## Aggressiveness presets (`webapp/pricing.py`)

| Preset | Lowest | Highest | Fri/Sat | Occupancy rises | Last-minute | Early-bird |
|---|---|---|---|---|---|---|
| Careful | 85% | 125% | +5% | >60% +5, >80% +10, >90% +15 | ≤2 days, <40% full: −10% | — |
| Balanced | 80% | 150% | +10% | >50% +10, >75% +20, >90% +30 | ≤3 days, <50% full: −15% | ≥90 days: −5% |
| Aggressive | 70% | 180% | +15% | >40% +10, >65% +25, >85% +40 | ≤5 days, <60% full: −20% | ≥90 days: −8% |

We designed these as starting points; they weren't taken from any vendor. The highest price
can never be set above 200% of the base rate, because of the Thai price law (docs/PRICING.md).
A price the owner fixes for a night always wins, even in Suggest mode.

## Safety rules built in

| Rule | Where |
|---|---|
| Owners only see businesses linked to their account | `owner_sites` table, checked on every request |
| Every change passes `validate_site()`: prices are whole baht, colours are hex, photos are uploads or https only, times are HH:MM, and the pricing ceiling is ≤200% | `webapp/content.py` |
| Owners and the AI cannot change slug, industry, region, preview/live status or booking type | `apply_update()` |
| Every save is versioned and can be restored | `site_versions` table |
| AI proposals are validated, retried once with the errors, and need owner approval | `webapp/ai_changes.py` |
| Session cookie is signed; mutating calls need the `X-Requested-With: owner-app` header; login is limited to 10 tries per 15 minutes per IP | `webapp/owner.py` |
| Uploads are checked by file signature, not the file name | `_image_ext()` |

## Payments and alerts

| Feature | How it works | Needs |
|---|---|---|
| Deposit by PromptPay QR | After booking, the guest sees a QR for the deposit, paid straight to the business's own PromptPay. The owner taps "Deposit received" | The owner's PromptPay number on the Website tab. Output matched the `promptpay-qr` npm library exactly in our test. **Scan one with a real banking app before going live** |
| LINE alert on new booking | Push message to the owner's LINE | `LINE_CHANNEL_ACCESS_TOKEN` (our LINE OA) + the owner's LINE user ID (`--line` when creating the owner) |

## Set up an owner

```bash
python -m webapp.manage create-owner somchai "Khun Somchai" baan-lom-talay --line U1234...
# prints a temporary password - send it to the owner privately on LINE
python -m webapp.manage list
```

## Not built yet

- Owners changing their own password; LINE Login
- Payment-gateway deposits (Opn / Stripe Thailand) with automatic confirmation
- Booking pace (pickup) and orphan-night pricing
- Chinese and Russian site languages
