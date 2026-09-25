# Gateway integration

The app talks only to the DISC service gateway that served it (same origin,
no CORS, no TLS). The authoritative contract lives in
[snowsky-disc-service](https://github.com/eudj1n/snowsky-disc-service):
`openapi.yaml`, `docs/gateway-contract.md` and `docs/sd-webroot.md`. This
page records how the app uses it; `src/gateway/` is the only code that does.

## Surfaces

| Surface                                                         | Used for                                                                                                                                            | Module                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/health`                                               | Reachability, `api: 1`, whether another client owns control                                                                                         | `gateway/http.ts`                                              |
| `GET /api/data/<query>?…`                                       | Read-only stock database queries from `queries.json` (settings, language, library, favorites, playlists, queue, history, resume point, PEQ, themes) | `gateway/http.ts`, `gateway/settings.ts`, `gateway/library.ts` |
| `GET\|POST\|DELETE /api/stock/<route>`                          | Stock HTTP routes from `commands.json` (library pages, cover, folders, uploads, playlists); parameters travel in headers                            | `gateway/http.ts`                                              |
| `WS /api/websocket`                                             | The owner session: FiiO records, `token:` and `request:` control frames                                                                             | `gateway/session.ts`                                           |
| `<release>/compatibility.json`, `commands.json`, `queries.json` | Reviewed firmware identity and the catalogs this release was prepared with                                                                          | `gateway/release.ts`                                           |

## Session rules

- Open, then send `0599` first; the reply `a599` is the protocol identity.
  Read `0501` for the main OS number and compare both with
  `compatibility.json`. A mismatch disables controls.
- One request in flight; replies are matched by the expected tag. `a202` is
  also pushed unsolicited and updates the observation.
- An unanswered `0202` means _unknown_; the session stays open. Any other
  unanswered request retires the session, because records carry no request
  IDs and a late reply could answer a newer request.
- Mutations: `token:<card token>` once per session, then `request:<fresh id>`
  before each mutation record. The outcome is `replied`, `sent` (no reply
  expected), `uncertain` or `unsent`. `replied` is still not a confirmation:
  read the state again. `uncertain` is shown and never retried.
- Close codes: 1000 client, 1002 framing, 1007 malformed record, 1008 not
  admitted or revoked (wrong/missing token, replayed request ID, card marker
  removed), 1009 oversize, 1011 stock ended. The app never reconnects by
  itself.
- A second owner gets HTTP 409 on the WebSocket upgrade; the app checks
  `controlActive` in health first and explains it.

## Pairing

The card holds `DISC_WEB_TOKEN` (32–64 URL-safe characters). The user pastes
it once; the app keeps it in `localStorage` for this browser. Rotating or
deleting the file on the card revokes it at the gateway, which re-reads the
file at every mutation. Reads and static files work without a token.

## Language

`/api/data/system_settings` returns the stock `LANGUAGE` index in menu order
(`zh-Hans, zh-Hant, en, ja, ko, es, it, de, fr, ru`; index 2 = English was
confirmed on a V2.57 player). The app starts in Russian or English when the
player uses one of them, until the user picks a language.

## Adding a capability

1. Find the behavior in the reference (`snowsky-disc-qemu/controller`,
   `docs/protocol`) and the record/route in `commands.json` or the query in
   `queries.json`.
2. If it is not in the catalogs, it goes to the service repository first
   (catalog review; a new data query is a card-only change there).
3. Add wire parsing in `src/gateway/`, the domain shape in `src/domain/`, state
   and actions in `src/stores/`, then presentation. Tests at each layer.
