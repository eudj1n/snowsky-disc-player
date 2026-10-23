import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/stores/enrichment', () => ({ coverFor: () => null }))
vi.mock('../../src/stores/output', () => ({ nowPlaying: { value: { track: null } } }))
const { faviconFor } = await import('../../src/layout/favicon')

describe("the tab's icon", () => {
  it("is the track's cover by the media route once seen, else the page's own", () => {
    const own = { href: 'http://127.0.0.1/favicon.svg', type: 'image/svg+xml' }
    expect(faviconFor({ path: '/tmp/sdcard/A/01.flac' }, { type: 'image/jpeg' }, own)).toEqual({
      href: expect.stringMatching(/\/api\/media\/cover\/tmp\/sdcard\/A\/01\.flac$/) as string,
      type: 'image/jpeg',
    })
    expect(faviconFor({ path: '/tmp/sdcard/A/01.flac' }, null, own)).toBe(own)
    expect(faviconFor(null, { type: 'image/png' }, own)).toBe(own)
  })
})
