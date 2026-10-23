/**
 * What ListenBrainz says of an artist (owner, 2026-10-23; the analysis in
 * docs/recommendations.md): similar artists, the artist's most listened
 * recordings and release groups, by the MusicBrainz id the owner confirmed.
 * Read once the owner allowed the source: by itself when the artist's page
 * opens, if the source works automatically, else on a click. Only the id
 * goes out; nothing of the listener's own. The answers are kept in this
 * browser for a week (IndexedDB), never on the player: they are the world's
 * counts, cheap to read again, and nothing the owner chose.
 */
import { reactive, readonly } from 'vue'
import type { PopularGroup, PopularRecording, SimilarArtist } from '../domain/recommendations'
import { popularGroups, popularRecordings, similarArtists } from '../gateway/listenbrainz'
import { cacheGet, cacheSet } from '../lib/idb'
import { originAllowed } from './connection'
import { sourceAllowed, sourceAutomatic } from './externalSources'
import { artistIdentity } from './musicbrainzIds'

export type RecommendationStatus = 'loading' | 'ready' | 'failed'
export interface ArtistRecommendations {
  status: RecommendationStatus
  similar: SimilarArtist[]
  recordings: PopularRecording[]
  groups: PopularGroup[]
}
interface Kept {
  at: number
  similar: SimilarArtist[]
  recordings: PopularRecording[]
  groups: PopularGroup[]
}

const KEEP_MS = 7 * 24 * 3600_000
const cacheKey = (mbid: string) => `listenbrainz:artist:${mbid}`

const state = reactive<{ artists: Record<string, ArtistRecommendations> }>({ artists: {} })
export const recommendations = readonly(state)

/** The release's origins admit MusicBrainz and both ListenBrainz hosts. */
export const recommendationsAdmitted = (): boolean =>
  originAllowed('musicbrainz') && originAllowed('listenbrainz_api') && originAllowed('listenbrainz_labs')
/** ListenBrainz may be asked: the owner allowed it (and MusicBrainz) and the release admits it. */
export const recommendationsAllowed = (): boolean => sourceAllowed('listenbrainz') && recommendationsAdmitted()
/** ListenBrainz is asked when an identified artist's page opens. */
export const recommendationsAutomatic = (): boolean => sourceAutomatic('listenbrainz') && recommendationsAdmitted()

/** What is known of the artist in this tab, by its name on the card. */
export const artistRecommendations = (name: string): ArtistRecommendations | null => state.artists[name] ?? null

const fresh = (kept: Kept | undefined, now: number): kept is Kept =>
  kept !== undefined && typeof kept.at === 'number' && now - kept.at < KEEP_MS

/** Asks ListenBrainz about the artist (or takes this browser's week-old answer); nothing without its id. */
export async function lookUpArtistRecommendations(name: string): Promise<void> {
  const mbid = artistIdentity(name)?.mbid
  if (!mbid || !recommendationsAllowed() || state.artists[name]?.status === 'loading') return
  state.artists = { ...state.artists, [name]: { status: 'loading', similar: [], recordings: [], groups: [] } }
  const now = Date.now()
  const kept = await cacheGet<Kept>(cacheKey(mbid))
  if (fresh(kept, now)) {
    state.artists = { ...state.artists, [name]: { status: 'ready', ...kept } }
    return
  }
  try {
    const similar = await similarArtists(mbid)
    const recordings = await popularRecordings(mbid)
    const groups = await popularGroups(mbid)
    state.artists = { ...state.artists, [name]: { status: 'ready', similar, recordings, groups } }
    await cacheSet(cacheKey(mbid), { at: now, similar, recordings, groups } satisfies Kept)
  } catch {
    state.artists = { ...state.artists, [name]: { status: 'failed', similar: [], recordings: [], groups: [] } }
  }
}

/** Forgets what this tab holds (tests). */
export function resetRecommendations(): void {
  state.artists = {}
}
