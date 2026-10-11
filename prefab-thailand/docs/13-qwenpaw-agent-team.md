# 13 — Our AI Agent Team (QwenPaw)

The team below is designed for **this business only**. It runs on QwenPaw
(the platform the owner showed: built-in channels, skills, tools, MCP, cron
jobs, agent-to-agent chat). The agents in the screenshots belonged to someone
else and aren't used.

## 1. Design principles

| Principle | Why |
|-----------|-----|
| **Start with 7 agents, split later** | Every agent has its own memory, skills and token cost. Split a role only when its workload or error rate justifies it |
| **One job per agent, clear hand-offs** | Easier to test, debug and measure (QwenPaw's Agent Statistics shows cost per agent) |
| **Customer-facing agents get the fewest tools** | Customers can type anything, including attempts to trick the bot. The agents that talk to the public get **no shell, no file writing, no browser**. They ask other agents to do things |
| **A separate checker** | Drawings, layouts and quotes are checked by an agent that didn't make them |
| **Humans approve money, contracts and legal statements** | Ops Manager collects approvals and sends them to the owner on Telegram |
| **Prices, sizes and stock come from data, never from the model's memory** | Avoids wrong quotes |

## 2. Phase-1 team (pre-launch → first container sold)

| # | Agent ID | Display name | Job | Talks to |
|---|----------|--------------|-----|----------|
| 1 | `ops-manager` | Ops Manager | Runs the day: routes work, keeps the approval queue, morning brief, chases anything stuck, sends approvals to the owner | Owner (Telegram), all agents |
| 2 | `sales-support` | Brand character (e.g. "Khun [Name] from [BRAND]") | All customer conversations: answers questions, collects site info, sends layouts and quotes, books show-unit visits, after-sales help | Customers (LINE, WhatsApp, Messenger, web chat) |
| 3 | `site-engineer` | Site Engineer | Turns customer photos and measurements into a to-scale layout on satellite/drone images, then CAD models and drawings in STEVE | sales-support, qa-reviewer |
| 4 | `qa-reviewer` | QA Reviewer | Checks every layout, drawing pack and quote above the threshold before it goes out: right numbers, disclaimers, prices from the price list | site-engineer, sales-support, ops-manager |
| 5 | `supply-customs` | Supply & Customs | Supplier messages in Chinese (drafts), production tracking, the 0% duty gate, shipping documents, bonded-warehouse releases | Supplier (WeCom, drafts only), customs broker (email drafts), ops-manager |
| 6 | `back-office` | Back Office | Price list, stock, CRM, orders, deposits, invoice drafts for the accountant, weekly KPI report | All agents (internal), accountant (exports) |
| 7 | `marketing` | Marketing | Content in the brand voice, ad drafts, Lazada listings, competitor and project research | ops-manager (approvals), back-office (prices) |

### Phase 2: split when volume grows

| New agent | Split from | Trigger to split (suggested) |
|-----------|-----------|------------------------------|
| `after-sales` | sales-support | Support tickets slow down sales replies |
| `dispatch` | ops-manager | Truck owned + deliveries/truck-hire bookings weekly |
| `cad-drafter` | site-engineer | Layout requests queue for more than a day |
| `research` | marketing | Tender and project tracking becomes a weekly job |
| `b2b-sales` | sales-support | Data-centre / contractor deals need longer, multi-person conversations |

## 3. Each agent's setup in QwenPaw

### Channels

| Agent | Channels |
|-------|----------|
| ops-manager | Telegram (owner only), Console |
| sales-support | LINE + WhatsApp (via bridge or custom channel, see §5), Facebook Messenger, website chat |
| supply-customs | WeCom (supplier), Console. Drafts go to the owner for sending/approval |
| All others | Internal only (agent-to-agent, Console) |

### Tools (QwenPaw built-in tools page: enable only what's listed)

| Tool | ops-manager | sales-support | site-engineer | qa-reviewer | supply-customs | back-office | marketing |
|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| execute_shell_command | – | **off** | ✓ (layout script) | – | – | ✓ (exports) | – |
| read_file / grep / glob | ✓ | ✓ (knowledge base only) | ✓ | ✓ | ✓ | ✓ | ✓ |
| write_file / edit_file | ✓ | **off** | ✓ | – | ✓ | ✓ | ✓ |
| browser_use | – | **off** | – | – | – | – | ✓ (research only) |
| view_image | ✓ | ✓ (customer photos) | ✓ | ✓ | ✓ (production photos) | – | ✓ |
| view_video | – | ✓ | – | – | ✓ (production videos) | – | ✓ |
| send_file_to_user | ✓ | ✓ | – | – | – | – | – |
| desktop_screenshot | – | – | – | – | – | – | – |
| delegate_external_agent | – | – | – | – | – | – | – |
| MCP: STEVE | – | – | ✓ | ✓ (read-only use: inspect) | – | – | – |

### Skills

| Agent | Our skills (`qwenpaw/skills/`) | QwenPaw built-in skills |
|-------|-------------------------------|-------------------------|
| ops-manager | `approvals`, `form-e-duty-gate` (read) | cron, chat_with_agent, channel_message |
| sales-support | `brand-voice-sales`, `prefab-catalog`, `prefab-site-intake`, `prefab-quote` | chat_with_agent |
| site-engineer | `prefab-catalog`, `prefab-site-layout`, `prefab-cad-model` | chat_with_agent |
| qa-reviewer | `qa-checklists`, `prefab-catalog` | chat_with_agent |
| supply-customs | `supplier-liaison`, `form-e-duty-gate` | cron, chat_with_agent, pdf, xlsx |
| back-office | `order-to-cash`, `prefab-quote` (price lookups) | cron, xlsx, docx, pdf |
| marketing | `content-marketing`, `brand-voice-sales` (voice only), `prefab-catalog` | browser, docx |

### Models

| Agent | Needs | Choice |
|-------|-------|--------|
| sales-support, site-engineer, qa-reviewer, supply-customs | Strong reasoning, Thai/English/Chinese, **image reading** (photos, drawings) | A capable vision model |
| ops-manager, back-office, marketing | Routine text work | A cheaper/faster model, upgraded if quality drops |

Pick the models on QwenPaw's Models page; compare cost per agent in Agent Statistics after the first 2 weeks.

## 4. How work flows

### A. Customer wants a unit on their land

| Step | Agent | Output |
|------|-------|--------|
| 1 | sales-support | Consent, measurements confirmed by the customer, photos, location → `site.json` |
| 2 | site-engineer | Layout on satellite/drone image + STEVE model + drawings |
| 3 | qa-reviewer | Pass / list of fixes |
| 4 | back-office | Prices and stock for the quote lines |
| 5 | sales-support | Quote (via `prefab-quote`); if above the threshold → ops-manager → owner approves on Telegram |
| 6 | sales-support | Sends layout, 3D link, drawing PDF and quote to the customer |

### B. Customer pays a deposit

| Step | Agent | Output |
|------|-------|--------|
| 1 | back-office | Matches the payment slip to the order; **owner confirms** the money arrived (until bank matching is automated) |
| 2 | back-office | Reserves a unit serial in stock; drafts the deposit receipt/tax invoice for the accountant |
| 3 | supply-customs | Releases that unit from bonded storage (0% duty + VAT paid) |
| 4 | ops-manager | Books delivery: crane-truck hire, install crew, electrician |
| 5 | sales-support | Confirms the date with the customer; sends the site checklist |

### C. Ordering a container

| Step | Agent | Output |
|------|-------|--------|
| 1 | supply-customs | Checks `form-e-duty-gate` = PASS for every product. If not, **stop** |
| 2 | supply-customs | Drafts the PO in Chinese + English; owner approves and sends |
| 3 | supply-customs | Weekly production chaser; pre-shipment document check (Form E matches invoice/packing list/B-L) |
| 4 | back-office | Adds units to stock as "in transit" |

## 5. Channel gap: LINE and WhatsApp

LINE and WhatsApp aren't in QwenPaw's built-in channel list, and they're our two
most important customer channels.

| Option | How | Status |
|--------|-----|--------|
| **A. Bridge via MQTT** (recommended first) | A small gateway receives LINE Messaging API / WhatsApp Cloud API webhooks and publishes to an MQTT topic; QwenPaw's built-in MQTT channel replies on a reply topic; the gateway sends the reply back through the official API | Test with one LINE test account first |
| B. Custom channel | QwenPaw "Custom" channels tab | Check QwenPaw's channel/plugin docs |
| C. Twilio | Twilio sells a WhatsApp API; whether QwenPaw's Twilio channel supports WhatsApp is unknown | Check the channel's settings |

Supplier: use **WeCom** (official) rather than a personal WeChat login, to avoid account bans.

## 6. Cron jobs

| Job | Agent | Schedule (suggested) |
|-----|-------|----------------------|
| Morning brief to owner (approvals waiting, new leads, stuck jobs) | ops-manager | Daily 08:00 |
| Follow up quotes with no reply after 3 days | sales-support | Daily 10:00 |
| After-sales check-ins (day 7 / 30 / 180) | sales-support | Daily 11:00 |
| Production + shipment chaser (draft) | supply-customs | Weekdays 09:00 China time |
| 0% duty gate status until PASS | supply-customs | Daily |
| KPI report (doc 09 §7) | back-office | Monday 08:00 |
| Content calendar for the week (drafts for approval) | marketing | Friday 14:00 |
| Competitor price check | marketing | Weekly |

QwenPaw rule: always pass `--agent-id` to cron commands.

## 7. Approval limits

| Action | Who can do it |
|--------|---------------|
| Answer questions, collect site info, send standard brochures | sales-support alone |
| Send a quote below THB [threshold] with standard terms | sales-support after qa-reviewer pass |
| Quote above the threshold, any discount, custom item | Owner (via ops-manager) |
| Confirm a payment was received | Owner |
| Send a PO, pay the supplier, change specs | Owner |
| Publish content or ads, change ad budget | Owner |
| Issue a final tax invoice | Accountant |
| Refunds, warranty claims, complaints with legal threats | Owner |

## 8. Setup checklist

| # | Step |
|---|------|
| 1 | Create the 7 agents with the IDs above (Agent Management) |
| 2 | Paste each agent's instructions from [`qwenpaw/agents/`](../qwenpaw/agents/) into its persona/system settings |
| 3 | Run `tools/package_skills.sh` and upload each skill zip to the agents in the §3 table |
| 4 | Set each agent's tools per the §3 table (turn the rest off) |
| 5 | Add STEVE as an MCP server for site-engineer and qa-reviewer |
| 6 | Connect Telegram to ops-manager (owner only), WeCom to supply-customs |
| 7 | Build and test the LINE/WhatsApp bridge, then connect it to sales-support |
| 8 | Create the cron jobs in §6 |
| 9 | Test with fake customers and a dummy site before going live |
