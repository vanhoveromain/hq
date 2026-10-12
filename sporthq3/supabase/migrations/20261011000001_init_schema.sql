-- =====================================================================
-- SportHQ3 — initial schema
--
-- Builds every "drawer" (table) of the app and puts a lock (Row Level
-- Security) on each one, in the same file, so a table never exists
-- even for a moment without its lock.
--
-- Patterns used on every table:
--   user_id  -> who owns the row. Defaults to the logged-in user
--               (auth.uid()), so the app never has to send it.
--   RLS      -> "you can only see and change rows where user_id is you".
--   grants   -> only logged-in users ("authenticated") may touch the
--               tables at all; anonymous visitors ("anon") get nothing.
--
-- Lists that belong to the rulebook (sports, session types) are stored
-- as plain text WITHOUT a database check, so adding a sport in rules.js
-- never needs a database change. Fixed lists (statuses) use a CHECK.
-- =====================================================================


-- ---------------------------------------------------------------------
-- settings: one row per user with personal targets
-- ---------------------------------------------------------------------
create table public.settings (
  user_id          uuid primary key default auth.uid()
                   references auth.users (id) on delete cascade,
  start_weight_kg  numeric(5,2) check (start_weight_kg between 20 and 300),
  target_weight_kg numeric(5,2) check (target_weight_kg between 20 and 300),
  created_at       timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- shoes: running shoes; total km is computed from linked activities
-- ---------------------------------------------------------------------
create table public.shoes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  name          text not null,
  surface       text check (surface in ('road', 'trail')),
  purchase_date date,
  retired       boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- training_blocks: a named date range ("box drawn around dates").
-- Sessions/activities inside the dates belong to it automatically,
-- so they don't need a link column.
-- ---------------------------------------------------------------------
create table public.training_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  goal        text,
  recap       text,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);


-- ---------------------------------------------------------------------
-- races: upcoming and past races. Statuses mirror Sport HQ2.
-- Times are stored in seconds (46:00 -> 2760).
-- ---------------------------------------------------------------------
create table public.races (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  name              text not null,
  race_date         date not null,
  location          text,
  distance_km       numeric(6,2) check (distance_km > 0),
  elevation_m       integer check (elevation_m >= 0),
  status            text not null default 'idea'
                    check (status in ('idea', 'potential', 'to_register',
                                      'registered', 'finished', 'cancelled')),
  goal_time_s       integer check (goal_time_s > 0),
  result_time_s     integer check (result_time_s > 0),
  training_block_id uuid references public.training_blocks (id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- race_checklist_items: one line of a race's pre-race checklist.
-- Deleting a race deletes its checklist (on delete cascade).
-- ---------------------------------------------------------------------
create table public.race_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  race_id     uuid not null references public.races (id) on delete cascade,
  label       text not null,
  done        boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- activities: what I actually did. One table for every sport.
-- sport / session_type are keys defined in rules.js (e.g. 'running' /
-- 'intervals'); the rulebook decides which ones are "heavy legs".
-- ---------------------------------------------------------------------
create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  activity_date  date not null,
  sport          text not null,
  session_type   text,
  title          text,
  duration_s     integer check (duration_s > 0),
  distance_km    numeric(7,2) check (distance_km >= 0),
  elevation_m    integer check (elevation_m >= 0),
  stairs_climbed integer check (stairs_climbed >= 0),
  rpe            smallint check (rpe between 1 and 10),
  notes          text,
  shoe_id        uuid references public.shoes (id) on delete set null,
  race_id        uuid references public.races (id) on delete set null,
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- match_stats: the "match card" stapled to a football match activity.
-- activity_id is also the primary key -> max one card per activity.
-- ---------------------------------------------------------------------
create table public.match_stats (
  activity_id     uuid primary key
                  references public.activities (id) on delete cascade,
  user_id         uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  opponent        text,
  minutes_played  integer check (minutes_played between 0 and 200),
  goals           integer not null default 0 check (goals >= 0),
  assists         integer not null default 0 check (assists >= 0),
  created_at      timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- planned_weeks: a marker saying "this week was already filled from
-- the default template". Without it, deleting every session of a week
-- would make the app refill it the next time you open it.
-- ---------------------------------------------------------------------
create table public.planned_weeks (
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1), -- always a Monday
  created_at  timestamptz not null default now(),
  primary key (user_id, week_start)
);


-- ---------------------------------------------------------------------
-- planned_sessions: the weekly planner's "sticky notes".
--   status  : planned -> done / cancelled
--   source  : where it came from (default week, added by hand, race routine)
--   race_id : set for race-routine sessions; removed with the race
--   activity_id : the activity log entry that fulfilled this session
-- ---------------------------------------------------------------------
create table public.planned_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  session_date  date not null,
  sport         text,
  session_type  text not null,
  title         text,
  status        text not null default 'planned'
                check (status in ('planned', 'done', 'cancelled')),
  source        text not null default 'manual'
                check (source in ('template', 'manual', 'race_routine')),
  position      integer not null default 0,
  activity_id   uuid references public.activities (id) on delete set null,
  race_id       uuid references public.races (id) on delete cascade,
  notes         text,
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- weigh_ins: max one weight per day (unique user + date).
-- ---------------------------------------------------------------------
create table public.weigh_ins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  weigh_date  date not null,
  weight_kg   numeric(5,2) not null check (weight_kg between 20 and 300),
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, weigh_date)
);


-- ---------------------------------------------------------------------
-- personal_bests: MANUAL records only (e.g. 10k 46:00 from before the
-- app). Automatic PBs are computed from activities, not stored here.
-- ---------------------------------------------------------------------
create table public.personal_bests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  label        text not null,                 -- e.g. '10k'
  distance_km  numeric(6,2) not null check (distance_km > 0),
  time_s       integer not null check (time_s > 0),
  achieved_on  date,
  notes        text,
  created_at   timestamptz not null default now()
);


-- =====================================================================
-- Indexes: like the tabs in a binder, so "my activities this week" or
-- "my next race" are found fast without reading every row.
-- =====================================================================
create index activities_user_date_idx       on public.activities (user_id, activity_date);
create index activities_shoe_idx            on public.activities (shoe_id);
create index activities_race_idx            on public.activities (race_id);
create index planned_sessions_user_date_idx on public.planned_sessions (user_id, session_date);
create index planned_sessions_activity_idx  on public.planned_sessions (activity_id);
create index planned_sessions_race_idx      on public.planned_sessions (race_id);
create index races_user_date_idx            on public.races (user_id, race_date);
create index races_block_idx                on public.races (training_block_id);
create index checklist_race_idx             on public.race_checklist_items (race_id, position);
create index training_blocks_user_idx       on public.training_blocks (user_id, start_date);
create index shoes_user_idx                 on public.shoes (user_id);
create index match_stats_user_idx           on public.match_stats (user_id);
create index personal_bests_user_idx        on public.personal_bests (user_id);


-- =====================================================================
-- Locks: Row Level Security + one policy per table.
--
-- For each table, 4 lines:
--   1. turn the lock on (enable row level security)
--   2. the key: "Owner can do everything" ...
--        using      = which existing rows you may see / change / delete
--        with check = what new or edited rows are allowed to look like
--      Both say: user_id must be me. (select auth.uid()) is wrapped in a
--      select so Postgres works it out once per query, not once per row.
--   3. anonymous visitors (not logged in) get no access at all
--   4. logged-in users may read/add/change/delete (the policy still
--      limits them to their own rows)
-- =====================================================================

-- settings
alter table public.settings enable row level security;
create policy "Owner can do everything" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.settings from anon;
grant select, insert, update, delete on public.settings to authenticated;

-- shoes
alter table public.shoes enable row level security;
create policy "Owner can do everything" on public.shoes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.shoes from anon;
grant select, insert, update, delete on public.shoes to authenticated;

-- training_blocks
alter table public.training_blocks enable row level security;
create policy "Owner can do everything" on public.training_blocks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.training_blocks from anon;
grant select, insert, update, delete on public.training_blocks to authenticated;

-- races
alter table public.races enable row level security;
create policy "Owner can do everything" on public.races
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.races from anon;
grant select, insert, update, delete on public.races to authenticated;

-- race_checklist_items
alter table public.race_checklist_items enable row level security;
create policy "Owner can do everything" on public.race_checklist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.race_checklist_items from anon;
grant select, insert, update, delete on public.race_checklist_items to authenticated;

-- activities
alter table public.activities enable row level security;
create policy "Owner can do everything" on public.activities
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.activities from anon;
grant select, insert, update, delete on public.activities to authenticated;

-- match_stats
alter table public.match_stats enable row level security;
create policy "Owner can do everything" on public.match_stats
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.match_stats from anon;
grant select, insert, update, delete on public.match_stats to authenticated;

-- planned_weeks
alter table public.planned_weeks enable row level security;
create policy "Owner can do everything" on public.planned_weeks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.planned_weeks from anon;
grant select, insert, update, delete on public.planned_weeks to authenticated;

-- planned_sessions
alter table public.planned_sessions enable row level security;
create policy "Owner can do everything" on public.planned_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.planned_sessions from anon;
grant select, insert, update, delete on public.planned_sessions to authenticated;

-- weigh_ins
alter table public.weigh_ins enable row level security;
create policy "Owner can do everything" on public.weigh_ins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.weigh_ins from anon;
grant select, insert, update, delete on public.weigh_ins to authenticated;

-- personal_bests
alter table public.personal_bests enable row level security;
create policy "Owner can do everything" on public.personal_bests
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.personal_bests from anon;
grant select, insert, update, delete on public.personal_bests to authenticated;
