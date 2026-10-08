# The pictures

`readme-*.jpg` are the README's pictures. They show Disc Player's own build
against the mock gateway (`tests/e2e/mock-gateway.mjs`), whose collection is
fictional: the names and the eight covers come from the DISC Web demo of
[snowsky-disc-qemu](https://github.com/eudj1n/snowsky-disc-qemu)
(`experiments/disc_web/frontend/art`, MIT), original artwork made for that
demo, kept in `tests/e2e/fixtures/demo-covers`. No real library, cover or
player appears in them. The lyrics, MusicBrainz editions and the card's sizes
are the mock's; the albums without a demo cover show the page's own sleeve.

They are taken by `npm run build && npm run screenshots`
(`tests/screenshots/readme.spec.ts`): desktop at 1280×800 with twice the
pixels, the phone as Playwright's Pixel 7, light and dark as each picture
needs, written as JPEG. Nothing is retouched or composited afterwards.

`light-palettes-home.png`, `dark-palettes-home.png` and
`dark-palettes-album.png` illustrate [themes](../themes.md) and date from
2026-09-26; their top bar is the one the page had then.
