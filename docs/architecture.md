# Architecture

```text
Browser (this app, served from the SD card)
    | same origin: /api/health, /api/data, /api/stock, WS /api/websocket
DISC service gateway (native, inside the player)      snowsky-disc-service
    | reviewed catalogs, serial number, request IDs, one owner
Stock FiiO services (TCP 12100, HTTP 12103, SQLite)
```

The app is a static Vue 3 + TypeScript bundle built by Vite, styled with
Tailwind CSS v4. There is no application server: the page is the client of
the gateway, and the gateway is the only thing it trusts.

## Layers

| Layer                 | Folder                                  | Knows                                                                                                                                                                                                | Never                           |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Domain                | `src/domain`                            | Plain types and pure helpers: `Track`, `Playback`, `PlayerIdentity`, `LibrarySummary`, pairing serial number rules, formatting                                                                       | Vue, transport, UI              |
| Gateway               | `src/gateway`                           | Wire formats and the gateway contract: record framing, the owner session, HTTP data/stock calls, release files, mapping wire → domain                                                                | Vue, app state, UI              |
| Stores                | `src/stores`                            | Reactive app state and actions built on the gateway: connection, pairing, playback, library, appearance, where music plays (`output`) and the switch between the player and this browser (`handoff`) | Presentation                    |
| UI primitives         | `src/ui`                                | Buttons, cards, fields, selects, icons, status dots, notices: text and values via props                                                                                                              | Domain objects, stores, gateway |
| Components            | `src/components/<area>`                 | Domain objects via props, intents via events (`transport`, `save`, …)                                                                                                                                | Stores, gateway                 |
| Panels, views, layout | `src/panels`, `src/views`, `src/layout` | Wire stores to components; page structure                                                                                                                                                            | Wire formats                    |
| i18n                  | `src/i18n`                              | Interface strings (en, ru) and the locale preference                                                                                                                                                 | Device metadata                 |

ESLint (`eslint.config.js`) enforces the import direction. The same domain
object (a `Track`, later `Album`, `Artist`, `Playlist`, `QueueItem`) is shown
by the same components in every view, whatever its source: a playback
observation, a data-level row or a stock catalog page. Sources map into the
domain in `src/gateway`, never in components.

## Playback selection

Selections follow the reference Controller exactly: a source's stock
membership is read twice from catalog pages (`src/gateway/catalog.ts`),
the target is resolved in stock order (data-level IDs are never positions),
the target row is re-read just before one `0101`/`0100` with a fresh request
ID, and a fresh `0202` must show the expected source and track. Outcomes are
`playing`, `changed`, `ambiguous`, `unavailable` or `uncertain`; none is
retried. The queue is read the same way from `curlist/song` with a stable
`mark-pos`.

Sources: whole album or album track (type 3, the stock title group), one
artist's release of an album title (type 7, `artist/album/song`, confirmed by
playerflag 7 and the exact artist), a whole artist (type 7 with an empty
album, Play all only), a whole genre (type 8 with an empty album, playerflag
8), a track in a genre (type 000A, playerflag 10), a genre narrowed to an album
(type 8, `style/album/song`), library track (1), favorite (6) and playlist (5,
its position resolved by unique name and rechecked). Each target maps to one
read, send and confirmation plan in `src/gateway/selection.ts`. When `a202`
reports a shortened album name, a prefix is accepted only if exactly one name
of the scope's fresh, stable album list starts with it. The stock
groups albums by title only, so the UI keeps the literal track artist as the
album scope in links (`#/album/<title>/<artist>`) and never infers an album
artist; an unscoped title group with several artists offers them as filters.
Type-7 names containing quotes or backslashes are refused before any read,
because the stock parses that selector with `sscanf`.

## State and actions

Stores are module-level `reactive` objects exposed read-only, with explicit
actions. The connection store owns the only `GatewaySession`; other stores
subscribe through `onSessionOpened` and reach it with `activeSession()`.
Actions follow the reference Controller: one request at a time, mutations
with a fresh request ID followed by a fresh read, uncertain outcomes surfaced
and never retried, no automatic reconnect.

`src/stores/operation.ts` holds the single operation lease: a second request
while one runs is refused (`busy`), except the player's controls and playing
from the collection, which wait (2026-09-29). One request waits at most: a
newer one supersedes it, it starts after the running operation with its own
pacing and preflight, and it is dropped unsent when that operation ended
uncertain or failed. Nothing is disabled while an operation runs; the player
bar shows a thin working line instead. Each operation receives the
session, the mutation pacer (2.1 s between mutations, counted from connect),
a scan guard that throws once `a60a`/`a622` scan activity was observed, and an
`attempted` marker set right before the one send. `src/stores/observations.ts`
turns pushes into state: the `a103` position, the `a102` play mode and scan
activity. Mute is an ordinary volume change to 0; the replaced level is a
browser preference (`disc-player.volume-before-mute`).

The service's own state (combined-008) has stores of its own:
`stores/disliked.ts` (with the page-side skip rule), `stores/pins.ts`,
`stores/trash.ts` (with the rescan offer), `stores/about.ts` and
`stores/browser.ts`, which plays card files in an `Audio` element through
the media route, a CUE track from its offset, without touching the player.

External providers are reached only through origins the release's reviewed
`origins.json` names (the service adds them to the page's policy; the page
reads the same file through `loadOrigins()` and `originAllowed()` before
offering a provider), and only once the owner allowed the source in
Settings: `stores/externalSources.ts` reads and writes the store's
`external_sources` collection (allowed, automatic; off without a record or
without the collection; a source found by MusicBrainz ids also needs
MusicBrainz allowed), and `views/ExternalSourcesSettings.vue` groups the
sources by what they bring. Each provider's store checks both
(`lyricsLookupAvailable`, `coverLookupAllowed`, `artistPhotosAllowed`); an
automatic lookup runs once per album or artist page in a tab, and for the
playing track. `gateway/lrclib.ts` asks LRCLIB for a track's lyrics
with plain GETs; `stores/lyrics.ts` offers the lookup for a track without
lyrics and saves what it found beside the track through the upload route.
`gateway/musicbrainz.ts` (paced to one request a second) and
`gateway/coverart.ts` find an album's front cover; `domain/covers.ts` picks the
release and the folder a cover may go to, and `stores/coverSearch.ts` offers,
previews and saves it as the album folder's cover through the upload route.
`gateway/wikimedia.ts` reads an artist's photo (a Wikidata image, Commons
image information with author and licence, the thumbnail's bytes);
`stores/artistPictures.ts` keeps photos in IndexedDB and gives artist cards
their photo or a stand-in album cover.

The listening panel (`layout/ListeningPanel.vue`) has two tabs. Now shows
the track's head (`components/player/NowPlayingDetails.vue`, whose controls
render only on phones, where the panel is a full-screen player and the bar is
hidden), its facts (`components/player/TrackFacts.vue` from the pure
`domain/nowFacts.ts`: stock's play state, the library row, the file measured
through the media route and the service's play history) and the whole queue;
Lyrics holds the lyrics and karaoke. On wider screens the bottom bar is the
only control surface. A row's title opens its track in the same panel
(`layout/TrackPanel.vue`, `openTrackPanel` in `stores/ui.ts`): the facts come
from the same `domain/nowFacts.ts`, the lyrics from `ownLyrics()` (the file's
own, read once), and Play selects what the row's play button would.

The visualizer (`layout/VisualizerMode.vue`) draws what plays in this
browser. Its first opening (a click or the V key, since browsers start audio
only from the user's own action) routes the `Audio` element through a Web
Audio `AnalyserNode` (`browserAnalyser()`), which stays in place from then
on. The numbers are pure (`domain/spectrum.ts`: logarithmic bands, eased
levels, falling peaks, mirrored spokes, grooves) and the painting is one
function over a 2D context (`layout/discDrawing.ts`), so both are unit
tested without a browser; the renderer takes any analyser, so the player's
own playback can feed it later. Karaoke and the visualizer share
`layout/fullscreenOverlay.ts` for entering and leaving full screen.

Search covers the whole collection in the page's memory, never the player.
`domain/globalSearch.ts` prepares each collection's compared text once
(lower case, no diacritics, ё as е) and ranks a name equal to the query, then
its start, then a word's start, then any match; every word of the query must
be found. `views/searchResults.ts` groups the ranks by kind (the section the
search started from first) and picks the top result. The palette
(`layout/SearchPalette.vue`, `/` or ⌘K) is a combobox over those groups and the
page's commands (`layout/paletteCommands.ts`); the search page
(`views/SearchView.vue`, `#/search?q=…&from=…`) lists every match. A page
below a section gives its breadcrumbs through `views/crumbs.ts`; the top bar
shows them.

## Build and serving constraints

- **CSP** `default-src 'self'` on every page: no inline script/style/handlers,
  no `data:` URLs (Vite `assetsInlineLimit: 0`), no external fonts or CDNs.
  Tailwind compiles to a static CSS file; SFC templates are precompiled, so
  the runtime never evaluates code.
- **Paths.** The page is the app `Apps/Disc Player/` (combined-009), served
  at `/` and at `/apps/Disc%20Player/`, so every reference is relative
  (`base: './'`); `/api/…` stays absolute. The app's own `origins.json` is
  fetched relative to the script (`new URL('..', import.meta.url)`); the
  reviewed catalogs come from the service at `/api/contract/`.
- **Hosted build** (`VITE_HOSTED=1`, 2026-09-30): the same app on a public
  HTTPS site. `src/gateway/address.ts` prefixes `/api/…` with the player's
  address (`http://ingenic.local:7870` or the user's), declares
  `targetAddressSpace: 'local'` on its requests and builds the WebSocket
  address; browser audio plays with `crossorigin` so the visualizer hears
  it. The page on the card keeps relative, same-origin paths.
- **Routing** uses the URL hash (`#/albums?artist=…`): the gateway has no
  history fallback for unknown paths, and query strings on `/` are ignored by
  the gateway, so navigation state lives in the hash.
- **The rules for apps** are checked after every build by
  `scripts/check-bundle.mjs` (mirrors the service's `app_bundle.py check`).

## Preferences and storage

`localStorage` holds browser-only preferences: locale, appearance, the
pairing serial number, album sort, refresh-after-scan and the volume before mute.
Every access tolerates unavailable storage. IndexedDB holds the collection
snapshot keyed by the library signature and listening enrichment: durations
and covers per track path, plus album covers per title and per title and
artist (a title-only association is used for a scope only when the title has
a single artist, and for a track only from the same folder).

## Testing seams

`GatewaySession.open` takes a socket factory and `GatewayHttp` takes a fetch
function, so unit tests script the player. `tests/e2e/mock-gateway.mjs`
serves a built release exactly like the gateway (paths, CSP, owner, serial number,
request-ID replay) for browser tests in CI.
