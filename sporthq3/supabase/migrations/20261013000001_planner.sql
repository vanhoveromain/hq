-- =====================================================================
-- SportHQ3 — session catalogue, week templates, planner extras (step 7)
--
-- Safe for the live app: only ADDS tables/columns and makes one column
-- optional (planned_sessions.session_type). Nothing is removed or renamed.
-- =====================================================================


-- ---------------------------------------------------------------------
-- session_templates: the catalogue ("recipe book").
--   exercises = list of lines, each like:
--     { "name": "Leg extension", "sets": 3, "reps": "10", "weight_kg": 25, "note": "slow down" }
--     reps is text so "10", "12-15" or "45s" all work. Every field but name is optional.
--   rounds    = for circuits ("3 rounds"): the whole list is repeated.
--   jsonb = a column that stores a small JSON document (here: a list).
-- ---------------------------------------------------------------------
create table public.session_templates (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,
  name               text not null,
  sport              text not null,
  session_type       text,
  description        text,
  rounds             smallint check (rounds between 1 and 50),
  exercises          jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(exercises) = 'array'),
  target_duration_s  integer check (target_duration_s > 0),
  target_distance_km numeric(6,2) check (target_distance_km > 0),
  archived           boolean not null default false,
  notion_id          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, notion_id)
);


-- ---------------------------------------------------------------------
-- week_templates: ready-made weekly menus ("Normal week A", "Race week"…)
-- week_template_items: what's on each day of a menu. An item points to a
-- catalogue session, OR is just a sport ("Run") without a recipe.
-- weekday: 1 = Monday … 7 = Sunday.
-- ---------------------------------------------------------------------
create table public.week_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.week_template_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  week_template_id  uuid not null references public.week_templates (id) on delete cascade,
  weekday           smallint not null check (weekday between 1 and 7),
  template_id       uuid references public.session_templates (id) on delete cascade,
  sport             text,
  session_type      text,
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  -- either a recipe, or at least a sport
  check (template_id is not null or sport is not null)
);


-- ---------------------------------------------------------------------
-- planned_sessions: link to the catalogue + frozen details.
--   template_id : the recipe this session follows (live: edits show up)
--   details     : a "photo" of what was actually done, taken when the
--                 session is marked done (ticked sets, weights used)
--   session_type: now optional ("just a run")
-- ---------------------------------------------------------------------
alter table public.planned_sessions
  add column template_id uuid references public.session_templates (id) on delete set null,
  add column details jsonb;
alter table public.planned_sessions alter column session_type drop not null;

-- settings: which week templates rotate (e.g. [A, B] = alternate each week)
alter table public.settings add column week_rotation jsonb;


-- Indexes ("binder tabs")
create index session_templates_user_idx  on public.session_templates (user_id, name);
create index week_templates_user_idx     on public.week_templates (user_id, position);
create index week_items_template_idx     on public.week_template_items (week_template_id, weekday, position);
create index week_items_session_idx      on public.week_template_items (template_id);
create index planned_sessions_template_idx on public.planned_sessions (template_id);


-- Locks: same pattern as every other table.

-- session_templates
alter table public.session_templates enable row level security;
create policy "Owner can do everything" on public.session_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.session_templates from anon;
grant select, insert, update, delete on public.session_templates to authenticated;

-- week_templates
alter table public.week_templates enable row level security;
create policy "Owner can do everything" on public.week_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.week_templates from anon;
grant select, insert, update, delete on public.week_templates to authenticated;

-- week_template_items
alter table public.week_template_items enable row level security;
create policy "Owner can do everything" on public.week_template_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.week_template_items from anon;
grant select, insert, update, delete on public.week_template_items to authenticated;
