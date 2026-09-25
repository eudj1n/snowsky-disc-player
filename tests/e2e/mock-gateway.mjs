#!/usr/bin/env node
// A synthetic stand-in for the DISC service gateway, for browser tests in CI
// without a player: it serves a built dist/ exactly as the gateway serves a
// published release (index.html at /, files only below /releases/<id>/, the
// same CSP), and implements the WebSocket owner, token, request-ID and replay
// rules with a scripted player. It is not a protocol reference.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 4870)
const DIST = process.env.MOCK_GATEWAY_DIST ?? 'dist'
const FIXTURES = new URL('./fixtures/', import.meta.url)
const BUNDLE = '0123456789abcdef'
const LANGUAGE = Number(process.env.MOCK_GATEWAY_LANGUAGE ?? 9)
const TOKEN = process.env.MOCK_GATEWAY_TOKEN ?? 'mock-token-0123456789-abcdefghijklmnop'
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

const player = {
  state: 1,
  title: 'Question!',
  artist: 'System Of A Down',
  album: 'Mezmerize',
  owner: null,
  seen: new Set(),
}

function a202() {
  const song = {
    song_name: player.title,
    song_artist_name: player.artist,
    song_album_name: player.album,
    pos_id: 3,
    song_duration_time: 200000,
  }
  return JSON.stringify({ state: player.state, playerflag: 3, love: false, song: JSON.stringify(song) })
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
  const fixture = ['compatibility.json', 'commands.json'].includes(path) ? new URL(path, FIXTURES) : null
  if (fixture) return readFileSync(fixture)
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
const DATA = {
  system_settings: { columns: ['LANGUAGE', 'BATTERY'], rows: [[LANGUAGE, 100]] },
  library_summary: {
    columns: ['tracks', 'favorites', 'playlists', 'queue', 'last_added', 'last_id'],
    rows: [[779, 1, 3, 1, 0, 785]],
  },
}

const server = createServer((request, response) => {
  if (!admitted(request)) return send(response, 403, 'Host or Origin rejected\n')
  const url = new URL(request.url ?? '/', 'http://mock')
  if (url.pathname.startsWith('/api/') && url.search && !url.pathname.startsWith('/api/data/'))
    return send(response, 405, 'Query strings are not accepted\n')
  if (url.pathname === '/api/health') {
    return send(
      response,
      200,
      JSON.stringify({ service: 'disc-native-probe', api: 1, controlActive: player.owner !== null, readOnly: false }),
      'application/json',
    )
  }
  if (url.pathname.startsWith('/api/data/')) {
    const data = DATA[url.pathname.slice(10)]
    if (!data) return send(response, 404, 'Unknown query\n')
    return send(
      response,
      200,
      JSON.stringify({ query: url.pathname.slice(10), ...data, rows_returned: data.rows.length, truncated: false }),
      'application/json',
    )
  }
  const path =
    url.pathname === '/'
      ? 'index.html'
      : url.pathname.startsWith(`/releases/${BUNDLE}/`)
        ? url.pathname.slice(`/releases/${BUNDLE}/`.length)
        : null
  const body = path ? releaseFile(path) : null
  if (!body) return send(response, 404, 'Not found\n')
  return send(
    response,
    200,
    body,
    TYPES[extname(path)] ?? 'application/octet-stream',
    path === 'index.html' ? {} : { 'Cache-Control': 'public, max-age=31536000, immutable' },
  )
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
    const session = { token: false, request: null }
    ws.on('close', () => {
      if (player.owner === ws) player.owner = null
    })
    ws.on('message', (data) => {
      const text = data.toString()
      if (text.startsWith('token:')) {
        session.token = text.slice(6) === TOKEN
        return
      }
      if (text.startsWith('request:')) {
        session.request = text.slice(8)
        return
      }
      const tag = text.slice(0, 4)
      if (tag === '0599') return ws.send(record('a599', '0306'))
      if (tag === '0501') return ws.send(record('a501', JSON.stringify({ soc_version: 257, currentVolume: 40 })))
      if (tag === '0202') return ws.send(record('a202', a202()))
      if (tag === '0201') {
        const id = session.request
        session.request = null
        if (!session.token || !id || player.seen.has(id)) return ws.close(1008)
        player.seen.add(id)
        if (text.slice(8) === '0000') player.state = player.state === 0 ? 1 : 0
        setTimeout(() => ws.send(record('a202', a202())), 50)
        return
      }
      ws.close(1008)
    })
  })
})

server.listen(PORT, '127.0.0.1', () => console.log(`mock gateway on http://127.0.0.1:${PORT}`))
