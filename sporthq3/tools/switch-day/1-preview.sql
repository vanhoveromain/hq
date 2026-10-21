-- SportHQ3 switch day (13d), part 1: PREVIEW. Read-only, changes nothing.
-- Paste into Supabase -> SQL Editor -> Run. Shows what the big clean will delete and what stays.

select 'DELETE activities (app-created)'  as what, count(*) as how_many from public.activities      where notion_id is null
union all select 'DELETE match cards on those',   count(*) from public.match_stats m join public.activities a on a.id = m.activity_id where a.notion_id is null
union all select 'DELETE races (app-created)',    count(*) from public.races           where notion_id is null
union all select 'DELETE checklist items of those', count(*) from public.race_checklist_items c join public.races r on r.id = c.race_id where r.notion_id is null
union all select 'DELETE shoes (app-created)',    count(*) from public.shoes           where notion_id is null
union all select 'DELETE blocks (app-created)',   count(*) from public.training_blocks where notion_id is null
union all select 'DELETE planned sessions',       count(*) from public.planned_sessions
union all select 'DELETE planned weeks (+ reviews)', count(*) from public.planned_weeks
union all select 'DELETE week templates',         count(*) from public.week_templates
union all select 'RESET muted warnings',          coalesce(sum(jsonb_array_length(muted_warnings)), 0) from public.settings
union all select 'KEEP activities (from Notion)', count(*) from public.activities      where notion_id is not null
union all select 'KEEP match cards (Notion activities)', count(*) from public.match_stats m join public.activities a on a.id = m.activity_id where a.notion_id is not null
union all select 'KEEP races (from Notion)',      count(*) from public.races           where notion_id is not null
union all select 'KEEP checklist items (Notion races)', count(*) from public.race_checklist_items c join public.races r on r.id = c.race_id where r.notion_id is not null
union all select 'KEEP shoes (from Notion)',      count(*) from public.shoes           where notion_id is not null
union all select 'KEEP blocks (from Notion)',     count(*) from public.training_blocks where notion_id is not null
union all select 'KEEP catalogue sessions',       count(*) from public.session_templates
union all select 'KEEP weigh-ins',                count(*) from public.weigh_ins
union all select 'KEEP personal bests',           count(*) from public.personal_bests;
