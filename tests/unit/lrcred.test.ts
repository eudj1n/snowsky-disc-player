import { describe, expect, it } from 'vitest'
import { lyricsLevel, parseLyrics } from '../../src/domain/lyrics'
import { fetchLrcRedLyrics, matchingHits, searchLrcRed, type LrcRedHit } from '../../src/gateway/lrcred'
import { findLyricsOnline } from '../../src/gateway/lyricsOnline'

const WORDS = [
  '[ti:Signal]',
  '[ar:Lumen]',
  '',
  '[00:01.00]<00:01.00>Signal <00:01.50>in <00:01.80>the <00:02.00>night <00:02.60>',
  '[00:04.00]<00:04.00>Second <00:04.60>line <00:05.20>',
].join('\n')
const LINES = '[00:01.00]Signal in the night\n[00:04.00]Second line\n'
const PLAIN = 'Signal in the night\nSecond line\n'

const hit = (isrc: string, extra: Partial<LrcRedHit> = {}): LrcRedHit => ({
  isrc,
  title: 'Signal',
  artist: 'Lumen',
  album: 'Night Lines',
  duration: 25.4,
  ...extra,
})

/** A fake of both services, answering by path; records what was asked. */
function web(answers: Record<string, unknown>) {
  const asked: string[] = []
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    asked.push(url.host + url.pathname + url.search)
    const body = answers[url.host + url.pathname]
    if (body === undefined) return Promise.resolve(new Response('{"code":404}', { status: 404 }))
    if (body === 500) return Promise.resolve(new Response('down', { status: 500 }))
    if (typeof body === 'string') return Promise.resolve(new Response(body, { status: 200 }))
    return Promise.resolve(Response.json(body))
  }) as typeof fetch
  return { asked, fetchImpl }
}

const query = { artist: 'Lumen', title: 'Signal', album: 'Night Lines', durationMs: 25_400 }

describe('lyrics levels', () => {
  it('tells untimed, line-timed and word-timed lyrics apart', () => {
    expect(lyricsLevel(parseLyrics(PLAIN))).toBe('none')
    expect(lyricsLevel(parseLyrics(LINES))).toBe('line')
    expect(lyricsLevel(parseLyrics(WORDS))).toBe('word')
  })
})

describe('lrc.red', () => {
  it('searches by text and reads the hits it can use', async () => {
    const { asked, fetchImpl } = web({
      'lrc.red/search.json': {
        hits: [
          { isrc: 'GBAYE9200070', title: 'Signal', artist: 'Lumen', album: 'Night Lines', year: 2020, duration: 25.4 },
          { isrc: 'bad', title: 'Signal', artist: 'Lumen' },
          { title: 'No ISRC', artist: 'Lumen' },
          { isrc: 'QZJD82100004', title: 'Signal', artist: 'Someone Else' },
        ],
        next: 'p24',
      },
    })
    const hits = await searchLrcRed('Lumen Signal', fetchImpl)
    expect(asked).toEqual(['lrc.red/search.json?q=Lumen+Signal'])
    expect(hits).toEqual([
      { isrc: 'GBAYE9200070', title: 'Signal', artist: 'Lumen', album: 'Night Lines', duration: 25.4 },
      { isrc: 'QZJD82100004', title: 'Signal', artist: 'Someone Else', album: null, duration: null },
    ])
    await expect(searchLrcRed('x', web({ 'lrc.red/search.json': 500 }).fetchImpl)).rejects.toThrow(/500/)
  })

  it('reads a hit’s LRC and knows when there is none', async () => {
    const { asked, fetchImpl } = web({ 'lrc.red/s/GBAYE9200070.lrc': WORDS })
    expect(await fetchLrcRedLyrics('GBAYE9200070', fetchImpl)).toBe(WORDS)
    expect(await fetchLrcRedLyrics('ZZZZZ0000000', fetchImpl)).toBeNull()
    expect(asked).toEqual(['lrc.red/s/GBAYE9200070.lrc', 'lrc.red/s/ZZZZZ0000000.lrc'])
  })

  it('keeps the hits that are the track, the album’s edition and the nearest length first', () => {
    const hits = [
      hit('A00000000001', { album: 'Live', duration: 27 }),
      hit('A00000000002', { title: 'Signal (Remix)' }),
      hit('A00000000003', { artist: 'Someone Else' }),
      hit('A00000000004', { duration: 40 }),
      hit('A00000000005', { artist: 'Виктор Цой, Lumen', album: null, duration: 25 }),
      hit('A00000000006'),
      hit('A00000000007', { duration: null, album: 'Unknown' }),
    ]
    expect(matchingHits(hits, query).map((item) => item.isrc)).toEqual([
      'A00000000006',
      'A00000000005',
      'A00000000001',
      'A00000000007',
    ])
    expect(matchingHits(hits, { ...query, title: ' ' })).toEqual([])
    // Case, accents and punctuation aside.
    expect(matchingHits([hit('A00000000008', { title: 'SIGNAL!', artist: 'lümen' })], query)).toHaveLength(1)
  })
})

describe('lyrics from the allowed sources', () => {
  const search = {
    hits: [
      { isrc: 'A00000000001', title: 'Signal', artist: 'Lumen', album: 'Night Lines', duration: 25.4 },
      { isrc: 'A00000000002', title: 'Signal', artist: 'Lumen', album: 'Signal - Single', duration: 25 },
    ],
  }

  it('asks lrc.red first and stops at word timings', async () => {
    const { asked, fetchImpl } = web({
      'lrc.red/search.json': search,
      'lrc.red/s/A00000000001.lrc': WORDS,
      'lrclib.net/api/get': { syncedLyrics: LINES },
    })
    const result = await findLyricsOnline(query, ['lrcred', 'lrclib'], 'none', fetchImpl)
    expect(result.found).toEqual({ source: 'lrcred', text: WORDS, level: 'word' })
    expect(asked).toEqual(['lrc.red/search.json?q=Lumen+Signal', 'lrc.red/s/A00000000001.lrc'])
  })

  it('tries the next edition on lrc.red for word timings, then keeps the best level any source had', async () => {
    const { asked, fetchImpl } = web({
      'lrc.red/search.json': search,
      'lrc.red/s/A00000000001.lrc': LINES,
      'lrc.red/s/A00000000002.lrc': WORDS,
    })
    const words = await findLyricsOnline(query, ['lrcred'], 'word', fetchImpl)
    expect(words.found?.level).toBe('word')
    expect(asked).toHaveLength(3)
    // Wanting word timings, line timings are not offered, but their level is told.
    const lines = await findLyricsOnline(
      query,
      ['lrcred', 'lrclib'],
      'word',
      web({
        'lrc.red/search.json': search,
        'lrc.red/s/A00000000001.lrc': LINES,
        'lrclib.net/api/get': { syncedLyrics: LINES },
      }).fetchImpl,
    )
    expect(lines).toEqual({ found: null, best: 'line', instrumental: false, failed: [] })
  })

  it('takes LRCLIB’s synced lyrics over lrc.red’s plain text, and plain text when that is all', async () => {
    const synced = await findLyricsOnline(
      query,
      ['lrcred', 'lrclib'],
      'none',
      web({
        'lrc.red/search.json': search,
        'lrc.red/s/A00000000001.lrc': PLAIN,
        'lrclib.net/api/get': { syncedLyrics: LINES },
      }).fetchImpl,
    )
    expect(synced.found).toEqual({ source: 'lrclib', text: LINES, level: 'line' })
    const plain = await findLyricsOnline(
      query,
      ['lrcred', 'lrclib'],
      'none',
      web({ 'lrc.red/search.json': search, 'lrc.red/s/A00000000001.lrc': PLAIN }).fetchImpl,
    )
    expect(plain.found).toEqual({ source: 'lrcred', text: PLAIN, level: 'none' })
    const wanting = await findLyricsOnline(
      query,
      ['lrcred', 'lrclib'],
      'line',
      web({ 'lrc.red/search.json': search, 'lrc.red/s/A00000000001.lrc': PLAIN }).fetchImpl,
    )
    expect(wanting).toEqual({ found: null, best: 'none', instrumental: false, failed: [] })
  })

  it('names the sources it could not reach and asks only the ones given', async () => {
    const { asked, fetchImpl } = web({ 'lrc.red/search.json': 500, 'lrclib.net/api/get': { instrumental: true } })
    const result = await findLyricsOnline(query, ['lrcred', 'lrclib'], 'none', fetchImpl)
    expect(result).toEqual({ found: null, best: null, instrumental: true, failed: ['lrcred'] })
    const only = await findLyricsOnline(query, ['lrclib'], 'none', fetchImpl)
    expect(only.failed).toEqual([])
    expect(asked.filter((url) => url.startsWith('lrc.red'))).toHaveLength(1)
  })
})
