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

// translateMatcherString() below picks the FIRST candidate block in
// textIndex.get(text) whose variant count matches (see parse-stat-descriptions.mjs
// buildEnglishTextIndex). Several of the 13 StatDescriptions files define a block
// with the EXACT SAME English text as another file but a genuinely different
// French translation - found by an exhaustive cross-file comparison (2026-07-23,
// 77 conflicting English texts). Concretely: `damage_+%` ("{0}% increased
// Damage") exists both in `stat_descriptions.txt` (FR "d'Augmentation de
// Dégâts", generic item mod) and in `active_skill_gem_stat_descriptions.txt`
// (FR "d'Augmentation des Dégâts" - an extra "s"), and since files were read in
// `fs.readdirSync` (alphabetical) order, the skill-gem-tooltip file's block won
// EVERY match of this text throughout stats.ndjson, including on plain item
// mods (e.g. a rare Jewel's fractured/implicit "10% increased Damage" line -
// confirmed broken in Arnaud's real client, 2026-07-23).
//
// Parser.ts only ever parses text copied from an ITEM's clipboard tooltip -
// never a skill gem's own stat panel, a passive tree node's tooltip, or a
// monster's ability tooltip. So among files sharing identical English text,
// the ones describing actual copyable item mods must always win. Order below:
// generic item mods first, then other item-type files (all genuinely
// copyable), with the non-item/tooltip-only files pushed last as a fallback
// (kept only for refs that exist nowhere else - never should out-rank a
// legitimate item-mod source on a shared text).
const FILE_PRIORITY = [
  'stat_descriptions.txt',
  'map_stat_descriptions.txt',
  'atlas_stat_descriptions.txt',
  'heist_equipment_stat_descriptions.txt',
  'tincture_stat_descriptions.txt',
  'sentinel_stat_descriptions.txt',
  'necropolis_stat_descriptions.txt',
  'expedition_relic_stat_descriptions.txt',
  // Below: skill/gem/passive-tree/monster tooltip text, never copyable item
  // text - lowest priority, present only as a last-resort fallback.
  'active_skill_gem_stat_descriptions.txt',
  'gem_stat_descriptions.txt',
  'skill_stat_descriptions.txt',
  'passive_skill_stat_descriptions.txt',
  'monster_stat_descriptions.txt'
]

function loadAllBlocks () {
  const dir = path.join(__dirname, 'raw', 'stat-descriptions')
  const files = fs.readdirSync(dir)

  const missing = files.filter(f => !FILE_PRIORITY.includes(f))
  if (missing.length) {
    throw new Error(`loadAllBlocks: FILE_PRIORITY is missing file(s) present on disk: ${missing.join(', ')} - add them (see comment above) before regenerating.`)
  }

  let blocks = []
  for (const file of FILE_PRIORITY) {
    if (!files.includes(file)) continue
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

// Cluster Jewel implicit "Added Small Passive Skills grant: {sub-stat}" (e.g.
// "Added Small Passive Skills grant: 12% increased Fire Damage"). Confirmed
// via ClientStrings id `StatDescripotionTreeExpansionJewelGrantedSmallStat`
// (GGG's own typo, kept as-is): EN "Added Small Passive Skills grant: {0}"
// -> FR "Les Passifs mineurs ajoutés octroient: {0}" (verified against a real
// in-game screenshot from Arnaud, 2026-07-22). Unlike every other stat here,
// en/stats.ndjson stores this one as fully-resolved concrete text per
// `value` (one matcher per possible small passive) instead of a "#"-templated
// ref, because each small passive is a distinct enum choice, not a numeric
// range. So the `{0}` substat can't be looked up in the StatDescriptions
// index as-is: its numbers are normalized back to "#" to find the matching
// template, then the original numbers are substituted into the French text
// at the same positions.
const SMALL_PASSIVE_GRANT_EN = 'Added Small Passive Skills grant: '
const SMALL_PASSIVE_GRANT_FR = 'Les Passifs mineurs ajoutés octroient: '

function translateSmallPassiveGrant (trimmed, textIndex) {
  const lines = trimmed.split('\n')
  if (!lines.every(l => l.startsWith(SMALL_PASSIVE_GRANT_EN))) return null

  const frLines = []
  for (const line of lines) {
    const inner = line.slice(SMALL_PASSIVE_GRANT_EN.length)
    const normalized = inner.replace(/[+-]?\d+/g, '#')
    const candidates = textIndex.get(normalized)
    if (!candidates || !candidates.length) return null

    let frText = null
    for (const block of candidates) {
      const enVariants = block.langs.English || []
      const frVariants = block.langs.French || []
      if (frVariants.length !== enVariants.length) continue
      const idx = enVariants.findIndex(v => v.text === normalized)
      if (idx === -1 || !frVariants[idx]) continue
      const nums = inner.match(/[+-]?\d+/g) || []
      let ni = 0
      frText = frVariants[idx].text.replace(/#/g, () => (ni < nums.length ? nums[ni++] : '#'))
      break
    }
    if (frText === null) return null
    frLines.push(SMALL_PASSIVE_GRANT_FR + frText)
  }
  return frLines.join('\n')
}

function commonPrefixLen (a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function commonSuffixLen (a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

// `matchers[].advanced` (used when the player has "Advanced Mod Descriptions"
// enabled in-game, e.g. Arnaud's client) is a second copy of `string` with a
// "(RangeStart-RangeEnd)" annotation spliced in - e.g. gem-level mods show
// "(Fireball-Divine Blast)", Timeless Jewel conqueror mods show
// "(Avarius-Maxarius)". It has no dedicated entry in StatDescriptions.txt (it's
// computed by whatever built en/stats.ndjson from the game's real min/max
// possible values for that mod), so it can't be looked up the normal way.
// Verified across every `advanced` field currently in en/stats.ndjson
// (499 total): 480 are a single splice of `string` (the rest touch multiple
// spots and are left alone below). This finds the same anchor text in the
// already-translated French `string` and splices the annotation in at the
// same spot. `knownAnchorFr`, when the caller already has the exact French
// phrase from a table join (gem/passive name), is used as-is; otherwise the
// anchor is guessed as the trailing word run right before the splice point
// in English, which only works if that word is itself untranslated in
// French (true for NPC names, e.g. Timeless Jewel conquerors).
// Whether the annotation ITSELF needs translating varies by mod family: for
// Timeless Jewel conquerors it's an untranslated proper noun (confirmed
// identical across German/Spanish/Portuguese/Russian StatDescriptions
// blocks), spliced verbatim by default. Gem-level mods are the opposite -
// their annotation is a pair of *gem* names, which ARE translated in French
// (confirmed via a real "+3 to Level of all Spark Gems" amulet, Arnaud,
// 2026-07-22: real advanced text is "(Boule de feu-Déflagration divine)",
// not the English "(Fireball-Divine Blast)" this function used to splice in
// verbatim) - pass `transformAnnotation` to translate it before splicing.
// GGG's own `stat_descriptions.txt` sometimes defines the exact same stat id
// TWICE, with genuinely different French text between the two blocks - unlike
// FILE_PRIORITY (different files, different context) or the `old_do_not_use`
// prefix (clearly-marked legacy ids), there is no naming signal to resolve
// these automatically: `textIndex` just returns the first-encountered block,
// which is arbitrary. Confirmed via a real screenshot (Arnaud, 2026-07-23,
// "The Living Blade" unique sword's "Cannot be Poisoned" implicit) that the
// SECOND `cannot_be_poisoned` block (line ~131381) is correct, not the first
// (line ~71519, "Immunité à l'Empoisonnement" - what this repo generated
// before this fix). Cross-checked against poewiki.net/wiki/Poison, which
// notes this exact wording/unique is the sole user of this stat. At least 15
// other same-file duplicate-id cases exist (see PROJECT_CONTEXT.md) - do NOT
// assume "last wins" is a safe general rule from this one example (a couple
// of the others look like the FIRST block is the correct/current one instead)
// - only add an entry here once a specific case is confirmed against a real
// client capture, the same discipline as TIMELESS_JEWEL_HISTORIC_ADVANCED above.
const CONFIRMED_TEXT_OVERRIDES = {
  'Cannot be Poisoned': 'Vous ne pouvez pas être Empoisonné'
}

function deriveAdvancedText (enString, enAdvanced, frString, knownAnchorFr, transformAnnotation) {
  if (enAdvanced === undefined || enAdvanced === enString) return undefined

  const prefixLen = commonPrefixLen(enString, enAdvanced)
  const suffixLen = commonSuffixLen(enString, enAdvanced)
  if (prefixLen + suffixLen !== enString.length) return undefined // more than one splice point - don't guess

  let annotation = enAdvanced.slice(prefixLen, enAdvanced.length - suffixLen)
  if (transformAnnotation) annotation = transformAnnotation(annotation)
  const anchorFr = knownAnchorFr || (enString.slice(0, prefixLen).match(/([A-Za-zÀ-ÿ'’-]+)\s*$/) || [])[1]
  if (!anchorFr) return undefined

  const firstIdx = frString.indexOf(anchorFr)
  if (firstIdx === -1 || frString.indexOf(anchorFr, firstIdx + 1) !== -1) return undefined // not found, or ambiguous

  const insertAt = firstIdx + anchorFr.length
  return frString.slice(0, insertAt) + annotation + frString.slice(insertAt)
}

// Translates the "(GemA-GemB)" gem-name-range annotation used by gem-level
// mods' `advanced` text (see deriveAdvancedText above) via the same
// `gemNames` table join used for the mod text itself. Falls back to the
// English name if a gem isn't found (shouldn't happen in practice since
// Fireball/Divine Blast - the two names seen so far - are both regular
// BaseItemTypes entries), rather than dropping the whole annotation.
function translateGemNameRangeAnnotation (annotation) {
  const m = annotation.match(/^\(([^-]+)-([^)]+)\)$/)
  if (!m) return annotation
  const [, a, b] = m
  return `(${gemNames.get(a) ?? a}-${gemNames.get(b) ?? b})`
}

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
// or null if nothing matched (kept in English). `matcher` is the raw English
// matcher object (not just its `.string`), needed so successful branches can
// also derive `matcher.advanced`'s French counterpart (see deriveAdvancedText).
function translateMatcherString (matcher, textIndex) {
  const str = matcher.string
  const trimmed = str.trim()
  const trailingSpace = str.length !== trimmed.length ? str.slice(trimmed.length) : ''

  if (CONFIRMED_TEXT_OVERRIDES[trimmed]) {
    const text = CONFIRMED_TEXT_OVERRIDES[trimmed] + trailingSpace
    const advanced = deriveAdvancedText(str, matcher.advanced, text)
    return { text, source: 'game-data', advanced }
  }

  const candidates = textIndex.get(trimmed)
  if (candidates && candidates.length) {
    for (const block of candidates) {
      const enVariants = block.langs.English || []
      const frVariants = block.langs.French || []
      if (frVariants.length !== enVariants.length) continue
      const idx = enVariants.findIndex(v => v.text === trimmed)
      if (idx === -1 || !frVariants[idx]) continue
      const text = frVariants[idx].text + trailingSpace
      const advanced = deriveAdvancedText(str, matcher.advanced, text)
      return { text, source: 'game-data', advanced }
    }
  }

  for (const { re, fr: buildFr } of ALLOCATES_PATTERNS) {
    const m = trimmed.match(re)
    if (m) {
      const frName = passiveSkillNames.get(m[1])
      if (frName) {
        const text = buildFr(frName) + trailingSpace
        const advanced = deriveAdvancedText(str, matcher.advanced, text, frName)
        return { text, source: 'game-data-passive', advanced }
      }
      break // matched this shape but no name translation - don't fall through to a looser pattern
    }
  }

  const gemLevelMatch = trimmed.match(GEM_LEVEL_RE)
  if (gemLevelMatch) {
    const fr = gemNames.get(gemLevelMatch[1])
    if (fr) {
      const text = `# au Niveau de toutes les Gemmes ${fr}${trailingSpace}`
      const advanced = deriveAdvancedText(str, matcher.advanced, text, fr, translateGemNameRangeAnnotation)
      return { text, source: 'game-data-gem', advanced }
    }
  }

  const smallPassiveGrantFr = translateSmallPassiveGrant(trimmed, textIndex)
  if (smallPassiveGrantFr) {
    return { text: smallPassiveGrantFr + trailingSpace, source: 'game-data-small-passive-grant' }
  }

  if (PSEUDO_LABELS[trimmed]) {
    return { text: PSEUDO_LABELS[trimmed] + trailingSpace, source: 'pseudo-label' }
  }

  return null
}

// Timeless Jewel "historic" mods (Foi militante/Vanité glorieuse/Fierté
// fatale/Orgueil élégant/Retenue brutale/Tragédie héroïque - the 2-line
// "commander" mod + "Passives in radius are Conquered by X"). `advanced`
// can't be derived from `string` by splicing an annotation like every other
// stat here (see deriveAdvancedText above): confirmed by Arnaud pasting real
// advanced-mode clipboard text (client option "description de mod avancée")
// for one commander per family, that the French client uses a genuinely
// different sentence in advanced mode for 5 of the 6 families, not just
// `string` + "(NameRange)" - e.g. Foi militante goes from "Gravé pour
// glorifier..." (string) to "A été gravé à la gloire de..." (advanced), a
// different verb entirely, not an insertion. Exhaustively searched: this
// alternate wording doesn't exist anywhere in the extracted
// StatDescriptions/*.txt files (only `string` does, verified char-for-char),
// nor in Mods.dat (no free-text column), nor in the ReminderText table
// (that one only covers the separate "(Conquered Passive Skills cannot be
// modified...)" parenthetical, already handled fine by the parenthetical-
// skipping logic in linesToStatStrings). No extractable source found, so
// this is hand-transcribed from real screenshots (2026-07-22, one commander
// captured per family in CapturePOE/<family>.png) and generalized to every
// commander in that family - the "(NameRange)" annotation is family-constant
// (verified identical across every commander of a family in en/stats.ndjson)
// and the per-family sentence change (or lack thereof) is assumed constant
// across a family's commanders, consistent with how `string` itself only
// varies by the commander's name within a family.
// Tragédie héroïque (Kalguur) is deliberately absent: its captured advanced
// text was identical to `string` + a plain annotation splice, i.e. exactly
// what deriveAdvancedText already produces - no override needed there.
const TIMELESS_JEWEL_HISTORIC_ADVANCED = {
  'Bathed in the blood of # sacrificed in the name of Ahuana':
    'Baigné dans le sang de # sacrifiés au nom de Ahuana(Ahuana-Xibaqua)\nLes Talents dans le Rayon sont conquis par les Vaal',
  'Bathed in the blood of # sacrificed in the name of Doryani':
    'Baigné dans le sang de # sacrifiés au nom de Doryani(Ahuana-Xibaqua)\nLes Talents dans le Rayon sont conquis par les Vaal',
  'Bathed in the blood of # sacrificed in the name of Xibaqua':
    'Baigné dans le sang de # sacrifiés au nom de Xibaqua(Ahuana-Xibaqua)\nLes Talents dans le Rayon sont conquis par les Vaal',

  'Carved to glorify # new faithful converted by High Templar Avarius':
    'A été gravé à la gloire de # nouveaux croyants convertis par le Haut Templier Avarius(Avarius-Maxarius)\nLes Talents dans le Rayon sont conquis par les templiers',
  'Carved to glorify # new faithful converted by High Templar Dominus':
    'A été gravé à la gloire de # nouveaux croyants convertis par le Haut Templier Dominus(Avarius-Maxarius)\nLes Talents dans le Rayon sont conquis par les templiers',
  'Carved to glorify # new faithful converted by High Templar Maxarius':
    'A été gravé à la gloire de # nouveaux croyants convertis par le Haut Templier Maxarius(Avarius-Maxarius)\nLes Talents dans le Rayon sont conquis par les templiers',

  'Commanded leadership over # warriors under Akoya':
    'A dirigé # guerriers de Akoya(Akoya-Rakiata)\nLes Talents dans le Rayon sont conquis par les karuis',
  'Commanded leadership over # warriors under Kaom':
    'A dirigé # guerriers de Kaom(Akoya-Rakiata)\nLes Talents dans le Rayon sont conquis par les karuis',
  'Commanded leadership over # warriors under Rakiata':
    'A dirigé # guerriers de Rakiata(Akoya-Rakiata)\nLes Talents dans le Rayon sont conquis par les karuis',

  'Commissioned # coins to commemorate Cadiro':
    "A commandé # pièces pour commémorer Cadiro(Cadiro-Victario)\nLes Talents dans le Rayon sont conquis par l'Empire éternel",
  'Commissioned # coins to commemorate Caspiro':
    "A commandé # pièces pour commémorer Caspiro(Cadiro-Victario)\nLes Talents dans le Rayon sont conquis par l'Empire éternel",
  'Commissioned # coins to commemorate Victario':
    "A commandé # pièces pour commémorer Victario(Cadiro-Victario)\nLes Talents dans le Rayon sont conquis par l'Empire éternel",

  'Denoted service of # dekhara in the akhara of Asenath':
    "A commémoré le service de # dekharas de l'akhara de Asenath(Asenath-Nasima)\nLes Talents dans le Rayon sont conquis par les marakeths",
  'Denoted service of # dekhara in the akhara of Balbala':
    "A commémoré le service de # dekharas de l'akhara de Balbala(Asenath-Nasima)\nLes Talents dans le Rayon sont conquis par les marakeths",
  'Denoted service of # dekhara in the akhara of Nasima':
    "A commémoré le service de # dekharas de l'akhara de Nasima(Asenath-Nasima)\nLes Talents dans le Rayon sont conquis par les marakeths"
}

function main () {
  const blocks = loadAllBlocks()
  const textIndex = buildEnglishTextIndex(blocks)

  const enRaw = fs.readFileSync(path.join(REPO_DATA, 'en', 'stats.ndjson'), 'utf-8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line))

  let totalMatchers = 0
  const countBySource = { 'game-data': 0, 'game-data-passive': 0, 'game-data-gem': 0, 'game-data-small-passive-grant': 0, 'pseudo-label': 0 }
  const untranslated = []
  const pseudoLabelUsed = []
  let advancedDerived = 0
  let advancedOverridden = 0

  function translateEntry (entry) {
    const advancedOverride = TIMELESS_JEWEL_HISTORIC_ADVANCED[entry.ref]
    const newMatchers = entry.matchers.map(m => {
      totalMatchers++
      const result = translateMatcherString(m, textIndex)
      if (result != null) {
        countBySource[result.source]++
        if (result.source === 'pseudo-label') {
          pseudoLabelUsed.push(`${entry.ref}  |  matcher: ${JSON.stringify(m.string)} -> ${JSON.stringify(result.text)}`)
        }
        const newM = { ...m, string: result.text }
        if (result.advanced !== undefined) {
          newM.advanced = result.advanced
          advancedDerived++
        }
        if (advancedOverride !== undefined && m.advanced !== undefined) {
          newM.advanced = advancedOverride
          advancedOverridden++
        }
        return newM
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
  const fromSmallPassiveGrant = countBySource['game-data-small-passive-grant']
  const fromPseudoLabel = countBySource['pseudo-label']
  const translatedMatchers = fromGameData + fromPassive + fromGem + fromSmallPassiveGrant + fromPseudoLabel
  const pct = (100 * translatedMatchers / totalMatchers).toFixed(1)
  const pctGameData = (100 * (fromGameData + fromPassive + fromGem + fromSmallPassiveGrant) / totalMatchers).toFixed(1)
  const reportLines = [
    'stats.ndjson (fr) coverage report',
    `generated: ${new Date().toISOString()}`,
    `translated matchers: ${translatedMatchers} / ${totalMatchers} (${pct}%)`,
    `  - from real game data (Metadata/StatDescriptions/*.txt, French client text): ${fromGameData + fromPassive + fromGem + fromSmallPassiveGrant} (${pctGameData}%)`,
    `      - direct StatDescriptions text match: ${fromGameData}`,
    `      - "Allocates {passive}" via PassiveSkills table join: ${fromPassive}`,
    `      - "+# to Level of all {gem} Gems" via BaseItemTypes table join: ${fromGem}`,
    `      - "Added Small Passive Skills grant: {sub-stat}" via ClientStrings label + StatDescriptions template join: ${fromSmallPassiveGrant}`,
    `  - hand-translated "pseudo" trade-filter labels, NOT sourced from the game (see below, review these): ${fromPseudoLabel}`,
    `  - "advanced" (Advanced Mod Description mode) field re-derived alongside "string": ${advancedDerived}`,
    `      - of which hand-transcribed from real screenshots (Timeless Jewel historic mods, see TIMELESS_JEWEL_HISTORIC_ADVANCED): ${advancedOverridden}`,
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
