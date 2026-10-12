-- Core schema for the Thai SME website platform (Postgres / Supabase).
-- Business content (menus, photos, prices) comes from the owner, never from Google.
-- From Google Places we keep only place_id long-term (allowed by Places API policies);
-- name/rating/etc. are re-fetched when needed and expire per Google's caching rules.

create extension if not exists "pgcrypto";

create type pipeline_stage as enum (
  'found', 'qualified', 'sample_built', 'pitch_drafted', 'pitch_approved',
  'pitched', 'replied', 'won', 'live', 'lost', 'do_not_contact'
);

create type business_kind as enum ('restaurant', 'cafe', 'resort', 'hotel', 'spa', 'tour', 'other');

create table regions (
  id          text primary key,              -- e.g. 'bangkok', 'samui', 'nakhon_si_thammarat'
  name_en     text not null,
  name_th     text not null,
  active      boolean not null default true
);

insert into regions (id, name_en, name_th) values
  ('bangkok', 'Bangkok', 'กรุงเทพมหานคร'),
  ('samui', 'Koh Samui', 'เกาะสมุย'),
  ('nakhon_si_thammarat', 'Nakhon Si Thammarat', 'นครศรีธรรมราช');

create table businesses (
  id               uuid primary key default gen_random_uuid(),
  google_place_id  text unique,               -- the only Google field stored long-term
  region_id        text not null references regions(id),
  kind             business_kind not null default 'other',
  stage            pipeline_stage not null default 'found',
  priority_score   numeric(5,2),
  score_reasons    jsonb not null default '{}'::jsonb,
  has_website      boolean,
  on_ota           boolean,                   -- listed on booking.com / Agoda etc.
  line_oa_id       text,
  whatsapp_number  text,
  contact_email    text,
  contact_consent  boolean not null default false,   -- PDPA: true only after they opt in
  google_cache     jsonb,                     -- short-lived Places fields; purge via expires
  google_cache_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on businesses (region_id, stage);

-- Owner-supplied content: the actual source for each website.
create table business_content (
  business_id   uuid primary key references businesses(id) on delete cascade,
  display_name  jsonb not null default '{}'::jsonb,   -- {"th": "...", "en": "...", "zh": "..."}
  description   jsonb not null default '{}'::jsonb,
  menu          jsonb not null default '[]'::jsonb,   -- [{name:{th,en}, price_thb, photo}]
  rooms         jsonb not null default '[]'::jsonb,   -- resorts: [{name, rate_thb, capacity}]
  opening_hours jsonb not null default '{}'::jsonb,
  photos        jsonb not null default '[]'::jsonb,   -- storage paths, owner-uploaded
  updated_at    timestamptz not null default now()
);

create table sites (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  template      text not null,
  status        text not null default 'draft',        -- draft | preview | live | suspended
  preview_url   text,
  live_domain   text,
  qa_report     jsonb,
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create table availability (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references sites(id) on delete cascade,
  resource     text not null,                        -- 'table', room name, etc.
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  capacity     int not null default 1,
  price_thb    numeric(10,2)
);

create table bookings (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  availability_id uuid references availability(id),
  guest_name    text not null,
  guest_contact text not null,
  party_size    int,
  status        text not null default 'pending',     -- pending | confirmed | cancelled
  payment_ref   text,
  amount_thb    numeric(10,2),
  created_at    timestamptz not null default now()
);

create table outreach_messages (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  channel       text not null,                       -- email | phone | line | whatsapp | visit
  direction     text not null,                       -- outbound | inbound
  body          text not null,
  status        text not null default 'draft',       -- draft | approved | sent | failed
  approved_by   text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table change_requests (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  request_text  text not null,
  price_thb     numeric(10,2),
  status        text not null default 'open',        -- open | quoted | paid | done
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id),
  purpose       text not null,                       -- setup | monthly | change
  amount_thb    numeric(10,2) not null,
  provider      text not null,
  provider_ref  text,
  status        text not null default 'pending',
  created_at    timestamptz not null default now()
);

-- Every agent run is logged so the dashboard can show status and AI spend.
create table agent_runs (
  id             uuid primary key default gen_random_uuid(),
  agent          text not null,                      -- e.g. 'research.discovery'
  business_id    uuid references businesses(id),
  status         text not null,                      -- running | ok | error | needs_approval
  model          text,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  cost_usd       numeric(10,4) not null default 0,
  summary        text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index on agent_runs (agent, started_at desc);

-- Owner-facing controls for the dashboard.
create table platform_settings (
  key    text primary key,
  value  jsonb not null
);
insert into platform_settings (key, value) values
  ('paused', 'false'),
  ('daily_outreach_limit', '20'),
  ('daily_ai_budget_usd', '20'),
  ('require_pitch_approval', 'true');
