-- =====================================================================
-- Onsite HQ — tables (Onsite HQ build step 1, 2026-11-26)
--
-- Onsite HQ (onsite.ownhq.app) is a separate app with its data in QED HQ's
-- Supabase project (EU), next to the qed_* tables: same login, client data
-- stays in the QED project. Decided by Romain 2026-11-26.
--
-- What it holds:
--   onsite_events     an event on site (name, venue, dates)
--   onsite_days       the days of an event: setup day(s), event days, teardown
--   onsite_ros_items  the run of show: programme lines (what happens on stage,
--                     no tick) and tasks (what we do, ticked when done)
--   onsite_materials  QED's master material list, reused for every event
--   onsite_pack_items an event's packing list: packed + returned ticks
--
-- Same patterns as QED HQ (see 20261108000001_init_schema.sql):
--   user_id = logged-in user by default · RLS "own rows only" · no access for
--   anon · updated_at trigger (public.set_updated_at(), already exists).
--
-- Offline: the app makes the row ids itself (UUIDs), so rows created
-- offline keep their id when they sync. Ticks are timestamps (done_at,
-- packed_at, returned_at): ticked = not null, and you can see when.
--
-- Team later: owner is plain text (names live in the app, like QED HQ), so
-- adding a person needs no database change.
--
-- Add-only: new tables, nothing existing is touched. QED HQ keeps working.
-- Run in the QED project's SQL Editor, AFTER the earlier migrations.
-- =====================================================================


-- ---------------------------------------------------------------------
-- onsite_events
-- ---------------------------------------------------------------------
create table public.onsite_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0 and char_length(name) <= 200),
  venue       text check (char_length(venue) <= 200),
  address     text check (char_length(address) <= 300),
  -- Rooms used on site, in display order (Plenary, Breakout room, Foyer...).
  -- Run-of-show lines pick from this list; free text is still allowed.
  rooms       text[] not null default '{}',
  -- Later (after the core): link to a QED HQ project, and templates.
  -- Columns added now so that needs no second migration.
  project_id  uuid references public.qed_projects (id) on delete set null,
  is_template boolean not null default false,
  notes       text check (char_length(notes) <= 10000),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index onsite_events_user_idx on public.onsite_events (user_id);

create trigger onsite_events_set_updated_at
  before update on public.onsite_events
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- onsite_days: setup day(s), event days, teardown
-- ---------------------------------------------------------------------
create table public.onsite_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  event_id    uuid not null references public.onsite_events (id) on delete cascade,
  day         date not null,
  kind        text not null default 'event'
              check (kind in ('setup', 'event', 'teardown')),
  -- Shown on the day tabs ("Setup", "Day 1"...). Empty = the app makes one.
  label       text check (char_length(label) <= 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint onsite_days_one_per_date unique (event_id, day),
  -- Lets run-of-show lines check their day belongs to the same event.
  constraint onsite_days_id_event_unique unique (id, event_id)
);

create trigger onsite_days_set_updated_at
  before update on public.onsite_days
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- onsite_ros_items: the run of show
--   kind 'programme' = what happens on stage (session, break, lunch):
--                      shown for context, never ticked
--   kind 'task'      = what we do (mic check, open doors...): ticked
-- Times are Brussels wall-clock times (no time zone), like the programme.
-- ---------------------------------------------------------------------
create table public.onsite_ros_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  event_id    uuid not null references public.onsite_events (id) on delete cascade,
  day_id      uuid not null,
  kind        text not null default 'task'
              check (kind in ('task', 'programme')),
  start_time  time not null,
  end_time    time,
  title       text not null check (length(trim(title)) > 0 and char_length(title) <= 300),
  owner       text check (char_length(owner) <= 100),
  room        text check (char_length(room) <= 100),
  notes       text check (char_length(notes) <= 5000),
  -- Order of lines that start at the same time.
  position    integer not null default 0,
  -- Tasks only: when it was ticked (null = open).
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint onsite_ros_items_day_same_event
    foreign key (day_id, event_id)
    references public.onsite_days (id, event_id) on delete cascade,
  -- No "end after start" check: a line may run past midnight (22:00-01:00).
  constraint onsite_ros_items_programme_not_ticked
    check (kind = 'task' or done_at is null)
);

create index onsite_ros_items_event_day_idx
  on public.onsite_ros_items (event_id, day_id, start_time, position);

create trigger onsite_ros_items_set_updated_at
  before update on public.onsite_ros_items
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- onsite_materials: QED's master material list (reused for every event)
-- ---------------------------------------------------------------------
create table public.onsite_materials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0 and char_length(name) <= 200),
  -- Where it is packed / its group: Box 1, Sound pocket, Onsite box, To print...
  category    text check (char_length(category) <= 100),
  default_qty integer check (default_qty is null or default_qty > 0),
  note        text check (char_length(note) <= 1000),
  position    integer not null default 0,
  -- Hidden from the picker, kept for past events.
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index onsite_materials_user_idx on public.onsite_materials (user_id, category, position);

create trigger onsite_materials_set_updated_at
  before update on public.onsite_materials
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- onsite_pack_items: an event's packing list
--   Copied from the master list (name, category, qty can then change for
--   this event only) or typed for this event alone (material_id empty).
-- ---------------------------------------------------------------------
create table public.onsite_pack_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  event_id    uuid not null references public.onsite_events (id) on delete cascade,
  material_id uuid references public.onsite_materials (id) on delete set null,
  name        text not null check (length(trim(name)) > 0 and char_length(name) <= 200),
  category    text check (char_length(category) <= 100),
  qty         integer check (qty is null or qty > 0),
  note        text check (char_length(note) <= 1000),
  position    integer not null default 0,
  packed_at   timestamptz,   -- packed at the office
  returned_at timestamptz,   -- back at the office after the event
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index onsite_pack_items_event_idx
  on public.onsite_pack_items (event_id, category, position);

create trigger onsite_pack_items_set_updated_at
  before update on public.onsite_pack_items
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Locks: Row Level Security, "own rows only", nothing for anon.
-- Rows that point to an event (days, run of show, packing list) must also
-- point to an event of yours, so a row can never hang off someone else's
-- event once the team joins.
-- ---------------------------------------------------------------------
alter table public.onsite_events enable row level security;
create policy "Owner can do everything" on public.onsite_events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (project_id is null or exists (
      select 1 from public.qed_projects p
      where p.id = project_id and p.user_id = (select auth.uid())))
  );
revoke all on public.onsite_events from anon;
grant select, insert, update, delete on public.onsite_events to authenticated;

alter table public.onsite_days enable row level security;
create policy "Owner can do everything" on public.onsite_days
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.onsite_events e
                where e.id = event_id and e.user_id = (select auth.uid()))
  );
revoke all on public.onsite_days from anon;
grant select, insert, update, delete on public.onsite_days to authenticated;

alter table public.onsite_ros_items enable row level security;
create policy "Owner can do everything" on public.onsite_ros_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.onsite_events e
                where e.id = event_id and e.user_id = (select auth.uid()))
  );
revoke all on public.onsite_ros_items from anon;
grant select, insert, update, delete on public.onsite_ros_items to authenticated;

alter table public.onsite_materials enable row level security;
create policy "Owner can do everything" on public.onsite_materials
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.onsite_materials from anon;
grant select, insert, update, delete on public.onsite_materials to authenticated;

alter table public.onsite_pack_items enable row level security;
create policy "Owner can do everything" on public.onsite_pack_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.onsite_events e
                where e.id = event_id and e.user_id = (select auth.uid()))
    and (material_id is null or exists (
      select 1 from public.onsite_materials m
      where m.id = material_id and m.user_id = (select auth.uid())))
  );
revoke all on public.onsite_pack_items from anon;
grant select, insert, update, delete on public.onsite_pack_items to authenticated;
