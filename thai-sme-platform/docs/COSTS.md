# Costs, conversion and pricing (as of 2026-10-12)

Confidence grades: **A** = read from the provider's own API/docs; **B** = official page, read via
search extract; **C** = third-party only. Re-check B/C figures before quoting customers.
Model output comes from `python -m research.cost_model`.

## Unit prices used

| Item | Figure | Grade | Source |
|---|---|---|---|
| Claude Opus 5.5 | $4 / $20 per M tokens in/out | A | Anthropic API pricing |
| Claude Sonnet 5.5 | $2 / $10 per M tokens | A | Anthropic API pricing |
| Claude Haiku 5.5 | $0.10 / $0.50 per M tokens | A | Anthropic API pricing |
| Places Text Search Enterprise (needs website/rating fields) | $35 per 1,000 calls, 1,000 free/month | B | https://developers.google.com/maps/billing-and-pricing/pricing |
| Places Text Search Essentials (IDs only) | $0, unlimited | B | same |
| Supabase Pro | $25/month (+$10 compute credit) | A | https://supabase.com/docs/guides/platform/billing-on-supabase |
| Vercel Pro | $20/month incl. 1 seat; Hobby is non-commercial | B | https://docs.vercel.com/docs/plans/pro-plan |
| Cloudflare Workers free | 100 Workers/account, static asset requests free | B | https://developers.cloudflare.com/workers/platform/limits/ |
| .com domain via Vercel | $11.25/year | A | Vercel registrar API |
| .co.th domain | Not sold by Vercel; ~฿750–1,000/yr at Thai resellers | A / C | Vercel API; https://www.whtop.com/plans/datatan.net/97185 |
| PromptPay fee (Opn or Stripe TH) | 1.65% + 7% VAT | B | https://www.omise.co/pricing/thailand ; https://stripe.com/en-th/pricing |
| Domestic card fee | Opn 3.65%; Stripe 3.65% + ฿10 | B | same |
| LINE OA Basic | ฿1,280/month, 15,000 messages | C | https://website.z.com/th/lineoa/ |
| WhatsApp marketing template (TH) | ~$0.0842/message | C | https://www.flowcall.co/blog/whatsapp-business-api-pricing |
| USD/THB | ~33.3 | C | https://longforecast.com/usd-to-bht-today-forecast (2026-09-16) |

## Conversion inputs

| Input | Figure | Grade | Source |
|---|---|---|---|
| Cold email avg reply rate | 3.43% | B/C | https://instantly.ai/cold-email-benchmark-report-2026 |
| Cold email avg reply rate | 5.8% | C | https://belkins.io/blog/cold-email-response-rates |
| Top 10% campaigns | 10.7%+ | C | Instantly 2026 (secondary) |
| Personalised asset lift | ~1.3x (one 1,800-contact test) | C | https://puzzleinbox.com/blog/sendspark-vs-tella-vs-vidyard-cold-email-2026/ |
| **Close rate of replies** | **No published data. Assumed 15% / 25% / 35%** | Assumption | — |
| Thai/hospitality-specific benchmarks | **None found** | — | — |

These are English-language B2B email figures. Thai SMEs live on LINE, so real rates may differ in
either direction — the pilot must measure them.

## Model results (US$99 setup, PromptPay)

| Scenario | Reply rate | Close of replies | Prospects pitched per sale | Acquisition cost | Delivery cost | Payment fee | Total cost | Margin |
|---|---|---|---|---|---|---|---|---|
| Pessimistic | 3.43% | 15% | 194 | $2.48 | $12.43 | $1.75 | $16.66 | $82.34 |
| Base | 5.8% | 25% | 69 | $0.88 | $12.43 | $1.75 | $15.06 | $83.94 |
| Optimistic | 10.7% | 35% | 27 | $0.34 | $12.43 | $1.75 | $14.52 | $84.48 |

- Delivery cost = AI build + QA + onboarding ($1.18, token budgets are **assumptions**) + .com domain ($11.25).
- Pilot on one VPS instead (docs/HOSTING.md): ~$12–24/month replaces Supabase Pro + Vercel Pro.
- Fixed platform cost ≈ **$86/month** (Supabase Pro + Vercel Pro + LINE OA Basic) → base case covers it with ~1 sale/month.
- **Not included:** your time, human review of pitches, refunds, tax/company costs, phone/SIM costs.

## What the numbers say

| Finding | Implication |
|---|---|
| AI and API costs are tiny per sale (<$4) | Price is not limited by compute; it's limited by how many owners say yes |
| The domain is the largest single delivery cost | Use `name.oursite.co` subdomains by default; custom domain as an add-on |
| Building a full sample site for every prospect is affordable only with cheap templates | Pitch with a Haiku-filled template preview; full Sonnet/Opus build only after payment |
| Places Enterprise SKU is 1,000 free calls/month (~20,000 places) | Pilot discovery in all 3 regions fits inside the free tier |
| Market is finite outside Bangkok (Samui ~634 registered accommodations, NST ~357 hotels per C9 Hotelworks) | Samui and NST will saturate quickly; Bangkok is the volume market |
| Competitors: Fastwork template sites from ฿1,500; Readyplanet ฿9,500/yr | ~฿3,300 sits in between — credible if it includes booking + LINE |

## Proposed pricing (to validate in pilot)

| Item | Price | Why |
|---|---|---|
| Setup incl. year 1 hosting on our subdomain, booking, LINE/WhatsApp buttons | **฿3,290 (~US$99)** | Matches your ~$100 target; ~85% margin in all three scenarios |
| Renewal from year 2 | ฿1,290/year | Covers hosting share, domain if any, support |
| Small change (menu price, photo, hours) | ฿150 each, or free in owner portal | Keeps owners on the platform; self-service is cheaper for us |
| Custom .com domain add-on (we register it in their name and manage it) | ฿590/year | Domain $11.25 ≈ ฿375 + margin |
| Customer brings their own domain | Free | They point an A record at our server |
| Deposit collection for bookings | 0% platform fee in pilot; gateway fee passed through | Undercuts OTA commissions (Agoda ~15–20%, Booking.com 10–25% per vendor blogs, grade C) |
| Auto Pricing add-on (hotels) | ฿290/month up to 15 rooms; ฿790/month larger | See docs/PRICING.md; competitors ~$10–200/month (grade C) |
| Google Maps photos in previews | Our cost: Place Photos $7 per 1,000 after 1,000 free/month (grade B) | ~6 photo calls per preview view |
