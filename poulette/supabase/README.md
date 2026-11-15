# PouletteHQ — base de données

PouletteHQ vit dans le projet Supabase partagé **`own-hq`** (eu-west-3, Paris), à côté de Sport HQ.
Toutes ses tables sont préfixées `poulette_` ; chaque migration est un ajout pur qui ne touche pas Sport HQ.

Changements de schéma uniquement via les fichiers de `migrations/`, lancés dans l'ordre dans
Supabase → own-hq → SQL Editor. Une seule base sert au test et au live : chaque migration est signalée avant.

## Migration 20261115000001 (étape 0.3)
1. SQL Editor → New query → coller tout `migrations/20261115000001_init_schema.sql` → Run. Attendu : « Success ».
2. Vérifier :
   - Table Editor : `poulette_households`, `poulette_members`, `poulette_babies`, `poulette_events`,
     `poulette_measurements`, `poulette_questions`, chacune « RLS enabled ».
   - Database → Publications → `supabase_realtime` : contient `poulette_events`, `poulette_measurements`,
     `poulette_questions`.
   - Sport HQ fonctionne toujours (ouvrir sport.ownhq.app).

## Ce qu'il y a dans la base
| Table | Contient |
|---|---|
| `poulette_households` | Le foyer |
| `poulette_members` | Qui est dans quel foyer, et son nom affiché (Rom, Léa) |
| `poulette_babies` | Le bébé et ses données de naissance |
| `poulette_events` | Tout ce qu'on logue (type + détail en JSON), suppression douce |
| `poulette_measurements` | Poids, taille, périmètre crânien |
| `poulette_questions` | Questions pour la pédiatre |

- Verrous : on ne voit et ne modifie que les lignes de ses foyers ; aucun accès pour les visiteurs non connectés.
- `poulette_create_household(nom, ton_nom)` : crée le foyer et t'en fait membre.
- `poulette_add_member(foyer, email, nom)` : ajoute un compte existant d'own-hq (Léa) au foyer ; réservé aux membres.
