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
- [ ] Emulator acceptance of the M0 build: publish on the disposable card,
      Playwright against the emulator gateway with the guest token.

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
- [ ] Service media endpoint (snowsky-disc-service, next image): read FLAC
      STREAMINFO (duration, sample rate, bit depth) and embedded PICTURE blocks
      or folder `cover.jpg`/`folder.jpg` from the card, bounded and read-only,
      so every album and track gets artwork and duration without playing it;
      forward proper image types. The UI then prefers it over enrichment.

## M2 — Library browsing

- [ ] Genres (possible with the current build, no service change): the
      library rows carry `GENRE`; stock serves `style`, `style/song`,
      `style/album` and `style/album/song`; playback uses the reference
      Controller's `genre_command` forms — whole genre `0101 000A<genre>`,
      indexed `0100 <pos> 000A<genre>`, and genre album with the type-8
      selector `0008{"style":"G", "album":"A"}` — with fresh `style/*`
      membership and preflight. Genre view, filters on Albums and Tracks,
      playback.
- [ ] Sorting and virtualization for large libraries within the gateway's row
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

- [ ] Create/rename playlists, add/remove members with fresh identity checks.
- [x] Import files and folders through the gateway upload, then an explicit
      scan with observed progress; no overwrite, no automatic scan. Deliberate
      difference: the gateway's own 201 with the same path and byte count
      confirms a file, because `/dir/` readback breaks on paths with spaces
      (see the proxy request below).

## M5 — Sound

- [x] Gain, balance, DAC filter, DRE with readback (gain and DRE apply on
      press, balance and filter on Apply).
- [ ] PEQ presets from the data level.

## M6 — Offline collection

- [ ] Snapshot of the library in IndexedDB for browsing while disconnected,
      with staleness shown; current-track artwork kept per snapshot.

## Requests for the next service build

Capabilities the current engineering image (snowsky-disc-service
`combined-005`, catalog `a3e0203b38aceca7`) cannot give the player, found
while porting. Each needs a service change, emulator acceptance and a new
image; card-only items (catalog or query additions) are marked as such.

- [ ] **Media metadata endpoint.** Read-only, bounded reads from the card:
      FLAC STREAMINFO (duration, sample rate, bit depth, channels), embedded
      PICTURE blocks, folder `cover.jpg`/`folder.jpg`, served per path or per
      album with proper image types and cache headers. Stock fills DURATION
      only after playback (83 of 779 tracks on the owner's player) and keeps no
      artwork. Unblocks covers and durations for the whole collection.
- [ ] **Forward stock Content-Type for image routes.** `/api/stock/image/cover/`
      is labelled `application/json` today, so the UI decodes bytes onto a
      canvas instead of using `<img>`.
- [ ] Decide whether the page CSP should allow `img-src 'self' blob:` for
      cached artwork, or whether the media endpoint makes that unnecessary.

- [ ] **Re-encode stock paths in the proxy.** civetweb decodes the request
      path and `stock_proxy` writes it verbatim into the upstream request line,
      so `GET /dir/…/My Album/` (a space) breaks and a literal `%` is decoded
      twice; stock expects percent-encoded paths. Uploads are unaffected (the
      gateway writes decoded names). Blocks folder browsing and `/dir/` readback
      for typical album folders.
- [ ] **Scan guard in the gateway.** The gateway admits uploads and other
      mutations while stock scans the card; today only the client refuses them
      (it watches `a622`/`a60a` on its own session).
- [ ] _(card-only)_ Declare `start-pos` / `num-max` on `transfer_browse` and
      `playback_browse` in the command catalog; undeclared headers are not
      forwarded, so folder listings cannot page.
- [ ] **Favorites for any track (research).** The stock remote protocol
      likes or unlikes only the playing track (`0104`); the player's own
      favorites screen may use another route. Find it on the emulator before
      admitting anything; until then other rows show state only.
- [ ] _(card-only)_ Revisit the upload bound: the catalog allows 1 GiB per
      file, the reference 2 GiB − 1; the UI uses the catalog value.

## Later

- Several application roots on the card, cloud relay and voice clients follow
  the service's Stage C.
- A user-facing demo mode (decide on the reference's fictional artwork).
