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
- **Dernière étape terminée** : étape 3 (parser d'objets fr), testée en jeu, prête à committer. Étape 2 (localisation UI complète) committée et pushée sur `origin/master`, commit `12babfa`.
- **Prochaine tâche (à la reprise)** :
  1. Décider de la proposition de PR au mainteneur original (étape 5), ou continuer à affiner la couverture (stats Heist/Atlas restantes, section 9.3).
  2. Termes de lore de l'étape 1 (app_i18n.json, liste en section 4) toujours pas vérifiés avec le client PoE FR réel — non bloquant, à faire à l'occasion.
- **Notes / points ouverts** :
  - Termes de lore de l'étape 1 (app_i18n.json) à vérifier avec le client PoE FR réel d'Arnaud (liste en section 4) — toujours pas fait.
  - `fr/items.ndjson`, `fr/stats.ndjson`, `fr/client_strings.js` contiennent maintenant de vraies données extraites du jeu (plus des copies anglaises comme à la fin de l'étape 1) — voir section 9 pour le détail et les limites connues.

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

## 10. Références externes

- Dépôt original : https://github.com/SnosMe/awakened-poe-trade
- Fork perso : https://github.com/Arnogorn/awakened-poe-trade
- DEVELOPING.md du projet (partiellement daté, cf. section 2 pour l'écart avec la CI réelle)
- CI de référence pour les commandes de build à jour : `.github/workflows/main.yml`
- `pathofexile-dat` (extraction des données du jeu) : https://github.com/SnosMe/poe-dat-viewer
- Schéma des tables `.dat64` : https://github.com/poe-tool-dev/dat-schema
- Licence : MIT
