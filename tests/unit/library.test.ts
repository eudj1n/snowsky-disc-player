import { describe, expect, it } from 'vitest'
import { groupAlbums, recentAlbums } from '../../src/domain/album'
import type { LibraryTrack } from '../../src/domain/track'
import { libraryTrack, libraryTracks } from '../../src/gateway/library'
import { sameTrack, trackKey } from '../../src/domain/track'

const row = {
  ID: 2,
  PATH: '/tmp/sdcard/Шёлк/01.flac',
  NAME: '01.flac',
  TITLE: 'Шёлк',
  ALBUM: 'Шёлк',
  ARTIST: 'Ваня Дмитриенко',
  ALBUM_ARTIST: '',
  GENRE: 'ruspop',
  DISC: 1,
  TRACK: 1,
  DURATION: 0,
  ADD_TIME: 1790017438,
}

function track(
  id: number,
  album: string | null,
  artist: string | null,
  addedAt = id,
  albumArtist: string | null = null,
): LibraryTrack {
  return {
    id,
    fileName: `${id}.flac`,
    title: `T${id}`,
    album,
    artist,
    albumArtist,
    genre: null,
    discNumber: null,
    trackNumber: null,
    path: null,
    durationMs: null,
    queuePosition: null,
    addedAt,
  }
}

describe('library rows', () => {
  it('maps stock SONG rows without inventing values', () => {
    expect(libraryTrack(row)).toMatchObject({
      id: 2,
      title: 'Шёлк',
      albumArtist: null,
      durationMs: null,
      trackNumber: 1,
      addedAt: 1790017438,
    })
  })

  it('tells the tracks of one CUE sheet apart by title, since they share the file', () => {
    const image = '/tmp/sdcard/Guano Apes/Best of.flac'
    const first = libraryTrack({ ...row, ID: 7, PATH: image, TITLE: 'Break the Line', IS_CUE: 1, OFFSET: 0 })
    const second = libraryTrack({ ...row, ID: 8, PATH: image, TITLE: 'Open Your Eyes', IS_CUE: 1, OFFSET: 211000 })
    expect(first?.cue).toBe(true)
    expect(libraryTrack(row)).not.toHaveProperty('cue')
    if (!first || !second) throw new Error('parsed rows')
    expect(trackKey(first)).not.toBe(trackKey(second))
    expect(trackKey({ path: image, title: 'Break the Line ', cue: true })).toBe(trackKey(first))
    // Now playing reports the shared path, is_cue and the title (song_track stays 0).
    const playing = { path: image, title: 'Open Your Eyes', cue: true }
    expect(sameTrack(first, playing)).toBe(false)
    expect(sameTrack(second, playing)).toBe(true)
    // Ordinary files still match by path alone (the title stock reports may differ).
    const plain = libraryTrack(row)
    if (!plain) throw new Error('parsed row')
    expect(sameTrack(plain, { path: plain.path, title: 'Other name' })).toBe(true)
    expect(sameTrack(plain, null)).toBe(false)
  })

  it('falls back to the file name for untagged files and drops broken rows', () => {
    expect(libraryTrack({ ...row, TITLE: '' })?.title).toBe('01.flac')
    expect(libraryTrack({ ...row, ID: 0 })).toBeNull()
    const result = {
      query: 'tracks',
      columns: ['ID', 'NAME'],
      rows: [
        [1, 'a.flac'],
        [null, 'b.flac'],
      ],
      rows_returned: 2,
      truncated: false,
    }
    expect(libraryTracks(result).map((t) => t.id)).toEqual([1])
  })
})

describe('albums', () => {
  it('groups by stock album title and keeps every distinct credit', () => {
    const albums = groupAlbums([
      track(1, 'Mezmerize', 'SOAD'),
      track(2, 'Mezmerize', 'SOAD'),
      track(3, 'Hits', 'A'),
      track(4, 'Hits', 'B'),
      track(5, null, 'C'),
    ])
    expect(
      albums.map(({ title, artists, trackArtists, trackCount, addedAt, ids, key }) => ({
        title,
        artists,
        trackArtists,
        trackCount,
        addedAt,
        ids,
        key,
      })),
    ).toEqual([
      {
        title: 'Mezmerize',
        artists: ['SOAD'],
        trackArtists: ['SOAD'],
        trackCount: 2,
        addedAt: 2,
        ids: [1, 2],
        key: '["Mezmerize"]',
      },
      {
        title: 'Hits',
        artists: ['A', 'B'],
        trackArtists: ['A', 'B'],
        trackCount: 2,
        addedAt: 4,
        ids: [3, 4],
        key: '["Hits"]',
      },
    ])
  })

  it('prefers the album artist credit when present, but scopes by the literal track artist', () => {
    const [album] = groupAlbums([track(1, 'X', 'Guest', 1, 'Main')])
    expect(album?.artists).toEqual(['Main'])
    expect(album?.trackArtists).toEqual(['Guest'])
  })

  it('keeps releases that share a title apart through the artist scope', async () => {
    const { albumScope, albumTracks, albumsBy } = await import('../../src/domain/album')
    const tracks = [
      track(1, 'Silhouette', 'A', 1),
      track(2, 'Silhouette', 'B', 2),
      track(3, 'Silhouette', 'A', 3),
      track(4, 'Second', 'A', 9),
      track(5, 'First', 'A', 5),
      track(6, 'Other', 'B', 4),
    ]
    const albums = groupAlbums(tracks)
    const byTitle = (title: string) => albums.filter((album) => album.title === title)
    expect(byTitle('Silhouette').map(albumScope)).toEqual([null])
    expect(byTitle('Second').map(albumScope)).toEqual(['A'])
    expect(albumTracks(tracks, 'Silhouette', 'A').map((t) => t.id)).toEqual([1, 3])
    expect(albumTracks(tracks, 'Silhouette', null).map((t) => t.id)).toEqual([1, 2, 3])
    expect(albumsBy(albums, 'A', 'Silhouette').map((a) => a.title)).toEqual(['Second', 'First'])
    expect(albumsBy(albums, 'B', 'Silhouette').map((a) => a.title)).toEqual(['Other'])
  })

  it('orders recent albums by the latest addition', () => {
    const albums = groupAlbums([track(1, 'Old', 'A', 10), track(2, 'New', 'B', 30), track(3, 'Old', 'A', 20)])
    expect(recentAlbums(albums, 1).map((a) => a.title)).toEqual(['New'])
  })
})

describe('album sorting', () => {
  it('orders by recent addition, title or artist with the locale collation', async () => {
    const { sortAlbums } = await import('../../src/domain/album')
    const card = (title: string, artist: string, addedAt: number) => ({
      key: title,
      title,
      artists: [artist],
      trackArtists: [artist],
      paths: {},
      trackCount: 1,
      genres: [],
      ids: [],
      addedAt,
    })
    const albums = [card('Ёлка', 'Б', 2), card('album 10', 'а', 3), card('Album 9', 'В', 1)]
    expect(sortAlbums(albums, 'recent', 'ru').map((a) => a.title)).toEqual(['album 10', 'Ёлка', 'Album 9'])
    // Russian collation puts Cyrillic first; numbers compare numerically, case-insensitively.
    expect(sortAlbums(albums, 'title', 'ru').map((a) => a.title)).toEqual(['Ёлка', 'Album 9', 'album 10'])
    expect(sortAlbums(albums, 'title', 'en').map((a) => a.title)).toEqual(['Album 9', 'album 10', 'Ёлка'])
    expect(sortAlbums(albums, 'artist', 'ru').map((a) => a.artists[0])).toEqual(['а', 'Б', 'В'])
  })
})

describe('album display order', () => {
  it('follows disc and track numbers, unnumbered tracks last in library order', async () => {
    const { byTrackNumber } = await import('../../src/domain/album')
    const rows = [
      { id: 1, discNumber: 1, trackNumber: 3, path: null },
      { id: 2, discNumber: null, trackNumber: null, path: null },
      { id: 3, discNumber: 2, trackNumber: 1, path: null },
      { id: 4, discNumber: 1, trackNumber: 1, path: null },
      { id: 5, discNumber: null, trackNumber: 0, path: null },
      { id: 6, discNumber: null, trackNumber: 2, path: null },
    ]
    expect(byTrackNumber(rows).map((row) => row.id)).toEqual([4, 6, 1, 3, 2, 5])
  })

  it('takes the disc from a disc folder when the tag has none', async () => {
    const { byTrackNumber, discOf } = await import('../../src/domain/album')
    const at = (id: number, folder: string, trackNumber: number) => ({
      id,
      discNumber: null,
      trackNumber,
      path: `/tmp/sdcard/Album/${folder}/${id}.flac`,
    })
    expect(discOf({ discNumber: 2, path: null })).toBe(2)
    expect(discOf({ discNumber: 0, path: '/tmp/sdcard/A/CD 2/x.flac' })).toBe(2)
    expect(discOf({ discNumber: null, path: '/tmp/sdcard/A/Диск 3/x.flac' })).toBe(3)
    expect(discOf({ discNumber: null, path: '/tmp/sdcard/A/Bonus/x.flac' })).toBeNull()
    const rows = [at(1, 'Disc 2', 1), at(2, 'Disc 1', 2), at(3, 'Disc 1', 1), at(4, 'Disc 2', 2)]
    expect(byTrackNumber(rows).map((row) => row.id)).toEqual([3, 2, 1, 4])
  })
})

describe('genres', () => {
  const tagged = (id: number, album: string, artist: string, genre: string | null, addedAt = id) => ({
    ...track(id, album, artist, addedAt),
    genre,
  })

  it('groups literal genres and leaves untagged and reserved ones out', async () => {
    const { groupGenres, genreArtists, genreAlbums } = await import('../../src/domain/genre')
    const rows = [
      tagged(1, 'A', 'X', 'Jazz'),
      tagged(2, 'A', 'X', 'Soul'),
      tagged(3, 'B', 'Y', 'Jazz', 9),
      tagged(4, 'B', 'Z', 'Jazz'),
      tagged(5, 'C', 'Y', 'Jazz'),
      tagged(6, 'D', 'Q', null),
      tagged(7, 'E', 'Q', ' '),
      tagged(8, 'F', 'Q', 'unknown_style'),
    ]
    const genres = groupGenres(rows)
    expect(genres.map((genre) => [genre.name, genre.trackCount, genre.albums])).toEqual([
      ['Jazz', 4, ['A', 'B', 'C']],
      ['Soul', 1, ['A']],
    ])
    expect(genreArtists(rows, 'Jazz')).toEqual([
      { name: 'Y', trackCount: 2, literal: true },
      { name: 'X', trackCount: 1, literal: true },
      { name: 'Z', trackCount: 1, literal: true },
    ])
    const joint = [tagged(1, 'A', 'X; W', 'Jazz'), tagged(2, 'B', 'X', 'Jazz')]
    expect(genreArtists(joint, 'Jazz')).toEqual([
      { name: 'X', trackCount: 2, literal: true },
      { name: 'W', trackCount: 1, literal: false },
    ])
    const jazz = genres[0]
    expect(jazz && genreAlbums(groupAlbums(rows), jazz).map((album) => album.title)).toEqual(['B', 'C', 'A'])
  })

  it('shows spellings that differ only in case and spacing as one genre, keeping each for playback', async () => {
    const { findGenre, genreAlbums, genreArtists, genreTracks, groupGenres, playableGenre, sameGenre } =
      await import('../../src/domain/genre')
    const rows = [
      tagged(1, 'A', 'X', 'Alternative'),
      tagged(2, 'A', 'X', 'Alternative'),
      tagged(3, 'B', 'Y', 'alternative'),
      tagged(4, 'C', 'Z', 'Alternative '),
      tagged(5, 'C', 'Z', 'Alternative '),
      tagged(6, 'C', 'Z', 'Alternative '),
      tagged(7, 'D', 'Q', 'Jazz'),
    ]
    const genres = groupGenres(rows)
    // Shown under the spelling most tracks carry, trimmed; every spelling kept, most tracks first.
    expect(genres.map((genre) => [genre.name, genre.trackCount, genre.variants, genre.albums])).toEqual([
      ['Alternative', 6, ['Alternative ', 'Alternative', 'alternative'], ['A', 'B', 'C']],
      ['Jazz', 1, ['Jazz'], ['D']],
    ])
    const alternative = findGenre(genres, 'ALTERNATIVE')
    expect(alternative?.name).toBe('Alternative')
    expect(findGenre(genres, 'Alternative ')).toBe(alternative)
    expect(findGenre(genres, 'Rock')).toBeNull()
    expect(sameGenre('  alternative ', 'Alternative')).toBe(true)
    expect(sameGenre(null, 'Alternative')).toBe(false)
    expect(genreTracks(rows, 'alternative').map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6])
    expect(genreArtists(rows, 'Alternative').map((artist) => artist.name)).toEqual(['Z', 'X', 'Y'])
    if (!alternative) throw new Error('grouped genre')
    expect(
      genreAlbums(groupAlbums(rows), alternative)
        .map((album) => album.title)
        .sort(),
    ).toEqual(['A', 'B', 'C'])
    // Stock plays one spelling: the one most of the given tracks carry.
    expect(playableGenre(rows, alternative)).toBe('Alternative ')
    expect(
      playableGenre(
        rows.filter((row) => row.album === 'A'),
        alternative,
      ),
    ).toBe('Alternative')
    expect(playableGenre([], alternative)).toBe('Alternative ')
    // A tie prefers the capitalised spelling.
    const tie = groupGenres([tagged(1, 'A', 'X', 'rock'), tagged(2, 'B', 'Y', 'Rock')])
    expect(tie.map((genre) => [genre.name, genre.variants])).toEqual([['Rock', ['Rock', 'rock']]])
  })
})

describe('releases', () => {
  const at = (id: number, album: string, artist: string, folder: string, albumArtist: string | null = null) => ({
    ...track(id, album, artist, id, albumArtist),
    path: `/tmp/sdcard/${folder}/${id}.flac`,
  })

  it('splits one stock title into releases by folder, keeping disc folders together', async () => {
    const { groupReleases, albumScope } = await import('../../src/domain/album')
    const cards = groupReleases([
      at(1, 'Harbor', 'Lumen', 'Lumen - Harbor'),
      at(2, 'Harbor', 'Kestrel', 'Kestrel - Harbor'),
      at(3, 'Harbor', 'Lumen', 'Lumen - Harbor'),
      at(4, 'Double', 'Solo', 'Double/CD1'),
      at(5, 'Double', 'Solo', 'Double/CD2'),
    ])
    expect(cards.map((card) => [card.title, albumScope(card), card.ids])).toEqual([
      ['Harbor', 'Lumen', [1, 3]],
      ['Harbor', 'Kestrel', [2]],
      ['Double', 'Solo', [4, 5]],
    ])
    expect(new Set(cards.map((card) => card.key)).size).toBe(3)
  })

  it('keeps a compilation, or releases stock cannot tell apart, as one card', async () => {
    const { groupReleases } = await import('../../src/domain/album')
    const compilation = groupReleases([at(1, 'Hits', 'A', 'Hits'), at(2, 'Hits', 'B', 'Hits')])
    expect(compilation.map((card) => card.trackArtists)).toEqual([['A', 'B']])
    const editions = groupReleases([at(1, 'Live', 'A', 'Live 1999'), at(2, 'Live', 'A', 'Live 2004')])
    expect(editions.map((card) => card.ids)).toEqual([[1, 2]])
    const byAlbumArtist = groupReleases([
      at(1, 'Same', 'Guest', 'Mixed', 'One'),
      at(2, 'Same', 'Other', 'Mixed', 'Two'),
    ])
    expect(byAlbumArtist.map((card) => card.artists)).toEqual([['One'], ['Two']])
  })
})

describe('joint artist credits', () => {
  it('splits on semicolons only and counts each artist', async () => {
    const { creditArtists, creditLabel, credits, groupArtists, sameCredit } = await import('../../src/domain/artist')
    expect(creditArtists('Alpha; Beta')).toEqual(['Alpha', 'Beta'])
    expect(creditArtists('Alpha;Beta;Alpha')).toEqual(['Alpha', 'Beta'])
    expect(creditArtists('AC/DC')).toEqual(['AC/DC'])
    expect(creditArtists('Simon & Garfunkel')).toEqual(['Simon & Garfunkel'])
    // Shown as "A & B", "A, B & C" (owner, round 14); one artist stays as is.
    expect(creditLabel('Alpha; Beta')).toBe('Alpha & Beta')
    expect(creditLabel('Alpha; Beta;Gamma')).toBe('Alpha, Beta & Gamma')
    expect(creditLabel('Simon & Garfunkel')).toBe('Simon & Garfunkel')
    expect(sameCredit('Alpha; Beta', 'Beta;Alpha')).toBe(true)
    expect(sameCredit('Alpha; Beta', 'Alpha')).toBe(false)
    expect(sameCredit('Alpha; Beta', 'Alpha; Beta; Gamma')).toBe(false)
    expect(credits('Alpha; Beta', 'Beta')).toBe(true)
    expect(credits('Alphabet', 'Alpha')).toBe(false)
    const artists = groupArtists([track(1, 'X', 'Alpha'), track(2, 'Y', 'Alpha; Beta')])
    expect(artists).toEqual([
      { name: 'Alpha', albumCount: 2, trackCount: 2, literal: true },
      { name: 'Beta', albumCount: 1, trackCount: 1, literal: false },
    ])
  })
})

describe('player options and tag years', () => {
  it('reads the online options and the year of a DATE tag', async () => {
    const { onlineOptions } = await import('../../src/gateway/settings')
    const { tagYear } = await import('../../src/gateway/media')
    const result = { query: 'system_settings', columns: [], rows_returned: 1, truncated: false }
    expect(onlineOptions({ ...result, rows: [[1, 0]], columns: ['ONLINE_COVER', 'ONLINE_LRC'] })).toEqual({
      covers: true,
      lyrics: false,
    })
    expect(tagYear('2001-05-04')).toBe(2001)
    expect(tagYear('1999')).toBe(1999)
    expect(tagYear('20011')).toBeNull()
    expect(tagYear('May 2001')).toBeNull()
    expect(tagYear(undefined)).toBeNull()
  })
})
