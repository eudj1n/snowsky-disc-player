/** Continuing a remembered track (domain/resume.ts): the selection that starts it again. */
import type { PlaySource } from '../domain/history'
import { CARD_ROOT } from '../domain/imports'
import type { Remembered } from '../domain/resume'
import type { SelectionTarget } from './selection'

/**
 * What to play to continue a remembered track: the same source with that
 * track selected. A whole artist plays only from its start in stock, so the
 * track continues in its album of that artist; an unknown queue that is one
 * folder plays from the folder; otherwise the track plays in its album, or in
 * the whole library.
 */
export function resumeTarget(kept: Remembered, source: PlaySource | null): SelectionTarget {
  const { track, context } = kept
  const key = { title: track.title, artist: track.artist }
  switch (source?.kind) {
    case 'album':
      return source.scope
        ? { kind: 'artistAlbum', artist: source.scope, album: source.album.title, track: key }
        : { kind: 'album', album: source.album.title, track: key }
    case 'artist':
      return track.album
        ? { kind: 'artistAlbum', artist: source.artist, album: track.album, track: key }
        : { kind: 'library', track: key }
    case 'genre':
      return { kind: 'genre', genre: source.genre, track: key }
    case 'playlist':
      return { kind: 'playlist', name: source.playlist.name, track: key }
    case 'favorites':
      return { kind: 'favorites', track: key }
    case 'library':
      return { kind: 'library', track: key }
    default:
      if (context.folder?.startsWith(CARD_ROOT) && track.path)
        return {
          kind: 'folder',
          folder: context.folder.slice(CARD_ROOT.length),
          file: track.path.slice(context.folder.length + 1),
        }
      return track.album ? { kind: 'album', album: track.album, track: key } : { kind: 'library', track: key }
  }
}
