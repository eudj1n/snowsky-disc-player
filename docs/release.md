# Releases on the memory card

A release is an immutable directory `www/releases/<16-hex id>/` on the PLAY
card, selected by `www/active.json`. The DISC service serves the active
`index.html` at `/` and every other file only under `/releases/<id>/`
(`snowsky-disc-service/docs/sd-webroot.md`). Publishing never flashes the
player and never restarts the service; the page picks up a new release on
reload, and older releases stay on the card.

## Prepare

```sh
npm run check                 # format, lint, types, tests, build + bundle check
npm run release               # uses ../snowsky-disc-service, or DISC_SERVICE_DIR
```

`npm run release` runs the service publisher
(`scripts/webroot_bundle.py prepare`) on `dist/`. The publisher validates the
bundle again, adds `compatibility.json`, `commands.json`, `queries.json` and
(since combined-008) `store.json` and `origins.json` for the selected
reviewed firmware profile, computes the release id and
rewrites root-absolute references in `index.html` to `/releases/<id>/`. The
output lands in `work/release-<timestamp>/www` and the script prints the
publish command.

## Verify on the emulator first

Publish the prepared release on the emulator's disposable card from the
service checkout and run the browser tests against it (see
[development](development.md#tests)). A batch that reaches the gateway or
the stock protocol passes there before it goes to the physical card; the
checks before a publication follow what the batch changed (owner,
2026-09-29):

| The batch changed                                                       | Before the card                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Styles and markup only                                                  | `npm run check` and the mock browser tests of the touched screens |
| Behavior on the page (stores, new requests, controls)                   | also the full mock suite                                          |
| The gateway contract, CSP or `origins.json`, player commands, the files | also the emulator acceptance of this exact release, as above      |

Larger batches and the day's last release get the full set.

## Publish on the player (operator step)

With the player in USB storage mode and `/Volumes/PLAY` mounted:

```sh
python3 ../snowsky-disc-service/scripts/webroot_bundle.py publish \
  --prepared work/release-<timestamp>/www --card /Volumes/PLAY --confirm-card-write
diskutil eject /Volumes/PLAY
```

The publisher copies and verifies every file, keeps previous releases and
writes `active.json` last. It refuses before writing when the card could not
keep 8 MiB free for the service's database afterwards; `--prune` removes every
release but the active one (kept for rollback) first, and is used on the
owner's card only when the owner asks for old releases to go. Leave storage mode on the player and reload the page.

## Compatibility

A release carries the firmware identity it was prepared for. On connect the
app compares it with the player's handshake and main OS number and disables
controls on a mismatch. A new firmware version needs a reviewed profile and
catalogs in snowsky-disc-service before a release for it can be prepared.
