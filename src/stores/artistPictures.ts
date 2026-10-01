/**
 * Artists' images (owner, 2026-09-29, enrichment step 3; 2026-10-01: chosen
 * from every allowed source and kept on the player). A photo and a wide
 * background per artist, each by its address at the source with the credit
 * and licence shown beside it.
 *
 * On the listener's request the picker first settles which MusicBrainz
 * artist the name is (a confirmed id is reused; namesakes are offered to
 * choose from), then gathers what the allowed sources hold for that id:
 * the Wikimedia Commons file MusicBrainz links (else the artist's Wikidata
 * image) and fanart.tv's photos and backgrounds, each with a small preview.
 * The choice and the id are kept in the player's store (`artist_images`,
 * `musicbrainz`) when this browser is paired, so every browser shows them;
 * otherwise in this browser. Image bytes never go to the player: each
 * browser reads them from the source (once the source is allowed) and keeps
 * them in IndexedDB.
 *
 * When an image source works automatically, an artist's page without an
 * image takes the best of what those sources hold, by the id MusicBrainz is
 * sure of, and keeps it in this browser only. Photos kept before the choice
 * existed stay as they were. Where an artist has none, the cover of its most
 * played album (else its latest) stands in.
 */
import { reactive, readonly, watch } from 'vue'
import { albumScope, recentAlbums, type Album } from '../domain/album'
import { credits } from '../domain/artist'
import { mostPlayed } from '../domain/history'
import { FANART_LICENSE, fanartArtist, fanartBytes, FanartKeyRefused, type FanartImage } from '../gateway/fanart'
import { artistLinks, bestArtist, searchArtists, type ArtistCandidate, type ArtistLinks } from '../gateway/musicbrainz'
import { deleteRecord, putRecord, readCollection } from '../gateway/store'
import { commonsImage, hostOf, imageBytes, wikidataImage } from '../gateway/wikimedia'
import { cacheGet, cacheSet } from '../lib/idb'
import { connection, http, originAllowed } from './connection'
import { albumCover, albumCoverState } from './enrichment'
import { sourceAllowed, sourceAutomatic, sourceKey } from './externalSources'
import { history } from './history'
import { albums, tracks } from './library'
import { artistFacts, artistIdentity, confirmArtist, type ArtistFacts } from './musicbrainzIds'
import { pairingToken } from './pairing'
import { toast } from './ui'

export type ImageRole = 'photo' | 'background'
export type ImageSource = 'wikimedia' | 'fanarttv'

/** An image of an artist with its credit, as the store keeps it. */
export interface ArtistImage {
  source: ImageSource
  url: string
  author: string | null
  license: string | null
  licenseUrl: string | null
  page: string | null
}
/** An image the picker offers: its small copy is drawn for the choice. */
export interface ImageOffer extends ArtistImage {
  role: ImageRole
  preview: string
  previewBlob: Blob | null
}
/** A photo kept in this browser before the choice existed (Commons only). */
export interface ArtistPicture {
  blob: Blob
  author: string | null
  license: string | null
  licenseUrl: string | null
  page: string | null
}
type Credit = Omit<ArtistPicture, 'blob'>
type Chosen = Record<string, Partial<Record<ImageRole, ArtistImage>>>
/** The artist's images without one role. */
const without = (images: Partial<Record<ImageRole, ArtistImage>> | undefined, role: ImageRole) =>
  Object.fromEntries(Object.entries(images ?? {}).filter(([key]) => key !== role)) as Partial<
    Record<ImageRole, ArtistImage>
  >

export type PickerStatus = 'identifying' | 'searching' | 'ready' | 'missing' | 'failed' | 'saving'
interface Picker {
  name: string
  /** What is being chosen (owner, 2026-10-02: a photo and a background are two actions, each its own window). */
  role: ImageRole
  status: PickerStatus
  /** MusicBrainz's artists for the name, once asked. */
  candidates: ArtistCandidate[]
  mbid: string | null
  facts: ArtistFacts | null
  photos: ImageOffer[]
  backgrounds: ImageOffer[]
  /** fanart.tv refused the owner's key. */
  keyRefused: boolean
}

interface PicturesModel {
  /** Chosen on the player, shared by every browser. */
  player: Chosen
  /** Chosen in this browser (not paired, or taken automatically). */
  browser: Chosen
  /** Photos kept before the choice existed. */
  pictures: Record<string, ArtistPicture>
  /** Image bytes by address, once read. */
  bytes: Record<string, Blob>
  /** What this browser keeps has been read. */
  loaded: boolean
  picker: Picker | null
}

const state = reactive<PicturesModel>({ player: {}, browser: {}, pictures: {}, bytes: {}, loaded: false, picker: null })
export const artistPictures = readonly(state)

const LEGACY_INDEX = 'artist-pictures'
const legacyKey = (name: string) => `artist-picture:${name}`
const BROWSER_INDEX = 'artist-images'
const bytesKey = (url: string) => `artist-image:${url}`

/** What this browser keeps, read once at start. */
export async function loadArtistPictures(): Promise<void> {
  const index = (await cacheGet<Record<string, Credit>>(LEGACY_INDEX)) ?? {}
  for (const [name, credit] of Object.entries(index)) {
    const blob = await cacheGet<Blob>(legacyKey(name))
    if (blob) state.pictures[name] = { ...credit, blob }
  }
  state.browser = (await cacheGet<Chosen>(BROWSER_INDEX)) ?? {}
  state.loaded = true
}

interface ImageRecord {
  name: string
  role: string
  source: string
  url: string
  author?: string
  license?: string
  license_url?: string
  page?: string
  at: number
}
const SOURCES: readonly string[] = ['wikimedia', 'fanarttv']

/** The images chosen on the player. */
export async function loadChosenImages(): Promise<void> {
  if (!connection.store) return
  try {
    const records = await readCollection<ImageRecord>(http, 'artist_images')
    const chosen: Chosen = {}
    for (const { value } of records ?? []) {
      if ((value.role !== 'photo' && value.role !== 'background') || !SOURCES.includes(value.source)) continue
      ;(chosen[value.name] ??= {})[value.role] = {
        source: value.source as ImageSource,
        url: value.url,
        author: value.author ?? null,
        license: value.license ?? null,
        licenseUrl: value.license_url ?? null,
        page: value.page ?? null,
      }
    }
    state.player = chosen
  } catch {
    // Unreachable for now: the last choice stays.
  }
}
watch(
  () => connection.store,
  (store) => {
    if (store) void loadChosenImages()
  },
  { immediate: true },
)

/** The release's origin names of the hosts Commons serves pictures from. */
const PICTURE_ORIGINS: Record<string, string> = {
  'thumb.wikimedia.org': 'wikimedia_thumb',
  'upload.wikimedia.org': 'wikimedia_upload',
}
const pictureHostAllowed = (url: string): boolean => {
  const name = PICTURE_ORIGINS[hostOf(url)]
  return name !== undefined && originAllowed(name)
}

/** The release's origins admit MusicBrainz, Commons and a picture host (Wikidata is used when also admitted). */
export const artistPhotoOriginsAdmitted = (): boolean =>
  originAllowed('musicbrainz') &&
  originAllowed('commons') &&
  Object.values(PICTURE_ORIGINS).some((name) => originAllowed(name))
/** The release's origins admit MusicBrainz and fanart.tv's API and images. */
export const fanartOriginsAdmitted = (): boolean =>
  originAllowed('musicbrainz') && originAllowed('fanart_api') && originAllowed('fanart_assets')

const reachable: Record<ImageSource, () => boolean> = {
  wikimedia: () => sourceAllowed('wikimedia') && artistPhotoOriginsAdmitted(),
  fanarttv: () => sourceAllowed('fanarttv') && fanartOriginsAdmitted(),
}
/** Images may be looked up: an image source is allowed and admitted. */
export const artistImagesAllowed = (): boolean => reachable.wikimedia() || reachable.fanarttv()
/** Kept for the album and settings pages' wording: Commons may be asked. */
export const artistPhotosAllowed = (): boolean => reachable.wikimedia()

/** Reads at most two images at a time, each once. */
const pending = new Set<string>()
const waiting: (() => Promise<void>)[] = []
let running = 0
function enqueue(task: () => Promise<void>): void {
  waiting.push(task)
  drain()
}
function drain(): void {
  while (running < 2 && waiting.length) {
    const task = waiting.shift()
    if (!task) break
    running++
    void task().finally(() => {
      running--
      drain()
    })
  }
}
const download = (source: ImageSource, url: string): Promise<Blob | null> =>
  source === 'fanarttv' ? fanartBytes(url) : pictureHostAllowed(url) ? imageBytes(url) : Promise.resolve(null)

/** Reads a chosen image's bytes: from this browser, else from its source once that is allowed. */
function want(image: ArtistImage): void {
  if (state.bytes[image.url] || pending.has(image.url)) return
  pending.add(image.url)
  enqueue(async () => {
    try {
      const kept = await cacheGet<Blob>(bytesKey(image.url))
      const blob = kept ?? (reachable[image.source]() ? await download(image.source, image.url) : null)
      if (!blob) return
      state.bytes[image.url] = blob
      if (!kept) await cacheSet(bytesKey(image.url), blob)
    } catch {
      // Not now: an allowed source is asked again next time.
    } finally {
      pending.delete(image.url)
    }
  })
}

/** The image chosen for an artist's role, and where it is kept. */
export function chosenImage(name: string, role: ImageRole): { image: ArtistImage; kept: 'player' | 'browser' } | null {
  const player = state.player[name]?.[role]
  if (player) return { image: player, kept: 'player' }
  const browser = state.browser[name]?.[role]
  return browser ? { image: browser, kept: 'browser' } : null
}
function chosenBytes(name: string, role: ImageRole): Blob | null {
  const chosen = chosenImage(name, role)
  if (!chosen) return null
  const blob = state.bytes[chosen.image.url]
  if (!blob) want(chosen.image)
  return blob ?? null
}
/** The artist has a photo of its own, chosen or kept from before. */
export const hasArtistPhoto = (name: string): boolean =>
  chosenImage(name, 'photo') !== null || state.pictures[name] !== undefined

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
  const chosen = chosenBytes(name, 'photo')
  if (chosen) return chosen
  const picture = state.pictures[name]
  if (picture) return picture.blob
  const stand = standInAlbum(name)
  return stand ? albumCover(stand.album, stand.scope) : null
}
/** The wide background chosen for an artist's page, once read. */
export const artistBackground = (name: string): Blob | null => chosenBytes(name, 'background')

const fanartOffer = (role: ImageRole, mbid: string, image: FanartImage): ImageOffer => ({
  role,
  source: 'fanarttv',
  url: image.url,
  preview: image.preview,
  previewBlob: null,
  author: null,
  license: FANART_LICENSE.name,
  licenseUrl: FANART_LICENSE.url,
  page: `https://fanart.tv/artist/${mbid}/`,
})

/** What the allowed sources hold for an artist's MusicBrainz id: photos and backgrounds, best first. */
async function offersFor(
  mbid: string,
  links: ArtistLinks | null,
  use: Record<ImageSource, boolean>,
): Promise<{ photos: ImageOffer[]; backgrounds: ImageOffer[]; keyRefused: boolean }> {
  const commons = async (): Promise<ImageOffer[]> => {
    if (!use.wikimedia || !links) return []
    const file =
      links.commonsFile ?? (links.wikidata && originAllowed('wikidata') ? await wikidataImage(links.wikidata) : null)
    const image = file ? await commonsImage(file) : null
    const url = image?.urls.find(pictureHostAllowed)
    if (!image || !url) return []
    const { author, license, licenseUrl, page } = image
    return [
      { role: 'photo', source: 'wikimedia', url, preview: url, previewBlob: null, author, license, licenseUrl, page },
    ]
  }
  let keyRefused = false
  const fanart = async () => {
    const key = sourceKey('fanarttv')
    if (!use.fanarttv || !key) return null
    try {
      return await fanartArtist(mbid, key)
    } catch (error) {
      if (!(error instanceof FanartKeyRefused)) throw error
      keyRefused = true
      return null
    }
  }
  const [photos, art] = await Promise.all([commons(), fanart()])
  return {
    photos: [...(art?.thumbs ?? []).slice(0, 12).map((image) => fanartOffer('photo', mbid, image)), ...photos],
    backgrounds: (art?.backgrounds ?? []).slice(0, 12).map((image) => fanartOffer('background', mbid, image)),
    keyRefused,
  }
}

const readPreview = (offer: ImageOffer): Promise<Blob | null> =>
  offer.source === 'fanarttv' ? fanartBytes(offer.preview) : imageBytes(offer.preview)

/** Gathers the offers for the picker's artist and reads their previews. */
async function gather(picker: Picker): Promise<void> {
  const mbid = picker.mbid
  if (!mbid) return
  picker.status = 'searching'
  picker.photos = []
  picker.backgrounds = []
  picker.keyRefused = false
  try {
    const links = await artistLinks(mbid)
    const candidate = picker.candidates.find((item) => item.id === mbid)
    picker.facts = candidate
      ? artistFacts(candidate, links)
      : picker.facts && links
        ? { ...picker.facts, links: artistFacts({ ...emptyCandidate, id: mbid }, links).links }
        : picker.facts
    const found = await offersFor(mbid, links, { wikimedia: reachable.wikimedia(), fanarttv: reachable.fanarttv() })
    if (state.picker !== picker || picker.mbid !== mbid) return
    picker.photos = found.photos
    picker.backgrounds = found.backgrounds
    picker.keyRefused = found.keyRefused
    picker.status = found.photos.length || found.backgrounds.length ? 'ready' : 'missing'
    for (const offer of [...picker.photos, ...picker.backgrounds])
      enqueue(async () => {
        offer.previewBlob = await readPreview(offer).catch(() => null)
      })
  } catch {
    if (state.picker === picker && picker.mbid === mbid) picker.status = 'failed'
  }
}
const emptyCandidate: ArtistCandidate = {
  id: '',
  name: '',
  sortName: null,
  type: null,
  country: null,
  begin: null,
  end: null,
  disambiguation: null,
  aliases: [],
  score: 0,
}

/** Opens the picker for an artist: its confirmed id, else the artist MusicBrainz takes for the name. */
export async function openArtistImages(name: string, role: ImageRole = 'photo'): Promise<void> {
  if (!artistImagesAllowed()) return
  const known = artistIdentity(name)
  state.picker = {
    name,
    role,
    status: 'identifying',
    candidates: [],
    mbid: known?.mbid ?? null,
    facts: known?.facts ?? null,
    photos: [],
    backgrounds: [],
    keyRefused: false,
  }
  const picker = state.picker
  if (known) {
    await gather(picker)
    return
  }
  await listArtists()
  const best = bestArtist(picker.candidates, name) ?? picker.candidates[0]
  if (state.picker !== picker) return
  if (!best) {
    if (picker.status === 'identifying') picker.status = 'missing'
    return
  }
  picker.mbid = best.id
  await gather(picker)
}

/** The artists MusicBrainz offers for the picker's name, for "Another artist". */
export async function listArtists(): Promise<void> {
  const picker = state.picker
  if (!picker || picker.candidates.length) return
  try {
    const candidates = await searchArtists(picker.name)
    if (state.picker === picker) picker.candidates = candidates
  } catch {
    if (state.picker === picker) picker.status = 'failed'
  }
}

/** The listener says which MusicBrainz artist the name is. */
export async function chooseArtist(mbid: string): Promise<void> {
  const picker = state.picker
  if (!picker || picker.mbid === mbid || !picker.candidates.some((item) => item.id === mbid)) return
  picker.mbid = mbid
  picker.facts = null
  await gather(picker)
}

export function closeArtistImages(): void {
  state.picker = null
}

async function saveBrowser(): Promise<void> {
  await cacheSet(BROWSER_INDEX, JSON.parse(JSON.stringify(state.browser)) as Chosen)
}

const recordOf = (name: string, role: ImageRole, image: ArtistImage) => ({
  name: name.slice(0, 255),
  role,
  source: image.source,
  url: image.url,
  ...(image.author ? { author: image.author.slice(0, 255) } : {}),
  ...(image.license ? { license: image.license.slice(0, 64) } : {}),
  ...(image.licenseUrl?.startsWith('https://') ? { license_url: image.licenseUrl } : {}),
  ...(image.page?.startsWith('https://') ? { page: image.page } : {}),
  at: Math.floor(Date.now() / 1000),
})
const imageOf = ({ source, url, author, license, licenseUrl, page }: ArtistImage): ArtistImage => ({
  source,
  url,
  author,
  license,
  licenseUrl,
  page,
})

/**
 * Keeps the picker's choice: the artist's MusicBrainz id and the chosen
 * images, on the player when this browser is paired (else in this browser),
 * and the images' bytes in this browser.
 */
export async function saveArtistImages(choice: Partial<Record<ImageRole, ImageOffer>>): Promise<void> {
  const picker = state.picker
  if (!picker?.mbid || picker.status === 'saving') return
  const { name, mbid } = picker
  const roles = (['photo', 'background'] as const).filter((role) => choice[role])
  if (!roles.length) return
  picker.status = 'saving'
  try {
    for (const role of roles) {
      const offer = choice[role] as ImageOffer
      const blob = await download(offer.source, offer.url)
      if (!blob) throw new Error('The image could not be read')
      state.bytes[offer.url] = blob
      await cacheSet(bytesKey(offer.url), blob)
    }
    const facts = picker.facts ?? artistFacts({ ...emptyCandidate, id: mbid, name }, null)
    const onPlayer = await confirmArtist(name, mbid, facts)
    const token = pairingToken()
    let kept: 'player' | 'browser' = 'player'
    for (const role of roles) {
      const image = imageOf(choice[role] as ImageOffer)
      const outcome =
        onPlayer && token ? await putRecord(http, 'artist_images', recordOf(name, role, image), token) : null
      if (outcome === 'confirmed') {
        state.player = { ...state.player, [name]: { ...state.player[name], [role]: image } }
        state.browser = { ...state.browser, [name]: without(state.browser[name], role) }
      } else {
        kept = 'browser'
        state.browser = { ...state.browser, [name]: { ...state.browser[name], [role]: image } }
      }
    }
    await saveBrowser()
    toast(kept === 'player' ? 'images_kept_on_player' : 'images_kept_in_browser')
    if (state.picker === picker) state.picker = null
  } catch {
    if (state.picker === picker) picker.status = 'ready'
    toast('images_save_failed', true)
  }
}

/** Forgets an artist's chosen image (on the player when it is kept there, with the serial number). */
export async function forgetArtistImage(name: string, role: ImageRole): Promise<void> {
  const chosen = chosenImage(name, role)
  if (chosen?.kept === 'player') {
    const token = pairingToken()
    if (!token) {
      toast('pair_to_control', true)
      return
    }
    const outcome = await deleteRecord(http, 'artist_images', { name, role }, token).catch(() => 'uncertain' as const)
    if (outcome !== 'confirmed') {
      toast('result_unconfirmed_the_command_was_not_retried', true)
      return
    }
    state.player = { ...state.player, [name]: without(state.player[name], role) }
    await loadChosenImages()
  } else if (chosen) {
    state.browser = { ...state.browser, [name]: without(state.browser[name], role) }
    await saveBrowser()
  } else if (role === 'photo' && state.pictures[name]) {
    state.pictures = Object.fromEntries(Object.entries(state.pictures).filter(([key]) => key !== name))
    await cacheSet(legacyKey(name), null)
    await cacheSet(
      LEGACY_INDEX,
      Object.fromEntries(
        Object.entries(state.pictures).map(([key, { author, license, licenseUrl, page }]) => [
          key,
          { author, license, licenseUrl, page },
        ]),
      ),
    )
  }
}

/** Artists looked up automatically in this tab, so a page opened again does not ask again. */
const tried = new Set<string>()

/**
 * The artist's page opened without an image: the sources that work
 * automatically are asked by the id MusicBrainz is sure of, and the best
 * photo (fanart.tv's most liked, else Commons) and background are kept in
 * this browser.
 */
export async function lookUpArtistImagesAutomatically(name: string): Promise<void> {
  const use = {
    wikimedia: sourceAutomatic('wikimedia') && artistPhotoOriginsAdmitted(),
    fanarttv: sourceAutomatic('fanarttv') && fanartOriginsAdmitted(),
  }
  if (!state.loaded || tried.has(name) || hasArtistPhoto(name) || (!use.wikimedia && !use.fanarttv)) return
  tried.add(name)
  try {
    const mbid = artistIdentity(name)?.mbid ?? bestArtist(await searchArtists(name), name)?.id
    if (!mbid) return
    const links = use.wikimedia ? await artistLinks(mbid) : null
    const found = await offersFor(mbid, links, use)
    const picks = { photo: found.photos[0], background: found.backgrounds[0] }
    for (const role of ['photo', 'background'] as const) {
      const offer = picks[role]
      if (!offer || chosenImage(name, role)) continue
      const blob = await download(offer.source, offer.url)
      if (!blob) continue
      state.bytes[offer.url] = blob
      await cacheSet(bytesKey(offer.url), blob)
      state.browser = { ...state.browser, [name]: { ...state.browser[name], [role]: imageOf(offer) } }
    }
    await saveBrowser()
  } catch {
    // Quietly: the listener can still choose on request.
  }
}
