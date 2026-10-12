# Setup

## Accounts and keys you need

| Account | Used for | Notes |
|---|---|---|
| Anthropic Claude Console | `ANTHROPIC_API_KEY` for all agents | Must be an API key, not your Claude.ai login |
| Google Cloud (Maps Platform) | `GOOGLE_MAPS_API_KEY`, Places API (New) enabled | Set a billing cap; pilot fits the free tier |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Free plan for build; Pro ($25/mo) at launch |
| Cloudflare or Vercel | Hosting customer sites | Vercel Hobby is non-commercial |
| Opn Payments or Stripe Thailand | PromptPay + cards | Needs Thai business registration |
| LINE Official Account + Messaging API | Customer and owner chat | Needs a QwenPaw channel plugin (we build it) |
| WhatsApp Business Platform (Meta) | Customer chat | Business-initiated messages need opt-in + templates |

Put keys in `thai-sme-platform/.env` (git-ignored), never in code.

## Install

```bash
cd thai-sme-platform
./scripts/bootstrap_qwenpaw.sh      # installs QwenPaw 2.2.1, creates agents from agents/team.yaml
```

Then apply `db/migrations/001_init.sql` to the Supabase project and run
`qwenpaw app` (console at http://127.0.0.1:8088).

## Optional: Hermes Agent sidecar

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes plugins install agentscope-ai/ReMe/integrations/hermes_agent
hermes memory setup
```

See docs/ARCHITECTURE.md → "How Hermes fits" for the untested integration options.
