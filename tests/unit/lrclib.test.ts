import { describe, expect, it } from 'vitest'
import { sidecarPath } from '../../src/domain/lyrics'
import { findLyrics } from '../../src/gateway/lrclib'

/** A fake LRCLIB: answers by path, records what was asked. */
function lrclib(answers: Record<string, unknown>) {
  const asked: URL[] = []
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    asked.push(url)
    const body = answers[url.pathname]
    if (body === undefined) return Promise.resolve(new Response('{"code":404}', { status: 404 }))
    if (body === 500) return Promise.resolve(new Response('down', { status: 500 }))
    return Promise.resolve(Response.json(body))
  }) as typeof fetch
  return { asked, fetchImpl }
}

const query = { artist: 'Lumen', title: 'Signal', album: 'Night Lines', durationMs: 25_400 }

describe('LRCLIB lookups', () => {
  it('asks for the exact track first with its album and length in whole seconds', async () => {
    const { asked, fetchImpl } = lrclib({
      '/api/get': { syncedLyrics: '[00:01.00]Signal', plainLyrics: 'Signal', instrumental: false, duration: 25 },
    })
    expect(await findLyrics(query, fetchImpl)).toEqual({
      synced: '[00:01.00]Signal',
      plain: 'Signal',
      instrumental: false,
    })
    expect(asked).toHaveLength(1)
    expect(asked[0]?.origin).toBe('https://lrclib.net')
    expect(Object.fromEntries(asked[0]?.searchParams ?? [])).toEqual({
      artist_name: 'Lumen',
      track_name: 'Signal',
      album_name: 'Night Lines',
      duration: '25',
    })
  })

  it('searches when the exact lookup misses, keeping a result of about the same length, synced first', async () => {
    const { asked, fetchImpl } = lrclib({
      '/api/search': [
        { syncedLyrics: '[00:01.00]Long edit', duration: 300 },
        { plainLyrics: 'Plain words', duration: 26 },
        { syncedLyrics: '[00:01.00]Right one', duration: 24 },
      ],
    })
    expect((await findLyrics(query, fetchImpl))?.synced).toBe('[00:01.00]Right one')
    expect(asked.map((url) => url.pathname)).toEqual(['/api/get', '/api/search'])
  })

  it('searches directly without an album or a length, and says when there is nothing', async () => {
    const { asked, fetchImpl } = lrclib({ '/api/search': [{ instrumental: true, duration: 26 }] })
    expect(await findLyrics({ ...query, album: null }, fetchImpl)).toEqual({
      synced: null,
      plain: null,
      instrumental: true,
    })
    expect(asked.map((url) => url.pathname)).toEqual(['/api/search'])
    expect(await findLyrics(query, lrclib({ '/api/search': [] }).fetchImpl)).toBeNull()
  })

  it('throws when LRCLIB cannot answer', async () => {
    await expect(findLyrics(query, lrclib({ '/api/get': 500 }).fetchImpl)).rejects.toThrow('LRCLIB answered 500')
  })
})

describe('the lyrics file beside a track', () => {
  it('is the same stem with .lrc, relative to the card', () => {
    expect(sidecarPath('/tmp/sdcard/Lumen - Night Lines/a Signal.flac')).toBe('Lumen - Night Lines/a Signal.lrc')
    expect(sidecarPath('/tmp/sdcard/Top.v2.mp3')).toBe('Top.v2.lrc')
    expect(sidecarPath('/elsewhere/a.flac')).toBeNull()
    expect(sidecarPath('/tmp/sdcard/Album/.hidden')).toBeNull()
  })
})
