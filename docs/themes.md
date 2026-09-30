# Themes and dark palettes

The page has a light and a dark theme (`data-theme` on `<html>`, chosen in the
Settings dialog or following the system). Colors are CSS tokens in
`src/styles/main.css`; components use them through Tailwind theme colors
(`bg-strong`, `text-chip-on-ink`, …) or `var(--token)`, never literal dark
colors, so a palette changes the whole theme at once.

## Palettes

Each theme has four palettes; the Settings dialog shows the swatches of the
theme in effect ("Light theme tone" or "Dark theme tone") and keeps the choice
in this browser (`disc-player.light-palette`, `disc-player.dark-palette`).
`public/theme.js` applies it before the stylesheet paints, and the store
(`src/stores/appearance.ts`) sets `data-light-palette` / `data-dark-palette` on
`<html>`; the default of each theme sets no attribute. The catalog with the
dialog's swatch colors is `src/domain/palettes.ts`.

On 2026-09-26 the owner chose **warm charcoal** as the default dark palette
after comparing five, asked for light alternatives next to the original sage,
and dropped the pure black palette so that each theme has four.

| Theme | Palette       | Attribute value | Character                                    |
| ----- | ------------- | --------------- | -------------------------------------------- |
| Light | Sage          | (default)       | The original light theme, green-grey accents |
| Light | Paper         | `paper`         | Warm cream with brown ink                    |
| Light | Mist          | `mist`          | Cool grey-blue                               |
| Light | White         | `white`         | Neutral, near monochrome                     |
| Dark  | Warm charcoal | (default)       | Grey with a brown undertone, cream buttons   |
| Dark  | Olive         | `olive`         | The original dark theme, green accents       |
| Dark  | Graphite      | `graphite`      | Neutral cool dark grey                       |
| Dark  | Espresso      | `espresso`      | Brown, cream buttons                         |

The coral accent (`--accent`) stays in every palette. Text colours keep 4.5:1 on their grounds in every
palette (`tests/unit/contrast.test.mjs`); see docs/typography.md for the
notice colour and the system contrast and transparency settings.

![Light palettes on the home page](images/light-palettes-home.png)
![Dark palettes on the home page](images/dark-palettes-home.png)
![Dark palettes on an album page](images/dark-palettes-album.png)

The screenshots use the mock collection (`tests/e2e/mock-collection.mjs`), not
a real library.

## Tokens a palette sets

Surfaces and text: `--paper`, `--surface`, `--raised`, `--soft`, `--hover`,
`--selected`, `--line`, `--ink`, `--muted`, `--secondary`, `--banner`,
`--banner-ink`, `--progress-bg`, `--progress-fill`, `--player-bg`.
Primary buttons (play, pill buttons): `--strong`, `--strong-hover`,
`--strong-ink`. Pressed filters and chips: `--chip-on`, `--chip-on-ink`.
Decorative art (device illustration, home rings, online dot): `--art-a`,
`--art-b`, `--art-edge`, `--art-edge-2`, `--ring-edge`, `--ring-a`…`--ring-d`,
`--online-ring`. The dark banner and toasts: `--hero`, `--hero-from`,
`--hero-mid`, `--toast`. The search focus ring: `--focus-ring`.

A new palette copies one block of `palettes.css`, changes the values and keeps
every token (a token left out falls back to the theme's default palette), then
gets an entry with swatch colors in `src/domain/palettes.ts` and a name in both
languages.

## Album colours

Since 2026-09-30 (owner) the page takes two colours of a cover
(`src/domain/coverColours.ts`) instead of the average of all its pixels, which
made dark or many-coloured covers grey or muddy. A 48×48 copy is sorted into
colour buckets; near-black, near-white and grey weigh little, the frequent and
saturated colour wins and the second one clearly differs from it (a cover of
one colour gets a lighter, softer version of it). They colour backgrounds
only; controls keep the theme's colours on every album (owner: "the button
must stay stable so the user does not look for it"):

- Detail headings (album, artist, genre, playlist): a gradient of the two
  colours from the page's top edge, under the top bar (which then drops its
  rule), across the whole workspace, fading out at the heading's rule. Round
  buttons keep one ground over any colour
  (`--control-ground`, `--control-edge`: the theme's own, a little
  see-through, with a hairline edge). Each colour is fitted to
  each theme in OKLCH (light and soft in the light theme, dark in the dark
  one) so the theme's own text keeps 4.5:1 on it; a page without a cover
  takes the sleeve's colour.
- The compact bar pinned over a detail page once its heading has scrolled
  away (`.sticky-colours`): the top colour, a little see-through and blurred,
  so the colour goes on while the page scrolls; its play button keeps the
  theme's colours. The player bar stays neutral: it is the same control on
  every page.
- The Now Playing panel (`.on-cover`, `src/stores/nowColours.ts`): deep
  versions of the two colours, light text and see-through surfaces; the
  theme's tokens are redefined for the panel only.
- Karaoke: the two colours blurred behind the words.

More contrast (system setting) tones the heading's colours down, gives the
compact bar the page's plain ground and makes the panel's secondary text
white; less transparency makes the compact bar and the panel's pinned lines
solid.
