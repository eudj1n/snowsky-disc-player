import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp, gzipTwin, zipApp } from '../../scripts/pack-app.mjs'

const dirs = []
function build(files) {
  const root = mkdtempSync(join(tmpdir(), 'disc-pack-'))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), content)
  }
  return root
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The entries of a zip by name, read through its central directory. */
function unzip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]))
  const count = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  const entries = new Map()
  for (let n = 0; n < count; n++) {
    const method = zip.readUInt16LE(at + 10)
    const size = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const body = zip.subarray(start, start + size)
    entries.set(name, {
      method,
      time: [zip.readUInt16LE(at + 12), zip.readUInt16LE(at + 14)],
      mode: zip.readUInt32LE(at + 38) >>> 16,
      data: method === 8 ? inflateRawSync(body) : body,
    })
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
  }
  return entries
}

const page = '<!doctype html><script type="module" src="./assets/app.js"></script>' + ' '.repeat(2000)

describe('packing the app as the service does (app_bundle.py zip)', () => {
  it('adds app.json, the reviewed origins.json and gzip twins of larger text files', () => {
    const source = build({
      'index.html': page,
      'assets/app.js': 'x'.repeat(4000),
      'assets/small.css': 'body{}',
      'assets/cover.png': Buffer.alloc(4000),
      '.DS_Store': 'mac',
      'assets/app.js.gz': 'an earlier twin',
    })
    const files = buildApp(source, { name: 'Disc Player', version: '1.0.0', origins: '{"origins":{}}\n' })
    expect([...files.keys()].sort()).toEqual([
      'app.json',
      'assets/app.js',
      'assets/app.js.gz',
      'assets/cover.png',
      'assets/small.css',
      'index.html',
      'index.html.gz',
      'origins.json',
    ])
    expect(files.get('app.json')?.toString()).toBe('{"schema":1,"name":"Disc Player","version":"1.0.0"}\n')
    expect(gunzipSync(files.get('assets/app.js.gz') ?? Buffer.alloc(0)).toString()).toBe('x'.repeat(4000))
  })

  it('makes a twin only of a file of at least 1 KiB that it shrinks by a tenth', () => {
    expect(gzipTwin(Buffer.from('x'.repeat(1023)))).toBeNull()
    // Random bytes do not shrink.
    expect(gzipTwin(randomBytes(2000))).toBeNull()
    const twin = gzipTwin(Buffer.from('x'.repeat(1024)))
    expect(twin?.subarray(0, 10)).toEqual(Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 0xff]))
  })

  it('writes the same zip every time: sorted entries in "<App>/", fixed times, twins stored', () => {
    const source = build({ 'index.html': page, 'assets/app.js': 'x'.repeat(4000) })
    const files = buildApp(source, { name: 'Disc Player', version: '1', origins: '{}\n' })
    const zip = zipApp(files, 'Disc Player')
    expect(zipApp(buildApp(source, { name: 'Disc Player', version: '1', origins: '{}\n' }), 'Disc Player')).toEqual(zip)
    const entries = unzip(zip)
    expect([...entries.keys()]).toEqual([...[...files.keys()].sort()].map((name) => `Disc Player/${name}`))
    for (const [name, entry] of entries) {
      expect(entry.data).toEqual(files.get(name.slice('Disc Player/'.length)))
      expect(entry.method).toBe(name.endsWith('.gz') ? 0 : 8)
      expect(entry.time).toEqual([0, ((2026 - 1980) << 9) | (1 << 5) | 1])
      expect(entry.mode).toBe(0o644)
    }
  })
})
