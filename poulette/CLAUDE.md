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
  (branche de travail, comme qed-preview). `hq-preview.ownhq.app` (projet hq-home) ajouté le 2026-11-15, sur la
  branche `claude/compassionate-davinci-whm0b2` (il n'existait pas dans Vercel malgré la doc QED HQ).
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
- **Marque** : tokens HQ (`hq-tokens.css`, `[data-hq="poulette"]`), Geist, `<hq-switcher current="poulette">`. Nom
  affiché « Poulette HQ » (avec espace, règle de la charte) ; `poulette` dans le code et les URL. Couleur **sarcelle
  `#3D7D78`** (light `#EBF4F3`, dark `#2A5B57` ; sombre : texte `#8FC7C0`, fond `#1E3331`). Symbole : **l'œuf**
  (`brand/logos/poulette-hq.svg`, propositions dans `poulette/design/symboles.html`). Choisis le 2026-11-15 ; ambre
  écarté (trop proche des couleurs de couche), corail et lune/berceau écartés.

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
| `breastfeed` | ponctuel (**pas de chrono**, Rom 2026-11-15) | `{ sides: ["L"] \| ["R"] \| ["L","R"] \| ["R","L"] (ordre), minutes?: int }` (durée facultative ; ancien format `segments` encore lu) |
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
    2026-11-15, lancée dans own-hq 2026-11-15 (Success). Une ligne = une personne voit un HQ ; lecture de ses lignes
    seulement, gestion au SQL Editor. Remplit Rom avec tous les HQ ; s'arrête sans rien créer si own-hq a plus d'un
    compte (→ lancée avant le compte de Léa)
  - 0.4b portail + sélecteur filtrés — construit 2026-11-15 (hq-home/auth.js `listMyHqs()`, home.js, switcher.js).
    Portail : cartes cachées tant que la liste n'est pas connue ; un seul HQ ouvrable → redirection ; aucun → « No HQ
    is open for this account yet. » ; dernière liste mémorisée par compte sur l'appareil (localStorage
    `hq.access.<user id>`) ; inconnue (hors-ligne, rien en mémoire) → toutes les cartes. Sélecteur : même filtre (le HQ
    courant reste) ; un seul HQ → nom + symbole, sans menu. Testé avec un faux Supabase (Playwright). La carte
    PouletteHQ arrive à la 0.5 : d'ici là, Léa voit « No HQ is open… »
  - 0.4c compte Léa (Supabase → Add user) + `hq_access` poulette — fait 2026-11-15. Vérifié en vrai sur hq-preview
    (fenêtre privée) : Léa n'a que poulette, aucune carte (« No HQ is open… »), Sport HQ vide (RLS OK). Rom : 4 cartes.
    Tant que la 0.4 n'est pas sur main, le vrai ownhq.app montre encore toutes les cartes : ne pas donner l'adresse à Léa
- 0.5 Coquille de l'app : login, PWA (manifest, service worker, sombre), projet Vercel + domaines
  - 0.5a Identité — faite 2026-11-15 : symbole + icônes (`brand/export.mjs` → `poulette/icons/`, `hq-home/`), tokens
    (copiés dans les 4 apps), carte sur le portail + entrée dans le sélecteur (lien vers poulette.ownhq.app, vivant à
    la 0.5d). Léa est désormais redirigée vers Poulette HQ par le portail
  - 0.5b Coquille — construite 2026-11-15 : index.html (FR, `data-theme="dark"` + petit script dans <head> : thème
    choisi dans Réglages, `localStorage poulette.theme` = dark / light / auto, cet appareil), css/app.css (cibles
    >= 48 px, texte 17 px, largeur 640 px), js/hqBase.js (preview → hq-preview), js/storage.js (client own-hq
    d'auth.js ; `getMyHousehold()` = membre + foyer + bébés, null si aucun foyer), js/main.js (hash router, 5 onglets
    en bas : Accueil, Journal, Suivi, Pédiatre, Réglages ; sans foyer → écran Bienvenue, seul Réglages reste ; erreur
    de chargement → Réessayer), views/placeholders.js (écrans Phase 1/2 annoncés), views/reglages.js (compte, thème,
    Se déconnecter → login hq). serve.py port 8002. Testé avec un faux Supabase (Playwright, iPhone 13)
  - 0.5c PWA — construite 2026-11-15 : manifest.webmanifest (FR, standalone, portrait, fond #171819, icônes 192/512
    + maskable 512 via brand/export.mjs), metas iPhone, vercel.json (sw.js + manifest jamais en cache HTTP). sw.js :
    app + login/sélecteur hq = réseau d'abord (3 s max) puis copie locale ; supabase-js (jsDelivr, version figée) =
    cache d'abord ; la base (supabase.co) jamais mise en cache par le SW. main.js envoie au SW les scripts d'autres
    sites chargés avant qu'il prenne la main (sinon la 1re ouverture hors-ligne échoue). Changer les règles du SW =
    monter VERSION. Hors-ligne : login enregistré sur l'appareil accepté si le serveur est injoignable
    (storage.requireLogin, cookies hq-auth.*) ; foyer : dernière réponse gardée (localStorage poulette.home.<id>) ;
    badge « Hors ligne » en haut. Testé (Playwright) : 1re visite en ligne puis hors-ligne → l'app s'ouvre. Testé par Rom
    sur téléphone 2026-11-15 : installation, ouverture depuis l'icône, mode avion → OK. Ignored Build Step (main) mis
    sur poulette-hq
  - 0.5d Projet Vercel `poulette-hq` — fait 2026-11-15 : Root Directory `poulette` tapé à la main (Settings → Build and
    Deployment ; le sélecteur ne montre que les dossiers de main), `poulette-preview.ownhq.app` sur la branche de
    travail, testé (Bienvenue + Version de test + sélecteur). **Vercel Authentication désactivée** sur les projets
    poulette ET hq-home : sinon `hq-preview.ownhq.app/auth.js` répond 302 (login Vercel) à l'import cross-origin et
    l'app reste sur « Chargement… ». `poulette.ownhq.app` (production) à ajouter à la mise en ligne seulement (main
    n'a pas encore le dossier)
- 0.6 Household + profil bébé + ajout de Léa comme membre — construit 2026-11-15 (pas de migration) :
  views/welcome.js (sans foyer : nom du foyer, ton prénom, bébé « Poulette » par défaut + date facultative ; note
  « si ton/ta partenaire a déjà créé le foyer, ne crée rien ») → `poulette_create_household` puis le bébé (si le bébé
  échoue, le foyer reste et le bébé s'ajoute dans Réglages : jamais de 2e foyer). Réglages : Foyer (membres, « toi »,
  Ajouter un membre par email → `poulette_add_member` ; compte own-hq + accès poulette à créer avant), Bébé (prénom,
  naissance, poids g, taille cm ; Enregistrer sans redessiner la page), Compte, thème, Se déconnecter.
  storage.js : createHousehold, listMembers, addMember, createBaby, updateBaby, friendlyError (messages FR).
  Testé avec un faux Supabase. Boutons : survol seulement à la souris (pas de couleur collée après un tap).
  Testé en vrai 2026-11-15 : Rom crée le foyer, ajoute Léa ; Léa arrive sur l'Accueil et voit le même foyer + bébé.
  **Phase 0 terminée le 2026-11-15.**
  Piège Vercel : il arrive qu'un push sur la branche ne soit pas déployé (ancienne version affichée) → Deployments →
  ⋯ → Create Deployment avec le nom de la branche.

**À la mise en ligne (fusion dans main)** : retirer l'« Ignored Build Step » du projet Vercel poulette-hq AVANT la
fusion (il saute main ; remplacé par `ignoreCommand` dans poulette/vercel.json, comme qed et hq-home : on ne
construit que si le dossier a changé dans le dernier commit → fusionner dans main avec un commit de fusion, --no-ff) ;
ajouter le domaine `poulette.ownhq.app` (Production) ; vérifier ownhq.app (cartes filtrées, Léa redirigée) ;
corriger test-qed.sh (branche par défaut) et la doc QED HQ sur hq-preview.

**Phase 1 — MVP (mi-janvier 2027)** — construite d'un bloc le 2026-11-15 (Rom : « fais tout 1 et puis on check »),
testée de bout en bout avec un faux Supabase (2 utilisateurs, hors-ligne, refus, export) ; à vérifier par Rom + Léa :
- 1.1 `js/store.js` (ce que les écrans montrent = copie serveur + boîte d'envoi appliquée par-dessus ; envoi dans
  l'ordre ; refus définitif (droits, valeur) = « ⚠ refusée » dans la barre du haut, Réessayer / Abandonner, jamais
  de perte silencieuse ; pas de réseau = « ⏳ n en attente », renvoi au retour du réseau + toutes les 30 s), `js/queue.js`
  (boîte d'envoi IndexedDB, mémoire si indisponible). **Toutes** les écritures passent par la boîte d'envoi, y compris
  modifs et suppressions (arrêter un chrono sans réseau la nuit = une modif) : dernier envoyé gagne, sans gestion
  fine des conflits (niveau 3 complet toujours V2). Ids créés sur le téléphone ; insert déjà présent (23505) = OK ;
  update qui ne touche aucune ligne = refus. Copie locale des 3 derniers jours + mesures + questions
  (localStorage `poulette.cache.<bébé>`). `js/rules.js` : types, listes, prochain sein, résumés, durées.
- 1.2 Accueil (`views/home.js`) : chronos en cours en haut (tétée : côté, chrono du côté, total, « Côté G/D », Stop ;
  sommeil : Réveil), 4 cartes (dernière tétée + « Prochain : … », biberon, change, dernier sommeil fini), compteurs du
  jour, 6 gros boutons + Plus. **Retour de Rom 2026-11-15 : plus de Sommeil** (type gardé pour les anciennes saisies,
  proposé nulle part) ; **bouton « Question pédiatre » sur l'Accueil** + carte « Questions pédiatre · n à poser »
  (→ onglet Pédiatre) à la place de la carte Sommeil ; Plus = Température, Médicament, Mesure. Saisies dans `views/actions.js`. Change = 2 taps (Change → Pipi / Caca / Les deux,
  enregistré tout de suite). Après chaque saisie : le « reçu » en bas (−5 / −15 / −30 min, Modifier, Annuler ;
  couleur + texture si caca), disparaît seul après 12 s. Couleurs de caca : 6 des cartes de selles pédiatriques (noir
  méconium, vert, jaune, brun, pâle/blanc, rouge), toujours avec leur nom ; textures : liquide, grumeleuse, pâteuse,
  moulée (choix de Claude, à valider)
- 1.3 Tétée = 2 taps (Tétée → Gauche / Droite / Gauche puis droite / Droite puis gauche ; côté suggéré encadré),
  **sans chrono** (retour de Rom 2026-11-15 : le but est de savoir quel sein) ; durée facultative sur le reçu (5 / 10 /
  15 / 20 / 30 min, re-tap = aucune, + champ libre « autre » 1 à 180 min, Rom 2026-11-15) ou dans Modifier. Prochain sein = opposé du dernier sein de la dernière tétée.
  Le reçu a un gros bouton « ✓ OK » (retour de Rom : il manquait un bouton pour valider). 1.4 Biberon (+10 / +30 / −10, dernier volume et lait repris),
  Tirage. 1.5 Sommeil = 1 tap (chrono), Régurgitation (type + taille = 2 taps), Plus : Température (±0,1 / ±0,5,
  dernière valeur), Médicament (déjà donnés en puces : un tap = enregistré), Mesure, Question
- 1.6 `views/editor.js` : tout modifier (heure, fin, détails, note), Supprimer (2e tap = confirmer ; suppression douce)
- 1.7 Journal (`views/journal.js`) : jour par jour, heures, plus récent en haut, qui a saisi, ⏳ / ⚠. **Plus complet
  (Rom 2026-11-15, a choisi les 4 options)** : Jour | Semaine. Jour = cartes résumé (tétées + G/D + durée moyenne,
  ml biberon, intervalle moyen et max entre 2 repas (tétées + biberons), couches mouillées / sales ; tirage,
  régurgitations, température max, médicaments s'il y en a), frise de 24 h (une ligne par type, un point par saisie,
  couleur unique + libellé de ligne, tap = modifier, trait = maintenant), filtres (Tout, Tétées, Biberons, Changes,
  Tirages, Régurg., Autres, avec leur nombre), puis la liste. Semaine = 7 jours jusqu'au jour choisi (‹ › = ±7 j),
  un petit graphique en barres par mesure (tétées, ml, mouillées, sales, intervalle moyen ; tap = valeur du jour,
  sinon moyenne / jour) + le tableau des mêmes chiffres (tap sur un jour = l'ouvrir). Calculs dans rules.js
  (daySummary, WEEK_METRICS, JOURNAL_FILTERS, STRIP_LANES)
- 1.8 Temps réel : `subscribeChanges` (storage.js) sur events / mesures (filtre bébé) / questions (filtre foyer) ;
  rattrapage complet à la reconnexion et au retour dans l'app. Supabase ne filtre pas les suppressions réelles
  (mesures, questions) : elles arrivent au plus tard au prochain rafraîchissement
- 1.9 Suivi (`views/suivi.js`) : mesures + source, graphique du poids (une courbe, 1 unité = 1 px, valeur au toucher),
  écart au poids de naissance (g et %). 1.10 Pédiatre : questions (ajout, coche, réponse). 1.11 Export CSV (;, BOM,
  Excel) + JSON dans Réglages
- 1.12 Recette par Rom (retours intégrés : OK sur le reçu, tétée sans chrono + durée libre, pas de sommeil, question
  pédiatre sur l'Accueil, Journal complet) ; données de test effacées (SQL) ; **mise en ligne 2026-11-15** (commit de
  fusion c2bab24 sur main, publié le 2026-11-16 après la limite quotidienne de Vercel). **Phase 1 terminée.**
 : accueil, saisies (tétée, biberon, change, sommeil, tirage, régurgitation,
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
