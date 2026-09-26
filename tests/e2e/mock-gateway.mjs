#!/usr/bin/env node
// A synthetic stand-in for the DISC service gateway, for browser tests in CI
// and visual work without a player. It serves a built dist/ exactly as the
// gateway serves a published release (index.html at /, files only below
// /releases/<id>/, the same CSP), answers the data level and stock catalog
// pages from a fictional collection, and implements the WebSocket owner,
// token, request-ID and replay rules with a scripted player. It is not a
// protocol reference.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import {
  FAVORITES,
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
const BUNDLE = '0123456789abcdef'
const LANGUAGE = Number(process.env.MOCK_GATEWAY_LANGUAGE ?? 9)
// Optional latency for data reads, to see loading skeletons in development.
const DELAY = Number(process.env.MOCK_GATEWAY_DELAY ?? 0)
const TOKEN = process.env.MOCK_GATEWAY_TOKEN ?? 'mock-token-0123456789-abcdefghijklmnop'
// The card of this mock enables SN pairing; the emulator's all-zero SN stands in.
const SERIAL = '00000000000000'
const credential = (value) => value === TOKEN || value === SERIAL
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

// The scripted player: its current list (the stock queue), position, source flag.
const player = {
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
  socket: null,
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
  if (!track) return ''
  const song = {
    song_name: track.TITLE,
    song_artist_name: track.ARTIST,
    song_album_name: cutAlbum(track.ALBUM),
    song_file_path: track.PATH,
    pos_id: player.index + 1,
    song_duration_time: track.DURATION,
    // Like stock: decoding facts of the playing file (Inner Space is a hi-res release here).
    song_sample_rate: track.ALBUM === 'Inner Space' ? 96000 : 44100,
    song_encoding_rate: track.ALBUM === 'Inner Space' ? 24 : 16,
    song_bit_rate: track.ALBUM === 'Inner Space' ? 4608 : 1411,
    is_dsd: false,
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
function releaseFile(path) {
  if (['compatibility.json', 'commands.json'].includes(path)) return readFileSync(new URL(path, FIXTURES))
  const file = normalize(join(DIST, path))
  if (path === 'index.html' && !existsSync(file)) {
    // No build yet (dev:mock): the dev server only needs the active release id.
    return Buffer.from(`<!doctype html><title>mock</title><link rel="icon" href="/releases/${BUNDLE}/favicon.svg">`)
  }
  if (!file.startsWith(normalize(DIST)) || !existsSync(file) || !statSync(file).isFile()) return null
  const data = readFileSync(file)
  // The service publisher rewrites root-absolute document references.
  return path === 'index.html'
    ? Buffer.from(data.toString().replace(/\b(href|src)="\/(?!api\/)/g, `$1="/releases/${BUNDLE}/`))
    : data
}

const server = createServer((request, response) => {
  if (!admitted(request)) return send(response, 403, 'Host or Origin rejected\n')
  const url = new URL(request.url ?? '/', 'http://mock')
  if (url.pathname.startsWith('/api/') && url.search && !url.pathname.startsWith('/api/data/')) {
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
    }
    return send(response, 200, JSON.stringify(health), 'application/json')
  }
  if (url.pathname.startsWith('/api/data/')) {
    const query = url.pathname.slice(10)
    const result = dataQuery(query, url.searchParams, LANGUAGE)
    const json = typeof result.body !== 'string'
    const body = json
      ? JSON.stringify({ query, ...result.body, rows_returned: result.body.rows.length, truncated: false })
      : result.body
    const reply = () => send(response, result.status, body, json ? 'application/json' : 'text/plain; charset=utf-8')
    return DELAY ? void setTimeout(reply, DELAY) : reply()
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
      const bytes = Buffer.concat(chunks).length
      // A "Busy Once" file is refused before it is stored the first time only.
      if (path.includes('Busy Once') && !busyOnce.has(path)) {
        busyOnce.add(path)
        return send(response, 503, 'Card busy\n')
      }
      if (TRACKS.some((track) => track.PATH === path) || player.uploads.some((upload) => upload.path === path)) {
        return send(response, 409, 'File already exists; no overwrite\n')
      }
      player.uploads.push({ path, bytes })
      send(response, 201, JSON.stringify({ path, bytes, indexed: false }), 'application/json')
    })
    return
  }
  if (url.pathname.startsWith('/api/media/')) {
    if (request.method !== 'GET') return send(response, 405, 'Media routes are bodyless GET\n')
    if (url.pathname === '/api/media/current-lyrics') return send(response, 204, '')
    const match = /^\/api\/media\/(info|cover|lyrics)(\/.+)$/.exec(url.pathname)
    if (!match) return send(response, 404, 'Unknown media route\n')
    const result = mediaRoute(match[1], decodeURIComponent(match[2]))
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
  const prefix = `/releases/${BUNDLE}/`
  const path =
    url.pathname === '/' ? 'index.html' : url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : null
  const body = path ? releaseFile(path) : null
  if (!body) return send(response, 404, 'Not found\n')
  const cache = path === 'index.html' ? {} : { 'Cache-Control': 'public, max-age=31536000, immutable' }
  return send(response, 200, body, TYPES[extname(path)] ?? 'application/octet-stream', cache)
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
      if (tag === '0501')
        return ws.send(record('a501', JSON.stringify({ soc_version: 257, currentVolume: player.volume })))
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
        const select = (list, index, flag) => {
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
          else return ws.close(1008)
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
