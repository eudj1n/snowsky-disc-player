/**
 * MusicBrainz identities the owner confirmed (owner, 2026-10-01): which
 * MusicBrainz artist a name of the collection is, kept in the player's store
 * (`musicbrainz`) with a few of its facts, so every browser asks fanart.tv,
 * Commons and others by the same id and never guesses between namesakes
 * again. A confirmation needs the pairing serial number; without it the
 * choice lasts for this tab.
 */
import { reactive, readonly, watch } from 'vue'
import type { ArtistCandidate, ArtistLinks, ReleaseCandidate } from '../gateway/musicbrainz'
import { putRecord, readCollection } from '../gateway/store'
import { connection, http } from './connection'
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
        kept[value.name] = { mbid: value.mbid, facts: (value.facts as ArtistFacts | undefined) ?? null, kept: true }
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

/** An edition's facts as the store keeps them. */
export const albumFacts = (release: ReleaseCandidate): AlbumFacts => ({
  title: release.title,
  artist: release.artist,
  date: release.date,
  country: release.country,
  format: release.format,
  label: release.label,
  catalogNumber: release.catalogNumber,
  barcode: release.barcode,
  type: release.type,
})

/** Confirms which edition an album is (its MusicBrainz release and group); the player keeps it when paired. */
export async function confirmAlbum(key: string, release: ReleaseCandidate): Promise<boolean> {
  const identity: AlbumIdentity = {
    mbid: release.id,
    group: release.group && MBID.test(release.group) ? release.group : null,
    facts: albumFacts(release),
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
