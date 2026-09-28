import { describe, expect, it } from 'vitest'
import { normalizeSerial } from '../../src/domain/pairing'
import { REQUEST_ID, requestId } from '../../src/gateway/ids'

describe('request IDs and the pairing serial number', () => {
  it('generates fresh IDs the gateway admits', () => {
    const ids = new Set(Array.from({ length: 200 }, () => requestId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(REQUEST_ID)
  })

  it('accepts the serial number of the player, spaces dropped', () => {
    expect(normalizeSerial(' 0000 0000 0000 00\n')).toBe('00000000000000')
    expect(normalizeSerial('FA12B3C4D5')).toBe('FA12B3C4D5')
    expect(normalizeSerial('short')).toBeNull()
    expect(normalizeSerial('a'.repeat(33))).toBeNull()
    expect(normalizeSerial('a'.repeat(43))).toBeNull()
    expect(normalizeSerial('ABC-123-456')).toBeNull()
  })
})
