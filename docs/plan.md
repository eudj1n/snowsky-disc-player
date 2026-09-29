# Plan

Canonical plan for the player UI. `[x]` means implemented and verified within
the stated scope; each completed item names its evidence. The base
implementation ports DISC Web's interface and experience
([reference](reference.md)) onto the gateway contract
([gateway](gateway.md)), then improves it.

## M0 — Foundation

- [x] Repository, MIT license, English documentation with links to
      snowsky-disc-service and snowsky-disc-qemu.
- [x] Toolchain: Vue 3, TypeScript (strict), Vite, Tailwind CSS v4, ESLint
      (strict type-checked, Vue, layer boundaries), Prettier, Vitest (unit and
      happy-dom component tests), Playwright; `npm run check`; GitHub Actions
      workflow running the same commands plus browser tests.
- [x] Gateway client: record framing, the owner session (serialization,
      tag matching, unknown `a202`, retirement on other timeouts, token and
      request-ID frames, uncertain outcomes never retried, close-code reasons),
      HTTP health/data/stock, release files and compatibility, stock language
      mapping. Unit tests with a scripted socket and fetch.
- [x] Layered structure: domain, gateway, stores, UI primitives, domain
      components, panels; import boundaries enforced by lint.
- [x] Build for the card: relative assets, root-absolute `index.html`
      references, no inlined assets, bundle contract check after every build;
      release preparation through the service publisher.
- [x] Mock gateway serving a built release like the real gateway (paths, CSP,
      one owner, token, request-ID replay); `npm run dev:mock` for visual work
      without a player; `dev:emulator` and `.env.local` for the emulator and a
      real player.
- [x] Emulator acceptance: publish on the disposable card, Playwright
      against the emulator gateway with the guest token. Done on 2026-09-25
      with the full scenario (see round 6); release `3a7fe4bf6ebc3256` on the
      guest, 6 acceptance and 4 shared browser tests passed against V2.57
      stock.

## M1 — DISC Web shell and experience

Port layout and interaction rules first, with live data where the gateway
already provides it. Reference values come from a full extraction of the
DISC Web stylesheet and behavior (tokens, breakpoints, icons, sleeves,
dialogs, keyboard, states), expressed as Tailwind tokens and variants.

- [x] Layout: sidebar (brand, navigation, note, device card), top bar
      (breadcrumb, search, refresh, device on phones, appearance, language,
      edition), scrolling workspace, footer, persistent bottom player; icon rail
      at 800px, bottom navigation and mini-player at 540px; reference
      breakpoints as `wide/compact/rail/sheet/narrow/phone` variants; sidebar
      scrolls on short windows (the reference let the device card slip under the
      player at 720px).
- [x] Design tokens and dark theme as the reference (applied before paint by
      `public/theme.js`), the 26-icon set, typographic sleeves with the
      reference hash and palettes (tests use its vectors).
- [x] Dialog system with the reference rules: primary press and release
      outside with ≤8px movement dismisses, page scroll locked and restored,
      native Escape and focus return; connection dialog (identity, one-owner
      note, pairing) and appearance dialog with swatches.
- [x] Hash routing, `/` focuses search, search filters the current view and
      clears on navigation, skip link, toasts (4.5 s, errors 11 s).
- [x] Views: Home (intro, hero with a random featured album, your albums,
      recent tracks, note), Albums, Artists, Tracks, Favorites, Playlists and
      Album/Artist/Playlist details from the data level; states for loading,
      failure with retry, service unreachable, empty and no matches.
- [x] Loading skeletons shaped like each page (cover grids, round artist
      cards, track rows, heading counts, the hero's featured line) sharing the
      content's grid and line boxes, so nothing moves when data arrives; no
      pulse under reduced motion. (Owner's addition; the reference had none.)
- [x] Owner's design decision: primary pill buttons use the player's ink
      green instead of the coral accent; coral stays for small indicators.

## Owner proposals accepted (round 1)

- [x] Connect on the first playback action when this browser holds the
      pairing token; otherwise the connection dialog explains (proposal 1).
- [x] Keyboard: Space play/pause, Left/Right previous/next, "/" search;
      ignored while typing, on focused controls and with a dialog open (2).
- [x] Import: dropping whole folders keeps their structure (3). Evidence:
      `src/lib/dropFiles.ts`, import rules in `tests/unit/operations.test.ts`.
- [x] Import: "refresh the collection after transfer" on by default: the scan
      still runs once and is never restarted, and the collection reloads after
      its observed end (4). Evidence: e2e "imports files, scans once and shows
      them in New" (desktop and phone).
- [x] Sound: two-state settings (DRE, gain) apply on press with readback;
      filter and balance keep an explicit Apply (5). Evidence: e2e "sound
      settings read on opening, apply at once or with Apply, and verify".
- [x] Album sorting: recently added, title, artist, remembered in the
      browser, with the locale's collation (6).

## Owner requests (round 2)

- [x] "New" section (owner's sketch, without banners): the latest tracks by
      ADD_TIME as a compact three-column grid with cover play overlays and ⋯
      actions, the latest albums as a snapping shelf, and the stock play history
      (`recently_played`) when it has entries; searchable like other views.

## Owner requests (round 3)

- [x] Import dialog: one-line title; the current step is outlined in green,
      not coral; the top-bar Add music button is quiet (no border) with a
      note-and-plus icon. The "Web preview" label is gone from the top bar.
- [x] The volume icon mutes and unmutes. The stock has no mute command, so
      mute sends volume 0 and remembers the replaced level in this browser;
      unmute restores it (or a quiet 20 when nothing is remembered). Evidence:
      `muteStep` unit tests, e2e "the volume icon mutes and restores".
- [x] The current track is marked with a soft pulsing dot while playing and a
      still dot while paused (track lists, New tiles, queue); reduced motion
      keeps it still.
- [x] New: track titles open the album and artists their page.
- [x] Albums that share a title stay apart (reference fix, two route
      parameters): album links carry the literal track artist
      (`#/album/<title>/<artist>`); a scoped page lists and plays only that
      artist's release through the stock type-7 selector (`0101
0007{"artist":"A", "album":"B"}`, `artist/album/song`, playerflag 7);
      an unscoped title group with several artists offers them as filters.
      Covers are associated per title and artist, so homonymous albums never
      share one. Evidence: unit tests in `library.test.ts` and
      `selection.test.ts`, e2e "keeps albums that share a title apart" and
      "plays one artist's release of a shared title".
- [x] Album pages end with "More by <artist>" shelves of the artist's other
      albums, newest first.
- [x] A quiet rule separates album and artist headers from their content;
      the artist page titles its grid "Albums".
- [x] Tracks and Favorites have a muted column header (title from the cover
      column, album, a clock for duration); in every track list the artist
      and album open their pages.
- [x] Track rows lead with the cover, which turns into the play button on
      hover or focus (as on the New tiles); album pages lead with the track
      number (or the position when the tag is missing) instead of the shared
      cover, the number turning into play on hover.
- [x] A favorite heart in the gutter left of the row (owner's reference):
      filled for favorites, an outline on hover otherwise. State comes from
      the MY_LOVE snapshot corrected by live `a202` observations. Only the
      current track's heart is a button (stock `0104` likes or unlikes the
      playing track only); other rows explain that in a tooltip.
- [x] Filled icons (play overlays, hearts, transport play) render filled; the
      base `fill-none` used to override them.

## Owner requests (round 4)

- [x] Album pages list tracks in tag order (disc, then track number);
      unnumbered tracks follow in library order. Selection still resolves
      positions in the stock's own order.
- [x] Album, artist and playlist covers show a round play button on hover
      instead of the arrow (albums in their scope, whole artists with the
      empty-album type-7 form, playlists); touch screens without hover do not
      get an invisible button over the cover.
- [x] The favorite heart colors on hover and every interactive control shows
      the pointer cursor (Tailwind 4 resets buttons to the default one).
- [x] Polish: album rows by one artist leave the repeated artist out and are
      shorter; loaded content and decoded covers fade in; detail headers glow
      softly in the artwork's tone (observed cover average, else the sleeve
      palette); the cover crossfades when the track changes; slider thumbs
      grow under the pointer. Reduced motion turns the motion off.
- [x] Confirmation accepts a shortened album name in `a202` only when exactly
      one name of the scope's fresh album list starts with it (reference
      `album_matches`).

## Owner findings on the player (round 5)

- [x] The bottom player vanished after a track switch while the page stayed
      connected. The stock follows a switch or pause with a partial a202 that
      carries only `{"state":0}` (plus an unsolicited `aa05`); each record was
      parsed on its own, so the partial one erased the track. a202 records
      are now reduced per session as in the reference `merge_snapshot`: a
      different song replaces the state, state 2 clears it, an empty record
      changes nothing and partial records update their own fields. Selection
      confirmation reduces from scratch after the send, so a partial record
      never pairs a new state with the previous song. The mock now sends the
      partial record after transport; the keyboard e2e fails on the old logic.
- [x] The bottom player's title opens the album in its artist scope (the
      artist without an album) and the artist line opens the artist.
- [x] "Playing from" in the bar (wide screens) and the listening panel. The
      stock reports only the source kind (playerflag); the name comes from the
      track (album, artist), its genre tag, its folder or the single playlist
      that holds it (checked while there are at most 30 playlists), and stays
      generic otherwise.

## Emulator acceptance findings (round 6)

`tests/e2e/acceptance.spec.ts` on the V2.57 guest with generated tagged media
(`tests/e2e/emulator/media.sh`) passed after these fixes:

- [x] Playlist pages read members by `CUSTOM_PLAYLIST_INDEX.LIST_ID`: the
      `playlist_tracks` query filters on it (the `playlists` count does too),
      and the page passed the index row `ID`, so on the player it showed the
      wrong list or nothing. The query catalog allowed `id >= 1` while the
      first list has `LIST_ID` 0: fixed card-only in snowsky-disc-service
      (`d2f7806`), shipped with the next bundle.
- [x] The data level answers 503 while stock scans (database busy) and stock
      routes answer 503 when the single stock HTTP reservation is taken. The
      page now sends stock requests one at a time and repeats reads twice
      after a 503; mutations are never repeated.
- [x] Confirmed on stock: artist-scoped album (type 7), whole artist, whole
      genre (type 8, including the stock's own "Unknown genre" group), a track
      in a genre (000A), a genre album (type 8), tag-ordered album pages,
      partial a202 after a switch, paused and playing seek, volume with mute,
      modes, favorite, queue row, playlist create/add/play/remove/rename and
      delete (not in the reference session, now accepted on the emulator),
      gain, EQ preset, band and flatten, upload with one scan.
- Stock data: untagged fields are stored as "Unknown album", "Unknown
  Artist" and "Unknown genre" and the stock catalogs group them under the
  same names; TITLE may be null (the file name is shown). Physical player
  confirmation of the new operations is still open.

## M1.5 — Caching, enrichment and artwork

- [x] Collection snapshot in IndexedDB keyed by the library signature
      (counts, latest ADD_TIME, highest ID from `library_summary`): an unchanged
      library opens without paging the player; the refresh button forces a
      re-read. No sync dialog: unlike the reference's two-equal-reads HTTP sync,
      the data level reads the stock database directly, so a snapshot is cheap
      and validated automatically (owner's question 12).
- [x] Listening enrichment (reference Library): durations from `a202` and the
      stock current cover, associated with a track only when the same track is
      observed before and after the image read, kept in IndexedDB and shown in
      lists, cards, the hero and the player. Covers are fetched as bytes,
      checked as JPEG/PNG and drawn on a canvas, because the gateway labels
      proxied bodies as JSON and the page CSP allows no blob: images.
- Finding on the owner's player: of 779 tracks only 83 have DURATION, and no
  sample rate, bit depth, channels or year are filled; the stock databases
  hold no artwork at all (verified on the stock schema), and stock serves
  only the current track's cover (`/usr/data/fiio/cover.jpg`). Eight library
  rows point at `.part` files on the card.
- [x] Service media endpoint (snowsky-disc-service, next image): read FLAC
      STREAMINFO (duration, sample rate, bit depth) and embedded PICTURE blocks
      or folder `cover.jpg`/`folder.jpg` from the card, bounded and read-only,
      so every album and track gets artwork and duration without playing it;
      forward proper image types. The UI then prefers it over enrichment.
      Shipped in combined-006 for FLAC and WAV (installed 2026-09-26); MP3 and
      AAC tags wait for the next image.

## M2 — Library browsing

- [x] Genres (possible with the current build, no service change): the
      library rows carry `GENRE`; stock serves `style`, `style/song`,
      `style/album` and `style/album/song`; playback uses the reference
      Controller's `genre_command` forms — whole genre `0101 000A<genre>`,
      indexed `0100 <pos> 000A<genre>`, and genre album with the type-8
      selector `0008{"style":"G", "album":"A"}` — with fresh `style/*`
      membership and preflight. Genre view, filters on Albums and Tracks,
      playback. Done: Genres section (tiles; on phones reached from the Albums
      heading, the bottom bar has no room), a genre page like New (latest
      tracks, albums, then artists; "All tracks" opens Tracks filtered by the
      genre), `?genre=` filters on Albums and Tracks that keep playback in the
      genre, and albums that mix genres open narrowed to one (type 8).
      Evidence: `tests/unit/selection.test.ts`, `library.test.ts`, e2e
      "browses genres…" and "plays an album from its cover and a whole genre".
- [ ] Virtualization for large libraries within the gateway's row
      and byte bounds; offline snapshot of the collection (M6).

## M3 — Playback from the library

- [x] Guarded selection (`src/gateway/selection.ts`) after the reference
      Controller: membership read twice from stock catalog pages, the target
      resolved in stock order by title and artist exactly once, preflight of the
      target row and total, one `0101`/`0100` with a fresh request ID, fresh
      `0202` confirmation of source and track; `uncertain` is never retried.
      Whole album (Home hero, album page), album track, library track (Tracks,
      Home) and favorite.
- [x] Listening panel: Now Playing and Queue, 380px reserved from 1200px,
      overlay below, full width on phones, independent scrolling, focus and
      Escape rules; queue from `curlist/song` read twice with a stable mark.
- [x] Playlist playback (unique name resolved to its stock position, rechecked
      before the send) and selecting a queue row. Evidence: e2e "selects a row
      in the queue and plays a playlist". Genre playback moves to M2 genres.
- [x] Seek (preview while dragging, send once; a paused seek waits for
      resume), volume, play modes and the current-track favorite; position
      timeline from `a103`. Evidence: `tests/unit/operations.test.ts`, e2e
      "volume, modes and favorite" and "a paused seek waits".

## M4 — Collection changes

- [x] Create/rename playlists, add/remove members with fresh identity checks
      (reference `playlist_operations.edit`): lists read twice and addressed by
      the position of the one row with the exact name, members and the
      `all/song` source read twice, a final recheck before one write with the
      token and a fresh request ID, confirmation by the name set or member
      multiset read back; HTTP 200 alone is only "sent". Tracks are added from
      `all/song` by their unique title and artist (several become ordered
      ranges, so whole albums in any scope work); an existing member is
      refused. Delete playlist follows the same pattern but is not in the
      reference session: emulator acceptance pending, and it is refused while a
      playlist plays. Entry points: track menu (add; remove on playlist pages),
      New playlist, Rename and Delete on playlist pages, Add to playlist on
      album pages. Evidence: `tests/unit/playlists.test.ts`, e2e "creates,
      fills, trims, renames and deletes a playlist".
- [x] Import files and folders through the gateway upload, then an explicit
      scan with observed progress; no overwrite, no automatic scan. Deliberate
      difference: the gateway's own 201 with the same path and byte count
      confirms a file, because `/dir/` readback breaks on paths with spaces
      (see the proxy request below).

## M5 — Sound

- [x] Gain, balance, DAC filter, DRE with readback (gain and DRE apply on
      press, balance and filter on Apply).
- [x] Equalizer (reference fiio_settings.py and the peq/settings checks):
      preset (`0690`/`0639`, stock presets and Custom 1–10, BYPASS 240, 7 and
      254 never sent), ten PEQ bands (`0678` JSON with gain and Q as Python
      float strings, `a628` binary read) and the master level (`0630`/`0629`,
      signed tenths of dB); bands and master change only in a user preset,
      each change checks the displayed value fresh, sends once and polls the
      read. The data-level `peq_presets` is not needed: current values always
      come from the player. Evidence: `tests/unit/eq.test.ts`, e2e "selects a
      custom EQ preset and keeps an edited band".

## M6 — Offline collection

- [x] Snapshot of the library in IndexedDB for browsing while disconnected,
      with staleness shown; current-track artwork kept per snapshot. When the
      player is unreachable (at load, or after the session drops and a health
      recheck fails) the last snapshot stays browsable under a dated notice
      with "Try again"; playback and changes stay off. The page itself is
      served by the player, and plain HTTP on the LAN allows no service worker,
      so this covers a player that leaves while the page is open, the mock
      and future hosted clients rather than opening the app offline.
      Evidence: e2e "browses the saved copy while the player is unreachable".

## Releases on the owner's player

- 2026-09-25: `dafd12f63bd12c73` (commit `5f01df8`, genres and polish)
  published on PLAY at the owner's request after `npm run check` and the mock
  e2e suite; the publisher verified every file and the SHA-256 of all 34
  files matched after the write. Not yet verified on the emulator: run the
  browser tests against the guest and check playback, genres and the sound
  dialog on the player. The previous release `a3e0203b38aceca7` stays on the
  card for rollback (`www/active.json`).

- 2026-09-25: `9b8d2afdaeb8f018` (commit `2d75cb4`, partial a202 fix and
  bottom-bar links) published on PLAY at the owner's request after
  `npm run check` and the mock e2e suite; all 34 files matched by SHA-256
  after the write. `dafd12f63bd12c73` stays on the card for rollback.

- 2026-09-26: `6391eee7bbc8b7ac` (commit `12a1a0e`, the combined-006
  client with rounds 7 and 8) published on PLAY at the owner's request after
  the combined-006 image was installed, the full mock suite and the emulator
  acceptance (14 desktop tests); all 35 files matched by SHA-256 after the
  write. `9b8d2afdaeb8f018` stays for rollback.

- [x] Old releases removed from PLAY at the owner's request (2026-09-26):
      `1be0ebd8ca57606d`, `a3e0203b38aceca7`, `d378675b63677b13`,
      `da59199d06dcb558`, `dafd12f63bd12c73`, `fe0753a8ec469745`. The card
      keeps the active release and the previous one.
- [x] `DISC_WEB_SN_PAIRING` placed on PLAY at the owner's request (exact
      20-byte content read back); the card was flushed and ejected.
- 2026-09-26: `c4784ac08ccbe799` (commit `df8508d`, round 9, with the
  service catalog `ef56626` that admits media names only on uploads)
  published on PLAY after the full mock suite; all 35 files matched by
  SHA-256 after the write. `6391eee7bbc8b7ac` stays for rollback;
  `9b8d2afdaeb8f018` removed (active plus previous kept).

- 2026-09-28: `b85fcfce87b85f0a` (commit `f0a0ba6`: folder play, the
  remembered track after a reconnect, the Card tabs by the heading, the
  sidebar without its note) published on PLAY at the owner's request after
  `npm run check`, the full mock suite (105) and the emulator acceptance of
  this exact release through the MIPS service (all 17 acceptance tests); all
  72 files matched by SHA-256 after the write. `c0c96a7a7f0faa30` stays for
  rollback; `77e5722c6c3101a7` removed (active plus previous kept). The card
  was ejected.

- 2026-09-27: `c0c96a7a7f0faa30` (commit `51d945d`: the file manager, the
  row heart, the sidebar toggle, karaoke fade, spacing and pause dots,
  artist pictures and duplicate folder links) published on PLAY at the
  owner's request after `npm run check`, the full mock suite (101) and the
  emulator acceptance of this exact release through the MIPS service (all 15
  acceptance tests); all 80 files matched by SHA-256 after the write. At the
  owner's request the older releases were removed (`375d85bd5dbb6a57`,
  `4305f4bb03706477`, `74a2e216281b11ea`, `ccdaf06c54348329`,
  `f4770f9935dc4a2b`): the card keeps `c0c96a7a7f0faa30` and
  `77e5722c6c3101a7` for rollback. The card was ejected.

- 2026-09-27: `77e5722c6c3101a7` (commit `fc3e6c0`: merged genre spellings
  and queue covers) published on PLAY at the owner's request after `npm run
check`, the full mock suite (99) and the emulator acceptance of this exact
  release through the MIPS service (all 14 acceptance tests); all 72 files
  matched by SHA-256 after the write and the card was ejected.
  `74a2e216281b11ea` stays for rollback; older releases are still on the card.

- 2026-09-27: `74a2e216281b11ea` (commit `74301ed`: karaoke with word timings
  and the CUE fix) published on PLAY at the owner's request after `npm run
check`, the full mock suite (97) and the emulator acceptance of this exact
  release through the MIPS service (all 14 acceptance tests, among them the
  new CUE image); all 72 files matched by SHA-256 after the write and the
  card was ejected. `375d85bd5dbb6a57` stays for rollback; older releases are
  still on the card.

- 2026-09-27: `375d85bd5dbb6a57` (commit `36d97b0`: round 15's card space
  bar and round 16's Card page with its album and artist links) published on
  PLAY at the owner's request after `npm run check`, the full mock suite (95)
  and the emulator acceptance of this exact release through the MIPS service
  (all 13 acceptance tests passed, among them the new card measurement; the
  Home featured-album test skipped itself); all 72 files matched by SHA-256
  after the write and the card was ejected. `ccdaf06c54348329` stays for
  rollback; `f4770f9935dc4a2b` and `4305f4bb03706477` are still on the card.

- 2026-09-27: `ccdaf06c54348329` (commit `041d3b3`: rounds 13–14, the
  Recently played shelf by source, favoriting any row, device facts, MP3/AAC
  metadata and the volume read-back fix) published on PLAY at the owner's
  request, on the installed combined-007 image, after `npm run check`, the
  full mock suite (93) and the emulator acceptance of this exact release
  through the MIPS service (20 desktop tests); all 65 files matched by
  SHA-256 after the write. `f4770f9935dc4a2b` stays for rollback;
  `4305f4bb03706477` is still on the card (its removal was not authorized in
  this session). The first acceptance run of `c9e810d06bde4642` had caught
  the volume race (a Mute right after a verified change restored the old
  level); a rerun of the fixed release once hit stock's reset of a fast
  reconnect before passing in full.

- 2026-09-26: `f4770f9935dc4a2b` (commit `47f2611`, rounds 11–12: lyrics
  following their stamps and opening at the current line, joint credits
  linked in the listening panel, the hidden play-history shelf and order, and
  the service's `most_played` query) published on PLAY after the full mock
  suite; all 36 files matched by SHA-256 after the write. `4305f4bb03706477`
  stays for rollback; `c4784ac08ccbe799` removed.

- 2026-09-26: `4305f4bb03706477` (commit `d53589f`, round 10: palettes in
  the appearance dialog, SPDIF, reload resume, lazy lists, English default,
  smooth cover zoom) published on PLAY after the full mock suite; all 35 files
  matched by SHA-256 after the write. `c4784ac08ccbe799` stays for rollback;
  `6391eee7bbc8b7ac` removed.

- [x] Owner's browser acceptance on the player (2026-09-26, release
      `c4784ac08ccbe799` on combined-006): the owner reported "все работает"
      and specifically checked, for the first time on the player, uploading an
      album folder and the rescan that indexes it. The listed features (covers,
      durations, lyrics, favorite removal, playlists by `LIST_ID`, albums and
      discs, SN pairing) were not reported one by one.

## Combined-006 client (round 7)

Built on snowsky-disc-service `1074215` (media, current lyrics, image types,
path re-encoding, scan guard) and `d5968bb` (SN pairing, `.local` hosts, 204
for absent covers and lyrics). Emulator acceptance on the V2.57 guest with
that service and release `d01d837e…` and its successor passed in full (14
desktop tests: the six earlier stock scenarios, card covers, file durations,
sidecar and embedded lyrics, favorite removal from a row, all-zero SN
pairing under the card marker, upload with a scan).

- [x] Covers from the card for every album (embedded picture or folder
      cover), durations from the file where stock has none, fetched two at a
      time with covers first and negative results rechecked after a week.
- [x] Lyrics tab in the listening panel: the track's `.lrc` or embedded
      lyrics first, otherwise stock's converted current lyrics when their age
      matches the track; synced lines follow playback and seek on click.
- [x] Remove a favorite from any row (`love/song`, confirmed by readback).
- [x] A mutation refused during a stock scan (1013) explains itself.
- [x] Upload: names already on the card are skipped without stopping the
      batch, any file not yet sent can be removed from the list, and an unsent
      or unconfirmed file is sent again only on request (never overwritten).
- [x] A like or unlike of the playing track re-reads the favorites, so the
      Favorites view shows it at once (found by the acceptance run).
- [x] Pairing with the player's serial number where the card enables it
      (`snPairing`); a credential the gateway refuses at once is forgotten, so
      reconnecting does not spend its attempt limit.

## Owner requests (round 8): albums, discs, years, joint artists

Stock facts found on the emulator with synthetic files (2026-09-26): SONG.DISC
holds FLAC `DISCNUMBER` (also "1/2") and MP3 `TPOS`; SONG_PRODUCTION_YEAR stays
empty for FLAC `DATE`/`YEAR` and MP3 `TDRC`/`TYER`; two FLAC `ARTIST` fields
are stored as "A;B", a single "A; B" as written, an ID3v2.4 multi-value
artist keeps only the first. Accepted on the V2.57 guest (14 desktop tests).

- [x] Albums that share a title are separate cards when they are separate
      releases (album artist, else album folder; CD1/Disc 2 folders stay one
      album). Releases stock can only address by one artist scope stay one
      card; the album page keeps its artist filters only where titles clash.
- [x] Disc headings on multi-disc album pages; the disc comes from the tag,
      else from a CD1/Disc 2 folder name, and orders the tracks.
- [x] Year from the files' DATE tag (FLAC through the media route) on album
      pages and artist cards, newest first on artist pages. MP3 and AAC wait
      for ID3/MP4 parsing in the next service image.
- [x] Joint credits split on semicolons only (never "/", "&" or "feat."):
      each artist links separately in rows, the player bar and album headers;
      the artists list counts each; artist pages list "Appears on" albums; a
      guest on some tracks leaves the album its lead artist's card.
- [x] With the stock online lyrics option on, lyrics prepared by the player
      are labelled as possibly from the internet (NetEase); with online covers
      on, stock's current cover is never kept as an album cover (it may be an
      iTunes guess). Both options are read from the system settings.

## Owner requests (round 9, after the combined-006 release)

- [x] Lyrics button shows a "T" with lines of text; the microphone is kept
      for voice control.
- [x] Dark theme: warm charcoal by default; olive, graphite, espresso and
      black kept in `src/styles/palettes.css` ([themes](themes.md)).
- [x] Genre pages split joint credits; names known only from joint credits
      offer no whole-artist play.
- [x] Small text one step larger (8→9, 9→10, 10→11 px); text actions and the
      genre filter at 12 px.
- [x] Phones: the favorite heart sits in a lane inside the row, off the edge.
- [x] The search field takes the free header width; the breadcrumb stays
      beside the listening panel and yields only below 900 px.
- [x] Folder import carries `.lrc` lyrics and cover/folder/front images; the
      dialog says existing names are skipped. The card catalog now admits
      only media names on uploads (service `ef56626`), so an upload cannot
      create a card marker.
- [x] The Now Playing cover spans the panel column on wide screens.
- [x] Confirmations the page already shows ("Done. Verified on DISC.",
      "Already set") are announced to screen readers only; errors, uncertain
      outcomes and "please wait" stay on screen.

## Owner requests (round 10, card-only)

- [x] Hearts in the player bar and panel 17 px with a muted outline; row
      hearts one pixel smaller.
- [x] A tab that was connected reconnects after its own reload
      (sessionStorage mark, up to four attempts while the old socket lets go);
      Disconnect clears it and new tabs never take control on their own.
- [x] Light palettes (sage, paper, mist, white) next to the dark ones
      (charcoal, olive, graphite, espresso; black dropped for four and four);
      the appearance dialog offers the tones of the theme in effect
      ([themes](themes.md)).
- [x] English is the default language (the player's own language is still
      adopted when the listener has not chosen one).
- [x] SPDIF in the sound settings; turning it on asks for a second yes,
      because the jack then carries a digital signal. Codec and work mode wait
      (they restart playback or the connection).
- [x] Long track lists render in batches of 60 as they scroll (about 700
      tracks felt slow).
- [x] Cover hover zoom is smooth: Tailwind 4 scales through the `scale`
      property, which the transitions did not list, so the zoom jumped; now
      800 ms on a gentle curve to 1.035 (and the play button, row hearts and
      lyrics animate their translate/scale too).
- Owner check on the player: removing a favorite that was just liked works.
- Owner check on the player with release `4305f4bb03706477` (2026-09-26):
  reconnecting after a reload works, the ~700-track list loads without lag,
  and the appearance palettes work. SPDIF was not reported yet.

## Owner requests (round 11): play history

- [x] Home shelf "Recently played": the albums of stock's play history
      (RECORD_SONG through `recently_played`), each once in the order last
      played, up to eight; rows whose file left the library are skipped; hidden
      while the history is empty; re-read 8 s after the playing track changes
      and cached for the saved copy.
- [x] Tracks sort: library order, recently added, most played (the new
      `most_played` card query, service `most_played` commit); "most played"
      appears only when stock has recorded plays.
- [x] Find out when stock records a play: **never** in V2.57 (and V2.40).
      The only RECORD_SONG writer in `mq_player` (an upsert of PLAY_COUNT and
      LAST_PLAY_TIME in epoch seconds) has no callers; stock only reads the
      table (TCP 0467/0468, which do not answer while it is empty) and has no
      UI for it. Static analysis of the V2.57 binary; the guest agrees (remote
      playback added no rows) and so does the owner's player (empty on
      2026-09-25). The shelf and the order stay hidden until another source
      of history exists.
- [ ] Our own play history (deferred by the owner, 2026-09-26): the page
      recording the plays it observes (30 s or half the track, this browser
      only), a service-side recorder in the next image, or both. The shelf and
      the order are built and stay hidden until then.
      Emulator check of stock's resume point (`MEMORY_PLAY`, 2026-09-26): it
      does not change while tracks advance during playback (72 s over two
      tracks, song.db untouched) and is rewritten only on pause, with the queue
      row (`LIST_SONG_0`), not the library ID; so it cannot serve as a play
      source. A service recorder would need its own view of the playing track
      (a second stock connection, untested) or would see only what passes
      through the gateway while a page is connected.
      A passive source works (guest, 2026-09-26): stock keeps the playing
      file open, so `/proc/<mq_player>/fd` names it; the path switched at the
      track change, the file stayed open while paused, and its `fdinfo` read
      position advanced in 32 KiB steps while playing (read-ahead reaches the
      end a few seconds early); with the queue ended no audio file was open.
      A service recorder can count a play when a file stays in use long
      enough (for example 30 s or half its bytes), with no stock connection.
      The player's "Memory playback" setting (Off / Position / Song, stored
      as `SYSCONFIG.MEMORY_PLAY` 0 / 1 / 2; the owner chose Song on the player,
      2026-09-26) does not start a history either. Guest check with Song: an
      album of four 25 s tracks played to the end left RECORD_SONG empty; with
      it, stock rewrites `MEMORY_PLAY` at every track change (queue row ID of
      `LIST_SONG_0`, its track number, `POSITION` 0), keeps `IS_PLAYING` 1
      after the queue ended, writes song.db each time and creates an empty
      `/usr/data/fiio/memory_playing_flag`. That row is only the last track
      and needs the setting, so the passive `/proc` source stays the
      candidate. The guest was set back to Off.
      No other setting can change this: re-checked on the guest's
      `mq_player` (MD5 `27abe015…`), the upsert at `0x43e93c` (it formats
      `UPDATE RECORD_SONG SET PLAY_COUNT…`) has no `jal`/`j` to it and its
      only pointer lies in `.pdr` (procedure descriptors, not code or data),
      so no code path, gated by a setting or not, reaches it.
      The context a play was started from is recoverable, not only the
      track (guest, 2026-09-26, page-started playback): stock's a202
      `playerflag` and the `SONG_TYPE` of every row of its queue table
      `LIST_SONG_0` were album 3/3, one artist's album 7/2, a whole artist
      7/2, a genre 8/2 and all tracks 1/1 (favorites and playlists were not
      tried: none on the guest). `playerflag` needs a stock connection and
      does not tell an artist from one artist's album; `SONG_TYPE` does not
      tell an artist from a genre. The queue itself does: its set of files
      equals an album's, an artist's, a genre's, a playlist's or the
      favorites' tracks, whoever started it (player screen, FiiO Control or
      this page). A recorder can store each play as track + context + time +
      time listened, so "Recently played" can list what the listener started
      (album, artist, genre, playlist) and "Most played" can count tracks.
- [ ] Contextual "Recently played" with the next service image (owner,
      2026-09-26): what the listener started, not loose tracks, and no mix
      of card shapes. How others do it: Apple Music's Recently Played lists
      only started albums, playlists and stations, with a separate track
      History by Now Playing; Spotify's Home opens with uniform shortcut
      tiles of recent albums, playlists and artists; Yandex Music's "Вы
      недавно слушали" holds albums, playlists and artists, and its History
      lists tracks with their source. The shelf layout (uniform tiles, which
      contexts) awaits the owner's choice; "Most played" keeps counting
      tracks.
- Idea (later): generated playlists by genre, era (tag years) or mood. The
  stock playlist routes already create and fill playlists, so these need no
  database write; mood has no source yet.

## Owner requests (round 12): lyrics timing

- [x] Synced lyrics follow the `.lrc` stamps between stock's ~1 s position
      ticks (the time since the last tick is added while playing, at most
      1.5 s), on a 100 ms clock that runs only while synced lyrics play.
- [x] Opening the lyrics tab (also paused, or after closing the panel) or
      loading new lyrics scrolls straight to the current line. Without any
      tick since the page connected (a track already paused) there is no
      position to show: the protocol has no position read.
- [x] Joint credits ("Баста; GUF") link each artist in the lyrics header and
      the Now Playing tab too, and read "A, B" in the queue, the track menu,
      unlinked rows and "Playing from".

## Owner requests (round 13): player facts and audio quality

- [x] The player dialog ("YOUR PLAYER") shows the number of albums and
      tracks and the battery charge (SYSCONFIG.BATTERY, re-read whenever the
      dialog opens; how often stock stores it is not yet compared with the
      player's screen).
- [x] Audio quality: Now Playing shows the format with bits/kHz (lossless),
      kbit/s (lossy) or DSD rate from stock's a202 (every format, as stock
      decodes it), and a Hi-Res mark above CD quality; album headers show the
      first track's quality from the media route (FLAC and WAV now, MP3 and
      AAC with the next image). Checked on the guest against real stock:
      "FLAC · 16/44.1".
- Stock's SONG columns for sample rate, bit depth and bit rate stay 0 on the
  guest even after playback, so quality never comes from the database.

## Owner requests (round 14): layout and names

- [x] Favorite hearts: where the page gutter is narrow (compact widths, an
      open listening panel, phones) the rows open a heart lane of their own,
      so the heart no longer touches the sidebar or the screen edge.
- [x] Selects (language, genre, sound filter, EQ preset, playlist choice)
      draw their own chevron inside the right padding (`UiSelect`); the
      native arrow sat almost on the rounded edge.
- [x] The current row (lists and New tiles) offers pause while playing and
      resume while paused, instead of starting the track again.
- [x] Home: the featured album and its artists link to their pages, to open
      them without playing.
- [x] The lyrics tab drops its "Lyrics" eyebrow: the tab already says it.
- [x] The breadcrumb gave way to a sidebar toggle (item 10): the sidebar
      collapses to its icon rail on wide windows too (remembered, applied
      before paint by `theme.js`; links carry tooltips there). The search keeps
      to the actions on the right, so it no longer moves with the section name.
- [x] Joint credits read "A & B" and "A, B & C" everywhere (rows, cards, back
      links, headings, player bar). A joint album shows the pair's other
      albums, else its first artist's ("More by"), then "On this album" with
      each artist's page.
- [x] Album title filters: the chosen artist chip, pressed again, returns to
      the whole title; a single release with a guest then closes the filter.
- [x] Now Playing named a long album cut short ("Meteora 20th Anniversary
      Edit"), and its links opened an empty album. Stock cuts the album of
      the playing track to 29 bytes in a202 (emulator acceptance: "Quiet
      Meridian (The Complete Anniversary Recordings)" arrived as "Quiet
      Meridian (The Complete "; a 48-character title arrived whole), while
      its library keeps the name whole. The playing track now takes title,
      artist and album from the library row of the same card file; the mock
      gateway cuts albums the same way.
- [x] Sticky context for long pages (item 8, owner chose option A without
      column headers): once a detail header (album, artist, playlist, genre)
      has scrolled under the top, a compact bar keeps a small cover, the name
      (back to the top), a line of context (artists and year, counts) and one
      button: it starts the page's music, or pauses and resumes it while the
      current track belongs to the page. It sits in the workspace, so it
      follows the sidebar and an open listening panel.

Checks: `npm run check`, the mock suite (91 passed, both projects) and the
emulator acceptance against real stock with the release `c0aa8242…` (18
desktop tests passed, including the long-name test that also pauses from the
compact bar; the Home featured-album test skipped itself while its button was
still disabled).

## Next release with the next service image (owner, 2026-09-26)

Page work that follows the service stages (see the service plan's work order).
All of it degrades to the earlier behavior on images without the new routes
(health flags `history` and `favoriteAny`, 404 for `/api/device`).

- [x] "Recently played" as one shelf of uniform tiles (`SourceTile`: square
      picture, name, a caption such as "Album · Artist", "Artist", "Genre",
      "Playlist · 12 tracks"): the sources the listener started, newest first,
      each once; 8 tiles on desktop, 6 at compact widths, 4 on phones; plays
      from all tracks stay off it. Each play's queue is named by its path
      hash (albums and one artist's part of a title, literal artists, genres,
      the favorites, all tracks; playlists of a matching size are read to
      compare), else by the album, genre or artist all its rows shared.
- [x] Track history: a "Recently played" order in Tracks (with the service's
      history), each played row naming its source in the album column
      ("Genre · Jazz", "Playlist · Evening", the album). "Most played" counts
      the service's plays where it keeps them.
- [x] Favorite any track from its row (the service's favorites mutation, when
      health says `favoriteAny` and the card catalog admits `favorite_add`);
      the heart shows faintly on touch screens, where nothing hovers.
- [x] Live battery (the gauge, else stock's stored charge) and card space in
      the player facts; Now Playing adds "→ 48 kHz" to the quality badge when
      the DAC gets another rate than the file has.
- [x] MP3 and AAC details through the media route: years, discs, covers and
      lyrics as for FLAC; the album quality label uses the media bitrate
      ("MP3 320 kbps").
- [ ] Service playlists (card-only, owner liked the idea): a queue of one's
      own kept as a managed stock playlist that the page fills and starts;
      additions reach playback when it is started again. Design to be agreed.
- Research first: live queue edits (see the service plan).

Checks (2026-09-27): `npm run check` (148 unit tests), the mock suite (93
passed, both projects) and the emulator acceptance through the next-image
MIPS service (19 desktop tests, among them a new one on stock: a device facts
dialog with the guest's gauge and card, an album played for 20 s appearing as
the first tile, and a non-playing row favorited and removed again).

Owner's acceptance on the player (2026-09-27, release `ccdaf06c54348329` on
combined-007): "Recently played" fills, favoriting any track works, and the
output rate, the battery and the card space show. MP3 files are checked
separately.

## Owner requests (round 15): card space

- [x] The card fact as a full-width bar instead of a fourth tile alone on its
      row: the used share fills it, colored by what is left (the palette's
      progress color, amber under 25 % free, the accent under 10 %, the level
      at which Windows turns a drive red). The label and "2.7 GB free of
      31 GB" stay above it; the bar is a `meter` for assistive technology.
      Unit test for the levels (the owner's card, 8.7 % free, reads
      critical); the mock test reads the meter. Checked in light and dark and
      on a phone with screenshots of the three levels.

## Owner requests (round 16): card space, files and more (2026-09-27)

Proposals for the installed combined-007 image, all card-only (page and card
catalogs). The owner chose 1 to start, widened 6 and added 8; the rest are
recorded for later.

1. [x] **What takes space on the card** (2026-09-27). A read-only view:
       sizes by album, artist and format from the media route's `bytes`
       (measured once per file and cached), music against the rest of the
       used space, possible duplicates (one album in two folders, one track in
       two formats) and plays per album from the service history (it began on
       2026-09-27). Deleting stays with the owner in storage mode: the
       service denies stock's `DELETE /file/` outright (built-in denylist), so
       a delete action would need a reviewed image change.
       Done as the "Card" page under "Your player" in the sidebar, also
       reached from the connection dialog's card bar: the used space as
       music and other files, formats (hi-res and the two MP4 kinds apart),
       the largest albums with their plays (title, cover and artist link to
       their pages, as the owner asked), artists by their albums' space
       and possible duplicates by folder pair (same title and credit, lengths
       within 2 s). Sizes are cached in IndexedDB until "Measure again".
       Unit tests for the grouping and duplicates, a mock test (both
       projects, the mock now sizes files by length and has a 24/96 album),
       and the emulator acceptance through the MIPS service (21 desktop tests
       passed, the new one measuring every guest file); screenshots in light,
       dark and on a phone.
2. [ ] Smart playlists kept as managed stock playlists (the earlier "service
       playlists"): by genre, decade (tag years), most played, not played for a
       while, recently added; the page creates and refreshes them with the
       admitted playlist routes and never touches the owner's own lists.
       Naming, refresh and ownership to be agreed first.
3. [ ] Listening statistics from the history on the card: top artists,
       albums and genres per week, month and all time, hours listened, streaks,
       later a year in review. Useful once history has accumulated.
4. [ ] Collection check: albums without a cover or year, names stock cuts at
       29 bytes, album artist spellings that split an album, mixed sample
       rates within an album, tracks without lyrics; a report with fixes.
5. [ ] Work mode (local, USB DAC, AirPlay) and the Bluetooth codec: records
       `0607`/`0657` and `06d4`/`06d3` are admitted but unused. Check on the
       emulator first what a mode switch does to playback and to the service.
6. [x] **A small file manager** (widened by the owner): browse the card's
       folders (`/dir/`, paged), create a folder, upload or add music into the
       chosen folder (the upload route creates missing parents, refuses
       overwrites and admits media names only), then rescan. Limits of the
       current image: `/dir/` is stock's filtered media browser (not every file
       is listed; no sizes), and there is no delete, rename or move (delete is
       denied by the service; stock has no rename).
       Done (2026-09-27) as the Card page's "Files" tab (`/card/files`, the
       folder in `?folder=`): a path of links, folders first, each with the
       library's tracks, measured size and the album they form, files with
       their track and album links and cover; "New folder" (FAT-safe names;
       `DISC_WEB…`, `www` and hidden names refused; confirmed by reading the
       parent again) and "Add music here" (the import dialog takes the folder
       as its destination; the top bar's button goes to the card root). The
       duplicates on the Space tab link their folders here. Unit tests for
       names, paths, stats, paging and the create confirmation; a mock test;
       the emulator acceptance browses the guest card and creates a folder
       through the MIPS service on stock (15 acceptance tests passed).
7. [ ] Small items: export the history (CSV/JSON); battery voltage,
       temperature and cycles in a tooltip; a "not resampled" mark when the
       output rate matches the file; the upload bound (1 GiB in the catalog,
       stock allows 2 GiB − 1).
8. [ ] Pinned albums and pinned artists (owner): keep chosen albums and
       artists at hand, for example at the top of Home and of their lists.
       Where pins live (this browser, or the card so every browser shares
       them) to be decided.
9. [x] Karaoke mode (owner): the current track's LRC lyrics full screen in
       a large font, no more than 6 to 8 lines on screen. Proposed: opened
       from the Lyrics tab (and a key), the current line centred with the
       previous and next lines dimmed around it, a fill sweeping the current
       line from its stamp to the next one, the font sized to the screen
       height, the cover's tone behind, and play/pause, previous, next and
       Esc to leave. Plain (unsynced) lyrics scroll without a highlight.
       Limits: the Fullscreen API works over the player's plain HTTP, but the
       Screen Wake Lock needs a secure context, so the screen may still dim.
       Done (2026-09-27) with word timings, as the owner asked: enhanced LRC
       `<mm:ss.xx>` stamps are kept per line (text before the first stamp
       starts with the line, a stamp with nothing after it ends the last
       word, repeated lines keep their word rhythm, `[offset]` applies) and
       each word or syllable fills from its stamp to the next; lines without
       them fill across to the next line (at most 10 s). The K key (any
       layout) opens and closes it; Esc and leaving full screen close it
       without closing the listening panel. Unit tests for the parser and the
       sweep, a mock test on both projects (an enhanced LRC on "Still Here":
       the words fill, the next line takes over, at most seven lines show),
       screenshots on a desktop and a phone.

## Owner finding (2026-09-27): CUE albums

On the player every row of "Planet of the Apes: Best of Guano Apes" showed as
the current track while one played; other albums were fine. The album is a
CUE image: one FLAC and its sheet. Stock indexes one SONG row per CUE track,
all with the same PATH (IS_CUE=1, TRACK, OFFSET), and a202 reports that path,
`is_cue: true` and `song_track: 0`, so only the title tells the tracks apart
(snowsky-disc-qemu docs/protocol/formats.md). The page compared paths only.

- [x] A track's identity is its path and, for a CUE track, its title
      (`trackKey`, `sameTrack`; IS_CUE and a202 `is_cue` are read): the
      current row in lists and tiles, favorites (MY_LOVE keeps one row per CUE
      track) and the playing track's library names. The last one was a
      second bug the emulator found: the player bar named the playing CUE
      track after another track of the same file.
- [x] The file's own duration, .lrc and embedded lyrics are not applied to a
      CUE track (they describe the whole image); stock's own lyrics still
      are, and moving between tracks of one image reloads them.
- [x] The Card page counts an image once for its album and in the totals.
- Emulator acceptance now includes a CUE image (three tracks in one FLAC):
  selecting the second track plays and names it, and exactly one row is
  current (14 acceptance tests passed through the MIPS service). Unit and
  component tests cover the identity, parsing, naming and sizes.
- Service note: the play observer counts plays per open file, so a CUE image
  played through records at most one play per file, not one per track.

## Owner findings (2026-09-27): genre spellings and queue covers

- [x] Genres that differ only in case and spacing ("alternative",
      "Alternative", "Alternative ") are one genre on the page, shown under
      the spelling most tracks carry, with its albums, tracks and artists
      from every spelling; old links with another spelling open it. Stock
      keeps each spelling as a genre of its own and plays one at a time, so
      the whole genre plays its main spelling, a track plays in its own
      spelling and a genre album in the spelling its tracks carry; the genre
      page names the spellings and the one it plays. Unit tests for grouping,
      lookup and the playable spelling; a mock test (the mock's Two Rooms is
      now tagged "alternative ").
- [x] Queue rows in the listening panel showed the placeholder sleeve:
      stock's queue list carries only a title and an artist. Each row is now
      matched to the persisted queue (LIST_SONG_0 through the `queue` data
      query, taken position by position when every row agrees, else one
      unique match in the queue or the library), which gives its path and so
      its album cover. Unit tests for the matching; the mock serves the
      `queue` query and its test checks four covers; the emulator acceptance
      checks the Harbor folder cover on all three queue rows (14 acceptance
      tests passed through the MIPS service).

## Owner requests (2026-09-27): small fixes with the file manager

- [x] The row heart as large as the play glyph on a cover (16 px, 12 px on
      phones).
- [x] The sidebar toggle sits next to the sidebar.
- [x] Karaoke: lines fade and blur more with their distance from the sung
      one, sung lines sooner; more space between lines; a pause (an empty
      line, a note or dots in the LRC) and a long intro show three dots that
      fill one after another until the next line, the filling one
      twinkling; leaving the page closes karaoke.
- [x] "Artists by size" shows the artists' pictures.
- [x] Possible duplicates link their folders into the file manager.
- [ ] Icon sizes (found on the way): UiIcon's default `size-20` comes after
      every smaller `size-*` utility in the stylesheet, so an icon given a
      size below 20 px is drawn at 20 px on desktop (phone variants do
      apply). Moving the default into the base layer fixes it, but shrinks
      about thirty icons at once (search, the language chevron, volume,
      row play glyphs); a separate pass with before/after screenshots for the
      owner. The heart uses an important size meanwhile.

## Owner requests (2026-09-27): folder play, a remembered track and layout

- [x] The Space / Files tabs sit on the right of the Card heading.
- [x] Folder play in the file manager: hovering a folder (or a file) offers
      Play, the playing one Pause/Resume, as in track lists. Stock's own
      folder play, documented and physically observed in snowsky-disc-qemu
      (docs/protocol/library-browsing.md): `0101` + list type `0004` + the
      folder path plays it from its first audio file (not its subfolders);
      `0100` + a position in the playback browser (`/localdir/…/`,
      subfolders counted) plays one file; `playerflag` 4. Already admitted by
      the card catalog. The guarded sequence reads the folder twice, checks it
      again right before the one send and confirms by the playing file's
      path. Unit tests (first file past subfolders and covers, one file by
      position, nothing sent for covers, missing files, a changing folder or
      an `.m3u` path), a mock test and the emulator acceptance on stock.
- [x] The sidebar toggle 10 px further from the sidebar on wide screens.
- [x] A remembered track after a reconnect: when stock reports no play state
      (its queue ended, or USB storage mode handed the card back), the bar
      shows the track stock remembers, paused, as the player's own screen
      does, and Play continues it. Emulator findings (2026-09-27): after a
      reboot stock still reports the paused track; after its queue ends it
      answers no play state while `curlist/song` keeps the queue and its mark;
      after the card leaves and returns (the emulator refuses while a file is
      open, so only after the queue ended) the live queue is empty too, but
      MEMORY_PLAY (a LIST_SONG_0 row, and with "Position" the position) and
      LIST_SONG_0 stay. The page reads both, names the queue's source as the
      play history does, and Play selects that track in the same source with
      the guarded selection (a whole artist continues in the track's album of
      that artist; an unknown one-folder queue through folder play), then
      seeks to a remembered position. Previous and next wait for Play; seeking
      is off until it plays. The guest now runs with memory playback "Song",
      like the owner's player. Unit tests, a mock test (a silent stock) and
      the emulator acceptance (Streetlight paused, resumed, played to the
      queue's end, reconnect: shown paused, Play continues it; 17 acceptance
      tests passed).
- [x] The sidebar's "Good music. Always within reach." note is gone, so the
      sidebar does not scroll.

## Disc Player release with combined-008 (in progress)

The owner's plan for a public release under the name **Disc Player**; the
whole scope, the image items and the installer track are kept in the service
plan (snowsky-disc-service `docs/plan.md`, "Combined-008"). The service's
stages 1 to 7 are done. Scope of this round (owner, 2026-09-28): the
visualizer and the enrichment providers go to sessions of their own; the
compatibility message and the name Disc Player wait; the rest goes ahead,
plus macOS leftovers on the Card page. The page's part:

- [x] Pairing by the player's serial number only (no token file, no SN
      marker): the connection dialog asks for the SN once and keeps it
      (a new storage key, so an old token is never sent). Unit, component
      and mock browser tests (105 passed).
- [x] Everything the service keeps lives in `.disc/` on the card: the page
      releases (`.disc/www`), the database; the file manager hides `.disc`
      (every hidden entry) and creates nothing below a hidden folder;
      `DISC_WEB…` and `www` are ordinary names now.
- [x] Play history from the service's database (same route; a CUE track's
      plays count on their own by the title the service records) and pinned
      artists and albums (round 16, item 8) on the store's `pinned_artists`
      and `pinned_albums`: a Pin button on the album and artist pages, pins
      first in Albums and Artists, a Pinned section on Home. Unit tests
      (`pinnedFirst`, the store client) and a mock browser test.
- [ ] Smart playlist definitions (round 16, item 2) on a card-catalog
      collection. First candidate (owner, 2026-09-29): an artist's most
      played tracks, the artist page's "Most played" as a playable list.
      Stock plays only its own lists, so an auto-playlist lives as a managed
      stock playlist (like the service playlists above, e.g. "Most played ·
      P!nk"), visible on the device too; the page brings its members up to
      date through the guarded playlist edits (only the difference, confirmed
      by reading back) when it is played or refreshed, and its definition
      (kind, artist or genre, size) sits in a store collection, so every
      browser knows which stock lists are automatic and never edits them by
      hand. Disliked tracks stay out. Further candidates: most played overall,
      recently added, long not played, a genre's favorites. Better base, found
      on the guest (2026-09-29, the owner's idea): an M3U file of our own in
      `.disc/playlists/`, which stock plays by path through folder play and
      reads at play time, so an update is a file write, not a series of
      guarded position edits, and needs no scan; entries relative to the card
      root. It needs a service route that writes the lists (next image, see
      the service plan); such lists do not appear in the device's playlist
      list. Researched in snowsky-disc-service `docs/m3u.md` (forms, missing
      entries, CUE images, navigation, history hash, favorites).
- [x] Disliked tracks, the store's acceptance case (owner, 2026-09-28): the
      `disliked` collection of the card catalog (a CUE track by its path and
      title), Dislike in every track menu and in Now Playing, the Disliked
      list under Favorites, hidden from Home and New; the service skips a
      disliked track on its own through the catalog's skip rule, and while
      the page holds control it skips with Next itself (at most ten in a
      row). Unit tests and a mock browser test; smart playlists will leave
      them out when they come.
- [x] Emulator acceptance against stock (2026-09-28): release
      `784edefa1737c1cd` published to the guest's `.disc/www` on the service
      build `d71ae7b16031`; all 22 cases passed, the new ones being disliked
      tracks with the page's skip rule (which now waits for a running
      selection, so Next is never refused as busy) and a CUE track disliked
      alone, pins read back after a reload, a folder and macOS leftovers to
      the trash and back, a FLAC and a CUE track played in the browser, and
      the diagnostics. Found there: stock's folder listing answers the folder
      it listed last from memory, so after a trash change the page lists
      `.disc/` first (`docs/gateway.md`); the mock now behaves the same.
- [x] On the owner's player (2026-09-28): combined-008 installed (image
      `ecebe540…` with this page built in), release `784edefa1737c1cd`
      published to the card's `.disc/www` and served from there, the play
      history moved into the service's database; the owner's browser
      acceptance over Wi-Fi: "все отлично работает" (snowsky-disc-service
      `docs/combined-008-installation-observation.md`).
- [ ] The page updates itself: fetch a new release (GitHub Releases) and
      upload it through the service into `.disc/www`, without USB storage
      mode.
- [ ] Compatibility with older images: say "update the firmware" and hide
      what the image cannot do, instead of failing on unknown routes.
- [x] An "About" view from the service's diagnostics document (versions,
      card and database state, recent service errors): a Diagnostics
      disclosure in the connection dialog, read when opened. Unit and mock
      browser tests.
- [ ] The page stays at `IP:7870` for now; a simpler address (`disc.local`)
      is recorded and deferred.
- [ ] The name Disc Player in the page and the guide, marked unofficial and
      not affiliated with FiiO or SNOWSKY; a user guide with real
      screenshots, the risks and the way back to stock, licenses.
- [x] The trash (owner, 2026-09-28), on the service's reversible trash in
      `.disc/trash`: "Move to trash" for a file or a folder in the file
      manager (with a confirmation naming what moves; not offered for what
      is playing), and a third Card tab, **Trash**: what was moved, from where,
      when and its size; Restore (back to its folder), Delete permanently,
      Empty trash; the trash's size also on the Space tab. After moving or
      restoring music the page offers to update the library (a scan), since
      stock drops or finds the tracks only then. Replacing a cover or an LRC
      moves the old one to the trash too (the service's replace-to-trash
      header; the page uses it once it replaces covers). macOS leftovers
      (`._*`, `.DS_Store`, `.Trashes`, …) move as one entry from the Trash
      tab. Unit tests and a mock browser test (move, restore, leftovers,
      the Space line, a dismissed and an accepted confirmation).
- [x] Play in this browser (owner, 2026-09-28), on the service's read-only
      audio route: a track (its menu) or an album (its page) plays in the
      browser (a phone, a TV) while the player rests, a CUE track from its
      offset in the image; a small bar pauses, skips and stops it. FLAC, MP3
      and AAC play everywhere, ALAC only in Safari, DSD and APE not at all
      (the page says so when the browser refuses). Mock browser test.
- [x] A visualizer next to karaoke (owner's question about Visicality): our
      own canvas code (Visicality has no license, so only its ideas are
      used). First step (owner, 2026-09-29): only for playing in this
      browser, where the sound is the browser's own: its audio element feeds
      a Web Audio analyser, so the picture is exactly in time, no second
      stream crosses the Wi-Fi and a TV or laptop works as the speaker with
      the picture on screen. First design (owner, 2026-09-29: "in the style
      of the Disc project, a ring or a disc", after Visicality's circular
      designs): the project's ringed-disc mark brought to life. The cover
      turns slowly as a disc with the mark's hole, its grooves light with
      groups of bands, the mark's white ring pulses with the bass and the
      spectrum (48 logarithmic bands) spreads from the ring in mirrored
      spokes, low notes at the bottom, high ones meeting at the top, with
      falling peak marks. Full screen from a button on the browser bar or
      the V key while the browser plays; Space pauses and the right arrow
      skips this browser's playback (not the player's); Esc, V, the close
      button, leaving full screen or the end of browser playback close it;
      controls hide while idle; reduced motion stops the turning and the
      pulse. The Lyrics tab keeps karaoke only: it belongs to the player's
      track, not the browser's. Evidence: unit tests for the spectrum and
      the drawing, a mock browser test (the mock's audio became quiet tones)
      on desktop and phone, and emulator acceptance where the analyser hears
      the guest card's FLAC through the audio route. Later: more designs,
      and the player's own playback (the browser plays the same file
      silently and follows the player's position, resynced at track
      changes, seeks and pauses). Known cost: once opened, the page's audio
      plays through the Web Audio graph, which a phone may suspend in the
      background; playing again resumes it.
- [ ] Now Playing without duplicated controls (owner, 2026-09-29, agreed):
      the side panel gets two tabs instead of three. "Now": cover, title,
      artists and album with links, a tag block (format and quality, bit
      rate, channels, the DAC stream when it differs, year, genre, disc and
      track numbers, album artist, file size and folder with a link to the
      file manager, plays and last played from the history, when added, the
      dislike action) and below it, on the same scroll, the whole queue with
      the current track marked; the bar's queue button opens "Now" at the
      queue. "Lyrics": lyrics, karaoke, later the visualizer. On desktop the
      panel has no transport, seek, modes or volume: the bottom bar is the
      one control surface. On phones, where the bar only has Play and Next,
      the open panel hides the bar and becomes a full-screen player with the
      full controls.
- [ ] Enrichment providers once the card catalog allows their origins:
      MusicBrainz with Cover Art Archive (tags, years, album artists,
      covers) and LRCLIB (synced lyrics for karaoke), each off by default
      (track names leave the network), results offered, not applied
      silently; applying writes covers and LRC to the card (tags later, with
      the tag editor). Spotify and Apple Music need secrets a static page
      cannot keep; no third-party code plugins. Order proposed (2026-09-29):
      LRCLIB lyrics first, then Cover Art Archive covers (and years, album
      artists) for albums without one; MusicBrainz at most one request a
      second; applying writes only where nothing exists, never overwrites.
      Artist pictures (owner's question): neither Cover Art Archive nor
      MusicBrainz hosts them, but a MusicBrainz artist links Wikidata, whose
      image (P18) is a Wikimedia Commons file (free licences, no key, CORS):
      MusicBrainz, then Wikidata, then a Commons thumbnail, with the author
      and licence kept and shown; new origins `www.wikidata.org` and
      `upload.wikimedia.org` in the card catalog. Where none exists, the
      artist's most played album cover stands in. Last.fm (placeholders
      only), Fanart.tv and Discogs (keys) and Deezer (no CORS) do not fit.

Ideas to weigh (2026-09-29, collected with the owner): listening statistics
from the service's history (top artists, hours a week); a library health view
(albums without covers or tags, duplicates), which meets the enrichment;
ListenBrainz scrobbling with the user's own token kept in the browser, off
until switched on.

Without a new image (card-only, can come first):

- [x] Owner's second testing round (2026-09-29), card-only: after a sync
      that removes a file of the current queue stock drops `LIST_SONG_0`
      until the next play, and the counts and the queue answered 503; the
      counts now only say whether the table exists and the page reads the
      new `queue_state` before the queue (an empty queue when it is gone);
      the artist page plays the artist and shows its most played tracks from
      the play history (the album under the artist's own ones); pinned albums
      and artists carry a mark on the cover; album captions and the album
      heading no longer count tracks (the year is a line of its own). Unit
      and mock browser tests (125 passed); published on the owner's card as
      release `42d6711790fcb1e1`.
- [x] Owner's testing on the combined-008 player (2026-09-28), card-only:
      a deleted album no longer stays on the Recently played shelf as its
      artist or genre; the detail heading is as tall as its sleeve (the kind
      of page on its top edge, the name sized by its length, the actions on
      its bottom edge, secondary actions as round icon buttons), after the
      Yandex Music album header; album rows name the artist only where it
      differs from the album's (a guest); the player card counts the tracks
      even when the counts answered busy (stock scanning after USB storage
      mode; reads now retry for about 7 s and the counts are read again);
      favorites and playlist entries whose file is gone stay in place,
      dimmed and not playable, as in Apple Music and Yandex Music, their
      heart and menu (only what needs no file) still working. Unit tests and
      mock browser tests (119 passed); published on the owner's card as release
      `95a93be3653aac77` (the previous `784edefa1737c1cd` kept). Fix
      (2026-09-29, found by emulator acceptance): stock gives an album the
      credit of the track it scanned first, a guest's joint credit included,
      so an album of Lumen's with Kestrel on one track was headed "Lumen &
      Kestrel" and the rule hid the guest's row and named Lumen on the
      others. The rows now leave out the credit more than half of the
      tracks carry (the heading's when none does, as on a compilation).
- [x] Owner's review of the layout (2026-09-28): the sidebar toggle is a
      round button on the sidebar's edge, after Reddit, that stays in place
      while the page scrolls; the search takes the whole free width of the
      top bar; the file manager's play layer covers a folder's icon instead
      of showing it through; rows of the Card views (Files, Space, Trash)
      light up under the pointer like track rows; scrolling to an element
      keeps it clear of the fixed player bar and phone navigation.
- [ ] Interface size in the appearance settings (owner, 2026-09-28): 100 %
      (today's, the smallest), 115 % and 130 %, scaling the whole interface
      (CSS `zoom`, sizes are in pixels), for TV browsers with a remote; check
      arrow-key navigation and a clearly visible focus ring there.
- [ ] Add a cover or an LRC where a track or an album has none, through the
      existing upload route (it admits those names and never overwrites).

## Owner's polishing notes (2026-09-29), card-only

In the order agreed for work: what loads the player or blocks its control
first, then layout, then style.

- [x] Adding a track to a playlist sends many requests: check the flow for
      a full resync and read back only the edited playlist. Found: each add
      read the whole library (`all/song`, page by page) three times to find
      the tracks' positions, and every playlist or favorites change then
      reloaded the whole collection. Now tracks of one album are taken from
      that album's list (`album/song`, which the reviewed catalog already
      admits; the whole library stays the source for tracks of several
      albums), and a change re-reads only the playlists or the favorites
      with the counts, keeping the saved copy in step. Unit tests; emulator
      acceptance adds an album to a playlist this way on stock.
- [x] Play, pause and the other actions freeze and lock the controls,
      track rows included: make the wait softer while keeping one command
      at a time and no replay after an uncertain outcome. Found: every
      operation (2.1 s pacing, the send and the readback) disabled the
      transport, modes, volume, seek, hearts, play buttons and all track
      rows, and a press meanwhile was refused with "Please wait". Now nothing
      is disabled: a press while the player works waits in one slot (a newer
      press takes its place) and runs after the current operation with its
      own pacing and preflight; it is dropped unsent, with a message, when
      that operation ended uncertain. Mode changes decide on/off when they
      run. The player bar shows a thin working line after 300 ms. Unit tests
      of the slot and a mock browser test (two quick Next presses, controls
      and rows enabled meanwhile).
- [x] Space on the Card page is measured again on every visit without a
      card change or a reconnect: keep the measurement until the card
      changes. Found: measured sizes were already kept in this browser, but
      a file the media route gave no size for (gone from the card while the
      library still lists it, or unreadable) was never remembered, so every
      visit asked for it again and showed "Measuring". Such a file is now
      remembered for a week like a missing duration or year, counted as
      "could not be read" next to the measured ones, and "Measure again"
      forgets it too. The cache belongs to one address: the page opened by
      another name or IP measures again. Mock browser test with a file whose
      info answers 404, over a reload.
- [x] The album grid switches from 4 to 8 columns when the queue panel
      opens: at most 4 columns, even on a large screen. The open panel
      filled the grid with as many 145px columns as fit; a column is now at
      least a quarter of the grid (less the widest gaps), so 4 at most and
      fewer in a narrow window. Mock browser test at 1920 and 1280 px.
- [x] The Home hero offers no unknown artist or unknown album and no album
      without a cover. Stock names missing tags "Unknown Artist", "Unknown
      album" and "Unknown genre" (strings of the V2.57 `mq_player`); the hero
      leaves out albums so named (title or lead artist) and albums known to
      have no cover, and picks among albums with a known cover when this
      browser knows any. Covers are judged from what this browser already
      knows, so choosing reads nothing; the choice stays while it qualifies,
      so the hero does not change as covers arrive. Unit tests.
- [ ] Karaoke without word timings highlights the current line only, with
      no sweep across its words.
- [ ] The heart sits before the duration in track tables, so the gap reads
      as a column, not as padding.
- [ ] A genre page names its number of artists in the heading, and its
      Artists shelf counts albums, not tracks (inside, the artist shows
      albums).
- [ ] The Hi-Res badge: square corners, black text on yellow, after the
      Hi-Res Audio mark.
- [ ] Play album, Play artist and Play genre: a crisper label and icon, and
      a hover that changes the background instead of moving the button.

## Requests for the next service build

Capabilities the current engineering image (snowsky-disc-service
`combined-005`, catalog `a3e0203b38aceca7`) cannot give the player, found
while porting. Each needs a service change, emulator acceptance and a new
image; card-only items (catalog or query additions) are marked as such.

- [x] **Media metadata endpoint.** Read-only, bounded reads from the card:
      FLAC STREAMINFO (duration, sample rate, bit depth, channels), embedded
      PICTURE blocks, folder `cover.jpg`/`folder.jpg`, served per path or per
      album with proper image types and cache headers. Stock fills DURATION
      only after playback (83 of 779 tracks on the owner's player) and keeps no
      artwork. Unblocks covers and durations for the whole collection.
- [x] **Forward stock Content-Type for image routes.** `/api/stock/image/cover/`
      is labelled `application/json` today, so the UI decodes bytes onto a
      canvas instead of using `<img>`.
- [x] Decide whether the page CSP should allow `img-src 'self' blob:` for
      cached artwork, or whether the media endpoint makes that unnecessary:
      covers load as `/api/media/cover/…` under `default-src 'self'`.

- [x] **Re-encode stock paths in the proxy.** civetweb decodes the request
      path and `stock_proxy` writes it verbatim into the upstream request line,
      so `GET /dir/…/My Album/` (a space) breaks and a literal `%` is decoded
      twice; stock expects percent-encoded paths. Uploads are unaffected (the
      gateway writes decoded names). Blocks folder browsing and `/dir/` readback
      for typical album folders.
- [x] **Scan guard in the gateway.** The gateway admits uploads and other
      mutations while stock scans the card; today only the client refuses them
      (it watches `a622`/`a60a` on its own session).
- [x] _(card-only)_ Declare `start-pos` / `num-max` on `transfer_browse` and
      `playback_browse` in the command catalog; undeclared headers are not
      forwarded, so folder listings cannot page.
- [x] _(card-only)_ Admit `love/song` in `playlist_remove` so a favorite can
      be removed from any row (`DELETE` with `delete_source: 0` and `[[p,p]]`
      in fresh `love/song` order; emulator-verified in the reference, not yet
      captured on a physical player). Adding a favorite to a non-playing
      track has no known route.
- [x] _(card-only)_ Correct the `peq_presets` note in the query catalog: user
      slots are `STYLE_PRESET` 11..20; rows 160..169 hold `(null)`.
- [x] **Favorites for any track (research, 2026-09-26).** No remote route
      exists: `0104` changes the current track only, and the stock HTTP
      batch adder (`POST /add_custom_list/`) hard-codes a custom playlist as
      its destination (static analysis of V2.57 `mq_player`, handler
      `0x493ee4`). The player's own screen favorites any track by writing
      song.db itself: `mq_ui` copies the SONG row by its ID into `MY_LOVE`
      (an `INSERT … SELECT` from SONG) and removes by `MY_LOVE.ID`, or it
      sends `mq_player` its internal batch message `0117` with the favorites as
      destination. Guest check of the first way (a non-playing track written
      with that exact statement): the favorites list showed it, playing the
      favorites started with it, a202 reported `love: true` while it played,
      and the current-track unlike (`0104`) removed the row again. Not
      checked: the player's own favorites screen (it reads the same table)
      and a write racing stock's own writes.
- [ ] Favorite any track through the service (next image, needs the owner's
      decision): one reviewed data-level mutation that runs the stock
      screen's own statement for a SONG.ID (and its delete by MY_LOVE.ID),
      under the usual mutation guards, refused during scans, confirmed by
      reading the row back. It would be the service's first write to a
      stock database.
- [ ] _(card-only)_ Revisit the upload bound: the catalog allows 1 GiB per
      file, the reference 2 GiB − 1; the UI uses the catalog value.

## Later

- Several application roots on the card, cloud relay and voice clients follow
  the service's Stage C.
- A user-facing demo mode (decide on the reference's fictional artwork).
