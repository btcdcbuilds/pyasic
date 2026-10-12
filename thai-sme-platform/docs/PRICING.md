# Automatic room pricing ("price fixing on demand")

Code: `webapp/pricing.py`. Config: `pricing:` in a hotel's site YAML (example:
`sites/content/baan-lom-talay.yaml`). Owner view: 30-night price calendar on
`/admin/<slug>`. Public: `/api/<slug>/rates?days=14`.

## How a night's price is set

| Step | Rule | Owner setting |
|---|---|---|
| 1 | Start from the room type's **base rate** | `rooms[].rate` |
| 2 | **Season**: first matching date range | `seasons` (e.g. +30% New Year, −10% monsoon) |
| 3 | **Weekend**: Fri/Sat nights | `weekend_pct` |
| 4 | **Occupancy**: how full that room type already is that night | `occupancy` steps (e.g. >50% +10, >75% +20, >90% +30) |
| 5 | **Last-minute**: within N days and still emptier than X% | `last_minute` (e.g. ≤3 days, <50% full, −15%) |
| 6 | **Early-bird**: booked far ahead | `early_bird` (e.g. ≥90 days, −5%) |
| 7 | Premiums multiply; **only the biggest discount applies** (no double discounts) | — |
| 8 | Clamp to **floor / ceiling**, round to ฿50 | `floor_pct`, `ceiling_pct`, `round_to` |

`mode: suggest` (the default) keeps the base rate on the website and shows suggestions to the owner.
`mode: auto` charges the computed price on the website.

This matches what the commercial tools publish about their methods:

| Tool | What its docs say | Source |
|---|---|---|
| PriceLabs | Occupancy steps, last-minute discount, far-out premium, orphan-night discount; discounts don't stack, premiums do; min/max | https://help.pricelabs.co/portal/en/kb/articles/pricing-customizations |
| RoomPriceGenie | Blends competitor prices, Airbnb data and a booking-pickup model; min/max always respected | https://help.roompricegenie.com/en/knowledge/model-selection |
| Beyond | Seasonality, day of week, availability, local events; seasonal min/max | https://support.beyondpricing.com/ |

**Not built yet:** orphan-night discount (1–2 night gaps), booking-pace (pickup) model,
competitor rates. Competitor data must come from a licensed rate-shopping feed
(Lighthouse, RateGain; quote-based). Scraping OTAs breaks Booking.com's terms.

## Default seasons (owner must review)

| Market | Default | Evidence | Grade |
|---|---|---|---|
| Koh Samui | Peak 20 Dec–10 Jan +30%; high 11 Jan–30 Apr +15%; Songkran 12–16 Apr +20%; Jul–Aug +10%; monsoon 15 Oct–15 Dec −10% | C9 Hotelworks Samui updates (2024, 2025); travel guides (wettest mid-Oct–mid-Dec) | Mixed: C9 plus third-party sources |
| Bangkok | High Nov–Feb; low May–Sep; Oct shoulder. H1 2025: Jan–Feb >81% occupancy, June 69.8% | Knight Frank via thehotelconversation.com.au; thailandstats.com | Third-party sources |
| Nakhon Si Thammarat | Only dated monthly data (2017–19, CEIC): high Apr 75%, low Nov 48%. Sart Duean Sip festival (Sep/Oct) | ceicdata.com; thailand.prd.go.th | Dated data |

Demand events to add per site: Songkran (13–15 Apr), New Year, Chinese New Year (6 Feb 2027),
China Golden Week (1–7 Oct), Japan Golden Week, Malaysian school holidays (strong in the south).
The 2027 Thai holiday list was still provisional as of Aug 2026.

## Thai law

| Rule | What it means for us | Source |
|---|---|---|
| Hotel Act B.E. 2547: the room-rate document must be displayed in the hotel | The owner keeps the base-rate list displayed at the hotel; the website shows the actual price | https://report.dopa.go.th/laws/document/2/234.pdf |
| Prices of Goods and Services Act s.28: prices must be displayed (online sellers included since 2020) | Every price shown before the guest books, with the total in the quote | https://www2.austlii.edu.au/~graham/AsianLII/Thai_Translation/Price%20of%20Goods%20and%20Services%20Act.pdf |
| Same Act s.29: "unreasonably high" prices are prohibited (up to 7 years / ฿140,000; reaffirmed Mar 2026) | **Keep a ceiling** (default 150%, never above 200%), and no surge pricing during emergencies or disasters | https://www.khaosodenglish.com/tech/2026/03/04/government-warns-of-up-to-7-years-in-jail-for-unjustified-price-hikes/ |
| No law found that bans dynamic pricing as such | Have a Thai lawyer confirm before launch | — |

## What to charge for it (proposal)

| Benchmark | Price | Grade |
|---|---|---|
| PriceLabs (outside US/UK/EU) | ~$9.99 per listing per month | Third-party; conflicting tiers |
| RoomPriceGenie | ~€119–198 per month | Third-party; conflicting |
| **Our cost** | ~$0 (rules run on our server; one Haiku check per day ≈ <$0.01) | Our estimate |

**Proposal:** Auto Pricing add-on at **฿290/month for up to 15 rooms** and **฿790/month for larger
hotels**, with the first month free. Agree the real price after the pilot.
