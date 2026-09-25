/**
 * Column templates of a track row, shared by rows and their skeletons so a
 * loaded list replaces its placeholder without moving. Album and duration
 * columns exist only when shown and known (reference .no-album and
 * .no-duration); the optional last column holds the track actions button.
 * Class names stay literal so Tailwind can see them.
 */
export const TRACK_ROW = 'grid items-center gap-13 rounded-8 px-12 py-10 text-11 phone:gap-9 phone:px-3'

const COLUMNS = {
  'album+duration':
    'grid-cols-[28px_40px_minmax(100px,1fr)_minmax(70px,.55fr)_46px] phone:grid-cols-[19px_34px_minmax(0,1fr)_30px]',
  album: 'grid-cols-[28px_40px_minmax(100px,1fr)_minmax(70px,.55fr)] phone:grid-cols-[19px_34px_minmax(0,1fr)]',
  duration: 'grid-cols-[28px_40px_minmax(100px,1fr)_46px] phone:grid-cols-[19px_34px_minmax(0,1fr)_30px]',
  none: 'grid-cols-[28px_40px_minmax(100px,1fr)] phone:grid-cols-[19px_34px_minmax(0,1fr)]',
  'album+duration+actions':
    'grid-cols-[28px_40px_minmax(100px,1fr)_minmax(70px,.55fr)_46px_28px] phone:grid-cols-[19px_34px_minmax(0,1fr)_30px_25px]',
  'album+actions':
    'grid-cols-[28px_40px_minmax(100px,1fr)_minmax(70px,.55fr)_28px] phone:grid-cols-[19px_34px_minmax(0,1fr)_25px]',
  'duration+actions':
    'grid-cols-[28px_40px_minmax(100px,1fr)_46px_28px] phone:grid-cols-[19px_34px_minmax(0,1fr)_30px_25px]',
  'none+actions': 'grid-cols-[28px_40px_minmax(100px,1fr)_28px] phone:grid-cols-[19px_34px_minmax(0,1fr)_25px]',
} as const

export function trackColumns(album: boolean, duration: boolean, actions = false): string {
  const base = album && duration ? 'album+duration' : album ? 'album' : duration ? 'duration' : 'none'
  return COLUMNS[actions ? (`${base}+actions` as const) : base]
}

/** Quiet separators between rows (owner's request; the reference had none). */
export const ROW_DIVIDER = 'border-t border-line/70 first:border-t-0'
