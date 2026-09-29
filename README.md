# SNOWSKY DISC player

A music player web application for the FiiO SNOWSKY DISC. It lives on the
player's own memory card and is served by the DISC service running inside the
player, so any browser on your home network becomes a remote for your music:
browse the library, see what is playing and control playback. Music keeps
playing on the DISC; nothing streams to the browser.

> Status: in active development (see the [plan](docs/plan.md)). Today you can:
>
> - browse Home, New, albums, artists, genres, tracks, favorites and
>   playlists, with search, sorting and genre filters;
> - play albums, tracks, playlists, artists and genres, and pick a row in the
>   queue;
> - follow what is playing, seek, change volume or mute, shuffle, repeat and
>   mark the current track as a favorite;
> - see what is known about the playing track (quality, bit rate, year, genre,
>   disc and track, file size and folder, how often it was played) with the
>   whole queue below it; on a phone the panel is a full-screen player;
> - adjust gain, balance, the DAC filter and DRE;
> - add music: upload files or album folders, then let the player scan.
>
> - see what takes space on the player's card: music by format, the largest
>   albums and artists, and possible duplicates in two folders.
>
> - browse the card's folders, play a folder or a file, create a folder and
>   add music straight into it;
> - pick up where the player stopped: after its queue ended or USB storage
>   mode, the bar shows the remembered track and Play continues it;
> - sing along in karaoke: synced lyrics full screen, word by word where the
>   lyrics file has word timings;
> - find lyrics for a track that has none on LRCLIB (only when you ask, or
>   automatically once you switch that on) and save them beside the track on
>   the card;
> - find a cover for an album that has none on Cover Art Archive and save it
>   into the album's folder (Cover Art Archive's images are served by
>   archive.org, which some networks cannot reach);
> - find an artist's photo on Wikimedia Commons, shown with its author and
>   licence and kept in your browser; artists without one show the cover of
>   their most played album;
> - watch what plays in this browser as a disc: the cover turns, its ring
>   pulses with the bass and the spectrum spreads around it, full screen.
>
> Covers and durations appear as tracks play: the player's library keeps
> neither for most files.

## Requirements

- A SNOWSKY DISC with firmware V2.57 and the DISC service engineering image
  installed ([snowsky-disc-service](https://github.com/eudj1n/snowsky-disc-service)).
- The engineering LAN marker and a pairing token on the PLAY memory card, as
  described by the service.
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
3. To control playback, open **Pairing** and paste the token from the
   `DISC_WEB_TOKEN` file on the memory card. It is stored in this browser only.

The interface starts in the player's own language when it is Russian or
English and remembers your choice of language and appearance.

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
