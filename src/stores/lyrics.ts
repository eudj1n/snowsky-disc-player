/**
 * Lyrics of the current track. The file's own come first (a same-stem .lrc
 * or the embedded text, through the gateway's media routes). Otherwise the
 * text stock prepared for the current track is used, but only when it was
 * written after this track started: stock rewrites that file a few seconds
 * into a track with lyrics and leaves it unchanged for a track without.
 */
import { reactive, readonly, watch } from 'vue'
import { parseLyrics, type Lyrics } from '../domain/lyrics'
import { currentLyrics, mediaLyrics, type LyricsSource } from '../gateway/media'
import { connection, http } from './connection'
import { observations } from './observations'
import { playback } from './playback'

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'none' | 'unavailable'

interface LyricsModel {
  path: string | null
  status: LyricsStatus
  lyrics: Lyrics | null
  source: LyricsSource | null
}

const state = reactive<LyricsModel>({ path: null, status: 'idle', lyrics: null, source: null })
export const lyrics = readonly(state)

/** Pauses before asking for stock's file again after a track change. */
const PLAYER_POLLS_MS = [1500, 3000, 5000]
let request = 0
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

function settle(text: string, source: LyricsSource): void {
  const parsed = parseLyrics(text)
  state.lyrics = parsed.lines.length ? parsed : null
  state.source = parsed.lines.length ? source : null
  state.status = parsed.lines.length ? 'ready' : 'none'
}

async function load(path: string | null, media: boolean): Promise<void> {
  const current = ++request
  state.path = path
  state.lyrics = null
  state.source = null
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
  const startedAt = Date.now() - (observations.positionMs ?? 0)
  try {
    const own = await mediaLyrics(http, path)
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
}

watch(
  () => [playback.current.track?.path ?? null, connection.media] as const,
  ([path, media], previous) => {
    if (previous && previous[0] === path && previous[1] === media) return
    void load(path, media)
  },
  { immediate: true },
)
