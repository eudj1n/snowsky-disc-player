// Packs a checked build as an app for the DISC service's card, as the service's
// tool does (snowsky-disc-server scripts/app_bundle.py zip): the build's files,
// app.json (the version and the project's homepage), the reviewed origins.json, gzip twins of the text
// files, all in a deterministic zip holding "<App>/". Mirrored here, as
// check-bundle.mjs mirrors the app rules, so a release builds without a service
// checkout (GitHub Actions); with one, prepare-release.mjs has the service's tool
// install the zip into a scratch card to prove it.
import { readdirSync, readFileSync, lstatSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const COMPRESSIBLE = ['.html', '.css', '.js', '.mjs', '.json', '.svg', '.wasm', '.webmanifest', '.txt', '.map']
const GZIP_MIN_BYTES = 1024
/** Every entry's time, as the service's zip writes it: 2026-01-01 00:00:00 in DOS form. */
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

/** Deterministic gzip (no name, mtime 0, OS unknown, maximum compression), only when clearly smaller. */
export function gzipTwin(data) {
  if (data.length < GZIP_MIN_BYTES) return null
  const body = deflateRawSync(data, { level: 9, memLevel: 9 })
  const trailer = Buffer.alloc(8)
  trailer.writeUInt32LE(crc32(data) >>> 0, 0)
  trailer.writeUInt32LE(data.length >>> 0, 4)
  const packed = Buffer.concat([Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 0xff]), body, trailer])
  return packed.length * 10 <= data.length * 9 ? packed : null
}

/** The build's files by relative name, hidden names and earlier gzip twins left out (checkBundle checked them). */
function buildFiles(source) {
  const files = new Map()
  const walk = (folder) => {
    for (const name of readdirSync(folder).sort()) {
      if (name.startsWith('.')) continue
      const path = join(folder, name)
      if (lstatSync(path).isDirectory()) walk(path)
      else {
        const item = relative(source, path).split(sep).join('/')
        if (!(item.endsWith('.gz') && COMPRESSIBLE.some((type) => item.slice(0, -3).endsWith(type))))
          files.set(item, readFileSync(path))
      }
    }
  }
  walk(source)
  return files
}

/** An app's homepage, as the service accepts it in app.json: an https address of at most 200 bytes. */
const HOMEPAGE = /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._~%+@:/-]*)?$/

export function checkHomepage(homepage) {
  if (typeof homepage !== 'string' || Buffer.byteLength(homepage) > 200 || !HOMEPAGE.test(homepage))
    throw new Error(`${JSON.stringify(homepage)} is not an app homepage: an https address, at most 200 bytes`)
  return homepage
}

/** The files of the app as it goes onto a card: its own, app.json, origins.json and gzip twins. */
export function buildApp(source, { name, version, homepage, origins }) {
  const files = buildFiles(source)
  if (version !== undefined) {
    const app = { schema: 1, name, version }
    if (homepage !== undefined) app.homepage = checkHomepage(homepage)
    files.set('app.json', Buffer.from(`${JSON.stringify(app)}\n`))
  }
  if (origins !== undefined) files.set('origins.json', Buffer.from(origins))
  for (const [item, data] of [...files])
    if (COMPRESSIBLE.some((type) => item.endsWith(type))) {
      const twin = gzipTwin(data)
      if (twin) files.set(`${item}.gz`, twin)
    }
  return files
}

/** A deterministic zip holding <name>/ and the files: sorted, fixed times, twins stored, the rest deflated. */
export function zipApp(files, name) {
  const locals = []
  const central = []
  let offset = 0
  for (const item of [...files.keys()].sort()) {
    const data = files.get(item)
    const path = Buffer.from(`${name}/${item}`)
    const stored = item.endsWith('.gz')
    const body = stored ? data : deflateRawSync(data, { level: 9 })
    // UTF-8 names carry the language flag, as Python's zipfile sets it for non-ASCII names.
    const flags = [...`${name}/${item}`].some((char) => char.charCodeAt(0) > 0x7f) ? 0x800 : 0
    const sum = crc32(data) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(path.length, 26)
    local.writeUInt16LE(0, 28)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE((3 << 8) | 20, 4) // made by Unix, zip 2.0
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(flags, 8)
    header.writeUInt16LE(stored ? 0 : 8, 10)
    header.writeUInt16LE(DOS_TIME, 12)
    header.writeUInt16LE(DOS_DATE, 14)
    header.writeUInt32LE(sum, 16)
    header.writeUInt32LE(body.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(path.length, 28)
    header.writeUInt32LE((0o644 << 16) >>> 0, 38) // -rw-r--r--
    header.writeUInt32LE(offset, 42)
    locals.push(local, path, body)
    central.push(header, path)
    offset += local.length + path.length + body.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.size, 8)
  end.writeUInt16LE(files.size, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
