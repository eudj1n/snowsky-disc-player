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

// Lead, title, [album], [heart], [duration], [actions]. Phones drop album. The
// favorite heart is a column of its own right before the duration (owner,
// 2026-09-29, as in Apple Music: the gutter heart and the lane that narrow
// pages opened for it read as stray padding).

/** The row grid takes its columns from two custom properties (see trackColumns). */
export const TRACK_COLUMNS = 'grid-cols-(--track-columns) phone:grid-cols-(--track-columns-phone)'

const LEAD = { cover: ['40px', '34px'], number: ['28px', '22px'] } as const

/**
 * The column templates of a row, its header and its skeleton, wide and on
 * phones, as custom properties for TRACK_COLUMNS (a style binding, so every
 * combination needs no class of its own).
 */
export function trackColumns(
  lead: TrackLead,
  album: boolean,
  duration: boolean,
  actions = false,
  heart = false,
): Record<'--track-columns' | '--track-columns-phone', string> {
  const [wide, phone] = LEAD[lead]
  const columns = (parts: (string | false)[]) => parts.filter((part) => part !== false).join(' ')
  return {
    '--track-columns': columns([
      wide,
      'minmax(100px,1fr)',
      album && 'minmax(70px,.55fr)',
      heart && '28px',
      duration && '46px',
      actions && '28px',
    ]),
    '--track-columns-phone': columns([phone, 'minmax(0,1fr)', heart && '22px', duration && '30px', actions && '25px']),
  }
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
