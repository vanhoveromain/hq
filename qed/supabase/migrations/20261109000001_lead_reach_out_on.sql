-- =====================================================================
-- QED HQ — sales leads: a reach-out date you choose (Sales, 2026-11-09)
--
-- Romain: "I should be able to add names to the reach out list". The
-- reach-out date stays automatic (created + 1 year) unless a lead has its
-- own date here: then that date counts. Setting it puts any lead on the
-- "To reach out" list from that day; emptying it goes back to automatic.
--
-- Add-only: existing rows and the app already live keep working.
-- =====================================================================

alter table public.qed_projects
  add column reach_out_on date;

comment on column public.qed_projects.reach_out_on is
  'Sales leads: reach out on this day. Empty = automatic (created + 1 year).';
