import type { LibraryTrack } from './track'

/**
 * An album as the stock library groups it: by album title. One title may hold
 * several releases or a compilation, so the artist credits stay a list and
 * are never merged into a guessed album artist. A literal track artist
 * narrows a title group to one release (the stock artist/album scope, as in
 * the reference); album links carry it whenever it is known.
 */
export interface Album {
  title: string
  /** Distinct display credits (album artist, else track artist) in first-seen order. */
  artists: string[]
  /** Distinct literal track artists in first-seen order: the possible scopes. */
  trackArtists: string[]
  /** A member's card path per scope (the whole title under ''), for its cover. */
  paths: Record<string, string>
  trackCount: number
  /** Latest ADD_TIME among its tracks (seconds), for "recently added". */
  addedAt: number | null
}

/** Groups library tracks into stock title groups; tracks without an album are left out. */
export function groupAlbums(tracks: readonly LibraryTrack[]): Album[] {
  const albums = new Map<string, Album>()
  for (const track of tracks) {
    if (!track.album) continue
    let album = albums.get(track.album)
    if (!album) {
      album = { title: track.album, artists: [], trackArtists: [], paths: {}, trackCount: 0, addedAt: null }
      albums.set(track.album, album)
    }
    album.trackCount++
    const credit = track.albumArtist ?? track.artist
    if (credit && !album.artists.includes(credit)) album.artists.push(credit)
    if (track.artist && !album.trackArtists.includes(track.artist)) album.trackArtists.push(track.artist)
    if (track.path) {
      album.paths[''] ??= track.path
      if (track.artist) album.paths[track.artist] ??= track.path
    }
    if (track.addedAt !== null && (album.addedAt === null || track.addedAt > album.addedAt))
      album.addedAt = track.addedAt
  }
  return [...albums.values()]
}

/** Most recently added first; ties keep library order. */
export function recentAlbums(albums: readonly Album[], count: number = Infinity): Album[] {
  return [...albums].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, count)
}

/** The scope a link to this title group can carry: its only track artist, if it has exactly one. */
export function albumScope(album: Album): string | null {
  return album.trackArtists.length === 1 ? (album.trackArtists[0] ?? null) : null
}

/** A title group's tracks, narrowed to one literal track artist when scoped. */
export function albumTracks<T extends LibraryTrack>(tracks: readonly T[], title: string, artist: string | null): T[] {
  return tracks.filter((track) => track.album === title && (artist === null || track.artist === artist))
}

/** Other title groups with tracks by this artist ("More by"), most recently added first. */
export function albumsBy(albums: readonly Album[], artist: string, except: string): Album[] {
  return recentAlbums(albums.filter((album) => album.title !== except && album.trackArtists.includes(artist)))
}

export type AlbumSort = 'recent' | 'title' | 'artist'
export const ALBUM_SORTS: readonly AlbumSort[] = ['recent', 'title', 'artist']

/** Owner's proposal 6: recently added, by title or by artist; stable ties. */
export function sortAlbums(albums: readonly Album[], sort: AlbumSort, locale: string): Album[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  const artist = (album: Album) => album.artists[0] ?? ''
  return [...albums].sort((a, b) => {
    if (sort === 'recent') return (b.addedAt ?? 0) - (a.addedAt ?? 0)
    if (sort === 'artist') return collator.compare(artist(a), artist(b)) || collator.compare(a.title, b.title)
    return collator.compare(a.title, b.title)
  })
}

/**
 * Album order for display: by disc, then track number, as the tags number
 * them (the data level returns library order). Unnumbered tracks follow in
 * their original order. Selection still resolves positions in the stock's
 * own order, so display order never changes what is sent.
 */
export function byTrackNumber<T extends Pick<LibraryTrack, 'discNumber' | 'trackNumber'>>(tracks: readonly T[]): T[] {
  const numbered = (track: T) => typeof track.trackNumber === 'number' && track.trackNumber > 0
  return tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => {
      const an = numbered(a.track)
      const bn = numbered(b.track)
      if (an !== bn) return an ? -1 : 1
      if (!an) return a.index - b.index
      return (
        (a.track.discNumber ?? 1) - (b.track.discNumber ?? 1) ||
        (a.track.trackNumber ?? 0) - (b.track.trackNumber ?? 0) ||
        a.index - b.index
      )
    })
    .map((entry) => entry.track)
}
