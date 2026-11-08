-- =====================================================================
-- QED HQ — tasks: which meeting a point is settled in (step 4b)
--
-- Decided 2026-11-08: tasks flagged with is_meeting are not meetings
-- themselves but points "to settle during a meeting that takes place
-- today". meeting_name says which one (e.g. "Weekly team meeting"), so
-- the Meetings list can group today's points per meeting.
--
-- Add-only: existing rows and the app already live keep working.
-- =====================================================================

alter table public.qed_tasks
  add column meeting_name text
  check (meeting_name is null or length(trim(meeting_name)) between 1 and 120);

comment on column public.qed_tasks.is_meeting is
  'To settle during a meeting (not a meeting itself). Which one: meeting_name.';
comment on column public.qed_tasks.meeting_name is
  'Optional: the meeting the point is settled in, e.g. "Weekly team meeting".';
