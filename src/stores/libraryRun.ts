/**
 * The library enrichment (owner, 2026-10-02): a run goes through the
 * collection's artists, then its albums, by the allowed outside sources. An
 * artist is identified in MusicBrainz, then gets the images the owner's boxes
 * ask for; an album gets its edition, then a cover, then, last, lyrics for its
 * tracks. In automatic mode sure matches are applied at once (an artist named
 * exactly so, scored 100, and alone; an edition scored 95 or more with the
 * album's number of tracks) and doubtful ones wait in "To review" for the end;
 * in manual mode each identification waits for the owner. Every decision is
 * kept on the player with the run that took it and what it wrote, so a closed
 * tab resumes and a run can be undone; "searched, nothing found" is
 * remembered and not asked again. Files for the card (covers, .lrc) are only
 * gathered: they are written after their own review.
 */
import { computed, reactive, readonly, watch } from 'vue'
import { albumScope, albumTracks, stockUnknown, type Album } from '../domain/album'
import { coverPlace, rankReleases } from '../domain/covers'
import { sidecarPath } from '../domain/lyrics'
import { sureArtist, sureEdition } from '../domain/runMatches'
import { frontCover } from '../gateway/coverart'
import { findLyrics } from '../gateway/lrclib'
import { mediaInfo } from '../gateway/media'
import { findReleases, namedExactly, searchArtists } from '../gateway/musicbrainz'
import { deleteRecord, putRecord, readCollection } from '../gateway/store'
import { uploadFile } from '../gateway/upload'
import { artists as libraryArtists, albums as libraryAlbums, tracks } from './library'
import { artistImagesAllowed, chosenImage, forgetArtistImage, hasArtistPhoto, takeArtistImages } from './artistPictures'
import { albumIdentityKey, coverLookupAllowed, coverOnCard } from './coverSearch'
import { connection, http } from './connection'
import { albumCoverState, recheckAlbumCover } from './enrichment'
import { autoImageRole, type ImageRole } from './externalSources'
import { lyricsLookupAllowed } from './lyrics'
import {
  albumIdentity,
  artistFacts,
  artistIdentity,
  chooseArtistCandidate,
  confirmArtist,
  confirmEdition,
  findArtistCandidates,
  findEditions,
  forgetCandidates,
  forgetIdentity,
  identifyAllowed,
  identifying,
} from './musicbrainzIds'
import { run as operation } from './operation'
import { pairingToken } from './pairing'
import { setRunActive } from './runFlag'

export type RunTask = 'artists' | 'albums' | 'covers' | 'images' | 'lyrics'
export type RunMode = 'auto' | 'manual'
export interface RunSettings {
  tasks: RunTask[]
  mode: RunMode
  /** One artist only, else the whole collection. */
  artist: string | null
}
export type Outcome = 'identified' | 'review' | 'missing' | 'skipped'

interface ArtistItem {
  kind: 'artist'
  name: string
}
interface AlbumItem {
  kind: 'album'
  /** The page's album key (the identity's name on the player). */
  name: string
  album: Album
  scope: string | null
  artist: string
  title: string
  trackCount: number
}
export type RunItem = ArtistItem | AlbumItem

export interface LogEntry {
  label: string
  detail: string | null
  outcome: Outcome | 'failed' | 'done'
}

/** A file for the card the run found: written only after the owner's review. */
export interface FileOffer {
  id: number
  kind: 'cover' | 'lyrics'
  /** Card-relative path. */
  path: string
  label: string
  file: Blob
  chosen: boolean
  status: 'new' | 'written' | 'exists' | 'failed'
  album: Album | null
  scope: string | null
}

interface Decision {
  kind: 'artist' | 'album' | 'run'
  name: string
  outcome?: Outcome
  state?: 'running' | 'paused' | 'done' | 'undone'
  run?: string
  wrote?: string[]
  settings?: RunSettings
  at: number
}

export type RunPhase = 'idle' | 'running' | 'paused' | 'waiting' | 'done' | 'writing'

interface RunModel {
  phase: RunPhase
  settings: RunSettings | null
  run: string | null
  /** The run's place: the item under way and how many there are. */
  current: RunItem | null
  step: 'identify' | 'images' | 'cover' | 'lyrics' | null
  index: number
  total: number
  log: LogEntry[]
  review: RunItem[]
  /** Reviewing the doubtful ones after an automatic run. */
  reviewing: boolean
  files: FileOffer[]
  counts: { artists: number; albums: number; review: number; missing: number; skipped: number; images: number }
  /** A run the page found on the player unfinished (a closed tab), to resume or close. */
  interrupted: { run: string; settings: RunSettings } | null
  /** The decisions the player keeps, by kind and name. */
  decisions: Record<string, Decision>
  /** The card release declares the collection. */
  available: boolean
  /** The owner's choice is being kept: the step's buttons wait. */
  confirming: boolean
}

const state = reactive<RunModel>({
  phase: 'idle',
  settings: null,
  run: null,
  current: null,
  step: null,
  index: 0,
  total: 0,
  log: [],
  review: [],
  reviewing: false,
  files: [],
  counts: { artists: 0, albums: 0, review: 0, missing: 0, skipped: 0, images: 0 },
  interrupted: null,
  decisions: {},
  available: false,
  confirming: false,
})
export const libraryRun = readonly(state)
watch(
  () => connection.store,
  (store) => {
    if (store) void loadRuns()
  },
  { immediate: true },
)
/** A run is going or waits for the owner: the Card item shows a dot. */
export const runActive = computed(() => ['running', 'paused', 'waiting', 'writing'].includes(state.phase))
watch(runActive, setRunActive)

const decisionKey = (kind: string, name: string) => `${kind}\u0000${name}`
const now = () => Math.floor(Date.now() / 1000)
let pausing = false
let stopping = false
let fileIds = 0
let waiter: ((outcome: 'identified' | 'skipped') => void) | null = null

/** What may be asked: MusicBrainz for every identification, each source for its own task; the player paired. */
export const runReady = (): boolean => identifyAllowed() && pairingToken() !== null && state.available
export const taskAllowed = (task: RunTask): boolean =>
  task === 'covers'
    ? coverLookupAllowed()
    : task === 'images'
      ? artistImagesAllowed()
      : task === 'lyrics'
        ? lyricsLookupAllowed()
        : identifyAllowed()

/** The images the owner's boxes ask for. */
const wantedRoles = (): ImageRole[] => (['photo', 'background'] as const).filter((role) => autoImageRole(role))
const lacks = (name: string, role: ImageRole) => (role === 'photo' ? !hasArtistPhoto(name) : !chosenImage(name, role))
/** "Searched, nothing found" and the owner's skips are remembered and not asked again. */
const settled = (kind: 'artist' | 'album', name: string) => {
  const outcome = state.decisions[decisionKey(kind, name)]?.outcome
  return outcome === 'missing' || outcome === 'skipped'
}

export async function loadRuns(): Promise<void> {
  if (!connection.store) return
  try {
    const records = await readCollection<Decision>(http, 'enrichment')
    state.available = records !== null
    const decisions: Record<string, Decision> = {}
    for (const { value } of records ?? []) decisions[decisionKey(value.kind, value.name)] = value
    state.decisions = decisions
    const open = Object.values(decisions)
      .filter((value) => value.kind === 'run' && (value.state === 'running' || value.state === 'paused'))
      .sort((a, b) => b.at - a.at)[0]
    state.interrupted = open?.settings && state.phase === 'idle' ? { run: open.name, settings: open.settings } : null
  } catch {
    // The last decisions stay.
  }
}

async function keep(decision: Decision): Promise<void> {
  const token = pairingToken()
  if (!token) return
  const value = Object.fromEntries(Object.entries(decision).filter(([, field]) => field !== undefined))
  const outcome = await putRecord(http, 'enrichment', value, token).catch(() => 'uncertain' as const)
  if (outcome === 'confirmed')
    state.decisions = { ...state.decisions, [decisionKey(decision.kind, decision.name)]: decision }
}

function log(entry: LogEntry): void {
  state.log = [entry, ...state.log].slice(0, 8)
}

/** The run's items: the artists, then the albums, that lack what its tasks bring. */
function itemsFor(settings: RunSettings): RunItem[] {
  const tasks = new Set(settings.tasks)
  const roles = tasks.has('images') ? wantedRoles() : []
  const artistItems: RunItem[] = libraryArtists.value
    .filter((artist) => artist.own && (!settings.artist || artist.name === settings.artist))
    .filter((artist) => {
      const identified = artistIdentity(artist.name) !== null
      const identify = tasks.has('artists') && !identified && !settled('artist', artist.name)
      const images = roles.some((role) => lacks(artist.name, role)) && (identified || identify)
      return identify || images
    })
    .map((artist) => ({ kind: 'artist', name: artist.name }))
  const albumItems: RunItem[] = libraryAlbums.value.flatMap((album): RunItem[] => {
    const scope = albumScope(album)
    const artist = scope ?? album.artists[0]
    if (!artist || stockUnknown(album.title) || stockUnknown(artist)) return []
    if (settings.artist && !album.artists.includes(settings.artist) && !album.trackArtists.includes(settings.artist))
      return []
    const name = albumIdentityKey(album, scope)
    const identified = albumIdentity(name) !== null
    const identify = (tasks.has('albums') || tasks.has('covers')) && !identified && !settled('album', name)
    const cover = tasks.has('covers') && albumCoverState(album, scope) !== 'found' && (identified || identify)
    if (!identify && !cover && !tasks.has('lyrics')) return []
    const trackCount = albumTracks(tracks.value, album.title, scope).length
    return [{ kind: 'album', name, album, scope, artist, title: album.title, trackCount }]
  })
  return [...artistItems, ...albumItems]
}

/** Waits while paused; false once stopping. */
async function going(): Promise<boolean> {
  while (pausing && !stopping) {
    if (state.phase !== 'paused') state.phase = 'paused'
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (state.phase === 'paused') state.phase = 'running'
  return !stopping
}

/** The owner's choice for an identification in manual mode (or a review): the candidates show in the tab. */
function askOwner(item: RunItem): Promise<'identified' | 'skipped'> {
  state.phase = 'waiting'
  if (item.kind === 'artist') void findArtistCandidates(item.name)
  else void findEditions(item.name, item.title, item.artist, item.trackCount)
  return new Promise((resolve) => {
    // Answered once: a late answer (a confirmation that took a while) never reaches the next item's step.
    const answer = (outcome: 'identified' | 'skipped') => {
      if (waiter !== answer) return
      waiter = null
      forgetCandidates()
      state.phase = 'running'
      resolve(outcome)
    }
    waiter = answer
  })
}

/** The owner confirms a candidate the tab shows: an artist or an edition, kept on the player. */
export async function confirmChoice(id: string): Promise<void> {
  const item = state.current
  const answer = waiter
  if (!item || !answer || state.confirming) return
  state.confirming = true
  try {
    if (item.kind === 'artist') {
      const candidate = identifying.artists.find((found) => found.id === id)
      if (!candidate) return
      await chooseArtistCandidate(item.name, { ...candidate, aliases: [...candidate.aliases] })
    } else {
      const release = identifying.editions.find((found) => found.id === id)
      if (!release) return
      await confirmEdition(item.name, release)
    }
    answer('identified')
  } finally {
    state.confirming = false
  }
}
export function skipChoice(): void {
  if (!state.confirming) waiter?.('skipped')
}

async function doArtist(item: ArtistItem, mode: RunMode, tasks: Set<RunTask>): Promise<void> {
  const wrote: string[] = []
  let outcome: Outcome | undefined
  let mbid = artistIdentity(item.name)?.mbid ?? null
  if (!mbid && tasks.has('artists') && !settled('artist', item.name)) {
    state.step = 'identify'
    const found = await searchArtists(item.name)
    const sure = sureArtist(found, (candidate) => namedExactly(candidate, item.name))
    if (mode === 'manual' || (state.reviewing && found.length)) outcome = await askOwner(item)
    else if (sure) {
      await confirmArtist(item.name, sure.id, artistFacts(sure, null))
      outcome = 'identified'
    } else if (found.length) {
      outcome = 'review'
      state.review = [...state.review, item]
    } else outcome = 'missing'
    if (outcome === 'identified') {
      wrote.push('musicbrainz')
      mbid = artistIdentity(item.name)?.mbid ?? null
    }
  }
  const roles = tasks.has('images') ? wantedRoles().filter((role) => lacks(item.name, role)) : []
  if (mbid && roles.length) {
    state.step = 'images'
    const kept = await takeArtistImages(item.name, mbid, roles).catch(() => [])
    wrote.push(...kept)
    state.counts.images += kept.length
  }
  count(outcome, 'artists')
  log({
    label: item.name,
    detail: wrote.filter((what) => what !== 'musicbrainz').join(', ') || null,
    outcome: outcome ?? 'done',
  })
  if (outcome || wrote.length)
    await keep({ kind: 'artist', name: item.name, outcome, run: state.run ?? undefined, wrote, at: now() })
}

async function doAlbum(item: AlbumItem, mode: RunMode, tasks: Set<RunTask>): Promise<void> {
  const wrote: string[] = []
  let outcome: Outcome | undefined
  let identity = albumIdentity(item.name)
  if (!identity && (tasks.has('albums') || tasks.has('covers')) && !settled('album', item.name)) {
    state.step = 'identify'
    if (mode === 'manual' || state.reviewing) outcome = await askOwner(item)
    else {
      const artistId = artistIdentity(item.artist)?.mbid ?? null
      const ranked = rankReleases(
        await findReleases(item.title, item.artist, fetch, artistId),
        item.trackCount,
        item.title,
      )
      const sure = sureEdition(ranked, item.trackCount)
      if (sure) {
        await confirmEdition(item.name, sure)
        outcome = 'identified'
      } else if (ranked.length) {
        outcome = 'review'
        state.review = [...state.review, item]
      } else outcome = 'missing'
    }
    if (outcome === 'identified') {
      wrote.push('musicbrainz')
      identity = albumIdentity(item.name)
    }
  }
  const notes: string[] = []
  if (tasks.has('covers') && identity && albumCoverState(item.album, item.scope) !== 'found' && (await going())) {
    state.step = 'cover'
    const present = await coverOnCard(item.album, item.scope).catch(() => null)
    const place = coverPlace(albumTracks(tracks.value, item.title, item.scope), tracks.value)
    if (present?.kind === 'none' && !('refused' in place)) {
      const cover = await frontCover({ id: identity.mbid, group: identity.group }).catch(() => null)
      if (cover) {
        offer('cover', `${place.folder}/${cover.type === 'image/png' ? 'cover.png' : 'cover.jpg'}`, cover, item)
        notes.push('cover')
      }
    }
  }
  if (tasks.has('lyrics') && (await going())) {
    state.step = 'lyrics'
    let found = 0
    for (const track of albumTracks(tracks.value, item.title, item.scope)) {
      if (!track.path || track.cue || !track.artist || !(await going())) continue
      const target = sidecarPath(track.path)
      const info = target ? await mediaInfo(http, track.path).catch(() => null) : null
      if (!target || !info || info.lyrics) continue
      const lyrics = await findLyrics({
        artist: track.artist,
        title: track.title,
        album: track.album,
        durationMs: track.durationMs,
      }).catch(() => null)
      const text = lyrics?.synced ?? lyrics?.plain
      if (text) {
        offer('lyrics', target, new Blob([text], { type: 'text/plain' }), item, track.title)
        found++
      }
    }
    if (found) notes.push(`lyrics ${String(found)}`)
  }
  count(outcome, 'albums')
  log({ label: item.title, detail: notes.join(', ') || null, outcome: outcome ?? 'done' })
  if (outcome || wrote.length)
    await keep({ kind: 'album', name: item.name, outcome, run: state.run ?? undefined, wrote, at: now() })
}

function offer(kind: FileOffer['kind'], path: string, file: Blob, item: AlbumItem, track?: string): void {
  state.files = [
    ...state.files,
    {
      id: ++fileIds,
      kind,
      path,
      label: track ? `${item.title} · ${track}` : item.title,
      file,
      chosen: true,
      status: 'new',
      album: item.album,
      scope: item.scope,
    },
  ]
}

function count(outcome: Outcome | undefined, kind: 'artists' | 'albums'): void {
  if (outcome === 'identified') state.counts[kind]++
  else if (outcome === 'review') state.counts.review++
  else if (outcome === 'missing') state.counts.missing++
  else if (outcome === 'skipped') state.counts.skipped++
}

async function go(items: RunItem[], mode: RunMode, tasks: Set<RunTask>): Promise<void> {
  state.total = items.length
  for (const [index, item] of items.entries()) {
    if (!(await going())) break
    state.index = index
    state.current = item
    try {
      if (item.kind === 'artist') await doArtist(item, mode, tasks)
      else await doAlbum(item, mode, tasks)
    } catch {
      log({ label: item.kind === 'artist' ? item.name : item.title, detail: null, outcome: 'failed' })
    }
  }
  state.index = state.total
  state.current = null
  state.step = null
}

async function finish(): Promise<void> {
  if (state.run && state.settings)
    await keep({ kind: 'run', name: state.run, state: 'done', settings: state.settings, at: now() })
  state.phase = 'done'
}

/** Starts a run, or resumes the interrupted one (its decided items are passed over). */
export async function startRun(settings: RunSettings, resume: string | null = null): Promise<void> {
  if (!runReady() || runActive.value) return
  pausing = false
  stopping = false
  Object.assign(state, {
    phase: 'running',
    settings: { ...settings, tasks: [...settings.tasks] },
    run: resume ?? `r-${Date.now().toString(36)}`,
    log: [],
    review: [],
    reviewing: false,
    files: [],
    counts: { artists: 0, albums: 0, review: 0, missing: 0, skipped: 0, images: 0 },
    interrupted: null,
  })
  await keep({
    kind: 'run',
    name: state.run as string,
    state: 'running',
    settings: state.settings as RunSettings,
    at: now(),
  })
  const decided = (item: RunItem) => state.decisions[decisionKey(item.kind, item.name)]?.run === resume
  const items = itemsFor(settings).filter((item) => !resume || !decided(item))
  await go(items, settings.mode, new Set(settings.tasks))
  await finish()
}

/** Goes through the doubtful ones of the automatic run, asking the owner for each. */
export async function reviewRun(): Promise<void> {
  if (state.phase !== 'done' || !state.review.length || !state.settings) return
  const items = state.review
  Object.assign(state, { phase: 'running', review: [], reviewing: true })
  state.counts.review = 0
  pausing = false
  stopping = false
  await go([...items], 'manual', new Set(state.settings.tasks))
  state.reviewing = false
  state.phase = 'done'
}

export function pauseRun(): void {
  if (state.phase === 'running') pausing = true
}
export function continueRun(): void {
  pausing = false
}
/** Stops after the step under way; what was done stays (and can be undone). */
export function stopRun(): void {
  stopping = true
  pausing = false
  waiter?.('skipped')
}
/** Closes the report: back to the tab's state. */
export function closeRun(): void {
  if (runActive.value) return
  Object.assign(state, { phase: 'idle', current: null, settings: null, run: null, files: [], review: [], log: [] })
}

/** Closes an interrupted run without resuming it. */
export async function dismissInterrupted(): Promise<void> {
  const open = state.interrupted
  if (!open) return
  await keep({ kind: 'run', name: open.run, state: 'done', settings: open.settings, at: now() })
  state.interrupted = null
}

/** Undoes a run: forgets what it wrote on the player (identities, image choices) and its decisions. */
export async function undoRun(): Promise<boolean> {
  const runId = state.run
  const token = pairingToken()
  if (!runId || !token || runActive.value) return false
  state.phase = 'writing'
  let complete = true
  try {
    for (const decision of Object.values(state.decisions)) {
      if (decision.run !== runId || decision.kind === 'run') continue
      for (const what of decision.wrote ?? []) {
        if (what === 'musicbrainz') complete = (await forgetIdentity(decision.kind, decision.name)) && complete
        else if (what === 'photo' || what === 'background') await forgetArtistImage(decision.name, what)
      }
      const outcome = await deleteRecord(http, 'enrichment', { kind: decision.kind, name: decision.name }, token).catch(
        () => 'uncertain' as const,
      )
      const gone = decisionKey(decision.kind, decision.name)
      if (outcome === 'confirmed')
        state.decisions = Object.fromEntries(Object.entries(state.decisions).filter(([key]) => key !== gone))
      else complete = false
    }
    if (state.settings) await keep({ kind: 'run', name: runId, state: 'undone', settings: state.settings, at: now() })
    state.files = []
    return complete
  } finally {
    state.phase = 'done'
  }
}

export function chooseFile(id: number, chosen: boolean): void {
  state.files = state.files.map((file) => (file.id === id ? { ...file, chosen } : file))
}

/** Writes the chosen files onto the card, one guarded upload each; nothing is overwritten. */
export async function writeFiles(): Promise<void> {
  const token = pairingToken()
  if (!token || state.phase !== 'done') return
  state.phase = 'writing'
  try {
    for (const file of state.files.filter((item) => item.chosen && item.status === 'new')) {
      const outcome = await operation('upload', async (context) => {
        await context.pace()
        context.guard()
        context.attempted()
        return uploadFile({ file: file.file, path: file.path, token })
      }).catch(() => 'not-sent' as const)
      const status: FileOffer['status'] =
        outcome === 'confirmed' ? 'written' : outcome === 'exists' ? 'exists' : 'failed'
      state.files = state.files.map((item) => (item.id === file.id ? { ...item, status } : item))
      if (status === 'written' && file.kind === 'cover' && file.album) await recheckAlbumCover(file.album, file.scope)
    }
  } finally {
    state.phase = 'done'
  }
}
