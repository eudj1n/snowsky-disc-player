/**
 * Outside sources (owner, 2026-10-01): each one the page may ask for lyrics,
 * album covers or artist images is off until the owner allows it in
 * Settings, and asked without a click only when also set to work
 * automatically. The choice is kept on the player (the store's
 * `external_sources` collection), so every browser follows it; a change
 * needs the pairing serial number and is confirmed by the service's reply.
 * Without the collection (an older card release) every source stays off.
 * MusicBrainz is a source of its own (owner, 2026-10-01): the sources that
 * find what they bring by its ids work only while it is allowed too. The
 * release's reviewed origins still decide whether a source can be reached
 * at all.
 */
import { reactive, readonly, watch } from 'vue'
import { putRecord, readCollection } from '../gateway/store'
import { connection, http } from './connection'
import { pairingToken } from './pairing'
import { toast } from './ui'

/** What a source brings; Settings groups the sources by it. */
export type SourceKind = 'metadata' | 'lyrics' | 'album_covers' | 'artist_images'
export type SourceName = 'musicbrainz' | 'lrclib' | 'coverartarchive' | 'wikimedia'

export interface SourceInfo {
  name: SourceName
  kind: SourceKind
  /** The source's own name, never translated. */
  title: string
  site: string
  /** Sources it cannot work without. */
  needs: readonly SourceName[]
  /** It can be asked without a click; a source used only through others cannot. */
  automatic: boolean
}

export const SOURCES: readonly SourceInfo[] = [
  {
    name: 'musicbrainz',
    kind: 'metadata',
    title: 'MusicBrainz',
    site: 'https://musicbrainz.org',
    needs: [],
    automatic: false,
  },
  { name: 'lrclib', kind: 'lyrics', title: 'LRCLIB', site: 'https://lrclib.net', needs: [], automatic: true },
  {
    name: 'coverartarchive',
    kind: 'album_covers',
    title: 'Cover Art Archive',
    site: 'https://coverartarchive.org',
    needs: ['musicbrainz'],
    automatic: true,
  },
  {
    name: 'wikimedia',
    kind: 'artist_images',
    title: 'Wikimedia Commons',
    site: 'https://commons.wikimedia.org',
    needs: ['musicbrainz'],
    automatic: true,
  },
]
export const SOURCE_KINDS: readonly SourceKind[] = ['metadata', 'lyrics', 'album_covers', 'artist_images']
const info = (name: SourceName): SourceInfo => SOURCES.find((source) => source.name === name) as SourceInfo

export interface SourceChoice {
  allowed: boolean
  auto: boolean
}
interface SourceRecord {
  source: string
  allowed?: boolean
  auto?: boolean
  at: number
}

interface SourcesModel {
  choices: Partial<Record<SourceName, SourceChoice>>
  /** The card release declares the collection. */
  available: boolean
  /** The source whose change waits for the player's reply. */
  busy: SourceName | null
}

const state = reactive<SourcesModel>({ choices: {}, available: false, busy: null })
export const externalSources = readonly(state)

const known = (name: string): name is SourceName => SOURCES.some((source) => source.name === name)

/** The sources a source needs that are not allowed now. */
export const missingNeeds = (name: SourceName): SourceName[] =>
  info(name).needs.filter((need) => state.choices[need]?.allowed !== true)
/** The owner allowed the source and what it needs (the release's origins are checked by its own module). */
export const sourceAllowed = (name: SourceName): boolean =>
  state.choices[name]?.allowed === true && missingNeeds(name).length === 0
/** The source may be asked without a click. */
export const sourceAutomatic = (name: SourceName): boolean =>
  info(name).automatic && sourceAllowed(name) && state.choices[name]?.auto === true

export async function loadExternalSources(): Promise<void> {
  if (!connection.store) return
  try {
    const records = await readCollection<SourceRecord>(http, 'external_sources')
    state.available = records !== null
    const choices: SourcesModel['choices'] = {}
    for (const { value } of records ?? [])
      if (known(value.source)) choices[value.source] = { allowed: value.allowed === true, auto: value.auto === true }
    state.choices = choices
  } catch {
    // Unreachable for now: the last choice stays.
  }
}
watch(
  () => connection.store,
  (store) => {
    if (store) void loadExternalSources()
  },
  { immediate: true },
)

/** Allows or stops a source, or lets it work automatically; stopping it stops the automatic use too. */
export async function chooseSource(name: SourceName, change: Partial<SourceChoice>): Promise<void> {
  const token = pairingToken()
  if (!token) {
    toast('pair_to_control', true)
    return
  }
  if (state.busy) {
    toast('please_wait_for_the_current_request')
    return
  }
  const current = state.choices[name] ?? { allowed: false, auto: false }
  const allowed = change.allowed ?? current.allowed
  const next: SourceChoice = { allowed, auto: allowed && info(name).automatic && (change.auto ?? current.auto) }
  state.busy = name
  try {
    const outcome = await putRecord(
      http,
      'external_sources',
      { source: name, allowed: next.allowed, auto: next.auto, at: Math.floor(Date.now() / 1000) },
      token,
    )
    if (outcome === 'confirmed') state.choices = { ...state.choices, [name]: next }
    else toast('result_unconfirmed_the_command_was_not_retried', true)
  } catch {
    toast('result_unconfirmed_the_command_was_not_retried', true)
  } finally {
    state.busy = null
    await loadExternalSources()
  }
}
