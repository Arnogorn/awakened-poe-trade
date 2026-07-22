import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(__dirname)

const { SteamBundleLoader, CachingBundleLoader, FileLoader } = await import('./node_modules/pathofexile-dat/dist/cli/bundle-loaders.js')

const configPath = fs.existsSync('config.local.json') ? 'config.local.json' : 'config.example.json'
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

// There is no public index of Metadata/StatDescriptions/ file names. CANDIDATES
// mixes the 12 files already wired into extract-game-data.mjs with names that
// were tried and came back missing as of the 2026-07 PoE1 patch used to build
// this script (kept because a future patch could still add them under one of
// these names - re-probing costs nothing). Only include real PoE1 file name
// guesses here: this list must NOT contain PoE2-only files (e.g. Uncut Gems -
// that mechanic doesn't exist in PoE1, so a file for it never will either).
// Extend CANDIDATES and re-run when coverage in generate-stats.mjs's report
// drops after a big content patch.
const CANDIDATES = [
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
  'heist_area_stat_descriptions.txt',
  'heist_job_stat_descriptions.txt',
  'necropolis_stat_descriptions.txt',
  'tincture_stat_descriptions.txt',
  'delve_stat_descriptions.txt',
  'harvest_stat_descriptions.txt',
  'sanctum_stat_descriptions.txt',
  'crucible_tree_stat_descriptions.txt',
  'ultimatum_item_stat_descriptions.txt',
  'logbook_stat_descriptions.txt',
  'currency_stat_descriptions.txt',
  'synthesis_stat_descriptions.txt',
  'betrayal_stat_descriptions.txt',
  'incursion_stat_descriptions.txt',
  'vaal_stat_descriptions.txt',
  'beyond_stat_descriptions.txt',
  'breach_stat_descriptions.txt',
  'ritual_stat_descriptions.txt',
  'blight_stat_descriptions.txt',
  'crucible_stat_descriptions.txt',
  'affliction_stat_descriptions.txt'
]

async function main () {
  console.log('Loading bundles index...')
  const loader = await FileLoader.create(new CachingBundleLoader(new SteamBundleLoader(config.steam)))
  for (const name of CANDIDATES) {
    const contents = await loader.tryGetFileContents(`Metadata/StatDescriptions/${name}`)
    if (contents) console.log(`FOUND  (${String(contents.length).padStart(9)} bytes)  ${name}`)
  }
  console.log('Done. Add any newly-found file names to STAT_DESCRIPTION_FILES in extract-game-data.mjs.')
}

main().catch(err => { console.error(err); process.exit(1) })
