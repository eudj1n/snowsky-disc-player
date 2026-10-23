/**
 * The community's tags of the card's identified artists, from ListenBrainz
 * (owner, 2026-10-23; stage 2 of the recommendations): read by the artist's
 * MusicBrainz id, kept in this browser for a week, never on the player. The
 * artist's page reads its own with the recommendations; a genre page reads
 * every identified artist's at once (batches of 25 within the rate limit),
 * by itself when the source works automatically, else on a click.
 */
import { computed, reactive, readonly } from 'vue'
import type { WeightedTag } from '../domain/tags'
import { artistTags as readTags } from '../gateway/listenbrainz'
import { cacheGet, cacheSet } from '../lib/idb'
import { artistIdentity, musicbrainzIds } from './musicbrainzIds'
import { recommendationsAllowed } from './recommendations'

interface Kept {
  at: number
  tags: WeightedTag[]
}
const KEEP_MS = 7 * 24 * 3600_000
const cacheKey = (mbid: string) => `listenbrainz:tags:${mbid}`

const state = reactive<{ byMbid: Record<string, WeightedTag[]>; loading: Set<string>; failed: boolean }>({
  byMbid: {},
  loading: new Set(),
  failed: false,
})
export const artistTagsState = readonly(state)

/** The tags of an artist of the card, by its name, once read. */
export function artistTags(name: string): WeightedTag[] | null {
  const mbid = artistIdentity(name)?.mbid
  return mbid ? (state.byMbid[mbid] ?? null) : null
}

/** The card's identified artists with their tags, by name, for a genre page. */
export const tagsByArtist = computed(() => {
  const found = new Map<string, WeightedTag[]>()
  for (const [name, identity] of Object.entries(musicbrainzIds.artists)) {
    const tags = state.byMbid[identity.mbid]
    if (tags) found.set(name, tags)
  }
  return found
})
/** Identified artists whose tags are not read yet. */
export const unreadArtists = computed(() =>
  Object.values(musicbrainzIds.artists)
    .map((identity) => identity.mbid)
    .filter((mbid, index, all) => !(mbid in state.byMbid) && all.indexOf(mbid) === index),
)
/** Something is being read. */
export const tagsLoading = computed(() => state.loading.size > 0)

/** Reads the tags of these artists: this browser's week-old copies first, the rest from ListenBrainz. */
export async function loadArtistTags(mbids: readonly string[]): Promise<void> {
  if (!recommendationsAllowed()) return
  const wanted = mbids.filter((mbid) => !(mbid in state.byMbid) && !state.loading.has(mbid))
  if (!wanted.length) return
  for (const mbid of wanted) state.loading.add(mbid)
  state.failed = false
  try {
    const now = Date.now()
    const missing: string[] = []
    for (const mbid of wanted) {
      const kept = await cacheGet<Kept>(cacheKey(mbid))
      if (kept && typeof kept.at === 'number' && now - kept.at < KEEP_MS)
        state.byMbid = { ...state.byMbid, [mbid]: kept.tags }
      else missing.push(mbid)
    }
    if (!missing.length) return
    const found = await readTags(missing)
    state.byMbid = { ...state.byMbid, ...found }
    for (const [mbid, tags] of Object.entries(found)) await cacheSet(cacheKey(mbid), { at: now, tags } satisfies Kept)
  } catch {
    state.failed = true
  } finally {
    for (const mbid of wanted) state.loading.delete(mbid)
  }
}

/** Reads every identified artist's tags (a genre page). */
export const loadCollectionTags = (): Promise<void> => loadArtistTags(unreadArtists.value)

/** Forgets what this tab holds (tests). */
export function resetArtistTags(): void {
  state.byMbid = {}
  state.loading.clear()
  state.failed = false
}
