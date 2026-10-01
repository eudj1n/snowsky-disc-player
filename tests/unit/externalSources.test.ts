import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Fake {
  records: { key: unknown[]; value: Record<string, unknown>; updated: number }[] | null
  puts: Record<string, unknown>[]
  outcome: string
  token: string | null
  toasts: string[]
}
const store = vi.hoisted((): Fake => ({
  records: null,
  puts: [],
  outcome: 'confirmed',
  token: '00000000000000',
  toasts: [],
}))
vi.mock('../../src/stores/connection', () => ({ connection: { store: true }, http: {} }))
vi.mock('../../src/stores/pairing', () => ({ pairingToken: () => store.token }))
vi.mock('../../src/stores/ui', () => ({ toast: (key: string) => store.toasts.push(key) }))
vi.mock('../../src/gateway/store', () => ({
  readCollection: () => Promise.resolve(store.records),
  putRecord: (_http: unknown, _collection: string, value: Record<string, unknown>) => {
    store.puts.push(value)
    if (store.outcome === 'confirmed') {
      const others = (store.records ?? []).filter((record) => record.value.source !== value.source)
      store.records = [...others, { key: [value.source], value, updated: 1 }]
    }
    return Promise.resolve(store.outcome)
  },
}))

const { chooseSource, externalSources, loadExternalSources, missingNeeds, sourceAllowed, sourceAutomatic } =
  await import('../../src/stores/externalSources')

const record = (value: Record<string, unknown>) => ({ key: [value.source], value: { at: 1, ...value }, updated: 1 })

describe('external sources', () => {
  beforeEach(async () => {
    store.records = []
    store.puts = []
    store.outcome = 'confirmed'
    store.token = '00000000000000'
    store.toasts = []
    await loadExternalSources()
  })

  it('keeps every source off until the owner allows it, and ignores sources it does not know', async () => {
    expect(externalSources.available).toBe(true)
    expect(sourceAllowed('lrclib')).toBe(false)
    store.records = [
      record({ source: 'lrclib', allowed: true, auto: true }),
      record({ source: 'wikimedia', auto: true }),
      record({ source: 'elsewhere', allowed: true }),
    ]
    await loadExternalSources()
    expect(sourceAutomatic('lrclib')).toBe(true)
    // Automatic means nothing while the source is not allowed.
    expect([sourceAllowed('wikimedia'), sourceAutomatic('wikimedia')]).toEqual([false, false])
    expect(Object.keys(externalSources.choices)).toEqual(['lrclib', 'wikimedia'])
  })

  it('leaves every source off where the card release has no collection for the choice', async () => {
    store.records = null
    await loadExternalSources()
    expect(externalSources.available).toBe(false)
    expect(sourceAllowed('coverartarchive')).toBe(false)
  })

  it('writes the choice with the serial number; stopping a source stops its automatic use', async () => {
    await chooseSource('lrclib', { auto: true })
    expect(store.puts.at(-1)).toMatchObject({ source: 'lrclib', allowed: false, auto: false })
    await chooseSource('lrclib', { allowed: true })
    await chooseSource('lrclib', { auto: true })
    expect(sourceAutomatic('lrclib')).toBe(true)
    await chooseSource('lrclib', { allowed: false })
    expect(store.puts.at(-1)).toMatchObject({ source: 'lrclib', allowed: false, auto: false })
    expect(sourceAllowed('lrclib')).toBe(false)
  })

  it('keeps the sources found by MusicBrainz ids off while MusicBrainz is not allowed', async () => {
    store.records = [record({ source: 'coverartarchive', allowed: true, auto: true })]
    await loadExternalSources()
    expect([sourceAllowed('coverartarchive'), sourceAutomatic('coverartarchive')]).toEqual([false, false])
    expect(missingNeeds('coverartarchive')).toEqual(['musicbrainz'])
    await chooseSource('musicbrainz', { allowed: true, auto: true })
    // MusicBrainz is asked only through other sources: never automatically by itself.
    expect(store.puts.at(-1)).toMatchObject({ source: 'musicbrainz', allowed: true, auto: false })
    expect([sourceAllowed('coverartarchive'), sourceAutomatic('coverartarchive')]).toEqual([true, true])
    expect(sourceAllowed('lrclib')).toBe(false)
  })

  it('changes nothing without pairing or when the player does not confirm', async () => {
    store.token = null
    await chooseSource('lrclib', { allowed: true })
    expect([store.puts.length, store.toasts]).toEqual([0, ['pair_to_control']])
    store.token = '00000000000000'
    store.outcome = 'uncertain'
    await chooseSource('lrclib', { allowed: true })
    expect(sourceAllowed('lrclib')).toBe(false)
    expect(store.toasts.at(-1)).toBe('result_unconfirmed_the_command_was_not_retried')
  })
})
