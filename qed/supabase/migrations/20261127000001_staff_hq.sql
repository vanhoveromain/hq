-- =====================================================================
-- Staff HQ — tables (Staff HQ build step 1, 2026-11-27)
--
-- Staff HQ (staff.ownhq.app) is QED's staff schedule: who works on which
-- event, which day. It was a Claude artifact; the page moves as it is, with
-- a new data layer. Data in QED HQ's Supabase project (EU), like Onsite HQ.
--
-- Decided by Romain 2026-11-27:
--   - Romain edits, logged in (the shared hq login + QED project session).
--   - The team views WITHOUT a login, through a secret link
--     (staff.ownhq.app/#k=<key>). The key opens the schedule and nothing
--     else: no table is readable by anon, only the function staff_read(key).
--   - Change the key = the old link stops working at once (see the end).
--
-- What it holds:
--   staff_docs    the schedule, stored the way the page reads it: one row
--                 per document, "collection/id" -> JSON.
--                   config/main      team, suppliers, roles
--                   events/<id>      an event and its days + roles
--                   notes/<date>     a note on a day
--   staff_editors who may change the schedule (Romain)
--   staff_link    the team link's key (one row)
--
-- Add-only: new tables + functions, nothing existing is touched.
-- Run in the QED project's SQL Editor, AFTER the earlier migrations.
-- =====================================================================


-- ---------------------------------------------------------------------
-- staff_docs: the schedule
-- ---------------------------------------------------------------------
create table public.staff_docs (
  collection  text not null check (collection in ('config', 'events', 'notes')),
  -- Ids kept from the Claude version (e.g. "9fcqjz2s2drfyf2v41uk",
  -- "accis-2026-11", "2026-11-16", "main").
  id          text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data        jsonb not null
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  updated_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (collection, id)
);

create trigger staff_docs_set_updated_at
  before update on public.staff_docs
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- staff_editors: who may change the schedule
-- ---------------------------------------------------------------------
create table public.staff_editors (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Today the QED project has one account (Romain; sign-ups closed), so every
-- account in it becomes an editor. Check with:
--   select u.email from public.staff_editors e join auth.users u on u.id = e.user_id;
insert into public.staff_editors (user_id)
select id from auth.users
on conflict do nothing;

-- Used by the policies below. security definer: the policies may read
-- staff_editors even though nobody else can.
create or replace function public.staff_is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_editors where user_id = (select auth.uid()));
$$;
revoke all on function public.staff_is_editor() from public, anon;
grant execute on function public.staff_is_editor() to authenticated;


-- ---------------------------------------------------------------------
-- staff_link: the team link's key (exactly one row)
-- ---------------------------------------------------------------------
create table public.staff_link (
  one_row     boolean primary key default true check (one_row),
  -- 64 random hex characters (two random UUIDs, dashes removed).
  key         text not null check (char_length(key) >= 32),
  updated_at  timestamptz not null default now()
);

insert into public.staff_link (key)
values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create trigger staff_link_set_updated_at
  before update on public.staff_link
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Locks
--   staff_docs:    editors read + write; everyone else nothing (the team
--                  reads through staff_read below).
--   staff_editors: an editor sees only their own row (the page asks "am I
--                  an editor?"); changed only in the SQL Editor.
--   staff_link:    editors may read it (to copy the team link); changed
--                  only in the SQL Editor.
-- ---------------------------------------------------------------------
alter table public.staff_docs enable row level security;
create policy "Editors can do everything" on public.staff_docs
  for all to authenticated
  using ((select public.staff_is_editor()))
  with check ((select public.staff_is_editor()));
revoke all on public.staff_docs from anon, authenticated;
grant select, insert, update, delete on public.staff_docs to authenticated;

alter table public.staff_editors enable row level security;
create policy "Read your own row" on public.staff_editors
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.staff_editors from anon, authenticated;
grant select on public.staff_editors to authenticated;

alter table public.staff_link enable row level security;
create policy "Editors can read the key" on public.staff_link
  for select to authenticated
  using ((select public.staff_is_editor()));
revoke all on public.staff_link from anon, authenticated;
grant select on public.staff_link to authenticated;


-- ---------------------------------------------------------------------
-- staff_read(key): the whole schedule for the team link
--   Right key  -> { "config": {id: data}, "events": {...}, "notes": {...} }
--   Wrong key  -> null (nothing at all)
-- The only thing anon can call. Read-only.
-- ---------------------------------------------------------------------
create or replace function public.staff_read(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_key is null or char_length(p_key) < 32
     or not exists (select 1 from public.staff_link where key = p_key) then
    return null;
  end if;
  return jsonb_build_object(
    'config', coalesce((select jsonb_object_agg(id, data) from public.staff_docs where collection = 'config'), '{}'::jsonb),
    'events', coalesce((select jsonb_object_agg(id, data) from public.staff_docs where collection = 'events'), '{}'::jsonb),
    'notes',  coalesce((select jsonb_object_agg(id, data) from public.staff_docs where collection = 'notes'),  '{}'::jsonb)
  );
end;
$$;
revoke all on function public.staff_read(text) from public;
grant execute on function public.staff_read(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- After running: the team link
--   select 'https://staff.ownhq.app/#k=' || key from public.staff_link;
--
-- Change the key (old link stops working at once):
--   update public.staff_link
--   set key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
-- ---------------------------------------------------------------------
