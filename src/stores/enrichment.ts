/**
 * Observations the stock library database lacks, learned while listening
 * (reference Library enrichment): durations and cover images of tracks that
 * played. Kept in IndexedDB per track path. A cover is associated only when
 * the same track is observed immediately before and after the image read;
 * decorative sleeves are never stored.
 *
 * With the gateway's media routes (service combined-006) the whole collection
 * gets covers and durations from the files themselves: one cover read per
 * album scope (its first member's embedded or folder cover), one metadata
 * read per track without a duration, two at a time in the background. Misses
 * are remembered for a week so they are not asked again on every load.
 *
 * The card space view asks for every file's size and format the same way
 * (one metadata read per file, remembered until measured again).
 */
import { reactive, readonly } from 'vue'
import type { FileFacts } from '../domain/space'
import type { Track } from '../domain/track'
import { currentCover } from '../gateway/artwork'
import { mediaCover, mediaInfo } from '../gateway/media'
import { currentPlayback, readPlayback } from '../gateway/playback'
import type { GatewaySession } from '../gateway/session'
import { cacheGet, cacheSet } from '../lib/idb'
import { connection, http, onSessionOpened } from './connection'
import { playerOptions } from './playerOptions'

interface EnrichmentModel {
  durations: Record<string, number>
  /** Track path → cover image. */
  covers: Record<string, Blob>
  /** Album title → path of a member with a cover. */
  albumCovers: Record<string, string>
  /** Album title scoped by a literal track artist → path of a member with a cover. */
  scopedCovers: Record<string, string>
  /** Track path → the year of its DATE tag. */
  years: Record<string, number>
  /** Track path → sample rate and bit depth read from the file. */
  qualities: Record<string, { sampleRate: number; bitDepth: number | null; bitRate?: number | null }>
  /** Track path → its size and format as measured (card space view). */
  files: Record<string, FileFacts>
  /** Track path → when the media route last gave no size for it (gone or unreadable). */
  unmeasured: Record<string, number>
  /** Metadata reads queued or under way. */
  pending: number
}

const state = reactive<EnrichmentModel>({
  durations: {},
  covers: {},
  albumCovers: {},
  scopedCovers: {},
  years: {},
  qualities: {},
  files: {},
  unmeasured: {},
  pending: 0,
})
export const enrichment = readonly(state)

const DURATIONS = 'enrichment:durations'
const ALBUM_COVERS = 'enrichment:album-covers'
const SCOPED_COVERS = 'enrichment:scoped-album-covers'
const scopeKey = (title: string, artist: string) => JSON.stringify([title, artist])
const coverKey = (path: string) => `cover:${path}`
const NO_COVER = 'enrichment:no-cover'
const NO_DURATION = 'enrichment:no-duration'
const YEARS = 'enrichment:years'
const NO_YEAR = 'enrichment:no-year'
const QUALITIES = 'enrichment:qualities'
const NO_QUALITY = 'enrichment:no-quality'
const FILES = 'enrichment:files'
const NO_SIZE = 'enrichment:no-size'
const RECHECK_MS = 7 * 86_400_000
let noCover: Record<string, number> = {}
let noDuration: Record<string, number> = {}
let noYear: Record<string, number> = {}
let noQuality: Record<string, number> = {}

export async function loadEnrichment(): Promise<void> {
  state.durations = (await cacheGet<Record<string, number>>(DURATIONS)) ?? {}
  state.albumCovers = (await cacheGet<Record<string, string>>(ALBUM_COVERS)) ?? {}
  state.scopedCovers = (await cacheGet<Record<string, string>>(SCOPED_COVERS)) ?? {}
  noCover = (await cacheGet<Record<string, number>>(NO_COVER)) ?? {}
  noDuration = (await cacheGet<Record<string, number>>(NO_DURATION)) ?? {}
  state.years = (await cacheGet<Record<string, number>>(YEARS)) ?? {}
  noYear = (await cacheGet<Record<string, number>>(NO_YEAR)) ?? {}
  state.qualities = (await cacheGet<EnrichmentModel['qualities']>(QUALITIES)) ?? {}
  noQuality = (await cacheGet<Record<string, number>>(NO_QUALITY)) ?? {}
  state.files = (await cacheGet<Record<string, FileFacts>>(FILES)) ?? {}
  state.unmeasured = (await cacheGet<Record<string, number>>(NO_SIZE)) ?? {}
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
  if (!track.album) {
    if (track.path) wantCover(track.path, track.path, null)
    return null
  }
  const key = track.artist ? scopeKey(track.album, track.artist) : null
  const scoped = key ? state.scopedCovers[key] : undefined
  const legacy = state.albumCovers[track.album]
  const member = scoped ?? (legacy && track.path && folderOf(legacy) === folderOf(track.path) ? legacy : undefined)
  const cover = member ? (state.covers[member] ?? null) : null
  if (!cover && track.path) wantCover(key ?? track.path, track.path, { title: track.album, key })
  return cover
}

/* Background media reads: covers first, then durations, two at a time. */
const coverTasks: (() => Promise<void>)[] = []
const durationTasks: (() => Promise<void>)[] = []
let running = 0
function pump(): void {
  while (running < 2) {
    const task = coverTasks.shift() ?? durationTasks.shift()
    if (!task) return
    running++
    void task().finally(() => {
      running--
      pump()
    })
  }
}
const pendingCovers = new Set<string>()
const recent = (miss: number | undefined) => miss !== undefined && Date.now() - miss < RECHECK_MS

/** Queues one cover read for an album scope (or a lone track), unless known or recently missing. */
function wantCover(key: string, path: string, album: { title: string; key: string | null } | null): void {
  if (!connection.media || pendingCovers.has(key) || recent(noCover[key])) return
  pendingCovers.add(key)
  coverTasks.push(async () => {
    try {
      const blob = await mediaCover(http, path)
      if (!blob) {
        noCover[key] = Date.now()
        await cacheSet(NO_COVER, { ...noCover })
        return
      }
      state.covers[path] = blob
      await cacheSet(coverKey(path), blob)
      if (album?.key && !state.scopedCovers[album.key]) {
        state.scopedCovers[album.key] = path
        await cacheSet(SCOPED_COVERS, { ...state.scopedCovers })
      }
      if (album && !state.albumCovers[album.title]) {
        state.albumCovers[album.title] = path
        await cacheSet(ALBUM_COVERS, { ...state.albumCovers })
      }
    } catch {
      // Not remembered as missing: a later page load asks again.
    } finally {
      pendingCovers.delete(key)
    }
  })
  pump()
}

const pendingInfo = new Set<string>()
let found: Record<string, number> = {}
let foundYears: Record<string, number> = {}
let foundQualities: EnrichmentModel['qualities'] = {}
let foundFiles: Record<string, FileFacts> = {}
let missedFiles: Record<string, number> = {}
let flush: ReturnType<typeof setTimeout> | undefined
function saveInfo(): void {
  flush = undefined
  Object.assign(state.durations, found)
  Object.assign(state.years, foundYears)
  Object.assign(state.qualities, foundQualities)
  Object.assign(state.files, foundFiles)
  Object.assign(state.unmeasured, missedFiles)
  found = {}
  foundYears = {}
  foundQualities = {}
  foundFiles = {}
  missedFiles = {}
  void cacheSet(DURATIONS, { ...state.durations })
  void cacheSet(NO_DURATION, { ...noDuration })
  void cacheSet(YEARS, { ...state.years })
  void cacheSet(NO_YEAR, { ...noYear })
  void cacheSet(QUALITIES, { ...state.qualities })
  void cacheSet(NO_QUALITY, { ...noQuality })
  void cacheSet(FILES, { ...state.files })
  void cacheSet(NO_SIZE, { ...state.unmeasured })
}

/** One metadata read of a file: its duration and the year of its tags, whichever are missing. */
function wantInfo(path: string): void {
  if (pendingInfo.has(path)) return
  pendingInfo.add(path)
  state.pending++
  durationTasks.push(async () => {
    try {
      const info = await mediaInfo(http, path)
      if (info && info.bytes > 0)
        foundFiles[path] = {
          bytes: info.bytes,
          format: info.format,
          sampleRate: info.sampleRate,
          bitDepth: info.bitDepth,
          bitRate: info.bitRate,
        }
      // No size (the file is gone or unreadable): not asked again on every visit to Space.
      else missedFiles[path] = Date.now()
      if (info?.durationMs) found[path] = info.durationMs
      else noDuration[path] = Date.now()
      if (info?.year) foundYears[path] = info.year
      else noYear[path] = Date.now()
      if (info?.sampleRate)
        foundQualities[path] = { sampleRate: info.sampleRate, bitDepth: info.bitDepth, bitRate: info.bitRate }
      else noQuality[path] = Date.now()
    } catch {
      // Asked again on a later load.
    } finally {
      pendingInfo.delete(path)
      state.pending--
      // Batched, so lists re-render once per second, not once per track.
      flush ??= setTimeout(saveInfo, 1000)
    }
  })
  pump()
}

/**
 * Queues metadata reads for tracks the database gives no duration. A CUE
 * track is left out: its file holds the whole sheet, so the file's length is
 * not the track's.
 */
export function wantDurations(tracks: readonly Pick<Track, 'path' | 'durationMs' | 'cue'>[]): void {
  if (!connection.media) return
  for (const track of tracks) {
    const path = track.path
    if (!path || track.cue || track.durationMs !== null || state.durations[path] || recent(noDuration[path])) continue
    wantInfo(path)
  }
}

/** The media route gave no size for this file within the last week (owner, 2026-09-29). */
export const sizeUnreadable = (path: string): boolean => recent(state.unmeasured[path])

/**
 * Queues a metadata read for every track whose file is not measured yet (card
 * space). A file the route gave no size for is asked again after a week, not
 * on every visit.
 */
export function wantSizes(tracks: readonly Pick<Track, 'path'>[]): void {
  if (!connection.media) return
  for (const track of tracks)
    if (track.path && !state.files[track.path] && !sizeUnreadable(track.path)) wantInfo(track.path)
}

/** Forgets the measured (and unreadable) files so the card space view reads them again. */
export async function forgetSizes(): Promise<void> {
  state.files = {}
  state.unmeasured = {}
  await cacheSet(FILES, {})
  await cacheSet(NO_SIZE, {})
}

/**
 * The quality of a release: its first member's sample rate and bit depth
 * (FLAC and WAV through the media route; MP3 and AAC with the next image).
 * Read with the year, so asking for both costs one request.
 */
export function albumQuality(
  album: { paths?: Readonly<Record<string, string>> },
  artist: string | null = null,
): { path: string; sampleRate: number; bitDepth: number | null; bitRate?: number | null } | null {
  const path = album.paths?.[artist ?? ''] ?? album.paths?.['']
  if (!path) return null
  const quality = state.qualities[path]
  if (quality) return { path, ...quality }
  if (connection.media && !recent(noQuality[path])) wantInfo(path)
  return null
}

/**
 * The year of a release: its first member's DATE tag (stock keeps no year).
 * Read once per album scope, like its cover; files without a DATE tag (every
 * MP3 and AAC until the gateway reads their tags) are asked again after a week.
 */
export function albumYear(
  album: { paths?: Readonly<Record<string, string>> },
  artist: string | null = null,
): number | null {
  const path = album.paths?.[artist ?? ''] ?? album.paths?.['']
  if (!path) return null
  const year = state.years[path]
  if (year) return year
  if (connection.media && !recent(noYear[path])) wantInfo(path)
  return null
}

/**
 * The cover of a title group, or of one artist's release in it. A title-only
 * association (kept from earlier sessions) is used for a scope only when the
 * title has a single track artist, so homonymous albums never share a cover.
 */
export function albumCover(
  album: { title: string; trackArtists: readonly string[]; paths?: Readonly<Record<string, string>> },
  artist: string | null = null,
): Blob | null {
  const member = artist
    ? (state.scopedCovers[scopeKey(album.title, artist)] ??
      (album.trackArtists.length <= 1 ? state.albumCovers[album.title] : undefined))
    : state.albumCovers[album.title]
  const cover = member ? (state.covers[member] ?? null) : null
  // Media: read the scope's first member's cover (embedded or folder) once.
  const path = album.paths?.[artist ?? ''] ?? album.paths?.['']
  if (!cover && path) {
    const key = artist ? scopeKey(album.title, artist) : JSON.stringify([album.title])
    wantCover(key, path, { title: album.title, key: artist ? key : null })
  }
  return cover
}

/**
 * Whether a release's cover is known, without reading anything: found before
 * (kept in this browser), recently missing, or not asked yet.
 */
export function albumCoverState(
  album: { title: string; trackArtists: readonly string[] },
  artist: string | null = null,
): 'found' | 'missing' | 'unknown' {
  const member = artist
    ? (state.scopedCovers[scopeKey(album.title, artist)] ??
      (album.trackArtists.length <= 1 ? state.albumCovers[album.title] : undefined))
    : state.albumCovers[album.title]
  if (member) return 'found'
  const key = artist ? scopeKey(album.title, artist) : JSON.stringify([album.title])
  return recent(noCover[key]) ? 'missing' : 'unknown'
}

function rememberDuration(track: Track): void {
  // A CUE track's duration belongs to the track, not to the file it shares.
  if (!track.path || track.cue || !track.durationMs || state.durations[track.path] === track.durationMs) return
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
  // With online covers on, stock's current cover may be an iTunes guess: never keep it as the album's.
  if (playerOptions.onlineCovers) return
  if (!track.path || state.covers[track.path] || reading !== null || attempted.has(track.path)) return
  reading = track.path
  attempted.add(track.path)
  try {
    const before = (await readPlayback(session)).track
    if (!same(before, track)) return
    const cover = await currentCover(http)
    const after = (await readPlayback(session)).track
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
    const track: Track | null = currentPlayback(session).track
    if (!track) return
    rememberDuration(track)
    void observeCover(session, track)
  })
})
