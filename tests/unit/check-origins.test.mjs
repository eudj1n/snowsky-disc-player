import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkOrigins, MAX_ORIGINS, ORIGINS, policyOf, validOrigin } from '../../scripts/check-origins.mjs'

const entry = (origin, directives = ['connect-src']) => ({ origin, directives, purpose: 'x' })
const file = (origins, extra = {}) => JSON.stringify({ schema_version: 1, api: 1, origins, ...extra })

describe("the app's origins.json", () => {
  it('is the one the release packs, within the gateway’s rules, with the policy the gateway builds', () => {
    const { errors, policy, count } = checkOrigins(readFileSync(ORIGINS, 'utf8'))
    expect(errors).toEqual([])
    expect(count).toBeLessThanOrEqual(MAX_ORIGINS)
    expect(policy).toMatch(
      /^default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https:\/\/musicbrainz\.org /,
    )
    expect(policy).toContain('https://api.listenbrainz.org https://labs.api.listenbrainz.org')
    expect(policy).toMatch(/; img-src 'self' https:\/\/coverartarchive\.org .*; frame-ancestors 'none'$/)
  })

  it('checks origins character by character, as the gateway does', () => {
    for (const good of ['https://musicbrainz.org', 'https://*.archive.org', 'https://a-b.example.org:8443'])
      expect(validOrigin(good), good).toBe(true)
    for (const bad of [
      'http://musicbrainz.org',
      'https://MusicBrainz.org',
      'https://*.org',
      'https://org',
      'https://a.org/',
      'https://a.org/path',
      'https://a.org:0',
      'https://a.org:70000',
      'https://a.org; script-src *',
      "https://a.org 'unsafe-inline'",
      'https://-a.org',
      'https://a-.org',
      'https://a..org',
      'https://*',
      'https://a.org\r\nX: y',
      `https://${'a'.repeat(64)}.org`,
      'https://a.*.org',
      'data:',
      'blob:',
    ])
      expect(validOrigin(bad), bad).toBe(false)
  })

  it('refuses what the gateway would reject whole, naming the entry', () => {
    const errorsOf = (text) => checkOrigins(text).errors
    expect(errorsOf('nope')).toEqual(['origins.json is not JSON'])
    expect(errorsOf(file({ aa: entry('https://a.org; script-src *') }))[0]).toContain('origin aa: not an https origin')
    expect(errorsOf(file({ aa: entry('https://a.org', ['script-src']) }))[0]).toContain('directives are connect-src')
    expect(errorsOf(file({ aa: entry('https://a.org', []) }))[0]).toContain('directives')
    expect(errorsOf(file({ aa: entry('https://a.org'), bb: entry('https://a.org') }))[0]).toContain(
      'origin bb: duplicate',
    )
    expect(errorsOf(file({ aa: { ...entry('https://a.org'), note: 'x' } }))[0]).toContain('origin aa: the fields')
    expect(errorsOf(file({ a: entry('https://a.org') }))[0]).toContain('origin a: invalid name')
    expect(errorsOf(file({ aa: entry('https://a.org') }, { extra: 1 }))[0]).toContain('unexpected field extra')
    expect(errorsOf(JSON.stringify({ schema_version: 2, api: 1, origins: {} }))[0]).toContain('schema_version 1')
    const many = Object.fromEntries(
      Array.from({ length: MAX_ORIGINS + 1 }, (_, n) => [`e${String(n)}`, entry(`https://e${String(n)}.org`)]),
    )
    expect(errorsOf(file(many))[0]).toContain(`At most ${String(MAX_ORIGINS)}`)
  })

  it('keeps provenance fields an image’s file carried, and builds the policy in file order', () => {
    const text = file(
      {
        aa: entry('https://a.org'),
        bb: entry('https://b.org', ['connect-src', 'img-src']),
        cc: entry('https://c.org', ['img-src']),
      },
      { version: '2.57', description: 'x', profile_sha256: 'y', origins_sha256: 'z' },
    )
    expect(checkOrigins(text)).toEqual({
      errors: [],
      count: 3,
      policy:
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://a.org https://b.org; img-src 'self' https://b.org https://c.org; frame-ancestors 'none'",
    })
    expect(policyOf({})).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    )
  })
})
