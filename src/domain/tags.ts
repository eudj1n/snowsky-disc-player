/**
 * The community's tags of an artist, from ListenBrainz (owner, 2026-10-23;
 * docs/recommendations.md, stage 2): genres and other words with the number
 * of listeners who gave them. Laid against the card they fill the genres the
 * files lack and relate genres by the artists that carry both. Related
 * genres are computed here, on the card's own artists: Labs' tag similarity
 * is co-occurrence of any tags ("britpop" gave "mellow", "teen pop"), not
 * what a listener means by a related genre (checked 2026-10-23).
 */
import { genreKey } from './genre'

export interface WeightedTag {
  tag: string
  /** Listeners who gave the tag. */
  count: number
  /** MusicBrainz knows the tag as a genre. */
  genre: boolean
}

/** The tags most listeners gave, genres only when asked; ties by name. */
export function topTags(tags: readonly WeightedTag[], limit: number, genresOnly = true): WeightedTag[] {
  return tags
    .filter((tag) => !genresOnly || tag.genre)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}

/** The tag names the genre of the card (case and spacing aside). */
export const tagIsGenre = (tag: string, genre: string): boolean => genreKey(tag) === genreKey(genre)

export interface TaggedArtist {
  name: string
  /** Listeners who gave the genre to the artist. */
  count: number
}

/**
 * The card's artists whose community tags carry the genre, the most agreed first, except those the card
 * already lists under it (their files say so).
 */
export function artistsTaggedWith(
  tagsByArtist: ReadonlyMap<string, readonly WeightedTag[]>,
  genre: string,
  except: ReadonlySet<string>,
): TaggedArtist[] {
  const found: TaggedArtist[] = []
  for (const [name, tags] of tagsByArtist) {
    if (except.has(name)) continue
    const match = tags.find((tag) => tagIsGenre(tag.tag, genre))
    if (match) found.push({ name, count: match.count })
  }
  return found.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export interface RelatedGenre {
  tag: string
  /** The card's artists tagged with both. */
  artists: number
}

/**
 * Genres the card's artists carry together with this one: for every artist tagged with the genre, its other
 * genre tags, counted by artists; the most shared first.
 */
export function relatedGenres(
  tagsByArtist: ReadonlyMap<string, readonly WeightedTag[]>,
  genre: string,
  limit: number,
): RelatedGenre[] {
  const shared = new Map<string, { tag: string; artists: number; weight: number }>()
  for (const tags of tagsByArtist.values()) {
    if (!tags.some((tag) => tagIsGenre(tag.tag, genre))) continue
    for (const tag of tags) {
      if (!tag.genre || tagIsGenre(tag.tag, genre)) continue
      const key = genreKey(tag.tag)
      const entry = shared.get(key) ?? { tag: tag.tag, artists: 0, weight: 0 }
      entry.artists++
      entry.weight += tag.count
      shared.set(key, entry)
    }
  }
  return [...shared.values()]
    .sort((a, b) => b.artists - a.artists || b.weight - a.weight || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map(({ tag, artists }) => ({ tag, artists }))
}
