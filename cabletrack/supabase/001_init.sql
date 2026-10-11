-- CableTrack cloud backend (Supabase / Postgres).
-- All objects are prefixed ct_ so they can live inside an existing Supabase project
-- without touching anything else. Run once in the Supabase SQL editor.

create table public.ct_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ct_members (
  project_id uuid not null references public.ct_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','supervisor','crew_lead','viewer')),
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index ct_members_user_idx on public.ct_members(user_id);

create table public.ct_invites (
  project_id uuid not null references public.ct_projects(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','supervisor','crew_lead','viewer')),
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);

-- One generic row per app record (cables, progress, time, tests, ITP lots ...).
create table public.ct_records (
  project_id uuid not null references public.ct_projects(id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (project_id, collection, id)
);
create index ct_records_sync_idx on public.ct_records(project_id, updated_at);

-- Role lookup used by RLS (security definer avoids recursive policy checks).
create or replace function public.ct_role(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.ct_members where project_id = p and user_id = (select auth.uid())
$$;

-- Project creator becomes admin.
create or replace function public.ct_on_project_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ct_members(project_id, user_id, role, email)
  values (new.id, new.created_by, 'admin', (select email from auth.users where id = new.created_by));
  return new;
end $$;
create trigger ct_project_created after insert on public.ct_projects
  for each row execute function public.ct_on_project_created();

-- Server timestamps give a single ordering for sync.
create or replace function public.ct_touch_record() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := (select auth.uid());
  return new;
end $$;
create trigger ct_records_touch before insert or update on public.ct_records
  for each row execute function public.ct_touch_record();

-- Accept pending invites for the signed-in user's email.
create or replace function public.ct_accept_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; e text;
begin
  select lower(email) into e from auth.users where id = (select auth.uid());
  if e is null then return 0; end if;
  insert into public.ct_members(project_id, user_id, role, email)
    select i.project_id, (select auth.uid()), i.role, e from public.ct_invites i where lower(i.email) = e
  on conflict (project_id, user_id) do update set role = excluded.role;
  get diagnostics n = row_count;
  delete from public.ct_invites where lower(email) = e;
  return n;
end $$;

alter table public.ct_projects enable row level security;
alter table public.ct_members enable row level security;
alter table public.ct_invites enable row level security;
alter table public.ct_records enable row level security;

create policy ct_projects_select on public.ct_projects for select to authenticated
  using (public.ct_role(id) is not null or created_by = (select auth.uid()));
create policy ct_projects_insert on public.ct_projects for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy ct_projects_update on public.ct_projects for update to authenticated
  using (public.ct_role(id) = 'admin');
create policy ct_projects_delete on public.ct_projects for delete to authenticated
  using (public.ct_role(id) = 'admin');

create policy ct_members_select on public.ct_members for select to authenticated
  using (public.ct_role(project_id) is not null);
create policy ct_members_admin_write on public.ct_members for all to authenticated
  using (public.ct_role(project_id) = 'admin') with check (public.ct_role(project_id) = 'admin');

create policy ct_invites_admin on public.ct_invites for all to authenticated
  using (public.ct_role(project_id) = 'admin') with check (public.ct_role(project_id) = 'admin');

create policy ct_records_select on public.ct_records for select to authenticated
  using (public.ct_role(project_id) is not null);
create policy ct_records_insert on public.ct_records for insert to authenticated
  with check (public.ct_role(project_id) in ('admin','supervisor','crew_lead'));
create policy ct_records_update on public.ct_records for update to authenticated
  using (public.ct_role(project_id) in ('admin','supervisor','crew_lead'))
  with check (public.ct_role(project_id) in ('admin','supervisor','crew_lead'));

revoke execute on function public.ct_role(uuid) from anon, public;
grant execute on function public.ct_role(uuid) to authenticated;
revoke execute on function public.ct_accept_invites() from anon, public;
grant execute on function public.ct_accept_invites() to authenticated;
revoke execute on function public.ct_on_project_created() from anon, public, authenticated;

-- Private bucket for photos and test files. Object path = <project_id>/<attachment_id>
insert into storage.buckets (id, name, public) values ('ct-attachments', 'ct-attachments', false)
  on conflict (id) do nothing;
create policy ct_att_select on storage.objects for select to authenticated
  using (bucket_id = 'ct-attachments' and public.ct_role(((storage.foldername(name))[1])::uuid) is not null);
create policy ct_att_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ct-attachments' and public.ct_role(((storage.foldername(name))[1])::uuid) in ('admin','supervisor','crew_lead'));

-- Live updates.
alter publication supabase_realtime add table public.ct_records;
