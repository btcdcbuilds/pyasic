---
name: budget_guard
description: "Enforce daily AI spend and outreach limits before assigning work."
---

# budget_guard

- Sum `agent_runs.cost_usd` for today; if >= `daily_ai_budget_usd`, pause all teams.
- Count outbound `outreach_messages` sent today; never exceed `daily_outreach_limit`.
- Report both numbers to the owner dashboard summary.
