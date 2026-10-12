# Thai SME website platform

Autonomous agent teams that find small restaurants and resorts in Thailand without a
website or booking system, build them a site with booking, LINE/WhatsApp contact and
PromptPay payments, and offer it for about US$99.

This folder is self-contained and will move to its own repository.

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, QwenPaw + Hermes integration, teams, data flow, dashboard |
| [docs/COSTS.md](docs/COSTS.md) | Sourced prices, conversion benchmarks, unit economics, proposed pricing |
| [docs/SETUP.md](docs/SETUP.md) | Accounts and keys needed, install steps |

| Path | Contents |
|---|---|
| `agents/team.yaml` | Agent roster: team, model, skills |
| `skills/` | QwenPaw skills (SKILL.md) |
| `db/migrations/` | Supabase / Postgres schema |
| `research/` | Places API discovery, cost model |
| `scripts/bootstrap_qwenpaw.sh` | Installs QwenPaw and creates the agents |

Pilot regions: Bangkok, Koh Samui, Nakhon Si Thammarat.

```bash
pip install requests pyyaml pytest
python -m pytest -q tests
python -m research.cost_model
```
