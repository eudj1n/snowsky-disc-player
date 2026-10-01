import { describe, expect, it } from 'vitest'
import { fanartArtist, FanartKeyRefused, fanartPreview } from '../../src/gateway/fanart'

const MBID = 'cc197bad-dc9c-440d-a5b5-d52ba2e14234'
const answer =
  (status: number, body: unknown, asked: string[] = []): typeof fetch =>
  (input) => {
    asked.push(input instanceof Request ? input.url : input.toString())
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }

describe('fanart.tv', () => {
  it('reads photos, backgrounds and album covers, most liked first, with their previews', async () => {
    const asked: string[] = []
    const found = await fanartArtist(
      MBID,
      'personal',
      answer(
        200,
        {
          name: 'Northline',
          artistthumb: [
            { id: '1', url: 'https://assets.fanart.tv/fanart/a.jpg', likes: '1' },
            { id: '2', url: 'https://assets.fanart.tv/fanart/b.jpg', likes: '4' },
            { id: '3', url: 'https://elsewhere.example/c.jpg', likes: '9' },
          ],
          artistbackground: [{ id: '4', url: 'https://assets.fanart.tv/fanart/wide.jpg', likes: '0' }],
          albums: { 'group-1': { albumcover: [{ id: '5', url: 'https://assets.fanart.tv/fanart/cover.jpg' }] }, x: {} },
        },
        asked,
      ),
    )
    expect(asked).toEqual([`https://webservice.fanart.tv/v3/music/${MBID}?api_key=personal`])
    expect(found?.thumbs.map((image) => image.id)).toEqual(['2', '1'])
    expect(found?.thumbs[0]?.preview).toBe('https://assets.fanart.tv/preview/b.jpg')
    expect(found?.backgrounds).toHaveLength(1)
    expect(Object.keys(found?.covers ?? {})).toEqual(['group-1'])
  })

  it('knows no artist from an empty answer, and refuses a bad key without guessing', async () => {
    expect(await fanartArtist(MBID, 'personal', answer(200, {}))).toBeNull()
    expect(await fanartArtist(MBID, 'personal', answer(404, { status: 'error' }))).toBeNull()
    await expect(fanartArtist(MBID, 'wrong', answer(401, { error: 'invalid API key' }))).rejects.toBeInstanceOf(
      FanartKeyRefused,
    )
    await expect(fanartArtist(MBID, 'personal', answer(503, {}))).rejects.toThrow('503')
    expect(fanartPreview('https://assets.fanart.tv/fanart/x.jpg')).toBe('https://assets.fanart.tv/preview/x.jpg')
  })
})
