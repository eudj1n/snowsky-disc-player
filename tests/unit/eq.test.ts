import { describe, expect, it } from 'vitest'
import { decodeMaster, encodeMaster, parsePeq, peqPayload, pyFloat, selectPreset, setBands } from '../../src/gateway/eq'
import type { GatewaySession } from '../../src/gateway/session'

describe('equalizer wire values', () => {
  it('encodes master gain as signed tenths of dB', () => {
    expect([-1, -6.1, 0, 12, -24].map(encodeMaster)).toEqual(['FFF6', 'FFC3', '0000', '0078', 'FF10'])
    expect(decodeMaster('FFC3')).toBe(-6.1)
    expect(() => encodeMaster(12.5)).toThrow(RangeError)
    expect(() => encodeMaster(0.05)).toThrow(RangeError)
  })

  it('writes bands as JSON with gain and Q strings like Python str(float)', () => {
    expect([-1, 0, -0, -3.5, 1.5].map(pyFloat)).toEqual(['-1.0', '0.0', '0.0', '-3.5', '1.5'])
    expect(peqPayload([{ position: 0, frequency: 1000, gain: -1, q: 1.5 }])).toBe(
      '0001[{"position":0,"frequency":1000,"filterType":0,"gain":"-1.0","qValue":"1.5"}]',
    )
    expect(() => peqPayload([{ position: 0, frequency: 0, gain: 0, q: 0.7 }])).toThrow(RangeError)
  })

  it('reads the binary a628 layout', () => {
    // One band, position 0: 0 dB, 32 Hz, Q 0.71, Peak.
    expect(parsePeq('0000' + '0000' + '0000' + '0020' + '0047' + '00')).toEqual([
      { position: 0, gain: 0, frequency: 32, q: 0.71 },
    ])
    expect(() => parsePeq('00000009')).toThrow(SyntaxError)
  })
})

/** A scripted session for the read/mutate pattern. */
function session(state: { preset: number; bands: string }) {
  const sent: string[] = []
  const fake = {
    open: true,
    read: (tag: string) => Promise.resolve(tag === '0639' ? state.preset.toString(16).padStart(4, '0') : state.bands),
    mutate: (tag: string, payload: string) => {
      sent.push(tag + payload)
      if (tag === '0690') state.preset = parseInt(payload, 16)
      return Promise.resolve({ status: 'sent' })
    },
  }
  return { sent, session: fake as unknown as GatewaySession }
}

const deps = (s: GatewaySession) => ({
  session: s,
  guard: () => undefined,
  attempted: () => undefined,
  sleep: () => Promise.resolve(),
})

describe('equalizer changes', () => {
  it('selects a preset once after a fresh check and confirms it by reading', async () => {
    const { sent, session: s } = session({ preset: 255, bands: '' })
    expect(await selectPreset(deps(s), 255, 160)).toBe('confirmed')
    expect(sent).toEqual(['069000A0'])
    expect(await selectPreset(deps(s), 255, 161)).toBe('stale')
    expect(await selectPreset(deps(s), 160, 240)).toBe('invalid')
    expect(sent).toHaveLength(1)
  })

  it('refuses band edits outside a user preset', async () => {
    const { sent, session: s } = session({ preset: 0, bands: '' })
    expect(await setBands(deps(s), 0, [], [{ position: 0, frequency: 32, gain: 1, q: 0.7 }])).toBe('invalid')
    expect(sent).toHaveLength(0)
  })
})
