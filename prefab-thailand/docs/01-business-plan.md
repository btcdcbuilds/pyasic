# 01 — Business Plan

## 1. Concept (one paragraph)

[BRAND] imports fold-out / expandable prefab units from a known Chinese
manufacturer (about a 30-day production lead time, per the owner), holds stock in a
Thai warehouse, and sells them ready to use: pre-wired with lights, power
points, a small switchboard, an external connection point and optional
air-con mounting. We deliver and set them up on our own flatbed truck, and
install them on imported **screw piles** so they sit level, stay above ground
and don't move. We also sell matching office furniture. AI agents handle
most of the sales conversations, quoting, follow-up and after-sales support across
Lazada, Facebook, LINE, WhatsApp and our website. Humans approve anything
involving money, contracts or legal risk.

## 2. Customer segments

| Segment | Typical need | Units per order (expected) | Key buying factors | Where to reach them |
|---------|-------------|---------------------------|--------------------|---------------------|
| Construction contractors | Site office, foreman office, store room, toilet block | 1–10 | Speed, relocatable, price, rental vs buy | LINE groups, Facebook contractor groups, direct sales, site visits |
| Data-centre build sites | Site offices, security huts, worker welfare | 5–50+ (stacked) | Compliance, documentation, fast delivery, professional supplier | Direct B2B outreach to EPC contractors, LinkedIn, tenders |
| Staff / worker accommodation | Stackable dormitory blocks | 10–100 | Cost per bed, stacking, fire safety, toilets/showers | B2B direct, factory HR/admin, construction main contractors |
| Homeowners | Granny flat, home office, rental room, farm house | 1–2 | Price, appearance, financing, permits help | Lazada, Facebook ads, TikTok, website |
| SMEs / shops | Pop-up shop, café kiosk, ticket booth | 1–3 | Look, branding, fast set-up | Facebook, Lazada, website |
| Truck hire (separate line) | Moving heavy items | n/a | Availability, price, crane | LINE OA, Facebook, Google Maps listing |

> Volumes are expectations to test, not market data. Validate with the first 20 sales conversations.

## 3. Revenue streams

| Stream | Description | Pricing basis |
|--------|-------------|---------------|
| Unit sales | Base unit + option packs | Landed cost + target margin (doc 09) |
| Delivery | Our flatbed to site | Per km band + crane/lift fee |
| Installation | Screw piles, levelling, unfolding, connections by our team | Per unit + per pile |
| Screw piles | Sold with install or as DIY kit | Per pile + per kit |
| Furniture packs | Desk, chairs, filing, shelving, curtains, etc. | Pack price |
| Air-con supply + install | Optional, through a licensed partner installer | Per BTU size |
| Truck hire | Flatbed (ideally with crane) hire with driver | Per trip / half-day / day |
| Rental (phase 2) | Monthly rental of units to construction sites | Monthly rate + delivery/collection |
| Buy-back / relocation (phase 2) | Move a unit to a new site, or buy it back | Quote |

**Why rental matters:** construction and data-centre sites are temporary.
Many contractors prefer to rent site offices. Once the stock turns over, a rental fleet gives
recurring revenue and reuses the truck. Not in phase 1, but the website and CRM
should support it from day one.

## 4. Competitive position

| Factor | Our plan | Notes |
|--------|----------|-------|
| Stock in Thailand | Units in the warehouse, ready to deliver | Hypothesis: many competitors sell factory-direct with long lead times. Test by mystery-shopping competitors (see below) |
| One-stop | Unit + piles + delivery + install + furniture + AC | Removes the need for buyers to coordinate 4–5 vendors |
| Always-on response | AI agents on every channel, 24/7, Thai/English/Chinese | Fast replies are a selling point in Thai online commerce |
| Proper foundations | Screw piles instead of loose blocks | Real differentiator: unit stays level and is easy to relocate |
| Expertise content | Brand character gives free advice (permits, sizing, foundations, electrics) | Builds trust and organic reach |

**Competitor research to do (task for the research agent):** list at least 15 Thai sellers of
container offices / prefab houses (Lazada, Facebook, Google), recording price
range, sizes, lead time, whether they install, and reviews. Save it as
`research/competitors.csv`. Do not use any competitor's name or branding in our
marketing.

## 5. Key risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| Import duty is 80% (no FTA preference) | Business may not be viable at a competitive price | Unknown | Written classification + Form E advice from customs broker before ordering; consider HS classification alternatives only on a broker's advice |
| Customs hold on electrical parts (TISI) | Delay, storage fees, re-work | Medium | Pre-check the components list; ship TISI-certified parts, or fit Thai-certified electrics locally |
| Quality issues from factory | Returns, reputation | Medium | Pre-shipment inspection (third-party), sample unit first, retention payment |
| Buyer can't get a permit / gets a demolition order | Disputes, refunds | Medium | Clear pre-sale disclosure, permit guidance sheet, contract clause |
| Platform bans (Facebook/Lazada) | Lose sales channels | Medium if we break rules | Transparent bot, official APIs only, no fake accounts |
| AI agent gives wrong price, promise or legal advice | Financial/legal exposure | Medium | Price list in the DB is the only source of prices; human approval gates; disclaimer; conversation logs |
| Slow stock turnover | Cash tied up | Medium | Pre-sell before the container lands; offer deposits/reservations; start rental |
| Truck accident / damage in transit | Liability | Low–Med | Commercial insurance, goods-in-transit cover, trained driver, load securing |
| Currency (CNY/USD vs THB) | Margin erosion | Medium | Price quotes valid 7–14 days; review price list each order |

## 6. Business model summary (canvas)

| Block | Content |
|-------|---------|
| Customer segments | Contractors, data-centre sites, staff accommodation, homeowners, SMEs |
| Value proposition | Fast, ready-to-use, properly founded units, one supplier for everything, always-on support |
| Channels | Website, LINE OA, WhatsApp, Facebook/Messenger, Lazada, TikTok (later), direct B2B |
| Customer relationships | AI-first chat with human escalation; after-sales check-ins at 7/30/180 days |
| Revenue | Units, options, piles, delivery, install, furniture, truck hire, rental (phase 2) |
| Key resources | Supplier relationship, warehouse, flatbed truck, install crew, AI agent stack, brand content |
| Key activities | Importing, QC, stocking, selling, delivering, installing, support |
| Key partners | China factory, freight forwarder, customs broker, accountant, lawyer, licensed electrician, AC installer, insurer |
| Cost structure | Units (FOB), freight, duty + VAT, warehouse rent, truck + fuel + driver, staff, software/AI, ads |
