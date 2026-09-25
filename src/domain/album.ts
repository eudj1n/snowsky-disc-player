import type { LibraryTrack } from './track'

/**
 * An album as the stock library groups it: by album title. One title may hold
 * several releases or a compilation, so the artist credits stay a list and
 * are never merged into a guessed album artist.
 */
export interface Album {
  title: string
  /** Distinct artist credits in first-seen order. */
  artists: string[]
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
      album = { title: track.album, artists: [], trackCount: 0, addedAt: null }
      albums.set(track.album, album)
    }
    album.trackCount++
    const credit = track.albumArtist ?? track.artist
    if (credit && !album.artists.includes(credit)) album.artists.push(credit)
    if (track.addedAt !== null && (album.addedAt === null || track.addedAt > album.addedAt))
      album.addedAt = track.addedAt
  }
  return [...albums.values()]
}

/** Most recently added first; ties keep library order. */
export function recentAlbums(albums: readonly Album[], count: number): Album[] {
  return [...albums].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, count)
}
