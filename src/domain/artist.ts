import type { LibraryTrack } from './track'

export interface Artist {
  name: string
  albumCount: number
  trackCount: number
}

/**
 * The artists of one credit. Stock keeps a joint credit as one string: tags
 * written as "A; B" stay as they are and several ARTIST fields of a FLAC file
 * are joined as "A;B" (emulator observation), so credits split on semicolons
 * only. "/", "&" and "feat." are left alone: they belong to names like AC/DC.
 */
export function creditArtists(credit: string): string[] {
  const names = [...new Set(credit.split(';').map((name) => name.trim()))].filter((name) => name !== '')
  return names.length ? names : [credit]
}

/** A credit for display: its artists joined by commas. */
export const creditLabel = (credit: string) => creditArtists(credit).join(', ')

/** Whether a credit names this artist, alone or jointly. */
export const credits = (credit: string | null, name: string) => credit !== null && creditArtists(credit).includes(name)

/** Artists by their track credits (joint credits count for each artist), in first-seen order. */
export function groupArtists(tracks: readonly LibraryTrack[]): Artist[] {
  const artists = new Map<string, { name: string; albums: Set<string>; trackCount: number }>()
  for (const track of tracks) {
    if (!track.artist) continue
    for (const name of creditArtists(track.artist)) {
      let artist = artists.get(name)
      if (!artist) {
        artist = { name, albums: new Set(), trackCount: 0 }
        artists.set(name, artist)
      }
      artist.trackCount++
      if (track.album) artist.albums.add(track.album)
    }
  }
  return [...artists.values()].map(({ name, albums, trackCount }) => ({ name, albumCount: albums.size, trackCount }))
}
