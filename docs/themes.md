# Themes and dark palettes

The page has a light and a dark theme (`data-theme` on `<html>`, chosen in the
appearance dialog or following the system). Colors are CSS tokens in
`src/styles/main.css`; components use them through Tailwind theme colors
(`bg-strong`, `text-chip-on-ink`, …) or `var(--token)`, never literal dark
colors, so a palette changes the whole theme at once.

## Dark palettes

On 2026-09-26 the owner compared five dark palettes and chose **warm charcoal**
(grey with a brown undertone) as the default. The others are kept in
`src/styles/palettes.css` for a later choice. Each one sets every dark token
under `data-palette` on `<html>`; nothing in the UI selects one yet. To look at
one in a browser: `document.documentElement.dataset.palette = 'espresso'`.

| Palette       | `data-palette` | Character                                                         |
| ------------- | -------------- | ----------------------------------------------------------------- |
| Warm charcoal | (default)      | Grey with a brown undertone, cream buttons                        |
| Olive         | `olive`        | The original dark theme, green accents (default until 2026-09-26) |
| Graphite      | `graphite`     | Neutral cool dark grey                                            |
| Espresso      | `espresso`     | Brown, cream buttons                                              |
| Black         | `black`        | True black for OLED, nearly monochrome                            |

The coral accent (`--accent`) stays in every palette. The light theme is
unchanged.

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
`--hero-mid`, `--toast`. The search focus ring: `--focus-ring`. The
appearance dialog's dark swatch: `--preview-dark-a`, `--preview-dark-b` (set
outside the dark theme too, so the swatch shows the palette in light mode).

A new palette copies one block of `palettes.css`, changes the values and keeps
every token; a token left out falls back to the default dark palette.
