/**
 * Outside sources (owner, 2026-10-01): each one the page may ask for lyrics,
 * album covers or artist images is off until the owner allows it in
 * Settings, and asked without a click only when also set to work
 * automatically. The choice is kept on the player (the store's
 * `external_sources` collection), so every browser follows it; a change
 * needs the pairing serial number and is confirmed by the service's reply.
 * Without the collection (an older card release) every source stays off.
 * MusicBrainz is a source of its own (owner, 2026-10-01): the sources that
 * find what they bring by its ids work only while it is allowed too. A
 * source that takes a key (fanart.tv: the owner's personal one) works only
 * with it; the key is kept in the source's record, which every page the
 * gateway admits can read, so only keys of free services belong there. The
 * release's reviewed origins still decide whether a source can be reached
 * at all.
 */
import { reactive, readonly, watch } from 'vue'
import { putRecord, readCollection } from '../gateway/store'
import { connection, http } from './connection'
import { pairingToken } from './pairing'
import { toast } from './ui'

/** What a source brings; Settings groups the sources by it, in their order of priority (fanart.tv before
 * Commons for artist images: the owner, 2026-10-01). */
export type SourceKind = 'metadata' | 'lyrics' | 'album_covers' | 'artist_images'
export type SourceName = 'musicbrainz' | 'lrclib' | 'coverartarchive' | 'wikimedia' | 'fanarttv'

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
  /** It is asked only with the owner's own key, and where that key is got. */
  key?: string
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
    name: 'fanarttv',
    kind: 'artist_images',
    title: 'fanart.tv',
    site: 'https://fanart.tv',
    needs: ['musicbrainz'],
    automatic: true,
    key: 'https://fanart.tv/get-an-api-key/',
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
  /** The owner's key for a source that takes one. */
  key?: string
}
interface SourceRecord {
  source: string
  allowed?: boolean
  auto?: boolean
  api_key?: string
  auto_photo?: boolean
  auto_background?: boolean
  at: number
}
/** An artist's image by its use: the round photo, or the wide background. */
export type ImageRole = 'photo' | 'background'
/** The record of the artist images' kind, which says which images the automatic lookups take. */
const ROLES_RECORD = 'artist_images'
/**
 * Which artist images the automatic lookups take, one lookup or a whole batch (owner, 2026-10-02): photos by
 * default, a background only when asked for, since one is not always wanted. By hand both can be chosen.
 */
const DEFAULT_ROLES: Readonly<Record<ImageRole, boolean>> = { photo: true, background: false }
/** A key the store accepts. */
export const SOURCE_KEY = /^[A-Za-z0-9._-]{1,128}$/

interface SourcesModel {
  choices: Partial<Record<SourceName, SourceChoice>>
  /** Which artist images the automatic lookups take. */
  roles: Record<ImageRole, boolean>
  /** The card release declares the collection. */
  available: boolean
  /** The source (or the artist images' kind) whose change waits for the player's reply. */
  busy: SourceName | typeof ROLES_RECORD | null
}

const state = reactive<SourcesModel>({ choices: {}, roles: { ...DEFAULT_ROLES }, available: false, busy: null })
export const externalSources = readonly(state)

const known = (name: string): name is SourceName => SOURCES.some((source) => source.name === name)

/** The sources a source needs that are not allowed now. */
export const missingNeeds = (name: SourceName): SourceName[] =>
  info(name).needs.filter((need) => state.choices[need]?.allowed !== true)
/** The key the source is asked with, when it takes one. */
export const sourceKey = (name: SourceName): string | null => state.choices[name]?.key ?? null
/** A source that takes a key has none yet. */
export const missingKey = (name: SourceName): boolean => info(name).key !== undefined && sourceKey(name) === null
/** The owner allowed the source and what it needs (the release's origins are checked by its own module). */
export const sourceAllowed = (name: SourceName): boolean =>
  state.choices[name]?.allowed === true && missingNeeds(name).length === 0 && !missingKey(name)
/** The source may be asked without a click. */
export const sourceAutomatic = (name: SourceName): boolean =>
  info(name).automatic && sourceAllowed(name) && state.choices[name]?.auto === true
/** The automatic lookups take this kind of artist image. */
export const autoImageRole = (role: ImageRole): boolean => state.roles[role]

export async function loadExternalSources(): Promise<void> {
  if (!connection.store) return
  try {
    const records = await readCollection<SourceRecord>(http, 'external_sources')
    state.available = records !== null
    const choices: SourcesModel['choices'] = {}
    const roles = { ...DEFAULT_ROLES }
    for (const { value } of records ?? [])
      if (value.source === ROLES_RECORD) {
        if (typeof value.auto_photo === 'boolean') roles.photo = value.auto_photo
        if (typeof value.auto_background === 'boolean') roles.background = value.auto_background
      } else if (known(value.source))
        choices[value.source] = {
          allowed: value.allowed === true,
          auto: value.auto === true,
          ...(typeof value.api_key === 'string' && SOURCE_KEY.test(value.api_key) ? { key: value.api_key } : {}),
        }
    state.choices = choices
    state.roles = roles
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

/** Writes a record: the player's reply confirms it; a lost reply is not retried. */
async function put(name: NonNullable<SourcesModel['busy']>, record: Record<string, unknown>): Promise<boolean> {
  const token = pairingToken()
  if (!token) {
    toast('pair_to_control', true)
    return false
  }
  if (state.busy) {
    toast('please_wait_for_the_current_request')
    return false
  }
  state.busy = name
  try {
    const outcome = await putRecord(http, 'external_sources', record, token)
    if (outcome !== 'confirmed') toast('result_unconfirmed_the_command_was_not_retried', true)
    return outcome === 'confirmed'
  } catch {
    toast('result_unconfirmed_the_command_was_not_retried', true)
    return false
  } finally {
    state.busy = null
    await loadExternalSources()
  }
}

/** Writes a source's record. */
async function write(name: SourceName, next: SourceChoice): Promise<boolean> {
  const record = { source: name, allowed: next.allowed, auto: next.auto, at: Math.floor(Date.now() / 1000) }
  const kept = await put(name, next.key ? { ...record, api_key: next.key } : record)
  if (kept) state.choices = { ...state.choices, [name]: next }
  return kept
}

/** Lets the automatic lookups take this kind of artist image, or not. */
export async function chooseAutoImageRole(role: ImageRole, take: boolean): Promise<boolean> {
  const roles = { ...state.roles, [role]: take }
  const kept = await put(ROLES_RECORD, {
    source: ROLES_RECORD,
    auto_photo: roles.photo,
    auto_background: roles.background,
    at: Math.floor(Date.now() / 1000),
  })
  if (kept) state.roles = roles
  return kept
}

/** Allows or stops a source, or lets it work automatically; stopping it stops the automatic use too. */
export async function chooseSource(name: SourceName, change: Partial<Omit<SourceChoice, 'key'>>): Promise<void> {
  const current = state.choices[name] ?? { allowed: false, auto: false }
  const allowed = change.allowed ?? current.allowed
  await write(name, { ...current, allowed, auto: allowed && info(name).automatic && (change.auto ?? current.auto) })
}

/** Keeps the owner's key for the source, or forgets it (null); a source without its key is not asked. */
export async function setSourceKey(name: SourceName, key: string | null): Promise<boolean> {
  const value = key?.trim() ?? ''
  if (value !== '' && !SOURCE_KEY.test(value)) return false
  const current = state.choices[name] ?? { allowed: false, auto: false }
  return write(name, { allowed: current.allowed, auto: current.auto, ...(value ? { key: value } : {}) })
}
