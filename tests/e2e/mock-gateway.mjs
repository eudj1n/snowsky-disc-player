#!/usr/bin/env node
// A synthetic stand-in for the DISC service gateway, for browser tests in CI
// and visual work without a player. It serves a built dist/ as the gateway
// serves the Disc Player app since combined-009 (at / and at
// /apps/Disc%20Player/, the same CSP and caching, the catalogs at
// /api/contract/), answers the data level and stock catalog
// pages from a fictional collection, and implements the WebSocket owner,
// token, request-ID and replay rules with a scripted player. It is not a
// protocol reference.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import {
  FAVORITES,
  HISTORY,
  PLAYLISTS,
  TRACKS,
  artistAlbum,
  catalogPage,
  dataQuery,
  editPlaylists,
  genre,
  indexUpload,
  mediaRoute,
} from './mock-collection.mjs'

const busyOnce = new Set()
// The card catalog's upload names (firmware/commands/v2.57.json in the service).
const MEDIA_NAME = /\/[^/]+\.(flac|wav|mp3|m4a|aac|ogg|opus|ape|wv|wma|dsf|dff|aiff?|lrc|jpe?g|png)$/i
const AUDIO_NAME = /\.(flac|wav|mp3|m4a|aac|ogg|opus|ape|wv|wma|dsf|dff|aiff?)$/i
const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 4870)
const DIST = process.env.MOCK_GATEWAY_DIST ?? 'dist'
const FIXTURES = new URL('./fixtures/', import.meta.url)
const LANGUAGE = Number(process.env.MOCK_GATEWAY_LANGUAGE ?? 9)
// Optional latency for data reads, to see loading skeletons in development.
const DELAY = Number(process.env.MOCK_GATEWAY_DELAY ?? 0)
// Since combined-008 the player's serial number is the only credential; the emulator's all-zero SN stands in.
const SERIAL = process.env.MOCK_GATEWAY_SERIAL ?? '00000000000000'
const credential = (value) => value === SERIAL
/**
 * The page policy with the release's reviewed origins (fixtures/origins.json, a copy of the
 * service's firmware/origins catalog), as the service builds it since combined-008.
 */
const CSP = (() => {
  const { origins } = JSON.parse(readFileSync(new URL('./fixtures/origins.json', import.meta.url), 'utf8'))
  const of = (directive) =>
    Object.values(origins)
      .filter((entry) => entry.directives.includes(directive))
      .map((entry) => entry.origin)
  const images = of('img-src')
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    ["connect-src 'self'", ...of('connect-src')].join(' '),
    ...(images.length ? [["img-src 'self'", ...images].join(' ')] : []),
    "frame-ancestors 'none'",
  ].join('; ')
})()
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

// The service's own state (combined-008): store collections, the trash, what macOS left.
const STORE_KEYS = {
  disliked: ['path', 'title'],
  pinned_artists: ['name'],
  pinned_albums: ['album'],
  auto_playlists: ['name'],
}
const STORE_LIMITS = { disliked: 20000, pinned_artists: 500, pinned_albums: 500, auto_playlists: 200 }
/** Combined-009 M3U lists by scope: name → entries (absolute card paths). */
const LISTS = { internal: new Map(), external: new Map() }
const LIST_FOLDERS = { internal: '/tmp/sdcard/.disc/playlists', external: '/tmp/sdcard/Playlists' }
/** The tracks stock queues from a list file: its entries that are library files, in order. */
function m3uTracks(path) {
  for (const [scope, lists] of Object.entries(LISTS))
    for (const [name, entries] of lists)
      if (`${LIST_FOLDERS[scope]}/${name}.m3u` === path)
        return entries.flatMap((entry) => TRACKS.find((track) => track.PATH === entry) ?? [])
  return []
}
const storeData = Object.fromEntries(Object.keys(STORE_KEYS).map((name) => [name, new Map()]))
const trash = { entries: [], next: 1, removed: new Set() }
const LEFTOVERS = [
  { path: '/tmp/sdcard/Forma - Inner Space/._01 Orbit.flac', kind: 'file', files: 1, bytes: 4096 },
  { path: '/tmp/sdcard/.Trashes', kind: 'folder', files: 3, bytes: 52_000_000 },
]
let leftovers = [...LEFTOVERS]
const storeKey = (collection, fields) => JSON.stringify(STORE_KEYS[collection].map((name) => fields[name] ?? null))
function readBody(request) {
  return new Promise((resolve) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })
}
/** Service changes carry the serial number and a fresh request ID, like the gateway's. */
function guarded(request, response) {
  if (!credential(request.headers['x-disc-token'])) return (send(response, 403, 'Token required\n'), false)
  const id = request.headers['x-disc-request']
  if (!id || player.seen.has(id)) return (send(response, 409, 'Request ID already used\n'), false)
  player.seen.add(id)
  return true
}
/**
 * A small WAV standing in for every card audio file: thirty seconds at 8 kHz
 * of three quiet tones (bass, middle, a pulsing high one), so the visualizer's
 * analyser hears something.
 */
const WAV = (() => {
  const data = Buffer.alloc(8000 * 30)
  for (let i = 0; i < data.length; i++) {
    const at = i / 8000
    const tone =
      0.22 * Math.sin(2 * Math.PI * 110 * at) +
      0.16 * Math.sin(2 * Math.PI * 440 * at) +
      0.12 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * at)) * Math.sin(2 * Math.PI * 1500 * at)
    data[i] = Math.round(128 + 127 * tone)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(8000, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
})()

// The scripted player: its current list (the stock queue), position, source flag.
const player = {
  /** library_summary answers busy this many more times (/__mock/summary-busy). */
  summaryBusy: 0,
  /** Stock has no queue table (/__mock/queue-dropped): the queue read fails like a busy database. */
  queueDropped: false,
  /** Paths whose media info answers 404, as a file gone from the card (/__mock/info-missing). */
  infoMissing: new Set(),
  /** Media info reads per path, for tests that count them (/__mock/info-reads). */
  infoReads: new Map(),
  /** The image the mock stands for: '009' (the installed one) or '008' (/__mock/image?version=008). */
  image: '009',
  /** The service's last play write failed (/__mock/history-failing), as with a full card. */
  historyFailing: false,
  /** Walks of the whole card (/api/card/tree), for tests that count them (/__mock/tree-reads). */
  treeReads: 0,
  /** Plays this page reported from a browser (/__mock/browser-plays). */
  browserPlays: [],
  /** The card's store catalog predates the rotation periods (/__mock/store-old). */
  storeOld: false,
  state: 1,
  list: TRACKS.filter((track) => track.ALBUM === 'Afterglow'),
  index: 0,
  flag: 3,
  owner: null,
  seen: new Set(),
  position: 42_000,
  volume: 40,
  mode: 0,
  loved: new Set(),
  sound: { gain: 0, balance: 0, filter: 1, dre: 1, spdif: 0 },
  // Equalizer: network preset, and profiles of the user presets 160..169.
  eq: { preset: 255, profiles: new Map(), last: 160 },
  uploads: [],
  // Folders created through the file manager (relative to the card root).
  folders: new Set(),
  socket: null,
}

/** The library tracks directly in a card folder (stock's folder play is not recursive), in listing order. */
function folderTracks(path) {
  const order = folderEntries(path.replace('/tmp/sdcard/', '')).map((entry) => entry.name)
  return TRACKS.filter((track) => track.PATH.slice(0, track.PATH.lastIndexOf('/')) === path).sort(
    (a, b) => order.indexOf(a.PATH.split('/').pop()) - order.indexOf(b.PATH.split('/').pop()),
  )
}

/** The folder stock listed last, answered again from memory. */
let listed = null

/** Stock's transfer browser for one card folder: its subfolders and files, from every known path. */
function folderEntries(folder) {
  const prefix = folder ? `/tmp/sdcard/${folder}/` : '/tmp/sdcard/'
  const paths = [
    // Like a combined-008 card: the service's own hidden folder at the root (stock's listing shows it here).
    '/tmp/sdcard/.disc/www/',
    ...TRACKS.map((track) => track.PATH),
    ...player.uploads.map((upload) => upload.path),
    ...[...player.folders].map((created) => `/tmp/sdcard/${created}/`),
  ].filter((path) => ![...trash.removed].some((gone) => path === gone || path.startsWith(`${gone}/`)))
  const entries = new Map()
  for (const path of paths) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    const [name] = rest.split('/')
    if (!name) continue
    const dir = rest.includes('/')
    if (!entries.has(name) || dir) entries.set(name, { name, dir, image: /\.(jpe?g|png)$/i.test(name) })
  }
  return [...entries.values()]
}
/** The profile the player reads from: the selected user preset, else the last used one. */
function eqProfile() {
  const slot = player.eq.preset >= 160 && player.eq.preset <= 169 ? player.eq.preset : player.eq.last
  if (!player.eq.profiles.has(slot)) {
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    player.eq.profiles.set(slot, { master: 0, bands: frequencies.map((frequency) => ({ frequency, gain: 0, q: 0.7 })) })
  }
  return player.eq.profiles.get(slot)
}

/** a628: "0000", first and last position, then 7 bytes per band. */
function peqReply(bands) {
  const hex = (value, width) => (value & (16 ** width - 1)).toString(16).toUpperCase().padStart(width, '0')
  const body = bands
    .map(
      (band) => hex(Math.round(band.gain * 10), 4) + hex(band.frequency, 4) + hex(Math.round(band.q * 100), 4) + '00',
    )
    .join('')
  return '0000' + '00' + hex(bands.length - 1, 2) + body
}

// Position ticks (a103) once per second while playing.
setInterval(() => {
  if (player.state !== 0 || !player.socket) return
  player.position += 1000
  player.socket.send(record('a103', player.position.toString(16).toUpperCase().padStart(8, '0')))
}, 1000)

// Stock V2.57 cuts the playing track's album to 29 bytes in a202 (emulator
// acceptance: "Quiet Meridian (The Complete "); titles arrive whole.
function cutAlbum(album) {
  const bytes = Buffer.from(album ?? '')
  return bytes.length <= 29
    ? album
    : bytes
        .subarray(0, 29)
        .toString('utf8')
        .replace(/\uFFFD+$/, '')
}

function a202() {
  const track = player.list[player.index]
  // Like stock after its queue ended or USB storage mode: no play state at all.
  if (!track || player.silent) return ''
  const song = {
    song_name: track.TITLE,
    song_artist_name: track.ARTIST,
    // Like stock: always a string, empty for a file without an album tag.
    song_album_name: cutAlbum(track.ALBUM) ?? '',
    song_file_path: track.PATH,
    pos_id: player.index + 1,
    song_duration_time: track.DURATION,
    // Like stock: decoding facts of the playing file (Inner Space is a hi-res release here).
    song_sample_rate: track.ALBUM === 'Inner Space' ? 96000 : 44100,
    song_encoding_rate: track.ALBUM === 'Inner Space' ? 24 : 16,
    song_bit_rate: track.ALBUM === 'Inner Space' ? 4608 : 1411,
    is_dsd: false,
    ...(player.m3u ? { is_m3u: true, m3u_file_path: `${player.m3u}/${track.PATH.split('/').at(-1)}` } : {}),
  }
  return JSON.stringify({
    state: player.state,
    playerflag: player.flag,
    love: player.loved.has(track.PATH),
    song: JSON.stringify(song),
  })
}
function record(tag, payload = '') {
  return tag + (8 + Buffer.byteLength(payload)).toString(16).toUpperCase().padStart(4, '0') + payload
}
function send(response, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...extra,
  })
  response.end(body)
}
function admitted(request) {
  const origin = request.headers.origin
  return !origin || origin === `http://${request.headers.host}`
}
/** A file of the app: dist/ as copied into Apps/Disc Player, with its own origins.json. */
function appFile(path) {
  if (path === 'origins.json') return readFileSync(new URL(path, FIXTURES))
  const file = normalize(join(DIST, path))
  if (path === 'index.html' && !existsSync(file)) {
    // No build yet (dev:mock): the dev server serves the page itself.
    return Buffer.from('<!doctype html><title>mock</title>')
  }
  if (!file.startsWith(normalize(DIST)) || !existsSync(file) || !statSync(file).isFile()) return null
  return readFileSync(file)
}
/** The gateway's caching since combined-009: documents never, content-hashed names for good, the rest revalidated. */
function caching(path) {
  if (path.endsWith('.html')) return 'no-store'
  const name = path.split('/').pop()
  const hash = /-([A-Za-z0-9_-]{8,})\.[^.]+$/.exec(name)?.[1]
  return hash && /[0-9A-Z]/.test(hash) ? 'public, max-age=31536000, immutable' : 'no-cache'
}

const server = createServer((request, response) => {
  if (!admitted(request)) return send(response, 403, 'Host or Origin rejected\n')
  const url = new URL(request.url ?? '/', 'http://mock')
  if (url.pathname.startsWith('/api/') && url.search && !/^\/api\/(data|store)\//.test(url.pathname)) {
    return send(response, 405, 'Query strings are not accepted\n')
  }
  if (url.pathname === '/api/health') {
    const health = {
      service: 'disc-native-probe',
      api: 1,
      controlActive: player.owner !== null,
      readOnly: false,
      media: true,
      snPairing: true,
      history: true,
      favoriteAny: true,
      store: true,
      trash: true,
      ...(player.image === '009'
        ? { historyWrites: player.historyFailing ? 'failing' : 'ok', internalLists: true, externalLists: true }
        : {}),
    }
    return send(response, 200, JSON.stringify(health), 'application/json')
  }
  if (url.pathname === '/api/device') {
    // The output runs at 48 kHz, whatever the file: 44.1 kHz tracks show the resampling.
    const output = player.list[player.index]
      ? {
          active: true,
          device: 'pcm3p',
          state: player.state === 1 ? 'running' : 'paused',
          format: 'S32_LE',
          rate: 48000,
          channels: 2,
        }
      : { active: false }
    const facts = {
      battery: { capacity: 72, voltageMv: 3950, temperatureC: 31.5, cycles: 12 },
      card: { totalBytes: 64_000_000_000, freeBytes: 18_400_000_000 },
      output,
    }
    return send(response, 200, JSON.stringify(facts), 'application/json')
  }
  if (url.pathname === '/api/history' && request.method === 'POST') {
    // Combined-009: a play in a browser, with the SN and a fresh request ID; the service stamps its start.
    if (player.image !== '009') return send(response, 405, 'The history is read-only\n')
    if (!guarded(request, response)) return
    void readBody(request).then((text) => {
      let play
      try {
        play = JSON.parse(text)
      } catch {
        return send(response, 400, 'The body is {"path","seconds","title"?,"ctx"?}\n')
      }
      const known = ['path', 'seconds', 'title', 'ctx']
      if (!play || Object.keys(play).some((key) => !known.includes(key)) || typeof play.path !== 'string')
        return send(response, 400, 'The body is {"path","seconds","title"?,"ctx"?}\n')
      if (!TRACKS.some((track) => track.PATH === play.path)) return send(response, 404, 'No such music file\n')
      if (!Number.isInteger(play.seconds) || play.seconds < 1 || play.seconds > 86400)
        return send(response, 400, 'Seconds out of range\n')
      const t = Math.floor(Date.now() / 1000) - play.seconds
      const ctx = {
        type: null,
        count: 0,
        hash: null,
        album: null,
        artist: null,
        genre: null,
        folder: null,
        ...play.ctx,
      }
      HISTORY.push({ v: 1, t, path: play.path, title: play.title ?? null, s: play.seconds, source: 'browser', ctx })
      player.browserPlays.push(play)
      return send(
        response,
        201,
        JSON.stringify({ id: HISTORY.length, t, s: play.seconds, source: 'browser' }),
        'application/json',
      )
    })
    return
  }
  if (url.pathname === '/api/history') {
    return send(response, 200, JSON.stringify({ records: HISTORY, truncated: false }), 'application/json')
  }
  // Combined-009: M3U lists stock plays by path, in the hidden internal and the visible external folder.
  if (url.pathname === '/api/lists' || url.pathname.startsWith('/api/lists/')) {
    if (player.image !== '009') return send(response, 404, 'Not found\n')
    const [scope, encoded, extra] = url.pathname.slice('/api/lists/'.length).split('/')
    if (url.pathname === '/api/lists')
      return send(response, 200, JSON.stringify({ scopes: LIST_FOLDERS }), 'application/json')
    const lists = LISTS[scope]
    if (!lists || extra !== undefined) return send(response, 404, 'No such list scope\n')
    const folder = LIST_FOLDERS[scope]
    const file = (name, entries) => ({
      name,
      path: `${folder}/${name}.m3u`,
      bytes: 11 + entries.reduce((sum, entry) => sum + Buffer.byteLength(entry) - 11, 0),
      modified: 1790000000,
    })
    if (!encoded) {
      const rows = [...lists].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, entries]) => file(name, entries))
      return send(
        response,
        200,
        JSON.stringify({ folder, lists: rows, count: rows.length, truncated: false, max: 200, maxEntries: 5000 }),
        'application/json',
      )
    }
    const name = decodeURIComponent(encoded)
    if (request.method === 'GET') {
      const entries = lists.get(name)
      if (!entries) return send(response, 404, 'No such list\n')
      return send(
        response,
        200,
        JSON.stringify({ ...file(name, entries), entries, count: entries.length }),
        'application/json',
      )
    }
    if (!guarded(request, response)) return
    // eslint-disable-next-line no-control-regex -- the service refuses control characters in names
    if (/[/\\:*?"<>|\u0000-\u001f]/.test(name) || /^[\s.]|[\s.]$/.test(name) || Buffer.byteLength(name) > 96)
      return send(response, 400, 'Not a list name\n')
    if (request.method === 'DELETE') {
      if (!lists.delete(name)) return send(response, 404, 'No such list\n')
      return send(response, 200, JSON.stringify({ name, deleted: true }), 'application/json')
    }
    if (request.method !== 'PUT') return send(response, 405, 'Lists are read, written or deleted\n')
    void readBody(request).then((text) => {
      let entries
      try {
        entries = JSON.parse(text).entries
      } catch {
        return send(response, 400, 'The body is {"entries":[...]}\n')
      }
      if (!Array.isArray(entries)) return send(response, 400, 'The body is {"entries":[...]}\n')
      const refused = entries.find((entry) => !TRACKS.some((track) => track.PATH === entry))
      if (refused !== undefined)
        return send(
          response,
          400,
          JSON.stringify({ error: 'Not a music file on the card', entry: refused }),
          'application/json',
        )
      if (!lists.has(name) && lists.size >= 200) return send(response, 409, 'Too many lists\n')
      const replaced = lists.has(name)
      lists.set(name, entries)
      return send(
        response,
        replaced ? 200 : 201,
        JSON.stringify({ ...file(name, entries), entries, replaced }),
        'application/json',
      )
    })
    return
  }
  // Combined-009: the card in one request (a folder, or the whole tree with audio facts).
  if (url.pathname === '/api/card/folder' || url.pathname.startsWith('/api/card/folder/')) {
    if (player.image !== '009') return send(response, 404, 'Not found\n')
    const folder = url.pathname
      .slice('/api/card/folder'.length)
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
      .join('/')
    const entries = folderEntries(folder)
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((entry) => {
        if (entry.dir) return { name: entry.name, dir: true, modified: 1790000000 }
        const path = `/tmp/sdcard/${folder ? `${folder}/` : ''}${entry.name}`
        const info = mediaRoute('info', path)
        const bytes = info.status === 200 ? JSON.parse(info.body).bytes : 40_000
        const kind = entry.image ? 'image' : /\.lrc$/i.test(entry.name) ? 'lyrics' : 'audio'
        return { name: entry.name, dir: false, kind, bytes, modified: 1790000000 }
      })
    if (!entries.length && folder && !TRACKS.some((track) => track.PATH.startsWith(`/tmp/sdcard/${folder}/`)))
      return send(response, 404, 'No such folder\n')
    return send(
      response,
      200,
      JSON.stringify({ path: folder, entries, count: entries.length, truncated: false }),
      'application/json',
    )
  }
  if (url.pathname === '/api/card/tree') {
    if (player.image !== '009') return send(response, 404, 'Not found\n')
    player.treeReads++
    const gone = (path) => [...trash.removed].some((removed) => path === removed || path.startsWith(`${removed}/`))
    const paths = [...new Set([...TRACKS.map((track) => track.PATH), ...player.uploads.map((upload) => upload.path)])]
      .filter((path) => !gone(path) && !player.infoMissing.has(path))
      .sort()
    const folders = new Set()
    const entries = []
    for (const path of paths) {
      const relative = path.slice('/tmp/sdcard/'.length)
      const parts = relative.split('/')
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join('/')
        if (!folders.has(folder)) {
          folders.add(folder)
          entries.push({ path: folder, dir: true, modified: 1790000000 })
        }
      }
      const info = mediaRoute('info', path)
      if (info.status !== 200) {
        entries.push({
          path: relative,
          bytes: 40_000,
          modified: 1790000000,
          kind: /\.lrc$/i.test(path) ? 'lyrics' : 'image',
        })
        continue
      }
      const facts = JSON.parse(info.body)
      entries.push({
        path: relative,
        bytes: facts.bytes,
        modified: 1790000000,
        kind: 'audio',
        format: facts.format,
        sampleRate: facts.sampleRate,
        bitDepth: facts.bitDepth,
        channels: facts.channels,
        bitRate: null,
        durationMs: facts.durationMs,
        year: facts.tags?.date ? String(facts.tags.date).slice(0, 4) : null,
      })
    }
    const files = entries.filter((entry) => !entry.dir)
    const tree = {
      root: '/tmp/sdcard',
      path: '',
      entries,
      folders: folders.size,
      files: files.length,
      bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
      truncated: false,
      elapsedMs: 3,
    }
    return send(response, 200, JSON.stringify(tree), 'application/json')
  }
  const favorite = /^\/api\/favorites\/(\d+)$/.exec(url.pathname)
  if (favorite) {
    if (request.method !== 'POST') return send(response, 405, 'Favorites take a bodyless POST\n')
    if (!credential(request.headers['x-disc-token'])) return send(response, 403, 'Token required\n')
    const id = request.headers['x-disc-request']
    if (!id || player.seen.has(id)) return send(response, 409, 'Request ID already used\n')
    player.seen.add(id)
    const track = TRACKS.find((row) => row.ID === Number(favorite[1]))
    if (!track) return send(response, 404, 'No such song in the library\n')
    const already = FAVORITES.includes(track)
    if (!already) FAVORITES.push(track)
    const body = { songId: track.ID, favorite: true, loveId: 1000 + track.ID, already }
    return send(response, 200, JSON.stringify(body), 'application/json')
  }
  if (url.pathname === '/api/about') {
    const about = {
      service: {
        name: 'disc-native-probe',
        version: player.image === '009' ? '0.9.0' : '0.8.0',
        build: 'mock',
        api: 1,
        uptime: 3600,
        supervised: true,
      },
      image: {
        schema: 1,
        variant: 'usb-engineering',
        firmwareVersion: '2.57',
        app: { name: 'Disc Player', version: null },
      },
      page: { source: 'card', app: 'Disc Player', version: '2026.09.29' },
      card: { owned: true },
      database: {
        state: 'ok',
        schema: player.image === '009' ? 5 : 4,
        bytes: 90112,
        plays: HISTORY.length,
        records: 0,
        trash: trash.entries.length,
        ...(player.image === '009'
          ? {
              writes: player.historyFailing
                ? { failed: 2, lastFailure: 1790000200, lastSuccess: 1790000100, reason: 'card full' }
                : { failed: 0, lastFailure: null, lastSuccess: 1790000100, reason: null },
            }
          : {}),
      },
      restarts: ['1790000000 restarted after signal 11'],
      log: [{ t: 1790000100, m: 'Skip rule: skipped to the next track' }],
    }
    return send(response, 200, JSON.stringify(about), 'application/json')
  }
  // The store: collections of the card catalog, the same operations for each.
  if (url.pathname === '/api/store') {
    const collections = Object.fromEntries(
      Object.keys(STORE_KEYS).map((name) => [
        name,
        { records: storeData[name].size, max_records: STORE_LIMITS[name], skip: name === 'disliked' },
      ]),
    )
    return send(response, 200, JSON.stringify({ collections }), 'application/json')
  }
  const storeRoute = /^\/api\/store\/([a-z_]+)\/(records|count|record|batch)$/.exec(url.pathname)
  if (storeRoute) {
    const [, collection, operation] = storeRoute
    const records = storeData[collection]
    if (!records) return send(response, 404, 'No such collection or operation\n')
    if (operation === 'records' && request.method === 'GET') {
      const all = [...records.values()]
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 100)
      const page = all.slice(offset, offset + limit)
      const body = {
        collection,
        records: page,
        total: all.length,
        offset,
        truncated: offset + page.length < all.length,
      }
      return send(response, 200, JSON.stringify(body), 'application/json')
    }
    if (operation === 'record' && request.method === 'PUT') {
      if (!guarded(request, response)) return
      void readBody(request).then((text) => {
        let value
        try {
          value = JSON.parse(text)
        } catch {
          return send(response, 400, 'A record is a JSON object\n')
        }
        if (!value || typeof value !== 'object' || STORE_KEYS[collection].some((name, i) => i === 0 && !value[name]))
          return send(response, 400, 'A required field is missing\n')
        // A card catalog from before the rotation periods (/__mock/store-old) knows no written day or period.
        if (player.storeOld && collection === 'auto_playlists' && ('written' in value || 'period' in value))
          return send(response, 400, 'Unknown field\n')
        const key = storeKey(collection, value)
        const created = !records.has(key)
        if (created && records.size >= STORE_LIMITS[collection]) return send(response, 409, 'The collection is full\n')
        const updated = Math.floor(Date.now() / 1000)
        records.set(key, { key: JSON.parse(key), value, updated })
        send(response, 200, JSON.stringify({ collection, key: JSON.parse(key), created, updated }), 'application/json')
      })
      return
    }
    if (operation === 'record' && request.method === 'DELETE') {
      if (!guarded(request, response)) return
      const key = storeKey(collection, Object.fromEntries(url.searchParams))
      const deleted = records.delete(key)
      return send(response, 200, JSON.stringify({ collection, key: JSON.parse(key), deleted }), 'application/json')
    }
    return send(response, 405, 'Method not allowed for this operation\n')
  }
  // The trash: moved card files wait in .disc/trash; restore, purge and empty.
  if (url.pathname === '/api/card/leftovers' && request.method === 'GET') {
    const body = {
      files: leftovers.reduce((sum, item) => sum + item.files, 0),
      bytes: leftovers.reduce((sum, item) => sum + item.bytes, 0),
      items: leftovers,
      count: leftovers.length,
      truncated: false,
    }
    return send(response, 200, JSON.stringify(body), 'application/json')
  }
  if (url.pathname === '/api/card/leftovers/trash' && request.method === 'POST') {
    if (!guarded(request, response)) return
    if (!leftovers.length) return send(response, 404, 'No macOS leftovers on the card\n')
    const entry = {
      id: trash.next++,
      path: '/tmp/sdcard',
      kind: 'leftovers',
      bytes: leftovers.reduce((sum, item) => sum + item.bytes, 0),
      files: leftovers.reduce((sum, item) => sum + item.files, 0),
      trashed: Math.floor(Date.now() / 1000),
      complete: true,
    }
    trash.entries.unshift(entry)
    leftovers = []
    return send(response, 200, JSON.stringify({ ...entry, skipped: 0 }), 'application/json')
  }
  if (url.pathname === '/api/trash' || url.pathname.startsWith('/api/trash/')) {
    const summary = () => ({
      entries: trash.entries,
      count: trash.entries.length,
      bytes: trash.entries.reduce((sum, entry) => sum + entry.bytes, 0),
      truncated: false,
    })
    if (url.pathname === '/api/trash' && request.method === 'GET')
      return send(response, 200, JSON.stringify(summary()), 'application/json')
    if (!guarded(request, response)) return
    if (url.pathname === '/api/trash' && request.method === 'POST') {
      void readBody(request).then((text) => {
        let path
        try {
          path = JSON.parse(text).path
        } catch {
          return send(response, 400, 'The body is {"path":"<a file or folder on the card>"}\n')
        }
        if (typeof path !== 'string' || !path.startsWith('/tmp/sdcard/') || path.includes('/.'))
          return send(response, 400, 'Not a file or folder on the card\n')
        const playing = player.list[player.index]?.PATH
        if (playing && (playing === path || playing.startsWith(`${path}/`)))
          return send(response, 409, 'The player has it open\n')
        const inside = TRACKS.filter((track) => track.PATH === path || track.PATH.startsWith(`${path}/`))
        const folder = inside.some((track) => track.PATH !== path) || player.folders.has(path.slice(12))
        if (!inside.length && !folder && !player.uploads.some((upload) => upload.path === path))
          return send(response, 404, 'No such file or folder\n')
        const entry = {
          id: trash.next++,
          path,
          kind: folder ? 'folder' : 'file',
          bytes: Math.max(inside.length, 1) * 25_000_000,
          files: Math.max(inside.length, 1),
          trashed: Math.floor(Date.now() / 1000),
          complete: true,
        }
        trash.entries.unshift(entry)
        trash.removed.add(path)
        send(response, 200, JSON.stringify(entry), 'application/json')
      })
      return
    }
    if (url.pathname === '/api/trash' && request.method === 'DELETE') {
      const purged = trash.entries.length
      trash.entries = []
      return send(response, 200, JSON.stringify({ purged }), 'application/json')
    }
    const one = /^\/api\/trash\/(\d+)(\/restore)?$/.exec(url.pathname)
    const entry = one ? trash.entries.find((item) => item.id === Number(one[1])) : null
    if (!entry) return send(response, 404, 'No such entry in the trash\n')
    trash.entries = trash.entries.filter((item) => item !== entry)
    if (one[2] && request.method === 'POST') {
      trash.removed.delete(entry.path)
      if (entry.kind === 'leftovers') leftovers = [...LEFTOVERS]
      return send(response, 200, JSON.stringify({ id: entry.id, path: entry.path, restored: true }), 'application/json')
    }
    return send(response, 200, JSON.stringify({ id: entry.id, purged: true }), 'application/json')
  }
  if (url.pathname.startsWith('/api/media/audio/') && request.method === 'GET') {
    const path = decodeURIComponent(url.pathname.slice('/api/media/audio'.length))
    if (!TRACKS.some((track) => track.PATH === path)) return send(response, 404, 'No such music file\n')
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
    if (!range) return send(response, 200, WAV, 'audio/wav', { 'Accept-Ranges': 'bytes' })
    const first = Number(range[1])
    const last = range[2] ? Math.min(Number(range[2]), WAV.length - 1) : WAV.length - 1
    if (first >= WAV.length) return send(response, 416, '', 'text/plain', { 'Content-Range': `bytes */${WAV.length}` })
    return send(response, 206, WAV.subarray(first, last + 1), 'audio/wav', {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${first}-${last}/${WAV.length}`,
    })
  }
  if (url.pathname === '/api/data/queue_state') {
    const body = {
      query: 'queue_state',
      columns: ['present'],
      rows: [[player.queueDropped ? 0 : 1]],
      rows_returned: 1,
      truncated: false,
    }
    return send(response, 200, JSON.stringify(body), 'application/json')
  }
  if (url.pathname === '/api/data/queue' && player.queueDropped)
    return send(response, 503, 'Database busy or unavailable\n')
  if (url.pathname === '/api/data/library_summary' && player.summaryBusy > 0) {
    player.summaryBusy--
    return send(response, 503, 'Database busy\n')
  }
  if (url.pathname.startsWith('/api/data/')) {
    const query = url.pathname.slice(10)
    const memory = { row: player.index + 1, type: player.flag === 3 ? 3 : player.flag === 1 ? 1 : 2 }
    const result = dataQuery(query, url.searchParams, LANGUAGE, player.list, memory)
    const json = typeof result.body !== 'string'
    const body = json
      ? JSON.stringify({ query, ...result.body, rows_returned: result.body.rows.length, truncated: false })
      : result.body
    const reply = () => send(response, result.status, body, json ? 'application/json' : 'text/plain; charset=utf-8')
    return DELAY ? void setTimeout(reply, DELAY) : reply()
  }
  // Test hook: stock falls silent (its queue ended, or USB storage mode handed the card back).
  // Stock dropped its queue table: a scan removed a file of the current queue (V2.57).
  if (url.pathname === '/__mock/queue-dropped' && request.method === 'POST') {
    player.queueDropped = url.searchParams.get('on') === '1'
    return send(response, 204, '')
  }
  // The image the mock stands for: 008 has no card listing, browser plays or write diagnostics.
  if (url.pathname === '/__mock/image' && request.method === 'POST') {
    player.image = url.searchParams.get('version') === '008' ? '008' : '009'
    return send(response, 204, '')
  }
  // The service's last play write failed, as with a full card.
  if (url.pathname === '/__mock/history-failing' && request.method === 'POST') {
    player.historyFailing = url.searchParams.get('on') === '1'
    return send(response, 204, '')
  }
  if (url.pathname === '/__mock/tree-reads' && request.method === 'GET') {
    return send(response, 200, JSON.stringify({ reads: player.treeReads }), 'application/json')
  }
  if (url.pathname === '/__mock/browser-plays' && request.method === 'GET') {
    return send(response, 200, JSON.stringify(player.browserPlays), 'application/json')
  }
  if (url.pathname === '/__mock/store-old' && request.method === 'POST') {
    player.storeOld = url.searchParams.get('on') === '1'
    return send(response, 204, '')
  }
  // Forgets every list and automatic playlist record, so the shared mock is as it was.
  if (url.pathname === '/__mock/lists' && request.method === 'DELETE') {
    LISTS.internal.clear()
    LISTS.external.clear()
    storeData.auto_playlists.clear()
    return send(response, 204, '')
  }
  // Takes the reported plays out of the history again, so the shared mock is as it was.
  if (url.pathname === '/__mock/browser-plays' && request.method === 'DELETE') {
    for (let i = HISTORY.length - 1; i >= 0; i--) if (HISTORY[i].source === 'browser') HISTORY.splice(i, 1)
    player.browserPlays = []
    return send(response, 204, '')
  }
  // The counts answer busy this many times, as while stock scans after USB storage mode.
  if (url.pathname === '/__mock/summary-busy' && request.method === 'POST') {
    player.summaryBusy = Number(url.searchParams.get('times') ?? 0)
    return send(response, 204, '')
  }
  // A library file whose media info answers 404 (gone from the card); an empty title clears the list.
  if (url.pathname === '/__mock/info-missing' && request.method === 'POST') {
    const title = url.searchParams.get('title') ?? ''
    if (!title) player.infoMissing.clear()
    for (const track of TRACKS) if (track.TITLE === title) player.infoMissing.add(track.PATH)
    return send(response, 204, '')
  }
  if (url.pathname === '/__mock/info-reads' && request.method === 'GET') {
    const title = url.searchParams.get('title') ?? ''
    const reads = TRACKS.filter((track) => track.TITLE === title).reduce(
      (sum, track) => sum + (player.infoReads.get(track.PATH) ?? 0),
      0,
    )
    return send(response, 200, JSON.stringify({ reads }), 'application/json')
  }
  if (url.pathname === '/__mock/silent' && request.method === 'POST') {
    player.silent = true
    player.state = 1
    return send(response, 204, '')
  }
  // The playback browser: the same entries with stock's positions (subfolders count).
  if (url.pathname.startsWith('/api/stock/localdir/tmp/sdcard/') && request.method === 'GET') {
    const relative = decodeURIComponent(url.pathname.slice('/api/stock/localdir/tmp/sdcard/'.length))
    const entries = folderEntries(relative.replace(/\/$/, ''))
    if (!entries.length) return send(response, 200, '')
    const start = Number(request.headers['start-pos'] ?? 0)
    const max = Math.min(Number(request.headers['num-max'] ?? 200), 200)
    const rows = entries.slice(start, start + max).map((entry, index) => ({
      pos: start + index,
      is_dir: entry.dir,
      name: entry.name,
      is_cue: false,
      is_m3u: false,
      is_image: entry.image,
    }))
    return send(response, 200, JSON.stringify(rows), 'application/json', {
      'total-num': String(entries.length),
      'mark-pos': '-1',
    })
  }
  // Folders: GET lists one (paged, total-num; an empty folder answers an empty 200), POST creates one.
  if (url.pathname.startsWith('/api/stock/dir/tmp/sdcard/')) {
    const relative = decodeURIComponent(url.pathname.slice('/api/stock/dir/tmp/sdcard/'.length))
    if (request.method === 'GET') {
      // Like stock (V2.57): the folder listed last is answered from memory until another
      // one is listed or stock itself changes the card; the service's trash moves do not.
      const folder = relative.replace(/\/$/, '')
      const entries = listed?.folder === folder ? listed.entries : folderEntries(folder)
      listed = { folder, entries }
      if (!entries.length) return send(response, 200, '')
      const start = Number(request.headers['start-pos'] ?? 0)
      const max = Math.min(Number(request.headers['num-max'] ?? 200), 200)
      const rows = entries.slice(start, start + max).map((entry, index) => ({
        pos: start + index,
        is_dir: entry.dir,
        name: entry.name,
        is_cue: false,
        is_m3u: false,
        is_image: entry.image,
      }))
      return send(response, 200, JSON.stringify(rows), 'application/json', { 'total-num': String(entries.length) })
    }
    if (request.method === 'POST') {
      if (!credential(request.headers['x-disc-token'])) return send(response, 403, 'Token required\n')
      const id = request.headers['x-disc-request']
      if (!id || player.seen.has(id)) return send(response, 409, 'Request ID already used\n')
      player.seen.add(id)
      const created = relative.replace(/\/$/, '')
      const parent = created.includes('/') ? created.slice(0, created.lastIndexOf('/')) : ''
      const name = created.slice(parent ? parent.length + 1 : 0)
      const exists = folderEntries(parent).some((entry) => entry.dir && entry.name === name)
      if (!exists) player.folders.add(created)
      listed = null
      return send(response, 200, '', 'text/plain', { 'is-exist': exists ? '1' : '0' })
    }
    return send(response, 405, 'Folder routes are GET or POST\n')
  }
  if (url.pathname.startsWith('/api/stock/audio/tmp/sdcard/') && request.method === 'POST') {
    const path = decodeURIComponent(url.pathname.slice('/api/stock/audio'.length))
    if (!credential(request.headers['x-disc-token'])) return send(response, 403, 'Token required\n')
    const id = request.headers['x-disc-request']
    if (!id || player.seen.has(id)) return send(response, 409, 'Request ID already used\n')
    if (!MEDIA_NAME.test(path)) return send(response, 403, 'Not admitted by the command catalog\n')
    player.seen.add(id)
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      const bytes = body.length
      // A "Busy Once" file is refused before it is stored the first time only.
      if (path.includes('Busy Once') && !busyOnce.has(path)) {
        busyOnce.add(path)
        return send(response, 503, 'Card busy\n')
      }
      if (TRACKS.some((track) => track.PATH === path) || player.uploads.some((upload) => upload.path === path)) {
        return send(response, 409, 'File already exists; no overwrite\n')
      }
      // A lyrics file keeps its text and a folder cover its bytes: the media route serves them for its tracks.
      const lower = path.toLowerCase()
      player.uploads.push({
        path,
        bytes,
        text: lower.endsWith('.lrc') ? body.toString('utf8') : null,
        image: /\/cover\.(jpe?g|png)$/.test(lower) ? body : null,
      })
      listed = null
      send(response, 201, JSON.stringify({ path, bytes, indexed: false }), 'application/json')
    })
    return
  }
  if (url.pathname.startsWith('/api/media/')) {
    if (request.method !== 'GET') return send(response, 405, 'Media routes are bodyless GET\n')
    if (url.pathname === '/api/media/current-lyrics') return send(response, 204, '')
    const match = /^\/api\/media\/(info|cover|lyrics)(\/.+)$/.exec(url.pathname)
    if (!match) return send(response, 404, 'Unknown media route\n')
    const mediaFile = decodeURIComponent(match[2])
    if (match[1] === 'lyrics') {
      const stem = mediaFile.replace(/\.[^./]+$/, '')
      const sidecar = player.uploads.find((upload) => upload.text !== null && upload.path === `${stem}.lrc`)
      if (sidecar?.text)
        return send(response, 200, sidecar.text, 'text/plain; charset=utf-8', { 'X-Lyrics-Source': 'sidecar' })
    }
    if (match[1] === 'cover') {
      const folder = mediaFile.slice(0, mediaFile.lastIndexOf('/'))
      const cover = player.uploads.find((upload) => upload.image && upload.path.startsWith(`${folder}/cover.`))
      if (cover?.image)
        return send(response, 200, cover.image, cover.path.endsWith('.png') ? 'image/png' : 'image/jpeg', {})
    }
    if (match[1] === 'info') {
      player.infoReads.set(mediaFile, (player.infoReads.get(mediaFile) ?? 0) + 1)
      if (player.infoMissing.has(mediaFile)) return send(response, 404, 'No such file\n')
    }
    const result = mediaRoute(match[1], mediaFile)
    if (result.cover) return send(response, 200, readFileSync(new URL('cover.png', FIXTURES)), 'image/png')
    return send(response, result.status, result.body, result.type ?? 'text/plain; charset=utf-8', result.headers ?? {})
  }
  if (url.pathname === '/api/stock/image/cover/') {
    // Like the real gateway, the proxied body is labelled as JSON.
    const body = player.list[player.index] ? readFileSync(new URL('cover.png', FIXTURES)) : Buffer.alloc(0)
    return send(response, 200, body, 'application/json; charset=utf-8')
  }
  // Playlist mutations: token, fresh request ID, then the stock change and an empty 200.
  const playlistRoute =
    (url.pathname === '/api/stock/custom_list_cmd/' && request.method === 'POST') ||
    (url.pathname === '/api/stock/add_custom_list/' && request.method === 'POST') ||
    (url.pathname === '/api/stock/song_category_tree/' && request.method === 'DELETE')
  if (playlistRoute) {
    if (!credential(request.headers['x-disc-token'])) return send(response, 403, 'Token required\n')
    const id = request.headers['x-disc-request']
    if (!id || player.seen.has(id)) return send(response, 409, 'Request ID already used\n')
    player.seen.add(id)
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString()
      const result = editPlaylists(url.pathname, request.headers, text ? JSON.parse(text) : null)
      if (result === null) return send(response, 403, 'Stock request not admitted by the catalog\n')
      send(response, 200, '', 'text/plain', result)
    })
    return
  }
  if (url.pathname === '/api/stock/song_category_tree/') {
    if (request.headers.type === 'curlist/song') {
      const page = catalogPage(request.headers, player.list)
      const extra = { 'total-num': String(page.total), 'mark-pos': String(player.list.length ? player.index : -1) }
      return send(response, 200, JSON.stringify(page.rows), 'application/json', extra)
    }
    const page = catalogPage(request.headers)
    if (!page) return send(response, 403, 'Stock request not admitted by the catalog\n')
    return send(response, 200, JSON.stringify(page.rows), 'application/json', { 'total-num': String(page.total) })
  }
  // The reviewed catalogs come from the service (the image's, or the card's override).
  if (url.pathname.startsWith('/api/contract/')) {
    const name = url.pathname.slice(14)
    if (!['compatibility.json', 'commands.json'].includes(name)) return send(response, 404, 'No such catalog\n')
    return send(response, 200, readFileSync(new URL(name, FIXTURES)), 'application/json', {
      'X-Catalog-Source': 'image',
    })
  }
  if (url.pathname.startsWith('/api/')) return send(response, 404, 'Not found\n')
  const own = '/apps/Disc%20Player/'
  const relative = url.pathname.startsWith(own) ? url.pathname.slice(own.length) : url.pathname.slice(1)
  const path = relative === '' ? 'index.html' : relative
  const body = path.split('/').some((part) => part.startsWith('.')) ? null : appFile(path)
  if (!body) return send(response, 404, 'Not found\n')
  return send(response, 200, body, TYPES[extname(path)] ?? 'application/octet-stream', {
    'Cache-Control': caching(path),
  })
})

const sockets = new WebSocketServer({ noServer: true, maxPayload: 65535 })
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/api/websocket' || !admitted(request)) return socket.destroy()
  if (player.owner) {
    socket.end('HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\n\r\n')
    return
  }
  sockets.handleUpgrade(request, socket, head, (ws) => {
    player.owner = ws
    player.socket = ws
    const session = { token: false, request: null }
    ws.on('close', () => {
      if (player.owner === ws) player.owner = null
      if (player.socket === ws) player.socket = null
    })
    ws.on('message', (data) => {
      const text = data.toString()
      if (text.startsWith('token:')) {
        session.token = credential(text.slice(6))
        // Like the gateway: a wrong credential closes the session at once.
        if (!session.token) ws.close(1008)
        return
      }
      if (text.startsWith('request:')) {
        session.request = text.slice(8)
        return
      }
      const tag = text.slice(0, 4)
      if (tag === '0599') return ws.send(record('a599', '0306'))
      // Stock answers status reads with a noticeable delay (as on the guest),
      // which exposes any state read back only after a result is reported.
      if (tag === '0501')
        return void setTimeout(
          () => ws.send(record('a501', JSON.stringify({ soc_version: 257, currentVolume: player.volume }))),
          600,
        )
      if (tag === '0105') return ws.send(record('a102', player.mode.toString(16).padStart(4, '0')))
      const hex4 = (value) => value.toString(16).toUpperCase().padStart(4, '0')
      const SOUND_READS = { '064a': 'gain', '0712': 'balance', '0603': 'filter', '0813': 'dre', '0824': 'spdif' }
      if (SOUND_READS[tag]) {
        const name = SOUND_READS[tag]
        const value = player.sound[name]
        const wire = name === 'balance' ? (value > 0 ? 0x100 + value : -value) : name === 'filter' ? value + 9 : value
        return ws.send(record('a' + tag.slice(1), hex4(wire)))
      }
      if (tag === '0202') return ws.send(record('a202', a202()))
      if (tag === '0639') return ws.send(record('a639', hex4(player.eq.preset)))
      if (tag === '0629') return ws.send(record('a629', hex4(Math.round(eqProfile().master * 10) & 0xffff)))
      if (tag === '0628') return ws.send(record('a628', peqReply(eqProfile().bands)))
      if (
        [
          '0201',
          '0101',
          '0100',
          '0102',
          '0103',
          '0104',
          '0502',
          '0622',
          '0649',
          '0713',
          '0653',
          '0812',
          '0823',
          '0690',
          '0630',
          '0678',
        ].includes(tag)
      ) {
        const id = session.request
        session.request = null
        if (!session.token || !id || player.seen.has(id)) return ws.close(1008)
        player.seen.add(id)
        const payload = text.slice(8)
        const select = (list, index, flag, m3u = null) => {
          player.silent = false
          // Like stock: a play from an M3U list names it in each song (is_m3u, m3u_file_path).
          player.m3u = m3u
          player.list = list
          player.index = index
          player.flag = flag
          player.state = 0
          player.position = 0
        }
        const album = (name) => TRACKS.filter((track) => track.ALBUM === name)
        // The stock sscanf form: {"artist":"A", "album":"B"} (no escapes).
        const scoped = (selector) => {
          const match = /^\{"artist":"([^"\\]*)", "album":"([^"\\]*)"\}$/.exec(selector)
          if (!match) return []
          // An empty album selects all of the artist's tracks (Play all only).
          return match[2] === '' ? TRACKS.filter((track) => track.ARTIST === match[1]) : artistAlbum(match[1], match[2])
        }
        const styled = (selector) => {
          const match = /^\{"style":"([^"\\]*)", "album":"([^"\\]*)"\}$/.exec(selector)
          return match ? genre(match[1], match[2] === '' ? null : match[2]) : []
        }
        const value = parseInt(payload.slice(0, 4), 16)
        if (tag === '0690') {
          if (![255, 0, 1, 2, 3, 4, 5, 6, 8, 9, 10].includes(value) && !(value >= 160 && value <= 169)) return
          player.eq.preset = value
          if (value >= 160) player.eq.last = value
          eqProfile()
          return ws.send(record('a639', hex4(value)))
        }
        if (tag === '0630' || tag === '0678') {
          if (!(player.eq.preset >= 160 && player.eq.preset <= 169)) return
          const profile = eqProfile()
          if (tag === '0630') profile.master = (value < 0x8000 ? value : value - 0x10000) / 10
          else {
            for (const band of JSON.parse(payload.slice(4))) {
              profile.bands[band.position] = {
                frequency: band.frequency,
                gain: Number(band.gain),
                q: Number(band.qValue),
              }
            }
          }
          return
        }
        if (tag === '0102') {
          player.mode = value
          return ws.send(record('a102', payload.slice(0, 4)))
        }
        if (tag === '0103') {
          player.position = Math.floor(parseInt(payload, 16) / 1000) * 1000
          return
        }
        if (tag === '0104') {
          const current = player.list[player.index]
          if (current) {
            if (value) player.loved.add(current.PATH)
            else player.loved.delete(current.PATH)
            // Stock keeps one favorites list: the data level sees the change too.
            const at = FAVORITES.findIndex((track) => track.PATH === current.PATH)
            const track = TRACKS.find((item) => item.PATH === current.PATH)
            if (value && at < 0 && track) FAVORITES.push(track)
            if (!value && at >= 0) FAVORITES.splice(at, 1)
          }
        } else if (tag === '0502') {
          player.volume = value
          return
        } else if (tag === '0622') {
          ws.send(record('a60a', '000F'))
          setTimeout(() => ws.send(record('a622', hex4(TRACKS.length))), 300)
          setTimeout(() => {
            for (const upload of player.uploads.splice(0))
              if (AUDIO_NAME.test(upload.path)) indexUpload(upload.path, upload.bytes)
            ws.send(record('a622', hex4(TRACKS.length)))
            ws.send(record('a60a', '0005'))
          }, 900)
          return
        } else if (['0649', '0713', '0653', '0812', '0823'].includes(tag)) {
          const name = { '0649': 'gain', '0713': 'balance', '0653': 'filter', '0812': 'dre', '0823': 'spdif' }[tag]
          player.sound[name] =
            name === 'balance' ? (value >> 8 ? value & 0xff : -(value & 0xff)) : name === 'filter' ? value - 9 : value
          return
        } else if (tag === '0101' && payload.startsWith('0003')) select(album(payload.slice(4)), 0, 3)
        else if (tag === '0101' && payload.startsWith('0007')) select(scoped(payload.slice(4)), 0, 7)
        else if (tag === '0101' && payload.startsWith('0008')) select(styled(payload.slice(4)), 0, 8)
        else if (tag === '0101' && payload.startsWith('0004') && payload.endsWith('.m3u'))
          select(m3uTracks(payload.slice(4)), 0, 4, payload.slice(4))
        else if (tag === '0101' && payload.startsWith('0004')) select(folderTracks(payload.slice(4)), 0, 4)
        else if (tag === '0101' && payload.startsWith('0005'))
          select(PLAYLISTS[JSON.parse(payload.slice(4)).id]?.members ?? [], 0, 5)
        else if (tag === '0100') {
          const index = value
          const type = payload.slice(4, 8)
          if (type === '0003') select(album(payload.slice(8)), index, 3)
          else if (type === '0007') select(scoped(payload.slice(8)), index, 7)
          else if (type === '0008') select(styled(payload.slice(8)), index, 8)
          else if (type === '000A') select(genre(payload.slice(8), null), index, 10)
          else if (type === '0001') select(TRACKS, index, 1)
          else if (type === '0006') select(FAVORITES, index, 6)
          else if (type === '0005') select(PLAYLISTS[JSON.parse(payload.slice(8)).id]?.members ?? [], index, 5)
          else if (type === '0000') select(player.list, index, 0)
          else if (type === '0004' && payload.endsWith('.m3u'))
            select(m3uTracks(payload.slice(8)), index, 4, payload.slice(8))
          else if (type === '0004') {
            // A position in the playback browser, subfolders included; the queue holds the folder's files.
            const folder = payload.slice(8)
            const entry = folderEntries(folder.replace('/tmp/sdcard/', ''))[index]
            const files = folderTracks(folder)
            const at = entry ? files.findIndex((track) => track.PATH === `${folder}/${entry.name}`) : -1
            if (at < 0) return ws.close(1008)
            select(files, at, 4)
          } else return ws.close(1008)
        } else if (payload === '0000') player.state = player.state === 0 ? 1 : 0
        else if (payload === '0001') {
          player.index = Math.min(player.index + 1, player.list.length - 1)
          player.position = 0
        } else if (payload === '0002') {
          player.index = Math.max(player.index - 1, 0)
          player.position = 0
        }
        setTimeout(() => ws.send(record('a202', a202())), 50)
        // Like the stock after a track switch or pause: a partial a202 with the
        // state only, plus the unsolicited aa05 notification.
        if (tag === '0201') {
          setTimeout(() => ws.send(record('aa05', '0001')), 120)
          setTimeout(() => ws.send(record('a202', JSON.stringify({ state: player.state }))), 180)
        }
        return
      }
      ws.close(1008)
    })
  })
})

server.listen(PORT, '127.0.0.1', () => console.log(`mock gateway on http://127.0.0.1:${PORT}`))
