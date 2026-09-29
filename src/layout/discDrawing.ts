/**
 * Draws one frame of the visualizer's disc (owner, 2026-09-29), the project's
 * ringed-disc mark brought to life: the cover as a disc with a centre hole,
 * turning slowly, its grooves lit by groups of bands; around it the mark's
 * white ring, pulsing with the bass; from the ring, the spectrum in mirrored
 * spokes with peak marks. The caller owns the canvas size, the clock and the
 * analyser; this module only paints.
 */
import { mirroredSpokes } from '../domain/spectrum'

export interface DiscFrame {
  /** Canvas size in device pixels. */
  width: number
  height: number
  /** Band levels and their peak marks, 0 to 1, lowest band first. */
  levels: readonly number[]
  peaks: readonly number[]
  /** Groove levels, 0 to 1, innermost first. */
  grooves: readonly number[]
  /** The bass level (0 to 1) the ring pulses with; 0 keeps it still. */
  pulse: number
  /** The disc's turn in radians. */
  rotation: number
  cover: CanvasImageSource | null
  coverSize: { width: number; height: number } | null
  accent: string
}

/**
 * Where the disc sits on a canvas: a little above the middle, so the longest
 * spokes at the bottom stay clear of the controls, with its radius, the
 * ring's and how far the spokes may reach beyond the ring.
 */
export function discGeometry(
  width: number,
  height: number,
): { cx: number; cy: number; radius: number; ring: number; reach: number } {
  const base = Math.min(width, height)
  const radius = base * 0.19
  return { cx: width / 2, cy: height * 0.46, radius, ring: radius * 1.12, reach: base * 0.15 }
}

export function drawDisc(context: CanvasRenderingContext2D, frame: DiscFrame): void {
  const { width, height } = frame
  const { cx, cy, radius, ring: still, reach } = discGeometry(width, height)
  const ring = still * (1 + 0.05 * frame.pulse)
  const ringWidth = Math.max(2, radius * 0.05)
  context.clearRect(0, 0, width, height)

  // Spokes: one path for a soft glow, one for the lines, then the peak marks.
  const spokes = mirroredSpokes(frame.levels)
  const start = ring + ringWidth * 1.6
  const spokeWidth = Math.max(2, ((2 * Math.PI * start) / Math.max(1, spokes.length)) * 0.46)
  context.beginPath()
  for (const { angle, level } of spokes) {
    const length = Math.max(spokeWidth * 0.5, reach * level)
    context.moveTo(cx + start * Math.cos(angle), cy + start * Math.sin(angle))
    context.lineTo(cx + (start + length) * Math.cos(angle), cy + (start + length) * Math.sin(angle))
  }
  context.lineCap = 'round'
  context.strokeStyle = frame.accent
  context.globalAlpha = 0.16
  context.lineWidth = spokeWidth * 2.6
  context.stroke()
  context.globalAlpha = 0.92
  context.lineWidth = spokeWidth
  context.stroke()
  context.globalAlpha = 0.85
  context.fillStyle = '#fff'
  context.beginPath()
  mirroredSpokes(frame.peaks).forEach(({ angle, level }) => {
    if (level < 0.02) return
    const at = start + reach * level + spokeWidth * 1.4
    const x = cx + at * Math.cos(angle)
    const y = cy + at * Math.sin(angle)
    context.moveTo(x + spokeWidth * 0.42, y)
    context.arc(x, y, spokeWidth * 0.42, 0, 2 * Math.PI)
  })
  context.fill()
  context.globalAlpha = 1

  // The disc: the cover (or the accent) clipped to a circle, turning.
  context.save()
  context.beginPath()
  context.arc(cx, cy, radius, 0, 2 * Math.PI)
  context.clip()
  context.translate(cx, cy)
  context.rotate(frame.rotation)
  if (frame.cover && frame.coverSize) {
    const scale = (2 * radius) / Math.min(frame.coverSize.width, frame.coverSize.height)
    const w = frame.coverSize.width * scale
    const h = frame.coverSize.height * scale
    context.drawImage(frame.cover, -w / 2, -h / 2, w, h)
  } else {
    const fill = context.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius)
    fill.addColorStop(0, frame.accent)
    fill.addColorStop(1, '#2a1712')
    context.fillStyle = fill
    context.fillRect(-radius, -radius, 2 * radius, 2 * radius)
  }
  // A sheen across the disc shows it turn, cover or not.
  const sheen = context.createLinearGradient(-radius, -radius, radius, radius)
  sheen.addColorStop(0, 'rgb(255 255 255 / 0)')
  sheen.addColorStop(0.5, 'rgb(255 255 255 / 0.1)')
  sheen.addColorStop(1, 'rgb(255 255 255 / 0)')
  context.fillStyle = sheen
  context.fillRect(-radius, -radius, 2 * radius, 2 * radius)
  context.restore()

  // Grooves between the hole and the edge.
  const hole = radius * 0.17
  const inner = hole * 1.9
  const outer = radius * 0.95
  context.strokeStyle = '#fff'
  context.lineWidth = Math.max(1, radius * 0.008)
  frame.grooves.forEach((level, g) => {
    const r = inner + ((outer - inner) * (g + 0.5)) / frame.grooves.length
    context.globalAlpha = 0.05 + 0.45 * level
    context.beginPath()
    context.arc(cx, cy, r, 0, 2 * Math.PI)
    context.stroke()
  })
  context.globalAlpha = 1

  // The mark: its outer ring around the disc and its inner ring as the hole.
  context.lineWidth = ringWidth
  context.beginPath()
  context.arc(cx, cy, ring, 0, 2 * Math.PI)
  context.stroke()
  context.fillStyle = '#0e100f'
  context.beginPath()
  context.arc(cx, cy, hole, 0, 2 * Math.PI)
  context.fill()
  context.lineWidth = Math.max(2, radius * 0.045)
  context.stroke()
}
