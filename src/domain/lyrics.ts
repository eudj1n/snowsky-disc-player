/**
 * Lyrics as LRC or plain text. Timestamps `[mm:ss.xx]` (several per line are
 * allowed) make the lyrics synced; `[offset:±ms]` shifts them; metadata tags
 * (`[ar:…]`, `[ti:…]`) and word timings (`<mm:ss.xx>`) are dropped.
 */
export interface LyricLine {
  timeMs: number | null
  text: string
}

export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
}

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const META = /^\[(ar|ti|al|au|by|re|ve|length|offset|la|#):?([^\]]*)\]\s*$/i

export function parseLyrics(text: string): Lyrics {
  let offset = 0
  const timed: LyricLine[] = []
  const plain: LyricLine[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const meta = META.exec(line)
    if (meta) {
      if (meta[1]?.toLowerCase() === 'offset') offset = Number(meta[2]) || 0
      continue
    }
    const stamps = [...line.matchAll(STAMP)]
    const words = line
      .replace(STAMP, '')
      .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '')
      .trim()
    if (stamps.length) {
      for (const stamp of stamps) {
        const fraction = stamp[3] ?? '0'
        const ms = Number(stamp[1]) * 60_000 + Number(stamp[2]) * 1000 + Number(fraction.padEnd(3, '0').slice(0, 3))
        timed.push({ timeMs: Math.max(0, ms - offset), text: words })
      }
    } else {
      plain.push({ timeMs: null, text: words })
    }
  }
  if (timed.length) return { synced: true, lines: timed.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0)) }
  // Plain text: keep paragraphs, drop leading and trailing blank lines.
  while (plain[0]?.text === '') plain.shift()
  while (plain.at(-1)?.text === '') plain.pop()
  return { synced: false, lines: plain }
}

/** The index of the line sung at this position, or -1 before the first. */
/** How far past the last position tick playback may be assumed to have run. */
export const MAX_EXTRAPOLATION_MS = 1500

/**
 * The position now: stock reports it about once a second (a103), so while
 * playing the time since the last tick is added, at most MAX_EXTRAPOLATION_MS,
 * so a silent player does not run the lyrics ahead.
 */
export function livePosition(
  positionMs: number | null,
  tickAt: number | null,
  now: number,
  playing: boolean,
): number | null {
  if (positionMs === null) return null
  if (!playing || tickAt === null) return positionMs
  return positionMs + Math.min(Math.max(0, now - tickAt), MAX_EXTRAPOLATION_MS)
}

export function activeLine(lyrics: Lyrics, positionMs: number | null): number {
  if (!lyrics.synced || positionMs === null) return -1
  let found = -1
  lyrics.lines.forEach((line, index) => {
    if (line.timeMs !== null && line.timeMs <= positionMs) found = index
  })
  return found
}
