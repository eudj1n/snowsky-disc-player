# Development

Node.js 20.19+ (CI uses 24). Install once with `npm ci`.

## Commands

| Command                           | What it does                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev:mock`                | Visual development without a player: starts the synthetic mock gateway and the Vite dev server proxied to it |
| `npm run dev:emulator`            | Dev server proxied to the service's disposable V2.57 emulator at `127.0.0.1:17870`                           |
| `npm run dev`                     | Dev server proxied to `DISC_GATEWAY` from `.env.local`, e.g. a real player on the LAN                        |
| `npm run format` / `format:check` | Prettier (with Tailwind class ordering)                                                                      |
| `npm run lint`                    | ESLint: TypeScript strict rules, Vue rules, layer boundaries                                                 |
| `npm run typecheck`               | `vue-tsc` for the app and unit tests, `tsc` for configs and e2e                                              |
| `npm test`                        | Vitest unit and component tests                                                                              |
| `npm run build`                   | Production build, then the SD bundle contract check                                                          |
| `npm run check`                   | All of the above except e2e; this is what CI runs first                                                      |
| `npm run e2e`                     | Playwright against the mock gateway (build first), desktop and phone                                         |
| `npm run release`                 | Packs the Disc Player app as a zip with the service's tool ([release](release.md))                           |

## Seeing the interface without touching the player

All dev modes serve the app from `http://localhost:5173/` with hot reload. The
dev server proxies `/api` (including the WebSocket) and the active release's
files to a gateway and rewrites `Host`/`Origin` to it, so the gateway admits
the page as if it came from the card. Nothing is written to the card.

- **Mock** — `npm run dev:mock`. A fictional collection (names from the
  reference demo) and a scripted player that follows album, track and
  favorite selections and serves the queue; data reads are delayed by 700 ms
  (`MOCK_GATEWAY_DELAY`) so loading skeletons are visible. Its serial number
  is `00000000000000`, like the emulator's.
- **Emulator** — `npm run dev:emulator` while the emulator from
  snowsky-disc-service is running (`python3 scripts/emulator.py up` there).
  Real stock behavior, disposable media. Its serial number is
  `00000000000000`. Stock powers the guest off after 300 seconds
  of idle unless external power is present; connect emulated USB power for a
  working session (the container name comes from the service's
  `work/emulator.json`):

  ```sh
  docker exec <id>-emu python3 -c "from pathlib import Path; \
  from emulator.runtime.keys import Device; from emulator.runtime.peripherals import Peripherals; \
  Peripherals(Device(Path('/work/rootfs'))).set_usb(True)"
  ```

  After an idle power-off, `python3 scripts/emulator.py boot` in the service
  checkout brings the guest back.

- **Player** — put `DISC_GATEWAY=http://<player-ip>:7870` in `.env.local`
  (ignored by git) and run `npm run dev`. Reads work at once; controls need
  the card token. The player's gateway must have the engineering LAN marker.

## Tests

- **Unit** (`tests/unit/*.test.ts`): framing, IDs, playback parsing, session
  rules with a scripted socket, HTTP client, release compatibility, domain
  helpers, bundle contract checker.
- **Components** (`tests/unit/components/`, happy-dom): props in, events out,
  text rendering of untrusted metadata, accessibility labels.
- **Browser** (`tests/e2e/`, Playwright): the built dist served by
  `tests/e2e/mock-gateway.mjs` like the gateway serves the Disc Player app
  (at `/` and `/apps/Disc%20Player/`, the same CSP and caching, the catalogs at
  `/api/contract/`), checking CSP
  errors, language adoption, connect/identity, pairing + toggle with a fresh
  read, and a narrow viewport. To run the same tests against the emulator or a
  player that already serves this build:

  ```sh
  E2E_BASE_URL=http://127.0.0.1:17870 E2E_SERIAL=00000000000000 npx playwright test
  ```

### Emulator acceptance against real stock

`tests/e2e/acceptance.spec.ts` drives every guarded feature against the
stock of the disposable V2.57 guest: scan, same-titled albums and tag order,
scoped, genre and artist playback, transport, seek, volume and mute, modes,
favorite, queue, playlist editing, sound and EQ (restored afterwards), card
covers, file durations, sidecar and embedded lyrics, favorite removal from a
row, pairing with the emulator's all-zero SN, the service's own state
(disliked tracks with the page's skip rule and a CUE track alone, pins read
back after a reload, the trash with a folder and macOS leftovers, card files
and a CUE track played in the browser with the visualizer hearing them, the
diagnostics, lyrics found on LRCLIB and a cover found on Cover Art Archive
(both stubbed in the browser) saved beside a track and into an album folder,
a plain `.lrc` replaced by synced lyrics with the old one in the trash,
stock paused when playback starts in the browser,
an artist photo from stubbed Wikimedia within the service's policy) and an upload with a
scan. It changes device state, so it runs only with
`E2E_ACCEPTANCE=emulator` and never against a player. Steps, with the
emulator from snowsky-disc-service booted and USB power emulated:

```sh
C=$(python3 -c "import json;print(json.load(open('../snowsky-disc-service/work/emulator.json'))['id'])")-emu
tests/e2e/emulator/media.sh $C                      # tagged tones on the guest card
npm run build && DISC_SERVICE_DIR=../snowsky-disc-service npm run release
docker cp work/disc-player-<version>.zip $C:/work/disc-player.zip
docker exec $C python3 /platform/scripts/app_bundle.py install \
  --app /work/disc-player.zip --card /tmp/sdcard --confirm-card-write
# The store's auto_playlists collection (2026-09-30) is newer than the guest image's catalogs:
docker exec $C python3 /platform/scripts/app_bundle.py install-catalog \
  --card /tmp/sdcard --confirm-card-write
E2E_ACCEPTANCE=emulator E2E_BASE_URL=http://127.0.0.1:17870 E2E_SERIAL=00000000000000 \
  npx playwright test --project=desktop
tests/e2e/emulator/media.sh $C remove               # then rescan:
docker exec $C python3 -B /platform/tests/integration/prepare_guest.py
```

The last step leaves the CI album paused, as the service fixture expects;
delete any playlist a failed run left behind before rescanning.

Since combined-009 an installation replaces `Apps/Disc Player` whole, so
nothing accumulates on the guest card (a card once filled up with releases and
the service stopped recording plays, 2026-09-29). The tool refuses, writing
nothing, when the card could not keep 8 MiB free for the service's database
afterwards, and a guest set up since then has about 224 MB more room
(snowsky-disc-service `docs/development.md`).

## CI

`.github/workflows/ci.yml` runs `format:check`, `lint`, `typecheck`, `test`,
`build` (with the bundle check), then Playwright against the mock gateway. No
player, emulator, sibling checkout or secret is needed in CI.

## Project layout

See [architecture](architecture.md#layers) and, for colors and the kept dark
palettes, [themes](themes.md). Configuration: `vite.config.ts`
(relative base, root-absolute index references, no inlined assets, dev
proxy), `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`,
`.prettierrc.json`, `tsconfig.*.json`.
