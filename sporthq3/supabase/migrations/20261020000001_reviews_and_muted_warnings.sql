-- SportHQ3 step 16 (2026-10-20): weekly review + "this is my normal pattern" warnings.
-- Additive only: new columns with safe defaults, nothing removed or renamed,
-- so the app already online keeps working before AND after this runs.
-- Paste the whole file into Supabase -> SQL Editor -> Run (once).

-- 16g: the weekly review lives on planned_weeks (one row per user + Monday,
-- created in step 1 and unused until now). RLS is already on for this table.
alter table public.planned_weeks
  add column if not exists review_notes text check (char_length(review_notes) <= 4000),
  add column if not exists reviewed_at  timestamptz;

-- 16e: warnings you marked "this is my normal pattern, don't warn me".
-- A list of warning texts, e.g. ["Heavy legs two days in a row: Sun Match → Mon Leg explosivity"].
alter table public.settings
  add column if not exists muted_warnings jsonb not null default '[]'::jsonb;
