/**
 * One frame of the visualizer (owner, 2026-09-29: like the SNOWSKY DISC
 * itself, a vinyl record whose label is the cover, whole, without a spindle
 * hole, as the player's own label-screen; combined with a VJ-style
 * ring of glowing dots). The record: black, its grooves catching a still
 * light as the label turns, groups of grooves lit by the music, the whole
 * disc breathing with the bass. Around it a thin waveform hugs the edge and
 * mirrored spokes of dots rise with each band, their colours sweeping round
 * from the cover's own hue. The caller owns the canvas, the clock and the
 * analyser; this module only paints.
 */
import { dotCount, mirroredSpokes, spokeHue } from '../domain/spectrum'

export interface VinylFrame {
  /** Canvas size in device pixels. */
  width: number
  height: number
  /** Band levels and their peak marks, 0 to 1, lowest band first. */
  levels: readonly number[]
  peaks: readonly number[]
  /** Groove levels, 0 to 1, innermost first. */
  grooves: readonly number[]
  /** The waveform, -1 to 1, around the edge. */
  wave: readonly number[]
  /** The bass level (0 to 1) the disc breathes with; 0 keeps it still. */
  pulse: number
  /** The label's turn in radians. */
  rotation: number
  /** Seconds since the visualizer opened, for the colours' drift. */
  seconds: number
  cover: CanvasImageSource | null
  coverSize: { width: number; height: number } | null
  /** The cover's hue (0–360), where the colours start. */
  hue: number
  accent: string
}

/** Most dots a spoke rises to. */
export const MAX_DOTS = 9
const HUE_BUCKETS = 24

/** Where the record sits and how far the dots may rise, for a canvas. */
export function vinylGeometry(width: number, height: number) {
  const base = Math.min(width, height)
  const disc = base * 0.21
  const ringStart = disc * 1.14
  const gap = base * 0.016
  return { cx: width / 2, cy: height * 0.46, disc, label: disc * 0.42, ringStart, gap, reach: gap * MAX_DOTS }
}

function drawRecord(context: CanvasRenderingContext2D, frame: VinylFrame, disc: number, label: number): void {
  // The black disc with a faint rim.
  const body = context.createRadialGradient(0, 0, label, 0, 0, disc)
  body.addColorStop(0, '#18181a')
  body.addColorStop(1, '#070708')
  context.fillStyle = body
  context.beginPath()
  context.arc(0, 0, disc, 0, 2 * Math.PI)
  context.fill()
  // Grooves: fine rings, some lit by groups of bands (innermost the lowest).
  const inner = label * 1.1
  const outer = disc * 0.97
  const count = 46
  context.lineWidth = Math.max(1, disc * 0.004)
  for (let ring = 0; ring < count; ring++) {
    const r = inner + ((outer - inner) * (ring + 0.5)) / count
    const lit = frame.grooves[Math.floor((ring * frame.grooves.length) / count)] ?? 0
    context.strokeStyle = `rgb(255 255 255 / ${(0.035 + (ring % 3 === 0 ? 0.03 : 0) + 0.16 * lit).toFixed(3)})`
    context.beginPath()
    context.arc(0, 0, r, 0, 2 * Math.PI)
    context.stroke()
  }
  // A still light across the grooves (two bands, as on the player's photo), a little brighter with the music.
  if ('createConicGradient' in context) {
    const shine = 0.17 + 0.1 * frame.pulse
    const sheen = context.createConicGradient(-Math.PI / 4, 0, 0)
    for (const [at, alpha] of [
      [0, 0],
      [0.06, shine],
      [0.12, 0],
      [0.5, 0],
      [0.56, shine * 0.7],
      [0.62, 0],
      [1, 0],
    ] as const)
      sheen.addColorStop(at, `rgb(255 255 255 / ${alpha.toFixed(3)})`)
    context.fillStyle = sheen
    context.beginPath()
    context.arc(0, 0, outer, 0, 2 * Math.PI)
    context.arc(0, 0, inner, 0, 2 * Math.PI, true)
    context.fill()
  }
  context.strokeStyle = 'rgb(255 255 255 / 0.14)'
  context.lineWidth = Math.max(1, disc * 0.006)
  context.beginPath()
  context.arc(0, 0, disc, 0, 2 * Math.PI)
  context.stroke()
  // The label: the cover (or the accent), turning.
  context.save()
  context.beginPath()
  context.arc(0, 0, label, 0, 2 * Math.PI)
  context.clip()
  context.rotate(frame.rotation)
  if (frame.cover && frame.coverSize) {
    const scale = (2 * label) / Math.min(frame.coverSize.width, frame.coverSize.height)
    const w = frame.coverSize.width * scale
    const h = frame.coverSize.height * scale
    context.drawImage(frame.cover, -w / 2, -h / 2, w, h)
  } else {
    context.fillStyle = frame.accent
    context.fillRect(-label, -label, 2 * label, 2 * label)
  }
  context.restore()
  context.strokeStyle = 'rgb(0 0 0 / 0.55)'
  context.lineWidth = Math.max(1, label * 0.03)
  context.beginPath()
  context.arc(0, 0, label, 0, 2 * Math.PI)
  context.stroke()
}

export function drawVinyl(context: CanvasRenderingContext2D, frame: VinylFrame): void {
  const { width, height } = frame
  const { cx, cy, disc, label, ringStart, gap } = vinylGeometry(width, height)
  context.clearRect(0, 0, width, height)
  const scale = 1 + 0.03 * frame.pulse

  // Dotted spokes, glowing: dots grouped by colour, each group one path per pass.
  const spokes = mirroredSpokes(frame.levels)
  const peaks = mirroredSpokes(frame.peaks)
  const dot = Math.max(1.4, gap * 0.26)
  const buckets = new Map<number, { x: number; y: number; size: number }[]>()
  spokes.forEach(({ angle, level }, index) => {
    const bucket =
      Math.round((spokeHue(frame.hue, index, spokes.length, frame.seconds) / 360) * HUE_BUCKETS) % HUE_BUCKETS
    const list = buckets.get(bucket) ?? []
    const dots = dotCount(level, MAX_DOTS)
    for (let k = 0; k < dots; k++) {
      const r = ringStart * scale + k * gap
      list.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), size: dot * (1 - k * 0.04) })
    }
    const peak = peaks[index]?.level ?? 0
    if (peak > 0.05) {
      const r = ringStart * scale + dotCount(peak, MAX_DOTS) * gap
      list.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), size: dot * 0.8 })
    }
    buckets.set(bucket, list)
  })
  context.save()
  context.globalCompositeOperation = 'lighter'
  for (const [bucket, dots] of buckets) {
    const hue = (bucket * 360) / HUE_BUCKETS
    for (const [radius, alpha, light] of [
      [2.6, 0.16, 58],
      [1, 0.95, 66],
    ] as const) {
      context.fillStyle = `hsl(${hue.toFixed(0)} 95% ${String(light)}% / ${String(alpha)})`
      context.beginPath()
      for (const { x, y, size } of dots) {
        context.moveTo(x + size * radius, y)
        context.arc(x, y, size * radius, 0, 2 * Math.PI)
      }
      context.fill()
    }
  }
  // The waveform along the disc's edge.
  if (frame.wave.length > 1) {
    context.strokeStyle = `hsl(${frame.hue.toFixed(0)} 90% 70% / 0.55)`
    context.lineWidth = Math.max(1, disc * 0.008)
    context.beginPath()
    frame.wave.forEach((value, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / frame.wave.length
      const r = disc * scale * (1.045 + 0.045 * value)
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.closePath()
    context.stroke()
  }
  context.restore()

  context.save()
  context.translate(cx, cy)
  context.scale(scale, scale)
  drawRecord(context, frame, disc, label)
  context.restore()
}
