# 07 — Website Specification

## 1. Goals

| Goal | Measure |
|------|---------|
| Turn visitors into chats/quotes | % of visitors who start a chat or configure a unit |
| Always-online response | Median first reply < 1 minute on every channel (AI) |
| Trust | Real install photos, specs, certificates, warranty terms, company registration details shown |
| SEO in Thai + English | Rank for prefab/container office/staff accommodation searches |

## 2. Site map

| Page | Purpose | Key content |
|------|---------|-------------|
| Home | Hook + route | Hero video of the show unit, 3 use-case tiles (site office / accommodation / home), "Chat on LINE" + "WhatsApp" buttons |
| Products | Catalogue | Each model: dimensions, folded/unfolded, specs, photos, 3D/360 view (phase 2), downloadable spec sheet |
| Configurator | Build a unit | Choose size → option packs → furniture → screw piles → delivery postcode → instant estimate → "Get formal quote" |
| Site offices | Segment page | Contractor-focused copy, rental (phase 2), fast delivery |
| Staff accommodation | Segment page | Stacking layouts, cost-per-bed calculator, toilet/shower blocks |
| Data centre & industrial | Segment page | Documentation pack, compliance, multi-unit delivery planning |
| Homes | Segment page | Granny flat, home office, permit guide |
| Screw piles | Explainer | Why piles, how installed, soil types, video |
| Truck & crane hire | Sub-brand page | Truck specs, rates, booking form (only once the DLT licence position is confirmed) |
| Advice hub (blog) | Brand character's guides | Permits, AC sizing, foundations, heat insulation, electrical safety |
| Projects | Case studies | Real installs only (with customer permission) |
| About / Contact | Trust | Company name, registration no., VAT no., address, map, show-unit visit booking |
| Legal pages | Compliance | Terms of sale, warranty, privacy notice (PDPA), cookie notice, delivery & installation terms |
| Customer portal (phase 2) | After-sales | Order status, documents, warranty registration, support tickets |
| Admin dashboard | Internal | Approval queue, conversations, quotes, orders, stock, deliveries, price list editor |

Languages: Thai (default), English, Chinese (simplified: for Chinese contractors in Thailand).

## 3. Messaging integrations

| Channel | Integration | Notes |
|---------|-------------|-------|
| **LINE** | LINE Official Account + Messaging API webhook; rich menu (Products / Get quote / Book visit / Support / Truck hire); LINE Login for quick sign-in (optional) | Primary Thai channel |
| **WhatsApp** | WhatsApp Business Platform (Cloud API) via Meta; click-to-chat button with a pre-filled message | Template messages need Meta approval for outbound messages outside the 24-hour window |
| **Facebook Messenger** | Messenger Platform webhook on the Page | Same inbox |
| **WeChat** | For **suppliers**: a human-operated WeChat/WeCom account with the supplier agent drafting/translating. For **Chinese-speaking customers in Thailand**: a WeChat QR code on the contact page routing to a human, with AI drafting help | A WeChat Official Account / API normally needs a mainland-China or approved overseas entity verification: check before relying on it. Don't use unofficial WeChat bots (ban risk) |
| **Web chat** | Our own widget talking to the same agent backend | Hand off to LINE/WhatsApp so the customer can leave and come back |
| **Email** | Transactional email (quotes, invoices, confirmations) | Shared domain, SPF/DKIM/DMARC set up |

All channels → **one unified inbox** and **one customer record** (matched by phone/LINE ID/email).

## 4. Recommended tech stack

| Part | Choice | Reason |
|------|--------|--------|
| Front end | Next.js (React) with i18n (th/en/zh) | SEO, speed, large ecosystem |
| Hosting | Vercel (or similar) | Simple deploys, preview builds |
| Database + auth + storage | Supabase (Postgres) | Price list, CRM, orders, files, row-level security |
| Agent backend | Server functions / a small Node or Python service with the Claude Agent SDK | Webhooks from all channels |
| PDF quotes / invoices | Server-side PDF generation from templates | Consistent documents |
| Payments | Thai bank transfer / PromptPay QR (phase 1); payment gateway that supports PromptPay + cards (phase 2: compare Thai providers on fees) | Deposits online |
| Accounting export | CSV/API export to the accountant's Thai accounting software (e.g. FlowAccount, PEAK or Express: ask the accountant which they use) | Tax invoices, VAT reports |
| Analytics | Privacy-respecting analytics + Meta/Google conversion tracking **only after cookie consent** | PDPA |

## 5. Core data model (first version)

| Table | Key fields |
|-------|-----------|
| products | sku, name_th/en/zh, type (unit/option/furniture/pile/service), specs JSON, active |
| price_list | sku, price_thb_ex_vat, valid_from, valid_to, cost_ref |
| stock | sku, serial/unit id, status (in transit/in stock/reserved/sold/delivered), location |
| customers | name, company, tax id, phone, line_id, whatsapp, email, consent_marketing (bool + timestamp + source) |
| conversations | customer_id, channel, messages, agent, escalated, assigned_human |
| quotes | customer_id, lines, totals, vat, validity, status, approved_by |
| orders | quote_id, deposit, balance, payment status, delivery_id |
| deliveries | order_id, site location, survey photos, date, truck, crew, handover status |
| tickets | customer_id, order_id, type (warranty/how-to/complaint), status |
| purchase_orders | supplier, PI, lines, payments, production status, inspection report, shipment/BL, customs status |
| approvals | type, object_id, requested_by_agent, decided_by, decision, timestamp |

## 6. Phase 1 build checklist

| # | Task |
|---|------|
| 1 | Register domain(s) + business email |
| 2 | Create LINE OA, Facebook Page, WhatsApp Business account (Meta Business verification needs company documents) |
| 3 | Scaffold Next.js site (th/en), product pages, contact, legal pages |
| 4 | Supabase schema (above) + price-list editor |
| 5 | Agent backend: LINE webhook first, then WhatsApp + Messenger |
| 6 | Configurator + estimate (reads price_list) |
| 7 | Quote PDF + approval queue |
| 8 | Cookie consent + privacy notice + marketing opt-in |
| 9 | Launch with real photos from the show unit |
