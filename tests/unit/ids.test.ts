import { describe, expect, it } from 'vitest'
import { normalizeToken } from '../../src/domain/pairing'
import { REQUEST_ID, requestId } from '../../src/gateway/ids'

describe('request IDs and pairing tokens', () => {
  it('generates fresh IDs the gateway admits', () => {
    const ids = new Set(Array.from({ length: 200 }, () => requestId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(REQUEST_ID)
  })

  it('accepts only card-shaped tokens', () => {
    expect(normalizeToken('  ' + 'a'.repeat(43) + '\n')).toBe('a'.repeat(43))
    expect(normalizeToken('short')).toBeNull()
    expect(normalizeToken('a'.repeat(31))).toBeNull()
    expect(normalizeToken('a'.repeat(65))).toBeNull()
    expect(normalizeToken('a'.repeat(40) + '/+=')).toBeNull()
  })
})
