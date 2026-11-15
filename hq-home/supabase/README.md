# HQ (portail) — base de données

Objets partagés par tous les HQ, dans le projet Supabase **`own-hq`** (eu-west-3).
Ce dossier n'est pas publié sur ownhq.app (`.vercelignore`).

## hq_access (migration 20261115000002)
Qui voit quel HQ sur le portail et dans le sélecteur. Une ligne = une personne + un HQ (`qed`, `sport`, `work`,
`personal`, `poulette`…). Ça cache des cartes, ça ne protège pas les données (ce sont les verrous RLS de chaque HQ).

- L'app ne peut que lire ses propres lignes. Ajouts / retraits à la main dans le SQL Editor :
  ```sql
  insert into public.hq_access (user_id, hq)
  select id, 'poulette' from auth.users where email = 'adresse@exemple.be';

  delete from public.hq_access
   where hq = 'poulette' and user_id = (select id from auth.users where email = 'adresse@exemple.be');
  ```
- La migration s'arrête sans rien créer si own-hq contient plus d'un compte : à lancer **avant** de créer le
  compte de Léa.
