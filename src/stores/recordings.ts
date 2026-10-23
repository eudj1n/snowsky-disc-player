/**
 * The recordings of the card's tracks (owner, 2026-10-23): the MusicBrainz
 * recording ids of an identified album's edition, which ListenBrainz's
 * similarity goes by. They come with the identity when the edition is
 * confirmed (musicbrainzIds); for an album identified before that, the
 * edition's tracks are read from MusicBrainz once (one paced request, the
 * release id alone leaves), kept in this browser for good and, when this
 * browser is paired, written into the identity for every browser.
 */
import { albumScope, albumTracks, type Album } from '../domain/album'
import { recordingOfTrack, type EditionRecording } from '../domain/recommendations'
import type { LibraryTrack } from '../domain/track'
import { releaseTracks } from '../gateway/musicbrainz'
import { cacheGet, cacheSet } from '../lib/idb'
import { albumIdentityKey } from './coverSearch'
import { albums, tracks } from './library'
import { albumIdentity, identifyAllowed, keepAlbumRecordings, type AlbumIdentity } from './musicbrainzIds'

const cacheKey = (release: string) => `musicbrainz:release-tracks:${release}`
const reading = new Map<string, Promise<EditionRecording[] | null>>()

interface IdentifiedAlbum {
  album: Album
  key: string
  identity: AlbumIdentity
}

/** The album of a track and the identity key the page confirmed it under, if any. */
export function identifiedAlbumOf(track: LibraryTrack): IdentifiedAlbum | null {
  const album = albums.value.find((item) => item.ids.includes(track.id)) ?? null
  if (!album) return null
  for (const scope of [track.artist, albumScope(album), null]) {
    const key = albumIdentityKey(album, scope)
    const identity = albumIdentity(key)
    if (identity) return { album, key, identity }
  }
  return null
}

/** The card's tracks of the identified album, in the scope the identity was confirmed under. */
function tracksOf(found: IdentifiedAlbum, track: LibraryTrack): LibraryTrack[] {
  const scope = found.key === found.album.key ? albumScope(found.album) : (track.artist ?? albumScope(found.album))
  return albumTracks(tracks.value, found.album.title, scope)
}

const keptEdition = (identity: AlbumIdentity): EditionRecording[] | null => {
  const kept = identity.facts?.recordings
  return kept?.length ? kept.map((recording) => ({ recording: recording || null, title: null })) : null
}

/** The edition's recordings of an identified album: kept with the identity, else this browser's copy, else read. */
export function editionRecordings(key: string, identity: AlbumIdentity): Promise<EditionRecording[] | null> {
  const kept = keptEdition(identity)
  if (kept) return Promise.resolve(kept)
  const pending = reading.get(identity.mbid)
  if (pending) return pending
  const task = (async () => {
    const copy = await cacheGet<EditionRecording[]>(cacheKey(identity.mbid))
    if (copy?.length) return copy
    if (!identifyAllowed()) return null
    const read = await releaseTracks(identity.mbid).catch(() => null)
    if (!read?.length) return null
    const edition = read.map((track) => ({ recording: track.recording, title: track.title }))
    await cacheSet(cacheKey(identity.mbid), edition)
    void keepAlbumRecordings(
      key,
      edition.map((track) => track.recording ?? ''),
    )
    return edition
  })()
  reading.set(identity.mbid, task)
  void task.finally(() => reading.delete(identity.mbid))
  return task
}

/** The recording of a track of the card, through its album's identity; null where the album is not identified. */
export async function recordingOf(track: LibraryTrack): Promise<string | null> {
  const found = identifiedAlbumOf(track)
  if (!found) return null
  const edition = await editionRecordings(found.key, found.identity)
  return edition ? recordingOfTrack(tracksOf(found, track), track, edition) : null
}

/** The recordings this tab knows for the card's tracks, from the identities' kept lists (nothing is read). */
export function knownRecordings(): (track: LibraryTrack) => string | null {
  const byAlbum = new Map<string, EditionRecording[] | null>()
  return (track) => {
    const found = identifiedAlbumOf(track)
    if (!found) return null
    let edition = byAlbum.get(found.key)
    if (edition === undefined) {
      edition = keptEdition(found.identity)
      byAlbum.set(found.key, edition)
    }
    return edition ? recordingOfTrack(tracksOf(found, track), track, edition) : null
  }
}
