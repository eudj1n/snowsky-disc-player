/** Counts from the stock library database (data query library_summary). */
export interface LibrarySummary {
  tracks: number
  favorites: number
  playlists: number
  /** Latest ADD_TIME and highest SONG.ID: with the counts, a cheap signature
   * of the library for cache validation. */
  lastAdded: number
  lastId: number
}

export function librarySignature(summary: LibrarySummary): string {
  return [summary.tracks, summary.favorites, summary.playlists, summary.lastAdded, summary.lastId].join(':')
}
