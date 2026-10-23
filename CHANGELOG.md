# Changelog

What changes for you in Disc Player, release by release. Each release is a
`v*` tag; its zip on the
[releases page](https://github.com/eudj1n/snowsky-disc-player/releases) is
what goes on the card, and its notes are the release's section below. Entries
stay short and group related work; how and why it was done is in the
[plan](docs/plan.md).

## [Unreleased]

### Listening

- The browser tab's title names the track playing, on the player or in the
  browser: "Orbit · Forma — DISC", so the tab is found among the others.

### Your collection

- The editions MusicBrainz proposes for an album pass one at a time, in full
  (the title, the issue, the track count), with arrows and the arrow keys;
  the album's own title and artist no longer stand beside them. The lists
  of an artist's namesakes and of an artist's albums scroll in a frame of a
  few rows, so the window keeps its height.
- Retry, beside Skip and Cancel, asks MusicBrainz again when it did not
  answer the search or the edition's tracks.
- Search by another name: when the tag on the card is spelled wrong, type
  the artist's name, or the album's title and artist, and MusicBrainz is
  asked anew; offered by itself when the name found nothing.
- The enrichment report's files for the card scroll in a frame of their own
  and follow the writing, as the run's log follows its last line.
- The file manager tells what it knows about a folder's music under its
  path: the album, linked, whether MusicBrainz knows it, the year of the
  tags, the formats, the cover (a file, or embedded), how many files have
  lyrics beside them, and tracks with unknown tags. A music file's name
  opens its track in the panel, as a title does elsewhere. A folder of
  several albums or artists gets a row of chips for each (a list to choose
  from when they are many): a chosen one dims the files of the others, which
  stay listed.
- The State tab's Tags list is a card per folder, as the duplicates are:
  how many tracks, the folder (a link to its files) and which names stock
  gave them (“Unknown Artist”, “Unknown album”, “Unknown genre”), the
  fullest folder first; it was one line per track.

## [1.1.0] — 2026-10-21

### Sound

- Headphone correction from [AutoEq](https://github.com/jaakkopasanen/AutoEq)
  in the Sound settings: find your headphones, see the ten bands and the
  master level, and write them to one of your presets, which is then named by
  them. Off until you allow AutoEq among the external sources; needs DISC
  server 2.57.9 for the names to be kept on the player.
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
- New has a shelf of new artists: those who first reached the card with the
  albums above them, the latest debut first. A familiar artist's new album
  names nobody here, and the shelf stays away when there is no debut.

### Now playing

- A track without lyrics leaves no empty scroll below its line. The
  full-screen button is four arrows out of the centre, and once the lyrics
  are scrolled it sits in the pinned track line, so the full screen is one
  tap away without scrolling back up.
- The lyrics lookup (find them online, save what was found) follows the
  lyrics instead of pushing them down.

### Your player

- Playing in this browser tells the system: the keyboard's media keys, the
  browser's media panel and the lock screen show the track with its cover
  and drive it (play, pause, previous, next, seek).
- A mini player: a small window over the others, in the style of Now
  playing, from a button in the bar or the palette; Chrome and Edge open it
  by themselves when you leave the tab while music plays here, once you
  allow that for the site. Browsers offer such windows only to secure pages:
  the hosted page and localhost have the button, the page from the card over
  plain http does not.
- Add music: the three boxes above the steps, which looked like tabs, are
  gone; the sections themselves show the progress, a check on a step that is
  done and the accent on the current one.

- The card's State tab has a heading line like the other tabs, so the
  heading no longer jumps between them: how many external sources are on.
- The connection's Diagnostics name the app the player serves, Disc Player,
  where they said "Page".
- The sidebar's device card connects again with one press while the player
  is away, in place of its dot; the dialog is still a press on the card.

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
