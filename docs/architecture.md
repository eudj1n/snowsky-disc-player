# Architecture

```text
Browser (this app, served from the SD card)
    | same origin: /api/health, /api/data, /api/stock, WS /api/websocket
DISC service gateway (native, inside the player)      snowsky-disc-service
    | reviewed catalogs, token, request IDs, one owner
Stock FiiO services (TCP 12100, HTTP 12103, SQLite)
```

The app is a static Vue 3 + TypeScript bundle built by Vite, styled with
Tailwind CSS v4. There is no application server: the page is the client of
the gateway, and the gateway is the only thing it trusts.

## Layers

| Layer                 | Folder                                  | Knows                                                                                                                                 | Never                           |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Domain                | `src/domain`                            | Plain types and pure helpers: `Track`, `Playback`, `PlayerIdentity`, `LibrarySummary`, pairing token rules, formatting                | Vue, transport, UI              |
| Gateway               | `src/gateway`                           | Wire formats and the gateway contract: record framing, the owner session, HTTP data/stock calls, release files, mapping wire → domain | Vue, app state, UI              |
| Stores                | `src/stores`                            | Reactive app state and actions built on the gateway: connection, pairing, playback, library, appearance                               | Presentation                    |
| UI primitives         | `src/ui`                                | Buttons, cards, fields, selects, icons, status dots, notices: text and values via props                                               | Domain objects, stores, gateway |
| Components            | `src/components/<area>`                 | Domain objects via props, intents via events (`transport`, `save`, …)                                                                 | Stores, gateway                 |
| Panels, views, layout | `src/panels`, `src/views`, `src/layout` | Wire stores to components; page structure                                                                                             | Wire formats                    |
| i18n                  | `src/i18n`                              | Interface strings (en, ru) and the locale preference                                                                                  | Device metadata                 |

ESLint (`eslint.config.js`) enforces the import direction. The same domain
object (a `Track`, later `Album`, `Artist`, `Playlist`, `QueueItem`) is shown
by the same components in every view, whatever its source: a playback
observation, a data-level row or a stock catalog page. Sources map into the
domain in `src/gateway`, never in components.

## State and actions

Stores are module-level `reactive` objects exposed read-only, with explicit
actions. The connection store owns the only `GatewaySession`; other stores
subscribe through `onSessionOpened` and reach it with `activeSession()`.
Actions follow the reference Controller: one request at a time, mutations
with a fresh request ID followed by a fresh read, uncertain outcomes surfaced
and never retried, no automatic reconnect.

## Build and serving constraints

- **CSP** `default-src 'self'` on every page: no inline script/style/handlers,
  no `data:` URLs (Vite `assetsInlineLimit: 0`), no external fonts or CDNs.
  Tailwind compiles to a static CSS file; SFC templates are precompiled, so
  the runtime never evaluates code.
- **Paths.** The gateway serves the active `index.html` at `/` and every other
  file under `/releases/<id>/`. The build keeps `index.html` references
  root-absolute (the service publisher rewrites them to the release path) and
  everything else relative (`base: './'`). Release files are fetched relative
  to the script (`new URL('..', import.meta.url)`).
- **Routing** uses the URL hash (`#/albums?artist=…`): the gateway has no
  history fallback for unknown paths, and query strings on `/` are ignored by
  the gateway, so navigation state lives in the hash.
- **Bundle contract** is checked after every build by
  `scripts/check-bundle.mjs` (mirrors the service publisher).

## Preferences and storage

`localStorage` holds browser-only preferences: locale, appearance, the
pairing token. Every access tolerates unavailable storage. A saved library
snapshot for offline browsing will use IndexedDB (plan M6).

## Testing seams

`GatewaySession.open` takes a socket factory and `GatewayHttp` takes a fetch
function, so unit tests script the player. `tests/e2e/mock-gateway.mjs`
serves a built release exactly like the gateway (paths, CSP, owner, token,
request-ID replay) for browser tests in CI.
