import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_DATA = path.join(__dirname, '..', '..', 'renderer', 'public', 'data')

// Maps each items.ndjson `namespace` to the game table that holds its
// translated display name, and how to join en -> fr for that table.
// (Verified empirically against the actual exported tables - see
// PROJECT_CONTEXT.md for how each namespace's coverage was confirmed.)
//
//   ITEM / DIVINATION_CARD / GEM  -> BaseItemTypes: Id is the stable join key,
//                                    Name is localized per language folder.
//   CAPTURED_BEAST                -> MonsterVarieties: same Id/Name pattern.
//   UNIQUE                        -> Words (Wordlist === 6 = unique item
//                                    names). `Text` is NOT localized (it's an
//                                    internal English reference used across
//                                    all languages); `Text2` is the actually
//                                    localized display name. There is no
//                                    stable Id column, so en/fr rows are
//                                    matched by array index - verified that
//                                    both language exports have identical row
//                                    counts and that GGG's per-language .dat
//                                    files always preserve row order.
//   GEM (transfigured variants)  -> GemEffects: fallback for gems whose
//                                    display name is not in BaseItemTypes at
//                                    all, e.g. "Arc of Oscillating" (a
//                                    Transfigured Gem). SkillGems.GemVariants
//                                    references GemEffects rows, and
//                                    GemEffects.Name is already the full
//                                    localized display name - same Id/Name
//                                    join pattern as BaseItemTypes.

function loadJson (relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', relPath), 'utf-8'))
}

function buildIdKeyedTranslation (tableName) {
  const en = loadJson(`English/${tableName}.json`)
  const fr = loadJson(`French/${tableName}.json`)
  const idToFr = new Map(fr.map(r => [r.Id, r.Name]))
  const enNameToFr = new Map()
  for (const r of en) {
    if (r.Name && idToFr.has(r.Id)) enNameToFr.set(r.Name, idToFr.get(r.Id))
  }
  return enNameToFr
}

// Merges two en->fr name maps, `primary` taking precedence on key clashes.
function mergeTranslations (primary, fallback) {
  const merged = new Map(fallback)
  for (const [k, v] of primary) merged.set(k, v)
  return merged
}

function buildUniqueNameTranslation () {
  const en = loadJson('English/Words.json')
  const fr = loadJson('French/Words.json')
  if (en.length !== fr.length) {
    throw new Error(`Words.json row count mismatch (en=${en.length}, fr=${fr.length}) - index-based matching is unsafe, aborting.`)
  }
  const enNameToFr = new Map()
  for (let i = 0; i < en.length; i++) {
    if (en[i].Wordlist === 6) enNameToFr.set(en[i].Text, fr[i].Text2)
  }
  return enNameToFr
}

function main () {
  const translationByNamespace = {
    ITEM: buildIdKeyedTranslation('BaseItemTypes'),
    DIVINATION_CARD: buildIdKeyedTranslation('BaseItemTypes'),
    GEM: mergeTranslations(buildIdKeyedTranslation('BaseItemTypes'), buildIdKeyedTranslation('GemEffects')),
    CAPTURED_BEAST: buildIdKeyedTranslation('MonsterVarieties'),
    UNIQUE: buildUniqueNameTranslation()
  }

  const enItems = fs.readFileSync(path.join(REPO_DATA, 'en', 'items.ndjson'), 'utf-8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line))

  const outLines = []
  const untranslated = []
  let translatedCount = 0

  for (const item of enItems) {
    const translation = translationByNamespace[item.namespace]
    const frName = translation ? translation.get(item.refName) : undefined
    if (frName) {
      translatedCount++
      outLines.push(JSON.stringify({ ...item, name: frName }))
    } else {
      untranslated.push(`${item.namespace}::${item.refName}`)
      outLines.push(JSON.stringify(item)) // fallback: keep English name as-is
    }
  }

  fs.mkdirSync(path.join(REPO_DATA, 'fr'), { recursive: true })
  fs.writeFileSync(path.join(REPO_DATA, 'fr', 'items.ndjson'), outLines.join('\n') + '\n')

  const byNamespace = {}
  for (const key of untranslated) {
    const ns = key.split('::')[0]
    byNamespace[ns] = (byNamespace[ns] || 0) + 1
  }

  const total = enItems.length
  const pct = (100 * translatedCount / total).toFixed(1)
  const reportLines = [
    `items.ndjson (fr) coverage report`,
    `generated: ${new Date().toISOString()}`,
    `translated: ${translatedCount} / ${total} (${pct}%)`,
    `untranslated by namespace: ${JSON.stringify(byNamespace)}`,
    '',
    'untranslated entries (kept in English, namespace::refName):',
    ...untranslated
  ]
  fs.writeFileSync(path.join(__dirname, 'untranslated-items-fr.report.txt'), reportLines.join('\n') + '\n')

  console.log(`Wrote renderer/public/data/fr/items.ndjson`)
  console.log(`Coverage: ${translatedCount} / ${total} (${pct}%)`)
  console.log(`Untranslated by namespace:`, byNamespace)
  console.log(`Full list: scripts/generate-fr-locale/untranslated-items-fr.report.txt`)
}

main()
