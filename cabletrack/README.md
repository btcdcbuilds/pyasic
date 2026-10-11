# CableTrack

Installation tracking app for cabling contracts. It works for any cabling job: stages, cable types, points, pathways, crews and ITPs are all configurable. It was built first for a data centre bulk-fibre contract.

The folder is self-contained and has no dependency on the rest of this repository. It can be copied into its own repo as-is.

## What it does

| Area | Screen | Features |
|---|---|---|
| Track | **Dashboard** | Live % per stage, metres roughed in, fibre-km, ribbon splices, hours, metres per man-hour, daily chart by crew, crew and cable-type output, QA tiles (tested, labelled, hold points, issues) |
| | **Log work** | Per crew, stage and date. Partial metres for long pulls. ITP hold-point warning or block. Records who logged each entry |
| | **Hours** | Daily crew timesheets, weekly hours per worker |
| | **Site diary** | Weather, notes, delays, safety, visitors, photos |
| Install | **Cable schedule** | A/B points and ports, CSV import/export, bulk add. Route editor with **Auto-route** (shortest path, design length = route + drops + slack). Jacket marks for measured length, labels per end, drum, tests, photos |
| | **Points & areas** | Any endpoint (rack, cabinet, frame, closure, outlet, pit, manhole, pole, building entry, pull box) in a site / building / floor / room tree. TIA-606 style codes, slack per point |
| | **Pathways** | Tray, basket, ladder, raceway, trunking, conduit, duct, innerduct, riser, J-hooks, catenary. Drawn on a plan or entered as "from point A to point B, length". Fill vs limit (NEC Ch.9 by cable count for conduit), cross-section, spare capacity |
| | **Floor layout** | One plan per area. Upload a floor plan image and set its scale with two points. Place rows of racks and any point type, draw pathways to scale, add drops, highlight a cable's route |
| | **Rack elevations** | Devices by U, drop entries, side view of the drop with bend radius, capacity |
| Quality | **ITP sign-off** | Editable ITP templates (default cabling ITP with cited criteria). Inspection lots linked to cables and pathways. Per-item contractor and client sign-off with on-screen signatures. Hold points release work stages. Printable A4 sign-off sheet, CSV |
| | **Test results** | OLTS, OTDR, polarity, end-face, copper certification, splice loss, reel tests. Auto pass/fail against each link's loss budget. Import from tester CSV. Tester files attached |
| | **Issues / punch** | Defects, punch list, NCRs, RFIs, safety, delays, with photos and close-out |
| | **Reports & exports** | Daily or period report (crews, labour, status, diary, QA) to print or PDF. CSV exports: label schedule, ITP register, issues, test summary, hours, progress, full JSON |
| Setup | **Library** | About 30 cable products and 14 rack models with source links, a drum register, and a standards reference |
| | **Crews & people** | Crews, workers, and people who sign off |
| | **Settings** | Your name, project, loss-budget allowances, slack, hold-point mode, job templates, stages, **Cloud & team**, backup |

## Data, sync and multi-user

- **Offline first.** Data is stored on the device in IndexedDB. Photos are stored there too, compressed on the device.
- **Cloud (optional).** Sign in under Settings > Cloud & team, create a cloud project, and invite people by email with a role:

  | Role | Access |
  |---|---|
  | Admin | Everything, plus team management |
  | Supervisor | Read and write |
  | Crew lead | Read and write |
  | Viewer | Read only |

  Changes sync to Supabase (Postgres + storage + realtime) and appear live on other devices. Edits made offline sync when the device is back online. Each record is last-write-wins.
- **Backend setup (once).** Run [`supabase/001_init.sql`](supabase/001_init.sql) in the Supabase SQL editor. All objects are prefixed `ct_`, so they can sit inside an existing Supabase project. The app defaults to the POW_Construction project; change it under Settings > Cloud server settings.

  Note: crew leads can currently edit any record. Narrower per-role editing is enforced only in the UI.

## Where the reference data comes from

- Every number and rule in the library, ITP criteria and standards tab came from web-search extracts of the linked source, dated 2026-10-11. The standards themselves are paywalled and were not read, so rules are quoted secondhand and each one names its source.
- Cable specs are marked **check** until someone confirms them against the datasheet.
- ITP inspection point codes (H/W/R) in the default template are **suggestions**, not from any standard. Agree them with the client.
- Loss budget defaults are the TIA-568.3 maxima as quoted by FOA: 0.75 dB per mated pair, 0.3 dB per splice, 1.0 / 0.5 dB/km SM inside / outside plant, 3.5 / 1.5 dB/km MM. Change them to your project's acceptance limits in Settings.

## Run it

Requires Node 20+.

```bash
cd cabletrack
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (progress, routing, loss budget, conduit fill, ITP holds, migration)
npm run build      # static site in dist/
```

`dist/` is a static site using relative paths. It can be hosted anywhere and installed to a phone home screen (PWA, works offline).

## Tech

React 19 + TypeScript + Vite, Zustand persisted to IndexedDB, Supabase JS for sync, plain CSS, SVG for drawings.

| File | Purpose |
|---|---|
| `src/types.ts` | Data model |
| `src/store.ts` | Store, change tracking, v1 migration |
| `src/lib/calc.ts` | Progress, crew output, pathway fill |
| `src/lib/route.ts` | Routing graph, auto-route, design length |
| `src/lib/budget.ts` | Fibre loss budget |
| `src/lib/itp.ts` | Hold points, lot progress |
| `src/lib/sync.ts` | Supabase auth, sync, realtime, file upload |
| `src/lib/files.ts` | Photo/file storage (IndexedDB) |
| `src/data/library.ts`, `src/data/norms.ts` | Reference data and default ITP with sources |
| `src/views/*` | One file per screen |
