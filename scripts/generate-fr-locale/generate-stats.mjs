import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { loadStatDescriptions, buildEnglishTextIndex } from './parse-stat-descriptions.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_DATA = path.join(__dirname, '..', '..', 'renderer', 'public', 'data')

// English Name -> French Name, built the same way generate-items.mjs joins
// BaseItemTypes/PassiveSkills rows (Id is the stable per-language join key).
function buildNameTranslation (tableName) {
  const loadJson = (lang) => JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', lang, `${tableName}.json`), 'utf-8'))
  const en = loadJson('English')
  const fr = loadJson('French')
  const idToFr = new Map(fr.map(r => [r.Id, r.Name]))
  const enNameToFr = new Map()
  for (const r of en) {
    if (r.Name && idToFr.has(r.Id) && !enNameToFr.has(r.Name)) enNameToFr.set(r.Name, idToFr.get(r.Id))
  }
  return enNameToFr
}

// Passive tree node names, for "Allocates {name}" (cluster/timeless jewels).
// Confirmed via the game's own StatDescriptions block `mod_granted_passive_hash`:
// EN "Allocates {0}" -> FR "Attribue {0}" (the {0} is a `passive_hash`-typed
// placeholder resolved client-side, not translatable text itself).
const passiveSkillNames = buildNameTranslation('PassiveSkills')

// Gem display names, for "+# to Level of all {gem} Gems" (Random Skill Gem
// mods). Confirmed via StatDescriptions block `random_skill_gem_level_+_index`:
// EN "+{0} to Level of all {1} Gems" -> FR "+{0} au Niveau de toutes les
// Gemmes {1}" ({1} is a `display_indexable_skill`-typed placeholder).
const gemNames = buildNameTranslation('BaseItemTypes')

// `ref` and `trade.ids` are shared identifiers used across every language's
// stats.ndjson (they come from the trade site's stat catalogue, not from a
// per-language source) - they must never be touched. Only `matchers[].string`
// (the actual in-game text a copied item can contain) is translated here, by
// finding the matching English variant text inside the extracted
// StatDescriptions blocks and taking the French text at the same position
// within that block (language blocks always list the same variants, in the
// same order, just with different text - verified against ru/stats.ndjson's
// existing translations before writing this).
function * walkStats (entries) {
  for (const e of entries) {
    if ('stats' in e) yield * walkStats(e.stats)
    else yield e
  }
}

function loadAllBlocks () {
  const dir = path.join(__dirname, 'raw', 'stat-descriptions')
  let blocks = []
  for (const file of fs.readdirSync(dir)) {
    blocks = blocks.concat(loadStatDescriptions(path.join(dir, file)))
  }
  return blocks
}

// A handful of "pseudo" trade stats (mod-count filters like "# Prefix
// Modifiers") are not game text at all - they're labels invented by the
// trade site's pseudo-stat catalogue, so they don't exist in
// StatDescriptions.txt. Small enough set to translate by hand.
const PSEUDO_LABELS = {
  '# Crafted Modifiers': "# Modificateurs d'Artisanat",
  '# Crafted Prefix Modifiers': "# Préfixes d'Artisanat",
  '# Crafted Suffix Modifiers': "# Suffixes d'Artisanat",
  '# Empty Modifiers': '# Modificateurs vides',
  '# Empty Prefix Modifiers': '# Préfixes vides',
  '# Empty Suffix Modifiers': '# Suffixes vides',
  '# Enchant Modifiers': "# Modificateurs d'Enchantement",
  '# Fractured Modifiers': '# Modificateurs fracturés',
  '# Implicit Modifiers': '# Modificateurs implicites',
  '# Prefix Modifiers': '# Préfixes',
  '# Suffix Modifiers': '# Suffixes',
  '# Modifiers': '# Modificateurs',
  '# Notable Passive Skills': '# Talents notables',
  '# total Elemental Resistances': '# Résistances élémentaires totales',
  '# total Resistances': '# Résistances totales',
  '# Life Regenerated per Second': '# Vie régénérée par seconde',
  '+# total maximum Life': '+# Vie maximale totale',
  '+# total maximum Mana': '+# Mana maximal total',
  '+# total maximum Energy Shield': "+# Bouclier d'énergie maximal total",
  '+# total to Strength': '+# Force totale',
  '+# total to Dexterity': '+# Dextérité totale',
  '+# total to Intelligence': '+# Intelligence totale',
  '+# total to all Attributes': '+# à tous les Attributs, au total',
  '+#% total to Fire Resistance': '+#% Résistance au feu totale',
  '+#% total to Cold Resistance': '+#% Résistance au froid totale',
  '+#% total to Lightning Resistance': '+#% Résistance à la foudre totale',
  '+#% total to Chaos Resistance': '+#% Résistance au chaos totale',
  '+#% total to all Elemental Resistances': '+#% à toutes les Résistances élémentaires, au total',
  '+#% total Resistance': '+#% Résistance totale',
  '+#% total Elemental Resistance': '+#% Résistance élémentaire totale',
  '+#% total Attack Speed': "+#% Vitesse d'Attaque totale",
  '+#% total Cast Speed': "+#% Vitesse d'Incantation totale",
  '+#% Global Critical Strike Chance': '+#% Chance globale de Coup critique',
  '+#% Global Critical Strike Multiplier': '+#% Multiplicateur global de Coup critique'
}

// Checked from most to least specific: the Forbidden Flame/Flesh (Timeless
// Jewel) variants must be tried before the bare "Allocates {0}" pattern, or
// their " if you have..." clause would be swallowed into the capture group
// and fail the PassiveSkills name lookup.
const ALLOCATES_PATTERNS = [
  {
    // StatDescriptions `unique_jewel_grants_notable_hash_part_2`
    re: /^Allocates (.+) if you have the matching modifier on Forbidden Flame$/,
    fr: name => `Attribue ${name} si vous avez un modificateur similaire sur Flamme interdite`
  },
  {
    // StatDescriptions `unique_jewel_grants_notable_hash_part_1`
    re: /^Allocates (.+) if you have the matching modifier on Forbidden Flesh$/,
    fr: name => `Attribue ${name} si vous avez un modificateur similaire sur Chair interdite`
  },
  {
    // StatDescriptions `mod_granted_passive_hash`
    re: /^Allocates (.+)$/,
    fr: name => `Attribue ${name}`
  }
]
const GEM_LEVEL_RE = /^# to Level of all (.+) Gems$/

// Returns { text, source } where `source` is:
//   'game-data'         - found verbatim in an extracted StatDescriptions
//                          block, i.e. real text from the French game client.
//   'game-data-passive' - "Allocates {0}" (StatDescriptions block
//                          `mod_granted_passive_hash`, FR "Attribue {0}"),
//                          with {0} substituted from the real PassiveSkills
//                          table (same join as generate-items.mjs).
//   'game-data-gem'     - "+{0} to Level of all {1} Gems" (StatDescriptions
//                          block `random_skill_gem_level_+_index`, FR "+{0}
//                          au Niveau de toutes les Gemmes {1}"), with {1}
//                          substituted from BaseItemTypes.
//   'pseudo-label'      - hand-translated by this script's author (no in-game
//                          source exists for these), NOT verified against the
//                          actual client - review before trusting.
// or null if nothing matched (kept in English).
function translateMatcherString (str, textIndex) {
  const trimmed = str.trim()
  const trailingSpace = str.length !== trimmed.length ? str.slice(trimmed.length) : ''

  const candidates = textIndex.get(trimmed)
  if (candidates && candidates.length) {
    for (const block of candidates) {
      const enVariants = block.langs.English || []
      const frVariants = block.langs.French || []
      if (frVariants.length !== enVariants.length) continue
      const idx = enVariants.findIndex(v => v.text === trimmed)
      if (idx === -1 || !frVariants[idx]) continue
      return { text: frVariants[idx].text + trailingSpace, source: 'game-data' }
    }
  }

  for (const { re, fr: buildFr } of ALLOCATES_PATTERNS) {
    const m = trimmed.match(re)
    if (m) {
      const frName = passiveSkillNames.get(m[1])
      if (frName) return { text: buildFr(frName) + trailingSpace, source: 'game-data-passive' }
      break // matched this shape but no name translation - don't fall through to a looser pattern
    }
  }

  const gemLevelMatch = trimmed.match(GEM_LEVEL_RE)
  if (gemLevelMatch) {
    const fr = gemNames.get(gemLevelMatch[1])
    if (fr) return { text: `# au Niveau de toutes les Gemmes ${fr}${trailingSpace}`, source: 'game-data-gem' }
  }

  if (PSEUDO_LABELS[trimmed]) {
    return { text: PSEUDO_LABELS[trimmed] + trailingSpace, source: 'pseudo-label' }
  }

  return null
}

function main () {
  const blocks = loadAllBlocks()
  const textIndex = buildEnglishTextIndex(blocks)

  const enRaw = fs.readFileSync(path.join(REPO_DATA, 'en', 'stats.ndjson'), 'utf-8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line))

  let totalMatchers = 0
  const countBySource = { 'game-data': 0, 'game-data-passive': 0, 'game-data-gem': 0, 'pseudo-label': 0 }
  const untranslated = []
  const pseudoLabelUsed = []

  function translateEntry (entry) {
    const newMatchers = entry.matchers.map(m => {
      totalMatchers++
      const result = translateMatcherString(m.string, textIndex)
      if (result != null) {
        countBySource[result.source]++
        if (result.source === 'pseudo-label') {
          pseudoLabelUsed.push(`${entry.ref}  |  matcher: ${JSON.stringify(m.string)} -> ${JSON.stringify(result.text)}`)
        }
        return { ...m, string: result.text }
      }
      untranslated.push(`${entry.ref}  |  matcher: ${JSON.stringify(m.string)}`)
      return m // fallback: keep English text
    })
    return { ...entry, matchers: newMatchers }
  }

  function translateTop (entry) {
    if ('stats' in entry) {
      return { ...entry, stats: entry.stats.map(translateEntry) }
    }
    return translateEntry(entry)
  }

  const outLines = enRaw.map(entry => JSON.stringify(translateTop(entry)))

  fs.mkdirSync(path.join(REPO_DATA, 'fr'), { recursive: true })
  fs.writeFileSync(path.join(REPO_DATA, 'fr', 'stats.ndjson'), outLines.join('\n') + '\n')

  const fromGameData = countBySource['game-data']
  const fromPassive = countBySource['game-data-passive']
  const fromGem = countBySource['game-data-gem']
  const fromPseudoLabel = countBySource['pseudo-label']
  const translatedMatchers = fromGameData + fromPassive + fromGem + fromPseudoLabel
  const pct = (100 * translatedMatchers / totalMatchers).toFixed(1)
  const pctGameData = (100 * (fromGameData + fromPassive + fromGem) / totalMatchers).toFixed(1)
  const reportLines = [
    'stats.ndjson (fr) coverage report',
    `generated: ${new Date().toISOString()}`,
    `translated matchers: ${translatedMatchers} / ${totalMatchers} (${pct}%)`,
    `  - from real game data (Metadata/StatDescriptions/*.txt, French client text): ${fromGameData + fromPassive + fromGem} (${pctGameData}%)`,
    `      - direct StatDescriptions text match: ${fromGameData}`,
    `      - "Allocates {passive}" via PassiveSkills table join: ${fromPassive}`,
    `      - "+# to Level of all {gem} Gems" via BaseItemTypes table join: ${fromGem}`,
    `  - hand-translated "pseudo" trade-filter labels, NOT sourced from the game (see below, review these): ${fromPseudoLabel}`,
    '',
    '=== hand-translated pseudo labels - NOT verified against the real game/trade site, review before trusting ===',
    ...pseudoLabelUsed,
    '',
    '=== untranslated matchers (kept in English, "ref  |  matcher: text") ===',
    ...untranslated
  ]
  fs.writeFileSync(path.join(__dirname, 'untranslated-stats-fr.report.txt'), reportLines.join('\n') + '\n')

  console.log('Wrote renderer/public/data/fr/stats.ndjson')
  console.log(`Coverage: ${translatedMatchers} / ${totalMatchers} matchers (${pct}%)`)
  console.log(`  - from real game data: ${fromGameData + fromPassive + fromGem} (${pctGameData}%)`)
  console.log(`  - hand-translated pseudo labels (unverified): ${fromPseudoLabel}`)
  console.log('Full report: scripts/generate-fr-locale/untranslated-stats-fr.report.txt')
}

main()
