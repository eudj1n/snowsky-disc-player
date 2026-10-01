# SNOWSKY DISC player

A music player web application for the FiiO SNOWSKY DISC. It lives on the
player's own memory card and is served by the DISC service running inside the
player, so any browser on your home network becomes a remote for your music:
browse the library, see what is playing and control playback. Music keeps
playing on the DISC; nothing streams to the browser.

> Status: in active development (see the [plan](docs/plan.md)). Today you can:
>
> - browse Home, New, albums, artists, genres, tracks, favorites and
>   playlists, with sorting and genre filters; breadcrumbs above a page lead
>   back to its section;
> - search the whole collection at once: press `/` or ⌘K (Ctrl+K), or the
>   Search button, and type; tracks, albums, artists, playlists and genres
>   appear as you type (case and accents do not matter), Enter opens one or
>   plays a track, and All results shows every match. The same box runs
>   commands: go to a section, switch the theme, add music, sound settings,
>   move the music to this browser, refresh the collection;
> - play albums, tracks, playlists, artists and genres, and pick a row in the
>   queue;
> - follow what is playing, seek, change volume or mute, shuffle, repeat and
>   mark the current track as a favorite;
> - see what is known about the playing track (quality, bit rate, year, genre,
>   disc and track, file size and folder, how often it was played) with its
>   lyrics below, which follow the song when they are synced; the queue opens
>   on its own; on a phone the panel is a full-screen player;
> - click any track's title to see the same about it, with its lyrics, and
>   play it, add it to a playlist or mark it; double-click a row to play it;
> - adjust gain, balance, the DAC filter and DRE (the sliders button beside
>   the volume);
> - add music from the Card section: upload files or album folders, then let
>   the player scan (a dot on Card shows it working);
> - see what takes space on the player's card: music by format, the largest
>   albums and artists, and possible duplicates in two folders;
> - browse the card's folders, play a folder or a file, create a folder and
>   add music straight into it;
> - pick up where the player stopped: after its queue ended or USB storage
>   mode, the bar shows the remembered track and Play continues it;
> - sing along in karaoke: synced lyrics full screen, word by word where the
>   lyrics file has word timings;
> - find lyrics for a track that has none on LRCLIB and save them beside the
>   track on the card;
> - find a cover for an album that has none on Cover Art Archive and save it
>   into the album's folder (Cover Art Archive's images are served by
>   archive.org, which some networks cannot reach);
> - open the details (i) of an artist or album: confirm which artist or
>   edition MusicBrainz means, choose an artist's photo and a wide background
>   from fanart.tv (with your own free key) and Wikimedia Commons, or another
>   album cover (the old one goes to the card's trash), each shown with its
>   author and licence and kept on the player for every browser; artists
>   without a photo show the cover of their most played album;
> - choose which of these outside sources may be asked under Settings →
>   External sources: each stays off until you allow it, and is asked without
>   a click only when you also set it to work automatically; covers and
>   photos are found through MusicBrainz, which you allow there too;
> - see what you played last, on the player and in this browser;
> - listen to automatic playlists made from your listening (Most played,
>   Daily mix, Recently added, Not played lately, and one artist's most
>   played), redrawn each day, week or month and kept on the player;
> - move the music between the player and this browser with one switch in
>   the bar: the track, its position and the queue come along, and every
>   Play then plays where the switch says; watch what plays in the browser as
>   a disc: the cover turns, its ring pulses with the bass and the spectrum
>   spreads around it, full screen;
> - choose a light or dark theme in four tones each, and the text size.
>
> Covers and durations appear as tracks play: the player's library keeps
> neither for most files.

## Requirements

- A SNOWSKY DISC with firmware V2.57 and the DISC service image installed
  ([snowsky-disc-service](https://github.com/eudj1n/snowsky-disc-service));
  combined-009 or later for every feature.
- The player on your Wi-Fi network (set up on the player itself).
- A current desktop or mobile browser on the same network as the player.

## Install on the memory card

Disc Player is a folder you copy onto the card; nothing is flashed. Put the
player in USB storage mode (or use a card reader), copy the `Disc Player`
folder from the release zip into `Apps/` on the card, replacing the old one,
and eject. The [release guide](docs/release.md) has the details.

## Use

1. Open `http://<player-ip>:7870/` in a browser on the same network.
2. Press **Connect**. Only one client can control the player at a time; if the
   FiiO app or another page is connected, disconnect it first.
3. To control playback, open **Pairing** and enter the player's serial number
   (SN, under About device on the player). It is kept in this browser only.
   After five wrong attempts the player refuses pairing from that device for
   ten minutes.

The interface starts in the player's own language when it is Russian or
English and remembers your choice of language, theme and text size
(Compact, Standard, Large or Extra large), all on the Settings page (in the
sidebar, or the gear in the top bar). More contrast and reduced transparency follow your system's
settings. **Refresh collection** is in the connection dialog.

## Privacy and safety

The page talks only to the player that served it. There is no account, no
cloud and no analytics. The player never receives a command that its reviewed
command list does not allow, and a command whose result is unknown is never
repeated automatically.

## For developers

Start with [AGENTS.md](AGENTS.md), the [architecture](docs/architecture.md)
and the [development guide](docs/development.md).

## License

[MIT](LICENSE)
