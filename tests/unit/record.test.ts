import { describe, expect, it } from 'vitest'
import { decodeRecord, encodeRecord } from '../../src/gateway/record'

describe('record framing', () => {
  it('encodes the tag, the total UTF-8 length and the payload', () => {
    expect(encodeRecord('0599', '0000')).toBe('0599000C0000')
    expect(encodeRecord('0412', '0000Ё')).toBe('0412000E0000Ё')
    expect(encodeRecord('0202')).toBe('02020008')
  })

  it('rejects invalid tags and oversized records', () => {
    expect(() => encodeRecord('05', '')).toThrow(RangeError)
    expect(() => encodeRecord('0599', 'x'.repeat(65535 - 7))).toThrow(RangeError)
    expect(encodeRecord('0599', 'x'.repeat(65535 - 8))).toHaveLength(65535)
  })

  it('decodes and checks the declared length in bytes', () => {
    expect(decodeRecord('A599000C0306')).toEqual({ tag: 'a599', payload: '0306' })
    expect(decodeRecord('a202000A{}')).toEqual({ tag: 'a202', payload: '{}' })
    expect(() => decodeRecord('a202000B{}')).toThrow(SyntaxError)
    expect(() => decodeRecord('zz02000A{}')).toThrow(SyntaxError)
  })
})
