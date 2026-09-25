import type { LibraryTrack } from './track'

export interface Artist {
  name: string
  albumCount: number
  trackCount: number
}

/** Artists by their track credit, in first-seen order. */
export function groupArtists(tracks: readonly LibraryTrack[]): Artist[] {
  const artists = new Map<string, { name: string; albums: Set<string>; trackCount: number }>()
  for (const track of tracks) {
    if (!track.artist) continue
    let artist = artists.get(track.artist)
    if (!artist) {
      artist = { name: track.artist, albums: new Set(), trackCount: 0 }
      artists.set(track.artist, artist)
    }
    artist.trackCount++
    if (track.album) artist.albums.add(track.album)
  }
  return [...artists.values()].map(({ name, albums, trackCount }) => ({ name, albumCount: albums.size, trackCount }))
}
