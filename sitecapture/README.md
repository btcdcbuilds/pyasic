# SiteCapture

360° site-walk capture for construction progress: upload walks from a 360
camera, place them on the PDF drawing, recall what any spot looked like on any
date, and generate AI progress reports, time-lapses and 3D models.

> This folder is self-contained and separate from the `pyasic` library in the
> rest of the repo. It has its own `pyproject.toml` and tests.

## Status

| Feature | State | Notes |
|---|---|---|
| Email + password logins, admin-managed users | Working, tested | Passwords hashed with scrypt; sessions expire after 14 days; failed logins throttled; cross-site requests refused |
| Projects, PDF drawing upload (one drawing per page) | Working, tested | PyMuPDF renders pages at 150 dpi (capped at 12,000 px) |
| 360 upload (Insta360 exported MP4/JPG) | Working, tested | Uploaded in 8 MB chunks with automatic retry; resumes after a dropped connection or page reload. Rejects non-360 and raw `.insv`/`.insp` files. 20 GB per file by default |
| Frame extraction from video | Working, tested | 1 frame/s by default (`SITECAPTURE_FRAME_INTERVAL_S`) |
| Placing frames on the plan from control points | Working, tested | Tap 2+ frames on the plan; the rest are interpolated |
| Following the real path from structure-from-motion | Alignment code tested; OpenSfM run **not tested here** | OpenSfM isn't installed in this environment. Needs a real walk to validate |
| Auto GPU rental after upload (Vast.ai, Lambda) | Adapters tested against mocked APIs only | See "GPU providers" below; check field names against live docs before use |
| GPU always released (on success, failure, 6 h timeout) | Tested with a fake provider | The server checks for stuck jobs every 10 minutes |
| 3D model per capture (dense point cloud `.ply`) | Wired up, not run for real | Comes from OpenSfM `compute_depthmaps` |
| Recall a spot across dates | Working, tested | Click the plan in "Recall a spot" mode |
| Time-lapse video of a spot | Working, tested | ffmpeg `v360` reprojects to a normal camera view in the direction you're facing |
| AI progress report (Claude Opus 5.5) | Request building tested with a mocked client | Needs `ANTHROPIC_API_KEY`; not run against the live API here |
| Report PDF download | Working, tested | A4 PDF with tables |
| IFC import (storeys, element counts) | Working, tested | `pip install .[bim]` for ifcopenshell |
| Autodesk ACC/Revit, Procore | **Interface only, not implemented** | Needs your OAuth app credentials; see `sitecapture/bim/connectors.py` |
| Blender add-on (latest + historical models) | Written, **not tested in Blender** | `blender_addon/sitecapture_blender` |
| VPS deployment (Docker Compose: app + Postgres + Caddy HTTPS) | Files written; **image build not run here** | The sandbox couldn't download Debian packages. The test suite does pass against PostgreSQL 16 |
| Per-project access (only some users see a project) | Not implemented | Every user sees every project; only admins manage users |
| Cloud storage (S3/R2) | Not implemented | Files are kept on the VPS disk (Docker volume) |
| Database migrations | Not implemented | New tables are created automatically; changes to existing tables will need a migration tool (Alembic) later |

## Quick start

```bash
cd sitecapture
pip install -e ".[bim,dev]"          # needs ffmpeg/ffprobe on PATH
SITECAPTURE_ADMIN_EMAIL=you@example.com SITECAPTURE_ADMIN_PASSWORD='10+ characters' \
  uvicorn sitecapture.api.app:app --port 8000   # creates the first admin
# open http://localhost:8000
python -m pytest                     # 34 tests
# against Postgres:
SITECAPTURE_TEST_DATABASE_URL=postgresql+psycopg://user@host/db python -m pytest
```

Workflow in the UI:

| Step | Action |
|---|---|
| 1 | **New project**, then upload the PDF drawing |
| 2 | Export the walk from Insta360 Studio as a 360 MP4 and upload it under **Upload site walk** |
| 3 | Pick the capture, switch to **Place frames**, slide to the first frame and click where it was taken on the plan; repeat for the last frame (and corners for a better fit), then **Save control points** |
| 4 | **View walk**: click any dot to open that 360 view |
| 5 | **Recall a spot**: click the plan to list every date with a photo there; **Make time-lapse** renders the view you're facing |
| 6 | **AI report** on a capture compares it with the previous capture of the same drawing |

## Deploying to a VPS

Vercel isn't a good fit: its functions run for at most 900 seconds per
request and have no permanent disk, while SiteCapture stores multi-GB videos
and runs ffmpeg for minutes at a time. A VPS runs everything in one place.

| Requirement | Suggested |
|---|---|
| OS | Ubuntu 22.04 or 24.04 |
| CPU / RAM | 4 vCPU / 8 GB (frame extraction and time-lapses use ffmpeg on the server) |
| Disk | 200 GB+; a 10-minute 5.7K walk can be several GB, plus extracted frames |
| Network | Ports 80 and 443 open; a domain (A record) pointing at the server |

```bash
git clone -b ccr-cb49ce77-ftao8c https://github.com/btcdcbuilds/pyasic.git
cd pyasic/sitecapture/deploy
sudo ./install.sh        # installs Docker if needed, asks for domain + admin login, starts everything
```

| Task | Command (from `sitecapture/deploy`) |
|---|---|
| Add API keys / GPU settings | `sudo nano .env`, then `sudo docker compose --env-file .env up -d` |
| Update to new code | `git pull && sudo ./install.sh` |
| Logs | `sudo docker compose logs -f app` |
| Back up database + files | `sudo ./backup.sh`, then copy `backups/` to another machine |

The first login is the admin email/password you entered during install.
Add other users from **Users** in the top bar.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SITECAPTURE_DATA_DIR` | `./data` | Uploads, frames, models, SQLite DB |
| `SITECAPTURE_ADMIN_EMAIL`, `SITECAPTURE_ADMIN_PASSWORD` | – | First admin, created only when there are no users |
| `SITECAPTURE_MAX_UPLOAD_GB` | `20` | Largest single uploaded file |
| `SITECAPTURE_REAPER_INTERVAL_MIN` | `10` | How often to check for stuck GPU jobs (0 = off) |
| `SITECAPTURE_DATABASE_URL` | SQLite in data dir | Any SQLAlchemy URL (e.g. Postgres) |
| `SITECAPTURE_PUBLIC_URL` | `http://localhost:8000` | URL rented GPUs use to call back; must be reachable from the internet |
| `SITECAPTURE_GPU_PROVIDER` | `local` | `local`, `vastai` or `lambda` |
| `SITECAPTURE_WORKER_IMAGE` | placeholder | Your built worker image (see `docker/worker.Dockerfile`) |
| `SITECAPTURE_MAX_GPU_USD_PER_HOUR` | `1.50` | Never rent above this price |
| `VASTAI_API_KEY`, `VASTAI_GPU_NAME` | –, `RTX_4090` | Vast.ai |
| `LAMBDA_API_KEY`, `LAMBDA_INSTANCE_TYPE`, `LAMBDA_REGION`, `LAMBDA_SSH_KEY_NAME` | –, `gpu_1x_a10`, `us-east-1`, – | Lambda |
| `ANTHROPIC_API_KEY` | – | AI reports |
| `SITECAPTURE_AI_MODEL` | `claude-opus-5-5` | Model for reports |
| `OPENSFM_BIN` | `opensfm` | OpenSfM CLI for `local` reconstruction |

## How processing works

```
upload ──► check 2:1 equirect ──► extract frames (API server, CPU)
                                     │
                                     ▼
                     rent GPU (Vast.ai / Lambda, under price cap)
                                     │  worker image runs sitecapture.worker.run
                                     ▼
          worker downloads frames ──► OpenSfM (spherical camera) ──► camera path + .ply
                                     │
                                     ▼
       API fits path to control points (2D similarity) ──► frames placed ──► GPU terminated
```

The API terminates the instance as soon as the worker reports success or
failure. Jobs still running after 6 hours are failed and their instance
terminated by a check the server runs every 10 minutes.

## GPU providers

The paths below come from each provider's official API docs. I couldn't open
the full reference pages from the build environment, so treat the request
fields marked "verify" as unconfirmed until checked against the live docs.

| Provider | Calls used | Verify |
|---|---|---|
| Vast.ai (`console.vast.ai/api/v0`) | `POST /bundles/` search, `PUT /asks/{id}/` rent, `GET`/`DELETE /instances/{id}/` | Search filter keys; create body (`image`, `disk`, `env`, `runtype: args`, `args`); `new_contract` in response |
| Lambda (`cloud.lambdalabs.com/api/v1`) | `GET /instance-types`, `POST /instance-operations/launch`, `GET /instances/{id}`, `POST /instance-operations/terminate` | `/instance-types` response shape; whether `user_data` (cloud-init) is accepted. Lambda rents VMs, so the worker runs via `docker run` in cloud-init |

Sources: [Vast.ai REST API](https://www.vast.ai/developers/api),
[Vast.ai: creating instances with the API](https://docs.vast.ai/api-reference/creating-instances-with-api),
[Lambda: creating and managing instances](https://docs.lambda.ai/public-cloud/on-demand/creating-managing-instances/),
[Lambda: terminate via API](https://beta-docs.lambdalabs.com/cloud/terminate-instance-api).

## Limits

| Item | Detail |
|---|---|
| Stitching | Insta360 cameras stitch in Insta360 Studio; SiteCapture doesn't stitch dual-fisheye itself |
| Placement accuracy | Interpolation assumes straight runs between control points. SfM follows the real path, but plain walls, glass and low light reduce registration (shown as "SfM %") |
| Multi-storey walks | A walk is placed on one drawing; split walks per level |
| AI reports | Claude describes what's visible in matched photos; it doesn't measure quantities. Images are downscaled to 2048 px wide |
| Time-lapse | Uses the nearest frame within 3% of the drawing width at each date, so framing shifts slightly between dates |

## Layout

| Path | Contents |
|---|---|
| `sitecapture/api/app.py` | FastAPI routes and worker callbacks |
| `sitecapture/pipeline/` | PDF rendering, frame extraction, alignment, OpenSfM, timeline/time-lapse |
| `sitecapture/gpu/` | Provider interface, Vast.ai, Lambda, orchestrator |
| `sitecapture/ai/reports.py` | Claude progress reports |
| `sitecapture/bim/` | IFC import; ACC/Procore interface |
| `sitecapture/worker/run.py` | Runs on the rented GPU |
| `sitecapture/static/` | Web UI (Pannellum 2.5.6 360 viewer from jsDelivr; falls back to a flat image offline) |
| `blender_addon/` | Blender add-on |
| `docker/worker.Dockerfile` | GPU worker image (OpenSfM built from source; pin `OPENSFM_REF`) |
| `docker/app.Dockerfile`, `deploy/` | Server image, Docker Compose, Caddy, install and backup scripts |
| `sitecapture/auth.py` | Password hashing, sessions, login throttling |
