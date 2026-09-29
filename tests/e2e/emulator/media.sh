#!/bin/sh
# Generates the acceptance media on the disposable emulator card (never on a
# player): two albums titled "Harbor" by different artists and genres, a second
# Lumen album, a two-disc Lumen album with a year and a joint credit, an album
# and a track with long names, a CUE image of three tracks, track numbers
# that differ from file order, and files a Mac leaves. Tagged FLAC
# tones made with sox inside the emulator container; nothing is copied from a
# real library. Usage: tests/e2e/emulator/media.sh <container> [remove]
set -eu
container=$1
root='/tmp/sdcard/Player Acceptance'
if [ "${2:-}" = remove ]; then
  # The upload case puts its file at the card root; the service fixture expects only its own there.
  docker exec "$container" sh -c 'rm -rf "$1" && rm -f /tmp/sdcard/Player\ Acceptance\ Upload\ *.wav' sh "$root"
  exit 0
fi
docker exec -i "$container" sh -eu -s "$root" <<'GUEST'
root=$1
tone() { # dir file title number album artist genre frequency
  mkdir -p "$root/$1"
  sox -n --comment "TITLE=$3" --add-comment "TRACKNUMBER=$4" --add-comment "ALBUM=$5" \
    --add-comment "ARTIST=$6" --add-comment "GENRE=$7" \
    -r 44100 -c 2 -b 16 "$root/$1/$2" synth 25 sine "$8" vol 0.1
}
tone 'Lumen - Harbor' 'a Pier.flac' 'Pier' 3 Harbor Lumen Ambient 330
tone 'Lumen - Harbor' 'b Low Tide.flac' 'Low Tide' 2 Harbor Lumen Ambient 392
tone 'Lumen - Harbor' 'c Harbor Light.flac' 'Harbor Light' 1 Harbor Lumen Ambient 440
tone 'Kestrel - Harbor' 'a Crossing.flac' 'Crossing' 1 Harbor Kestrel Jazz 494
# Crossing has no lyrics: the LRCLIB case saves one beside it; a rerun starts without it again.
rm -f "$root/Kestrel - Harbor/a Crossing.lrc"
# Night Lines has no cover: the Cover Art Archive case saves one into its folder.
rm -f "$root/Lumen - Night Lines/cover.jpg" "$root/Lumen - Night Lines/cover.png"
tone 'Kestrel - Harbor' 'b Salt.flac' 'Salt' 2 Harbor Kestrel Jazz 523
tone 'Lumen - Night Lines' 'a Signal.flac' 'Signal' 1 'Night Lines' Lumen Jazz 587
tone 'Lumen - Night Lines' 'b Streetlight.flac' 'Streetlight' 2 'Night Lines' Lumen Jazz 659
# Lyrics: a same-stem .lrc next to Signal, an embedded LYRICS comment in Streetlight.
printf '[00:00.00]Signal, first line\n[00:05.00]Signal, second line\n[00:10.00]Signal, third line\n' \
  > "$root/Lumen - Night Lines/a Signal.lrc"
# Plain lyrics without timings beside Low Tide: the page offers synced ones and may replace this file.
printf 'Low tide, a plain line\nLow tide, another plain line\n' > "$root/Lumen - Harbor/b Low Tide.lrc"
rm "$root/Lumen - Night Lines/b Streetlight.flac"
sox -n --comment 'TITLE=Streetlight' --add-comment 'TRACKNUMBER=2' --add-comment 'ALBUM=Night Lines' \
  --add-comment 'ARTIST=Lumen' --add-comment 'GENRE=Jazz' \
  --add-comment 'LYRICS=[00:00.00]Streetlight, embedded line' \
  -r 44100 -c 2 -b 16 "$root/Lumen - Night Lines/b Streetlight.flac" synth 25 sine 659 vol 0.1
# Two discs in CD1/CD2 folders with DISCNUMBER and DATE tags, and a joint
# credit: two ARTIST fields, which stock stores as "Lumen;Kestrel".
disc() { # folder file title number disc frequency [extra comment]
  mkdir -p "$root/Lumen - Tide Tables/$1"
  sox -n --comment "TITLE=$3" --add-comment "TRACKNUMBER=$4" --add-comment "DISCNUMBER=$5" \
    --add-comment 'DATE=2004-06-01' --add-comment 'ALBUM=Tide Tables' --add-comment 'ARTIST=Lumen' \
    ${7:+--add-comment "$7"} --add-comment 'GENRE=Ambient' \
    -r 44100 -c 2 -b 16 "$root/Lumen - Tide Tables/$1/$2" synth 25 sine "$6" vol 0.1
}
disc CD1 'a Undertow.flac' Undertow 1 1 349 'ARTIST=Kestrel'
disc CD1 'b Slack Water.flac' 'Slack Water' 2 1 370
disc CD2 'a Spring Tide.flac' 'Spring Tide' 1 2 415
disc CD2 'b Neap.flac' Neap 2 2 466
# A CUE image: one FLAC holding three tracks and its sheet. Stock indexes three
# tracks that share the file path (IS_CUE=1) and tells them apart by title only.
mkdir -p "$root/Tessera - Image Sessions"
sox -n -r 44100 -c 2 -b 16 "$root/Tessera - Image Sessions/Image Sessions.flac" \
  synth 20 sine 300 vol 0.1 : synth 20 sine 400 vol 0.1 : synth 20 sine 500 vol 0.1
cat > "$root/Tessera - Image Sessions/Image Sessions.cue" <<'CUE'
PERFORMER "Tessera"
TITLE "Image Sessions"
FILE "Image Sessions.flac" WAVE
  TRACK 01 AUDIO
    TITLE "Opening Frame"
    PERFORMER "Tessera"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "Second Frame"
    PERFORMER "Tessera"
    INDEX 01 00:20:00
  TRACK 03 AUDIO
    TITLE "Last Frame"
    PERFORMER "Tessera"
    INDEX 01 00:40:00
CUE
# Long names, as on anniversary editions: stock cuts them short in its play state.
tone 'Lumen - Anniversary' 'a Long.flac' 'An Unusually Long Track Title for the Play State' 1 \
  'Quiet Meridian (The Complete Anniversary Recordings)' Lumen Ambient 311
# What a Mac leaves (combined-008): an AppleDouble twin and a .DS_Store, which
# the Card page's Trash tab moves as one entry and restores.
printf 'mac' > "$root/Lumen - Harbor/._a Pier.flac"
printf 'mac' > "$root/.DS_Store"
find "$root" -type f | sort
GUEST
# Covers need Python inside the container (a folder PNG, an embedded PICTURE).
docker cp "$(dirname "$0")/covers.py" "$container:/tmp/acceptance-covers.py"
docker exec "$container" python3 /tmp/acceptance-covers.py "$root"
docker exec "$container" rm -f /tmp/acceptance-covers.py
