/**
 * Outside sources (owner, 2026-10-01): each one the page may ask for lyrics,
 * album covers or artist images is off until the owner allows it in
 * Settings, and asked without a click only when also set to work
 * automatically. The choice is kept on the player (the store's
 * `external_sources` collection), so every browser follows it; a change
 * needs the pairing serial number and is confirmed by the service's reply.
 * Without the collection (an older card release) every source stays off.
 * The release's reviewed origins still decide whether a source can be
 * reached at all.
 */
import { reactive, readonly, watch } from 'vue'
import { putRecord, readCollection } from '../gateway/store'
import { connection, http } from './connection'
import { pairingToken } from './pairing'
import { toast } from './ui'

/** What a source brings; Settings groups the sources by it. */
export type SourceKind = 'lyrics' | 'album_covers' | 'artist_images'
export type SourceName = 'lrclib' | 'coverartarchive' | 'wikimedia'

export interface SourceInfo {
  name: SourceName
  kind: SourceKind
  /** The source's own name, never translated. */
  title: string
  site: string
}

export const SOURCES: readonly SourceInfo[] = [
  { name: 'lrclib', kind: 'lyrics', title: 'LRCLIB', site: 'https://lrclib.net' },
  { name: 'coverartarchive', kind: 'album_covers', title: 'Cover Art Archive', site: 'https://coverartarchive.org' },
  { name: 'wikimedia', kind: 'artist_images', title: 'Wikimedia Commons', site: 'https://commons.wikimedia.org' },
]
export const SOURCE_KINDS: readonly SourceKind[] = ['lyrics', 'album_covers', 'artist_images']

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

/** The owner allowed the source (the release's origins are checked by its own module). */
export const sourceAllowed = (name: SourceName): boolean => state.choices[name]?.allowed === true
/** The source may be asked without a click. */
export const sourceAutomatic = (name: SourceName): boolean => sourceAllowed(name) && state.choices[name]?.auto === true

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
  const next: SourceChoice = { allowed, auto: allowed && (change.auto ?? current.auto) }
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
