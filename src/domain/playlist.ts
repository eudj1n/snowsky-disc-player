/** A custom playlist from the stock library database. */
export interface Playlist {
  /** CUSTOM_PLAYLIST_INDEX.ID (database identity). */
  id: number
  /** Stock list position used by playlist commands. */
  listId: number
  name: string
  trackCount: number
}
