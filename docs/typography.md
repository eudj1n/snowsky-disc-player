# Typography and display

How the page sets its text: fonts, sizes, weights, colour contrast,
transparency and names in any script. The owner's references are Apple Music,
Spotify and Yandex Music; the page solves the same tasks for the user's own
collection.

## Audit (2026-09-30)

Measured in Chrome on macOS against the mock gateway (Home, Tracks, Album and
a phone at 360 to 430 px), with computed styles, WCAG contrast and the fonts
Chrome reports for each glyph:

- Working text was small: at 1440×900 a track title was 11 px (weight 550) in
  a 61 px row, artists and captions 11 px, tile captions 10 px, uppercase
  labels 9 to 10 px and the seek times 8 to 9 px. The references set list text
  at about 13 to 16 px and nothing below 11 to 12 px.
- 33 pixel sizes (6 to 55 px, many 1 px apart) and eight weights (400, 500,
  550, 600, 620, 650, 700, 750). SF on Apple systems is variable and draws
  them all; Segoe UI (400, 600, 700, 900) and a static Roboto snap them, and
  750 became Black.
- The light palettes' secondary text (`--muted`) had 3.0 to 3.8:1, under the
  4.5:1 small text needs; the dark palettes had 6.8 to 7.4:1.
- The player bar (93 % opaque, 22 px blur) let the list's text show through.
- Names in right-to-left scripts were not isolated, so "فيروز · 1991" showed
  the year first; Japanese names were drawn with Chinese glyph forms because
  the document language is the interface language.
- The phone's mini player was wider than the screen.

The owner chose (2026-09-30): the system font, the Standard text size as the
default, no compact density, contrast and transparency only following the
system settings. The user should be comfortable without extra settings, so
the text size is the only new setting.

## Fonts and weights

The page uses the system font (`--font-sans` in `src/styles/main.css`): SF on
Apple systems, Segoe UI Variable or Segoe UI on Windows, Roboto on Android,
Noto Sans, Ubuntu or Cantarell on Linux, then Helvetica Neue and Arial, and
the colour emoji faces. It costs no download, looks native like Apple Music
on a Mac or an iPhone, and covers the most scripts: whatever a face lacks
comes from the system's fallback (checked in Chrome on macOS: Armenian,
Georgian, Hebrew, Arabic, Devanagari, Thai and CJK). The whole page is
antialiased in grayscale.

Four weights, each with one job:

| Weight | Class           | Used for                                             |
| ------ | --------------- | ---------------------------------------------------- |
| 400    | (default)       | Running text, secondary lines                        |
| 500    | `font-medium`   | Titles in lists, navigation, tabs, chips             |
| 600    | `font-semibold` | Uppercase labels, buttons, the player's title, tiles |
| 700    | `font-bold`     | Headings, the word mark, list artwork                |

Intermediate weights (550, 620, 650, 750) are not used: static faces snap
them to their neighbours, and 750 became Black on Windows. The light weight
remains only for the "···" glyph of the row menus.

## Contrast and transparency

Every text colour keeps 4.5:1 on its grounds in all eight palettes,
secondary text (`--muted`, `--secondary`) also on a selected row, and
`tests/unit/contrast.test.mjs` checks it against the stylesheets. Small
notices and errors use `--notice` (`text-notice`), the coral darkened to
`#b3432d` in the light theme; the accent itself stays for icons, the heart and
the word mark's period.

There are no page switches for contrast or transparency (owner, 2026-09-30);
the page follows the system:

- **More contrast** (`prefers-contrast: more`) pulls secondary text and lines
  toward the ink of the palette in effect (`--contrast-muted`,
  `--contrast-secondary`, `--contrast-line`, read by the theme colours as
  fallbacks).
- **Reduce transparency** (`prefers-reduced-transparency: reduce`) makes the
  player bar solid and drops every backdrop blur.

Otherwise the player bar is 97 % opaque with a 30 px blur and more
saturation, so the list no longer reads through it.

## Names in any script

Names come from the user's files in any script; the interface is in English
or Russian. Two things the interface language cannot decide
(`src/domain/scripts.ts`):

- **Direction.** Every inline element (`span`, `a`, `strong`, …) is its own
  bidi isolate (`src/styles/main.css`), and names joined into one string
  ("Artist · Album", message parameters in `t()`) are wrapped in first-strong
  isolates (U+2068 … U+2069) when they hold a right-to-left letter, so
  "فيروز · 1991" keeps the year after the name. Other names are left as
  they are, and columns keep their left alignment.
- **Glyph forms.** Chinese, Japanese and Korean share ideographs drawn
  differently per language, and the document's language is the interface's.
  `src/lib/scriptLanguages.ts` watches the document and gives an element whose
  own text has kana `lang="ja"` and one with hangul `lang="ko"`; ideographs
  alone stay with the document's language, since Chinese and Japanese cannot
  be told apart by them. It never touches a `lang` a template set.

## Type scale

Ten roles replace the 33 pixel sizes (`src/styles/main.css`). Each has its
own line height; letter spacing is in em, so it follows the size.

| Role      | Class           | Standard | Line height | Used for                                                    |
| --------- | --------------- | -------- | ----------- | ----------------------------------------------------------- |
| Caption 2 | `text-caption2` | 11 px    | 1.35        | Uppercase labels, column heads, seek times, the volume      |
| Caption   | `text-caption`  | 12 px    | 1.35        | Tile captions, palette names, small notes                   |
| Footnote  | `text-footnote` | 13 px    | 1.4         | Artists, albums and durations in rows, subtitles, hints     |
| Body      | `text-body`     | 14 px    | 1.4         | Titles in lists, navigation, buttons, fields (and the root) |
| Callout   | `text-callout`  | 15 px    | 1.35        | Emphasised lines, dialog subheads                           |
| Title 3   | `text-title3`   | 18 px    | 1.25        | Card and pane headings, lyrics lines                        |
| Title 2   | `text-title2`   | 22 px    | 1.2         | Section and dialog headings                                 |
| Title 1   | `text-title1`   | 32 px    | 1.12        | Page titles, long album and artist names                    |
| Large     | `text-large`    | 44 px    | 1.06        | Short album and artist names                                |
| Display   | `text-display`  | 44 px    | 1.07        | The home banner                                             |

Title 1, Large and Display follow the screen width like the old per-breakpoint
classes did: Display is 55 px from 1500 px and 36 px up to 1100 px; Large is
38 px up to 800 px; on phones Title 1, Large and Display are 28, 32 and
35 px. Uppercase labels use `tracking-caps` (+0.08 em), section and dialog
headings `tracking-heading` (−0.012 em), page titles `tracking-title`
(−0.025 em). Paragraphs of several lines keep `leading-[1.55]`.

A few sizes are deliberately fixed and never follow the text size: the word
mark and its tagline, the Hi-Res badge, the "···" glyph of the row menus, the
phone's bottom navigation labels (10 px, as tab bars do) and the text drawn
inside artwork (`cqw` units).

## Text size

The only new setting (appearance dialog, "Text size"): Compact, Standard (the
default), Large and Extra large. The choice is kept in this browser
(`disc-player.text-size`), applied before the first paint by
`public/theme.js` and afterwards by `src/stores/appearance.ts`, as
`data-text-size` on `<html>`; Standard sets no attribute. Small text grows
more than headings, as in Apple's Dynamic Type:

| Role                          | Compact | Standard | Large | Extra large |
| ----------------------------- | ------- | -------- | ----- | ----------- |
| Caption 2                     | 10      | 11       | 12    | 13          |
| Caption                       | 11      | 12       | 13    | 15          |
| Footnote                      | 12      | 13       | 15    | 17          |
| Body                          | 13      | 14       | 16    | 18          |
| Callout                       | 14      | 15       | 17    | 19          |
| Title 3                       | 17      | 18       | 20    | 22          |
| Title 2                       | 20      | 22       | 24    | 26          |
| Title 1, Large, Display (+/−) | −2      | 0        | +2    | +4          |

Spacing stays in pixels, so rows and cards grow with their text; the sidebar
scrolls when a short window cannot hold it at Extra large. The whole-interface
scale for TV browsers (100/115/130 %) remains a separate plan item.
