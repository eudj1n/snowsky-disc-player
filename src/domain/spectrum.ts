/**
 * The visualizer's numbers (owner, 2026-09-29): an analyser's frequency bins
 * gathered into bands spaced like hearing (logarithmically), their levels with
 * a gentle curve so quiet music still moves, peak marks that fall back
 * slowly, and the geometry of the disc: spokes mirrored around the ring and
 * grooves lit by groups of bands. Plain arithmetic: the drawing lives in the
 * visualizer component.
 */

/** A band: the analyser bins [from, to) it gathers. */
export interface Band {
  from: number
  to: number
}

/**
 * `count` bands from `minHz` to `maxHz` on a logarithmic scale over an
 * analyser of `binCount` bins at `sampleRate`; each band holds at least one
 * bin, and a band that would repeat the previous one moves on to the next bin.
 */
export function logBands(binCount: number, sampleRate: number, count: number, minHz = 40, maxHz = 16000): Band[] {
  const nyquist = sampleRate / 2
  const top = Math.min(maxHz, nyquist)
  const binOf = (hz: number) => Math.min(binCount, Math.max(0, Math.round((hz / nyquist) * binCount)))
  const bands: Band[] = []
  let previous = binOf(minHz)
  for (let i = 1; i <= count; i++) {
    const hz = minHz * Math.pow(top / minHz, i / count)
    const from = Math.min(previous, binCount - 1)
    const to = Math.min(binCount, Math.max(binOf(hz), from + 1))
    bands.push({ from, to })
    previous = to
  }
  return bands
}

/** Each band's level from 0 to 1: its loudest bin, eased so quiet passages still show. */
export function bandLevels(bins: ArrayLike<number>, bands: readonly Band[], curve = 1.6): number[] {
  return bands.map(({ from, to }) => {
    let loudest = 0
    for (let bin = from; bin < to && bin < bins.length; bin++) loudest = Math.max(loudest, bins[bin] ?? 0)
    return Math.pow(loudest / 255, curve)
  })
}

/**
 * Peak marks: a level above its mark lifts it at once; otherwise the mark
 * falls by `fallPerSecond` over `elapsedMs`, never below the level.
 */
export function fallingPeaks(
  peaks: readonly number[],
  levels: readonly number[],
  elapsedMs: number,
  fallPerSecond = 0.9,
): number[] {
  const fall = (fallPerSecond * Math.max(0, elapsedMs)) / 1000
  return levels.map((level, i) => Math.max(level, (peaks[i] ?? 0) - fall))
}

/** The loudest band now, for a pulse and for tests. */
export const loudest = (levels: readonly number[]): number => levels.reduce((max, level) => Math.max(max, level), 0)

/**
 * The disc's spokes (after Visicality's symmetrical circle, ideas only): each
 * level twice, mirrored left and right, the lowest band at the bottom and the
 * highest meeting at the top. Angles are in radians as a canvas measures them
 * (clockwise from the right, so the bottom is π/2).
 */
export function mirroredSpokes(levels: readonly number[]): { angle: number; level: number }[] {
  const n = levels.length
  return levels.flatMap((level, k) => {
    const turn = (Math.PI * (k + 0.5)) / n
    return [
      { angle: Math.PI / 2 + turn, level },
      { angle: Math.PI / 2 - turn, level },
    ]
  })
}

/** Levels averaged into `groups` runs of neighbouring bands (the disc's grooves, lowest first). */
export function groupLevels(levels: readonly number[], groups: number): number[] {
  if (!levels.length || groups < 1) return []
  return Array.from({ length: groups }, (_, g) => {
    const from = Math.floor((g * levels.length) / groups)
    const to = Math.max(from + 1, Math.floor(((g + 1) * levels.length) / groups))
    const run = levels.slice(from, to)
    return run.reduce((sum, level) => sum + level, 0) / run.length
  })
}

/** How many dots a spoke of the dotted ring shows for a level: at least one faint dot, at most `max`. */
export const dotCount = (level: number, max: number): number => Math.max(1, Math.min(max, Math.round(level * max)))

/**
 * The hue of a spoke around the dotted ring (after the owner's VJ example,
 * 2026-09-29): a sweep of `span` degrees around the circle from the cover's
 * own hue, mirrored like the spokes and drifting slowly with time.
 */
export function spokeHue(base: number, index: number, count: number, seconds: number, span = 220): number {
  const half = Math.max(1, Math.floor(count / 2))
  const along = (index % half) / half
  return (((base + along * span + seconds * 6) % 360) + 360) % 360
}

/** The hue (0–360) of an RGB colour; grey gives the fallback. */
export function hueOf(red: number, green: number, blue: number, fallback = 12): number {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  if (delta < 8) return fallback
  const hue =
    max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  return (hue * 60 + 360) % 360
}

/** A waveform (bytes around 128) cut to `points` values from -1 to 1, for the ring along the disc's edge. */
export function waveRing(bytes: ArrayLike<number>, points: number): number[] {
  if (!bytes.length) return new Array<number>(points).fill(0)
  return Array.from(
    { length: points },
    (_, index) => ((bytes[Math.floor((index * bytes.length) / points)] ?? 128) - 128) / 128,
  )
}
