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
          // The game file also encodes multi-line text with a literal 2-char
          // `\n` escape (backslash + n), not a real newline - en/stats.ndjson
          // (RePoE-derived) uses a real newline for the same text, so this
          // must be converted or every multi-line stat fails to match.
          const varText = varMatch[2]
            .replace(/\{\d+(?::[^}]*)?\}/g, '#')
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

// Builds an index: normalized English variant text -> matching blocks.
export function buildEnglishTextIndex (blocks) {
  const index = new Map()
  for (const b of blocks) {
    for (const v of (b.langs.English || [])) {
      if (!index.has(v.text)) index.set(v.text, [])
      index.get(v.text).push(b)
    }
  }
  return index
}
