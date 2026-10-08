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
  // Two discs, and a joint credit that stock keeps as one artist string. Its genre
  // is another spelling of Alternative (case and a trailing space), as tags vary.
  ['Two Rooms', 'Kite Lines', 'alternative ', ['Opening', 'Hallway', 'Closing', 'Encore'], 1_780_200_000],
  // A joint album: every track credits both artists, as one stock artist string.
  ['Shared Light', 'Kite Lines; Mira Sol', 'Alternative', ['Two Voices', 'Common Ground'], 1_780_300_000],
  // A long album name, which stock's play state cuts short (mock-gateway.mjs).
  ['Quiet Meridian (The Complete Anniversary Recordings)', 'Sundial', 'Ambient', ['Meridian Line'], 1_780_400_000],
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

// The database knows no duration for these (the media route supplies them).
for (const track of TRACKS) if (track.ALBUM === 'Тихий океан') track.MEDIA_DURATION = track.DURATION
for (const track of TRACKS) if (track.ALBUM === 'Тихий океан') track.DURATION = 0

for (const [index, track] of TRACKS.filter((item) => item.ALBUM === 'Two Rooms').entries()) {
  track.DISC = index < 2 ? 1 : 2
  track.TRACK = (index % 2) + 1
  if (track.TITLE === 'Hallway') track.ARTIST = 'Kite Lines; Mira Sol'
}

// A guest on one track of another's album, known from nowhere else: the Artists page shows it under All only.
const wideOpen = TRACKS.find((track) => track.TITLE === 'Wide Open')
if (wideOpen) wideOpen.ARTIST = 'Sundial; Lumi Vale'

// DATE tags the files carry (stock keeps no year).
const DATES = { 'Inner Space': '2019-03-01', 'Two Rooms': '2021' }

// One mixed-genre album: a Soul album with a Jazz track, for genre-album scopes.
const golden = TRACKS.find((track) => track.TITLE === 'Golden')
if (golden) golden.GENRE = 'Jazz'

export const FAVORITES = TRACKS.filter((track) => [2, 21, 43, 62].includes(track.ID))
// A favorite whose file was deleted from the card since: stock keeps it in MY_LOVE.
FAVORITES.push({
  ...TRACKS[0],
  ID: 9001,
  PATH: '/tmp/sdcard/Vanished - Gone Album/01 Gone Song.flac',
  NAME: '01 Gone Song.flac',
  TITLE: 'Gone Song',
  ALBUM: 'Gone Album',
  ARTIST: 'Vanished',
  GENRE: 'Ambient',
})

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
export function dataQuery(name, params, language, queue = [], memory = null) {
  const tracks = (rows) => {
    const selected = page(rows, params)
    return selected ? { status: 200, body: table(selected, COLUMNS) } : { status: 400, body: 'Invalid parameters\n' }
  }
  if (name === 'system_settings')
    return { status: 200, body: table([{ LANGUAGE: language, BATTERY: 87 }], ['LANGUAGE', 'BATTERY']) }
  if (name === 'library_summary') {
    const row = {
      tracks: TRACKS.length,
      favorites: FAVORITES.length,
      playlists: PLAYLISTS.length,
      queue_table: 1,
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
  if (name === 'recently_played' || name === 'most_played') {
    // Stock's play history: most recent first; most played sorts by count.
    const rows = [TRACKS[9], TRACKS[2], TRACKS[21], TRACKS[10]].map((track, i) => ({
      ...track,
      PLAY_COUNT: [2, 1, 7, 1][i],
      LAST_PLAY_TIME: 1_790_100_000 - i * 60,
    }))
    if (name === 'most_played') rows.sort((a, b) => b.PLAY_COUNT - a.PLAY_COUNT || b.LAST_PLAY_TIME - a.LAST_PLAY_TIME)
    return { status: 200, body: table(rows, [...COLUMNS, 'PLAY_COUNT', 'LAST_PLAY_TIME']) }
  }
  // The persisted queue (LIST_SONG_0) with paths, in queue order.
  // LIST_SONG_0 rows have IDs of their own (1…n), which MEMORY_PLAY points at.
  if (name === 'queue') {
    const rows = queue.map((track, index) => ({
      ...track,
      ID: index + 1,
      POS_ID: index + 1,
      SONG_TYPE: memory?.type ?? 3,
    }))
    return { status: 200, body: table(rows, [...COLUMNS, 'POS_ID', 'SONG_TYPE']) }
  }
  if (name === 'resume_point') {
    const columns = ['MUSIC_ID', 'IS_PLAYING', 'POSITION', 'IS_CUE', 'IS_ISO', 'TRACK', 'IS_NAS', 'IS_M3U']
    const rows = memory
      ? [{ MUSIC_ID: memory.row, IS_PLAYING: 1, POSITION: 0, IS_CUE: 0, IS_ISO: 0, TRACK: 0, IS_NAS: 0, IS_M3U: null }]
      : []
    return { status: 200, body: table(rows, columns) }
  }
  if (name === 'playlist_tracks') {
    // Like stock: the query addresses CUSTOM_PLAYLIST_INDEX.LIST_ID, not the row ID.
    const list = PLAYLISTS.find((item) => item.LIST_ID === Number(params.get('id')))
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
/**
 * Album name lists (stock types album, artist/album and style/album): each
 * title once, whole. The page reads one to confirm a play whose album stock
 * reports cut short (a long title).
 */
function albumNames(headers) {
  let source
  if (headers.type === 'album') source = TRACKS
  else if (headers.type === 'artist/album' && headers.artist !== undefined)
    source = TRACKS.filter((track) => track.ARTIST === decodeURIComponent(headers.artist))
  else if (headers.type === 'style/album' && headers.style !== undefined)
    source = TRACKS.filter((track) => track.GENRE === decodeURIComponent(headers.style))
  else return null
  const titles = new Map()
  for (const track of source)
    if (track.ALBUM && !titles.has(track.ALBUM)) titles.set(track.ALBUM, { name: track.ALBUM, author: track.ARTIST })
  return [...titles.values()]
}

export function catalogPage(headers, rowsOverride) {
  const albums = rowsOverride ? null : albumNames(headers)
  if (albums) {
    const start = Number(headers['start-pos'] ?? 0)
    const count = Number(headers['num-max'] ?? 200)
    return { rows: albums.slice(start, start + count), total: albums.length }
  }
  if (headers.type === 'custom') {
    const start = Number(headers['start-pos'] ?? 0)
    const count = Number(headers['num-max'] ?? 200)
    const lists = PLAYLISTS.map((list, pos) => ({ pos, name: list.LIST_NAME, author: '', count: list.members.length }))
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

const decode = (value) => decodeURIComponent(String(value ?? ''))

/** Rows of a reviewed add source, as stock lists them. */
function addSource(headers) {
  if (headers.type === 'all/song') return TRACKS
  if (headers.type === 'album/song' && headers.album !== undefined) {
    const album = decode(headers.album)
    return TRACKS.filter((track) => track.ALBUM === album)
  }
  return null
}

/**
 * Stock playlist mutations (custom_list_cmd, add_custom_list, DELETE on
 * song_category_tree): positions are list order; deleting a list moves later
 * ones up. Returns reply headers, or null when the request is not admitted.
 */
export function editPlaylists(path, headers, body) {
  if (path === '/api/stock/custom_list_cmd/') {
    const name = decode(headers.list_name)
    if (!name) return null
    if (headers.type === 'create') {
      const id = Math.max(0, ...PLAYLISTS.map((list) => list.ID)) + 1
      const listId = Math.max(-1, ...PLAYLISTS.map((list) => list.LIST_ID)) + 1
      PLAYLISTS.push({ ID: id, LIST_ID: listId, LIST_NAME: name, M3U_PATH: null, members: [] })
      return { type: 'create' }
    }
    const list = PLAYLISTS[Number(headers.list_id)]
    if (headers.type !== 'update' || !list) return {}
    list.LIST_NAME = name
    return { type: 'update' }
  }
  if (path === '/api/stock/add_custom_list/') {
    const source = addSource(headers)
    const list = PLAYLISTS[Number(headers.dst_list_id)]
    if (!source || !Array.isArray(body)) return null
    if (list) for (const [first, last] of body) list.members.push(...source.slice(first, last + 1))
    return { type: 'add' }
  }
  if (headers.delete_source !== '0' || !Array.isArray(body)) return null
  if (headers.type === 'custom') {
    const [[first, last]] = body
    if (first === last && PLAYLISTS[first]) PLAYLISTS.splice(first, 1)
    return {}
  }
  if (headers.type === 'love/song') {
    const drop = new Set(body.map(([first]) => first))
    const keep = FAVORITES.filter((_, index) => !drop.has(index))
    FAVORITES.splice(0, FAVORITES.length, ...keep)
    return {}
  }
  if (headers.type === 'custom/song') {
    const list = PLAYLISTS[Number(headers.src_list_id)]
    if (!list) return {}
    const drop = new Set(body.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, i) => first + i)))
    list.members = list.members.filter((_, index) => !drop.has(index))
    return {}
  }
  return null
}

/** Albums whose files carry a cover, and tracks with lyrics (card media). */
const COVERED = new Set(['Blue Hours', 'Inner Space', 'Afterglow'])

/**
 * For the README's screenshots (scripts/screenshots): MOCK_GATEWAY_DEMO_COVERS names a folder of
 * cover-<n>.png, drawn from fixtures/demo-covers (the reference DISC Web demo's original covers), and
 * the first eight albums carry them instead; the others carry none.
 */
const DEMO_COVERS = process.env.MOCK_GATEWAY_DEMO_COVERS ?? null

/** The stock's cover of the playing track: any track has one, except an album without a demo cover. */
export const playingCover = (track) => (DEMO_COVERS ? coverOf(track) : true)

/** The file of a track's cover: a demo cover, the shared fixture (true), or null when its files carry none. */
export function coverOf(track) {
  if (!DEMO_COVERS) return COVERED.has(track.ALBUM) ? true : null
  const index = ALBUMS.slice(0, 8).findIndex(
    ([album, artist]) => album === track.ALBUM && artist === track.ALBUM_ARTIST,
  )
  return index < 0 ? null : `${DEMO_COVERS}/cover-${String(index)}.png`
}
const LYRICS = {
  Weightless: {
    source: 'sidecar',
    text: '[00:00.00]Weightless, first line\n[00:05.00]Weightless, second line\n[00:10.00]Weightless, third line\n',
  },
  'Blue Hours': { source: 'embedded', text: 'Blue hours, plain line one\nBlue hours, plain line two\n' },
  // Enhanced LRC for karaoke: word and syllable stamps on some lines, ten lines in all.
  'Still Here': {
    source: 'sidecar',
    text: [
      '[00:00.00]<00:00.00>Still <00:00.60>here, <00:01.20>still <00:01.80>awake<00:02.60>',
      '[00:03.00]<00:03.00>Counting <00:03.80>the <00:04.20>lights <00:05.00>outside',
      '[00:06.00]Kee<00:06.40>ping <00:06.80>time<00:07.60>',
      '[00:09.00]A line without word stamps',
      // A pause before the next line: karaoke shows three filling dots.
      '[00:10.20]',
      '[00:12.00]<00:12.00>Almost <00:12.80>morning<00:13.80>',
      '[00:15.00]Fifth line',
      '[00:18.00]Sixth line',
      '[00:21.00]Seventh line',
      '[00:24.00]Eighth line',
      '[00:27.00]Ninth line',
    ].join('\n'),
  },
}

/** The gateway's media routes for the mock collection: { status, body, type, headers }. */
export function mediaRoute(kind, path) {
  const track = TRACKS.find((item) => item.PATH === path)
  if (!track) return { status: 404, body: 'No such music file\n' }
  const lyrics = LYRICS[track.TITLE]
  const cover = coverOf(track)
  if (kind === 'info') {
    // Sizes follow the length (about 880 kbit/s); Blue Hours is a 24/96 release.
    const hiRes = track.ALBUM === 'Blue Hours'
    const seconds = (track.MEDIA_DURATION ?? track.DURATION ?? 180_000) / 1000 || 180
    const info = {
      path,
      format: 'flac',
      bytes: Math.round(seconds * 110_000 * (hiRes ? 3.3 : 1)),
      durationMs: track.MEDIA_DURATION ?? (track.DURATION || null),
      sampleRate: hiRes ? 96000 : 44100,
      bitDepth: hiRes ? 24 : 16,
      channels: 2,
      tags: {
        title: track.TITLE,
        artist: track.ARTIST,
        album: track.ALBUM,
        genre: track.GENRE,
        date: DATES[track.ALBUM],
      },
      cover: cover ? 'embedded' : null,
      lyrics: lyrics ? lyrics.source : null,
    }
    return { status: 200, body: JSON.stringify(info), type: 'application/json; charset=utf-8' }
  }
  if (kind === 'cover') return cover ? { status: 200, cover } : { status: 204, body: '' }
  if (kind === 'lyrics' && lyrics) {
    return {
      status: 200,
      body: lyrics.text,
      type: 'text/plain; charset=utf-8',
      headers: { 'X-Lyrics-Source': lyrics.source },
    }
  }
  return { status: 204, body: '' }
}

/** Adds a file published by an upload to the library, as a scan would. */
/** A file the scan found; `addedAt` (seconds) is when it reached the card, so files sent earlier are older. */
export function indexUpload(path, size, addedAt = Math.floor(Date.now() / 1000)) {
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
    ADD_TIME: addedAt,
    SIZE: size,
  })
}

/** The service's order-independent hash of a set of card paths (sum of FNV-1a 64). */
export function pathsHash(paths) {
  let sum = 0n
  for (const path of paths) {
    let h = 1469598103934665603n
    for (const byte of Buffer.from(path)) h = ((h ^ BigInt(byte)) * 1099511628211n) & 0xffffffffffffffffn
    sum = (sum + h) & 0xffffffffffffffffn
  }
  return sum.toString(16).padStart(16, '0')
}

/** Plays the service observed (oldest first), each with the queue it came from. */
function queueContext(type, rows) {
  const shared = (key) => (rows.every((row) => row[key] === rows[0]?.[key]) ? (rows[0]?.[key] ?? null) : null)
  const folders = rows.map((row) => row.PATH.slice(0, row.PATH.lastIndexOf('/')))
  return {
    type,
    count: rows.length,
    hash: pathsHash(rows.map((row) => row.PATH)),
    album: shared('ALBUM'),
    artist: shared('ARTIST'),
    genre: shared('GENRE'),
    folder: folders.every((folder) => folder === folders[0]) ? (folders[0] ?? null) : null,
  }
}
const byAlbum = (album, artist) => TRACKS.filter((t) => t.ALBUM === album && (!artist || t.ARTIST === artist))
/** An album deleted from the card since it was played: neither it nor its artist is in the library. */
const GONE = [1, 2].map((n) => ({
  PATH: `/tmp/sdcard/Vanished - Gone Album/0${String(n)} Gone.flac`,
  ALBUM: 'Gone Album',
  ARTIST: 'Vanished',
  GENRE: 'Ambient',
}))
export const HISTORY = [
  // Oldest first: an album, a genre, an artist, all tracks, a playlist, the album again,
  // and last an album deleted since (it names nothing on the shelf).
  [byAlbum('Inner Space', 'Forma'), 3, 0],
  [TRACKS.filter((t) => t.GENRE === 'Jazz'), 2, 1],
  [TRACKS.filter((t) => t.ARTIST === 'Northline'), 2, 0],
  [TRACKS, 1, 7],
  [PLAYLISTS[0].members, 5, 0],
  [byAlbum('Inner Space', 'Forma'), 3, 1],
  [GONE, 3, 0],
].map(([rows, type, index], n) => ({
  v: 1,
  t: 1790500000 + n * 600,
  path: rows[index % rows.length].PATH,
  s: 180,
  ctx: queueContext(type, rows),
}))
