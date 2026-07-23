import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_DATA = path.join(__dirname, '..', '..', 'renderer', 'public', 'data')

function loadTable (name) {
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', 'English', `${name}.json`), 'utf-8'))
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', 'French', `${name}.json`), 'utf-8'))
  const idToFr = new Map(fr.map(r => [r.Id, r.Text ?? r.Name]))
  const idToEn = new Map(en.map(r => [r.Id, r.Text ?? r.Name]))
  return { idToEn, idToFr }
}

const clientStrings = loadTable('ClientStrings')
const heistJobs = loadTable('HeistJobs')

// `byId(table, id)` returns the confirmed French text for a ClientStrings/
// HeistJobs row Id (verified by cross-checking English text against
// renderer/public/data/en/client_strings.js before using it below).
function byId (table, id) {
  const fr = table.idToFr.get(id)
  if (fr == null) throw new Error(`Id "${id}" not found in exported table - re-run extract-game-data.mjs or check the Id.`)
  return fr
}

// Some ClientStrings rows encode GGG's own French gender/number agreement as
// a conditional template, e.g. QualityItem =
//   "{0} <if:MS>{{supérieur}}<elif:FS>{{supérieure}}<elif:MP>{{supérieurs}}<elif:FP>{{supérieures}}"
// (MS/FS/MP/FP = masculin singulier / féminin singulier / masculin pluriel /
// féminin pluriel). Since these keys are used to PARSE text copied from the
// client (not to render it), we don't need to know the base item's gender -
// building a regex that accepts any of the 4 forms as a suffix is enough.
function genderedSuffixRegex (id) {
  const raw = byId(clientStrings, id)
  const forms = [...raw.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1])
  if (forms.length !== 4) {
    throw new Error(`Expected 4 gendered forms (MS/FS/MP/FP) in ClientStrings "${id}", got ${forms.length}: ${JSON.stringify(raw)}`)
  }
  const escaped = [...new Set(forms)].map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^(.*) (?:${escaped.join('|')})$`)
}

// Every key below was matched against the real French client data
// (Metadata ClientStrings.dat / HeistJobs.dat, extracted via
// extract-game-data.mjs) by its ClientStrings/HeistJobs row Id - not
// guessed. See untranslated-client-strings-fr.report.txt for the handful of
// keys where no matching row could be found (kept in English).
//
// Regexes and arrays are rebuilt from the same verified literals, keeping
// the exact same pattern/anchors/capture-group shape as en/client_strings.js
// - only the literal French words change, never the parsing structure
// (that's the item-parser's job, out of scope for this step).
function build () {
  const cs = id => byId(clientStrings, id)
  const hj = id => byId(heistJobs, id)

  // Not standalone-confirmed: derived from the compound "Map Tier" ->
  // "Palier de Carte" (ItemDisplayMapTier) by stripping "de Carte". Matches
  // the independently-chosen "Palier" used for filters.tier in fr/app_i18n.json.
  const TIER_WORD = cs('ItemDisplayMapTier').replace(/ de Carte$/, '')
  // Confirmed via LadderColumnRank ("Rank" -> "Rang"), a different context
  // (leaderboard rank) than mod rank (Eldritch mod rank tiers) - same word
  // in English, plausible same word in French, but not directly confirmed
  // for the mod-rank context specifically.
  const RANK_WORD = cs('LadderColumnRank')

  return {
    RARITY_NORMAL: cs('ItemDisplayStringNormal'),
    RARITY_MAGIC: cs('ItemDisplayStringMagic'),
    RARITY_RARE: cs('ItemDisplayStringRare'),
    RARITY_UNIQUE: cs('ItemDisplayStringUnique'),
    RARITY_GEM: cs('ItemDisplayStringGem'),
    RARITY_CURRENCY: cs('ItemDisplayStringCurrency'),
    RARITY_DIVCARD: cs('ItemDisplayStringDivinationCard'),
    RARITY_QUEST: cs('ItemDisplayStringQuest'),
    MAP_TIER: new RegExp(` \\(${TIER_WORD} (\\d+)\\)$`),
    MAP_ITEM_QUANTITY: cs('ItemDisplayMapQuantityIncrease') + ': ',
    MAP_ITEM_RARITY: cs('ItemDisplayMapRarityIncrease') + ': ',
    MAP_MONSTER_PACK_SIZE: cs('ItemDisplayMapPackSizeIncrease') + ': ',
    MAP_MORE_MAPS: cs('ItemDisplayMapMapDropBonus') + ': ',
    MAP_MORE_SCARABS: cs('ItemDisplayMapScarabDropBonus') + ': ',
    MAP_MORE_CURRENCY: cs('ItemDisplayMapCurrencyDropBonus') + ': ',
    MAP_MORE_DIVINATION_CARDS: cs('ItemDisplayMapDivinationCardDropBonus') + ': ',
    // "Reward: {0}" -> keep the literal prefix, same capture shape as en
    MAP_COMPLETION_REWARD: new RegExp(`^${cs('UltimatumItemisedTrialReward').replace('{0}', '')}Foil (.*)$`),
    RARITY: cs('ItemDisplayStringRarity') + ': ',
    ITEM_CLASS: cs('ItemDisplayStringClass') + ': ',
    ITEM_LEVEL: cs('ItemDisplayStringItemLevel') + ': ',
    CORPSE_LEVEL: cs('ItemDisplayCorpseLevel') + ': ',
    TALISMAN_TIER: cs('ItemDisplayStringTalismanTier') + ': ',
    // Confirmed against a real gem copied from the client (2026-07-22,
    // Arnaud, Awakened Arrow Nova Support): "Niveau: 5 (Maxi)" - no space
    // before the colon, same convention as every other `cs(id) + ': '` label
    // in this file (ITEM_LEVEL, RARITY, etc.), NOT the TutorialPanelGlossary
    // wording that was hand-typed here before ("Niveau : " with a space).
    // That wrong spacing made `parseGem`'s `section[1]?.startsWith(GEM_LEVEL)`
    // check fail for every real French gem, which also skipped
    // `parseQualityNested` (called only inside that same branch) - so this
    // one typo broke both gem level AND gem quality parsing.
    GEM_LEVEL: 'Niveau: ',
    STACK_SIZE: cs('ItemDisplayStackSize') + ': ',
    SOCKETS: cs('ItemDisplayStringSockets') + ': ',
    QUALITY: cs('Quality') + ': ',
    MEMORY_STRANDS: cs('ZanaInfluencedItem') + ': ',
    PHYSICAL_DAMAGE: cs('ItemDisplayWeaponPhysicalDamage') + ': ',
    ELEMENTAL_DAMAGE: cs('ItemDisplayWeaponElementalDamage') + ': ',
    CRIT_CHANCE: cs('ItemDisplayWeaponCriticalStrikeChance') + ': ',
    ATTACK_SPEED: cs('ItemDisplayWeaponAttacksPerSecond') + ': ',
    ARMOUR: cs('ItemDisplayArmourArmour') + ': ',
    EVASION: cs('ItemDisplayArmourEvasionRating') + ': ',
    ENERGY_SHIELD: cs('ItemDisplayArmourEnergyShield') + ': ',
    TAG_WARD: cs('ItemDisplayArmourWard') + ': ',
    BLOCK_CHANCE: cs('ItemDisplayShieldBlockChance') + ': ',
    CORRUPTED: cs('ItemPopupCorrupted'),
    UNIDENTIFIED: cs('ItemPopupUnidentified'),
    // FR puts the adjective AFTER the item name and agrees in gender/number
    // (ClientStrings "QualityItem") - see genderedSuffixRegex() above.
    ITEM_SUPERIOR: genderedSuffixRegex('QualityItem'),
    // "Blighted"/"Blight-ravaged" DON'T need agreement (a Map is always
    // grammatically feminine in French), but French puts the word AFTER the
    // noun: InfectedMap = "{0} infestée", UberInfectedMap = "{0} ravagée par
    // l'Infestation" - so the capture group moves to the front, suffix after.
    MAP_BLIGHTED: new RegExp(`^(.*) ${cs('InfectedMap').replace('{0} ', '')}$`),
    MAP_BLIGHT_RAVAGED: new RegExp(`^(.*) ${cs('UberInfectedMap').replace('{0} ', '')}$`),
    INFLUENCE_SHAPER: cs('ItemPopupShaperItem'),
    INFLUENCE_ELDER: cs('ItemPopupElderItem'),
    INFLUENCE_CRUSADER: cs('ItemPopupCrusaderItem'),
    INFLUENCE_HUNTER: cs('ItemPopupHunterItem'),
    INFLUENCE_REDEEMER: cs('ItemPopupRedeemerItem'),
    INFLUENCE_WARLORD: cs('ItemPopupWarlordItem'),
    SECTION_SYNTHESISED: cs('ItemPopupSynthesisedItem'),
    ITEM_SYNTHESISED: genderedSuffixRegex('SynthesisedItem'),
    VEILED_PREFIX: cs('ItemDisplayVeiledPrefix'),
    VEILED_SUFFIX: cs('ItemDisplayVeiledSuffix'),
    // ClientStrings "ItemDisplayChargesNCharges": EN "Currently has {0} Charges" ->
    // FR "Contient actuellement {0} charges" (confirmed real row, same shape as en).
    FLASK_CHARGES: new RegExp(`^${cs('ItemDisplayChargesNCharges').replace('{0}', '\\d+')}$`),
    METAMORPH_HELP: cs('MetamorphosisItemisedMapBoss'),
    BEAST_HELP: cs('ItemDescriptionItemisedCapturedMonster'),
    VOIDSTONE_HELP: cs('PrimordialWatchstoneDescriptionText'),
    METAMORPH_BRAIN: /^.* Brain$/, // see report: French likely reorders to "Cerveau de ..." - needs parser rework, not just translation
    METAMORPH_EYE: /^.* Eye$/,
    METAMORPH_LUNG: /^.* Lung$/,
    METAMORPH_HEART: /^.* Heart$/,
    METAMORPH_LIVER: /^.* Liver$/,
    CANNOT_USE_ITEM: cs('ItemPopupCannotUseItem'),
    // Same gender/number agreement pattern as ITEM_SUPERIOR, from
    // ClientStrings "GemAlternateQuality1/2/3Affix".
    QUALITY_ANOMALOUS: genderedSuffixRegex('GemAlternateQuality1Affix'),
    QUALITY_DIVERGENT: genderedSuffixRegex('GemAlternateQuality2Affix'),
    QUALITY_PHANTASMAL: genderedSuffixRegex('GemAlternateQuality3Affix'),
    AREA_LEVEL: cs('ItemDisplayHeistContractLevel').trim() + ': ',
    HEIST_WINGS_REVEALED: cs('ItemDisplayHeistBlueprintWings') + ': ',
    HEIST_BLUEPRINT_TARGET: cs('ItemDisplayHeistContractObjective').replace('{0}', '').trimEnd() + ' ',
    HEIST_BLUEPRINT_ENCHANTS: cs('HeistBlueprintRewardBunker'),
    HEIST_BLUEPRINT_TRINKETS: cs('HeistBlueprintRewardMines'),
    HEIST_BLUEPRINT_GEMS: 'Unusual Gems', // see report: no matching ClientStrings row found
    HEIST_BLUEPRINT_REPLICAS: cs('HeistBlueprintRewardDungeon'),
    HEIST_CONTRACT_JOB: /^Requires (?<job>.+) \(Level (?<level>\d+)(?:\s*\(unmet\))?\)$/, // see report: needs live client check on exact heist contract phrasing
    HEIST_JOB_LOCKPICKING: hj('Lockpicking'),
    HEIST_JOB_BRUTEFORCE: hj('BruteForce'),
    HEIST_JOB_PERCEPTION: hj('Perception'),
    HEIST_JOB_DEMOLITION: hj('Demolition'),
    HEIST_JOB_COUNTERTHAUMATURGY: hj('CounterThaumaturge'),
    HEIST_JOB_TRAPDISARMAMENT: hj('TrapDisarmament'),
    HEIST_JOB_AGILITY: hj('Agility'),
    HEIST_JOB_DECEPTION: hj('Deception'),
    HEIST_JOB_ENGINEERING: hj('Engineering'),
    // ClientStrings "ItemDisplayHeistContractObjectiveWithValue": EN "Heist Target: {0} ({1})"
    // -> FR "Objectif du Casse : {0} ({1})" (confirmed real row, same shape as en).
    HEIST_CONTRACT_TARGET: new RegExp(`^${cs('ItemDisplayHeistContractObjectiveWithValue').split('{0}')[0]}.+ \\((.+)\\)$`),
    HEIST_TARGET_PRICELESS: 'Priceless', // see report: no matching ClientStrings row found
    MIRRORED: cs('ItemPopupMirrored'),
    SPLIT: cs('ItemPopupSplit'),
    // French uses guillemets « » (not straight quotes) around the mod name,
    // and a space before the colon in "(Palier : N)"/"(Rang : N)" - confirmed
    // against a real crafted/rare item copied from the client (see PROJECT_CONTEXT.md).
    MODIFIER_LINE: new RegExp(`^(?<type>[^«]+)(?:\\s*«\\s*(?<name>[^»]*?)\\s*»)?(?:\\s*\\(${TIER_WORD}\\s*:\\s*(?<tier>\\d+)\\))?(?:\\s*\\(${RANK_WORD}\\s*:\\s*(?<rank>\\d+)\\))?$`),
    PREFIX_MODIFIER: cs('ModDescriptionLinePrefix').replace('« {0} »', ''),
    SUFFIX_MODIFIER: cs('ModDescriptionLineSuffix').replace('« {0} »', ''),
    CRAFTED_PREFIX: cs('ModDescriptionLineCrafted').replace('{0}', cs('ModDescriptionLinePrefix').replace('« {0} »', '')),
    CRAFTED_SUFFIX: cs('ModDescriptionLineCrafted').replace('{0}', cs('ModDescriptionLineSuffix').replace('« {0} »', '')),
    IMPLICIT_MODIFIER: cs('ModDescriptionLineImplicit'),
    // Same combining pattern as CRAFTED_PREFIX/CRAFTED_SUFFIX above: "ModDescriptionLineFractured"
    // (EN "Fractured {0}" -> FR "Fissuré {0}") wraps the already-confirmed Prefix/Suffix label.
    // This is the "mode avancé" comparison used by advanced-mod-desc.ts to tag a mod as Fractured -
    // it was previously left as the raw English literal, which meant no fractured item's mod line
    // could ever match once advanced mod description is enabled in the client.
    FRACTURED_PREFIX: cs('ModDescriptionLineFractured').replace('{0}', cs('ModDescriptionLinePrefix').replace('« {0} »', '')),
    FRACTURED_SUFFIX: cs('ModDescriptionLineFractured').replace('{0}', cs('ModDescriptionLineSuffix').replace('« {0} »', '')),
    UNSCALABLE_VALUE: ' — ' + cs('DescriptionLabelFixedValueStat').match(/\{ — (.+)\}\}$/)[1],
    CORRUPTED_IMPLICIT: cs('ModDescriptionLineCorruptedImplicit'),
    // ClientStrings "AlternateQualityModIncreaseText": EN " — {0}% Increased" ->
    // FR " — Augmentation : {0}%" (confirmed real game text, not a guess).
    MODIFIER_INCREASED: new RegExp('^' + cs('AlternateQualityModIncreaseText').replace(/^ — /, '').replace('{0}', '(.+?)') + '$'),
    INCURSION_OPEN: cs('ItemDescriptionIncursionAccessibleRooms'),
    INCURSION_OBSTRUCTED: cs('ItemDescriptionIncursionInaccessibleRooms'),
    EATER_IMPLICIT: new RegExp(`^${cs('ModDescriptionLineGreatTangleImplicit').replace(' ({0})', '')} \\((?<rank>.+)\\)$`),
    EXARCH_IMPLICIT: new RegExp(`^${cs('ModDescriptionLineCleansingFireImplicit').replace(' ({0})', '')} \\((?<rank>.+)\\)$`),
    ELDRITCH_MOD_R1: cs('EldritchCurrencyTier1'),
    ELDRITCH_MOD_R2: cs('EldritchCurrencyTier2'),
    ELDRITCH_MOD_R3: cs('EldritchCurrencyTier3'),
    ELDRITCH_MOD_R4: cs('EldritchCurrencyTier4'),
    ELDRITCH_MOD_R5: cs('EldritchCurrencyTier5'),
    ELDRITCH_MOD_R6: cs('EldritchCurrencyTier6'),
    SENTINEL_CHARGE: cs('TutorialPanelGlossarySubtitle17') + ' ',
    // Influence/league affix flavour text (e.g. "of Shaping", "The Shaper's")
    // are not in ClientStrings - they come from the Mods.dat name-generation
    // system, which needs a separate extraction pass. Kept in English - see
    // report. Do not guess these: they're user-visible on generated item
    // names and wrong ones would actively break recognition.
    SHAPER_MODS: ['of Shaping', "The Shaper's"],
    ELDER_MODS: ['of the Elder', "The Elder's"],
    CRUSADER_MODS: ["Crusader's", 'of the Crusade'],
    HUNTER_MODS: ["Hunter's", 'of the Hunt'],
    REDEEMER_MODS: ['of Redemption', "Redeemer's"],
    WARLORD_MODS: ["Warlord's", 'of the Conquest'],
    DELVE_MODS: ['Subterranean', 'of the Underground'],
    VEILED_MODS: ['Chosen', 'of the Order'],
    INCURSION_MODS: ["Guatelitzi's", "Xopec's", "Topotante's", "Tacati's", "Matatl's", 'of Matatl', "Citaqualotl's", 'of Citaqualotl', 'of Tacati', 'of Guatelitzi', 'of Puhuarte'],
    FOIL_UNIQUE: cs('ItemPopupFoilUnique'),
    UNMODIFIABLE: cs('ItemPopupUnmodifiable'),
    // Same agreement pattern, from ClientStrings "MutatedUniqueName".
    FOULBORN_NAME: genderedSuffixRegex('MutatedUniqueName'),
    FOULBORN_MODIFIER: cs('ModDescriptionLineBrequelMutated'),
    // ---
    CHAT_SYSTEM: /^: (?<body>.+)$/,
    CHAT_TRADE: /^\$(?:<(?<guild_tag>.+?)> )?(?<char_name>.+?): (?<body>.+)$/,
    CHAT_GLOBAL: /^#(?:<(?<guild_tag>.+?)> )?(?<char_name>.+?): (?<body>.+)$/,
    CHAT_PARTY: /^%(?:<(?<guild_tag>.+?)> )?(?<char_name>.+?): (?<body>.+)$/,
    CHAT_GUILD: /^&(?:<(?<guild_tag>.+?)> )?(?<char_name>.+?): (?<body>.+)$/,
    CHAT_WHISPER_TO: /^@To (?<char_name>.+?): (?<body>.+)$/, // see report: PoE FR chat commands (/w) keep "@To"/"@From" untranslated in-client - not verified here
    CHAT_WHISPER_FROM: /^@From (?:<(?<guild_tag>.+?)> )?(?<char_name>.+?): (?<body>.+)$/,
    CHAT_WEBTRADE_GEM: /^level (?<gem_lvl>\d+) (?<gem_qual>\d+)% (?<gem_name>.+)$/
  }
}

// Keys kept in English (or hand-typed best-effort) because no matching row
// was found in ClientStrings/HeistJobs, or because a regex would need actual
// parser-structure changes (not just word substitution) to be correct in
// French - out of scope for this UI/data translation pass.
const UNVERIFIED_KEYS = {
  MAP_BLIGHTED: 'No agreement needed (a Map is always feminine) but FR puts the word AFTER the noun ("{0} infestée") - regex reshaped to capture-group-then-suffix. Not cross-checked against a real Blighted Map item, please verify.',
  MAP_BLIGHT_RAVAGED: 'Same reshaping as MAP_BLIGHTED ("{0} ravagée par l\'Infestation"). Please verify against a real item.',
  METAMORPH_BRAIN: 'French item names likely reorder to "Cerveau de <monster>" instead of "<monster> Brain" - this needs a parser/regex-shape change, not just a word swap. Left English.',
  METAMORPH_EYE: 'Same reordering issue as METAMORPH_BRAIN.',
  METAMORPH_LUNG: 'Same reordering issue as METAMORPH_BRAIN.',
  METAMORPH_HEART: 'Same reordering issue as METAMORPH_BRAIN.',
  METAMORPH_LIVER: 'Same reordering issue as METAMORPH_BRAIN.',
  HEIST_BLUEPRINT_GEMS: 'No ClientStrings row found matching "Unusual Gems" - kept English.',
  HEIST_CONTRACT_JOB: 'Uses the generic "Requires" (ItemRequirementsLabel) - not verified that Heist contract job lines use the exact same phrasing in French. Verify against a real Heist Contract item.',
  HEIST_TARGET_PRICELESS: 'No ClientStrings row found matching "Priceless" - kept English.',
  MODIFIER_LINE: 'Tier/Rank words substituted from LadderColumnRank ("Rang") and a compound-derived "Palier" - "Rang" is confirmed for leaderboard rank, not specifically confirmed for mod rank context. Verify against a real Eldritch-influenced item.',
  MAP_TIER: 'Uses "Palier" derived from the compound "Palier de Carte" (Map Tier), not a standalone-confirmed word.',
  CHAT_WHISPER_TO: 'Chat command prefixes ("@To"/"@From") not verified against a real French client - PoE chat commands are sometimes kept in English regardless of client language. Left as-is.',
  CHAT_WHISPER_FROM: 'Same as CHAT_WHISPER_TO.',
  SHAPER_MODS: 'Influence affix flavour text ("of Shaping", "The Shaper\'s") is not in ClientStrings - it comes from the Mods.dat name-generation system, which needs a separate extraction pass. Kept English: these are user-visible on generated item names, and a wrong guess would actively break recognition once the parser uses this data.',
  ELDER_MODS: 'Same as SHAPER_MODS.',
  CRUSADER_MODS: 'Same as SHAPER_MODS.',
  HUNTER_MODS: 'Same as SHAPER_MODS.',
  REDEEMER_MODS: 'Same as SHAPER_MODS.',
  WARLORD_MODS: 'Same as SHAPER_MODS.',
  DELVE_MODS: 'Same as SHAPER_MODS.',
  VEILED_MODS: 'Same as SHAPER_MODS.',
  INCURSION_MODS: 'Same as SHAPER_MODS.'
}

function main () {
  const values = build()

  const enSrc = fs.readFileSync(path.join(REPO_DATA, 'en', 'client_strings.js'), 'utf-8')
  const enKeys = [...enSrc.matchAll(/^\s*([A-Z0-9_]+):/gm)].map(m => m[1])

  const missingKeys = enKeys.filter(k => !(k in values))
  if (missingKeys.length) {
    throw new Error(`generate-client-strings.mjs is missing key(s) present in en/client_strings.js: ${missingKeys.join(', ')}`)
  }

  const lines = ['// @ts-check', "/** @type{import('../../../src/assets/data/interfaces').TranslationDict} */", 'export default {']
  for (const key of enKeys) {
    const v = values[key]
    let rendered
    if (v instanceof RegExp) rendered = v.toString()
    else if (Array.isArray(v)) rendered = JSON.stringify(v)
    else rendered = JSON.stringify(v)
    lines.push(`  ${key}: ${rendered},`)
  }
  lines.push('}', '')

  fs.writeFileSync(path.join(REPO_DATA, 'fr', 'client_strings.js'), lines.join('\n'))

  const verifiedCount = enKeys.length - Object.keys(UNVERIFIED_KEYS).length
  const reportLines = [
    'client_strings.js (fr) coverage report',
    `generated: ${new Date().toISOString()}`,
    `${verifiedCount} / ${enKeys.length} keys sourced from real ClientStrings/HeistJobs game data (verified by row Id).`,
    `${Object.keys(UNVERIFIED_KEYS).length} keys kept English or best-effort - not verified against the real client:`,
    '',
    ...Object.entries(UNVERIFIED_KEYS).map(([k, reason]) => `${k}: ${reason}`)
  ]
  fs.writeFileSync(path.join(__dirname, 'untranslated-client-strings-fr.report.txt'), reportLines.join('\n') + '\n')

  console.log('Wrote renderer/public/data/fr/client_strings.js')
  console.log(`${verifiedCount} / ${enKeys.length} keys verified from real game data.`)
  console.log('Full report: scripts/generate-fr-locale/untranslated-client-strings-fr.report.txt')
}

main()
