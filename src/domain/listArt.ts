/**
 * The automatic playlists' covers (owner, 2026-09-30, after Apple Music's
 * "Made for You" cards): a soft field of colour, the list's name large in
 * white, the player's mark and the artists it holds. Each of the lists that
 * are not an artist's has its own palette (the most played warm, the daily
 * mix red, recently added violet, long not played teal); an artist's list
 * takes one of four more by its name. Plain CSS gradients: nothing to load,
 * nothing the page's policy forbids.
 */
import { creditArtists } from './artist'
import { toLch, type CoverColours, type Rgb } from './coverColours'
import type { AutoKind } from './autoPlaylists'
import type { LibraryTrack } from './track'

type Palette = readonly [base: string, first: string, second: string, third: string]

const KINDS: Record<Exclude<AutoKind, 'artist_most_played'>, Palette> = {
  most_played: ['#f5a02e', '#ffd95a', '#ee5f22', '#fbc063'],
  daily_mix: ['#ea3a22', '#ff9222', '#bf1230', '#ffcb3a'],
  recently_added: ['#6a33e4', '#c24cf2', '#ff9fc6', '#3325c6'],
  not_played_lately: ['#127fa5', '#27c8c5', '#0b4d86', '#44d59b'],
}
const ARTISTS: readonly Palette[] = [
  ['#d8345e', '#ff7b91', '#8e1c45', '#ffb46a'],
  ['#2e8e5a', '#8fdf79', '#12583e', '#d5ef79'],
  ['#3866d5', '#7fb2ff', '#1b398e', '#b08bff'],
  ['#c15619', '#ffa35b', '#792c10', '#ffd279'],
]

function palette(kind: AutoKind, name: string): Palette {
  if (kind !== 'artist_most_played') return KINDS[kind]
  let hash = 0
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return ARTISTS[hash % ARTISTS.length] ?? ARTISTS[0] ?? KINDS.most_played
}

/** The cover's background: blurred blobs of three colours over the base, as CSS layers. */
export function listBackground(kind: AutoKind, name: string): string {
  const [base, first, second, third] = palette(kind, name)
  return [
    `radial-gradient(62% 55% at 18% 22%, ${first} 0%, transparent 72%)`,
    `radial-gradient(66% 62% at 86% 80%, ${second} 0%, transparent 70%)`,
    `radial-gradient(56% 50% at 72% 16%, ${third} 0%, transparent 68%)`,
    `radial-gradient(80% 70% at 28% 96%, ${second}cc 0%, transparent 70%)`,
    base,
  ].join(', ')
}

const rgb = (value: string): Rgb => [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16)) as unknown as Rgb

/**
 * The list page's heading colours (owner, 2026-10-01: they came from the
 * title, not the cover): the cover's base and its first glow.
 */
export function listTones(kind: AutoKind, name: string): CoverColours {
  const [base, first] = palette(kind, name)
  const a = toLch(rgb(base))
  const b = toLch(rgb(first))
  return { first: a, second: b, grey: a.C < 0.035 }
}

/** The artists a list holds most, most first (joint credits count for each artist). */
export function listArtists(
  entries: readonly string[],
  trackByPath: ReadonlyMap<string, Pick<LibraryTrack, 'artist'>>,
  count = 5,
): { names: string[]; more: boolean } {
  const tally = new Map<string, number>()
  for (const path of entries) {
    const artist = trackByPath.get(path)?.artist
    if (artist) for (const name of creditArtists(artist)) tally.set(name, (tally.get(name) ?? 0) + 1)
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  return { names: ranked.slice(0, count), more: ranked.length > count }
}

/** The title's size in the card's width: long words step down so they fit whole. */
export function titleSize(title: string): number {
  const longest = Math.max(...title.split(/\s+/).map((word) => [...new Intl.Segmenter().segment(word)].length), 1)
  return Math.min(13, 138 / longest)
}

/** A list's day ('2026-09-30') as the page's language writes it short ("30 Sep"). */
export function shortDay(day: string, locale?: string): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, date))
}
