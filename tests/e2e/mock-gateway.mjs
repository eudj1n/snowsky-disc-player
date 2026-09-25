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
import { FAVORITES, TRACKS, catalogPage, dataQuery } from './mock-collection.mjs'

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 4870)
const DIST = process.env.MOCK_GATEWAY_DIST ?? 'dist'
const FIXTURES = new URL('./fixtures/', import.meta.url)
const BUNDLE = '0123456789abcdef'
const LANGUAGE = Number(process.env.MOCK_GATEWAY_LANGUAGE ?? 9)
// Optional latency for data reads, to see loading skeletons in development.
const DELAY = Number(process.env.MOCK_GATEWAY_DELAY ?? 0)
const TOKEN = process.env.MOCK_GATEWAY_TOKEN ?? 'mock-token-0123456789-abcdefghijklmnop'
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
}

function a202() {
  const track = player.list[player.index]
  if (!track) return ''
  const song = {
    song_name: track.TITLE,
    song_artist_name: track.ARTIST,
    song_album_name: track.ALBUM,
    song_file_path: track.PATH,
    pos_id: player.index + 1,
    song_duration_time: track.DURATION,
  }
  return JSON.stringify({ state: player.state, playerflag: player.flag, love: false, song: JSON.stringify(song) })
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
    const health = { service: 'disc-native-probe', api: 1, controlActive: player.owner !== null, readOnly: false }
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
  if (url.pathname === '/api/stock/image/cover/') {
    // Like the real gateway, the proxied body is labelled as JSON.
    const body = player.list[player.index] ? readFileSync(new URL('cover.png', FIXTURES)) : Buffer.alloc(0)
    return send(response, 200, body, 'application/json; charset=utf-8')
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
      if (tag === '0201' || tag === '0101' || tag === '0100') {
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
        }
        const album = (name) => TRACKS.filter((track) => track.ALBUM === name)
        if (tag === '0101' && payload.startsWith('0003')) select(album(payload.slice(4)), 0, 3)
        else if (tag === '0100') {
          const index = parseInt(payload.slice(0, 4), 16)
          const type = payload.slice(4, 8)
          if (type === '0003') select(album(payload.slice(8)), index, 3)
          else if (type === '0001') select(TRACKS, index, 1)
          else if (type === '0006') select(FAVORITES, index, 6)
          else return ws.close(1008)
        } else if (payload === '0000') player.state = player.state === 0 ? 1 : 0
        else if (payload === '0001') player.index = Math.min(player.index + 1, player.list.length - 1)
        else if (payload === '0002') player.index = Math.max(player.index - 1, 0)
        setTimeout(() => ws.send(record('a202', a202())), 50)
        return
      }
      ws.close(1008)
    })
  })
})

server.listen(PORT, '127.0.0.1', () => console.log(`mock gateway on http://127.0.0.1:${PORT}`))
