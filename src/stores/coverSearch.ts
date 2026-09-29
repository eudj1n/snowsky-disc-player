/**
 * A cover for an album without one (owner, 2026-09-29, enrichment step 2;
 * Cover Art Archive is the only source). On the listener's request the
 * album's title and artist go to MusicBrainz, the matching release's front
 * cover comes from Cover Art Archive, and it is shown as not yet on the card
 * until the listener saves it into the album's folder as cover.jpg (or .png)
 * through the guarded upload route, which never overwrites. One album at a
 * time; Cover Art Archive's images live on archive.org, which some networks
 * cannot reach, and the page says so.
 */
import { reactive, readonly } from 'vue'
import { albumTracks, type Album } from '../domain/album'
import { coverPlace, pickRelease } from '../domain/covers'
import { CoverUnreachable, frontCover } from '../gateway/coverart'
import { findReleases } from '../gateway/musicbrainz'
import { uploadFile } from '../gateway/upload'
import { originAllowed } from './connection'
import { recheckAlbumCover } from './enrichment'
import { tracks } from './library'
import { run } from './operation'
import { pairingToken } from './pairing'
import { toast } from './ui'

export type CoverSearchStatus = 'idle' | 'searching' | 'found' | 'missing' | 'unreachable' | 'failed'

interface CoverSearchModel {
  /** The album (title group and scope) the search is for. */
  key: string | null
  status: CoverSearchStatus
  cover: Blob | null
  release: { title: string; artist: string; date: string | null } | null
  saving: boolean
}

const state = reactive<CoverSearchModel>({ key: null, status: 'idle', cover: null, release: null, saving: false })
export const coverSearch = readonly(state)

export const coverSearchKey = (album: Album, scope: string | null): string => `${album.key}\u0000${scope ?? ''}`

/** The release's origins admit MusicBrainz, Cover Art Archive and its image hosts. */
export const coverLookupAllowed = (): boolean =>
  ['musicbrainz', 'coverartarchive', 'archive_root', 'archive'].every((name) => originAllowed(name))

export function dismissCover(): void {
  state.key = null
  state.status = 'idle'
  state.cover = null
  state.release = null
}

/** Looks a cover up for the album (its title and artist leave the network). */
export async function lookUpCover(album: Album, scope: string | null): Promise<void> {
  const key = coverSearchKey(album, scope)
  const artist = scope ?? album.artists[0]
  if (!artist || !coverLookupAllowed() || (state.key === key && state.status === 'searching')) return
  state.key = key
  state.status = 'searching'
  state.cover = null
  state.release = null
  try {
    const members = albumTracks(tracks.value, album.title, scope)
    const release = pickRelease(await findReleases(album.title, artist), members.length || null)
    const cover = release ? await frontCover(release) : null
    if (state.key !== key) return
    if (!release || !cover) {
      state.status = 'missing'
      return
    }
    state.cover = cover
    state.release = { title: release.title, artist: release.artist, date: release.date }
    state.status = 'found'
  } catch (error) {
    if (state.key === key) state.status = error instanceof CoverUnreachable ? 'unreachable' : 'failed'
  }
}

/**
 * Saves the found cover into the album's folder: one guarded upload (the
 * player's serial number, a fresh request ID, pacing), never over an
 * existing file, only where the folder holds this album alone.
 */
export async function saveCover(album: Album, scope: string | null): Promise<void> {
  const cover = state.cover
  if (!cover || state.key !== coverSearchKey(album, scope) || state.saving) return
  const place = coverPlace(albumTracks(tracks.value, album.title, scope), tracks.value)
  if ('refused' in place) {
    toast(place.refused === 'shared' ? 'cover_save_shared' : 'cover_save_folders', true)
    return
  }
  const token = pairingToken()
  if (!token) {
    toast('pair_to_control', true)
    return
  }
  const path = `${place.folder}/${cover.type === 'image/png' ? 'cover.png' : 'cover.jpg'}`
  state.saving = true
  try {
    const outcome = await run('upload', async (context) => {
      await context.pace()
      context.guard()
      context.attempted()
      return uploadFile({ file: cover, path, token })
    }).catch(() => 'not-sent' as const)
    if (outcome === 'confirmed') {
      toast('cover_saved')
      dismissCover()
      await recheckAlbumCover(album, scope)
    } else if (outcome === 'exists') toast('cover_save_exists', true)
    else if (outcome === 'busy') toast('please_wait_for_the_current_request')
    else if (outcome === 'no-session') toast('pair_to_control', true)
    else if (outcome === 'uncertain') toast('result_unconfirmed_the_command_was_not_retried', true)
    else toast('cover_save_failed', true)
  } finally {
    state.saving = false
  }
}
