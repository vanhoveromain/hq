-- =====================================================================
-- Onsite HQ — speakers / moderators on stage + programme sessions can be
-- ticked (Romain, 2026-11-26)
--
-- 1. Two counts per line: speakers and moderators on stage (see below).
-- 2. Programme lines can now be ticked (done_at) too: a session that runs
--    late stays "Now on stage" until it is ticked, instead of disappearing
--    at its end time. The rule "programme lines are never ticked" goes.
--
-- Two counts per line (programme sessions mostly): how many speakers and
-- how many moderators will be on stage, shown as "3 + 1 mod · 4 on stage"
-- (chairs, mics). Counts only, never names (GDPR: the agency adds people
-- itself where needed). Empty = not known.
--
-- Two empty columns + one rule removed (allows more, refuses nothing new).
-- The app already live keeps working.
-- Run in the QED project's SQL Editor BEFORE testing the app version that
-- uses them (that version writes the counts; without the columns its
-- imports would be refused).
-- =====================================================================

alter table public.onsite_ros_items
  add column speakers integer
    constraint onsite_ros_items_speakers_range check (speakers is null or speakers between 0 and 50),
  add column moderators integer
    constraint onsite_ros_items_moderators_range check (moderators is null or moderators between 0 and 10);

comment on column public.onsite_ros_items.speakers is
  'Number of speakers on stage (count only, no names). Null = not known.';
comment on column public.onsite_ros_items.moderators is
  'Number of moderators on stage (count only, no names). Null = not known.';

-- Programme sessions can be ticked (finished on stage).
alter table public.onsite_ros_items
  drop constraint onsite_ros_items_programme_not_ticked;
