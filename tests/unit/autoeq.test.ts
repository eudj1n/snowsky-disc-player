import { describe, expect, it } from 'vitest'
import { AUTOEQ_REVISION, fitsPlayer, foldName, matchHeadphones, type HeadphoneResult } from '../../src/domain/autoeq'
import {
  fetchCorrection,
  fetchRecommended,
  parseFixedBand,
  parseRecommended,
  resultUrl,
} from '../../src/gateway/autoeq'

/** An excerpt of results/README.md as AutoEq writes it: links with encoded spaces, UTF-8 and parentheses. */
const README = `# Recommended Results
This is a list of recommended results. Results for other measurements and target curves are available for many
headphones, these can be found in the
[full index](./INDEX.md).

- [1MORE Aero (ANC Off)](./HypetheSonics/GRAS%20RA0045%20in-ear/1MORE%20Aero%20(ANC%20Off))
- [Alpha & Delta D6](./crinacle/Bruel%20&%20Kjaer%204620%20in-ear/Alpha%20&%20Delta%20D6)
- [AüR Audio Aure](./Kazi/in-ear/A%C3%BCR%20Audio%20Aure)
- [Abyss AB-1266 Phi CC Lite](./crinacle/EARS%20+%20711%20over-ear/Abyss%20AB-1266%20Phi%20CC%20Lite)
- [Sennheiser HD 650](./oratory1990/over-ear/Sennheiser%20HD%20650)
- [Sennheiser HD 650 (2020)](./crinacle/GRAS%2043AG-7%20over-ear/Sennheiser%20HD%20650%20(2020))
- [Sennheiser HD 600](./oratory1990/over-ear/Sennheiser%20HD%20600)
- [Sony MDR-E9LP](./Super%20Review/earbud/Sony%20MDR-E9LP)
- [Not a result](./oratory1990/Sennheiser)
- [Odd form](./oratory1990/on-ear/Something)
`

const FIXED = `Preamp: -7.4 dB
Filter 1: ON PK Fc 31 Hz Gain 7.0 dB Q 1.41
Filter 2: ON PK Fc 62 Hz Gain 2.6 dB Q 1.41
Filter 3: ON PK Fc 125 Hz Gain -1.2 dB Q 1.41
Filter 4: ON PK Fc 250 Hz Gain -2.2 dB Q 1.41
Filter 5: ON PK Fc 500 Hz Gain 0.5 dB Q 1.41
Filter 6: ON PK Fc 1000 Hz Gain -1.0 dB Q 1.41
Filter 7: ON PK Fc 2000 Hz Gain 0.7 dB Q 1.41
Filter 8: ON PK Fc 4000 Hz Gain -1.2 dB Q 1.41
Filter 9: ON PK Fc 8000 Hz Gain 5.1 dB Q 1.41
Filter 10: ON PK Fc 16000 Hz Gain -3.6 dB Q 1.41
`

describe('the recommended index', () => {
  it('reads each result link into its source, rig, form and decoded path', () => {
    const results = parseRecommended(README)
    expect(results.map((result) => result.name)).toEqual([
      '1MORE Aero (ANC Off)',
      'Alpha & Delta D6',
      'AüR Audio Aure',
      'Abyss AB-1266 Phi CC Lite',
      'Sennheiser HD 650',
      'Sennheiser HD 650 (2020)',
      'Sennheiser HD 600',
      'Sony MDR-E9LP',
    ])
    expect(results[0]).toEqual({
      name: '1MORE Aero (ANC Off)',
      source: 'HypetheSonics',
      rig: 'GRAS RA0045',
      form: 'in-ear',
      path: 'HypetheSonics/GRAS RA0045 in-ear/1MORE Aero (ANC Off)',
    })
    expect(results[1]).toMatchObject({ source: 'crinacle', rig: 'Bruel & Kjaer 4620', form: 'in-ear' })
    expect(results[2]).toMatchObject({ source: 'Kazi', rig: null, form: 'in-ear', path: 'Kazi/in-ear/AüR Audio Aure' })
    expect(results[3]).toMatchObject({ rig: 'EARS + 711', form: 'over-ear' })
    expect(results[4]).toMatchObject({ source: 'oratory1990', rig: null, form: 'over-ear' })
    expect(results[7]).toMatchObject({ source: 'Super Review', rig: null, form: 'earbud' })
  })

  it('names the fixed band file at the pinned revision with every segment encoded', () => {
    const [aero, alpha, aur] = parseRecommended(README) as [HeadphoneResult, HeadphoneResult, HeadphoneResult]
    const base = `https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@${AUTOEQ_REVISION}/results/`
    expect(resultUrl(aero, 'FixedBandEQ.txt')).toBe(
      `${base}HypetheSonics/GRAS%20RA0045%20in-ear/1MORE%20Aero%20(ANC%20Off)/1MORE%20Aero%20(ANC%20Off)%20FixedBandEQ.txt`,
    )
    expect(resultUrl(alpha, 'FixedBandEQ.txt')).toBe(
      `${base}crinacle/Bruel%20%26%20Kjaer%204620%20in-ear/Alpha%20%26%20Delta%20D6/Alpha%20%26%20Delta%20D6%20FixedBandEQ.txt`,
    )
    expect(resultUrl(aur, 'FixedBandEQ.txt')).toBe(
      `${base}Kazi/in-ear/A%C3%BCR%20Audio%20Aure/A%C3%BCR%20Audio%20Aure%20FixedBandEQ.txt`,
    )
  })

  it('finds headphones by every word, the closest names first, and counts the rest', () => {
    const index = parseRecommended(README)
    expect(matchHeadphones(index, '', 8)).toEqual({ results: [], total: 0 })
    const hd650 = matchHeadphones(index, 'hd 650', 8)
    expect(hd650.results.map((result) => result.name)).toEqual(['Sennheiser HD 650', 'Sennheiser HD 650 (2020)'])
    expect(hd650.total).toBe(2)
    expect(matchHeadphones(index, 'Sennheiser HD 650', 8).results[0]?.name).toBe('Sennheiser HD 650')
    // Accents, case and punctuation aside; the limit keeps the count.
    expect(matchHeadphones(index, 'aur', 8).results.map((result) => result.name)).toEqual(['AüR Audio Aure'])
    expect(matchHeadphones(index, 'ALPHA-DELTA', 8).results.map((result) => result.name)).toEqual(['Alpha & Delta D6'])
    expect(matchHeadphones(index, 'sennheiser', 1)).toMatchObject({ total: 3 })
    expect(matchHeadphones(index, 'sennheiser', 1).results).toHaveLength(1)
    expect(foldName('Beyerdynamic DT-990 (250 Ω)')).toBe('beyerdynamic dt 990 250 ω')
  })
})

describe('a fixed band correction', () => {
  it('reads the preamp and ten peaking filters as the bands the player takes', () => {
    const correction = parseFixedBand(FIXED)
    expect(correction.preamp).toBe(-7.4)
    expect(correction.bands).toHaveLength(10)
    expect(correction.bands[0]).toEqual({ position: 0, frequency: 31, gain: 7, q: 1.41 })
    expect(correction.bands[9]).toEqual({ position: 9, frequency: 16000, gain: -3.6, q: 1.41 })
    expect(fitsPlayer(correction)).toBe(true)
  })

  it('refuses shelves, a wrong count and a missing preamp', () => {
    expect(() => parseFixedBand(FIXED.replace('ON PK Fc 31', 'ON LSC Fc 31'))).toThrow(SyntaxError)
    expect(() => parseFixedBand(FIXED.split('\n').slice(0, 6).join('\n'))).toThrow(/5 filters/)
    expect(() => parseFixedBand(FIXED.replace('Preamp: -7.4 dB\n', ''))).toThrow(/preamp/)
    expect(() => parseFixedBand(FIXED.replace('Filter 2:', 'Filter 3:'))).toThrow(/order/)
  })

  it('knows a correction outside the player’s bounds', () => {
    const correction = parseFixedBand(FIXED)
    expect(fitsPlayer({ ...correction, preamp: -30 })).toBe(false)
    expect(fitsPlayer({ ...correction, bands: correction.bands.map((band) => ({ ...band, gain: 13 })) })).toBe(false)
  })

  it('fetches the index and a result as plain text from jsDelivr', async () => {
    const asked: string[] = []
    const fetchImpl = ((url: string) => {
      asked.push(url)
      return Promise.resolve(new Response(url.endsWith('README.md') ? README : FIXED, { status: 200 }))
    }) as unknown as typeof fetch
    const index = await fetchRecommended(fetchImpl)
    expect(index).toHaveLength(8)
    const correction = await fetchCorrection(index[4] as HeadphoneResult, fetchImpl)
    expect(correction.preamp).toBe(-7.4)
    expect(asked).toEqual([
      `https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@${AUTOEQ_REVISION}/results/README.md`,
      `https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@${AUTOEQ_REVISION}/results/oratory1990/over-ear/Sennheiser%20HD%20650/Sennheiser%20HD%20650%20FixedBandEQ.txt`,
    ])
    const down = (() => Promise.resolve(new Response('', { status: 503 }))) as unknown as typeof fetch
    await expect(fetchRecommended(down)).rejects.toThrow(/503/)
  })
})
