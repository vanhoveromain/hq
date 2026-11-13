-- =====================================================================
-- QED HQ — how many times a task was put off (UX review #10, 2026-11-13)
--
-- Romain: a task moved on day after day should show it ("↻ 3"), instead of
-- looking new every morning.
--
-- rolled_over = how many times the task's date was moved on without a real
-- decision:
--   + 1  the nightly rollover (open task due before today -> today)
--   + 1  "Push to tomorrow" in the app (row arrow, T, Push all, task sheet)
--   = 0  you pick a date yourself (date chip, task sheet, Planner drag)
-- The app shows it from 2, amber from 5.
--
-- Add-only: a new column with a default (existing tasks start at 0) and the
-- same rollover function counting too. The app already live keeps working.
-- Run in the QED project's SQL Editor, BEFORE testing the app version that
-- uses it (one database serves the test address and the live app).
-- =====================================================================

alter table public.qed_tasks
  add column rolled_over integer not null default 0
  constraint qed_tasks_rolled_over_not_negative check (rolled_over >= 0);

comment on column public.qed_tasks.rolled_over is
  'How many times the due date was moved on (nightly rollover or Push to tomorrow). 0 once you pick a date yourself.';

-- Same as in 20261108000001, plus the count.
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
     set due_date = brussels_today,
         rolled_over = rolled_over + 1
   where not done
     and due_date < brussels_today;
  get diagnostics moved = row_count;
  return moved;
end;
$$;
