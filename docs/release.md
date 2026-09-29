# Releases: the Disc Player app

Since combined-009 the page is an app: a folder `Apps/Disc Player/` on the
PLAY card, served at `/` (and at `/apps/Disc%20Player/`), as any app is
(`snowsky-disc-service/docs/sd-webroot.md`). A release is a zip holding that
folder; installing it is copying the folder onto the card. No release IDs, no
`active.json`: the page picks up the new files on reload. Installing never
flashes the player and never restarts the service. On images before
combined-009 the page lived in `.disc/www` as releases published by the
service's `webroot_bundle.py`.

## Prepare

```sh
npm run check                 # format, lint, types, tests, build + the app rules
npm run release               # uses ../snowsky-disc-service, or DISC_SERVICE_DIR
```

`npm run release` packs `dist/` with the service's tool (`scripts/app_bundle.py
zip`): the folder `Disc Player/` with gzip twins of its text files,
`app.json` (the version: the date and commit, or `DISC_APP_VERSION`) and the
reviewed `origins.json` from the service's `firmware/origins`. The reviewed
catalogs are not in the app: the page reads them from the service at
`/api/contract/` (the image's, or the card's `.disc/catalog` where admitted).
The zip lands in `work/disc-player-<version>.zip`.

## Verify on the emulator first

Install the zip on the emulator's disposable card and run the browser tests
against it (see [development](development.md#tests)). A batch that reaches the
gateway or the stock protocol passes there before it goes to the physical
card; the checks before an installation follow what the batch changed (owner,
2026-09-29):

| The batch changed                                                       | Before the card                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Styles and markup only                                                  | `npm run check` and the mock browser tests of the touched screens |
| Behavior on the page (stores, new requests, controls)                   | also the full mock suite                                          |
| The gateway contract, CSP or `origins.json`, player commands, the files | also the emulator acceptance of this exact zip, as above          |

Larger batches and the day's last release get the full set.

## Install on the player

A user copies the `Disc Player` folder from the zip into `Apps/` on the card
(player in USB storage mode, or a card reader), replacing the old one, and
ejects the card. For our own cards (operator step, with the player in storage
mode and `/Volumes/PLAY` mounted):

```sh
python3 ../snowsky-disc-service/scripts/app_bundle.py install \
  --app work/disc-player-<version>.zip --card /Volumes/PLAY --confirm-card-write
diskutil eject /Volumes/PLAY
```

The tool writes the new folder beside the old one, reads it back and swaps it
in, without macOS leftovers; it refuses, writing nothing, when the card could
not keep 8 MiB free for the service's database afterwards. Leave storage mode
on the player and reload the page.

## Compatibility

The service names the image's firmware identity (`/api/contract/compatibility.json`).
On connect the app compares it with the player's handshake and main OS number
and disables controls on a mismatch. A new firmware version needs a reviewed
profile and catalogs in snowsky-disc-service, which come with its image.
