import * as fs from 'fs'

// Parses GGG's Metadata/StatDescriptions/*.txt format (UTF-16LE with BOM) into blocks:
//   { statIds: string[], langs: { [langName: string]: Array<{ text: string, flags: string }> } }
// `text` uses `#` in place of `{0}`, `{1}`, ... placeholders, matching this repo's
// ref/matchers convention (see renderer/public/data/en/stats.ndjson).
//
// Grammar (one block):
//   description
//   \t<N> <statId1> ... <statIdN>
//   \t<variantCount>
//   \t\t<cond1> ... <condN> "<text>" [flags...]
//   \tlang "<Language>"
//   \t<variantCount>
//   \t\t<cond1> ... <condN> "<text>" [flags...]
//   ... (repeated per language; the un-labelled block right after the stat id
//        line is English)
export function parseStatDescriptions (rawBuffer) {
  const text = rawBuffer.slice(2).toString('utf16le') // skip BOM
  const lines = text.split(/\r?\n/)
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === 'description') {
      i++
      const statIds = lines[i].trim().split(/\s+/).slice(1)
      i++
      const langs = {}
      let currentLang = 'English'
      while (i < lines.length) {
        const raw = lines[i]
        const t = raw.trim()
        if (t === '') { i++; continue }
        if (t === 'description' || t.startsWith('no_description')) break
        const langMatch = t.match(/^lang\s+"([^"]+)"$/)
        if (langMatch) { currentLang = langMatch[1]; i++; continue }
        if (!t.includes('"')) { i++; continue } // variant-count declaration line
        const varMatch = raw.match(/^[\t ]*(.*?)"([^"]*)"[\t ]*(.*)$/)
        if (varMatch) {
          // `{0}` and format-specifier forms like `{0:+d}` (used for stats
          // that always show a sign) both collapse to a bare "#": that's the
          // convention this repo's existing en/stats.ndjson matchers already
          // use (the "+" seen in some `ref` values is added separately by
          // whatever built en/stats.ndjson, not present in the matcher text).
          // A handful of blocks (e.g. `damage_+%_with_bow_skills`) write the
          // single-argument placeholder as bare `{}` instead of `{0}` - same
          // meaning, just missing the index digit, so `\d*` (not `\d+`) is
          // needed or these blocks silently fail to index (confirmed via
          // Arnaud's "#% increased Damage with Bow Skills" quiver, 2026-07-22:
          // stayed in English because the index key kept the literal `{}`
          // instead of `#`, never matching this repo's `#`-normalized ref).
          // The game file also encodes multi-line text with a literal 2-char
          // `\n` escape (backslash + n), not a real newline - en/stats.ndjson
          // (RePoE-derived) uses a real newline for the same text, so this
          // must be converted or every multi-line stat fails to match.
          const varText = varMatch[2]
            .replace(/\{\d*(?::[^}]*)?\}/g, '#')
            .replace(/\\n/g, '\n')
          const flags = varMatch[3].trim()
          if (!langs[currentLang]) langs[currentLang] = []
          langs[currentLang].push({ text: varText, flags })
          i++
          continue
        }
        break
      }
      blocks.push({ statIds, langs })
    } else if (trimmed.startsWith('no_description')) {
      i++
    } else {
      i++
    }
  }
  return blocks
}

export function loadStatDescriptions (path) {
  return parseStatDescriptions(fs.readFileSync(path))
}

// GGG keeps old stat ids around (for existing items rolled before a mod was
// reworked) under an "old_do_not_use_*" id, alongside a current replacement id
// that often has the SAME English text but a different (corrected) French
// translation - e.g. `old_do_not_use_mana_leech_from_physical_damage_%` (FR
// "d'Attaque", singular) vs the current `mana_leech_from_physical_attack_damage_permyriad`
// (FR "des Attaques", plural, confirmed correct against a real ring copied by
// Arnaud, 2026-07-23). The consumer (translateMatcherString in
// generate-stats.mjs) just takes the first same-text candidate it finds, so
// whichever block happens to appear first in the file wins - and the
// deprecated block came first here, silently breaking recognition of a very
// common Leech mod. GGG's own naming makes the ambiguity resolvable without
// guessing: a block whose EVERY stat id is prefixed "old_do_not_use" should
// never outrank a same-text block that isn't.
function isDeprecatedBlock (block) {
  return block.statIds.length > 0 && block.statIds.every(id => id.startsWith('old_do_not_use'))
}

// Builds an index: normalized English variant text -> matching blocks.
// Non-deprecated blocks are listed before deprecated ones for the same text
// (stable within each group), so the first-matching-candidate logic in
// generate-stats.mjs naturally prefers the current stat id over a legacy one.
export function buildEnglishTextIndex (blocks) {
  const index = new Map()
  const deprecated = new Map()
  for (const b of blocks) {
    const target = isDeprecatedBlock(b) ? deprecated : index
    for (const v of (b.langs.English || [])) {
      if (!target.has(v.text)) target.set(v.text, [])
      target.get(v.text).push(b)
    }
  }
  for (const [text, blocksForText] of deprecated) {
    if (!index.has(text)) index.set(text, [])
    index.get(text).push(...blocksForText)
  }
  return index
}
