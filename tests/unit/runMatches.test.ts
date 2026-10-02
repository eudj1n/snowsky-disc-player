import { describe, expect, it } from 'vitest'
import { sureArtist, sureEdition } from '../../src/domain/runMatches'

describe('what the automatic enrichment takes without asking', () => {
  const exactly = (candidate: { name: string }) => candidate.name === 'Northline'

  it('takes the one artist named exactly so and scored 100', () => {
    const one = { name: 'Northline', score: 100 }
    expect(sureArtist([one, { name: 'Northliner', score: 100 }], exactly)).toBe(one)
    // Two of the name, or a lower score, wait for the owner.
    expect(sureArtist([one, { name: 'Northline', score: 96 }], exactly)).toBeNull()
    expect(sureArtist([{ name: 'Northline', score: 99 }], exactly)).toBeNull()
    expect(sureArtist([], exactly)).toBeNull()
  })

  it("takes the best edition only with a high score and the album's number of tracks", () => {
    const top = { score: 97, trackCount: 3 }
    expect(sureEdition([top, { score: 100, trackCount: 4 }], 3)).toBe(top)
    expect(sureEdition([{ score: 94, trackCount: 3 }], 3)).toBeNull()
    expect(sureEdition([{ score: 100, trackCount: 4 }], 3)).toBeNull()
    expect(sureEdition([], 3)).toBeNull()
  })
})
