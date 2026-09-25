# Reference: DISC Web and the Controller

The base implementation follows **DISC Web**
(`snowsky-disc-qemu/experiments/disc_web`): its interface _and_ its worked-out
experience — layout, responsive behavior, dialogs, keyboard and focus rules,
states and wording. It is then improved here. Protocol behavior follows the
reference **Controller** (`snowsky-disc-qemu/controller`) and catalog rules
follow the shared **Library** (`snowsky-disc-qemu/library`).

## What moves where

DISC Web was a Python server that owned one `DiscSession` (Controller) and
SQLite snapshots (Library), with a browser front end polling it. On the card
there is no application server: the browser talks to the gateway directly.

| DISC Web piece                                                                                                    | In this app                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/index.html`, `style.css`, `app.js` presentation                                                         | `src/layout`, `src/views`, `src/panels`, `src/components`, `src/ui`, Tailwind tokens in `src/styles/main.css`                                             |
| `frontend/core.mjs` pure helpers (search, navigation, placeholders)                                               | `src/domain` helpers with unit tests                                                                                                                      |
| `frontend/dialogs.mjs`, `connection.mjs`, `import-flow.mjs`, `sound.mjs`                                          | UI primitives and panels with the same interaction rules                                                                                                  |
| `frontend/i18n.mjs`, `locales/*.json`, `theme.js`                                                                 | `src/i18n`, `src/stores/appearance.ts`                                                                                                                    |
| `backend/server.py` HTTP API, request tokens, admission                                                           | Not needed: the gateway serves the app and enforces admission (Host/Origin, token, request IDs, one owner)                                                |
| `backend/device.py` projection over `DiscSession`                                                                 | `src/stores` over `src/gateway/session.ts`                                                                                                                |
| Controller `session.py`, `wire.py`, `models.py` (serialization, fresh preflight, bounded confirmation, no replay) | `src/gateway/session.ts`, `src/gateway/playback.ts`, store actions                                                                                        |
| Controller selection guards (expected membership compared with a fresh source read before play)                   | Store actions for library playback (plan M3)                                                                                                              |
| Library `catalog.py`/`sync.py` (two equal HTTP reads, snapshots)                                                  | The gateway's read-only data level over the stock `song.db` (paths included), plus stock catalog pages where playback positions must match stock ordering |
| Library enrichment (current-track artwork/duration)                                                               | Current cover through `/api/stock/image/cover/`, stored per snapshot in IndexedDB (plan M6)                                                               |
| Demo mode (`backend/demo.py`, `art/cover-*.svg`)                                                                  | The mock gateway for development and tests; a user-facing demo is a later decision                                                                        |

## Deliberate differences

- Primary pill buttons use the player's ink green, not the coral accent
  (owner's decision); coral remains for indicators.
- Loading skeletons shaped like each page replace the reference's loading
  text.
- The collection is browsable without connecting: the data level needs no
  owner session. Connecting is needed for playback only.
- The sidebar scrolls and drops its note on short windows so the device card
  never slides under the player.
- No page footer; quiet row dividers; no entity eyebrow on detail pages;
  the bottom player hides while nothing is observed (owner's review). Table
  header rows are muted and appear only on Tracks and Favorites, where the
  album column needs a name.
- Upload confirmation: the gateway's own 201 with the same path and byte
  count confirms a file; the reference read the folder back, which the
  current proxy cannot do for paths with spaces.
- Gain and DRE apply on press with readback; balance and filter keep Apply.
  Folders can be dropped with their structure; the collection refreshes by
  itself after an observed scan end (owner's proposals 3–5).
- Mute from the volume icon (volume 0, earlier level remembered in the
  browser); the stock has no mute command.
- The current track is marked by a pulsing dot rather than an icon.
- Album pages end with "More by" shelves of the same artist's albums.

## Invariants carried over

- One owner, explicit connect/disconnect, no automatic reconnect.
- No replay of an uncertain mutation; every write is confirmed by a fresh read.
- Unknown stays unknown: no guessed durations, artwork or state; decorative
  placeholders never count as metadata.
- Device metadata is displayed as is and never translated.
- Selections resolve against a fresh source read; displayed positions are never
  sent to the device blindly.
- Appearance and language are browser preferences and never change device
  settings.

## Using the reference

Read the reference source and documentation for behavior and wording. Port
behavior with tests. Do not copy firmware-derived data, captures or personal
catalog content. The demo artwork in DISC Web is original fictional content of
the reference project; reuse needs an explicit decision recorded in the plan.
