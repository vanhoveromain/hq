-- =====================================================================
-- PouletteHQ — rendez-vous pédiatre (Phase 2, 2026-11-16)
--
-- Projet own-hq. Ajout pur : une nouvelle table, rien d'existant n'est
-- touché (ni PouletteHQ, ni Sport HQ). À coller entier dans Supabase ->
-- SQL Editor -> Run (une seule fois).
--
-- Une ligne = un rendez-vous chez la pédiatre (bouton « RDV pédiatre
-- aujourd'hui » dans l'onglet Pédiatre). Le rapport s'en sert pour la
-- période « Depuis le dernier RDV » (choix de Rom : option B, à la main).
-- =====================================================================

create table public.poulette_appointments (
  id          uuid primary key default gen_random_uuid(),
  baby_id     uuid not null references public.poulette_babies (id) on delete cascade,
  held_on     date not null,
  note        text check (char_length(note) <= 2000),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index poulette_appointments_baby_idx on public.poulette_appointments (baby_id, held_on desc);

create trigger poulette_appointments_set_updated_at
  before update on public.poulette_appointments
  for each row execute function public.poulette_set_updated_at();

-- Même verrou que les saisies : tout, pour les bébés de ses foyers.
alter table public.poulette_appointments enable row level security;
create policy "Members can do everything" on public.poulette_appointments
  for all to authenticated
  using (baby_id in (select public.poulette_my_baby_ids()))
  with check (baby_id in (select public.poulette_my_baby_ids()));
revoke all on public.poulette_appointments from anon;
grant select, insert, update, delete on public.poulette_appointments to authenticated;

-- Temps réel : l'autre téléphone voit le RDV ajouté.
alter publication supabase_realtime add table public.poulette_appointments;
