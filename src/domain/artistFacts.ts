/**
 * An artist's MusicBrainz facts as one short line (owner, 2026-10-01): what
 * it is, where it comes from, its years and MusicBrainz's note that tells
 * namesakes apart, e.g. "Group · United Kingdom · 1996– · British band".
 */
export interface FactsSource {
  type: string | null
  country: string | null
  begin: string | null
  end: string | null
  disambiguation: string | null
}

/** MusicBrainz's artist types the page names in its own words. */
export const ARTIST_TYPES = ['Person', 'Group', 'Orchestra', 'Choir', 'Character', 'Other'] as const
export type ArtistType = (typeof ARTIST_TYPES)[number]

const year = (date: string | null): string | null => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : null)

/** A two-letter code as the region's name in the page's language; anything else as given. */
export function regionName(country: string, locale: string): string {
  if (!/^[A-Z]{2}$/.test(country)) return country
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(country) ?? country
  } catch {
    return country
  }
}

export function factParts(facts: FactsSource, locale: string, typeName: (type: ArtistType) => string): string[] {
  const begin = year(facts.begin)
  const end = year(facts.end)
  const type = ARTIST_TYPES.find((known) => known === facts.type)
  return [
    type ? typeName(type) : null,
    facts.country ? regionName(facts.country, locale) : null,
    begin || end ? `${begin ?? '?'}–${end ?? ''}` : null,
    facts.disambiguation,
  ].filter((part): part is string => part !== null && part !== '')
}
