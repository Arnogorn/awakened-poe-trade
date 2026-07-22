# PROJECT_CONTEXT.md — AwakenedPOETradeFR

> **Fichier de mémoire persistante du projet.**
> À lire EN PRIORITÉ au début de chaque session (Jarvis / Claude Code / dev humain).
> À mettre à jour après chaque étape majeure terminée.

---

## 1. Résumé du projet

**AwakenedPOETradeFR** est un fork de [Awakened PoE Trade](https://github.com/SnosMe/awakened-poe-trade) (licence MIT), l'outil communautaire open source de référence pour le price-check dans Path of Exile (overlay Electron qui analyse les objets copiés dans le presse-papier et interroge le site d'échange officiel).

**Objectif** : ajouter une vraie localisation française à l'application, en deux temps :
1. **Interface entièrement traduite en français** (terminé).
2. **Parsing des objets copiés depuis un client Path of Exile configuré en français** (à venir — c'est la partie qui rend l'app réellement utilisable pour un joueur FR, pas seulement l'étape 1).

**Finalité** : une fois la localisation aboutie et testée, proposer une Pull Request au mainteneur original (SnosMe) pour intégrer le support français à l'application officielle. Aucune PR ne sera ouverte sans validation explicite d'Arnaud.

---

## 2. Stack technique

- **Electron** — deux sous-projets qui dépendent l'un de l'autre et ne tournent jamais seuls :
  - `renderer/` : UI Vue 3 + TypeScript + Vite + vue-i18n, buildée en HTML/JS statique
  - `main/` : process Electron (TypeScript, esbuild), gère hotkeys, overlay, fenêtre, OCR (Tesseract)
- **Build** : `npm` (pas `yarn`, malgré ce qu'indique DEVELOPING.md qui est daté — la CI GitHub Actions réelle utilise `npm ci`/`npm run build`)
- **i18n** : `vue-i18n`, chargement dynamique des messages par langue depuis `renderer/public/data/<lang>/app_i18n.json`

---

## 3. Architecture — ce qu'il faut savoir avant de toucher au langage

### Le réglage `language` pilote DEUX pipelines différents, pas un seul

C'est le point le plus important à comprendre sur ce repo :

1. **UI i18n** (`renderer/src/web/i18n.ts`) : charge `data/<lang>/app_i18n.json`, complètement indépendant du contenu du jeu. C'est ce qu'on a traduit à l'étape 1.
2. **Données de parsing d'objets** (`renderer/src/assets/data/index.ts`, fonction `loadForLang`) : charge `data/<lang>/client_strings.js`, `items.ndjson`, `stats.ndjson` + leurs index `.bin` générés par `make-index-files.mjs`. C'est ce moteur qui reconnaît le texte d'un objet copié en jeu (noms de types de base, libellés de stats, etc.) — c'est la vraie « étape 2 ».

`main.ts` appelle les deux avec la **même** valeur de `AppConfig().language` :
```ts
await I18n.init(AppConfig().language)
await Data.init(AppConfig().language)
watch(() => AppConfig().language, async () => {
  await Data.loadForLang(AppConfig().language)
  await I18n.loadLang(AppConfig().language)
})
```
Donc on ne peut pas ajouter une langue au menu déroulant sans que `Data.loadForLang` tente de charger ses fichiers `items.ndjson`/`stats.ndjson` — sinon 404 et price-check cassé.

### Fichiers non générés vs générés

- `app_i18n.json`, `client_strings.js`, `items.ndjson`, `stats.ndjson` : fichiers sources, **committés** dans le repo (vérifié en comparant avec `en/` via `git ls-files`).
- `*.index.bin` (`items-name.index.bin`, `items-ref.index.bin`, `stats-ref.index.bin`, `stats-matcher.index.bin`) : générés localement par `npm run make-index-files` (dans `renderer/`), **jamais committés**, même pour `en`. Confirmé en vérifiant que `.gitignore` ne les exclut pas explicitement mais qu'ils n'apparaissent pas dans `git ls-files` — c'est une étape de build, pas un artefact versionné.

### Langues gérées ailleurs dans le code (à mettre à jour à chaque nouvelle langue)

Quand on ajoute une langue au type `Config['language']` (`renderer/src/web/Config.ts`), TypeScript oblige à couvrir tous les endroits qui indexent un objet par cette union :
- `Config.ts` → `poeWebApi()` (switch sur le domaine du site d'échange à interroger)
- `renderer/src/web/item-check/hotkeyable-actions.ts` → `POEDB_LANGS` (lien externe vers PoEDB)
- `renderer/src/web/client-log/client-log.ts` → `TRADE_BULK_WHISPER` (regex de reconnaissance des messages d'échange en jeu ; `TRADE_WHISPER`, juste au-dessus, avait déjà une regex `fr` fournie par upstream avant même qu'on ajoute la langue)
- `renderer/src/assets/make-index-files.mjs` → `LANGUAGES` (génération des index de données)
- `renderer/src/web/settings/general.vue` → option du menu déroulant

---

## 4. Décisions actées

- **Étape 1 = UI uniquement, ne pas casser le price-check en attendant l'étape 2.** Plutôt que d'ajouter une logique de fallback dans `loadForLang` (ce qui aurait modifié le fonctionnement existant du code), on a **dupliqué tel quel** `client_strings.js`, `items.ndjson`, `stats.ndjson` de `en/` vers `fr/`, et ajouté `'fr'` à `LANGUAGES` dans `make-index-files.mjs`. Le code de chargement des données n'a **pas été touché** : `fr` est traité exactement comme n'importe quelle autre langue qui a ses fichiers. Le contenu de ces fichiers reste en anglais en interne jusqu'à l'étape 2, qui les remplacera par les vraies données françaises.
- **Convention de code à respecter strictement : pas de commentaires ajoutés qui ne matchent pas le style existant du fichier.** Le repo original n'a quasiment aucun commentaire ; là où une entrée manque encore une vraie traduction (ex. `TRADE_BULK_WHISPER['fr']`), on suit la convention déjà utilisée par upstream pour `'ko'` : une regex placeholder `/^_FIX_ME_$/`, pas de commentaire explicatif.
- **`app_i18n.json` fr traduit intégralement** (312 clés, parité vérifiée programmatiquement avec `en/app_i18n.json` — aucune clé manquante ni en trop).
- **Termes de lore PoE non vérifiés officiellement**, traduits au meilleur effort mais à corriger par Arnaud avec son client PoE FR avant toute PR : `Shaper`, `Elder`, `Crusader` (Croisé), `Hunter` (Chasseur), `Redeemer` (Rédemptrice), `Warlord` (Seigneur de guerre), `Blighted`, `Blight-ravaged`, `heist` (casse). À l'inverse, `Anomalous` (anormale) / `Divergent` (divergente) / `Phantasmal` (fantasmatique) ont été confirmés via une annonce officielle GGG en français (fr.pathofexile.com/forum/view-thread/3009541).
- **PoEDB n'a pas de version française** : `POEDB_LANGS['fr']` retombe sur `'us'` (comme dans le domaine par défaut).
- **`poeWebApi()` pour `fr`** : retourne `www.pathofexile.com`, comme `en` — la France n'a pas de domaine de trade séparé (contrairement à `ru`/`cmn-Hant`/`ko`).

---

## 5. Workflow Jarvis / git

- **Remotes** : `origin` = fork perso (`https://github.com/Arnogorn/awakened-poe-trade`), `upstream` = dépôt original (`https://github.com/SnosMe/awakened-poe-trade`). On travaille et on pousse uniquement sur `origin` / `master`. **Ne jamais pousser sur `upstream`**, et ne jamais ouvrir de PR vers le repo original sans validation explicite d'Arnaud.
- **Avant de committer** : vérifier que `renderer` ET `main` buildent (`npm run build` dans chacun) et que `npm run lint` (dans `renderer`) ne remonte pas de nouvelle erreur.
- **Début de chaque session** : lire ce fichier en priorité.
- **Après chaque étape terminée** : mettre à jour la section « État actuel » ci-dessous, committer (le fichier lui-même est versionné et pushé avec le code).

---

## 6. Ordre de construction (étapes)

1. **Mise en place du repo + build vérifié** (fait).
2. **Localisation UI complète** (`app_i18n.json` fr + câblage settings) (fait).
3. **Parser d'objets fr** : ajouter les vraies données `client_strings.js`/`items.ndjson`/`stats.ndjson` en français, pour que le price-check reconnaisse un objet copié depuis un client PoE en français. **En cours — pipeline de génération écrit et exécuté une première fois, résultats en attente de vérification par Arnaud avec son client réel. Détail complet en section 9.**
4. **Tests réels en jeu** + itérations sur les termes de traduction incertains (cf. section 4).
5. **Proposition de PR au mainteneur original**, seulement quand Arnaud le décide.

---

## 7. ÉTAT ACTUEL

> Section à mettre à jour après chaque session.

- **Étape en cours** : étape 3 (parser d'objets fr), **validée en jeu avec le client PoE FR réel d'Arnaud le 2026-07-21**. La quasi-totalité des points de la liste 9.5 étaient en fait déductibles directement des données du jeu (accords grammaticaux via les templates `<if:MS>` de `ClientStrings`, passifs via la table `PassiveSkills`, gemmes transfigurées via `GemEffects`, niveau des gemmes via `BaseItemTypes`) — aucun n'a nécessité de vérification manuelle d'Arnaud dans son client. Détail complet en section 9 (mise à jour) et 9.5.
- **Bugs corrigés en testant en jeu** :
  - `main/src/proxy.ts` et `renderer/src/web/Config.ts` : le français interrogeait `www.pathofexile.com` (catalogue anglais uniquement, echec "Unknown item name") au lieu de `fr.pathofexile.com` (site de trade dédié, catalogue déjà identique à nos traductions) ; `fr.pathofexile.com` manquait aussi de la liste blanche du proxy Electron. Les deux corrigés.
  - `renderer/src/web/item-search/WidgetItemSearch.vue` : `fuzzyFindHeistGem` reposait sur l'ancien format anglais à un seul mot pour les regex de qualité de gemme (Anomalous/Divergent/Phantasmal) ; généralisé pour supporter le nouveau format français à 4 formes (accord de genre/nombre).
  - `scripts/generate-fr-locale/generate-client-strings.mjs` : deux regex de `client_strings.js` gardaient une syntaxe anglaise incompatible avec la ponctuation française, causant un vrai plantage (`item.parse_error`) sur certains objets. Voir section 9.6 pour le détail et le réflexe à avoir si ça se reproduit ailleurs.
  - **Timeless Jewel "Not recognized modifier" (session 2026-07-22, résolu)** : voir section 9.7/9.8 pour le détail complet. Cause racine : le texte "mode avancé" (`matchers[].advanced`) que le client français affiche pour les 6 mods "historiques" de Joyau intemporel n'est PAS une simple annotation insérée dans le texte normal (contrairement à l'anglais et à la quasi-totalité des autres stats) — c'est une phrase entièrement différente, non extractible d'aucune donnée du jeu accessible (`StatDescriptions.txt`, `Mods.dat`, `ReminderText` tous vérifiés, vides sur ce point). Corrigé en transcrivant à la main le vrai texte depuis des captures d'écran réelles d'Arnaud (une par famille), table `TIMELESS_JEWEL_HISTORIC_ADVANCED` dans `generate-stats.mjs`. **Confirmé fonctionnel en jeu par Arnaud le 2026-07-22** pour les 5 familles concernées (Foi militante, Vanité glorieuse, Fierté fatale, Orgueil élégant, Retenue brutale). Tragédie héroïque n'avait pas besoin de correctif (son texte avancé était déjà correct via la logique générique existante). Commit `3e0d579`, pushé sur `origin/master`.
  - **Tincture "Not recognized modifier" (session 2026-07-22, résolu)** : symptôme similaire au Timeless Jewel (2 stats non reconnues sur une Teinture Prismatique) mais cause totalement différente et bien plus simple — `Metadata/StatDescriptions/tincture_stat_descriptions.txt` est un 13ᵉ fichier qui existe dans le jeu mais n'avait jamais été ajouté à la liste de fichiers extraits (ni dans `extract-game-data.mjs` ni dans les candidats de `probe-stat-description-files.mjs`). Trouvé en élargissant la sonde à des noms de fichiers plausibles ("tincture_stat_descriptions.txt" a matché du premier coup). Contient les 2 stats manquantes (`#% increased Elemental Damage with Melee Weapons`, `Gain # Mana per Enemy Killed with Melee Weapons`), maintenant traduites via l'extraction/génération normale, aucune donnée à transcrire à la main (contrairement au Timeless Jewel). **Confirmé fonctionnel en jeu par Arnaud le 2026-07-22.**
  - **Carquois "#% increased Damage with Bow Skills" non reconnu (session 2026-07-22, résolu)** : vrai bug de parsing (pas une donnée manquante) dans `parse-stat-descriptions.mjs`. Le bloc `damage_+%_with_bow_skills` de `stat_descriptions.txt` écrit son placeholder de valeur en `{}` (accolades vides) au lieu de `{0}` — seul cas de ce genre trouvé pour l'instant, mais le motif `{}` apparaît ~394 fois dans le fichier combiné, donc potentiellement d'autres blocs concernés. L'ancienne regex de conversion placeholder→`#` exigeait au moins un chiffre (`\{\d+...\}`) et ignorait donc `{}`, laissant le texte indexé avec des accolades littérales au lieu de `#` — recherche par `textIndex.get()` ratée en silence, fallback anglais. Corrigé en rendant le chiffre optionnel (`\{\d*...\}`). Couverture globale passée de 86.8% à 87.6% (+82 matchers) rien qu'avec ce fix, confirmant que d'autres stats étaient touchées par le même bug. **Confirmé fonctionnel en jeu par Arnaud le 2026-07-22.**
  - **Niveau et qualité de gemme absents/cassés dans le price-check (session 2026-07-22, résolu)** : `GEM_LEVEL` dans `generate-client-strings.mjs` était tapé à la main (`'Niveau : '`, avec une espace avant les deux-points) sans jamais avoir été vérifié en jeu — seule entrée de tout le fichier à ne pas suivre la convention `cs(id) + ': '` (deux-points collé) utilisée partout ailleurs. Un vrai carquois copié par Arnaud a confirmé le texte réel : `"Niveau: 5 (Maxi)"`, sans espace. Comme `parseGem` (`Parser.ts`) teste `section[1]?.startsWith(_$.GEM_LEVEL)` pour décider si la section est bien les propriétés d'une gemme, et que `parseQualityNested` (qui extrait la qualité) n'est appelé que DANS cette même branche, cette unique faute de frappe cassait à la fois le niveau ET la qualité de toutes les gemmes françaises d'un coup. Corrigé (`'Niveau: '`), `fr/client_strings.js` régénéré. **Confirmé fonctionnel en jeu par Arnaud le 2026-07-22.**
  - **"+X au Niveau de toutes les Gemmes Y" affiché comme non reconnu en mode avancé (session 2026-07-22, résolu)** : même famille de bug que le Timeless Jewel (9.8), mais sur les 285 stats "Random Skill Gem". L'annotation `(NomMin-NomMax)` du mode avancé pour ces stats est une paire de **noms de gemmes** (ex. `(Fireball-Divine Blast)`), et contrairement aux noms de conquérants de Joyau intemporel, les noms de gemmes SONT traduits en français — confirmé via une amulette réelle "+3 au Niveau de toutes les Gemmes Étincelle" d'Arnaud, dont le vrai texte avancé est `(Boule de feu-Déflagration divine)`, alors que notre donnée gardait `(Fireball-Divine Blast)` verbatim (hypothèse "annotation = nom propre non traduit" de `deriveAdvancedText`, vraie pour les Timeless Jewel, fausse ici). Corrigé en ajoutant un paramètre `transformAnnotation` à `deriveAdvancedText`, utilisé uniquement pour cette famille de stats via la table `gemNames` déjà existante (pas de nouvelle extraction nécessaire). Affecte les 285 stats `+# to Level of all X Gems`, toutes corrigées d'un coup. **Confirmé fonctionnel en jeu par Arnaud le 2026-07-22.**
- **Dernière étape terminée** : étape 3 (parser d'objets fr), testée en jeu. Étape 2 (localisation UI complète) committée et pushée sur `origin/master`, commit `12babfa`. Correctifs Timeless Jewel, Tincture, placeholder `{}`, niveau/qualité de gemme et annotation de nom de gemme du 2026-07-22 committés et pushés sur `origin/master`.
- **Prochaine tâche (à la reprise)** :
  1. Décider de la proposition de PR au mainteneur original (étape 5), ou continuer à affiner la couverture (stats Heist/Atlas restantes, section 9.3).
  2. Termes de lore de l'étape 1 (app_i18n.json, liste en section 4) toujours pas vérifiés avec le client PoE FR réel — non bloquant, à faire à l'occasion.
  3. Vérifier si d'autres fichiers `StatDescriptions` restent manquants au-delà de `tincture_stat_descriptions.txt` — le candidat était absent des deux listes probées jusqu'ici (session 07-21 et 07-22), donc la couverture actuelle (87.6%) pourrait encore progresser en creusant ce genre de piste plutôt qu'en devinant depuis les cas restants du rapport `untranslated-stats-fr.report.txt`.
  4. Les 27 clés `client_strings.js` restant non vérifiées (voir `untranslated-client-strings-fr.report.txt`) valent la peine d'être passées en revue une par une contre de vraies captures — le cas `GEM_LEVEL` de cette session montre qu'une entrée "hand-typed, non vérifiée" peut casser silencieusement une fonctionnalité entière sans jamais remonter d'erreur.
  5. D'autres familles de stats "Random X" au-delà des gemmes (par ex. les Timeless Jewel eux-mêmes ont déjà été vérifiés) pourraient avoir la même hypothèse "annotation = nom propre non traduit" fausse quelque part dans les ~150 champs `advanced` non retraités par `deriveAdvancedText` (mentionnés en 9.7.2) — pas vérifié systématiquement, à garder en tête si un nouveau bug "mode avancé" remonte.
- **Notes / points ouverts** :
  - Termes de lore de l'étape 1 (app_i18n.json) à vérifier avec le client PoE FR réel d'Arnaud (liste en section 4) — toujours pas fait.
  - `fr/items.ndjson`, `fr/stats.ndjson`, `fr/client_strings.js` contiennent maintenant de vraies données extraites du jeu (plus des copies anglaises comme à la fin de l'étape 1) — voir section 9 pour le détail et les limites connues.
  - Le bug d'indexation `make-index-files.mjs` noté en 9.7.3 (indexe seulement `matcher.advanced` OU `matcher.string`, jamais les deux) reste présent et non corrigé (revert fait à la demande d'Arnaud le 2026-07-22, avant la découverte de la vraie cause du bug Timeless Jewel). Toujours un vrai défaut du code, à garder en tête, mais plus urgent maintenant que le blocage Timeless Jewel est résolu par une autre voie.

---

## 9. Étape 3 : génération des données du parser (en cours, session du 2026-07-21)

### 9.1 Pipeline créé : `scripts/generate-fr-locale/`

Nouveau dossier à la racine du repo, **indépendant du build de l'app** (son propre `package.json`, dépendance unique : `pathofexile-dat`). Contient :
- `config.example.json` / `config.local.json` (gitignored) : chemin vers l'installation Steam locale de PoE (`C:\Program Files (x86)\Steam\steamapps\common\Path of Exile`).
- `extract-game-data.mjs` : extrait les données brutes du jeu (voir 9.2) vers `raw/` et `tables/` (gitignorés, régénérables).
- `probe-stat-description-files.mjs` : utilitaire pour retrouver les noms de fichiers `Metadata/StatDescriptions/*.txt` présents dans le patch courant (pas d'index public de ces noms, il faut sonder).
- `parse-stat-descriptions.mjs` : parseur du format `StatDescriptions.txt` de GGG (UTF-16LE, blocks `description`/`lang "X"`, placeholders `{0}`/`{0:+d}` → `#`).
- `generate-items.mjs` : génère `renderer/public/data/fr/items.ndjson`.
- `generate-stats.mjs` : génère `renderer/public/data/fr/stats.ndjson`.
- `generate-client-strings.mjs` : génère `renderer/public/data/fr/client_strings.js`.
- Chaque `generate-*.mjs` écrit un rapport de couverture (`*.report.txt`, gitignoré) listant précisément ce qui n'a pas pu être traduit et pourquoi.

**Comment relancer tout le pipeline** (utile à chaque nouvelle ligue PoE) :
```
cd scripts/generate-fr-locale
npm install          # une seule fois
npm run generate:all # extract + les 3 generate-*.mjs
```

### 9.2 Sources de données utilisées (toutes vérifiées, aucune inventée)

- **`pathofexile-dat`** (npm, `SnosMe/poe-dat-viewer` — l'auteur d'awakened-poe-trade lui-même) : lit directement `Bundles2/` de l'installation Steam locale, pas besoin de télécharger quoi que ce soit depuis le CDN GGG.
- **Table `BaseItemTypes`** (Id/Name, en+fr) : noms des objets normaux, gemmes, cartes de divination (`ITEM`/`GEM`/`DIVINATION_CARD`).
- **Table `Words`** (Wordlist=6, Text/Text2) : noms des objets uniques. Piège découvert : `Text` reste TOUJOURS en anglais (référence interne), c'est `Text2` qui est réellement localisé. Vérifié en comparant les deux tables (0 différence sur `Text`, ~83% de différence sur `Text2`).
- **Table `MonsterVarieties`** (Id/Name) : noms des bêtes capturables (namespace `CAPTURED_BEAST`).
- **Table `ClientStrings`** (Id/Text) : tous les libellés fixes de l'UI/parser (raretés, "Corrupted", "Item Level: ", etc.) — **confirmé que l'API publique du site de trade (`/api/trade/data/stats`) ne fournit AUCUNE traduction**, donc cette table du jeu est la seule vraie source.
- **Table `HeistJobs`** (Id/Name) : noms des compétences de casse (Lockpicking, Brute Force, etc.) — pas dans `ClientStrings`.
- **`Metadata/StatDescriptions/*.txt`** (12 fichiers trouvés par sondage, cf. `probe-stat-description-files.mjs`) : texte des mods d'objets, format `description` / `lang "French"` avec variantes par valeur.

**Important — ce qui n'est PAS retouché** : `ref` et `trade.ids` dans `stats.ndjson` viennent de l'API `/api/trade/data/stats` (confirmé identique au format déjà présent dans `en/stats.ndjson`), sont partagés entre toutes les langues et n'ont jamais été modifiés. Seul `matchers[].string` est traduit. Idem `refName`/`namespace`/`icon` jamais touchés dans `items.ndjson`.

### 9.3 Résultats de la génération (première passe)

| Fichier | Couverture | Détail |
|---|---|---|
| `fr/items.ndjson` | **99,5 %** (4618/4641), initialement 95,0 % | Les ~210 gemmes manquantes (variantes transfigurées type "Arc of Oscillating") résolues via la table `GemEffects` (référencée par `SkillGems.GemVariants`), qui contient le nom complet déjà traduit. Reste 23 UNIQUE traduits à la main par Arnaud. |
| `fr/stats.ndjson` | **85,6 %** des matchers (8821/10299), initialement 71,7 % | +325 via le fix du bug `\n` (le fichier du jeu encode les sauts de ligne en `\n` littéral, pas un vrai retour à la ligne) ; +890 (100 %) pour `Allocates {passif}` via la table `PassiveSkills` ; +283 (100 %) pour `+# to Level of all {gemme} Gems` via `BaseItemTypes`. Reste ~1478 cas divers (salles Heist, boss, texte spécifique aux uniques) non résolus. |
| `fr/client_strings.js` | **99/128 clés (77,3 %)**, initialement 93/128 | Les accords grammaticaux (Superior/Synthesised/Anomalous/Divergent/Phantasmal/Foulborn) résolus via les templates `<if:MS>/<elif:FS>/<elif:MP>/<elif:FP>` déjà présents dans `ClientStrings` (ex. `QualityItem`) — regex à alternance des 4 formes, pas besoin de connaître le genre de l'objet côté parsing. |

### 9.4 Fait

- **Test réel de `parseClipboard()`** en jeu avec le client PoE FR d'Arnaud (2026-07-21) — plusieurs objets testés (dont un unique corrompu multi-mods), tous correctement reconnus et matchés à leurs ID de trade.
- **Mise à jour des `.index.bin`** : `npm run make-index-files` relancé après chaque régénération des données fr.
- **Recherche trade en français** : bug distinct découvert et corrigé en testant en jeu (voir section 7, "Bugs corrigés en testant en jeu").
- Reste non fait : **affixes de mods d'influence** (`SHAPER_MODS`, `ELDER_MODS`, etc. dans `client_strings.js`) — nécessitent d'extraire la table `Mods.dat` et son système de génération de noms, pas commencé.

### 9.5 Liste de vérification demandée à Arnaud — résolue sans vérification manuelle

Contrairement à ce qui était supposé, presque tous ces points étaient déductibles directement des données du jeu, sans avoir besoin d'un client PoE FR pour deviner :

- **Accords grammaticaux** (Superior/Synthesised/Anomalous/Divergent/Phantasmal/Foulborn) : résolus via les templates `<if:MS>` de `ClientStrings` (voir 9.3). Confirmé exact en jeu.
- **`Blighted`/`Blight-ravaged`** : le texte `"{0} infestée"`/`"{0} ravagée par l'Infestation"` était déjà confirmé textuellement dans `ClientStrings` (`InfectedMap`/`UberInfectedMap`), pas une reconstruction.
- **Heist Contract "Requires X (Level Y)"** : confirmé via `ItemDisplayHeistContractJob` = `"Prérequis : {1} au niv. {0}"`.
- Reste non résolu (`Priceless`, `Unusual Gems`, `Fractured Prefix/Suffix Modifier`, organes de bêtes capturées, mods d'influence Shaper/Elder/etc.) : voir liste originale ci-dessous, toujours d'actualité.

**Aucune correspondance trouvée dans les fichiers du jeu** :
- `Priceless` (cible de casse)
- `Unusual Gems` (catégorie de butin de casse)
- `Fractured Prefix/Suffix Modifier`
- `@To`/`@From` dans les chuchotements (les commandes de chat restent parfois en anglais même en client FR)
- `Currently has N Charges` (flasques)
- Organes de bêtes capturées (`Brain`/`Eye`/`Lung`/`Heart`/`Liver`) — le français inverse probablement l'ordre ("Cerveau de Brambleback"), donc c'est un problème de structure de regex, pas juste de mot

**Le plus gros morceau** : les fragments de noms générés pour les objets avec mod d'influence (`SHAPER_MODS`/`ELDER_MODS`/`CRUSADER_MODS`/`HUNTER_MODS`/`REDEEMER_MODS`/`WARLORD_MODS`/`DELVE_MODS`/`VEILED_MODS`/`INCURSION_MODS`, ex. "of Shaping", "The Shaper's"). Aucune de ces chaînes n'existe dans `ClientStrings` — viennent du système de génération de noms de `Mods.dat`, pas encore extrait. À vérifier en regardant un objet avec mod Shaper/Elder/etc en jeu ou sur le site de trade FR.

Détail complet avec les raisons de chaque cas : `scripts/generate-fr-locale/untranslated-client-strings-fr.report.txt` et `untranslated-stats-fr.report.txt` (gitignorés, régénérés à chaque run).

### 9.6 Bugs de ponctuation FR trouvés en testant en jeu (2026-07-21) — réflexe à avoir si ça se reproduit

Deux regex dans `generate-client-strings.mjs` avaient été construites en copiant la forme du regex anglais, sans vérifier que la **ponctuation française réelle** correspondait. Résultat : un vrai plantage (`item.parse_error`, exception JS non rattrapée) sur certains objets, pas juste une mauvaise traduction. Trouvé grâce à des captures d'écran d'Arnaud montrant le texte brut copié en jeu (`{ Modificateur ... }`, activé via l'option "description de mod avancée" du client).

**Cas 1 — `MODIFIER_INCREASED`** : comparait le texte contre `/^(.+?)% Increased$/` (anglais) alors que le texte réel est `"Augmentation : 20%"`. `.exec()` renvoyait `null`, et le code faisait `null![1]` → crash direct. Corrigé en dérivant le regex depuis `ClientStrings` (`AlternateQualityModIncreaseText`, confirmé : EN `" — {0}% Increased"` → FR `" — Augmentation : {0}%"`), pas deviné.

**Cas 2 — `MODIFIER_LINE` / `PREFIX_MODIFIER` / `SUFFIX_MODIFIER` / `CRAFTED_PREFIX` / `CRAFTED_SUFFIX`** : le regex anglais utilise des guillemets droits `"..."` pour capturer le nom d'un mod préfixe/suffixe (`Prefix Modifier "of the Phoenix"`). Le texte français utilise des guillemets `« ... »` avec espace insécable (`Modificateur de préfixe : « du Phénix »`), **et** une espace avant les deux-points pour Palier/Rang (`(Palier : 8)` et non `(Palier: 8)`). Le `.replace(' "{0}"', '')` utilisé pour dériver les labels ne matchait donc jamais le texte français (`« {0} »`), laissant un `{0}` littéral non substitué dans les constantes. Corrigé : guillemets `«»` dans `MODIFIER_LINE`, `.replace('« {0} »', '')` pour dériver les labels, espaces flexibles (`\s*`) autour des deux-points.

**Réflexe pour la suite** : toute regex dans `client_strings.js` qui contient encore une syntaxe anglaise en dur (guillemets droits `"`, deux-points sans espace, ponctuation ASCII) doit être considérée comme suspecte — le français a sa propre ponctuation (`« »`, espaces avant `:` `;` `?` `!`). Le seul moyen fiable de vérifier, c'est de regarder le texte brut réellement copié en jeu (pas de deviner depuis la version anglaise). Liste des clés encore non vérifiées : voir 9.5 et le rapport `untranslated-client-strings-fr.report.txt`.

---

### 9.7 Session du 2026-07-22 : correctifs `stats.ndjson`, et énigme non résolue du Timeless Jewel

> **À lire en premier à la reprise.** Cette session a fait deux vrais correctifs (confirmés en jeu) puis a passé le plus clair du temps sur une énigme non résolue. Section écrite pour éviter de repartir de zéro ou de retester des pistes déjà mortes.

#### État exact du repo à la fin de la session (important, pour ne pas se mélanger)

- **Commit `266ccdb` fait, en local, PAS pushé sur `origin`.** Contient uniquement : `scripts/generate-fr-locale/generate-stats.mjs` (deux nouvelles fonctions, voir 9.7.1 et 9.7.2) + `renderer/public/data/fr/stats.ndjson` régénéré. `git log --oneline -1` doit montrer ce commit en HEAD.
- **`renderer/src/assets/make-index-files.mjs` est revenu à sa version d'origine** (le fix testé en 9.7.3 a été **annulé** via `git checkout --`, à la demande d'Arnaud — le fichier ne doit montrer AUCUNE modification par rapport à `origin/master`). Les `.index.bin` locaux ont été régénérés avec ce code d'origine juste après le revert, donc l'état sur disque est cohérent avec le commit `266ccdb`.
- Les deux serveurs de dev (`renderer` port 5173 + `main`) ont été relancés à froid plusieurs fois pendant la session ; rien n'indique qu'il faille les retoucher à la reprise, un simple `npm run dev` dans les deux dossiers suffit (voir DEVELOPING.md / section 5 de ce fichier).
- Aucun fichier de script de test temporaire n'a été laissé dans le repo (vérifié par `git status --short` propre en fin de session).

#### 9.7.1 Corrigé et confirmé en jeu par Arnaud : stat Cluster Jewel `Added Small Passive Skills grant: #`

Cette stat (implicite de Cluster Jewel, ex. "Added Small Passive Skills grant: 12% increased Fire Damage") était à 0% de couverture FR. Contrairement aux autres stats de ce fichier, elle n'est pas un template `#`-classique dans `StatDescriptions.txt` : c'est l'assemblage à l'exécution d'un label `ClientStrings` (`StatDescripotionTreeExpansionJewelGrantedSmallStat`, EN `"Added Small Passive Skills grant: {0}"` → FR `"Les Passifs mineurs ajoutés octroient: {0}"`, confirmé identique à une capture d'écran réelle d'Arnaud) autour du texte d'un sous-stat ordinaire (ex. `"12% increased Fire Damage"`). Comme `en/stats.ndjson` stocke cette stat avec des matchers **concrets** (une valeur numérique déjà substituée par variante) plutôt qu'un `ref` templaté en `#`, il fallait normaliser les nombres du texte anglais en `#` pour retrouver le bon template dans l'index `StatDescriptions`, puis réinjecter les nombres d'origine dans le texte FR trouvé. Nouvelle fonction `translateSmallPassiveGrant` dans `generate-stats.mjs`. Résultat : 54/54 variantes traduites, testé en jeu par Arnaud sur un vrai objet, confirmé fonctionnel ("bien joué").

#### 9.7.2 Corrigé, non testé en jeu (mais logique vérifiée) : reconstruction du champ `matchers[].advanced`

Découverte indépendante : `matchers[].advanced` (texte utilisé quand l'option client "description de mod avancée" est active — Arnaud l'a activée) n'était **jamais traduit** par le pipeline, ni avant ni après le fix 9.7.1 : `translateEntry` faisait `{ ...m, string: result.text }`, qui recopie l'ancien `advanced` anglais tel quel. Sur les 499 matchers de `en/stats.ndjson` qui ont un champ `advanced`, 480 sont une simple insertion d'une annotation `(RangeDébut-RangeFin)` à un seul endroit dans le texte de `string` (ex. `"...Templar Maxarius"` → `"...Templar Maxarius(Avarius-Maxarius)"` ; idem pour les noms de gemmes `# to Level of all X Gems` → annotation `(Fireball-Divine Blast)` constante). Nouvelle fonction générique `deriveAdvancedText` dans `generate-stats.mjs` : calcule le préfixe/suffixe commun entre `string` et `advanced` anglais pour isoler l'annotation, retrouve le même point d'ancrage (un nom propre non traduit, ou — pour les gemmes — le nom FR déjà connu via la table `gemNames` existante) dans le texte FR déjà traduit, et réinjecte l'annotation anglaise telle quelle à cet endroit (les noms propres du jeu ne sont pas traduits en français, vérifié sur plusieurs exemples). Résultat : 331/499 champs `advanced` récupérés (les ~150 restants ont plusieurs points d'insertion, modèle trop complexe, laissés inchangés — pas de régression, comportement identique à avant).

**Cette fonctionnalité n'a PAS été confirmée comme la cause du problème du Timeless Jewel** (voir 9.7.4) — elle reste un correctif valable en soi (le champ était objectivement faux avant), mais ne pas supposer qu'elle résout quoi que ce soit d'autre tant que ce n'est pas testé isolément.

#### 9.7.3 Bug réel trouvé, correctif testé puis ANNULÉ : `make-index-files.mjs`

En lisant `renderer/src/assets/make-index-files.mjs`, découverte que la construction de l'index rapide de recherche (`stats-matcher.index.bin`, utilisé par `STAT_BY_MATCH_STR_V2`) n'indexe **qu'un seul** des deux textes possibles d'un matcher :

```js
if (matcher.advanced) {
  lineStarts.matchers.push({ hash: fnv1a(matcher.advanced) })
} else {
  lineStarts.matchers.push({ hash: fnv1a(matcher.string) })
}
```

Alors que le code de comparaison plus loin (`stat-translations.ts`, `m.string === matchStr || m.advanced === matchStr`) montre clairement que les deux formes devraient être trouvables. Concrètement : dès qu'un matcher a un champ `advanced`, son texte `string` normal devient invisible pour la recherche rapide, même s'il est présent dans les données. **Ce bug est réel et vérifié par simulation directe de l'algorithme de recherche** (script Node reproduisant `dataBinarySearch` + `fnv1a`), mais touche potentiellement l'anglais aussi (pas spécifique au français) et n'est **pas prouvé être la cause** du problème 9.7.4 : le fix (indexer les deux) a été appliqué, les `.bin` régénérés, l'appli relancée à froid, et **le Timeless Jewel n'a montré aucun changement**. Arnaud a demandé d'annuler ce changement pour l'instant (fait, voir état du repo ci-dessus) — **ne pas le réappliquer sans son accord explicite**, mais le garder en tête, c'est un vrai défaut du code même s'il n'explique pas (ou pas seul) le bug du Timeless Jewel.

#### 9.7.4 NON RÉSOLU — le Timeless Jewel (et probablement la Tincture) : la ligne "Carved to glorify.../Passives in radius..." reste affichée en 2 blocs séparés "Not recognized modifier" au lieu d'un seul, malgré une donnée FR prouvée correcte à 100%

**Symptôme** : sur un Timeless Jewel réel (ex. "Foi militante" / Militant Faith, conquérant Maxarius/Avarius/Dominus), le mod à deux lignes suivant :
```
Gravé pour glorifier # nouveaux croyants convertis par le Haut Templier <Nom>
Les Talents passifs dans le Rayon sont Conquis par les Templiers
```
s'affiche dans l'appli comme **2 encarts distincts "Not recognized modifier"** au lieu d'un seul mod reconnu (comme en anglais, où les 2 lignes équivalentes fusionnent bien en un seul mod reconnu).

**Ce qui est prouvé correct (ne pas revérifier, c'est fait, à fond)** :
- Le texte FR exact stocké dans `fr/stats.ndjson` pour ce ref (`Carved to glorify # new faithful converted by High Templar <Nom>`) correspond **caractère pour caractère** (après normalisation du nombre en `#`) au texte brut réel copié par Arnaud en jeu (vérifié deux fois, via Bloc-notes et collage direct).
- Le même texte FR correspond aussi, **caractère pour caractère**, à des annonces réelles d'autres joueurs consultées sur le site de trade (`explicitMods[].description` de l'API `pathofexile.com/api/trade`, hash `stat.explicit.pseudo_timeless_jewel_<nom>` identique à notre `trade.ids`).
- La fenêtre de dev actuellement lancée (celle qu'Arnaud teste, DevTools attaché confirmé) a bien chargé cette donnée à jour (vérifié en tapant `fetch('/data/fr/stats.ndjson').then(...)` directement dans la Console DevTools de cette fenêtre — le texte trouvé est le bon, avec `advanced` du fix 9.7.2 inclus).
- Donc : **ce n'est définitivement pas un problème de contenu de traduction.** Le bug est ailleurs, dans la façon dont l'appli regroupe/matche les lignes du presse-papier.

**Pistes explorées et éliminées (ne pas les retester, c'est déjà fait)** :
- Cache navigateur/Electron : "Disable cache" DevTools déjà coché depuis avant la session, aucun effet. Redémarrages à froid des deux process (`renderer` + `main`) faits plusieurs fois, aucun effet.
- Fenêtre de dev différente de celle testée par Arnaud : éliminé, DevTools détaché confirmé présent (signature de notre build de dev).
- `advanced-mod-desc.ts` / `groupLinesByMod` / tags `{...}` de la "description de mod avancée" : le presse-papier brut réel de ce Timeless Jewel **ne contient aucune ligne `{...}`** (confirmé deux fois par Arnaud, dont une fois via Bloc-notes). Cette voie de code (qui gère le format avancé) n'est donc probablement pas concernée pour ce type d'objet (unique à mods fixes, pas de tier/rang à révéler). Donc `parseModifiers` devrait passer par la branche `else` (`parseModType`) — mais celle-ci lève une exception si aucune ligne ne finit par ` (enchant)`/` (scourge)`/` (implicit)`, ce qui n'est pas non plus le cas ici. **Contradiction non résolue** : sur le papier (code lu très précisément, et reproduit dans un harnais Node autonome qui exécute le VRAI code du parser via esbuild), `parseModifiers` devrait renvoyer `SECTION_SKIPPED` pour ce bloc de 5 lignes dans les 4 passes (enchant/scourge/implicit/explicit), ce qui voudrait dire que ces lignes ne devraient MÊME PAS apparaître comme "non reconnues" — or elles apparaissent bien, visiblement, dans l'appli réelle.
- Bug d'indexation `make-index-files.mjs` (9.7.3) : fix testé, aucun effet observé, annulé.
- Différence entre la formulation utilisée par le champ de recherche du site de trade FR ("A été sculpté afin de glorifier...") et le texte réel en jeu ("Gravé pour glorifier...") : **c'est une incohérence de traduction propre à GGG entre leur catalogue de recherche web et le texte réel du client de jeu**, sans rapport avec notre travail — le `ref`/`matchers` de notre repo suit la même convention qu'en anglais (`ref` = 1ère ligne seulement, `matchers.string` = texte complet des 2 lignes). Ne pas essayer de faire correspondre notre traduction à la formulation du site de recherche, ce serait une erreur.
- Test isolé via la Console DevTools de l'appli réelle (`const { parseClipboard } = await import('/src/parser/index.ts'); parseClipboard(texteComplet)`) : a renvoyé `item.unknown` (échec d'identification de l'objet lui-même, avant même d'arriver aux mods) — mais Arnaud confirme que **la reconnaissance des objets uniques fonctionne normalement dans l'appli en usage réel** (testé sur 10-15 objets uniques différents, tous OK). Donc ce `item.unknown` est un artefact de la méthode de test via la console (probablement lié à la façon dont le texte est passé/évalué dans la console, pas un vrai bug de l'appli) — **ne pas perdre de temps à creuser cette fausse piste `item.unknown`/`findInDatabase`/`ITEM_BY_REF` à la reprise**, c'est un faux positif de la méthode de test, pas un vrai problème.

**Pistes pas encore essayées, à explorer en premier à la reprise** :
1. Reprendre le harnais Node autonome (bundle esbuild du vrai `Parser.ts` + dépendances, exécuté en Node avec `fetch` pointé sur `localhost:5173` et les deux imports dynamiques de `client_strings.js` patchés en `file://`) — la recette complète a été mise au point pendant cette session mais les fichiers de test ont été supprimés en fin de session (pas commités, c'était voulu). La reconstruire est rapide si besoin. Elle a permis de tracer précisément que les 4 appels à `parseModifiers` renvoient `SECTION_SKIPPED` pour ce bloc — il faudrait comprendre POURQUOI l'appli réelle affiche quand même 2 encarts "non reconnu" alors que ce code dit qu'elle ne devrait rien afficher du tout. Peut-être qu'il manque un mécanisme de secours ailleurs dans le code (un widget qui scanne les lignes indépendamment de `parseClipboard`), à chercher spécifiquement.
2. Vérifier si la Tincture (mentionnée par Arnaud mais jamais testée cette session) a exactement le même symptôme — si oui, ça aidera à isoler ce qui est commun aux deux plutôt que de chercher un truc spécifique aux Timeless Jewels.
3. Comparer avec un mod à 2 lignes qui, lui, fonctionne bien en français (s'il en existe un dans les données déjà traduites) pour voir ce qui structurellement diffère du cas Timeless Jewel.

---

### 9.8 RÉSOLU (session 2026-07-22, suite) : cause racine et correctif du bug Timeless Jewel de 9.7.4

La section 9.7.4 ci-dessus documentait le bug comme non résolu avec une contradiction apparente (le code semblait dire `SECTION_SKIPPED` alors que l'appli affichait "Not recognized modifier"). Cette contradiction vient d'un biais du test de la session précédente : le harnais Node et les fichiers `.txt` de capture manuelle utilisés pour vérifier "le texte est correct" avaient en réalité été faits **sans le format `{ Modificateur d'Objet unique }` réellement présent** dans le presse-papier avec l'option "description de mod avancée" activée (celle qu'Arnaud utilise). Deux points de logs de debug temporaires (`console.log` dans `parseModifiers`/`parseStatsFromMod`, retirés après coup) ont suffi à capturer le vrai texte brut copié en jeu et à lever la contradiction.

**Cause racine réelle** : `matchers[].advanced` (le texte utilisé par le parser quand la ligne est au format avancé) était généré par `deriveAdvancedText` (voir 9.7.2) en supposant que le texte avancé = texte normal + une annotation `(NomMin-NomMax)` insérée à un seul endroit. Cette hypothèse est vraie pour la quasi-totalité des stats (confirmé sur les gemmes, passifs, etc.) mais **fausse pour les 6 mods "historiques" de Joyau intemporel** (Foi militante, Vanité glorieuse, Fierté fatale, Orgueil élégant, Retenue brutale, Tragédie héroïque) : le client français utilise, pour 5 des 6 familles, une phrase **entièrement différente** en mode avancé, pas une insertion. Exemple Foi militante :
- Normal (`string`, correct) : `"Gravé pour glorifier # nouveaux croyants convertis par le Haut Templier Maxarius\nLes Talents passifs dans le Rayon sont Conquis par les Templiers"`
- Avancé réel (capturé en jeu) : `"A été gravé à la gloire de #(2000-10000) nouveaux croyants convertis par le Haut Templier Maxarius(Avarius-Maxarius)\nLes Talents dans le Rayon sont conquis par les templiers"`

Verbe différent, casse différente, "Talents passifs" devient "Talents". Confirmé par Arnaud comme une incohérence de traduction probable côté GGG (traduction faite sans contexte croisé entre les différentes formulations du même concept — texte normal, texte avancé, label du site de trade sont 3 phrases différentes en français, alors qu'elles sont identiques en anglais).

**Recherche exhaustive de la vraie donnée avant de trancher pour la transcription manuelle** (pour ne pas avoir à la refaire) :
- `Mods.dat`/`Mods.dat64` (schéma complet vérifié via `poe-tool-dev/dat-schema`) : aucune colonne de texte libre, uniquement des références vers `Stats`.
- Les 12 fichiers `StatDescriptions/*.txt` déjà extraits : recherche exhaustive du texte anglais dans tout le contenu combiné, une seule occurrence trouvée (celle utilisée pour `string`), aucun bloc alternatif.
- Re-sondage de 30 noms de fichiers `StatDescriptions` candidats sur l'installation Steam réelle : toujours les mêmes 12 fichiers.
- Table `ReminderText` (piste sérieuse à cause du tag `reminderstring ReminderTextConqueredPassives` sur le bloc) : extraite et vérifiée — elle contient bien du texte, mais correspond à la ligne entre parenthèses `"(Les Talents passifs conquis ne peuvent pas être modifiés par d'autres Joyaux)"`, pas à la phrase principale. Cette ligne parenthétique était de toute façon déjà correctement ignorée par la logique existante de `linesToStatStrings` (elle saute les lignes entre parenthèses).
- Conclusion : cette formulation n'est stockée dans aucune donnée extractible via `pathofexile-dat`. Probablement calculée/codée en dur côté client.

**Correctif appliqué** : Arnaud a fourni une capture d'écran réelle (mode avancé activé) pour un commandant de chacune des 5 familles concernées (dossier `CapturePOE/`, fichiers `fiertéFatale.png`, `foiMilitante.png`, `orgueilElegant.png`, `retenueBrutale.png`, `vanitéGlorieuse.png`). Le motif de transformation (changement de verbe ou non en ligne 1, suppression de "passifs" et minuscule en ligne 2 ou non) a été vérifié constant par famille, puis généralisé aux autres commandants de la même famille via la liste déjà connue dans `StatDescriptions.txt` et l'annotation `(NomMin-NomMax)` déjà vérifiée constante par famille dans `en/stats.ndjson`. Résultat : table `TIMELESS_JEWEL_HISTORIC_ADVANCED` dans `generate-stats.mjs` (15 entrées = 5 familles × 3 commandants ayant un ID de trade), appliquée en override après la génération normale. Tragédie héroïque exclue de la table : sa capture montrait un texte avancé identique à `string` + simple annotation, donc déjà correct via `deriveAdvancedText`.

**Confirmé fonctionnel en jeu par Arnaud le 2026-07-22** pour les 5 familles corrigées. Tincture non retestée (bug distinct, mentionné mais pas encore investigué — ne pas supposer la même cause).

---

### 9.9 RÉSOLU (session 2026-07-22, suite) : Tincture, fichier StatDescriptions manquant

Symptôme rapporté par Arnaud sur une Teinture Prismatique : 2 mods affichés "Not recognized modifier" (`#% increased Elemental Damage with Melee Weapons` implicite, `Gain # Mana per Enemy Killed with Melee Weapons` explicite/suffixe), le troisième mod de l'objet reconnu normalement. Contrairement au Timeless Jewel, **ne pas supposer la même cause** avant de vérifier : ici il n'était même pas question de mode avancé, juste de traduction manquante en base.

**Diagnostic** : les deux refs anglaises correspondantes étaient encore en anglais brut dans `fr/stats.ndjson` (`translateMatcherString` n'avait rien trouvé, fallback silencieux qui garde le texte anglais - cf. `untranslated-stats-fr.report.txt`). Recherche du texte anglais exact dans les 12 fichiers `StatDescriptions/*.txt` déjà extraits (combinés) : aucune occurrence, même partielle (`grep` sur "with Melee Weapons" ne remonte que des templates sans rapport). Recherche du mot "tincture" dans ces mêmes fichiers : quelques stats de mécanique Tincture existent bien dans `stat_descriptions.txt` (Mana Burn, etc.) mais pas les 2 stats manquantes - preuve que le problème n'est pas "tincture = jamais dans nos fichiers" mais bien "ces 2 stats précises n'y sont pas".

**Cause** : un 13ᵉ fichier existe dans le jeu, `Metadata/StatDescriptions/tincture_stat_descriptions.txt` (306 Ko), jamais sondé ni par la liste `CANDIDATES` de `probe-stat-description-files.mjs` ni par `STAT_DESCRIPTION_FILES` de `extract-game-data.mjs` (absent des deux depuis la mise en place du pipeline à l'étape 3). Trouvé en élargissant la sonde à une poignée de noms plausibles ("tincture_stat_descriptions.txt" a été trouvé du premier coup, avec 306496 octets, confirmant qu'il ne s'agissait pas d'une supposition mais d'un vrai fichier existant).

**Correctif** : fichier ajouté aux deux listes (`extract-game-data.mjs` et `probe-stat-description-files.mjs`, pour que les futurs re-sondages après une mise à jour du jeu le retrouvent). Pipeline complet relancé (`extract` + `generate:stats`). Les 2 stats sont maintenant traduites via le mécanisme normal (`game-data`, pas de transcription manuelle nécessaire) :
- `Les armes de mêlée ont #% d'Augmentation des Dégâts élémentaires`
- `Vous gagnez # de Mana par Ennemi Tué avec les armes de mêlée`

Couverture globale `stats.ndjson` passée de 86.2% à 86.8% (+60 matchers, la plupart probablement d'autres stats Tincture qui traînaient aussi dans le rapport sans avoir été spécifiquement testées en jeu). **Confirmé fonctionnel en jeu par Arnaud le 2026-07-22.**

**Réflexe pour la suite** : si une future session retombe sur des stats non traduites dans `untranslated-stats-fr.report.txt` qui semblent être du texte "normal" (pas de mode avancé en jeu, pas de raison évidente), vérifier d'abord l'hypothèse "fichier StatDescriptions manquant" avant de chercher une cause plus compliquée - c'est rapide à tester (probe avec quelques noms de fichiers plausibles) et ça s'est déjà avéré vrai une fois.

---

### 9.10 RÉSOLU (session 2026-07-22, suite) : Carquois, placeholder `{}` non géré par le parseur de StatDescriptions

Symptôme rapporté par Arnaud sur un carquois rare : la ligne `50% d'Augmentation de Dégâts avec les Aptitudes d'arc` (implicite/explicite, capture dans `CapturePOE/carquois.txt` et `carquois.png`) non reconnue, alors que la traduction française elle-même est correcte (confirmé par Arnaud) — donc pas une question de mauvais mot, plutôt un problème de mécanique.

**Diagnostic** : `#% increased Damage with Bow Skills` restait en anglais dans `fr/stats.ndjson`. Recherche du texte anglais dans `stat_descriptions.txt` : trouvé, bloc `damage_+%_with_bow_skills`, mais avec un format inhabituel :
```
description
	1 damage_+%_with_bow_skills
	2
		1|# "{}% increased Damage with Bow Skills"
		#|-1 "{}% reduced Damage with Bow Skills" negate 1
	...
	lang "French"
	2
		1|# "{}% d'Augmentation de Dégâts avec les Aptitudes d'arc"
		#|-1 "{}% de Réduction de Dégâts avec les Aptitudes d'arc" negate 1
```
Le placeholder de valeur est écrit `{}` (accolades vides) au lieu de la forme habituelle `{0}`. Sémantiquement identique (un seul argument, index implicite), mais `parse-stat-descriptions.mjs` convertissait les placeholders en `#` avec la regex `/\{\d+(?::[^}]*)?\}/g` — le `\d+` exige au moins un chiffre, donc `{}` n'était jamais reconnu comme placeholder et restait tel quel dans le texte indexé (`"{}% increased Damage with Bow Skills"` au lieu de `"#% increased Damage with Bow Skills"`). `translateMatcherString` cherche `textIndex.get(trimmed)` avec le texte de `en/stats.ndjson` (qui utilise `#`, jamais `{}`) : la recherche échouait silencieusement, fallback sur l'anglais.

**Correctif** : `\d+` → `\d*` dans la regex de `scripts/generate-fr-locale/parse-stat-descriptions.mjs`, pas besoin de toucher au reste de la logique, la substitution en `#` fonctionne identiquement une fois le placeholder reconnu. Un seul bloc confirmé avec ce format pour l'instant, mais le motif `{}` apparaît ~394 fois dans le fichier combiné `stat_descriptions.txt` — donc probablement plusieurs autres stats concernées par le même bug avant ce correctif. Confirmé par le saut de couverture globale : 86.8% → 87.6% (+82 matchers traduits) rien qu'en relançant la génération avec le fix, sans autre changement.

**Confirmé fonctionnel en jeu par Arnaud le 2026-07-22.**

**Réflexe pour la suite** : si une stat reste non traduite sans raison apparente (le texte anglais existe bien dans les fichiers), vérifier la forme exacte du placeholder dans le bloc source avant de chercher ailleurs — `{}` vu ici, mais d'autres variantes exotiques (`{0:+d}` déjà géré, éventuellement d'autres formats de specifier) pourraient exister.

---

## 10. Références externes

- Dépôt original : https://github.com/SnosMe/awakened-poe-trade
- Fork perso : https://github.com/Arnogorn/awakened-poe-trade
- DEVELOPING.md du projet (partiellement daté, cf. section 2 pour l'écart avec la CI réelle)
- CI de référence pour les commandes de build à jour : `.github/workflows/main.yml`
- `pathofexile-dat` (extraction des données du jeu) : https://github.com/SnosMe/poe-dat-viewer
- Schéma des tables `.dat64` : https://github.com/poe-tool-dev/dat-schema
- Licence : MIT
