/**
 * Column templates of a track row, shared by rows and their skeletons so a
 * loaded list replaces its placeholder without moving. Album and duration
 * columns exist only when some row knows them (reference .no-album and
 * .no-duration).
 */
export const TRACK_ROW = 'grid items-center gap-13 rounded-8 px-12 py-10 text-11 phone:gap-9 phone:px-3'

export function trackColumns(album: boolean, duration: boolean): string {
  if (album && duration)
    return 'grid-cols-[28px_40px_minmax(100px,1fr)_minmax(70px,.55fr)_46px] phone:grid-cols-[19px_34px_minmax(0,1fr)_30px]'
  if (album)
    return 'grid-cols-[28px_40px_minmax(100px,1fr)_minmax(70px,.55fr)] phone:grid-cols-[19px_34px_minmax(0,1fr)]'
  if (duration) return 'grid-cols-[28px_40px_minmax(100px,1fr)_46px] phone:grid-cols-[19px_34px_minmax(0,1fr)_30px]'
  return 'grid-cols-[28px_40px_minmax(100px,1fr)] phone:grid-cols-[19px_34px_minmax(0,1fr)]'
}
