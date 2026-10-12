# Architecture

## Components

| Layer | Choice | Verified facts (2026-10-12) |
|---|---|---|
| Agent runtime | **QwenPaw 2.2.1** (`pip install qwenpaw`), Apache-2.0, formerly CoPaw | Built-in `anthropic` provider; custom model ids via Console "Add Model"; one workspace per agent; agents talk via built-in `multi_agent_collaboration` skill |
| Models | Claude via **Anthropic API key** (Claude Console) | Subscription logins may not power third-party/Agent SDK products (Anthropic docs, Feb 2026) |
| Long-term memory | **ReMe** (`remelight` backend, runs inside QwenPaw, no extra service) | Configured per agent in `agent.json` → `running.reme_light_memory_config` |
| Hermes | **Hermes Agent** (Nous Research) as an optional sidecar — see below | No QwenPaw↔Hermes plugin exists; ReMe ships an official Hermes memory plugin |
| Browser | QwenPaw built-in `browser` tool (own Chromium); `browser-use` 0.13.11 also supports Anthropic | — |
| Database / auth / storage | Supabase (Postgres) — `db/migrations/001_init.sql` | — |
| Sites | Static sites on Cloudflare Pages/Workers or Vercel Pro | Vercel Hobby is non-commercial |
| Payments | Opn Payments (Omise) or Stripe Thailand, PromptPay first | 1.65% + VAT |
| Messaging | LINE Messaging API and WhatsApp Business Platform, via our own webhook service | **QwenPaw has no LINE or WhatsApp channel** — we add them as a QwenPaw channel plugin (`plugin.json` type `channel`) |

## How Hermes fits ("the Hermes plug-in")

There is no plugin that joins QwenPaw and Hermes directly. The working options, in order:

| Option | What it gives | Status |
|---|---|---|
| 1. ReMe Hermes memory plugin + standalone ReMe service | Hermes reads/writes the same ReMe memory store over HTTP | Official plugin (`hermes plugins install agentscope-ai/ReMe/integrations/hermes_agent`). Sharing one workspace with QwenPaw's embedded ReMe is **untested** |
| 2. Hermes as an ACP runner inside QwenPaw | QwenPaw agents delegate tasks to Hermes via `delegate_external_agent` (runner: `hermes acp`) | Both sides support ACP; this pairing is **untested** |
| 3. `hermes mcp serve` as an MCP server for QwenPaw | QwenPaw agents use Hermes' messaging tools | Documented on each side; pairing **untested** |
| 4. Shared skills folder | Same SKILL.md files used by both (`skill_paths` / `skills.external_dirs`) | Both use SKILL.md front matter; **untested** |

Recommendation: run Phase 1 on QwenPaw alone, then spike options 1 and 2 in a sandbox
and keep whichever works. Skills in `skills/` use plain front matter so option 4 stays open.

## Teams (agents/team.yaml)

| Team | Agents | Model | Human gate |
|---|---|---|---|
| Control | chief | Opus 5.5 | Owner sets pause / limits / budget |
| Research | discovery, qualifier | Haiku 5.5 | None |
| Build | lead (QA), preview, site, changes | Opus / Haiku / Sonnet | QA gate before publish |
| Outreach | writer, closer | Sonnet 5.5 | Pitch approval while `require_pitch_approval` = true |

## Data flow

```
Places API (IDs) -> research-discovery -> businesses(found)
  -> research-qualifier -> businesses(qualified)
  -> build-preview -> sites(preview)               [template + public basics only]
  -> outreach-writer -> outreach_messages(draft) -> OWNER APPROVES -> sent
  -> outreach-closer -> payment -> owner uploads content (portal)
  -> build-site -> build-lead QA -> sites(live)
  -> build-changes <- change_requests from owner portal
```

## Owner dashboard (your interface)

| Screen | Reads | Actions |
|---|---|---|
| Pipeline | `businesses` by stage and region | Filter by region / kind |
| Approval queue | `outreach_messages` where status = draft; `sites` awaiting QA | Approve / edit / reject |
| Agents | `agent_runs` (status, errors, cost today) | Pause all, per-agent pause |
| Customers | `businesses` won/live + `sites`, `bookings`, `change_requests` | Open site, message owner |
| Money | `payments`, `agent_runs.cost_usd`, fixed costs | — |
| Settings | `platform_settings` | Limits, budget, approval switch |

QwenPaw's own console (http://127.0.0.1:8088) stays available for inspecting and chatting
with individual agents. The business-owner portal (LINE login, upload menu/photos, edit
prices, see bookings) is a separate small web app on the same Supabase project.
