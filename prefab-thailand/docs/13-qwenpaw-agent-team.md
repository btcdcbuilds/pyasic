# 13 — Running the Business on QwenPaw

The owner already runs **QwenPaw v1.1.6** with 20 agents, built-in channels,
skills, tools, MCP, cron jobs and agent-to-agent messaging (screenshots, 2026-10-11).
This doc maps the business plan (doc 06) onto that setup.

## 1. What QwenPaw already gives us (from the owner's screenshots)

| Capability | Seen in QwenPaw | Use in this business |
|-----------|-----------------|----------------------|
| Channels (built-in) | Console, Telegram (enabled, bot set up), DingTalk, Feishu, Discord, QQ, Matrix, SIP, XiaoYi, Mattermost, MQTT, Twilio, WeCom, WeChat, OneBot + a "Custom" tab | Telegram = owner approvals/alerts; WeCom/WeChat = supplier; Console = staff |
| Skills | `SKILL.md` folders (frontmatter `name`, `description`, `metadata.qwenpaw`), Skill Pool, upload via zip, Import Hub | Our business skills live in [`qwenpaw/skills/`](../qwenpaw/skills/) |
| Tools | shell, read/write/edit file, grep/glob, browser_use, desktop_screenshot, view_image, view_video, send_file_to_user, … | view_image reads customer photos; browser_use for research |
| MCP | MCP client page | Connect **STEVE** (CAD) as an MCP server for the engineering agents |
| Multi-agent | `chat_with_agent`, A2A skill (e.g. `a2a_friday`) | Agents hand work to each other |
| Cron / Heartbeat | Scheduled jobs + check-ins | Follow-ups, daily reports, production chasers |
| Agent Statistics / Token Usage | Per-agent tokens and calls | Cost control per agent |

## 2. Channel gaps: LINE and WhatsApp

**LINE and WhatsApp are not in the built-in list** shown in the screenshot, and
they're the two most important customer channels in this plan.

| Option | How | Status |
|--------|-----|--------|
| A. Custom channel | QwenPaw's "Custom" channels tab: write a LINE Messaging API channel and a WhatsApp Cloud API channel | Check QwenPaw's channel/plugin docs for the custom-channel interface (couldn't load the docs site from here) |
| B. Bridge via MQTT | A small gateway service receives LINE/WhatsApp webhooks and publishes to an MQTT topic; QwenPaw's built-in MQTT channel answers on a reply topic; the gateway sends the reply back through the official API | Works with what's already installed. **Test with one LINE test account first** |
| C. Twilio | Twilio sells a WhatsApp messaging API. Whether QwenPaw's Twilio channel supports WhatsApp (not just SMS/voice) is **unknown** | Check the Twilio channel's settings |

Recommendation: **B first** (fastest, uses the built-in MQTT channel), then move
to A if QwenPaw's custom-channel interface is straightforward.

**WeChat warning:** check how QwenPaw's WeChat channel connects. If it logs in as
a personal WeChat account through an unofficial protocol, the account can be
banned, and that would cut us off from the supplier. Prefer **WeCom** (the official
business version, which can message normal WeChat users) for supplier chats.

## 3. Agent roster mapped to QwenPaw agents

Existing agent names come from the screenshots. Their *current* roles are
assumed from the names: confirm or reassign.

| Business role (doc 06) | QwenPaw agent | Channels | Skills to load |
|------------------------|---------------|----------|----------------|
| Operations lead / approvals router | **Friday** (CEO/Operations, via `a2a_friday`) | Telegram (owner), Console | form-e-duty-gate, approvals |
| Engineering lead | **CTO Fred** | Console, A2A | prefab-cad-model, prefab-site-layout (reviews) |
| Sales agent (brand character) | **Sales Rep Steve** | LINE + WhatsApp (via bridge), Messenger | prefab-quote, prefab-site-intake |
| CRM / price list / stock | **Dex Database Agent** | Internal | price-list read/write (human-approved changes) |
| Research (competitors, tenders, projects) | **Web Scraper Digger** | Internal | browser_use (research only) |
| Visualiser renders | **Ian Image Agent** | Internal | prefab-site-layout (render step) |
| Elevation / multi-view renders | **Image Left Position Larry**, **Right Position Roger**, **Back Position Barry** | Internal | Front/left/right/back views of a configured unit (if that matches their current job) |
| KPI reports | **Rick Kis Reports** | Telegram (owner) | Weekly KPIs from doc 09 §7 |
| Quality check of quotes, drawings, layouts before they go out | **QA Agent** | Internal | Checks against the rules in each skill |
| After-sales support | **Terry Tech** | LINE + WhatsApp | support manuals, ticketing |
| **New:** Site layout engineer | *create* "Layla Layout" | Internal | prefab-site-intake, prefab-site-layout |
| **New:** CAD engineer | *create* "Cad Carl" | Internal + STEVE MCP | prefab-cad-model |
| **New:** Supplier liaison | *create* "Lin Supplier" | WeCom/WeChat (drafts only) | supplier-liaison |
| **New:** Customs & compliance desk | *create* "Customs Kai" | Internal | form-e-duty-gate |
| Spare | Jen, Dazza, Default, others | — | Assign later |

## 4. The engineering pipeline (site photo → layout → CAD → quote)

```
Customer (LINE/WhatsApp)                Sales Rep Steve
  sends: measurement photos,     ──►    collects inputs (prefab-site-intake)
  sketch, location pin,                        │ A2A
  optional drone photo                         ▼
                                        Layla Layout ── site.json + layout PNG on
                                               │        satellite or drone image
                                               ▼
                                        Cad Carl ── STEVE design: unit(s) + screw
                                               │     piles + site slab outline;
                                               │     drawings PDF, GLB 3D model
                                               ▼
                                        QA Agent ── checks scale, clearances,
                                               │     labels, disclaimers
                                               ▼
                                        Sales Rep Steve ── sends layout + 3D link
                                               + quote (prefab-quote) to customer
                                               │
                              Friday ◄─────────┘ approval if above threshold
```

Target turnaround: decide after testing (each step's time is in Agent Statistics).

## 5. Cron jobs to set up

| Job | Agent | Schedule (suggested) |
|-----|-------|----------------------|
| Follow up quotes with no reply | Sales Rep Steve | Daily, 10:00 |
| After-sales check-ins (day 7 / 30 / 180) | Terry Tech | Daily |
| Production + shipment status chase | Lin Supplier (draft) → owner sends | Weekdays, 09:00 China time |
| KPI report | Rick Kis Reports | Monday 08:00 |
| Competitor price check | Web Scraper Digger | Weekly |
| Form E / duty status until resolved | Customs Kai | Daily until the gate passes |

Remember QwenPaw's cron rule: always pass `--agent-id` explicitly.

## 6. Installing our skills

| Step | Action |
|------|--------|
| 1 | Zip each folder in `qwenpaw/skills/` (one zip per skill) |
| 2 | QwenPaw → Workspace → Skills → **Upload via Zip** for the agent that needs it (or add to the Skill Pool and **Load from Skill Pool**) |
| 3 | Fill in `references/catalog.md` with the real unit dimensions from the supplier drawings |
| 4 | MCP page → add STEVE's MCP server (URL and token from your STEVE account) to Cad Carl |
| 5 | Run a test with a dummy site before going live |
