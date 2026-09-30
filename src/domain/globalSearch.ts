/**
 * One search over the whole collection (owner, 2026-09-30), in place of a
 * filter of the current section. Case, diacritics and ё/е do not matter; every
 * word of the query must be found. A name equal to the query ranks first, then
 * one that starts with it, then one with a word that starts with it, then any
 * match, the more words in the name the better; ties keep the collection's
 * order. Everything is in the page's memory, so results come as one types:
 * the compared text is prepared once per collection (indexOf).
 */

/** Text as the search compares it: lower case, no diacritics, ё as е, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

const WORD_BREAK = /[\s\-–—.,:;!?()[\]'"«»/&+]+/

/** An item with its name and other fields as the search compares them. */
export interface Entry<T> {
  item: T
  name: string
  words: string[]
  rest: string
}

export function indexOf<T>(
  items: readonly T[],
  fields: (item: T) => [string, ...(string | null | undefined)[]],
): Entry<T>[] {
  return items.map((item) => {
    const [name, ...others] = fields(item)
    const normalized = normalize(name)
    return {
      item,
      name: normalized,
      words: normalized.split(WORD_BREAK),
      rest: others
        .filter(Boolean)
        .map((field) => normalize(field ?? ''))
        .join(' '),
    }
  })
}

/** How well an entry answers a query already normalized; 0 when a word of the query is missing. */
export function score(query: string, entry: Pick<Entry<unknown>, 'name' | 'words' | 'rest'>): number {
  if (!query) return 0
  const words = query.split(' ')
  if (!words.every((word) => entry.name.includes(word) || entry.rest.includes(word))) return 0
  if (entry.name === query) return 100
  if (entry.name.startsWith(query)) return 80
  if (entry.words.some((part) => part.startsWith(query))) return 60
  const inName = words.filter((word) => entry.name.includes(word)).length
  if (inName === words.length) return 40
  return 20 + (19 * inName) / words.length
}

export interface Ranked<T> {
  item: T
  score: number
}

/** The entries matching the query, best first. */
export function rank<T>(index: readonly Entry<T>[], query: string): Ranked<T>[] {
  const normalized = normalize(query)
  if (!normalized) return []
  return index
    .flatMap((entry, position) => {
      const value = score(normalized, entry)
      return value ? [{ item: entry.item, score: value, position }] : []
    })
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map(({ item, score: value }) => ({ item, score: value }))
}
