-- =====================================================================
-- QED HQ — Monday reset + "Ongoing" on the Priorities board (Romain, 2026-11-25)
--
-- 1. Monday reset. Every Monday (just after midnight, Brussels time), every
--    OPEN task:
--      - State Pending, Pending today or Delegated -> Active, so it goes back
--        into your normal day / week lists;
--      - Priority (Critical, High, Medium, Low, Nice to do) -> cleared.
--    Left as they are: To delegate, "Delegated to" (the name stays, as a
--    trace), due dates, scope, AM/PM, meetings, done tasks.
--    The nightly rollover doesn't change: open tasks due before today still
--    move to today every night.
--
-- 2. Ongoing. A new yes/no field on tasks, used only by the Priorities
--    board (To do · Ongoing · Done). Not shown anywhere else. Saved in the
--    database so laptop and phone see the same board.
--
-- Add-only: one new column with a default (every task starts "not ongoing"),
-- one new function, one new schedule. The live app keeps working as before.
-- Run in the QED project's SQL Editor (one database serves the test address
-- and the live app).
-- =====================================================================

alter table public.qed_tasks
  add column ongoing boolean not null default false;

comment on column public.qed_tasks.ongoing is
  'In progress: the Ongoing column of the Priorities board. Board only.';


-- ---------------------------------------------------------------------
-- The Monday reset. Returns how many tasks changed.
--
-- "security invoker": the scheduler runs it as the database owner (all
-- tasks). Nobody else may call it, so the app can't trigger it by mistake.
-- ---------------------------------------------------------------------
create or replace function public.qed_monday_reset()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.qed_tasks
     set state = case
                   when state in ('pending', 'pending_today', 'delegated') then 'active'
                   else state
                 end,
         priority = null
   where not done
     and (state in ('pending', 'pending_today', 'delegated') or priority is not null);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.qed_monday_reset() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Schedule: Sunday 23:05 UTC = Monday 00:05 in winter, 01:05 in summer
-- (Brussels). Always Monday, once a week.
-- ---------------------------------------------------------------------
select cron.schedule(
  'qed-monday-reset',
  '5 23 * * 0',
  $$ select public.qed_monday_reset(); $$
);
