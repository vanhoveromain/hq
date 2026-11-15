# PouletteHQ — suivi du nouveau-né (v1)

Module de l'écosystème HQ (ownhq.app) pour suivre les repas, changes, sommeil et santé du bébé, et produire
des infos concrètes pour la pédiatre. Spec d'origine : « BabyHQ — Spécification » (2026-11-15), renommée
PouletteHQ ; ce fichier la remplace et intègre les décisions.

## Contexte
- Utilisateurs : 2 parents, Rom + Léa, données partagées en temps réel.
- Naissance prévue : février 2027. **MVP stable et testé : mi-janvier 2027.**
- Usage type : la nuit, à une main, bébé dans les bras, fatigué.
- Langue : interface et docs en **français** ; code, noms de tables et de colonnes en anglais (comme le reste du repo).
- Données de santé d'un enfant : jamais de vraies données dans git, jamais dans les logs.

## Décisions (2026-11-15)
- **Stack** : celle du repo (voir sporthq3/CLAUDE.md, qed/CLAUDE.md). HTML/CSS/JS vanilla, modules ES, pas de
  framework, pas de build. supabase-js via CDN (version figée). Tout accès Supabase passe par `js/storage.js` ;
  les règles (suggestion de sein, calculs du rapport…) vivent dans `js/rules.js`, jamais dans le code des écrans.
- **Supabase** : le projet partagé **`own-hq`** (ex « Sport HQ », renommé 2026-11-15 ; région eu-west-3 Paris).
  Pas de projet dédié : le plan gratuit est limité à 2 projets et d'autres HQ arrivent (Personal HQ, Work HQ…).
  Règle pour tous les HQ : regrouper par niveau de sensibilité, pas par app → `own-hq` = tous les HQ personnels,
  projet QED = QED HQ seul (données client).
- **Tables préfixées `poulette_`**, RLS sur chaque table. Changements de schéma uniquement via
  `supabase/migrations/`, toujours signalés avant d'être lancés (une seule base pour test et live).
- **Adresse** : `poulette.ownhq.app` (projet Vercel, racine `poulette/`) ; test : `poulette-preview.ownhq.app`
  (branche de travail, comme qed-preview).
- **Login** : le login partagé ownhq.app (`requireLogin()` de `https://ownhq.app/auth.js`). Léa a un compte dans
  `own-hq`, créé à la main (inscriptions fermées).
- **Accès par personne** : le portail ownhq.app et le `<hq-switcher>` n'affichent que les HQ auxquels la personne
  connectée a accès ; un seul HQ → redirection directe. Léa arrive donc droit sur PouletteHQ. Mécanisme à
  concevoir à l'étape 0.4 (servira aux futurs HQ partagés).
- **Hors-ligne** : niveau 2 dans le MVP = l'app s'ouvre sans réseau (service worker), les **nouvelles saisies** vont
  dans une file locale (IndexedDB) envoyée au retour du réseau, badge « n saisies en attente », jamais de perte
  silencieuse. Niveau 3 (modifs/suppressions hors-ligne + conflits last-write-wins sur `updated_at`) en V2.
  Nouveau dans le repo : aucune app HQ n'a encore de service worker.
- **Sauvegarde** : le plan gratuit n'a pas de sauvegarde automatique téléchargeable → export JSON + CSV dans
  Réglages (sur le modèle de l'export Sport HQ), à ranger régulièrement dans Dropbox. Plan payant à reconsidérer
  plus tard pour `own-hq` entier.
- **Mode sombre forcé par défaut** (les tokens HQ suivent le téléphone : à surcharger).
- **Marque** : tokens HQ (`hq-tokens.css`), Geist, `<hq-switcher current="poulette">`. Logo produit
  « PouletteHQ » à créer dans `brand/`.

## Principes UX (non négociables)
1. Chaque saisie courante en **2 taps maximum**.
2. **Gros boutons**, utilisables à une main, lisibles dans le noir.
3. **Horodatage auto** (« maintenant »), modifiable après coup (raccourcis -5, -15, -30 min, ou heure manuelle).
4. Aucune saisie texte obligatoire ; les champs texte sont toujours optionnels.
5. **6 à 8 actions rapides** max sur l'accueil ; le reste derrière « Plus ».
6. Synchro temps réel entre les deux téléphones (< 2 s).

## Modèle de données
Rien n'est lié à un `user_id` seul : tout passe par un household.

```
poulette_households   (id, name, created_at)
poulette_members      (id, household_id, user_id, display_name, role, created_at)
poulette_babies       (id, household_id, name, birth_date, birth_weight_g, birth_length_cm, created_at)
poulette_events       (id, baby_id, type, started_at, ended_at NULL, data JSONB, note TEXT NULL,
                       created_by, created_at, updated_at, deleted_at NULL)
poulette_measurements (id, baby_id, measured_at, weight_g NULL, length_cm NULL, head_cm NULL,
                       source TEXT NULL, created_by, created_at)
poulette_questions    (id, household_id, baby_id, text, created_at, done_at NULL, answer TEXT NULL, created_by)
```
- RLS : on ne voit/modifie que les lignes des households dont on est membre.
- Soft delete (`deleted_at`) sur `poulette_events`.
- Index : `events(baby_id, started_at desc)`, `events(baby_id, type, started_at desc)`.
- Realtime activé sur events, measurements, questions.
- Multi-bébés / multi-households / commercialisation : possibles dans le modèle, pas construits.

### Types d'événements (`type`) et `data`
| type | début/fin | data |
|---|---|---|
| `breastfeed` | début + fin (chrono) | `{ segments: [{ side: "L"\|"R", start, end }] }` (changement de sein en cours) |
| `bottle` | ponctuel | `{ ml: int, milk: "breast"\|"formula" }` |
| `pump` | ponctuel ou durée | `{ side: "L"\|"R"\|"both", ml: int }` |
| `diaper` | ponctuel | `{ pee: bool, poop: bool, poop_color?: enum, poop_texture?: enum }` |
| `sleep` | début + fin | `{}` |
| `spit_up` | ponctuel | `{ kind: "spit_up"\|"vomit", size: "small"\|"large"\|"projectile" }` |
| `temperature` | ponctuel | `{ celsius: number }` |
| `medication` | ponctuel | `{ name: string, dose: string }` (noms favoris réutilisables) |
| V2 `crying` | début + fin | `{ soothed_by?: string }` |
| V2 `symptom` | ponctuel | `{ kind: string, photo_path?: string }` (photos : bucket privé EU) |
| V2 `care` | ponctuel | `{ kind: "bath"\|"cord_fell"\|"other" }` |
| V2 `vaccine` | ponctuel | `{ name: string }` |
| V2 `milestone` | ponctuel | `{ label: string }` |
| Phase 4 `solid` | ponctuel | `{ foods: string[], amount?: string, reaction?: string }` |

## Écrans
- **Accueil « État actuel »** : dernière tétée (il y a X h Y min, côté(s), **prochain sein suggéré** = opposé du
  dernier segment) ; dernier biberon, dernier change, sommeil en cours. Chrono tétée/sommeil en cours affiché en
  haut avec Stop. Actions rapides : Tétée, Biberon, Change, Sommeil, Tirage, Régurgitation, Plus (température,
  médicament, mesure, question, types V2).
- **Saisies** : Tétée (G / D → chrono, « changer de côté », Stop) · Biberon (+10 / +30 / -10 ml, total, type de lait,
  valider) · Change (toggles pipi / caca, valider ; couleur + texture optionnelles si caca) · Sommeil (start/stop).
  Toutes : correction de l'heure + note optionnelle.
- **Timeline** : jour par jour, groupée par heure ; tap = éditer / supprimer ; affiche qui a saisi.
- **Rapport pédiatre** (Phase 2) : 24 h / 7 j / depuis le dernier RDV / dates libres. Tétées par 24 h, durée moyenne,
  répartition G/D ; ml de biberon par jour ; intervalle moyen entre repas ; couches mouillées/sales par jour ;
  sommeil par 24 h ; régurgitations, température, médicaments ; dernières mesures + poids depuis la naissance ;
  questions ouvertes. Mode consultation épuré + export PDF.
- **Mesures** : poids / taille / périmètre crânien + source (maternité, sage-femme, ONE / Kind en Gezin, pédiatre).
  Liste + graphique du poids, écart au poids de naissance.
- **Questions pour la pédiatre** : ajout en 1 champ, liste à cocher pendant le RDV, réponse optionnelle.
- **Réglages** : profil du bébé, membres du household, export JSON + CSV. Médicaments favoris = déduits de
  l'historique (noms + doses déjà saisis proposés en premier), pas de table (décidé 2026-11-15).

## Hors périmètre
Aucun conseil médical ni alerte automatique sur seuils : l'app enregistre et résume, elle n'interprète pas.

## Critères d'acceptation MVP
- [ ] Rom et Léa voient les mêmes données ; une saisie apparaît sur l'autre téléphone en < 2 s.
- [ ] Loguer un change ou démarrer une tétée : 2 taps depuis l'accueil.
- [ ] Suggestion de sein correcte après une tétée sur deux côtés.
- [ ] Un chrono en cours survit à la fermeture de l'app et au rechargement.
- [ ] Toute saisie est éditable (heure incluse) et supprimable.
- [ ] Un utilisateur hors du household ne peut rien lire (RLS testée).
- [ ] Une saisie hors-ligne n'est jamais perdue silencieusement.
- [ ] Installable sur iOS et Android, utilisable en mode sombre.

## Étapes
**Phase 0 — Fondations**
- 0.1 Lecture du repo HQ — fait 2026-11-15
- 0.2 Décisions (Supabase, adresse, hors-ligne, accès Léa) — fait 2026-11-15
- 0.3 Migration : tables `poulette_*`, RLS, index, realtime — écrite et testée en local 2026-11-15
  (migration 20261115000001 ; RLS testée : Léa voit tout, un compte hors foyer ne voit et n'écrit rien, anon
  rien). Ajouts : `updated_at` sur toutes les tables modifiables, ids fournis par l'app (renvoi hors-ligne
  sans doublon), fonctions `poulette_create_household` / `poulette_add_member` (par email). À lancer dans own-hq
  (voir supabase/README.md) — lancée dans own-hq 2026-11-15 (Success)
- 0.4 Accès par personne : portail + switcher selon les HQ accessibles ; compte Léa
  - 0.4a table `hq_access` (own-hq, `hq-home/supabase/migrations/20261115000002`) — écrite et testée en local
    2026-11-15. Une ligne = une personne voit un HQ ; lecture de ses lignes seulement, gestion au SQL Editor. Remplit
    Rom avec tous les HQ ; s'arrête sans rien créer si own-hq a plus d'un compte (→ à lancer avant le compte de Léa)
  - 0.4b portail + sélecteur filtrés, un seul HQ → redirection ; cache local si réseau KO ; carte Poulette à la 0.5
  - 0.4c compte Léa (Supabase → Add user) + `hq_access` poulette, vérification
- 0.5 Coquille de l'app : login, PWA (manifest, service worker, sombre), projet Vercel + domaines
- 0.6 Household + profil bébé + ajout de Léa comme membre

**Phase 1 — MVP (mi-janvier 2027)** : accueil, saisies (tétée, biberon, change, sommeil, tirage, régurgitation,
température, médicament), timeline, mesures, questions, realtime, hors-ligne niveau 2, export.

**Phase 2 — Rapport** : rapport pédiatre + mode consultation + PDF (idéalement avant la naissance).

**Phase 3 — V2 (après la naissance)** : types V2, hors-ligne niveau 3, graphiques de tendance, rappels (vitamines).

**Phase 4 — Diversification (4–6 mois)** : type `solid`, aliments introduits, réactions.

## Points ouverts
- Couleurs / textures de caca (4 à 6 pastilles max) — à fixer en Phase 1.
- Mécanisme « HQ accessibles par personne » — table `hq_access` (0.4a).

## Comment on travaille
- Une étape à la fois ; Rom teste chaque étape avant la suivante.
- Migrations signalées avant d'être lancées, compatibles avec l'existant (`own-hq` porte aussi Sport HQ).
- Expliquer simplement, demander plutôt que supposer, signaler les failles.
