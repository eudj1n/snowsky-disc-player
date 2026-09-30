/**
 * The page's sources as a queue for this browser (owner, 2026-09-30: with the
 * browser chosen, every play action plays here). The same sources the player
 * takes, from the page's copy of the library in its display order, the card
 * folder as the service lists it, or a list's entries; the queue names where
 * it came from for the play history and for the way back to the player.
 */
import { albumTracks, byTrackNumber } from '../domain/album'
import { sameGenre } from '../domain/genre'
import { pathsHash, queueContext, type PlayContext } from '../domain/history'
import { cardFolder } from '../domain/files'
import type { LibraryTrack, Track } from '../domain/track'
import { readCardFolder } from '../gateway/card'
import { readList } from '../gateway/lists'
import type { SelectionTarget, TrackKey } from '../gateway/selection'
import { http } from './connection'
import { favorites, library, loadPlaylistTracks, trackByPath, tracks } from './library'

type QueueTrack = Pick<Track, 'path' | 'title' | 'artist' | 'album' | 'durationMs' | 'cue' | 'cueOffsetMs'>

export interface BrowserQueue {
  tracks: QueueTrack[]
  from: number
  context: PlayContext | null
}

/** A row's position for a track key; the first row when none matches. */
function positionOf(list: readonly QueueTrack[], key: TrackKey | undefined): number {
  if (!key) return 0
  const at = list.findIndex(
    (track) => track.title === key.title && (key.artist === null || track.artist === key.artist),
  )
  return Math.max(0, at)
}

/** Albums one after another, each in its own order (as the pages list an artist's or a genre's albums). */
function byAlbum(list: readonly LibraryTrack[]): LibraryTrack[] {
  const groups = new Map<string, LibraryTrack[]>()
  for (const track of list) {
    const key = track.album ?? ''
    groups.set(key, [...(groups.get(key) ?? []), track])
  }
  return [...groups.values()].flatMap((group) => byTrackNumber(group))
}

/** A card file the library does not know yet, named by its file. */
function fileTrack(path: string): QueueTrack {
  const name = path.split('/').pop() ?? path
  return { path, title: name.replace(/\.[^.]+$/, ''), artist: null, album: null, durationMs: null }
}
const byPath = (path: string): QueueTrack => trackByPath.value.get(path) ?? fileTrack(path)

function context(list: readonly QueueTrack[], fields: Parameters<typeof queueContext>[1]): PlayContext {
  return queueContext(
    list.flatMap((track) => (track.path ? [track.path] : [])),
    fields,
  )
}

/** The queue for a source; null when the source has nothing to play (or its listing failed). */
export async function browserQueueFor(target: SelectionTarget): Promise<BrowserQueue | null> {
  let list: QueueTrack[] = []
  let from = 0
  let played: PlayContext | null = null
  switch (target.kind) {
    case 'album':
    case 'artistAlbum': {
      const artist = target.kind === 'artistAlbum' ? target.artist : null
      list = byTrackNumber(albumTracks(tracks.value, target.album, artist))
      from = positionOf(list, target.track)
      played = context(list, { type: 3, album: target.album, artist })
      break
    }
    case 'artist':
      list = byAlbum(tracks.value.filter((track) => track.artist === target.artist))
      played = context(list, { type: 2, artist: target.artist })
      break
    case 'genre':
      list = byAlbum(tracks.value.filter((track) => sameGenre(track.genre, target.genre)))
      from = positionOf(list, target.track)
      played = { ...context(list, { type: 2 }), genre: target.genre }
      break
    case 'genreAlbum':
      list = byTrackNumber(
        albumTracks(tracks.value, target.album, null).filter((track) => sameGenre(track.genre, target.genre)),
      )
      from = positionOf(list, target.track)
      played = { ...context(list, { type: 2, album: target.album }), genre: target.genre }
      break
    case 'library':
      list = [...tracks.value]
      from = positionOf(list, target.track)
      played = context(list, { type: 1 })
      break
    case 'favorites':
      list = [...favorites.value]
      from = positionOf(list, target.track)
      played = context(list, { type: null })
      break
    case 'playlist': {
      const playlist = library.playlists.find((item) => item.name === target.name)
      if (!playlist) return null
      list = await loadPlaylistTracks(playlist.listId)
      from = positionOf(list, target.track)
      played = context(list, { type: null })
      break
    }
    case 'folder': {
      const listing = await readCardFolder(http, target.folder).catch(() => null)
      if (!listing) return null
      const base = cardFolder(target.folder)
      const files = listing.entries.filter((entry) => !entry.folder && entry.kind === 'audio')
      list = files.map((entry) => byPath(`${base}${entry.name}`))
      from = target.file
        ? Math.max(
            0,
            files.findIndex((entry) => entry.name === target.file),
          )
        : 0
      played = { ...context(list, { type: null }), folder: target.folder }
      break
    }
    case 'list': {
      const content = await readList(http, target.scope, target.name).catch(() => null)
      if (!content) return null
      list = content.entries.map(byPath)
      from = target.position ?? 0
      played = context(list, { type: 4 })
      break
    }
  }
  return list.length ? { tracks: list, from: Math.min(from, list.length - 1), context: played } : null
}

/** The paths hash of a queue, to see on the way back whether the player's queue is still the same. */
export function queueHash(list: readonly (QueueTrack | null)[]): string | null {
  const paths = list.flatMap((track) => (track?.path ? [track.path] : []))
  return paths.length ? pathsHash(paths) : null
}
