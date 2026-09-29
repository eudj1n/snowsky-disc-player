#!/usr/bin/env node
// Checks a built dist/ against the rules for apps on the card of the DISC
// service (combined-009: snowsky-disc-service docs/sd-webroot.md and
// scripts/app_bundle.py check). The service's zip step enforces the same rules;
// this check fails the build earlier and runs without a service checkout.
import { readdirSync, readFileSync, lstatSync } from 'node:fs'
import { join, relative, extname, sep } from 'node:path'

const ALLOWED = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.map',
  '.webmanifest',
  '.txt',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff2',
  '.woff',
  '.ttf',
  '.wasm',
])
const COMPONENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/
const MAX_FILE = 4 * 1024 * 1024
const MAX_TOTAL = 32 * 1024 * 1024
// The reviewed catalogs come from the service (/api/contract/); app.json and origins.json from the zip step.
const GENERATED = new Set([
  'compatibility.json',
  'commands.json',
  'queries.json',
  'store.json',
  'origins.json',
  'app.json',
])
const MAX_FILES = 512
const MAX_DEPTH = 6
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/is
const INLINE_STYLE = /<style\b[^>]*>\s*\S|\bstyle\s*=\s*["']/is
const INLINE_HANDLER = /\son[a-z]+\s*=\s*["']/i
const SCRIPT_URL = /javascript:/i
// An app is served at / and at /apps/<App>/: its own references must be relative (Vite base './');
// a root-absolute one resolves at one of them only. /api/... is the service and stays absolute.
const DOCUMENT_ROOT_REF = /\b(?:href|src)\s*=\s*["']\/(?!api\/|\/)/i
const ROOT_ASSET =
  /["'(]\/(?!api\/|\/)(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:js|mjs|css|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|wasm|webmanifest)\b/

export function checkBundle(root) {
  const errors = []
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      const info = lstatSync(path)
      if (info.isDirectory()) walk(path)
      else files.push({ path, name: relative(root, path).split(sep).join('/'), info })
    }
  }
  walk(root)
  const folded = new Set()
  let total = 0
  for (const { path, name, info } of files) {
    const parts = name.split('/')
    if (!info.isFile()) errors.push(`${name}: not a regular file`)
    if (!ALLOWED.has(extname(name).toLowerCase())) errors.push(`${name}: extension not allowed on the card`)
    if (parts.length > MAX_DEPTH) errors.push(`${name}: deeper than ${MAX_DEPTH} path components`)
    if (parts.some((part) => !COMPONENT.test(part)))
      errors.push(`${name}: name must match [A-Za-z0-9_.-]{1,80} and not start with a dot`)
    if (GENERATED.has(name)) errors.push(`${name}: comes from the service or the zip step, not from the build`)
    if (info.size > MAX_FILE) errors.push(`${name}: larger than 4 MiB`)
    if (folded.has(name.toLowerCase())) errors.push(`${name}: case-insensitive name collision`)
    folded.add(name.toLowerCase())
    total += info.size
    const text = /\.(html|js|mjs|css)$/.test(name) ? readFileSync(path, 'utf8') : ''
    if (name.endsWith('.html')) {
      for (const [pattern, what] of [
        [INLINE_SCRIPT, 'inline script'],
        [INLINE_STYLE, 'inline style'],
        [INLINE_HANDLER, 'inline event handler'],
        [SCRIPT_URL, 'javascript: URL'],
      ]) {
        if (pattern.test(text)) errors.push(`${name}: ${what} is blocked by the gateway CSP`)
      }
      const absolute = DOCUMENT_ROOT_REF.exec(text)
      if (absolute)
        errors.push(`${name}: root-absolute reference ${absolute[0]} resolves only at /; use a relative one`)
    } else if (text) {
      const match = ROOT_ASSET.exec(text)
      if (match) errors.push(`${name}: root-absolute asset reference ${match[0].slice(1)} resolves only at /`)
    }
  }
  if (!files.some((file) => file.name === 'index.html')) errors.push('index.html is missing')
  if (files.length > MAX_FILES) errors.push(`${files.length} files; an app holds at most ${MAX_FILES}`)
  if (total > MAX_TOTAL) errors.push(`${total} bytes; an app holds at most 32 MiB`)
  return { files: files.length, bytes: total, errors }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? 'dist'
  const result = checkBundle(root)
  for (const error of result.errors) console.error(`bundle: ${error}`)
  if (result.errors.length) process.exit(1)
  console.log(`bundle: ${result.files} files, ${result.bytes} bytes, app rules satisfied`)
}
