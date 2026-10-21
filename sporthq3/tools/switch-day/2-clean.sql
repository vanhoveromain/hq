-- SportHQ3 switch day (13d), part 2: THE BIG CLEAN. Deletes for good (backup = JSON export).
-- Run 1-preview.sql first. Paste this whole file into Supabase -> SQL Editor -> Run.
-- One transaction: if any line fails, nothing is deleted.
--
-- Deletes: app-created activities (+ their match cards), races (+ checklists), shoes, blocks;
-- all planned sessions, planned weeks (+ week reviews), week templates; muted warnings.
-- Keeps: everything imported from Notion, the catalogue, weigh-ins, personal bests, settings.

begin;

-- Planner first (planned sessions point to activities and races).
delete from public.week_templates;      -- their items go with them (cascade)
delete from public.planned_sessions;
delete from public.planned_weeks;       -- week reviews live on these rows

-- App-created rows (no Notion page id).
delete from public.activities      where notion_id is null;   -- match cards go with them (cascade)
delete from public.races           where notion_id is null;   -- checklists go with them (cascade)
delete from public.shoes           where notion_id is null;   -- runs still pointing here just lose the link
delete from public.training_blocks where notion_id is null;   -- races still pointing here just lose the link

-- "This is my normal pattern" warnings muted during testing.
update public.settings set muted_warnings = '[]'::jsonb;

commit;
