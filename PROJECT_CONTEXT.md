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
3. **Parser d'objets fr** : ajouter les vraies données `client_strings.js`/`items.ndjson`/`stats.ndjson` en français (probablement à extraire des fichiers de langue du jeu ou d'un projet comme RePoE/PyPoE s'il expose le FR), pour que le price-check reconnaisse un objet copié depuis un client PoE en français. **Pas commencé.**
4. **Tests réels en jeu** + itérations sur les termes de traduction incertains (cf. section 4).
5. **Proposition de PR au mainteneur original**, seulement quand Arnaud le décide.

---

## 7. ÉTAT ACTUEL

> Section à mettre à jour après chaque session.

- **Étape en cours** : test manuel en local du sélecteur de langue (dev lancé : `renderer` sur Vite `localhost:5173`, `main` en mode dev, aucune erreur au démarrage des deux process).
- **Dernière étape terminée** : étape 2 (localisation UI complète, committée et pushée sur `origin/master`, commit `12babfa`).
- **Prochaine tâche** : retour d'Arnaud sur le test visuel de l'interface en français, puis démarrage de l'étape 3 (parser d'objets fr) quand il sera prêt.
- **Notes / points ouverts** :
  - Termes de lore à vérifier avec le client PoE FR réel d'Arnaud (liste en section 4).
  - Aucune donnée réelle française n'existe encore pour le parser d'objets — `fr/items.ndjson` et `fr/stats.ndjson` sont des copies anglaises, pas de vraies traductions.

---

## 8. Références externes

- Dépôt original : https://github.com/SnosMe/awakened-poe-trade
- Fork perso : https://github.com/Arnogorn/awakened-poe-trade
- DEVELOPING.md du projet (partiellement daté, cf. section 2 pour l'écart avec la CI réelle)
- CI de référence pour les commandes de build à jour : `.github/workflows/main.yml`
- Licence : MIT
