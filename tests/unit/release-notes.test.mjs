import { describe, expect, it } from 'vitest'
import { checkVersion, releaseNotes } from '../../scripts/release-notes.mjs'

const CHANGELOG = `# Changelog

Intro.

## [1.1.0] — unreleased

- Next.

## [1.0.0] — 2026-10-08

The first public release.

### Playing

- Play albums.

## [0.9.0] — 2026-09-01

- Older.
`

describe('release notes from the changelog', () => {
  it("takes the version's section without its heading", () => {
    expect(releaseNotes(CHANGELOG, '1.0.0')).toBe('The first public release.\n\n### Playing\n\n- Play albums.\n')
    expect(releaseNotes(CHANGELOG, '0.9.0')).toBe('- Older.\n')
  })

  it('refuses a version without a dated section', () => {
    expect(() => releaseNotes(CHANGELOG, '1.1.0')).toThrow('no release date')
    expect(() => releaseNotes(CHANGELOG, '2.0.0')).toThrow('no section for 2.0.0')
  })

  it("refuses a tag that is not package.json's version", () => {
    expect(() => checkVersion('v1.0.0', '1.0.0')).not.toThrow()
    expect(() => checkVersion('v1.0.1', '1.0.0')).toThrow('not package.json')
    expect(() => checkVersion('1.0.0', '1.0.0')).toThrow()
  })
})
