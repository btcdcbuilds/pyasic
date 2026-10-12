# 06 — AI Agent Architecture

Goal: run as much of sales, admin and after-sales as possible with AI agents,
while **humans keep control of money, contracts, legal statements and anything
irreversible**.

## 1. Overview

```
 Customers                    Suppliers               Internal
 ─────────                    ─────────               ────────
 LINE OA ─┐                   WeChat/WeCom (human)    Owner / admin
 WhatsApp ┤                        │                  approval queue
 Messenger┤                        ▼                       ▲
 Web chat ┤──► Channel gateway ──► Orchestrator ──► Specialist agents
 Lazada   ┘    (webhooks)          (router)          │
                                                     ├─ tools: price list, stock, CRM,
                                                     │  quotes, calendar, payments (read),
                                                     │  knowledge base, shipping tracker
                                                     └─ every action logged
```

| Layer | Recommended tech | Why |
|-------|------------------|-----|
| Channel gateway | Webhook endpoints per channel (LINE Messaging API, WhatsApp Cloud API, Messenger Platform, Lazada Open Platform, website chat) | Official APIs only: no account bans |
| Orchestrator + agents | Claude via the Claude API / Claude Agent SDK, with tool use | Strong multilingual (Thai/English/Chinese) reasoning and tool calling |
| Model routing | Small/fast model for classification and simple FAQs; larger model for quoting, negotiation, supplier comms, legal-sensitive replies | Cost control |
| Data | Postgres (e.g. Supabase): customers, conversations, products, price list, stock, quotes, orders, deliveries, tickets | One source of truth |
| Knowledge base | Product specs, FAQs, permit guide, warranty terms, install guides (Thai + English), retrieved into context | Agents answer from approved content only |
| Human approval queue | Simple admin dashboard + LINE notify to the owner's phone | Fast approvals from anywhere |
| Audit log | Every message, tool call and approval stored | Disputes, PDPA requests, training |

## 2. Agent roster

| Agent | Job | Can do on its own | Needs human approval |
|-------|-----|-------------------|---------------------|
| **Front-desk / router** | Greets, detects language + intent, routes | Answer FAQs from the knowledge base, collect contact info (with PDPA notice) | — |
| **Sales agent** (brand character) | Qualifies leads, recommends units/options, books show-unit visits | Recommend from the catalogue; send standard brochures; book visits | Any discount; any promise not in the approved claims list |
| **Quote agent** | Builds quotes from the price list + delivery zones | Send quotes **≤ THB [threshold]** with standard terms | Quotes above the threshold; custom items; non-standard payment terms |
| **Order & payment agent** | Turns accepted quotes into orders, sends payment details, tracks deposits | Send the company bank details / payment link; remind about due payments | Confirming a payment as received (until bank reconciliation is automated); refunds; cancellations |
| **Dispatch agent** | Schedules site surveys, deliveries, installs, truck hire | Propose slots from the calendar; send ETAs; request site photos | Final booking for crane/heavy jobs; any job outside the service area |
| **Support agent** | After-sales, warranty claims, how-to | Troubleshoot from the manuals; open tickets; schedule check-ins | Approving warranty claims; compensation |
| **Supplier agent** | Drafts Chinese messages to the factory, tracks production, compares quotes, translates | Draft + translate; update production status from photos/messages | **Sending** anything that commits us (POs, payments, spec changes) |
| **Content agent** | Writes posts, blog articles, video scripts, Lazada listings in the brand voice | Draft | Publishing |
| **Ads agent** | Builds and optimises campaigns | Rebalance spend within approved caps; pause poor ads | New campaigns; budget increases; new claims |
| **Admin / finance agent** | Prepares documents for the accountant, matches invoices to orders, flags overdue payments | Draft tax invoices from orders for review; reports | Issuing final tax invoices (until the process is proven); any payment out |
| **Research agent** | Competitor prices, tender listings, new construction / data-centre projects, lead lists | Web research, internal reports (computer use allowed for research) | Outreach to new leads |

## 3. Guardrails (non-negotiable)

| # | Rule |
|---|------|
| 1 | **Prices only from the price-list table.** The agent never makes up or computes a price outside the quote tool |
| 2 | Agents always say they're an AI assistant when asked, and in the first message of a new conversation |
| 3 | No legal/permit **guarantees**. Agents give the approved permit guidance sheet and recommend checking with the local district office (อบต./เทศบาล/สำนักงานเขต) |
| 4 | No electrical/structural advice beyond the approved knowledge base; route to a human/engineer |
| 5 | PDPA: show the privacy notice; separate opt-in for marketing; honour opt-outs immediately; data deletion requests go to a human |
| 6 | Escalate to a human on: an angry customer, a legal threat, an injury/safety report, a press enquiry, a government officer, anything above the value thresholds |
| 7 | No outbound messages to people who haven't contacted us or opted in (respects platform rules and the 24-hour messaging windows) |
| 8 | Spending caps on ads and API usage, alerts at 80% |
| 9 | Weekly human review of a random 5% sample of conversations + all escalations |

## 4. Build order

| Phase | What | Done when |
|-------|------|-----------|
| A | Knowledge base + price-list DB + LINE OA bot (FAQ + lead capture) + human handoff | A test customer can ask questions and leave details on LINE |
| B | Quote agent + PDF quote generator + approval queue | Quotes under the threshold go out automatically and correctly |
| C | WhatsApp + Messenger + web chat on the same backend | All channels share one inbox and one customer record |
| D | Dispatch + support agents, calendar, check-ins | Deliveries scheduled via chat |
| E | Supplier agent (draft/translate), content + ads agents | Weekly content calendar runs with human approval |
| F | Lazada integration, admin/finance agent | Orders sync to the CRM and accountant export |
