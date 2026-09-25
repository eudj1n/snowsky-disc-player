/**
 * Observations the stock library database lacks, learned while listening
 * (reference Library enrichment): durations and cover images of tracks that
 * played. Kept in IndexedDB per track path. A cover is associated only when
 * the same track is observed immediately before and after the image read;
 * decorative sleeves are never stored.
 */
import { reactive, readonly } from 'vue'
import type { Track } from '../domain/track'
import { currentCover } from '../gateway/artwork'
import { parsePlayback } from '../gateway/playback'
import type { GatewaySession } from '../gateway/session'
import { cacheGet, cacheSet } from '../lib/idb'
import { http, onSessionOpened } from './connection'

interface EnrichmentModel {
  durations: Record<string, number>
  /** Track path → cover image. */
  covers: Record<string, Blob>
  /** Album title → path of a member with a cover. */
  albumCovers: Record<string, string>
  /** Album title scoped by a literal track artist → path of a member with a cover. */
  scopedCovers: Record<string, string>
}

const state = reactive<EnrichmentModel>({ durations: {}, covers: {}, albumCovers: {}, scopedCovers: {} })
export const enrichment = readonly(state)

const DURATIONS = 'enrichment:durations'
const ALBUM_COVERS = 'enrichment:album-covers'
const SCOPED_COVERS = 'enrichment:scoped-album-covers'
const scopeKey = (title: string, artist: string) => JSON.stringify([title, artist])
const coverKey = (path: string) => `cover:${path}`

export async function loadEnrichment(): Promise<void> {
  state.durations = (await cacheGet<Record<string, number>>(DURATIONS)) ?? {}
  state.albumCovers = (await cacheGet<Record<string, string>>(ALBUM_COVERS)) ?? {}
  state.scopedCovers = (await cacheGet<Record<string, string>>(SCOPED_COVERS)) ?? {}
  for (const path of new Set([...Object.values(state.albumCovers), ...Object.values(state.scopedCovers)])) {
    const blob = await cacheGet<Blob>(coverKey(path))
    if (blob) state.covers[path] = blob
  }
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/**
 * A track's own cover, else its release's: the same title and artist, or a
 * title-only association from the same folder (never a homonymous album's).
 */
export function coverFor(track: Pick<Track, 'path' | 'album' | 'artist'>): Blob | null {
  if (track.path && state.covers[track.path]) return state.covers[track.path] ?? null
  if (!track.album) return null
  const scoped = track.artist ? state.scopedCovers[scopeKey(track.album, track.artist)] : undefined
  const legacy = state.albumCovers[track.album]
  const member = scoped ?? (legacy && track.path && folderOf(legacy) === folderOf(track.path) ? legacy : undefined)
  return member ? (state.covers[member] ?? null) : null
}

/**
 * The cover of a title group, or of one artist's release in it. A title-only
 * association (kept from earlier sessions) is used for a scope only when the
 * title has a single track artist, so homonymous albums never share a cover.
 */
export function albumCover(
  album: { title: string; trackArtists: readonly string[] },
  artist: string | null = null,
): Blob | null {
  const member = artist
    ? (state.scopedCovers[scopeKey(album.title, artist)] ??
      (album.trackArtists.length <= 1 ? state.albumCovers[album.title] : undefined))
    : state.albumCovers[album.title]
  return member ? (state.covers[member] ?? null) : null
}

function rememberDuration(track: Track): void {
  if (!track.path || !track.durationMs || state.durations[track.path] === track.durationMs) return
  state.durations[track.path] = track.durationMs
  void cacheSet(DURATIONS, { ...state.durations })
}

const same = (a: Track | null, b: Track | null) =>
  a !== null && b !== null && a.path === b.path && a.title === b.title && a.queuePosition === b.queuePosition

let reading: string | null = null
/** Tracks whose cover was already tried in this session (stock may have none). */
const attempted = new Set<string>()

/** Reads the current cover once per track, guarded by reads before and after. */
async function observeCover(session: GatewaySession, track: Track): Promise<void> {
  if (!track.path || state.covers[track.path] || reading !== null || attempted.has(track.path)) return
  reading = track.path
  attempted.add(track.path)
  try {
    const before = parsePlayback(await session.read('0202', 'a202')).track
    if (!same(before, track)) return
    const cover = await currentCover(http)
    const after = parsePlayback(await session.read('0202', 'a202')).track
    if (!cover || !same(after, track) || !track.path) return
    state.covers[track.path] = cover
    await cacheSet(coverKey(track.path), cover)
    if (track.album && !state.albumCovers[track.album]) {
      state.albumCovers[track.album] = track.path
      await cacheSet(ALBUM_COVERS, { ...state.albumCovers })
    }
    const scoped = track.album && track.artist ? scopeKey(track.album, track.artist) : null
    if (scoped && !state.scopedCovers[scoped]) {
      state.scopedCovers[scoped] = track.path
      await cacheSet(SCOPED_COVERS, { ...state.scopedCovers })
    }
  } catch {
    // No association without both reads; try again on the next observation.
  } finally {
    reading = null
  }
}

onSessionOpened((session) => {
  attempted.clear()
  session.onRecord((record) => {
    if (record.tag !== 'a202') return
    let track: Track | null
    try {
      track = parsePlayback(record.payload).track
    } catch {
      return
    }
    if (!track) return
    rememberDuration(track)
    void observeCover(session, track)
  })
})
