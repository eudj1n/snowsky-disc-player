import { describe, expect, it } from 'vitest'
import { coverType, currentCover, MAX_COVER_BYTES } from '../../src/gateway/artwork'
import { GatewayHttp } from '../../src/gateway/http'
import { librarySignature } from '../../src/domain/library'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
const serve = (body: Uint8Array<ArrayBuffer>) =>
  new GatewayHttp(() => Promise.resolve(new Response(body, { headers: { 'Content-Type': 'application/json' } })))

describe('current cover', () => {
  it('recognizes JPEG and PNG by their signatures, whatever the label', async () => {
    expect(coverType(jpeg)).toBe('image/jpeg')
    expect(coverType(png)).toBe('image/png')
    expect(coverType(new Uint8Array([0x7b, 0x7d]))).toBeNull()
    expect((await currentCover(serve(jpeg)))?.type).toBe('image/jpeg')
  })

  it('treats an empty or non-image body as no cover', async () => {
    expect(await currentCover(serve(new Uint8Array()))).toBeNull()
    expect(await currentCover(serve(new TextEncoder().encode('{}')))).toBeNull()
    expect(MAX_COVER_BYTES).toBe(8 * 1024 * 1024)
  })
})

describe('library signature', () => {
  it('changes with counts, the latest addition or the highest ID', () => {
    const base = { tracks: 779, favorites: 1, playlists: 3, lastAdded: 1790017458, lastId: 785 }
    expect(librarySignature(base)).not.toBe(librarySignature({ ...base, lastId: 786 }))
    expect(librarySignature(base)).not.toBe(librarySignature({ ...base, lastAdded: 1 }))
  })
})
