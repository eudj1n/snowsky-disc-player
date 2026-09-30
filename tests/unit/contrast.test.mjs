import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Text colours of every palette against their grounds, read from the
 * stylesheets themselves (docs/typography.md): 4.5:1 for small text, as WCAG
 * asks, including secondary text on a selected row.
 */
// Plain files: Vitest hands CSS imports to its CSS pipeline, which yields nothing here.
const css = ['src/styles/main.css', 'src/styles/palettes.css'].map((file) => readFileSync(file, 'utf8')).join('\n')

/** The hex tokens of one top-level block, found by its exact selector. */
function block(selector) {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block ${selector}`)
  const body = css.slice(start, css.indexOf('\n}', start))
  const tokens = {}
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/g))
    if (name && value) tokens[name] = value
  return tokens
}

function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const light = block(':root')
const dark = { ...light, ...block(":root[data-theme='dark']") }
const palettes = [
  ['sage', light],
  ...['paper', 'mist', 'white'].map((name) => [
    name,
    { ...light, ...block(`:root[data-theme='light'][data-light-palette='${name}']`) },
  ]),
  ['charcoal', dark],
  ...['olive', 'graphite', 'espresso'].map((name) => [
    name,
    { ...dark, ...block(`:root[data-theme='dark'][data-dark-palette='${name}']`) },
  ]),
]

describe('text contrast', () => {
  it.each(palettes)('%s: text, secondary and notices keep 4.5:1 on their grounds', (_name, tokens) => {
    const on = (text, ground) => ratio(tokens[text] ?? '', tokens[ground] ?? '')
    expect(on('ink', 'paper')).toBeGreaterThanOrEqual(7)
    for (const ground of ['paper', 'raised', 'soft', 'selected']) {
      expect(on('muted', ground), `muted on ${ground}`).toBeGreaterThanOrEqual(4.5)
      expect(on('secondary', ground), `secondary on ${ground}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const ground of ['paper', 'soft'])
      expect(on('notice', ground), `notice on ${ground}`).toBeGreaterThanOrEqual(4.5)
    expect(on('banner-ink', 'banner')).toBeGreaterThanOrEqual(4.5)
  })
})
