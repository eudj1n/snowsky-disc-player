/**
 * Artists' photos (owner, 2026-09-29, enrichment step 3). On the listener's
 * request an artist's name goes to MusicBrainz; the photo is the Wikimedia
 * Commons file MusicBrainz links as the artist's image, else the image of the
 * artist's Wikidata item, read as a thumbnail with its author and licence,
 * which the page shows beside it. Photos stay in this browser (IndexedDB);
 * nothing is written to the card. Where an artist has none, the cover of its
 * most played album (else its latest) stands in.
 */
import { reactive, readonly } from 'vue'
import { albumScope, recentAlbums, type Album } from '../domain/album'
import { credits } from '../domain/artist'
import { mostPlayed } from '../domain/history'
import { findArtist } from '../gateway/musicbrainz'
import { commonsImage, imageBytes, wikidataImage } from '../gateway/wikimedia'
import { cacheGet, cacheSet } from '../lib/idb'
import { originAllowed } from './connection'
import { albumCover, albumCoverState } from './enrichment'
import { history } from './history'
import { albums, tracks } from './library'

export interface ArtistPicture {
  blob: Blob
  author: string | null
  license: string | null
  licenseUrl: string | null
  page: string | null
}
type Credit = Omit<ArtistPicture, 'blob'>
export type PictureSearch = 'idle' | 'searching' | 'missing' | 'failed'

interface PicturesModel {
  pictures: Record<string, ArtistPicture>
  search: { name: string | null; status: PictureSearch }
}

const state = reactive<PicturesModel>({ pictures: {}, search: { name: null, status: 'idle' } })
export const artistPictures = readonly(state)

const INDEX = 'artist-pictures'
const blobKey = (name: string) => `artist-picture:${name}`

/** The photos kept in this browser, read once at start. */
export async function loadArtistPictures(): Promise<void> {
  const index = (await cacheGet<Record<string, Credit>>(INDEX)) ?? {}
  for (const [name, credit] of Object.entries(index)) {
    const blob = await cacheGet<Blob>(blobKey(name))
    if (blob) state.pictures[name] = { ...credit, blob }
  }
}

async function saveIndex(): Promise<void> {
  const index = Object.fromEntries(
    Object.entries(state.pictures).map(([name, { author, license, licenseUrl, page }]) => [
      name,
      { author, license, licenseUrl, page },
    ]),
  )
  await cacheSet(INDEX, index)
}

/** The release's origins admit MusicBrainz, Commons and its upload host (Wikidata is used when also admitted). */
export const artistPhotosAllowed = (): boolean =>
  ['musicbrainz', 'commons', 'wikimedia_upload'].every((name) => originAllowed(name))

/** Looks the artist's photo up (its name leaves the network) and keeps it in this browser. */
export async function lookUpArtistPicture(name: string): Promise<void> {
  if (!artistPhotosAllowed() || (state.search.name === name && state.search.status === 'searching')) return
  state.search = { name, status: 'searching' }
  try {
    const links = await findArtist(name)
    const file =
      links?.commonsFile ?? (links?.wikidata && originAllowed('wikidata') ? await wikidataImage(links.wikidata) : null)
    const image = file ? await commonsImage(file) : null
    const blob = image ? await imageBytes(image.url) : null
    if (state.search.name !== name) return
    if (!image || !blob) {
      state.search = { name, status: 'missing' }
      return
    }
    state.pictures[name] = {
      blob,
      author: image.author,
      license: image.license,
      licenseUrl: image.licenseUrl,
      page: image.page,
    }
    await cacheSet(blobKey(name), blob)
    await saveIndex()
    state.search = { name: null, status: 'idle' }
  } catch {
    if (state.search.name === name) state.search = { name, status: 'failed' }
  }
}

export async function forgetArtistPicture(name: string): Promise<void> {
  state.pictures = Object.fromEntries(Object.entries(state.pictures).filter(([key]) => key !== name))
  await cacheSet(blobKey(name), null)
  await saveIndex()
}

/**
 * The album that stands for an artist without a photo: its most played
 * albums first, then its latest, the first one with a cover this browser
 * already knows (else the first of them, whose cover is then asked for).
 */
function standInAlbum(name: string): { album: Album; scope: string | null } | null {
  const own = tracks.value.filter((track) => credits(track.artist, name))
  const scoped = (album: Album, artist: string | null) => ({
    album,
    scope: artist && album.trackArtists.includes(artist) ? artist : albumScope(album),
  })
  const played = mostPlayed(own, history.most, 20).flatMap((track) => {
    const album = albums.value.find(
      (item) => item.title === track.album && (!track.artist || item.trackArtists.includes(track.artist)),
    )
    return album ? [scoped(album, track.artist)] : []
  })
  const latest = recentAlbums(
    albums.value.filter((album) => album.artists.some((credit) => credits(credit, name))),
  ).map((album) => scoped(album, name))
  const candidates = [...played, ...latest]
  return candidates.find(({ album, scope }) => albumCoverState(album, scope) === 'found') ?? candidates[0] ?? null
}

/** What an artist's card or heading shows: its photo, else the cover of the album that stands for it. */
export function artistImage(name: string): Blob | null {
  const picture = state.pictures[name]
  if (picture) return picture.blob
  const stand = standInAlbum(name)
  return stand ? albumCover(stand.album, stand.scope) : null
}
