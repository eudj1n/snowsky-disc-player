/**
 * Search within the current view, as in the reference (core.mjs filterItems):
 * the query is trimmed, lower-cased with the current locale and split on
 * whitespace; an item matches when every word is a substring of its fields.
 */
export function matchesQuery(fields: readonly (string | null | undefined)[], query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = fields.filter(Boolean).join(' ').toLocaleLowerCase()
  return words.every((word) => haystack.includes(word))
}

export function filterBy<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
): T[] {
  return query.trim() ? items.filter((item) => matchesQuery(fields(item), query)) : [...items]
}
