# Contributor and agent instructions

This repository is the **player UI** for the SNOWSKY DISC: a Vue 3 +
TypeScript + Vite + Tailwind CSS single-page application that is built into a
static bundle, published on the player's SD card and served by the DISC
service gateway inside the player. Read [README](README.md),
[architecture](docs/architecture.md), [plan](docs/plan.md) and
[gateway integration](docs/gateway.md) before changing behavior.

Repository language is English: code, comments, documentation, commit
messages. UI strings live in paired `en`/`ru` dictionaries.

## Related repositories

- [snowsky-disc-service](https://github.com/eudj1n/snowsky-disc-service) —
  the native gateway inside the player. Owns the contract this app consumes:
  `openapi.yaml`, `docs/gateway-contract.md`, `docs/sd-webroot.md`, the
  reviewed command and query catalogs (`firmware/commands`, `firmware/queries`),
  the release publisher (`scripts/webroot_bundle.py`) and the disposable V2.57
  emulator used for acceptance. Local checkout: `../snowsky-disc-service`
  (override with `DISC_SERVICE_DIR`).
- [snowsky-disc-qemu](https://github.com/eudj1n/snowsky-disc-qemu) — the
  reference implementation. `experiments/disc_web` is the UI reference for the
  base implementation; `controller/` defines protocol behavior and guarded
  operations; `library/` defines catalog synchronization; `docs/protocol/`
  documents the stock protocol. Read it; do not copy firmware-derived data.

## Rules

- **Contract first.** Use only routes, records and queries described by the
  service contract and present in the release's `commands.json` /
  `queries.json`. A needed capability that is missing goes to the service
  repository (catalog review or gateway change) before it is used here.
- **One owner, no replay.** Explicit Connect/Disconnect; no automatic connect
  or reconnect. Serialize requests and match replies by tag. A mutation gets a
  fresh request ID, is followed by a fresh read, and an uncertain outcome is
  reported and never retried. Never invent state: unknown stays unknown, and
  an unanswered `0202` is not "stopped".
- **Gateway CSP.** Pages are served with `default-src 'self'`: no inline
  scripts, styles or event handlers, no `data:` URLs, no CDNs or web fonts,
  no `eval`. Keep `v-html` out (lint enforces it).
- **The rules for apps on the card** (combined-009: the page is the app
  `Apps/Disc Player/`, served at `/` and at `/apps/Disc%20Player/`).
  `npm run build` checks the dist against them: web types only, 4 MiB per
  file, 32 MiB and 512 files, depth 6, `[A-Za-z0-9_.-]` names not starting
  with a dot, relative references everywhere (`/api/…` stays absolute), no
  catalogs in the build (the reviewed ones come from the service at
  `/api/contract/`). Do not weaken `scripts/check-bundle.mjs` without the
  matching service change.
- **Layers.** `domain` and `gateway` are plain TypeScript; `ui` primitives
  know no domain; `components` take domain objects via props and emit
  intents; `panels`/views wire `stores`; only `stores` use the gateway. ESLint
  enforces these boundaries.
- **Emulator first.** Behavior against the stock protocol is verified on the
  service's disposable V2.57 emulator before a release reaches the physical
  player. Publishing to the physical card is an explicit operator step and
  needs the owner's authorization; this repository never writes to a card on
  its own.
- **Tests with every change.** Unit tests for gateway/domain/stores, component
  tests for reusable components, Playwright tests for flows (mock gateway in
  CI, emulator or player locally). UI changes are checked in a real browser at
  desktop and phone widths, light and dark.
- **Checks.** `npm run check` (format, lint, typecheck, unit tests, build with
  bundle check) and `npm run e2e` must pass; CI runs the same commands.
- **Plan and commits.** Keep [docs/plan.md](docs/plan.md) as the canonical
  plan and mark completed items with evidence. Commit each completed stage
  with its tests and documentation. Keep runtime output (`dist/`, `work/`,
  test results) out of commits.
- **No personal data** in the repository: no real library names, tokens,
  captures or screenshots of a private collection. Demo data is fictional and
  labelled.
