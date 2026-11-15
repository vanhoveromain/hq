-- =====================================================================
-- HQ — qui a accès à quel HQ (étape PouletteHQ 0.4a, 2026-11-15)
--
-- S'exécute dans le projet Supabase partagé "own-hq". Ajout pur : une
-- nouvelle table, rien de Sport HQ ni de PouletteHQ n'est touché.
-- À coller entier dans Supabase -> SQL Editor -> Run (une seule fois).
--
-- Une ligne = "cette personne voit ce HQ" sur le portail ownhq.app et dans
-- le sélecteur de HQ. hq = l'identifiant court du HQ : qed, sport, work,
-- personal, poulette (et les suivants : aucune migration pour en ajouter).
--
-- Ça CACHE des cartes, ça ne protège pas les données : la protection reste
-- les verrous (RLS) de chaque HQ.
--
-- Gestion : à la main dans le SQL Editor, par exemple
--   insert into public.hq_access (user_id, hq)
--   select id, 'poulette' from auth.users where email = 'adresse@exemple.be';
-- L'app ne peut que LIRE ses propres lignes, jamais en ajouter.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sécurité, AVANT tout le reste : s'arrête si own-hq contient autre chose
-- qu'un seul compte (Rom), pour ne jamais donner tous les HQ à quelqu'un
-- d'autre (ex. compte de Léa créé trop tôt). Rien n'est alors créé : me
-- prévenir.
-- ---------------------------------------------------------------------
do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'own-hq contient % comptes au lieu d''un seul : rien n''a été fait',
      (select count(*) from auth.users);
  end if;
end;
$$;


create table public.hq_access (
  user_id     uuid not null references auth.users (id) on delete cascade,
  hq          text not null check (hq ~ '^[a-z0-9-]{2,30}$'),
  created_at  timestamptz not null default now(),
  primary key (user_id, hq)
);

alter table public.hq_access enable row level security;
create policy "Read your own access" on public.hq_access
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.hq_access from anon, authenticated;
grant select on public.hq_access to authenticated;


-- ---------------------------------------------------------------------
-- Remplissage initial : le compte existant (Rom) reçoit tous les HQ
-- (le contrôle tout en haut garantit qu'il n'y en a qu'un).
-- ---------------------------------------------------------------------
insert into public.hq_access (user_id, hq)
select u.id, h.hq
  from auth.users u
 cross join (values ('qed'), ('sport'), ('work'), ('personal'), ('poulette')) as h (hq);
