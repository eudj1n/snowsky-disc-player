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
already provides it.

- [ ] Layout: sidebar (brand, navigation, device card), top bar (breadcrumb,
      search, add music, sync, appearance, sound, language), content area,
      persistent bottom player; mobile bottom navigation and mini-player; the
      reference breakpoints.
- [ ] Design tokens and dark theme exactly as the reference; icon set;
      typographic placeholder sleeves.
- [ ] Dialog system with the reference rules: backdrop dismissal, scroll
      lock, focus return, Escape order; connection dialog with pairing.
- [ ] Hash routing with the reference navigation model (views, deep links,
      search cleared on navigation and kept on refresh).
- [ ] Home view: eyebrow, heading, hero, "Your albums" from the stock
      library through the data level.
- [ ] Bottom player: current track, transport, progress display, volume
      observation; disabled rules when disconnected, unpaired or incompatible.

## M2 — Library browsing

- [ ] Albums, artists, tracks, favorites, playlists and their detail views
      from the data level (`tracks`, `favorites`, `playlists`,
      `playlist_tracks`), search within the current view, genre filters.
- [ ] Large libraries: paging and virtualization within the gateway's row
      and byte bounds.

## M3 — Playback from the library

- [ ] Play album/artist/genre/playlist/track with the reference selection
      guards (expected membership vs a fresh stock read before sending).
- [ ] Listening side panel: Now Playing and Queue, refresh, current-row rules.
- [ ] Seek (preview while dragging, send once), volume, play modes,
      current-track favorite.

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
