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
| `npm run release`                 | Prepares an SD release with the service publisher ([release](release.md))                                    |

## Seeing the interface without touching the player

All dev modes serve the app from `http://localhost:5173/` with hot reload. The
dev server proxies `/api` (including the WebSocket) and the active release's
files to a gateway and rewrites `Host`/`Origin` to it, so the gateway admits
the page as if it came from the card. Nothing is written to the card.

- **Mock** — `npm run dev:mock`. A fictional collection (names from the
  reference demo) and a scripted player that follows album, track and
  favorite selections and serves the queue; data reads are delayed by 700 ms
  (`MOCK_GATEWAY_DELAY`) so loading skeletons are visible. The pairing
  token is `mock-token-0123456789-abcdefghijklmnop`.
- **Emulator** — `npm run dev:emulator` while the emulator from
  snowsky-disc-service is running (`python3 scripts/emulator.py up` there).
  Real stock behavior, disposable media. Its card token is in the guest at
  `/tmp/sdcard/DISC_WEB_TOKEN`. Stock powers the guest off after 300 seconds
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
  `tests/e2e/mock-gateway.mjs` exactly like the gateway serves a release
  (index at `/`, files under `/releases/<id>/`, the same CSP), checking CSP
  errors, language adoption, connect/identity, pairing + toggle with a fresh
  read, and a narrow viewport. To run the same tests against the emulator or a
  player that already serves this build:

  ```sh
  E2E_BASE_URL=http://127.0.0.1:17870 E2E_TOKEN=<card token> npx playwright test
  ```

## CI

`.github/workflows/ci.yml` runs `format:check`, `lint`, `typecheck`, `test`,
`build` (with the bundle check), then Playwright against the mock gateway. No
player, emulator, sibling checkout or secret is needed in CI.

## Project layout

See [architecture](architecture.md#layers). Configuration: `vite.config.ts`
(relative base, root-absolute index references, no inlined assets, dev
proxy), `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`,
`.prettierrc.json`, `tsconfig.*.json`.
