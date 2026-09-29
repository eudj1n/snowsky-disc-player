import { credits } from './artist'
import type { LibraryTrack } from './track'

/**
 * An album as the stock library groups it: by album title. One title may hold
 * several releases or a compilation, so the artist credits stay a list and
 * are never merged into a guessed album artist. A literal track artist
 * narrows a title group to one release (the stock artist/album scope, as in
 * the reference); album links carry it whenever it is known.
 */
export interface Album {
  /** Unique among the listed albums: the title, plus the release when a title is split. */
  key: string
  title: string
  /** Distinct display credits (album artist, else track artist) in first-seen order. */
  artists: string[]
  /** Distinct literal track artists in first-seen order: the possible scopes. */
  trackArtists: string[]
  /** A member's card path per scope (the whole title under ''), for its cover. */
  paths: Record<string, string>
  trackCount: number
  /** Distinct track genres in first-seen order. */
  genres: string[]
  /** Stock SONG IDs of its tracks. */
  ids: number[]
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
      album = {
        key: JSON.stringify([track.album]),
        title: track.album,
        artists: [],
        trackArtists: [],
        paths: {},
        trackCount: 0,
        genres: [],
        ids: [],
        addedAt: null,
      }
      albums.set(track.album, album)
    }
    album.trackCount++
    album.ids.push(track.id)
    if (track.genre && !album.genres.includes(track.genre)) album.genres.push(track.genre)
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

/** A disc folder inside an album folder: CD1, Disc 2, disk_3, Диск 1. */
const DISC_FOLDER = /^(?:cd|disc|disk|диск)[\s._-]*(\d{1,2})$/i

function folders(path: string): string[] {
  return path.split('/').slice(0, -1)
}

/** The disc number: the tag, else a disc folder name (CD2/…); null when neither says. */
export function discOf(track: { path: string | null; discNumber?: number | null }): number | null {
  if (typeof track.discNumber === 'number' && track.discNumber > 0) return track.discNumber
  const folder = track.path ? folders(track.path).at(-1) : undefined
  const match = folder ? DISC_FOLDER.exec(folder) : null
  return match?.[1] ? Number(match[1]) : null
}

/**
 * Which release of its title a track belongs to: its album artist, else its
 * album folder (a disc folder counts as its parent). Stock groups albums by
 * title only, so two albums called "Harbor" in different folders are one
 * stock group; the library view tells them apart by this.
 */
export function releaseOf(track: Pick<LibraryTrack, 'albumArtist' | 'artist' | 'path'>): string {
  if (track.albumArtist) return `artist:${track.albumArtist}`
  if (!track.path) return `track-artist:${track.artist ?? ''}`
  const parts = folders(track.path)
  if (DISC_FOLDER.test(parts.at(-1) ?? '')) parts.pop()
  return `folder:${parts.join('/')}`
}

/**
 * Albums as cards: title groups split into releases (releaseOf) when one
 * title holds several. Releases that stock can only address by the same
 * artist scope stay together, since they could not be opened or played apart;
 * a release with several track artists (a compilation) keeps the title's
 * page, where its artists are offered as filters.
 */
export function groupReleases(tracks: readonly LibraryTrack[]): Album[] {
  const byTitle = new Map<string, LibraryTrack[]>()
  for (const track of tracks) {
    if (!track.album) continue
    const list = byTitle.get(track.album)
    if (list) list.push(track)
    else byTitle.set(track.album, [track])
  }
  const result: Album[] = []
  for (const [title, members] of byTitle) {
    const [whole] = groupAlbums(members)
    if (!whole) continue
    const parts = new Map<string, LibraryTrack[]>()
    for (const track of members) {
      const release = releaseOf(track)
      const part = parts.get(release)
      if (part) part.push(track)
      else parts.set(release, [track])
    }
    // Releases that only one and the same track artist credits merge back.
    const scoped = new Map<string, LibraryTrack[]>()
    for (const [release, part] of parts) {
      const artists = new Set(part.map((track) => track.artist ?? ''))
      const [only] = artists
      const key = artists.size === 1 && only ? `scope:${only}` : release
      scoped.set(key, [...(scoped.get(key) ?? []), ...part])
    }
    if (whole.trackArtists.length <= 1 || scoped.size <= 1) {
      result.push(whole)
      continue
    }
    for (const [release, part] of scoped) {
      const [album] = groupAlbums(part)
      if (album) result.push({ ...album, key: JSON.stringify([title, release]) })
    }
  }
  return result
}

/** Most recently added first; ties keep library order. */
export function recentAlbums(albums: readonly Album[], count: number = Infinity): Album[] {
  return [...albums].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, count)
}

/** The scope a link to this title group can carry: its only track artist, if it has exactly one. */
export function albumScope(album: Album): string | null {
  return album.trackArtists.length === 1 ? (album.trackArtists[0] ?? null) : null
}

/** Stock's names for missing tags (strings of the V2.57 mq_player), compared without case. */
const STOCK_UNKNOWN = new Set(['unknown artist', 'unknown album', 'unknown genre'])
export const stockUnknown = (name: string | null | undefined): boolean =>
  !name || STOCK_UNKNOWN.has(name.trim().toLowerCase())

export type CoverState = 'found' | 'missing' | 'unknown'

/**
 * The Home hero's album (owner, 2026-09-29): never one named by stock's
 * placeholders (the title or the lead artist) and never one known to have no
 * cover; among albums with a known cover when there are any. The previous
 * choice stays for the page's session while it is named and in the library,
 * so the hero never changes under the pointer as covers arrive; an album
 * found to have no cover meanwhile is left out from the next load on (the
 * miss is remembered in the browser).
 */
export function featuredChoice(
  albums: readonly Album[],
  cover: (album: Album) => CoverState,
  seed: number,
  previous: string | null,
): Album | null {
  const named = albums.filter((album) => !stockUnknown(album.title) && !stockUnknown(album.artists[0]))
  const kept = previous === null ? undefined : named.find((album) => album.key === previous)
  if (kept) return kept
  const offered = named.filter((album) => cover(album) !== 'missing')
  const covered = offered.filter((album) => cover(album) === 'found')
  const pool = covered.length ? covered : offered
  return pool[Math.floor(seed * pool.length)] ?? null
}

/** A title group's tracks, narrowed to one literal track artist when scoped. */
export function albumTracks<T extends LibraryTrack>(tracks: readonly T[], title: string, artist: string | null): T[] {
  return tracks.filter((track) => track.album === title && (artist === null || track.artist === artist))
}

/** Other albums with tracks crediting this artist, alone or jointly ("More by"), most recently added first. */
export function albumsBy(albums: readonly Album[], artist: string, except: string): Album[] {
  return recentAlbums(
    albums.filter((album) => album.title !== except && album.trackArtists.some((credit) => credits(credit, artist))),
  )
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
export function byTrackNumber<T extends Pick<LibraryTrack, 'discNumber' | 'trackNumber' | 'path'>>(
  tracks: readonly T[],
): T[] {
  const numbered = (track: T) => typeof track.trackNumber === 'number' && track.trackNumber > 0
  return tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => {
      const an = numbered(a.track)
      const bn = numbered(b.track)
      if (an !== bn) return an ? -1 : 1
      if (!an) return a.index - b.index
      return (
        (discOf(a.track) ?? 1) - (discOf(b.track) ?? 1) ||
        (a.track.trackNumber ?? 0) - (b.track.trackNumber ?? 0) ||
        a.index - b.index
      )
    })
    .map((entry) => entry.track)
}
