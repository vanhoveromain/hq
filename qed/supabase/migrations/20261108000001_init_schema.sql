-- =====================================================================
-- QED HQ — initial schema (build step 1)
--
-- Runs in QED HQ's OWN Supabase project (EU region), not in the shared
-- hq / Sport HQ project: QED client data stays apart from personal data.
--
-- Builds the three "drawers" (tables) of the app and puts a lock (Row
-- Level Security) on each one in the same file, so a table never exists
-- even for a moment without its lock.
--
-- Patterns used on every table (same as Sport HQ):
--   user_id    -> who owns the row. Defaults to the logged-in user
--                 (auth.uid()), so the app never has to send it.
--   RLS        -> "you can only see and change rows where user_id is you".
--   grants     -> only logged-in users ("authenticated") may touch the
--                 tables at all; anonymous visitors ("anon") get nothing.
--   updated_at -> filled in automatically on every change (trigger).
--
-- Fixed lists (type, status, scope...) use a CHECK. People lists (owner,
-- delegated_to) are plain text WITHOUT a check: names live in rules.js,
-- so adding a person never needs a database change.
--
-- Run it ONCE, in the QED project's SQL Editor, AFTER creating your
-- account in that project (the 4 starter links are given to it).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helper: keep updated_at current on every change
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- qed_projects: events, non-event projects AND sales leads (type = sales)
-- ---------------------------------------------------------------------
create table public.qed_projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  type          text not null
                check (type in ('own_initiated', 'bespoke', 'non_event', 'sales')),
  -- Empty for sales leads (they only use sales_status).
  status        text
                check (status in ('tbc', 'coming_up', 'ongoing', 'passed', 'archived')),
  -- Sales leads only. Tracking only: a confirmed lead stays a lead.
  sales_status  text
                check (sales_status in ('lead', 'improvements', 'confirmed', 'declined')),
  -- Who runs the project (romain, paula, gabriella...). List in rules.js.
  owner         text not null default 'romain',
  -- Dates only, no times (decided 2026-11-08).
  date_start    date,
  date_end      date,
  notes         text,
  -- Link back to the Notion page (OnsiteHQ, Event teams, old notes).
  notion_url    text check (notion_url is null or notion_url like 'https://%'),
  -- Notion page id, so the import can run again without duplicates.
  notion_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint qed_projects_dates_in_order
    check (date_end is null or date_start is null or date_end >= date_start),
  constraint qed_projects_notion_id_unique unique (user_id, notion_id)
);

create index qed_projects_user_type_idx on public.qed_projects (user_id, type);

create trigger qed_projects_set_updated_at
  before update on public.qed_projects
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- qed_tasks: every task, linked (or not) to a project
-- ---------------------------------------------------------------------
create table public.qed_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  -- If the project is deleted, its tasks stay but lose the link.
  project_id    uuid references public.qed_projects (id) on delete set null,
  done          boolean not null default false,
  -- Set / cleared automatically when done changes (trigger below).
  -- "Achieved today / this week" use this day, not the due date.
  done_at       timestamptz,
  due_date      date,
  period        text check (period in ('am', 'pm')),
  scope         text check (scope in ('major', 'medium', 'small')),
  priority      text
                check (priority in ('critical', 'high', 'medium', 'low', 'nice_to_do')),
  state         text not null default 'active'
                check (state in ('active', 'pending', 'pending_today',
                                 'to_delegate', 'delegated')),
  is_meeting    boolean not null default false,
  -- Person or team the task is handed to. List in rules.js.
  delegated_to  text,
  notes         text,
  notion_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint qed_tasks_done_at_matches_done
    check ((done and done_at is not null) or (not done and done_at is null)),
  constraint qed_tasks_notion_id_unique unique (user_id, notion_id)
);

-- The daily lists and the rollover look for open tasks by due date.
create index qed_tasks_open_due_idx on public.qed_tasks (user_id, due_date)
  where not done;
create index qed_tasks_done_at_idx on public.qed_tasks (user_id, done_at)
  where done;
create index qed_tasks_project_idx on public.qed_tasks (project_id);

-- done_at follows done: ticked -> now, unticked -> empty.
create or replace function public.qed_tasks_sync_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := coalesce(new.done_at, now());
  elsif not new.done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger qed_tasks_sync_done_at
  before insert or update of done on public.qed_tasks
  for each row execute function public.qed_tasks_sync_done_at();

create trigger qed_tasks_set_updated_at
  before update on public.qed_tasks
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- qed_links: the Tools panel on Home (editable in the app)
-- ---------------------------------------------------------------------
create table public.qed_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  label         text not null check (length(trim(label)) > 0),
  url           text not null check (url like 'https://%'),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index qed_links_user_order_idx on public.qed_links (user_id, sort_order);

create trigger qed_links_set_updated_at
  before update on public.qed_links
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Locks: Row Level Security + one policy per table.
--   1. turn the lock on (enable row level security)
--   2. one rule: you can only see / change your own rows
--   3. anonymous visitors get no access at all
--   4. logged-in users may read/add/change/delete (the policy still
--      limits them to their own rows)
-- ---------------------------------------------------------------------
alter table public.qed_projects enable row level security;
create policy "Owner can do everything" on public.qed_projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.qed_projects from anon;
grant select, insert, update, delete on public.qed_projects to authenticated;

alter table public.qed_tasks enable row level security;
create policy "Owner can do everything" on public.qed_tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.qed_tasks from anon;
grant select, insert, update, delete on public.qed_tasks to authenticated;

alter table public.qed_links enable row level security;
create policy "Owner can do everything" on public.qed_links
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.qed_links from anon;
grant select, insert, update, delete on public.qed_links to authenticated;


-- ---------------------------------------------------------------------
-- Nightly rollover: every open task due BEFORE today (Brussels time)
-- moves to today. Weekends included (decided 2026-11-08).
--
-- Safe to run as often as you like: once a task is on today, it is no
-- longer "before today", so a second run moves nothing.
--
-- "security invoker" = it runs with the rights of whoever calls it:
--   - the app (logged in)  -> the lock limits it to YOUR tasks;
--   - the scheduler (cron) -> runs as the database owner, all tasks.
-- Returns how many tasks were moved.
-- ---------------------------------------------------------------------
create or replace function public.qed_rollover_tasks()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  brussels_today date := (now() at time zone 'Europe/Brussels')::date;
  moved integer;
begin
  update public.qed_tasks
     set due_date = brussels_today
   where not done
     and due_date < brussels_today;
  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke all on function public.qed_rollover_tasks() from public, anon;
grant execute on function public.qed_rollover_tasks() to authenticated;


-- ---------------------------------------------------------------------
-- Schedule: run the rollover at 5 past every hour (UTC).
-- Only the first run after midnight Brussels time finds work; running
-- hourly means summer / winter time never shifts it. The app also calls
-- it each time it opens, as a safety net.
--
-- Needs the pg_cron extension. If the next line fails, turn on
-- "Cron" in the dashboard (Integrations -> Cron), then run the rest.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'qed-rollover-tasks',
  '5 * * * *',
  $$ select public.qed_rollover_tasks(); $$
);


-- ---------------------------------------------------------------------
-- Starter links for the Tools panel, given to every account that
-- already exists in this project (only yours). Skipped if you already
-- have links.
-- ---------------------------------------------------------------------
insert into public.qed_links (user_id, label, url, sort_order)
select u.id, l.label, l.url, l.sort_order
  from auth.users u
 cross join (values
   ('Registration review', 'https://registration-review.qedapp.eu/', 1),
   ('FD XL to CSV',        'https://www.euevent.eu/fd-xl-to-csv/',   2),
   ('Bespoke admin',       'https://admin-bespoke.qedapp.eu/',       3),
   ('Digital services',    'https://partners.qed.eu/digital-services', 4)
 ) as l(label, url, sort_order)
 where not exists (
   select 1 from public.qed_links x where x.user_id = u.id
 );
