/**
 * Lyrics of the current track. The file's own come first (a same-stem .lrc
 * or the embedded text, through the gateway's media routes). Otherwise the
 * text stock prepared for the current track is used, but only when it was
 * written after this track started: stock rewrites that file a few seconds
 * into a track with lyrics and leaves it unchanged for a track without.
 *
 * A track whose lyrics could be better (none at all; plain text without
 * timings in its tags, its .lrc or stock's file; or, for lrc.red, lines
 * without word timings) can be looked up online (owner, 2026-09-29,
 * enrichment step 1; lrc.red with its word timings 2026-10-20) when the
 * release's origins admit a source and the owner allowed it among the
 * outside sources (2026-10-01; off by default, since the track's names leave
 * the network): on the listener's request, or for every such track when the
 * source is also set to work automatically. Each source is asked only when
 * it could improve the track: LRCLIB has no word timings, so it is not asked
 * for a track with line timings. What was found is shown as not yet on the
 * card until the listener saves it beside the track as its .lrc, through
 * the upload route, which never overwrites; a .lrc already there goes to
 * the service's trash instead (reversible). The media route reads a .lrc
 * before the tags, so a saved file wins over lyrics embedded in the file.
 */
import { reactive, readonly, watch } from 'vue'
import { lyricsLevel, parseLyrics, sidecarPath, type Lyrics, type LyricsLevel } from '../domain/lyrics'
import { trackKey } from '../domain/track'
import { findLyricsOnline, ONLINE_LYRICS_SOURCES, type OnlineLyricsSource } from '../gateway/lyricsOnline'
import { currentLyrics, mediaLyrics, type LyricsSource } from '../gateway/media'
import { uploadFile } from '../gateway/upload'
import { connection, http, originAllowed } from './connection'
import { sourceAllowed, sourceAutomatic } from './externalSources'
import { run } from './operation'
import { pairingToken } from './pairing'
import { nowPlaying, nowPositionMs } from './output'
import { toast } from './ui'

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'none' | 'unavailable'
/** An online lookup for the current track: `missing-synced` and `missing-words` say what the sources lacked. */
export type LyricsLookup =
  'idle' | 'searching' | 'missing' | 'missing-synced' | 'missing-words' | 'instrumental' | 'failed'

interface LyricsModel {
  path: string | null
  status: LyricsStatus
  lyrics: Lyrics | null
  source: LyricsSource | OnlineLyricsSource | null
  lookup: LyricsLookup
  saving: boolean
  /** What the found lyrics stand in for: none, or the track's own lyrics from this source. */
  replaced: LyricsSource | null
  /** The sources that could not be reached by the last lookup. */
  failed: OnlineLyricsSource[]
}

const state = reactive<LyricsModel>({
  path: null,
  status: 'idle',
  lyrics: null,
  source: null,
  lookup: 'idle',
  saving: false,
  replaced: null,
  failed: [],
})
/** The LRC text found online for the current track, kept for saving it. */
let found: string | null = null
/** Lyrics from an outside source, not on the card. */
export const isOnline = (source: LyricsModel['source']): source is OnlineLyricsSource =>
  source === 'lrclib' || source === 'lrcred'
export const lyrics = readonly(state)

/** Pauses before asking for stock's file again after a track change. */
const PLAYER_POLLS_MS = [1500, 3000, 5000]
let request = 0
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

function settle(text: string, source: LyricsSource | OnlineLyricsSource): void {
  const parsed = parseLyrics(text)
  state.lyrics = parsed.lines.length ? parsed : null
  state.source = parsed.lines.length ? source : null
  state.status = parsed.lines.length ? 'ready' : 'none'
}

async function load(path: string | null, media: boolean, cue: boolean): Promise<void> {
  const current = ++request
  state.path = path
  state.lyrics = null
  state.source = null
  state.lookup = 'idle'
  state.replaced = null
  state.failed = []
  found = null
  if (!path) {
    state.status = 'idle'
    return
  }
  if (!media) {
    state.status = 'unavailable'
    return
  }
  state.status = 'loading'
  // When the track started: from the observed position if known, else now.
  const startedAt = Date.now() - (nowPositionMs.value ?? 0)
  try {
    // A CUE track's file holds the whole sheet: its .lrc or embedded text would
    // be timed from the file's start, so only stock's own lyrics are used.
    const own = cue ? null : await mediaLyrics(http, path)
    if (current !== request) return
    if (own) {
      settle(own.text, own.source)
      return
    }
    for (const pause of PLAYER_POLLS_MS) {
      await sleep(pause)
      if (current !== request) return
      const prepared = await currentLyrics(http)
      if (current !== request) return
      if (prepared && prepared.ageSeconds <= (Date.now() - startedAt) / 1000 + 1) {
        settle(prepared.text, 'player')
        return
      }
    }
    state.status = 'none'
  } catch {
    if (current === request) state.status = 'none'
  }
  if (current === request && lyricsLookupAutomatic()) void lookUpLyrics()
}

/** The level of the track's own lyrics: null when it has none (or nothing is known yet). */
export function ownLyricsLevel(): LyricsLevel | null {
  if (state.status === 'none') return null
  if (state.status !== 'ready' || !state.lyrics || isOnline(state.source)) return 'none'
  return lyricsLevel(state.lyrics)
}
/** The track's own lyrics are plain text without timings (owner, 2026-09-29: still offer synced ones). */
export const plainLyricsOnly = (): boolean => ownLyricsLevel() === 'none' && state.status === 'ready'
/** The least a lookup must bring to be worth offering, or null when nothing could improve the track. */
export function wantedLevel(): LyricsLevel | null {
  const own = ownLyricsLevel()
  if (own === null) return 'none'
  if (state.status !== 'ready') return null
  return own === 'none' ? 'line' : own === 'line' ? 'word' : null
}
/** What each source can bring at most: LRCLIB has no word timings. */
const BRINGS: Record<OnlineLyricsSource, LyricsLevel> = { lrcred: 'word', lrclib: 'line' }
const RANK: Record<LyricsLevel, number> = { none: 0, line: 1, word: 2 }

/** The release's origins admit the source. */
export const lyricsSourceAdmitted = (name: OnlineLyricsSource): boolean => originAllowed(name)
/** The sources the owner allowed and the release admits (the library enrichment, 2026-10-02). */
export const allowedLyricsSources = (): OnlineLyricsSource[] =>
  ONLINE_LYRICS_SOURCES.filter((name) => sourceAllowed(name) && lyricsSourceAdmitted(name))
/** Some lyrics source may be asked at all. */
export const lyricsLookupAllowed = (): boolean => allowedLyricsSources().length > 0

/** The admitted sources that could improve the current track. */
export function fittingLyricsSources(): OnlineLyricsSource[] {
  const track = nowPlaying.value.track
  const want = wantedLevel()
  if (!track?.path || track.cue || !track.artist || want === null) return []
  return ONLINE_LYRICS_SOURCES.filter((name) => lyricsSourceAdmitted(name) && RANK[BRINGS[name]] >= RANK[want])
}
/** The current track could take online lyrics: some admitted source could improve it. */
export const lyricsLookupFits = (): boolean => fittingLyricsSources().length > 0
/** The fitting sources the owner allowed: what a lookup asks. */
export const lookupLyricsSources = (): OnlineLyricsSource[] =>
  fittingLyricsSources().filter((name) => sourceAllowed(name))
/** A lookup can be made for the current track: it fits and the owner allowed a source for it. */
export const lyricsLookupAvailable = (): boolean => lookupLyricsSources().length > 0
/** A lookup runs without a click: some source that would be asked is set to work automatically. */
const lyricsLookupAutomatic = (): boolean => lookupLyricsSources().some((name) => sourceAutomatic(name))

/** Looks the current track up at the allowed sources (its artist, title, album and length leave the network). */
export async function lookUpLyrics(): Promise<void> {
  const track = nowPlaying.value.track
  const sources = lookupLyricsSources()
  const want = wantedLevel()
  if (!sources.length || want === null || !track?.artist || state.lookup === 'searching') return
  const current = request
  state.lookup = 'searching'
  state.failed = []
  const result = await findLyricsOnline(
    { artist: track.artist, title: track.title, album: track.album, durationMs: track.durationMs },
    sources,
    want,
  )
  if (current !== request) return
  state.failed = result.failed
  if (!result.found) {
    state.lookup =
      result.failed.length === sources.length
        ? 'failed'
        : result.instrumental
          ? 'instrumental'
          : want === 'word'
            ? 'missing-words'
            : want === 'line'
              ? 'missing-synced'
              : 'missing'
    return
  }
  // The found lyrics stand in for the track's own, which the save replaces when they are a card file.
  state.replaced = state.status === 'ready' && !isOnline(state.source) ? state.source : null
  found = result.found.text
  settle(result.found.text, result.found.source)
  state.lookup = 'idle'
}

// Set to work automatically while a track waits for better lyrics: it is looked up at once.
watch(
  () => ONLINE_LYRICS_SOURCES.map((name) => sourceAutomatic(name)).join(),
  () => {
    if (state.lookup === 'idle' && lyricsLookupAutomatic()) void lookUpLyrics()
  },
)

/**
 * Saves what was found online beside the track as its .lrc: one guarded
 * upload (the player's serial number, a fresh request ID, pacing); a .lrc
 * already there goes to the service's trash, anything else is never
 * overwritten; a lost reply is not retried.
 */
export async function saveFoundLyrics(): Promise<void> {
  const track = nowPlaying.value.track
  const target = track?.path ? sidecarPath(track.path) : null
  const token = pairingToken()
  if (!found || !target || !isOnline(state.source) || state.saving) return
  if (!token) {
    toast('pair_to_control', true)
    return
  }
  const text = found
  const current = request
  const replaces = state.replaced === 'sidecar'
  state.saving = true
  try {
    const outcome = await run('upload', async (context) => {
      await context.pace()
      context.guard()
      context.attempted()
      return uploadFile({
        file: new Blob([text], { type: 'text/plain' }),
        path: target,
        token,
        ...(replaces ? { replace: 'trash' as const } : {}),
      })
    }).catch(() => 'not-sent' as const)
    if (outcome === 'confirmed') {
      if (current === request) state.source = 'sidecar'
      toast('lyrics_saved')
    } else if (outcome === 'exists') toast('lyrics_save_exists', true)
    else if (outcome === 'busy') toast('please_wait_for_the_current_request')
    else if (outcome === 'no-session') toast('pair_to_control', true)
    else if (outcome === 'uncertain') toast('result_unconfirmed_the_command_was_not_retried', true)
    else toast('lyrics_save_failed', true)
  } finally {
    state.saving = false
  }
}

/**
 * A track's own lyrics (a same-stem .lrc or its tags), for the track panel (2026-09-30): read
 * once when it opens, never looked up elsewhere. Null when it has none; 'unavailable' when the
 * service has no media routes. A CUE track's file holds the whole sheet: nothing of its own.
 */
export async function ownLyrics(track: {
  path: string | null
  cue?: boolean
}): Promise<{ lyrics: Lyrics; source: LyricsSource } | null | 'unavailable'> {
  if (!connection.media) return 'unavailable'
  if (!track.path || track.cue) return null
  try {
    const own = await mediaLyrics(http, track.path)
    const parsed = own ? parseLyrics(own.text) : null
    return own && parsed?.lines.length ? { lyrics: parsed, source: own.source } : null
  } catch {
    return null
  }
}

// Keyed by trackKey: moving between a CUE sheet's tracks keeps the file but changes the track.
watch(
  () => [nowPlaying.value.track ? trackKey(nowPlaying.value.track) : null, connection.media] as const,
  ([key, media], previous) => {
    if (previous && previous[0] === key && previous[1] === media) return
    const track = nowPlaying.value.track
    void load(track?.path ?? null, media, track?.cue === true)
  },
  { immediate: true },
)
