#!/bin/sh
# Generates the acceptance media on the disposable emulator card (never on a
# player): two albums titled "Harbor" by different artists and genres, a second
# Lumen album, a two-disc Lumen album with a year and a joint credit, and track
# numbers that differ from file order. Tagged FLAC
# tones made with sox inside the emulator container; nothing is copied from a
# real library. Usage: tests/e2e/emulator/media.sh <container> [remove]
set -eu
container=$1
root='/tmp/sdcard/Player Acceptance'
if [ "${2:-}" = remove ]; then
  docker exec "$container" rm -rf "$root"
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
tone 'Kestrel - Harbor' 'b Salt.flac' 'Salt' 2 Harbor Kestrel Jazz 523
tone 'Lumen - Night Lines' 'a Signal.flac' 'Signal' 1 'Night Lines' Lumen Jazz 587
tone 'Lumen - Night Lines' 'b Streetlight.flac' 'Streetlight' 2 'Night Lines' Lumen Jazz 659
# Lyrics: a same-stem .lrc next to Signal, an embedded LYRICS comment in Streetlight.
printf '[00:00.00]Signal, first line\n[00:05.00]Signal, second line\n[00:10.00]Signal, third line\n' \
  > "$root/Lumen - Night Lines/a Signal.lrc"
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
find "$root" -type f | sort
GUEST
# Covers need Python inside the container (a folder PNG, an embedded PICTURE).
docker cp "$(dirname "$0")/covers.py" "$container:/tmp/acceptance-covers.py"
docker exec "$container" python3 /tmp/acceptance-covers.py "$root"
docker exec "$container" rm -f /tmp/acceptance-covers.py
