import type { LibraryTrack } from './track'

export interface Artist {
  name: string
  albumCount: number
  trackCount: number
  /** Stock knows this name as an artist of its own (not only inside a joint credit), so it can play it. */
  literal: boolean
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

/**
 * What goes before the artist at `index` of `count` when a credit is shown:
 * commas between, "&" before the last ("A & B", "A, B & C"; owner, round 14).
 */
export function creditSeparator(index: number, count: number): string {
  if (index === 0) return ''
  return index === count - 1 ? ' & ' : ', '
}

/** A credit for display: "A", "A & B", "A, B & C". */
export function creditLabel(credit: string): string {
  const names = creditArtists(credit)
  return names.map((name, index) => creditSeparator(index, names.length) + name).join('')
}

/** Whether two credits name the same artists, in any order ("A; B" and "B;A"). */
export function sameCredit(a: string, b: string): boolean {
  const left = new Set(creditArtists(a))
  const right = creditArtists(b)
  return left.size === new Set(right).size && right.every((name) => left.has(name))
}

/**
 * The credit more than half of an album's tracks carry, in any order of its
 * artists, or null. Stock gives an album the credit of the track it scanned
 * first, a guest's joint credit included ("A;B" on an album of A's): the rows
 * leave out this lead credit instead, so only the guest's rows name who plays.
 */
export function leadCredit(credits: readonly (string | null)[]): string | null {
  const counts = new Map<string, { credit: string; count: number }>()
  for (const credit of credits) {
    if (credit === null) continue
    const key = [...creditArtists(credit)].sort().join(';')
    const entry = counts.get(key) ?? { credit, count: 0 }
    entry.count++
    counts.set(key, entry)
  }
  for (const { credit, count } of counts.values()) if (count * 2 > credits.length) return credit
  return null
}

/** Whether a credit names this artist, alone or jointly. */
export const credits = (credit: string | null, name: string) => credit !== null && creditArtists(credit).includes(name)

/** Artists by their track credits (joint credits count for each artist), in first-seen order. */
export function groupArtists(tracks: readonly LibraryTrack[]): Artist[] {
  const artists = new Map<string, { name: string; albums: Set<string>; trackCount: number }>()
  const literal = new Set<string>()
  for (const track of tracks) {
    if (!track.artist) continue
    literal.add(track.artist)
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
  return [...artists.values()].map(({ name, albums, trackCount }) => ({
    name,
    albumCount: albums.size,
    trackCount,
    literal: literal.has(name),
  }))
}
