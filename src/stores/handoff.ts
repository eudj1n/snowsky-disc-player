/**
 * The switch between the player and this browser (owner, 2026-09-30; plan
 * "switch playback between the player and this browser"). Music moves with
 * its track, position and queue both ways; every step is confirmed by a read
 * and nothing is repeated after an uncertain outcome:
 *
 * - To this browser: the player's queue is read, the file is checked for
 *   this browser, the element starts muted inside the click (browsers that
 *   allow sound only from a click), the player is paused with confirmation,
 *   and only then does the browser sound, from the player's position.
 * - Back to the player: the browser pauses; the player's queue plays from the
 *   same row when it did not change, else the source the browser played
 *   plays from the track; the seek follows the confirmed selection at once
 *   instead of after the 2.1 s pacing, so the track's start is not heard.
 * - The player started by hand while the browser plays pauses the browser
 *   and the switch goes back to the player.
 */
import { watch } from 'vue'
import type { Repeat } from '../domain/browserQueue'
import { queueContext, type PlayContext } from '../domain/history'
import type { Track } from '../domain/track'
import { identityOf, pauseIfPlaying, seek as seekOnce } from '../gateway/controls'
import { resumeTarget } from '../gateway/resume'
import { selectQueueRow } from '../gateway/queue'
import type { SelectionOutcome, SelectionTarget } from '../gateway/selection'
import {
  browserCanPlay,
  browserPlayback,
  browserTrack,
  pauseBrowser,
  playInBrowser,
  primeBrowser,
  stopInBrowser,
  type BrowserOrigin,
} from './browser'
import { browserQueueFor, queueHash } from './browserTargets'
import { http } from './connection'
import { MODE, controlsReady } from './controls'
import { sourceOfContext } from './history'
import { observations } from './observations'
import { run } from './operation'
import { output, setSide, setSwitching } from './output'
import { pairing } from './pairing'
import { playback, refreshPlayback, rememberedPlayback } from './playback'
import { loadQueue, queue, queueCurrent } from './queue'
import { play } from './selection'
import { toast } from './ui'

const repeatOf = (mode: number | null): Repeat =>
  mode === MODE.repeatOne ? 'one' : mode === MODE.repeatList ? 'all' : 'off'

/** The bar's switch: to the other side, carrying what plays. Call it from the click itself. */
export function switchSide(): void {
  if (output.switching) return
  if (output.side === 'disc') toBrowser()
  else void toDisc()
}

function toBrowser(): void {
  const current = playback.current.track
  if (!current) {
    setSide('browser')
    return
  }
  if (!browserCanPlay(current.path)) {
    toast('switch_unsupported', true)
    return
  }
  // Inside the click: a browser that allows sound only from one lets it play once the pause is confirmed.
  primeBrowser(current.path)
  void carryToBrowser(current)
}

/** Where the player stands in the track: its last tick, else what it remembers, else the start. */
function playerPosition(current: Track): number {
  if (observations.positionMs !== null) return observations.positionMs
  const kept = rememberedPlayback.value
  return kept?.track.path === current.path ? (kept.positionMs ?? 0) : 0
}

async function carryToBrowser(current: Track): Promise<void> {
  setSwitching(true)
  try {
    await loadQueue()
    const rows = queue.status === 'ready' ? queue.details : []
    const found = queueCurrent.value ?? rows.findIndex((row) => row?.path === current.path)
    const inQueue = found >= 0 && rows[found]?.path === current.path
    const tracks = inQueue ? rows : [current]
    const index = inQueue ? found : 0
    if (playback.current.state === 'playing') {
      if (!pairing.paired || !controlsReady.value) {
        abortPrime()
        toast('pair_to_control')
        return
      }
      const paused = await run(
        'transport',
        async (context) => {
          await context.pace()
          return pauseIfPlaying(context)
        },
        { wait: true },
      )
      await refreshPlayback()
      if (paused !== 'confirmed' && paused !== 'already') {
        // The player may still play: the browser stays silent (an unconfirmed pause never starts it).
        abortPrime()
        toast('switch_unconfirmed', true)
        return
      }
    }
    const kept = rememberedPlayback.value
    const played: PlayContext | null =
      kept?.track.path === current.path
        ? kept.context
        : queueContext(
            tracks.flatMap((track) => (track?.path ? [track.path] : [])),
            { type: null, album: current.album, artist: current.artist },
          )
    const origin: BrowserOrigin = {
      kind: 'queue',
      hash: queueHash(tracks),
      count: tracks.length,
      source: playback.current.source,
      list: playback.current.list ?? null,
    }
    const started = playInBrowser(tracks, index, played, {
      positionMs: playerPosition(current),
      origin,
      repeat: repeatOf(observations.mode),
    })
    if (started) setSide('browser')
    else abortPrime()
  } finally {
    setSwitching(false)
  }
}

/** The muted start of an aborted switch stops; the browser keeps nothing of it. */
function abortPrime(): void {
  if (!browserTrack.value) stopInBrowser()
}

/** The source to play on the player from the browser's current row. */
function targetFor(origin: BrowserOrigin | null, current: Track, index: number): SelectionTarget | null {
  const key = { title: current.title, artist: current.artist }
  if (origin?.kind === 'target') {
    const target = origin.target
    switch (target.kind) {
      case 'folder': {
        const file = current.path?.split('/').pop()
        return file ? { kind: 'folder', folder: target.folder, file } : null
      }
      case 'list':
        return { ...target, position: index }
      case 'artist':
        // Stock plays a whole artist only from its start: the track continues in its album.
        return current.album
          ? { kind: 'artistAlbum', artist: target.artist, album: current.album, track: key }
          : { kind: 'library', track: key }
      default:
        return { ...target, track: key }
    }
  }
  const context = browserPlayback.context
  if (!context || !current.path) return current.album ? { kind: 'album', album: current.album, track: key } : null
  return resumeTarget(
    {
      track: {
        ...current,
        id: 0,
        fileName: '',
        albumArtist: null,
        genre: null,
        discNumber: null,
        trackNumber: null,
        addedAt: null,
      },
      positionMs: null,
      context,
    },
    sourceOfContext(context),
  )
}

async function toDisc(): Promise<void> {
  const current = browserTrack.value
  if (!current?.path) {
    stopInBrowser()
    setSide('disc')
    return
  }
  if (!pairing.paired || !controlsReady.value) {
    toast('pair_to_control')
    return
  }
  const index = browserPlayback.index
  const positionMs = browserPlayback.position
  const origin = browserPlayback.origin
  const track: Track = {
    title: current.cueTitle ?? current.title,
    artist: current.artist,
    album: current.album,
    path: current.path,
    durationMs: current.durationMs ?? browserPlayback.lengthMs,
    queuePosition: index,
  }
  setSwitching(true)
  pauseBrowser()
  try {
    let outcome: SelectionOutcome | 'confirmed' | 'not-sent' | 'busy' | 'superseded' | 'dropped' | 'no-session'
    await loadQueue()
    const sameQueue =
      origin?.kind === 'queue' &&
      queue.status === 'ready' &&
      queue.items.length === origin.count &&
      queueHash(queue.details) === origin.hash
    if (sameQueue) {
      outcome = await run(
        'queue',
        async (context) => {
          await context.pace()
          return selectQueueRow({ ...context, http }, queue.items, index)
        },
        { wait: true },
      )
      await refreshPlayback()
    } else {
      const target = targetFor(origin, track, index)
      outcome = target ? await play(target) : 'unavailable'
    }
    if (outcome !== 'playing' && outcome !== 'confirmed') {
      if (outcome === 'uncertain') {
        // The player's state is not known: the switch shows the player, the browser stays paused.
        stopInBrowser()
        setSide('disc')
        toast('result_unconfirmed_the_command_was_not_retried', true)
      } else toast(outcome === 'superseded' ? 'waiting_dropped' : 'switch_refused', true)
      return
    }
    stopInBrowser()
    setSide('disc')
    await seekRightAway(positionMs)
  } finally {
    setSwitching(false)
  }
}

/** The seek after the page's own selection goes at once (owner, 2026-09-30), not after the pacing. */
async function seekRightAway(positionMs: number): Promise<void> {
  const displayed = identityOf(playback.current)
  const duration = playback.current.track?.durationMs ?? null
  if (!displayed || positionMs < 2000 || (duration !== null && positionMs >= duration - 1000)) return
  const result = await run(
    'seek',
    (context) => seekOnce(context, displayed, duration, Math.floor(positionMs / 1000) * 1000),
    {
      wait: true,
    },
  )
  if (result !== 'confirmed' && result !== 'already') toast('seek_unconfirmed', true)
}

/**
 * A page source played in this browser (the side is the browser): the same
 * source the player would take, as a queue here. The way back plays that
 * source on the player from the track then playing.
 */
export async function playTargetInBrowser(target: SelectionTarget): Promise<boolean> {
  const found = await browserQueueFor(target)
  if (!found) {
    toast('selection_unavailable', true)
    return false
  }
  return playInBrowser(found.tracks, found.from, found.context, { origin: { kind: 'target', target } })
}

/** The player started by hand while the browser plays: the browser pauses and the switch shows the player. */
watch(
  () => playback.current.state,
  (state) => {
    if (state !== 'playing' || output.side !== 'browser' || output.switching) return
    pauseBrowser()
    setSide('disc')
    toast('switched_to_disc')
  },
)
