# CableTrack

Installation tracking app for structured cabling jobs (built first for a data centre bulk-fibre contract, but every stage, cable type, crew and rack is configurable so it works for any cabling job).

Self-contained: this folder has no dependency on the rest of the repository and can be copied into its own repo as-is.

## What it does

| Area | Features |
|---|---|
| **Dashboard** | Live % complete per stage, metres roughed in, fibre-km installed, ribbon splices, hours, metres per man-hour, daily chart by crew, output per crew and per cable type. Filter today / 7 days / to date. |
| **Log work** | Crew lead picks date, crew and stage, ticks cables and enters quantity. Partial metres are supported for long pulls (up to 300 m). Shows ribbon-splice and fibre-km equivalents. Undo per entry. |
| **Hours** | Daily timesheet per crew (one tap fills the default shift), workers borrowed from other crews, weekly hours grid per worker. |
| **Cable schedule** | Add, bulk-add a numbered range, or import a CSV cable schedule (template provided). Per-cable stage status, history, CSV export. |
| **Floor layout** | Interactive plan: place rows of racks (Vertiv, APC, Panduit, Rittal or custom sizes), draw baskets/trays to scale, add drops into racks, highlight any cable's route. Pathways turn amber or red as they fill. |
| **Rack elevations** | Front elevation with panels/enclosures by U, drop entry points, side view of the waterfall from basket to rack with the bend radius, and capacity (fibres, MPO connectors, ribbon splices vs ports). |
| **Trays & baskets** | Fill % from cable cross-section vs usable area, illustrative packed cross-section, what-if "how many more fit", cable weight per metre. Presets for Cablofil, OBO, B-Line, Wyr-Grid and FiberRunner. |
| **Cable library** | About 30 products from Corning, CommScope, Sumitomo, AFL, Prysmian, Panduit, Belden, Siemon, Nexans, Excel and Leviton: OD, bend radius, pull tension, weight, each with a source link. Install guide per cable type. Standards reference (TIA-569, TIA-568, NEC 392, EN 50174-2). |
| **Reports** | Daily or date-range report (crews, labour, work log, project status) to print or save as PDF; progress and hours CSV exports. |
| **Settings** | Project details, editable work stages (add your own), JSON backup and restore. |

### Default stages and how they are measured

| Stage | Unit | Target per cable |
|---|---|---|
| Roughed in | metres | cable length |
| Tied in | metres | cable length |
| Spliced | fibres | fibre count x ends (864F x 2 = 1728 fibres = 144 x 12F ribbon splices) |
| Terminated | connectors | ceil(fibres / fibres-per-connector) x ends (1728F MPO-16 = 108 x 2 = 216) |
| Tested | fibres | fibre count x ends |

Each cable type chooses which stages apply. For example, the 864F ribbon cable has no "Terminated" stage and the pre-terminated MPO-16 cables have no "Spliced" stage.

## Data accuracy

- The library spec values were collected on 2026-10-11 from search-engine extracts of the linked manufacturer pages, because direct page fetches were blocked in the build environment. Every entry is marked **check** until someone ticks "I have checked these values against the datasheet". Where a source didn't give a value, the field is blank and nothing is estimated.
- The three contract cable types (1728F / 864F / 64F) start with brand "TBC" and no specs. Once the manufacturer is confirmed, use **Copy specs from** in the cable type editor.
- Standards rules are quoted secondhand (the standards themselves are paywalled); each links to the page it was quoted from. Your project specification takes precedence.

## Where data is stored (read this)

The MVP stores everything **in the browser on the device you use** (localStorage). It works offline. However:

- Data is not shared between devices or people yet. Pick one device (e.g. the supervisor's laptop or tablet) as the master.
- **Download a backup every shift** (Settings > Download backup). Restore it on another device to move data.
- Clearing browser data deletes it.

Planned next step: a shared database (e.g. Supabase) so each crew lead logs from their own phone and the dashboard is live for everyone.

## Run it

Requires Node 20+.

```bash
cd cabletrack
npm install
npm run dev        # http://localhost:5173
npm test           # calculation unit tests
npm run build      # static site in dist/
```

`dist/` is a static site using relative paths, so you can host it anywhere (Vercel, Netlify, GitHub Pages, a local web server). Once loaded it can be added to a phone home screen and works offline.

## Tech

React 19 + TypeScript + Vite, Zustand (persisted state), plain CSS, SVG for drawings and charts. No backend.

| File | Purpose |
|---|---|
| `src/types.ts` | Data model |
| `src/lib/calc.ts` | Progress, crew output, pathway fill (unit-tested in `calc.test.ts`) |
| `src/data/library.ts` | Cable, rack, pathway and standards reference data with sources |
| `src/seed.ts` | Default stages and contract cable types |
| `src/views/*` | One file per screen |
