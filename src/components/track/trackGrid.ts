/**
 * Column templates of a track row, shared by rows and their skeletons so a
 * loaded list replaces its placeholder without moving. A row leads with its
 * cover or number. Album and duration columns exist
 * only when shown and known (reference .no-album and .no-duration); the
 * optional last column holds the track actions button. Class names stay
 * literal so Tailwind can see them.
 */
export const TRACK_ROW = 'relative grid items-center gap-13 rounded-8 px-12 py-10 text-11 phone:gap-9 phone:px-3'

/** What leads a row: the cover (play on hover) or the track number (album pages). */
export type TrackLead = 'cover' | 'number'

// Lead, title, [album], [duration], [actions]. Phones drop album. The favorite
// heart sits outside the row, in the page gutter (owner's reference), where
// the gutter is wide enough; narrower pages (compact widths, an open listening
// panel, phones) leave it no room from the sidebar or the screen edge, so
// there rows open a heart lane of their own (owner, rounds 9 and 14).

/** Rows and their header, where the gutter is narrow, when the list shows favorite hearts. */
export const HEART_LANE = 'compact:pl-40 listening:pl-40 phone:pl-24'
const COLUMNS = {
  'cover:album+duration':
    'grid-cols-[40px_minmax(100px,1fr)_minmax(70px,.55fr)_46px] phone:grid-cols-[34px_minmax(0,1fr)_30px]',
  'cover:album+duration+actions':
    'grid-cols-[40px_minmax(100px,1fr)_minmax(70px,.55fr)_46px_28px] phone:grid-cols-[34px_minmax(0,1fr)_30px_25px]',
  'cover:album': 'grid-cols-[40px_minmax(100px,1fr)_minmax(70px,.55fr)] phone:grid-cols-[34px_minmax(0,1fr)]',
  'cover:album+actions':
    'grid-cols-[40px_minmax(100px,1fr)_minmax(70px,.55fr)_28px] phone:grid-cols-[34px_minmax(0,1fr)_25px]',
  'cover:duration': 'grid-cols-[40px_minmax(100px,1fr)_46px] phone:grid-cols-[34px_minmax(0,1fr)_30px]',
  'cover:duration+actions':
    'grid-cols-[40px_minmax(100px,1fr)_46px_28px] phone:grid-cols-[34px_minmax(0,1fr)_30px_25px]',
  'cover:none': 'grid-cols-[40px_minmax(100px,1fr)] phone:grid-cols-[34px_minmax(0,1fr)]',
  'cover:none+actions': 'grid-cols-[40px_minmax(100px,1fr)_28px] phone:grid-cols-[34px_minmax(0,1fr)_25px]',
  'number:album+duration':
    'grid-cols-[28px_minmax(100px,1fr)_minmax(70px,.55fr)_46px] phone:grid-cols-[22px_minmax(0,1fr)_30px]',
  'number:album+duration+actions':
    'grid-cols-[28px_minmax(100px,1fr)_minmax(70px,.55fr)_46px_28px] phone:grid-cols-[22px_minmax(0,1fr)_30px_25px]',
  'number:album': 'grid-cols-[28px_minmax(100px,1fr)_minmax(70px,.55fr)] phone:grid-cols-[22px_minmax(0,1fr)]',
  'number:album+actions':
    'grid-cols-[28px_minmax(100px,1fr)_minmax(70px,.55fr)_28px] phone:grid-cols-[22px_minmax(0,1fr)_25px]',
  'number:duration': 'grid-cols-[28px_minmax(100px,1fr)_46px] phone:grid-cols-[22px_minmax(0,1fr)_30px]',
  'number:duration+actions':
    'grid-cols-[28px_minmax(100px,1fr)_46px_28px] phone:grid-cols-[22px_minmax(0,1fr)_30px_25px]',
  'number:none': 'grid-cols-[28px_minmax(100px,1fr)] phone:grid-cols-[22px_minmax(0,1fr)]',
  'number:none+actions': 'grid-cols-[28px_minmax(100px,1fr)_28px] phone:grid-cols-[22px_minmax(0,1fr)_25px]',
} as const

export function trackColumns(lead: TrackLead, album: boolean, duration: boolean, actions = false): string {
  const base = album && duration ? 'album+duration' : album ? 'album' : duration ? 'duration' : 'none'
  return COLUMNS[`${lead}:${base}${actions ? '+actions' : ''}`]
}

/** Column names of the muted header row. */
export interface TrackColumnLabels {
  title: string
  album: string
  duration: string
}

/** The muted column header row: same grid and gutters, smaller caps text. */
export const TRACK_HEADER =
  'grid items-center gap-13 px-12 pb-9 text-10 font-[650] tracking-[1.4px] text-muted uppercase phone:gap-9 phone:px-3'

/** Quiet separators between rows (owner's request; the reference had none). */
export const ROW_DIVIDER = 'border-t border-line/70 first:border-t-0'
