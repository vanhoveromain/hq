-- =====================================================================
-- QED HQ — a contact person on a sales lead (UX review #16, 2026-11-13)
--
-- Romain: a lead needs the person to follow up with. Name + email only
-- (no phone, no notes about the person): the least personal data that does
-- the job (GDPR). Clear it when a lead is declined and no follow-up is
-- planned.
--
-- The "next step" of a lead is NOT a column: it is the lead's first open
-- task (title + due date), so it also shows in Priorities.
--
-- Add-only: two empty columns. The app already live keeps working.
-- Run in the QED project's SQL Editor before testing the app version that
-- uses it.
-- =====================================================================

alter table public.qed_projects
  add column contact_name text
    constraint qed_projects_contact_name_length check (char_length(contact_name) <= 200),
  add column contact_email text
    constraint qed_projects_contact_email_length check (char_length(contact_email) <= 320);

comment on column public.qed_projects.contact_name is
  'Sales leads: the person to follow up with (GDPR: only what the follow-up needs).';
comment on column public.qed_projects.contact_email is
  'Sales leads: that person''s work email.';
