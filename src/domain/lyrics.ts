/**
 * Lyrics as LRC or plain text. Timestamps `[mm:ss.xx]` (several per line are
 * allowed) make the lyrics synced; `[offset:±ms]` shifts them; metadata tags
 * (`[ar:…]`, `[ti:…]`) are dropped. Word timings of enhanced LRC
 * (`<mm:ss.xx>` before a word or syllable, a last one marking the end) are
 * kept per line for the karaoke sweep; the text reads without them.
 */
export interface LyricWord {
  timeMs: number
  /** The word or syllable with the spacing that follows it, as written. */
  text: string
}

export interface LyricLine {
  timeMs: number | null
  text: string
  /** Word timings when the line has them (enhanced LRC). */
  words?: LyricWord[]
  /** When the last word ends, if a closing word stamp says so. */
  endMs?: number
}

export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
}

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const WORD_STAMP = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g

function stampMs(minutes: string | undefined, seconds: string | undefined, fraction: string | undefined): number {
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + Number((fraction ?? '0').padEnd(3, '0').slice(0, 3))
}

/**
 * Words of one line body by their stamps: text before the first stamp starts
 * with the line; a stamp with nothing after it closes the last word.
 */
function wordTimings(body: string, lineMs: number): { words: LyricWord[]; endMs?: number } | null {
  const stamps = [...body.matchAll(WORD_STAMP)]
  if (!stamps.length) return null
  const words: LyricWord[] = []
  let start = lineMs
  let from = 0
  let endMs: number | undefined
  for (const stamp of stamps) {
    const text = body.slice(from, stamp.index)
    if (text.trim() || (text && words.length)) words.push({ timeMs: start, text })
    start = stampMs(stamp[1], stamp[2], stamp[3])
    from = stamp.index + stamp[0].length
  }
  const tail = body.slice(from)
  if (tail.trim()) words.push({ timeMs: start, text: tail })
  else endMs = start
  // Spacing belongs between words, not around the line.
  const first = words[0]
  const last = words.at(-1)
  if (first) first.text = first.text.trimStart()
  if (last) last.text = last.text.trimEnd()
  const kept = words.filter((word) => word.text)
  return kept.length ? { words: kept, ...(endMs !== undefined ? { endMs } : {}) } : null
}
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
    const body = line.replace(STAMP, '')
    const words = body.replace(WORD_STAMP, '').trim()
    if (stamps.length) {
      const firstMs = stampMs(stamps[0]?.[1], stamps[0]?.[2], stamps[0]?.[3])
      const timing = wordTimings(body, firstMs)
      for (const stamp of stamps) {
        const ms = stampMs(stamp[1], stamp[2], stamp[3])
        const entry: LyricLine = { timeMs: Math.max(0, ms - offset), text: words }
        if (timing) {
          // A repeated line (several line stamps) sings its words the same way each time.
          const shift = ms - firstMs - offset
          entry.words = timing.words.map((word) => ({ timeMs: Math.max(0, word.timeMs + shift), text: word.text }))
          if (timing.endMs !== undefined) entry.endMs = Math.max(0, timing.endMs + shift)
        }
        timed.push(entry)
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

/** A line without word timings sweeps until the next line, at most this long. */
const LINE_SWEEP_MAX_MS = 10_000
/** A last word with no closing stamp is taken to last this long at most. */
const LAST_WORD_MS = 1500

/**
 * How much of a line has been sung (0..1): linearly from its stamp to the next
 * line's, over at most `capMs` (a pause is measured to the next line in full).
 */
export function lineProgress(
  line: LyricLine,
  nextMs: number | null,
  positionMs: number | null,
  capMs = LINE_SWEEP_MAX_MS,
): number {
  if (line.timeMs === null || positionMs === null) return 0
  const end = Math.min(nextMs ?? line.timeMs + LINE_SWEEP_MAX_MS, line.timeMs + capMs)
  if (end <= line.timeMs) return positionMs >= line.timeMs ? 1 : 0
  return Math.min(Math.max((positionMs - line.timeMs) / (end - line.timeMs), 0), 1)
}

/**
 * How much of each word has been sung (0..1): a word runs from its stamp to
 * the next word's, the last one to the closing stamp, else to the next line
 * but no longer than LAST_WORD_MS.
 */
export function wordProgress(line: LyricLine, nextMs: number | null, positionMs: number | null): number[] {
  const words = line.words ?? []
  return words.map((word, index) => {
    if (positionMs === null) return 0
    const following = words[index + 1]
    const end =
      following?.timeMs ?? line.endMs ?? Math.min(nextMs ?? word.timeMs + LAST_WORD_MS, word.timeMs + LAST_WORD_MS)
    if (end <= word.timeMs) return positionMs >= word.timeMs ? 1 : 0
    return Math.min(Math.max((positionMs - word.timeMs) / (end - word.timeMs), 0), 1)
  })
}

/** A line with nothing to sing: empty, or only a note or dots marking an instrumental part. */
export const silentLine = (line: Pick<LyricLine, 'text'>): boolean => /^[\s♪♫♬♩.·•…\-–—*]*$/u.test(line.text)

/** How far each of three dots is filled (0..1) when a pause is `progress` done. */
export function dotsProgress(progress: number): [number, number, number] {
  const dot = (index: number) => Math.min(Math.max(progress * 3 - index, 0), 1)
  return [dot(0), dot(1), dot(2)]
}

/** The lines karaoke shows around the current one: `before` sung, the current and `after` coming. */
export function karaokeRange(
  total: number,
  active: number,
  before = 2,
  after = 4,
): { from: number; to: number; center: number } {
  const center = Math.max(active, 0)
  return { from: Math.max(center - before, 0), to: Math.min(center + after, total - 1), center }
}
