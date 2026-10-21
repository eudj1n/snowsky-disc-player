# Changelog

What changes for you in Disc Player, release by release. Each release is a
`v*` tag; its zip on the
[releases page](https://github.com/eudj1n/snowsky-disc-player/releases) is
what goes on the card, and its notes are the release's section below. Entries
stay short and group related work; how and why it was done is in the
[plan](docs/plan.md).

## [Unreleased]

### Sound

- Headphone correction from [AutoEq](https://github.com/jaakkopasanen/AutoEq)
  in the Sound settings: find your headphones, see the ten bands and the
  master level, and write them to one of your presets, which is then named by
  them. Off until you allow AutoEq among the external sources; needs the
  next card release of the DISC server for the names to be kept on the
  player.
- The equalizer's sliders move in 0.1 dB steps.
- The headphone field is a search pill like the top bar's, a size smaller.

### Lyrics

- Word timings for karaoke from [lrc.red](https://lrc.red), a new source
  among the external ones (off until you allow it): offered for a track
  whose lyrics have line timings only, as well as for one without lyrics,
  and saved beside the track in place of its old `.lrc`, which goes to the
  trash. The lookup names the sources it asks and what it looks for.

### Your collection

- The album's identify window fits the screen: its editions are one-line
  rows (the album's title left out where every edition shares it), and the
  two track lists scroll together, a disc's heading staying in view.
- Confirming an album's edition identifies its artist too, when the edition
  credits one artist carrying the name; the enrichment run counts it and its
  undo takes it back.

### Now playing

- A track without lyrics leaves no empty scroll below its line. The
  full-screen button is four arrows out of the centre, and once the lyrics
  are scrolled it sits in the pinned track line, so the full screen is one
  tap away without scrolling back up.
- The lyrics lookup (find them online, save what was found) follows the
  lyrics instead of pushing them down.

### Your player

- The card's State tab has a heading line like the other tabs, so the
  heading no longer jumps between them: how many external sources are on.

### Playlists

- Adding an automatic playlist reads the card's Playlists folder afresh, so
  a list of that name you removed since the page opened (on the card's files
  page, say) no longer blocks it with "a list of yours already has this
  name".
- An automatic playlist on the player is told by the day it was drawn: in
  the list page's sticky heading in place of the track count, and first in
  its line on the Playlists page (every list holds fifty tracks).

## [1.0.0] — 2026-10-08

The first public release: what Disc Player can do, counted from here.

### Your collection

- Home with a featured album, recently played and made-for-you shelves; New;
  albums, artists, genres, tracks, favorites and playlists, with sorting and
  genre filters. Albums that share a title stay apart by artist, joint credits
  list every artist, and an album keeps its discs.
- Search everything as you type from one box (`/` or ⌘K), which also runs
  commands: go to a section, switch the theme, add music, sound settings.
- The collection stays browsable while the player is away, from the copy the
  browser saved last.

### Playing

- Play albums, artists, genres, playlists, folders and single tracks on the
  DISC; pick a row in the queue; seek, volume and mute, shuffle, repeat and
  favorites, each checked against the player's own answer.
- One switch moves the music to the browser and back, with the track, its
  position and the queue; full screen, the cover turns as a disc and the
  spectrum spreads around it.
- Pick up where the player stopped: after its queue ended or USB storage mode,
  Play continues the remembered track.
- Sound settings: gain, balance, the DAC filter and DRE.
- On a phone the player opens full screen, with its queue and lyrics.

### Lyrics and pictures

- Lyrics beside the track from the files or an `.lrc` beside them, following
  the song when synced; karaoke full screen, word by word where the file has
  word timings.
- Lyrics, covers, artist photos and backgrounds found online (LRCLIB, Cover
  Art Archive, fanart.tv with your own key, Wikimedia Commons), each source
  off until you allow it, and saved on the card or the player with its credit.
- MusicBrainz identities for artists and albums: you confirm which artist or
  edition is meant, and an edition's tracks show beside the album's own.

### Your listening

- What you played, on the player and in the browser, with where it came from.
- Automatic playlists from your listening (Most played, Daily mix, Recently
  added, Not played lately, an artist's most played), kept on the player.
- Pin albums and artists to the top; dislike tracks so they are skipped.
- Create, fill, rename and delete playlists.

### The card

- Upload files and album folders, then let the player scan.
- See what takes space: music by format, the largest albums and artists,
  possible duplicates.
- Browse the card's folders, play a folder or a file, create folders, move
  files to the trash and restore them, clear macOS leftovers.
- The State tab: what the library lacks, and a run that fills it in, by hand
  or automatically, in its own window; files for the card are written only
  after you review them, and the whole run can be undone.

### Look and language

- Light and dark themes in four tones each, four text sizes, English and
  Russian (the player's own language at first); more contrast and reduced
  transparency follow your system.
