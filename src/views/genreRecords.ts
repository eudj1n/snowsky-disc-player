/**
 * A genre's first two albums as records, with their covers where known (asked
 * for otherwise): the genre tiles and the genre page's heading show them.
 */
import { albumScope } from '../domain/album'
import { albumCover } from '../stores/enrichment'
import { albums } from '../stores/library'

export function genreRecords(titles: readonly string[]): { title: string; cover: Blob | null }[] {
  return titles.slice(0, 2).map((title) => {
    const album = albums.value.find((item) => item.title === title)
    return { title, cover: album ? albumCover(album, albumScope(album)) : null }
  })
}
