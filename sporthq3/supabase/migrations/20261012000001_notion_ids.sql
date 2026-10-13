-- =====================================================================
-- SportHQ3 — Notion IDs ("luggage tags") for the re-runnable import
--
-- Adds a notion_id column to the 4 drawers that receive data from Notion.
-- Rows created in the app leave it empty; imported rows carry the id of
-- their Notion page. A re-import uses it to update the right row instead
-- of adding a copy, and to remove rows that were deleted in Notion.
--
-- Safe for the live app: it only ADDS columns, and lets a race have no date
-- yet (race ideas). Nothing is removed or renamed.
-- =====================================================================

alter table public.activities      add column notion_id text;
alter table public.shoes           add column notion_id text;
alter table public.races           add column notion_id text;
alter table public.training_blocks add column notion_id text;

-- One Notion page can only be imported once per user. (Empty values don't
-- count as duplicates, so app-created rows are not affected.) The import
-- relies on these for "insert, or update if it already exists".
alter table public.activities      add constraint activities_user_notion_key      unique (user_id, notion_id);
alter table public.shoes           add constraint shoes_user_notion_key           unique (user_id, notion_id);
alter table public.races           add constraint races_user_notion_key           unique (user_id, notion_id);
alter table public.training_blocks add constraint training_blocks_user_notion_key unique (user_id, notion_id);

-- Race ideas in Notion often have no date yet. Allow that.
alter table public.races alter column race_date drop not null;
