import * as fs from 'fs/promises'
import * as fssync from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(__dirname)

// The installed package's package.json "exports" field only whitelists
// bundles.js/dat.js/sprites.js as public subpaths - deep-import the CLI
// internals via a plain relative path instead (bypasses that restriction,
// since it's not a bare specifier resolution).
const { SteamBundleLoader, CachingBundleLoader, FileLoader } = await import('./node_modules/pathofexile-dat/dist/cli/bundle-loaders.js')
const { exportTables } = await import('./node_modules/pathofexile-dat/dist/cli/export-tables.js')

const configPath = fssync.existsSync('config.local.json') ? 'config.local.json' : 'config.example.json'
const config = JSON.parse(fssync.readFileSync(configPath, 'utf-8'))
if (configPath === 'config.example.json') {
  console.warn('No config.local.json found, using config.example.json (see config.example.json for instructions).')
}

// Files under Metadata/StatDescriptions/ that contain mod text relevant to item
// price-checking. Found by probing the local game install (there is no public
// index of these file names) - re-run `node probe-stat-description-files.mjs`
// after a big content patch to check for new/renamed files if coverage drops.
const STAT_DESCRIPTION_FILES = [
  'stat_descriptions.txt',
  'gem_stat_descriptions.txt',
  'skill_stat_descriptions.txt',
  'active_skill_gem_stat_descriptions.txt',
  'map_stat_descriptions.txt',
  'atlas_stat_descriptions.txt',
  'passive_skill_stat_descriptions.txt',
  'expedition_relic_stat_descriptions.txt',
  'monster_stat_descriptions.txt',
  'sentinel_stat_descriptions.txt',
  'heist_equipment_stat_descriptions.txt',
  'necropolis_stat_descriptions.txt'
]

async function main () {
  console.log('Loading bundles index...')
  const loader = await FileLoader.create(new CachingBundleLoader(new SteamBundleLoader(config.steam)))

  await fs.mkdir('raw/stat-descriptions', { recursive: true })
  for (const name of STAT_DESCRIPTION_FILES) {
    const contents = await loader.tryGetFileContents(`Metadata/StatDescriptions/${name}`)
    if (!contents) {
      console.warn(`  [skip] Metadata/StatDescriptions/${name} not found in this patch`)
      continue
    }
    await fs.writeFile(`raw/stat-descriptions/${name}`, contents)
    console.log(`  extracted ${name} (${contents.length} bytes)`)
  }

  console.log('Exporting BaseItemTypes / Words / MonsterVarieties tables (English + French)...')
  await exportTables({
    steam: config.steam,
    translations: ['English', 'French'],
    tables: [
      { name: 'BaseItemTypes', columns: ['Id', 'Name'] },
      // Wordlist 6 = unique item names. `Text` stays English (internal
      // reference), `Text2` is the actually-localized display name.
      { name: 'Words', columns: ['Text', 'Wordlist', 'Text2'] },
      { name: 'MonsterVarieties', columns: ['Id', 'Name'] },
      // UI/parser literals (rarity names, "Corrupted", "Superior {0}", etc.)
      { name: 'ClientStrings', columns: ['Id', 'Text'] },
      // Heist job names (Lockpicking, Brute Force, ...), not in ClientStrings
      { name: 'HeistJobs', columns: ['Id', 'Name'] },
      // Passive tree node names (keystones/notables), needed to translate
      // "Allocates {passive}" stats granted by cluster/timeless jewels.
      { name: 'PassiveSkills', columns: ['Id', 'Name'] },
      // Transfigured gem variant names (e.g. "Arc of Oscillating"). These are
      // NOT in BaseItemTypes under their composite display name - GemEffects
      // holds the full localized name directly (SkillGems.GemVariants ->
      // GemEffects).
      { name: 'GemEffects', columns: ['Id', 'Name'] }
    ]
  }, path.join(__dirname, 'tables'), loader)

  console.log('Done. Raw data in ./raw and ./tables (gitignored).')
}

main().catch(err => { console.error(err); process.exit(1) })
