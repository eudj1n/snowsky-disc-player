import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importable, isAudio, validPath, validSelection } from '../../src/domain/imports'
import { muteStep, UNMUTE_FALLBACK } from '../../src/domain/player'
import { seek, setFavorite, setMode, setVolume, identityOf } from '../../src/gateway/controls'
import { parsePlayback } from '../../src/gateway/playback'
import { encodeRecord } from '../../src/gateway/record'
import { scanLibrary } from '../../src/gateway/scan'
import { GatewaySession, type SocketLike } from '../../src/gateway/session'
import { balanceLabel, decodeSound, encodeSound } from '../../src/gateway/sound'
import { uploadOutcome, uploadUrl } from '../../src/gateway/upload'

type Listener = (event: never) => void
class Socket implements SocketLike {
  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Listener[]>()
  constructor(private reply: (data: string) => string[]) {}
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) (listener as (e: unknown) => void)(event)
  }
  push(record: string): void {
    this.emit('message', { data: record })
  }
  send(data: string): void {
    this.sent.push(data)
    for (const reply of this.reply(data)) queueMicrotask(() => this.push(reply))
  }
  close(code = 1000): void {
    this.readyState = 3
    this.emit('close', { code })
  }
}

async function session(reply: (data: string) => string[]) {
  const socket = new Socket((data) => (data === '0599000C0000' ? [encodeRecord('a599', '0306')] : reply(data)))
  const { session: opened } = await GatewaySession.open('ws://x', () => {
    queueMicrotask(() => {
      socket.readyState = 1
      socket.emit('open')
    })
    return socket
  })
  opened.pair('t'.repeat(43))
  return { socket, session: opened }
}

const noop = () => undefined
const deps = (s: GatewaySession) => ({ session: s, guard: noop, attempted: noop, sleep: () => Promise.resolve() })
const song = JSON.stringify({
  song_name: 'Волны',
  song_artist_name: 'Берег',
  song_album_name: 'Тихий океан',
  pos_id: 1,
  song_duration_time: 200_000,
})
const a202 = (state: number, love = false) => encodeRecord('a202', JSON.stringify({ state, playerflag: 3, love, song }))

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())

describe('sound wire values', () => {
  it('packs balance direction and steps and normalizes both filter enums', () => {
    expect(encodeSound('balance', -20)).toBe('0014')
    expect(encodeSound('balance', 1)).toBe('0101')
    expect(encodeSound('balance', 20)).toBe('0114')
    expect(decodeSound('balance', '0114')).toBe(20)
    expect(decodeSound('balance', '0014')).toBe(-20)
    expect(decodeSound('balance', '0100')).toBe(0)
    expect(decodeSound('balance', '0215')).toBeNull()
    expect(encodeSound('filter', 0)).toBe('0009')
    expect(decodeSound('filter', '000E')).toBe(5)
    expect(decodeSound('filter', '0003')).toBe(3)
    expect(decodeSound('filter', '0007')).toBeNull()
    expect(decodeSound('dre', '0002')).toBeNull()
    expect(balanceLabel(-3)).toBe('L3')
    expect(balanceLabel(0)).toBe('0')
  })
})

describe('import selection rules', () => {
  it('accepts audio with FAT-safe unique paths within the bound', () => {
    expect(isAudio('Album/01 Track.FLAC')).toBe(true)
    expect(isAudio('cover.jpg')).toBe(false)
    expect(validPath('Album/Disc 1/Track.flac')).toBe(true)
    expect(validPath('Album/../x.flac')).toBe(false)
    expect(validPath('Album/Tra:ck.flac')).toBe(false)
    expect(validPath(' Album/x.flac')).toBe(false)
    expect(validPath('Album./x.flac')).toBe(false)
    const ok = [
      { path: 'A/1.flac', size: 10 },
      { path: 'A/2.flac', size: 10 },
    ]
    expect(validSelection(ok, 100)).toBe(true)
    expect(validSelection([...ok, { path: 'a/1.FLAC', size: 5 }], 100)).toBe(false)
    expect(validSelection([{ path: 'A/big.flac', size: 101 }], 100)).toBe(false)
    expect(validSelection([{ path: 'A/empty.flac', size: 0 }], 100)).toBe(false)
    expect(validSelection([], 100)).toBe(false)
  })

  it('lets lyrics and folder covers travel with the music, within their bounds', () => {
    expect(importable('Album/01 Track.lrc', 1000)).toBe(true)
    expect(importable('Album/Cover.JPG', 1000)).toBe(true)
    expect(importable('Album/folder.png', 1000)).toBe(true)
    expect(importable('Album/front.jpeg', 1000)).toBe(true)
    expect(importable('Album/back.jpg', 1000)).toBe(false)
    expect(importable('Album/notes.txt', 10)).toBe(false)
    expect(importable('Album/01 Track.lrc', 256 * 1024 + 1)).toBe(false)
    expect(importable('Album/cover.jpg', 8 * 1024 * 1024 + 1)).toBe(false)
    expect(
      validSelection(
        [
          { path: 'A/1.flac', size: 10 },
          { path: 'A/1.lrc', size: 10 },
          { path: 'A/cover.jpg', size: 10 },
        ],
        100,
      ),
    ).toBe(true)
    expect(
      validSelection(
        [
          { path: 'A/1.flac', size: 10 },
          { path: 'A/readme.txt', size: 10 },
        ],
        100,
      ),
    ).toBe(false)
  })

  it('encodes upload paths and maps gateway replies', () => {
    expect(uploadUrl('Моё/Disc 1/01.flac')).toBe('/api/stock/audio/tmp/sdcard/%D0%9C%D0%BE%D1%91/Disc%201/01.flac')
    const ok = JSON.stringify({ path: '/tmp/sdcard/A/1.flac', bytes: 10, indexed: false })
    expect(uploadOutcome(201, ok, 'A/1.flac', 10)).toBe('confirmed')
    expect(uploadOutcome(201, ok, 'A/1.flac', 11)).toBe('uncertain')
    expect(uploadOutcome(409, 'File already exists; no overwrite', 'A/1.flac', 10)).toBe('exists')
    expect(uploadOutcome(409, 'Request ID already used', 'A/1.flac', 10)).toBe('not-sent')
    expect(uploadOutcome(507, 'No space', 'A/1.flac', 10)).toBe('not-sent')
    expect(uploadOutcome(502, '', 'A/1.flac', 10)).toBe('uncertain')
  })
})

describe('current-state operations', () => {
  it('confirms volume by readback and reports an equal value as already set', async () => {
    let volume = 40
    const { socket, session: s } = await session((data) => {
      if (data === '05010008')
        return [encodeRecord('a501', JSON.stringify({ currentVolume: volume, soc_version: 257 }))]
      if (data.startsWith('0502')) volume = parseInt(data.slice(8), 16)
      return []
    })
    expect(await setVolume(deps(s), 60)).toBe('confirmed')
    expect(socket.sent.filter((d) => d.startsWith('0502'))).toEqual(['0502000C003C'])
    expect(await setVolume(deps(s), 60)).toBe('already')
    expect(socket.sent.filter((d) => d.startsWith('0502'))).toHaveLength(1)
  })

  it('sets a play mode with one readback', async () => {
    let mode = 0
    const { socket, session: s } = await session((data) => {
      if (data === '01050008') return [encodeRecord('a102', mode.toString(16).padStart(4, '0'))]
      if (data.startsWith('0102')) mode = parseInt(data.slice(8), 16)
      return []
    })
    expect(await setMode(deps(s), 1)).toBe('confirmed')
    expect(await setMode(deps(s), 1)).toBe('already')
    expect(socket.sent.filter((d) => d.startsWith('0102'))).toEqual(['0102000C0001'])
  })

  it('refuses a favorite when the displayed track differs', async () => {
    const { socket, session: s } = await session((data) => (data === '02020008' ? [a202(0, false)] : []))
    expect(await setFavorite(deps(s), true, 'another track')).toBe('not-sent')
    expect(socket.sent.some((d) => d.startsWith('0104'))).toBe(false)
  })

  it('confirms a favorite through the love flag of the same track', async () => {
    let love = false
    const { session: s } = await session((data) => {
      if (data === '02020008') return [a202(0, love)]
      if (data.startsWith('0104')) love = data.endsWith('0001')
      return []
    })
    const displayed = identityOf(parsePlayback(JSON.stringify({ state: 0, playerflag: 3, love: false, song })))
    expect(await setFavorite(deps(s), true, displayed)).toBe('confirmed')
  })

  it('reports a paused seek as waiting and never resends it', async () => {
    const { socket, session: s } = await session((data) => (data === '02020008' ? [a202(1)] : []))
    const displayed = identityOf(parsePlayback(JSON.stringify({ state: 1, playerflag: 3, song })))
    expect(await seek(deps(s), displayed ?? '', 200_000, 90_000)).toBe('waiting')
    expect(socket.sent.filter((d) => d.startsWith('0103'))).toEqual(['0103001000015F90'])
    expect(await seek(deps(s), 'other', 200_000, 90_000)).toBe('not-sent')
    expect(socket.sent.filter((d) => d.startsWith('0103'))).toHaveLength(1)
  })
})

describe('library scan', () => {
  it('starts once and ends on a60a 0005 after an observed start', async () => {
    const { socket, session: s } = await session(() => [])
    const progress: number[] = []
    const scan = scanLibrary({ session: s, guard: noop, attempted: noop, onProgress: (n) => progress.push(n) })
    await Promise.resolve()
    socket.push(encodeRecord('a60a', '0005'))
    socket.push(encodeRecord('a60a', '000F'))
    socket.push(encodeRecord('a622', '0010'))
    socket.push(encodeRecord('a60a', '0005'))
    expect(await scan).toEqual({ status: 'confirmed', discovered: 16 })
    expect(progress).toEqual([16])
    expect(socket.sent.filter((d) => d.startsWith('0622'))).toEqual(['0622000C0000'])
  })

  it('is uncertain when the end is not observed', async () => {
    const { session: s } = await session(() => [])
    const scan = scanLibrary({ session: s, guard: noop, attempted: noop, timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await scan).toEqual({ status: 'uncertain', discovered: null })
  })
})

describe('mute from the volume icon', () => {
  it('sends 0 and remembers the replaced level, then restores it', () => {
    expect(muteStep(45, null)).toEqual({ target: 0, remember: 45 })
    expect(muteStep(0, 45)).toEqual({ target: 45, remember: 45 })
  })

  it('unmutes to a quiet fallback without a valid remembered level, and never toggles an unknown volume', () => {
    expect(muteStep(0, null)).toEqual({ target: UNMUTE_FALLBACK, remember: null })
    expect(muteStep(0, 500)?.target).toBe(UNMUTE_FALLBACK)
    expect(muteStep(null, 45)).toBeNull()
  })
})
