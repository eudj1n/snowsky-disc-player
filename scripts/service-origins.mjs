#!/usr/bin/env node
// The reviewed origins.json the release packs, kept in release/origins.json so a
// release builds without a service checkout (GitHub Actions). The DISC service
// renders it from its firmware/origins catalog, bound to the firmware profile
// (snowsky-disc-server scripts/origins_catalog.py). `npm run release:origins`
// brings the service's current file here; `npm run release` refuses a stale one.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const ORIGINS = fileURLToPath(new URL('../release/origins.json', import.meta.url))

const RENDER =
  'import sys; from scripts import firmware_profile, origins_catalog; ' +
  'sys.stdout.buffer.write(origins_catalog.origins_data(firmware_profile.load_profile(), origins_catalog.load_origins()))'

/** The origins.json the service renders for its active firmware profile. */
export function renderOrigins(service) {
  const run = spawnSync('python3', ['-c', RENDER], { cwd: service, encoding: 'buffer' })
  if (run.status !== 0) throw new Error(`The service could not render origins.json: ${run.stderr.toString()}`)
  return run.stdout
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = resolve(process.env.DISC_SERVER_DIR ?? '../snowsky-disc-server')
  const rendered = renderOrigins(service)
  const kept = (() => {
    try {
      return readFileSync(ORIGINS)
    } catch {
      return null
    }
  })()
  if (kept && kept.equals(rendered)) console.log('release/origins.json is the service’s current one')
  else {
    writeFileSync(ORIGINS, rendered)
    console.log('release/origins.json now holds the service’s current one')
  }
}
