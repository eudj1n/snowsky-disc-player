// Fictional collection for the mock gateway. Album, artist and track names
// come from the reference DISC Web demo (original fictional content of
// snowsky-disc-qemu, MIT); nothing here describes a real library.
const ALBUMS = [
  [
    'Afterglow',
    'Northline',
    'Electronic',
    ['First Light', 'Afterglow', 'Soft Focus', 'Somewhere, Slowly', 'Stay a Little Longer'],
  ],
  ['Тихий океан', 'Берег', 'Indie', ['Волны', 'На другом берегу', 'Тихий океан', 'Тёплый ветер']],
  ['Blue Hours', 'Mira Sol', 'Jazz', ['Blue Hours', 'Almost Sunday', 'Window Seat', 'An Open Door']],
  ['Inner Space', 'Forma', 'Ambient', ['Orbit', 'Weightless', 'Inner Space', 'Still Here']],
  ['Velvet Season', 'June & the City', 'Soul', ['Velvet Season', 'Slow Motion', 'Golden', 'Home Again']],
  ['Patterns', 'Parallel Lines', 'Electronic', ['Patterns', 'Side by Side', 'In Between', 'A New Shape']],
  ['Лето внутри', 'Поля', 'Indie', ['Лето внутри', 'Вишнёвый сад', 'Там, где свет', 'По пути домой']],
  ['Daybreak', 'Sundial', 'Alternative', ['Daybreak', 'Wide Open', 'Good Things', 'Better Days']],
  // Older additions: a second Mira Sol album that shares its title with
  // Northline's (the stock groups albums by title), and a second Northline one.
  ['Afterglow', 'Mira Sol', 'Jazz', ['Late Train', 'Afterglow (Reprise)'], 1_780_000_000],
  ['Night Drive', 'Northline', 'Electronic', ['Night Drive', 'City Glow', 'Last Exit'], 1_780_100_000],
]

export const TRACKS = ALBUMS.flatMap(([album, artist, genre, songs, addedBase = 1_790_000_000], a) =>
  songs.map((title, i) => ({
    ID: a * 10 + i + 1,
    PATH: `/tmp/sdcard/${artist} - ${album}/${String(i + 1).padStart(2, '0')} ${title}.flac`,
    NAME: `${String(i + 1).padStart(2, '0')} ${title}.flac`,
    TITLE: title,
    ALBUM: album,
    ARTIST: artist,
    ALBUM_ARTIST: artist,
    GENRE: genre,
    DISC: 1,
    TRACK: i + 1,
    DURATION: 150_000 + ((a * 37 + i * 53) % 120) * 1000,
    SAMPLE_RATE: 44100,
    BIT_PER_SAMPLE: 16,
    CHANNELS: 2,
    BIT_RATE: 0,
    SONG_MIMETYPE: null,
    SONG_PRODUCTION_YEAR: null,
    IS_CUE: 0,
    IS_ISO: 0,
    IS_DSD: 0,
    IS_M3U: 0,
    M3U_PATH: null,
    OFFSET: 0,
    ADD_TIME: addedBase + a * 1000 + i,
  })),
)

// One mixed-genre album: a Soul album with a Jazz track, for genre-album scopes.
const golden = TRACKS.find((track) => track.TITLE === 'Golden')
if (golden) golden.GENRE = 'Jazz'

export const FAVORITES = TRACKS.filter((track) => [2, 21, 43, 62].includes(track.ID))

export const PLAYLISTS = [
  { ID: 1, LIST_ID: 0, LIST_NAME: 'Evening', M3U_PATH: null, members: TRACKS.filter((_, i) => i % 4 === 0) },
  { ID: 2, LIST_ID: 1, LIST_NAME: 'Road trip', M3U_PATH: null, members: TRACKS.filter((_, i) => i % 5 === 1) },
]

const COLUMNS = Object.keys(TRACKS[0])

function table(rows, columns) {
  return { columns, rows: rows.map((row) => columns.map((column) => row[column] ?? null)) }
}

function page(rows, params) {
  const limit = Number(params.get('limit'))
  const offset = Number(params.get('offset'))
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0) return null
  return rows.slice(offset, offset + limit)
}

/** Data-level queries: returns { status, body }. */
export function dataQuery(name, params, language) {
  const tracks = (rows) => {
    const selected = page(rows, params)
    return selected ? { status: 200, body: table(selected, COLUMNS) } : { status: 400, body: 'Invalid parameters\n' }
  }
  if (name === 'system_settings')
    return { status: 200, body: table([{ LANGUAGE: language, BATTERY: 100 }], ['LANGUAGE', 'BATTERY']) }
  if (name === 'library_summary') {
    const row = {
      tracks: TRACKS.length,
      favorites: FAVORITES.length,
      playlists: PLAYLISTS.length,
      queue: 5,
      last_added: 0,
      last_id: TRACKS.length,
    }
    return { status: 200, body: table([row], Object.keys(row)) }
  }
  if (name === 'tracks') return tracks(TRACKS)
  if (name === 'favorites') return tracks(FAVORITES)
  if (name === 'playlists') {
    const rows = PLAYLISTS.map((list) => ({ ...list, tracks: list.members.length }))
    return { status: 200, body: table(rows, ['ID', 'LIST_ID', 'LIST_NAME', 'M3U_PATH', 'tracks']) }
  }
  if (name === 'recently_played') {
    const rows = [TRACKS[9], TRACKS[2], TRACKS[21]].map((track, i) => ({
      ...track,
      PLAY_COUNT: 3 - i,
      LAST_PLAY_TIME: 1_790_100_000 - i * 60,
    }))
    return { status: 200, body: table(rows, [...COLUMNS, 'PLAY_COUNT', 'LAST_PLAY_TIME']) }
  }
  if (name === 'playlist_tracks') {
    const list = PLAYLISTS.find((item) => item.ID === Number(params.get('id')))
    return list ? tracks(list.members) : { status: 200, body: table([], COLUMNS) }
  }
  return { status: 404, body: 'Unknown query\n' }
}

/** Stock catalog sources: rows in stock order for a category. */
export function catalogSource(headers) {
  if (headers.type === 'custom/song') return PLAYLISTS[Number(headers.src_list_id)]?.members ?? []
  if (headers.type === 'all/song') return TRACKS
  if (headers.type === 'love/song') return FAVORITES
  if (headers.type === 'album/song' && headers.album !== undefined) {
    const album = decodeURIComponent(headers.album)
    return TRACKS.filter((track) => track.ALBUM === album)
  }
  if (headers.type === 'artist/album/song' && headers.album !== undefined && headers.artist !== undefined) {
    return artistAlbum(decodeURIComponent(headers.artist), decodeURIComponent(headers.album))
  }
  if (headers.type === 'artist/song' && headers.artist !== undefined) {
    const artist = decodeURIComponent(headers.artist)
    return TRACKS.filter((track) => track.ARTIST === artist)
  }
  if (headers.type === 'style/song' && headers.style !== undefined)
    return genre(decodeURIComponent(headers.style), null)
  if (headers.type === 'style/album/song' && headers.style !== undefined && headers.album !== undefined) {
    return genre(decodeURIComponent(headers.style), decodeURIComponent(headers.album))
  }
  return null
}

/** One artist's tracks of an album title (stock type 7 membership). */
export function artistAlbum(artist, album) {
  return TRACKS.filter((track) => track.ALBUM === album && track.ARTIST === artist)
}

/** A genre's tracks, optionally narrowed to one album title (stock type 8/10 membership). */
export function genre(style, album) {
  return TRACKS.filter((track) => track.GENRE === style && (album === null || track.ALBUM === album))
}

/** One page of a stock category, or null when the category is not modelled. */
export function catalogPage(headers, rowsOverride) {
  if (headers.type === 'custom') {
    const start = Number(headers['start-pos'] ?? 0)
    const count = Number(headers['num-max'] ?? 200)
    const lists = PLAYLISTS.map((list, pos) => ({ pos, name: list.LIST_NAME, count: list.members.length }))
    return { rows: lists.slice(start, start + count), total: lists.length }
  }
  const rows = rowsOverride ?? catalogSource(headers)
  if (!rows) return null
  const start = Number(headers['start-pos'] ?? 0)
  const count = Number(headers['num-max'] ?? 200)
  return {
    rows: rows.slice(start, start + count).map((track) => ({ name: track.TITLE, author: track.ARTIST })),
    total: rows.length,
  }
}

/** Adds a file published by an upload to the library, as a scan would. */
export function indexUpload(path, size) {
  const parts = path.replace('/tmp/sdcard/', '').split('/')
  const name = parts.at(-1) ?? path
  const album = parts.length > 1 ? parts.at(-2) : null
  const id = Math.max(...TRACKS.map((track) => track.ID)) + 1
  TRACKS.push({
    ...TRACKS[0],
    ID: id,
    PATH: path,
    NAME: name,
    TITLE: name.replace(/\.[^.]+$/, ''),
    ALBUM: album,
    ARTIST: 'Imported',
    ALBUM_ARTIST: 'Imported',
    TRACK: 1,
    DURATION: 0,
    ADD_TIME: Math.floor(Date.now() / 1000),
    SIZE: size,
  })
}
