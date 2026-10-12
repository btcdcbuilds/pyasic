---
name: platform_db
description: Read and write the platform's Supabase/Postgres database (businesses, sites, outreach_messages, agent_runs, platform_settings).
---

# platform_db

- Always read `platform_settings` first. If `paused` is true, stop and report.
- Log every run to `agent_runs` with model, token counts and cost_usd.
- Never store Google Places fields other than `google_place_id` outside `google_cache`
  (which expires per Google Maps Platform terms).
- Requires env: SUPABASE_URL, SUPABASE_SERVICE_KEY.
