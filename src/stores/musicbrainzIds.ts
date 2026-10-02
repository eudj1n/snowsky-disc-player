/**
 * MusicBrainz identities the owner confirmed (owner, 2026-10-01): which
 * MusicBrainz artist a name of the collection is, kept in the player's store
 * (`musicbrainz`) with a few of its facts, so every browser asks fanart.tv,
 * Commons and others by the same id and never guesses between namesakes
 * again. A confirmation needs the pairing serial number; without it the
 * choice lasts for this tab.
 */
import { reactive, readonly, watch } from 'vue'
import {
  artistLinks,
  artistReleaseGroups,
  bestArtist,
  findReleases,
  groupReleases,
  releaseGroup,
  searchArtists,
  type ArtistCandidate,
  type ArtistLinks,
  type ReleaseCandidate,
  type ReleaseGroupCandidate,
  type ReleaseGroupFacts,
} from '../gateway/musicbrainz'
import { rankReleases } from '../domain/covers'
import { deleteRecord, putRecord, readCollection } from '../gateway/store'
import { connection, http, originAllowed } from './connection'
import { sourceAllowed } from './externalSources'
import { pairingToken } from './pairing'

/** The facts kept with an artist's id (MusicBrainz core data, CC0). */
export interface ArtistFacts {
  name: string
  sortName: string | null
  type: string | null
  country: string | null
  begin: string | null
  end: string | null
  disambiguation: string | null
  aliases: string[]
  links: Partial<Record<'official' | 'bandcamp' | 'discogs' | 'wikidata', string>>
}
export interface ArtistIdentity {
  mbid: string
  facts: ArtistFacts | null
  /** Kept on the player; otherwise for this tab only. */
  kept: boolean
}
/** The facts kept with an album's edition (MusicBrainz core data, CC0). */
export interface AlbumFacts {
  title: string
  artist: string
  date: string | null
  country: string | null
  format: string | null
  label: string | null
  catalogNumber: string | null
  barcode: string | null
  type: string | null
  /** From the release group: when the album first came out, and its secondary types (Live, Compilation…). */
  firstRelease?: string | null
  secondaryTypes?: string[]
}
export interface AlbumIdentity {
  /** The edition (MusicBrainz release). */
  mbid: string
  group: string | null
  facts: AlbumFacts | null
  kept: boolean
}
interface IdentityRecord {
  kind: string
  name: string
  mbid: string
  group?: string
  facts?: unknown
  at: number
}

const state = reactive<{
  artists: Record<string, ArtistIdentity>
  albums: Record<string, AlbumIdentity>
  available: boolean
}>({
  artists: {},
  albums: {},
  available: false,
})
export const musicbrainzIds = readonly(state)

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FACTS_BYTES = 3072

const storedText = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** An artist's facts as the store keeps them, any field it lacks filled in: a partial record must not break the details. */
export function storedArtistFacts(value: unknown, name: string): ArtistFacts | null {
  if (!value || typeof value !== 'object') return null
  const facts = value as Record<string, unknown>
  const links: ArtistFacts['links'] = {}
  if (facts.links && typeof facts.links === 'object')
    for (const key of ['official', 'bandcamp', 'discogs', 'wikidata'] as const) {
      const link = storedText((facts.links as Record<string, unknown>)[key])
      if (link) links[key] = link
    }
  return {
    name: storedText(facts.name) ?? name,
    sortName: storedText(facts.sortName),
    type: storedText(facts.type),
    country: storedText(facts.country),
    begin: storedText(facts.begin),
    end: storedText(facts.end),
    disambiguation: storedText(facts.disambiguation),
    aliases: Array.isArray(facts.aliases)
      ? facts.aliases.filter((alias): alias is string => typeof alias === 'string')
      : [],
    links,
  }
}

export async function loadMusicbrainzIds(): Promise<void> {
  if (!connection.store) return
  try {
    const records = await readCollection<IdentityRecord>(http, 'musicbrainz')
    state.available = records !== null
    const kept: Record<string, ArtistIdentity> = {}
    const albums: Record<string, AlbumIdentity> = {}
    for (const { value } of records ?? []) {
      if (!MBID.test(value.mbid)) continue
      if (value.kind === 'artist')
        kept[value.name] = { mbid: value.mbid, facts: storedArtistFacts(value.facts, value.name), kept: true }
      else if (value.kind === 'album')
        albums[value.name] = {
          mbid: value.mbid,
          group: value.group && MBID.test(value.group) ? value.group : null,
          facts: (value.facts as AlbumFacts | undefined) ?? null,
          kept: true,
        }
    }
    // A choice made in this tab without pairing stays until the player knows better.
    for (const [name, identity] of Object.entries(state.artists)) if (!identity.kept) kept[name] ??= identity
    for (const [key, identity] of Object.entries(state.albums)) if (!identity.kept) albums[key] ??= identity
    state.artists = kept
    state.albums = albums
  } catch {
    // Unreachable for now: the last identities stay.
  }
}
watch(
  () => connection.store,
  (store) => {
    if (store) void loadMusicbrainzIds()
  },
  { immediate: true },
)

export const artistIdentity = (name: string): ArtistIdentity | null => state.artists[name] ?? null
/** The edition confirmed for an album, by the page's album key. */
export const albumIdentity = (key: string): AlbumIdentity | null => state.albums[key] ?? null

/** An edition's facts as the store keeps them, with its release group's when read. */
export const albumFacts = (release: ReleaseCandidate, group: ReleaseGroupFacts | null = null): AlbumFacts => ({
  title: release.title,
  artist: release.artist,
  date: release.date,
  country: release.country,
  format: release.format,
  label: release.label,
  catalogNumber: release.catalogNumber,
  barcode: release.barcode,
  type: group?.type ?? release.type,
  ...(group ? { firstRelease: group.firstRelease, secondaryTypes: group.secondaryTypes.slice(0, 6) } : {}),
})

/** Confirms which edition an album is (its MusicBrainz release and group); the player keeps it when paired. */
export async function confirmAlbum(
  key: string,
  release: ReleaseCandidate,
  group: ReleaseGroupFacts | null = null,
): Promise<boolean> {
  const identity: AlbumIdentity = {
    mbid: release.id,
    group: release.group && MBID.test(release.group) ? release.group : null,
    facts: albumFacts(release, group),
    kept: false,
  }
  state.albums = { ...state.albums, [key]: identity }
  const token = pairingToken()
  if (!token || !state.available || !MBID.test(release.id) || key.length > 1024) return false
  try {
    const outcome = await putRecord(
      http,
      'musicbrainz',
      {
        kind: 'album',
        name: key,
        mbid: release.id,
        ...(identity.group ? { group: identity.group } : {}),
        facts: identity.facts,
        at: Math.floor(Date.now() / 1000),
      },
      token,
    )
    if (outcome !== 'confirmed') return false
    state.albums = { ...state.albums, [key]: { ...identity, kept: true } }
    return true
  } catch {
    return false
  }
}

/** Forgets a confirmed identity on the player and here (the library enrichment's undo); false when not confirmed. */
export async function forgetIdentity(kind: 'artist' | 'album', name: string): Promise<boolean> {
  const token = pairingToken()
  if (!token) return false
  const outcome = await deleteRecord(http, 'musicbrainz', { kind, name }, token).catch(() => 'uncertain' as const)
  if (outcome !== 'confirmed') return false
  if (kind === 'artist')
    state.artists = Object.fromEntries(Object.entries(state.artists).filter(([key]) => key !== name))
  else state.albums = Object.fromEntries(Object.entries(state.albums).filter(([key]) => key !== name))
  return true
}

/** The facts of a candidate and its links, trimmed to what the store keeps. */
export function artistFacts(candidate: ArtistCandidate, links: ArtistLinks | null): ArtistFacts {
  const page = (url: string | null) => (url && url.length <= 300 ? url : undefined)
  const facts: ArtistFacts = {
    name: candidate.name,
    sortName: candidate.sortName,
    type: candidate.type,
    country: candidate.country,
    begin: candidate.begin,
    end: candidate.end,
    disambiguation: candidate.disambiguation,
    aliases: candidate.aliases.slice(0, 12),
    links: Object.fromEntries(
      Object.entries({
        official: page(links?.official ?? null),
        bandcamp: page(links?.bandcamp ?? null),
        discogs: page(links?.discogs ?? null),
        wikidata: links?.wikidata ? `https://www.wikidata.org/wiki/${links.wikidata}` : undefined,
      }).filter(([, url]) => url !== undefined),
    ),
  }
  while (new TextEncoder().encode(JSON.stringify(facts)).length > FACTS_BYTES && facts.aliases.length)
    facts.aliases = facts.aliases.slice(0, -1)
  return facts
}

/**
 * Confirms which MusicBrainz artist the name is: kept on the player when
 * paired (the service's reply confirms it), else for this tab. Returns
 * whether the player keeps it.
 */
export async function confirmArtist(name: string, mbid: string, facts: ArtistFacts): Promise<boolean> {
  state.artists = { ...state.artists, [name]: { mbid, facts, kept: false } }
  const token = pairingToken()
  if (!token || !state.available) return false
  try {
    const outcome = await putRecord(
      http,
      'musicbrainz',
      { kind: 'artist', name: name.slice(0, 1024), mbid, facts, at: Math.floor(Date.now() / 1000) },
      token,
    )
    if (outcome !== 'confirmed') return false
    state.artists = { ...state.artists, [name]: { mbid, facts, kept: true } }
    return true
  } catch {
    return false
  }
}

/** MusicBrainz may be asked: the owner allowed it and the release's origins admit it. */
export const identifyAllowed = (): boolean => sourceAllowed('musicbrainz') && originAllowed('musicbrainz')

export type IdentifyStatus = 'idle' | 'searching' | 'ready' | 'missing' | 'failed'
/**
 * What the album's window shows (owner, 2026-10-02): the search's editions, the artist's albums when the search
 * found no fitting edition, or the editions of the album chosen there.
 */
export type IdentifyView = 'search' | 'groups' | 'group'
interface Identify {
  /** The artist's name or the album's key the candidates are for. */
  key: string | null
  status: IdentifyStatus
  view: IdentifyView
  artists: ArtistCandidate[]
  editions: ReleaseCandidate[]
  /** The search's editions, kept while the artist's albums are browsed. */
  found: ReleaseCandidate[]
  groups: ReleaseGroupCandidate[]
  /** The artist's album whose editions show. */
  group: ReleaseGroupCandidate | null
  /** A confirmation waits for MusicBrainz or the player. */
  saving: boolean
}
const IDLE = { status: 'idle', view: 'search', artists: [], editions: [], found: [], groups: [], group: null } as const
const search = reactive<Identify>({
  key: null,
  ...IDLE,
  artists: [],
  editions: [],
  found: [],
  groups: [],
  saving: false,
})
/** The details panel's search: candidates for an artist, or editions for an album (owner, 2026-10-01). */
export const identifying = readonly(search)

export function forgetCandidates(): void {
  Object.assign(search, { key: null, ...IDLE, artists: [], editions: [], found: [], groups: [], saving: false })
}

/** The artists MusicBrainz offers for a name, on the listener's request (the name leaves the network). */
export async function findArtistCandidates(name: string): Promise<void> {
  if (!identifyAllowed()) return
  Object.assign(search, { key: name, ...IDLE, status: 'searching', artists: [], editions: [], found: [], groups: [] })
  try {
    const artists = await searchArtists(name)
    if (search.key !== name) return
    search.artists = artists
    search.status = artists.length ? 'ready' : 'missing'
  } catch {
    if (search.key === name) search.status = 'failed'
  }
}

/** The listener says which artist the name is: its links are read and the identity kept. */
export async function chooseArtistCandidate(name: string, candidate: ArtistCandidate): Promise<boolean> {
  search.saving = true
  try {
    const links = await artistLinks(candidate.id).catch(() => null)
    const kept = await confirmArtist(name, candidate.id, artistFacts(candidate, links))
    forgetCandidates()
    return kept
  } finally {
    search.saving = false
  }
}

/** The album's editions MusicBrainz offers, on the listener's request (its title and artist leave the network). */
export async function findEditions(
  key: string,
  title: string,
  artist: string,
  trackCount: number | null,
): Promise<void> {
  if (!identifyAllowed()) return
  Object.assign(search, { key, ...IDLE, status: 'searching', artists: [], editions: [], found: [], groups: [] })
  try {
    const editions = rankReleases(await findReleases(title, artist), trackCount, title)
    if (search.key !== key) return
    search.editions = editions
    search.found = editions
    search.status = editions.length ? 'ready' : 'missing'
  } catch {
    if (search.key === key) search.status = 'failed'
  }
}

/**
 * The artist's albums, when the search found no fitting edition (owner, 2026-10-02): the artist's confirmed id,
 * else the one its exact name finds (the name leaves the network), then the albums, one request each.
 */
export async function findArtistAlbums(key: string, artist: string): Promise<void> {
  if (!identifyAllowed() || search.key !== key) return
  Object.assign(search, { view: 'groups', status: 'searching', editions: [], group: null })
  try {
    const mbid = artistIdentity(artist)?.mbid ?? bestArtist(await searchArtists(artist), artist)?.id
    const groups = mbid ? await artistReleaseGroups(mbid) : []
    if (search.key !== key || search.view !== 'groups') return
    search.groups = groups
    search.status = groups.length ? 'ready' : 'missing'
  } catch {
    if (search.key === key) search.status = 'failed'
  }
}

/** The editions of the artist's album the listener chose, ranked as a search's are. */
export async function findGroupEditions(
  key: string,
  group: ReleaseGroupCandidate,
  title: string,
  trackCount: number | null,
): Promise<void> {
  if (!identifyAllowed() || search.key !== key) return
  Object.assign(search, { view: 'group', status: 'searching', editions: [], group: { ...group } })
  try {
    const editions = rankReleases(await groupReleases(group.id), trackCount, title)
    if (search.key !== key || search.view !== 'group') return
    search.editions = editions
    search.status = editions.length ? 'ready' : 'missing'
  } catch {
    if (search.key === key) search.status = 'failed'
  }
}

/** Back one step: from an album's editions to the artist's albums, from those to the search's editions. */
export function identifyBack(): void {
  if (search.view === 'group') Object.assign(search, { view: 'groups', group: null, editions: [], status: 'ready' })
  else if (search.view === 'groups')
    Object.assign(search, {
      view: 'search',
      editions: search.found,
      status: search.found.length ? 'ready' : 'missing',
    })
}

/** The listener says which edition the album is: its release group is read too, and the identity kept. */
export async function confirmEdition(key: string, release: ReleaseCandidate): Promise<boolean> {
  search.saving = true
  try {
    const group = release.group && identifyAllowed() ? await releaseGroup(release.group).catch(() => null) : null
    const kept = await confirmAlbum(key, release, group)
    if (search.key === key) forgetCandidates()
    return kept
  } finally {
    search.saving = false
  }
}
