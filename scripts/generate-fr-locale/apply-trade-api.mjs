// Second pass, run AFTER generate-items.mjs / generate-stats.mjs.
//
// Fills what the game files could not translate using the official trade site
// catalogue (https://fr.pathofexile.com/api/trade/data/{items,stats}), and
// reports every place where the game text and the trade site text disagree.
//
// Why a second pass and not a full rewrite from the API:
// - the API has ONE text per trade stat id, while stats.ndjson needs every form
//   a copied item can show (e.g. "increased" AND "reduced" variants);
// - the API has no `advanced` text (client option "description de mod avancee");
// - the trade site wording is not always the copied item wording (seen on
//   Timeless Jewels). The game files stay the primary source for stats.
//
// Input: api/apien_*.json and api/apifr_*.json (saved by hand from the trade
// site, gitignored - Cloudflare blocks scripted downloads).
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_DATA = path.join(__dirname, '..', '..', 'renderer', 'public', 'data')
const API_DIR = path.join(__dirname, 'api')

const loadApi = (name) => JSON.parse(fs.readFileSync(path.join(API_DIR, `${name}.json`), 'utf-8')).result
const loadNdjson = (lang, name) => fs.readFileSync(path.join(REPO_DATA, lang, `${name}.ndjson`), 'utf-8')
  .split('\n').filter(Boolean).map(line => JSON.parse(line))

// ---------- items ----------
function applyItems () {
  const en = loadApi('apien_items').flatMap(g => g.entries)
  const fr = loadApi('apifr_items').flatMap(g => g.entries)
  // The en and fr catalogues have the same size but are NOT aligned by
  // position (an entry shift was found inside the armour group), so entries
  // are never joined by index. Base types are left to the game files
  // (BaseItemTypes is authoritative). Unique names are joined through their
  // base type: the fr base name comes from the game (BaseItemTypes), then the
  // uniques sharing that base are paired in order, only when both sides have
  // the same number of uniques on that base.
  const loadTable = (lang) => JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', lang, 'BaseItemTypes.json'), 'utf-8'))
  const frById = new Map(loadTable('French').map(r => [r.Id, r.Name]))
  const baseEnToFr = new Map()
  for (const r of loadTable('English')) if (r.Name && frById.get(r.Id)) baseEnToFr.set(r.Name, frById.get(r.Id))

  const groupUniques = (entries) => {
    const byBase = new Map()
    for (const e of entries) {
      if (!e.name || !e.type) continue
      if (!byBase.has(e.type)) byBase.set(e.type, [])
      byBase.get(e.type).push(e.name)
    }
    return byBase
  }
  const enUniques = groupUniques(en)
  const frUniques = groupUniques(fr)
  const enItems = loadNdjson('en', 'items')
  const frItems = loadNdjson('fr', 'items')
  const gameUnique = new Map()
  frItems.forEach((it, i) => {
    if (it.namespace === 'UNIQUE' && it.name !== enItems[i].name) gameUnique.set(it.refName, it.name)
  })
  const skippedBases = []
  const uniqueName = new Map()
  for (const [enBase, enNames] of enUniques) {
    const frNames = frUniques.get(baseEnToFr.get(enBase))
    if (!frNames || frNames.length !== enNames.length) continue
    if (enNames.length === 1) { uniqueName.set(enNames[0], frNames[0]); continue }
    // Several uniques on one base: only trust the pairing if every unique
    // already translated from the game lands on its known fr name.
    const consistent = enNames.every((n, i) => !gameUnique.has(n) || gameUnique.get(n) === frNames[i])
    if (consistent) enNames.forEach((n, i) => uniqueName.set(n, frNames[i]))
    else skippedBases.push(enBase)
  }
  const baseType = new Map() // intentionally empty: game data only

  let filled = 0
  const differs = []
  const out = frItems.map((item, i) => {
    const enItem = enItems[i]
    if (enItem.refName !== item.refName) throw new Error(`items.ndjson en/fr out of sync at line ${i + 1}`)
    const apiName = item.namespace === 'UNIQUE' ? uniqueName.get(item.refName) : baseType.get(item.refName)
    if (!apiName) return item
    if (item.name === enItem.name) { // still English
      filled++
      return { ...item, name: apiName }
    }
    if (item.name !== apiName) differs.push(`${item.namespace}::${item.refName}  |  jeu: ${JSON.stringify(item.name)}  |  site: ${JSON.stringify(apiName)}`)
    return item
  })
  fs.writeFileSync(path.join(REPO_DATA, 'fr', 'items.ndjson'), out.map(o => JSON.stringify(o)).join('\n') + '\n')
  const left = out.filter((o, i) => o.name === enItems[i].name).length
  return { filled, differs, left, total: out.length, skippedBases }
}

// ---------- stats ----------
function applyStats () {
  const enText = new Map(loadApi('apien_stats').flatMap(g => g.entries).map(e => [e.id, e.text]))
  const frText = new Map(loadApi('apifr_stats').flatMap(g => g.entries).map(e => [e.id, e.text]))

  const enStats = loadNdjson('en', 'stats')
  const frStats = loadNdjson('fr', 'stats')
  let filled = 0
  let pseudoReplaced = 0
  let total = 0
  let left = 0
  const differs = []

  function apiFor (stat) {
    // trade ids like "explicit.stat_123|3|125" are option variants of "explicit.stat_123"
    for (const ids of Object.values(stat.trade?.ids || {})) {
      for (const id of ids) {
        const base = id.split('|')[0]
        if (frText.has(base) && enText.has(base)) return { id: base, en: enText.get(base), fr: frText.get(base) }
      }
    }
    return null
  }

  function applyOne (enStat, frStat) {
    if (enStat.ref !== frStat.ref) throw new Error(`stats.ndjson en/fr out of sync at ref ${enStat.ref}`)
    const api = apiFor(enStat)
    const matchers = frStat.matchers.map((m, i) => {
      total++
      const enM = enStat.matchers[i]
      const trimmed = enM.string.trim()
      const trailing = enM.string.slice(trimmed.length)
      const stillEnglish = m.string === enM.string
      // Only use the site text for the matcher written exactly like the site's
      // English text (never for "reduced"/negated forms or other variants).
      if (!api || api.en !== trimmed) {
        if (stillEnglish) left++
        return m
      }
      if (api.id.startsWith('pseudo.')) {
        // Pseudo stats are trade site labels, not game text: the site IS the source.
        if (m.string !== api.fr + trailing) { pseudoReplaced++; return { ...m, string: api.fr + trailing } }
        return m
      }
      if (stillEnglish) {
        filled++
        return { ...m, string: api.fr + trailing } // `advanced` (if any) kept as-is
      }
      if (m.string.trim() !== api.fr) differs.push(`${api.id}  |  jeu: ${JSON.stringify(m.string.trim())}  |  site: ${JSON.stringify(api.fr)}`)
      return m
    })
    return { ...frStat, matchers }
  }

  const out = frStats.map((fr, i) => {
    const en = enStats[i]
    if ('stats' in fr) return { ...fr, stats: fr.stats.map((s, j) => applyOne(en.stats[j], s)) }
    return applyOne(en, fr)
  })
  fs.writeFileSync(path.join(REPO_DATA, 'fr', 'stats.ndjson'), out.map(o => JSON.stringify(o)).join('\n') + '\n')
  return { filled, pseudoReplaced, differs, left, total }
}

const items = applyItems()
const stats = applyStats()

const report = [
  'Trade site API pass (apply-trade-api.mjs)',
  `generated: ${new Date().toISOString()}`,
  '',
  `items: ${items.filled} filled from the site, ${items.left}/${items.total} still English`,
  `stats: ${stats.filled} matchers filled from the site, ${stats.pseudoReplaced} pseudo labels replaced by the site label, ${stats.left}/${stats.total} matchers still English`,
  '',
  `unique bases skipped (site order disagrees with game names): ${items.skippedBases.length} ${items.skippedBases.join(', ')}`,
  '',
  `=== items where game text and site text differ (game kept): ${items.differs.length} ===`,
  ...items.differs,
  '',
  `=== stats where game text and site text differ (game kept): ${stats.differs.length} ===`,
  ...stats.differs
]
fs.writeFileSync(path.join(__dirname, 'trade-api-fr.report.txt'), report.join('\n') + '\n')
console.log(report.slice(0, 5).join('\n'))
console.log(`Differences: items ${items.differs.length}, stats ${stats.differs.length} - see scripts/generate-fr-locale/trade-api-fr.report.txt`)
