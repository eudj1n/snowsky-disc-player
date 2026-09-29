#!/usr/bin/env node
// Packs the checked dist/ as the Disc Player app (combined-009): a zip holding
// "Disc Player/" with gzip twins, app.json (the version) and the reviewed
// origins.json, made by the DISC service's tool (snowsky-disc-service
// scripts/app_bundle.py zip). A user copies the folder into Apps/ on the card;
// nothing is written to a card here (see docs/release.md).
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { checkBundle } from './check-bundle.mjs'

const service = resolve(process.env.DISC_SERVICE_DIR ?? '../snowsky-disc-service')
const tool = resolve(service, 'scripts/app_bundle.py')
if (!existsSync(tool)) {
  console.error(`Service tool not found at ${tool}; set DISC_SERVICE_DIR to the snowsky-disc-service checkout`)
  process.exit(2)
}
const bundle = checkBundle('dist')
if (bundle.errors.length) {
  for (const error of bundle.errors) console.error(`bundle: ${error}`)
  process.exit(1)
}
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() ? '+changes' : ''
const version =
  process.env.DISC_APP_VERSION ?? `${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}-${commit}${dirty}`
const output = resolve(process.argv[2] ?? `work/disc-player-${version}.zip`)
const run = spawnSync(
  'python3',
  [
    tool,
    'zip',
    '--source',
    resolve('dist'),
    '--output',
    output,
    '--name',
    'Disc Player',
    '--version',
    version,
    '--origins',
  ],
  { encoding: 'utf8' },
)
if (run.status !== 0) {
  process.stderr.write(run.stderr)
  process.exit(run.status ?? 1)
}
const result = JSON.parse(run.stdout)
console.log(`Packed Disc Player ${version} (${result.files} files) in ${output}`)
console.log('Copy its "Disc Player" folder into Apps/ on the card, or (operator step):')
console.log(`  python3 ${tool} install --app "${output}" --card /Volumes/PLAY --confirm-card-write`)
