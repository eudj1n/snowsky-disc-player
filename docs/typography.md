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
