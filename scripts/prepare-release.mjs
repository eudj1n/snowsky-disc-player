#!/usr/bin/env node
// Turns the checked dist/ into an immutable SD release with the DISC service
// publisher (snowsky-disc-service scripts/webroot_bundle.py prepare), which
// adds the reviewed compatibility.json, commands.json and queries.json for the
// selected firmware profile. Nothing is written to a card here; publishing is
// a separate operator step documented in docs/release.md.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { checkBundle } from './check-bundle.mjs'

const service = resolve(process.env.DISC_SERVICE_DIR ?? '../snowsky-disc-service')
const publisher = resolve(service, 'scripts/webroot_bundle.py')
const output = resolve(process.argv[2] ?? `work/release-${new Date().toISOString().replace(/[:.]/g, '-')}`)

if (!existsSync(publisher)) {
  console.error(
    `Service publisher not found at ${publisher}; set DISC_SERVICE_DIR to the snowsky-disc-service checkout`,
  )
  process.exit(2)
}
const bundle = checkBundle('dist')
if (bundle.errors.length) {
  for (const error of bundle.errors) console.error(`bundle: ${error}`)
  process.exit(1)
}
const run = spawnSync('python3', [publisher, 'prepare', '--source', resolve('dist'), '--output', output], {
  encoding: 'utf8',
})
if (run.status !== 0) {
  process.stderr.write(run.stderr)
  process.exit(run.status ?? 1)
}
const result = JSON.parse(run.stdout)
console.log(`Prepared release ${result.bundle} (${result.files} files) in ${output}/www`)
console.log('Publish it on a mounted PLAY card (operator step):')
console.log(`  python3 ${publisher} publish --prepared ${output}/www --card /Volumes/PLAY --confirm-card-write`)
