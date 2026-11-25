-- =====================================================================
-- QED HQ — the Monday reset also clears Ongoing (Romain, 2026-11-25)
--
-- Same function as in 20261125000001, plus: ongoing -> off, so the
-- Priorities board's Ongoing column starts empty every week.
-- Replaces the function only; the Monday schedule (qed-monday-reset) stays
-- as it is and calls this new version from now on.
-- Run in the QED project's SQL Editor.
-- =====================================================================

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
     set state = 'active',
         delegated_to = null,
         priority = null,
         scope = null,
         period = null,
         is_meeting = false,
         meeting_name = null,
         ongoing = false
   where not done
     and (state <> 'active' or delegated_to is not null or priority is not null
          or scope is not null or period is not null or is_meeting or meeting_name is not null
          or ongoing);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.qed_monday_reset() from public, anon, authenticated;
