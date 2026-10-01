/**
 * A cover for an album without one (owner, 2026-09-29, enrichment step 2;
 * Cover Art Archive is the only source), once the owner allowed the source
 * (2026-10-01). On the listener's request, or when the album's page opens
 * and the source works automatically, the
 * album's title and artist go to MusicBrainz, the matching release's front
 * cover comes from Cover Art Archive, and it is shown as not yet on the card
 * until the listener saves it into the album's folder as cover.jpg (or .png)
 * through the guarded upload route, which never overwrites. One album at a
 * time; Cover Art Archive's images live on archive.org, which some networks
 * cannot reach, and the page says so.
 *
 * On request the listener chooses (owner, 2026-10-01): the album's editions
 * on MusicBrainz, each with its own front cover from Cover Art Archive, and
 * fanart.tv's covers of their release group when that source is allowed,
 * as small previews. The chosen one becomes the offer above, and the
 * edition (release, group and a few facts) is kept as the album's
 * MusicBrainz identity.
 */
import { reactive, readonly } from 'vue'
import { albumTracks, type Album } from '../domain/album'
import { coverPlace, folderCoverName, pickRelease, rankReleases } from '../domain/covers'
import { coverBytes, CoverUnreachable, frontCover, releaseFront } from '../gateway/coverart'
import { fanartArtist, fanartBytes, FanartKeyRefused } from '../gateway/fanart'
import { listFolder } from '../gateway/files'
import { mediaInfo } from '../gateway/media'
import { findReleases, type ReleaseCandidate } from '../gateway/musicbrainz'
import { uploadFile } from '../gateway/upload'
import { reencode } from '../lib/image'
import { http, originAllowed } from './connection'
import { sourceAllowed, sourceAutomatic, sourceKey } from './externalSources'
import { confirmEdition } from './musicbrainzIds'
import { albumCoverState, recheckAlbumCover } from './enrichment'
import { tracks } from './library'
import { run } from './operation'
import { pairingToken } from './pairing'
import { toast } from './ui'

export type CoverSearchStatus = 'idle' | 'searching' | 'found' | 'missing' | 'unreachable' | 'failed'
export type CoverSource = 'coverartarchive' | 'fanarttv'

/** A cover the picker offers: an edition's own, or fanart.tv's for its release group. */
export interface CoverOffer {
  source: CoverSource
  release: ReleaseCandidate
  preview: string
  url: string
  previewBlob: Blob | null
}
interface CoverPicker {
  key: string
  title: string
  status: 'searching' | 'ready' | 'missing' | 'unreachable' | 'failed'
  offers: CoverOffer[]
  /** fanart.tv refused the owner's key. */
  keyRefused: boolean
}

interface CoverSearchModel {
  /** The album (title group and scope) the search is for. */
  key: string | null
  status: CoverSearchStatus
  cover: Blob | null
  release: { title: string; artist: string; date: string | null; source: CoverSource } | null
  /** The album already has a cover: saving the offer replaces it (the old one goes to the card's trash). */
  replacing: boolean
  saving: boolean
  picker: CoverPicker | null
}

const state = reactive<CoverSearchModel>({
  key: null,
  status: 'idle',
  cover: null,
  release: null,
  replacing: false,
  saving: false,
  picker: null,
})
export const coverSearch = readonly(state)

export const coverSearchKey = (album: Album, scope: string | null): string => `${album.key}\u0000${scope ?? ''}`

/** The release's origins admit MusicBrainz, Cover Art Archive and its image hosts. */
export const coverOriginsAdmitted = (): boolean =>
  ['musicbrainz', 'coverartarchive', 'archive_root', 'archive'].every((name) => originAllowed(name))

/** A cover may be looked up: the origins admit it and the owner allowed the source. */
export const coverLookupAllowed = (): boolean => sourceAllowed('coverartarchive') && coverOriginsAdmitted()
const fanartReachable = (): boolean =>
  sourceAllowed('fanarttv') && originAllowed('fanart_api') && originAllowed('fanart_assets')

/** The album's key for its MusicBrainz identity: the page's album key, with the artist when scoped. */
export const albumIdentityKey = (album: Album, scope: string | null): string =>
  scope ? JSON.stringify([album.key, scope]) : album.key

/** Reads at most three previews at a time. */
const waiting: (() => Promise<void>)[] = []
let running = 0
function enqueue(task: () => Promise<void>): void {
  waiting.push(task)
  drain()
}
function drain(): void {
  while (running < 3 && waiting.length) {
    const next = waiting.shift()
    if (!next) break
    running++
    void next().finally(() => {
      running--
      drain()
    })
  }
}

/** Opens the choice of covers for the album: its editions' own and fanart.tv's for their release groups. */
export async function openCoverPicker(album: Album, scope: string | null): Promise<void> {
  const artist = scope ?? album.artists[0]
  if (!artist || !coverLookupAllowed()) return
  state.picker = {
    key: coverSearchKey(album, scope),
    title: album.title,
    status: 'searching',
    offers: [],
    keyRefused: false,
  }
  // The reactive picker: changes to it show at once.
  const picker = state.picker
  try {
    const members = albumTracks(tracks.value, album.title, scope)
    const editions = rankReleases(await findReleases(album.title, artist), members.length || null)
    const offers: CoverOffer[] = editions.map((release) => ({
      source: 'coverartarchive',
      release,
      preview: releaseFront(release.id, 250),
      url: releaseFront(release.id, 500),
      previewBlob: null,
    }))
    const key = sourceKey('fanarttv')
    const artistId = editions.find((release) => release.artistId)?.artistId
    if (fanartReachable() && key && artistId) {
      try {
        const art = await fanartArtist(artistId, key)
        // Each release group with its best-ranked edition, which the cover is kept against.
        const groups = new Map<string, ReleaseCandidate>()
        for (const release of editions)
          if (release.group && !groups.has(release.group)) groups.set(release.group, release)
        for (const [group, release] of groups)
          for (const image of (art?.covers[group] ?? []).slice(0, 6))
            offers.push({ source: 'fanarttv', release, preview: image.preview, url: image.url, previewBlob: null })
      } catch (error) {
        if (!(error instanceof FanartKeyRefused)) throw error
        picker.keyRefused = true
      }
    }
    if (state.picker !== picker) return
    picker.offers = offers
    picker.status = offers.length ? 'ready' : 'missing'
    let unreachable = 0
    let left = offers.length
    for (const offer of picker.offers)
      enqueue(async () => {
        try {
          offer.previewBlob =
            offer.source === 'fanarttv' ? await fanartBytes(offer.preview) : await coverBytes(offer.preview)
        } catch (error) {
          if (error instanceof CoverUnreachable) unreachable++
        }
        // An edition without a cover of its own is not offered.
        if (!offer.previewBlob) picker.offers = picker.offers.filter((item) => item !== offer)
        if (--left === 0 && !picker.offers.length) picker.status = unreachable ? 'unreachable' : 'missing'
      })
  } catch (error) {
    if (state.picker === picker) picker.status = error instanceof CoverUnreachable ? 'unreachable' : 'failed'
  }
}

export function closeCoverPicker(): void {
  state.picker = null
}

/**
 * The chosen cover becomes the album's offer (not on the card until saved)
 * and its edition the album's MusicBrainz identity.
 */
export async function useCoverOffer(album: Album, scope: string | null, offer: CoverOffer): Promise<void> {
  const key = coverSearchKey(album, scope)
  state.picker = null
  state.key = key
  state.status = 'searching'
  state.cover = null
  state.release = null
  try {
    const cover = offer.source === 'fanarttv' ? await fanartBytes(offer.url) : await coverBytes(offer.url)
    if (state.key !== key) return
    if (!cover) {
      state.status = 'missing'
      return
    }
    state.cover = cover
    const { title, artist, date } = offer.release
    state.release = { title, artist, date, source: offer.source }
    state.replacing = albumCoverState(album, scope) === 'found'
    state.status = 'found'
    void confirmEdition(albumIdentityKey(album, scope), offer.release)
  } catch (error) {
    if (state.key === key) state.status = error instanceof CoverUnreachable ? 'unreachable' : 'failed'
  }
}

/** Albums looked up automatically in this tab, so a page opened again does not ask again. */
const tried = new Set<string>()

/** The album's page opened without a cover: looked up when the source works automatically. */
export function lookUpCoverAutomatically(album: Album, scope: string | null): void {
  const key = coverSearchKey(album, scope)
  if (!sourceAutomatic('coverartarchive') || tried.has(key) || state.status === 'searching') return
  tried.add(key)
  void lookUpCover(album, scope)
}

export function dismissCover(): void {
  state.key = null
  state.status = 'idle'
  state.cover = null
  state.release = null
  state.replacing = false
}

/** Where the album's cover on the card is: in its files, a file of its folder (by name), or none. */
export type CoverOnCard =
  { kind: 'none' } | { kind: 'embedded' } | { kind: 'folder'; name: string } | { kind: 'unknown' }

/** Reads where the album's cover comes from (the first track's media facts, then its folder's names). */
export async function coverOnCard(album: Album, scope: string | null): Promise<CoverOnCard> {
  const members = albumTracks(tracks.value, album.title, scope)
  const first = members.find((track) => track.path && !track.cue)?.path
  const info = first ? await mediaInfo(http, first).catch(() => null) : null
  if (!info) return { kind: 'unknown' }
  if (info.cover === 'embedded') return { kind: 'embedded' }
  if (info.cover === null) return { kind: 'none' }
  const place = coverPlace(members, tracks.value)
  if ('refused' in place) return { kind: 'unknown' }
  const listing = await listFolder(http, place.folder, false, true).catch(() => null)
  const name = listing
    ? folderCoverName(listing.entries.filter((entry) => !entry.folder).map((entry) => entry.name))
    : null
  return name ? { kind: 'folder', name } : { kind: 'unknown' }
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
    state.release = { title: release.title, artist: release.artist, date: release.date, source: 'coverartarchive' }
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
  state.saving = true
  try {
    // A cover already there is replaced under its own name and type, the old file going to the trash
    // (owner, 2026-10-01); one in the files themselves stays until tags can be edited.
    let path = `${place.folder}/${cover.type === 'image/png' ? 'cover.png' : 'cover.jpg'}`
    let file: Blob = cover
    if (state.replacing) {
      const present = await coverOnCard(album, scope)
      if (present.kind !== 'folder') {
        toast(present.kind === 'embedded' ? 'cover_embedded' : 'cover_save_failed', true)
        return
      }
      path = `${place.folder}/${present.name}`
      file = await reencode(cover, /\.png$/i.test(present.name) ? 'image/png' : 'image/jpeg')
    }
    const replace = state.replacing
    const outcome = await run('upload', async (context) => {
      await context.pace()
      context.guard()
      context.attempted()
      return uploadFile({ file, path, token, ...(replace ? { replace: 'trash' as const } : {}) })
    }).catch(() => 'not-sent' as const)
    if (outcome === 'confirmed') {
      toast(replace ? 'cover_replaced' : 'cover_saved')
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
