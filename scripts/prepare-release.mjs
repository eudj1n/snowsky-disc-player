#!/usr/bin/env node
// Packs the checked dist/ as the Disc Player app (combined-009): a zip holding
// "Disc Player/" with gzip twins, app.json (the version and package.json's
// homepage, which the service's manager links to) and the reviewed
// origins.json kept in release/ (scripts/pack-app.mjs, a mirror of the DISC
// service's scripts/app_bundle.py zip). A user copies the folder into Apps/ on
// the card; nothing is written to a card here (see docs/release.md).
//
// With the service checkout (../snowsky-disc-service or DISC_SERVICE_DIR), the
// release refuses a release/origins.json the service no longer renders and has
// the service's tool install the zip into a scratch card, which applies every
// rule an installation does. A tag's release on GitHub Actions has no service
// checkout: it sets DISC_RELEASE_WITHOUT_SERVICE=1 and relies on the same
// release/origins.json, checked when it was brought here.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { checkBundle } from './check-bundle.mjs'
import { buildApp, zipApp } from './pack-app.mjs'
import { ORIGINS, renderOrigins } from './service-origins.mjs'

const NAME = 'Disc Player'
const service = resolve(process.env.DISC_SERVICE_DIR ?? '../snowsky-disc-service')
const tool = resolve(service, 'scripts/app_bundle.py')
const withService = process.env.DISC_RELEASE_WITHOUT_SERVICE !== '1'
if (withService && !existsSync(tool)) {
  console.error(`Service tool not found at ${tool}; set DISC_SERVICE_DIR to the snowsky-disc-service checkout`)
  process.exit(2)
}
const bundle = checkBundle('dist')
if (bundle.errors.length) {
  for (const error of bundle.errors) console.error(`bundle: ${error}`)
  process.exit(1)
}
const origins = readFileSync(ORIGINS)
if (withService && !renderOrigins(service).equals(origins)) {
  console.error('release/origins.json is not the service’s current one: run npm run release:origins and commit it')
  process.exit(1)
}
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() ? '+changes' : ''
const version =
  process.env.DISC_APP_VERSION ?? `${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}-${commit}${dirty}`
const output = resolve(process.argv[2] ?? `work/disc-player-${version}.zip`)
if (existsSync(output)) {
  console.error(`${output} exists; choose a fresh name`)
  process.exit(1)
}
const { homepage } = JSON.parse(readFileSync('package.json', 'utf8'))
const files = buildApp(resolve('dist'), { name: NAME, version, homepage, origins })
const zip = zipApp(files, NAME)
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, zip)
if (withService) {
  // The service's own installation, into a scratch card: it reads the zip and checks every file as on PLAY.
  const card = mkdtempSync(join(tmpdir(), 'disc-release-card-'))
  try {
    const run = spawnSync('python3', [tool, 'install', '--app', output, '--card', card, '--confirm-card-write'], {
      encoding: 'utf8',
    })
    if (run.status !== 0) {
      rmSync(output)
      process.stderr.write(run.stderr)
      console.error('The service’s tool refused the zip; it was removed')
      process.exit(1)
    }
  } finally {
    rmSync(card, { recursive: true, force: true })
  }
}
const sha256 = createHash('sha256').update(zip).digest('hex')
console.log(`Packed Disc Player ${version} (${files.size} files) in ${output}`)
console.log(`sha256 ${sha256}${withService ? '; the service’s tool installed it into a scratch card' : ''}`)
console.log('Copy its "Disc Player" folder into Apps/ on the card, or (operator step):')
console.log(`  python3 ${tool} install --app "${output}" --card /Volumes/PLAY --confirm-card-write`)
