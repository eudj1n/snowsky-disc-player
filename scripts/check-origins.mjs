#!/usr/bin/env node
// The app's own origins.json (combined-009; owner, 2026-10-23): the https
// origins the page may reach, which the gateway adds to the page's
// Content-Security-Policy. The file is this repository's (release/origins.json,
// reviewed in its pull requests), packed beside index.html by `npm run release`;
// the service is not involved. The gateway rejects the whole file on one bad
// entry and leaves the page same-origin, so the rules here are the gateway's
// (snowsky-disc-server device/src/origins.c): https only, lower-case host
// labels, a wildcard only as the first label with at least two after it, an
// optional port, nothing else; at most MAX_ORIGINS entries of MAX_ORIGIN
// characters, each for connect-src and/or img-src, named and with a purpose.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The gateway's limits (DISC_ORIGINS_MAX, DISC_ORIGIN_MAX of the server release on the card). */
export const MAX_ORIGINS = 16
export const MAX_ORIGIN = 100
export const DIRECTIVES = ['connect-src', 'img-src']
const NAME = /^[a-z][a-z0-9_]{1,40}$/
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const ORIGIN = new RegExp(`^https://(?:\\*\\.)?${LABEL}(?:\\.${LABEL})+(?::[0-9]{1,5})?$`)
const REQUIRED = ['schema_version', 'api', 'origins']
const OPTIONAL = ['version', 'description', 'profile_sha256', 'origins_sha256']

/** Whether the text is an origin the policy may name. */
export function validOrigin(origin) {
  if (typeof origin !== 'string' || origin.length > MAX_ORIGIN || !ORIGIN.test(origin)) return false
  const [host, port] = origin.slice('https://'.length).split(':')
  const labels = host.startsWith('*.') ? host.split('.').length - 1 : host.split('.').length
  if (host.startsWith('*.') && labels < 2) return false
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65535)
}

/** The page's policy with these origins, exactly as the gateway builds it. */
export function policyOf(origins) {
  const of = (directive) =>
    Object.values(origins)
      .filter((entry) => entry.directives.includes(directive))
      .map((entry) => entry.origin)
  const connect = ["'self'", ...of('connect-src')].join(' ')
  const images = of('img-src')
  const img = images.length ? `; img-src 'self' ${images.join(' ')}` : ''
  return `default-src 'self'; script-src 'self'; style-src 'self'; connect-src ${connect}${img}; frame-ancestors 'none'`
}

/** Checks an origins.json's text: the errors (none when it is good) and the policy it gives. */
export function checkOrigins(text) {
  const errors = []
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { errors: ['origins.json is not JSON'], policy: null, count: 0 }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { errors: ['origins.json is not an object'], policy: null, count: 0 }
  for (const key of REQUIRED) if (!(key in data)) errors.push(`origins.json: ${key} is required`)
  for (const key of Object.keys(data))
    if (!REQUIRED.includes(key) && !OPTIONAL.includes(key)) errors.push(`origins.json: unexpected field ${key}`)
  if (data.schema_version !== 1 || data.api !== 1) errors.push('origins.json: schema_version 1, api 1')
  const origins = data.origins
  if (!origins || typeof origins !== 'object' || Array.isArray(origins)) {
    errors.push('origins.json: origins is an object')
    return { errors, policy: null, count: 0 }
  }
  const names = Object.keys(origins)
  if (names.length > MAX_ORIGINS) errors.push(`At most ${String(MAX_ORIGINS)} origins (the gateway's limit)`)
  const seen = new Set()
  for (const name of names) {
    const entry = origins[name]
    if (!NAME.test(name)) errors.push(`origin ${name}: invalid name`)
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`origin ${name}: not an object`)
      continue
    }
    const keys = Object.keys(entry).sort().join(',')
    if (keys !== 'directives,origin,purpose')
      errors.push(`origin ${name}: the fields are origin, directives and purpose`)
    if (!validOrigin(entry.origin)) errors.push(`origin ${name}: not an https origin the policy may name`)
    else if (seen.has(entry.origin)) errors.push(`origin ${name}: duplicate origin`)
    seen.add(entry.origin)
    const directives = entry.directives
    if (
      !Array.isArray(directives) ||
      !directives.length ||
      new Set(directives).size !== directives.length ||
      !directives.every((directive) => DIRECTIVES.includes(directive))
    )
      errors.push(`origin ${name}: directives are connect-src and/or img-src`)
    if (typeof entry.purpose !== 'string' || !entry.purpose) errors.push(`origin ${name}: purpose is required`)
  }
  return { errors, policy: errors.length ? null : policyOf(origins), count: names.length }
}

export const ORIGINS = fileURLToPath(new URL('../release/origins.json', import.meta.url))

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ? resolve(process.argv[2]) : ORIGINS
  const { errors, policy, count } = checkOrigins(readFileSync(file, 'utf8'))
  for (const error of errors) console.error(`origins: ${error}`)
  if (errors.length) process.exit(1)
  console.log(`${file}: ${String(count)} origins`)
  console.log(policy)
}
