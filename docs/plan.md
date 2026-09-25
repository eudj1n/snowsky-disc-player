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

- [ ] Genre filters, sorting and virtualization for large libraries within the
      gateway's row and byte bounds; offline snapshot of the collection (M6).

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
- [ ] Playlist and genre playback, selecting a queue row.
- [ ] Seek (preview while dragging, send once), volume, play modes and the
      current-track favorite; playing/paused position timeline.

## M4 — Collection changes

- [ ] Create/rename playlists, add/remove members with fresh identity checks.
- [ ] Import files and folders through the gateway upload, then an explicit
      scan with observed progress; no overwrite, no automatic scan.

## M5 — Sound

- [ ] Gain, balance, DAC filter, DRE with explicit Apply and readback; PEQ
      presets from the data level.

## M6 — Offline collection

- [ ] Snapshot of the library in IndexedDB for browsing while disconnected,
      with staleness shown; current-track artwork kept per snapshot.

## Later

- Several application roots on the card, cloud relay and voice clients follow
  the service's Stage C.
- A user-facing demo mode (decide on the reference's fictional artwork).
