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
| [docs/INDUSTRIES.md](docs/INDUSTRIES.md) | The 5 target industries, sample sites, research and legal notes |
| [docs/HOSTING.md](docs/HOSTING.md) | VPS hosting, HTTPS, domain model and deploy steps |
| [docs/TESTING.md](docs/TESTING.md) | How to run the sample sites and the manual test checklist |
| [docs/PRICING.md](docs/PRICING.md) | Automatic room pricing: rules, default seasons, Thai law, add-on price |
| [docs/PHOTOS_AND_ROOMS.md](docs/PHOTOS_AND_ROOMS.md) | Using Google Maps photos and room types in the pitch, legally |

| Path | Contents |
|---|---|
| `agents/team.yaml` | Agent roster: team, model, skills |
| `skills/` | QwenPaw skills (SKILL.md) |
| `db/migrations/` | Supabase / Postgres schema |
| `research/` | Places API discovery, cost model |
| `sites/content/` | One YAML per customer site (5 fictional samples) |
| `sites/templates/`, `sites/static/` | Shared bilingual site template, CSS, JS |
| `webapp/` | Multi-site server, booking engine, SQLite store |
| `deploy/` | Dockerfile, docker-compose, Caddyfile for the VPS |
| `scripts/bootstrap_qwenpaw.sh` | Installs QwenPaw and creates the agents |

Pilot regions: Bangkok, Koh Samui, Nakhon Si Thammarat.

```bash
pip install -r requirements.txt
python -m pytest -q tests
ADMIN_KEY=demo uvicorn webapp.app:app --port 8000   # http://localhost:8000
python -m research.cost_model
```
