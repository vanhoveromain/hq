-- =====================================================================
-- PouletteHQ — schéma initial (étape 0.3, 2026-11-15)
--
-- S'exécute dans le projet Supabase partagé "own-hq" (eu-west-3), qui
-- porte aussi Sport HQ. Ajout pur : uniquement de nouveaux objets, tous
-- préfixés poulette_. Rien de Sport HQ n'est touché.
-- À coller entier dans Supabase -> SQL Editor -> Run (une seule fois).
--
-- Principe : rien n'appartient à un user_id seul. Tout passe par un
-- "household" (le foyer) : on voit et on modifie les lignes des foyers
-- dont on est membre, et rien d'autre.
--
-- Chaque table est créée avec son verrou (RLS) dans ce même fichier,
-- pour qu'elle n'existe jamais, même un instant, sans verrou.
--
-- Les ids peuvent être fournis par l'app (uuid créé sur le téléphone) :
-- une saisie hors-ligne renvoyée deux fois retombe sur le même id et
-- n'est donc jamais enregistrée en double.
-- =====================================================================


-- ---------------------------------------------------------------------
-- updated_at rempli automatiquement à chaque modification.
-- Fonction propre à PouletteHQ (own-hq n'en a pas de partagée).
-- ---------------------------------------------------------------------
create or replace function public.poulette_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- poulette_households : le foyer.
-- ---------------------------------------------------------------------
create table public.poulette_households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger poulette_households_set_updated_at
  before update on public.poulette_households
  for each row execute function public.poulette_set_updated_at();


-- ---------------------------------------------------------------------
-- poulette_members : qui fait partie de quel foyer.
-- display_name = le nom affiché dans la timeline ("Rom", "Léa").
-- On n'ajoute / retire un membre que par les fonctions plus bas.
-- ---------------------------------------------------------------------
create table public.poulette_members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.poulette_households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) between 1 and 40),
  role          text not null default 'parent' check (role in ('parent', 'caregiver')),
  created_at    timestamptz not null default now(),
  unique (household_id, user_id)
);

create index poulette_members_user_idx on public.poulette_members (user_id);


-- ---------------------------------------------------------------------
-- poulette_babies : le bébé (un seul construit, plusieurs possibles).
-- ---------------------------------------------------------------------
create table public.poulette_babies (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.poulette_households (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 60),
  birth_date       date,
  birth_weight_g   integer check (birth_weight_g between 300 and 8000),
  birth_length_cm  numeric(4,1) check (birth_length_cm between 20 and 70),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index poulette_babies_household_idx on public.poulette_babies (household_id);

create trigger poulette_babies_set_updated_at
  before update on public.poulette_babies
  for each row execute function public.poulette_set_updated_at();


-- ---------------------------------------------------------------------
-- Qui suis-je ? Deux petites fonctions utilisées par tous les verrous.
-- "security definer" : elles lisent poulette_members sans repasser par
-- son propre verrou (sinon le verrou de members se demanderait lui-même
-- s'il peut se lire, en boucle). Elles ne renvoient que les foyers /
-- bébés de la personne connectée (auth.uid()), rien d'autre.
-- ---------------------------------------------------------------------
create or replace function public.poulette_my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.poulette_members where user_id = auth.uid();
$$;

create or replace function public.poulette_my_baby_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
    from public.poulette_babies b
    join public.poulette_members m on m.household_id = b.household_id
   where m.user_id = auth.uid();
$$;

revoke all on function public.poulette_my_household_ids() from public, anon;
revoke all on function public.poulette_my_baby_ids()      from public, anon;
grant execute on function public.poulette_my_household_ids() to authenticated;
grant execute on function public.poulette_my_baby_ids()      to authenticated;


-- ---------------------------------------------------------------------
-- poulette_events : tout ce qu'on logue (tétée, biberon, change...).
--   type  : clé définie dans rules.js. Volontairement SANS liste fermée
--           dans la base, pour que les types V2 (pleurs, soins...)
--           n'aient pas besoin d'une migration.
--   data  : le détail propre au type (voir poulette/CLAUDE.md).
--   deleted_at : suppression douce (la ligne reste, l'app la cache).
-- ---------------------------------------------------------------------
create table public.poulette_events (
  id          uuid primary key default gen_random_uuid(),
  baby_id     uuid not null references public.poulette_babies (id) on delete cascade,
  type        text not null check (type ~ '^[a-z_]{2,30}$'),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  note        text check (char_length(note) <= 2000),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create index poulette_events_baby_started_idx
  on public.poulette_events (baby_id, started_at desc);
create index poulette_events_baby_type_started_idx
  on public.poulette_events (baby_id, type, started_at desc);

create trigger poulette_events_set_updated_at
  before update on public.poulette_events
  for each row execute function public.poulette_set_updated_at();


-- ---------------------------------------------------------------------
-- poulette_measurements : poids / taille / périmètre crânien.
-- Au moins une des trois mesures doit être remplie.
-- ---------------------------------------------------------------------
create table public.poulette_measurements (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.poulette_babies (id) on delete cascade,
  measured_at  timestamptz not null default now(),
  weight_g     integer check (weight_g between 300 and 30000),
  length_cm    numeric(4,1) check (length_cm between 20 and 130),
  head_cm      numeric(4,1) check (head_cm between 20 and 60),
  source       text check (char_length(source) <= 60),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (weight_g is not null or length_cm is not null or head_cm is not null)
);

create index poulette_measurements_baby_idx
  on public.poulette_measurements (baby_id, measured_at desc);

create trigger poulette_measurements_set_updated_at
  before update on public.poulette_measurements
  for each row execute function public.poulette_set_updated_at();


-- ---------------------------------------------------------------------
-- poulette_questions : questions pour la pédiatre.
-- baby_id facultatif ; s'il est rempli, le bébé doit être du même foyer.
-- ---------------------------------------------------------------------
create table public.poulette_questions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.poulette_households (id) on delete cascade,
  baby_id       uuid references public.poulette_babies (id) on delete cascade,
  text          text not null check (length(trim(text)) between 1 and 1000),
  done_at       timestamptz,
  answer        text check (char_length(answer) <= 4000),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index poulette_questions_household_idx
  on public.poulette_questions (household_id, created_at desc);

create trigger poulette_questions_set_updated_at
  before update on public.poulette_questions
  for each row execute function public.poulette_set_updated_at();


-- ---------------------------------------------------------------------
-- Verrous (RLS).
--   foyer / membres : lecture seule pour les membres (ajouts par les
--                     fonctions plus bas) ; le nom du foyer est modifiable.
--   bébés, questions : tout, dans ses foyers.
--   events, mesures  : tout, pour les bébés de ses foyers.
-- Les visiteurs non connectés (anon) n'ont accès à rien.
-- ---------------------------------------------------------------------
alter table public.poulette_households enable row level security;
create policy "Members can read" on public.poulette_households
  for select to authenticated
  using (id in (select public.poulette_my_household_ids()));
create policy "Members can rename" on public.poulette_households
  for update to authenticated
  using (id in (select public.poulette_my_household_ids()))
  with check (id in (select public.poulette_my_household_ids()));
revoke all on public.poulette_households from anon;
grant select, update on public.poulette_households to authenticated;

alter table public.poulette_members enable row level security;
create policy "Members can read" on public.poulette_members
  for select to authenticated
  using (household_id in (select public.poulette_my_household_ids()));
revoke all on public.poulette_members from anon;
grant select on public.poulette_members to authenticated;

alter table public.poulette_babies enable row level security;
create policy "Members can do everything" on public.poulette_babies
  for all to authenticated
  using (household_id in (select public.poulette_my_household_ids()))
  with check (household_id in (select public.poulette_my_household_ids()));
revoke all on public.poulette_babies from anon;
grant select, insert, update, delete on public.poulette_babies to authenticated;

alter table public.poulette_events enable row level security;
create policy "Members can do everything" on public.poulette_events
  for all to authenticated
  using (baby_id in (select public.poulette_my_baby_ids()))
  with check (baby_id in (select public.poulette_my_baby_ids()));
revoke all on public.poulette_events from anon;
grant select, insert, update, delete on public.poulette_events to authenticated;

alter table public.poulette_measurements enable row level security;
create policy "Members can do everything" on public.poulette_measurements
  for all to authenticated
  using (baby_id in (select public.poulette_my_baby_ids()))
  with check (baby_id in (select public.poulette_my_baby_ids()));
revoke all on public.poulette_measurements from anon;
grant select, insert, update, delete on public.poulette_measurements to authenticated;

alter table public.poulette_questions enable row level security;
create policy "Members can do everything" on public.poulette_questions
  for all to authenticated
  using (household_id in (select public.poulette_my_household_ids()))
  with check (
    household_id in (select public.poulette_my_household_ids())
    and (baby_id is null or baby_id in (
      select b.id from public.poulette_babies b where b.household_id = poulette_questions.household_id))
  );
revoke all on public.poulette_questions from anon;
grant select, insert, update, delete on public.poulette_questions to authenticated;


-- ---------------------------------------------------------------------
-- Créer son foyer (étape 0.6) : crée le foyer ET vous en fait membre,
-- en une fois. Sans cette fonction, impossible de s'ajouter au premier
-- foyer (il faut être membre pour ajouter un membre).
-- Renvoie l'id du nouveau foyer.
-- ---------------------------------------------------------------------
create or replace function public.poulette_create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  insert into public.poulette_households (name) values (p_name) returning id into new_id;
  insert into public.poulette_members (household_id, user_id, display_name)
       values (new_id, auth.uid(), p_display_name);
  return new_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Ajouter un membre (Léa) : par son email. Son compte doit déjà exister
-- dans own-hq (créé à la main, les inscriptions sont fermées).
-- Seul un membre du foyer peut ajouter quelqu'un (un non-membre ne peut
-- donc pas s'en servir pour tester si un email a un compte).
-- ---------------------------------------------------------------------
create or replace function public.poulette_add_member(p_household_id uuid, p_email text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  new_id uuid;
begin
  if not exists (select 1 from public.poulette_members
                  where household_id = p_household_id and user_id = auth.uid()) then
    raise exception 'Pas membre de ce foyer';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email));
  if target is null then
    raise exception 'Aucun compte avec cet email (à créer d''abord dans Supabase)';
  end if;
  insert into public.poulette_members (household_id, user_id, display_name)
       values (p_household_id, target, p_display_name)
  on conflict (household_id, user_id) do update set display_name = excluded.display_name
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.poulette_create_household(text, text)   from public, anon;
revoke all on function public.poulette_add_member(uuid, text, text)   from public, anon;
grant execute on function public.poulette_create_household(text, text) to authenticated;
grant execute on function public.poulette_add_member(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- Temps réel : les deux téléphones reçoivent les changements de ces
-- trois tables (Supabase respecte les verrous ci-dessus pour l'envoi).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.poulette_events,
  public.poulette_measurements,
  public.poulette_questions;
