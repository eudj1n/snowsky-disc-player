/**
 * What the outside sources say for My wave (owner, 2026-10-23; the playlist
 * on the player, the owner's choice over a live queue): the similar artists,
 * the listeners' genres and the similar tracks this tab holds, laid against
 * the card as the wave takes them, and the asking for the wave's seeds (a
 * few of the newest plays' artists and tracks) before a wave is drawn, once
 * the owner allowed ListenBrainz. Everything asked is kept in this browser
 * by the stores it belongs to, so the next wave asks for little.
 */
import type { WaveInput } from '../domain/autoPlaylists'
import { creditArtists } from '../domain/artist'
import { similarArtistsOnCard } from '../domain/recommendations'
import { topTags } from '../domain/tags'
import type { LibraryTrack } from '../domain/track'
import { artistTagsState, loadArtistTags } from './artistTags'
import { artists } from './library'
import { artistIdentity, musicbrainzIds } from './musicbrainzIds'
import {
  canAskSimilar,
  lookUpArtistRecommendations,
  lookUpSimilarTracks,
  recommendations,
  recommendationsAllowed,
  similarTracks,
} from './recommendations'

/** Seed artists asked about for a wave, and seed tracks. */
const WAVE_ARTISTS = 8
const WAVE_TRACKS = 8
const WAVE_GENRES = 10

/** What this tab holds now, as the wave takes it. */
export function waveInput(): WaveInput {
  const names = artists.value.map((artist) => artist.name)
  const mbidOf = (name: string) => artistIdentity(name)?.mbid ?? null
  const similarArtists = new Map<string, { name: string; score: number }[]>()
  for (const [name, found] of Object.entries(recommendations.artists))
    if (found.status === 'ready' && found.similar.length)
      similarArtists.set(name, similarArtistsOnCard(found.similar, names, mbidOf).onCard)
  const genres = new Map<string, string[]>()
  for (const [name, identity] of Object.entries(musicbrainzIds.artists)) {
    const tags = artistTagsState.byMbid[identity.mbid]
    if (tags?.length)
      genres.set(
        name,
        topTags(tags, WAVE_GENRES).map((tag) => tag.tag),
      )
  }
  const similar = new Map<string, { path: string; score: number }[]>()
  for (const [path, found] of Object.entries(similarTracks.byPath))
    if (found.status === 'ready')
      similar.set(
        path,
        found.onCard.flatMap((item) => (item.track.path ? [{ path: item.track.path, score: item.score }] : [])),
      )
  return { similarArtists, genres, similarTracks: similar }
}

/** Asks ListenBrainz about the wave's seeds: their most frequent identified artists and a few of the tracks. */
export async function gatherWave(seeds: readonly LibraryTrack[]): Promise<void> {
  if (!recommendationsAllowed()) return
  const counts = new Map<string, number>()
  for (const seed of seeds)
    for (const name of creditArtists(seed.artist ?? '')) counts.set(name, (counts.get(name) ?? 0) + 1)
  const top = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .filter((name) => artistIdentity(name) !== null)
    .slice(0, WAVE_ARTISTS)
  await loadArtistTags(top.flatMap((name) => artistIdentity(name)?.mbid ?? []))
  for (const name of top) await lookUpArtistRecommendations(name)
  for (const seed of seeds.filter((track) => canAskSimilar(track)).slice(0, WAVE_TRACKS))
    await lookUpSimilarTracks(seed)
}
