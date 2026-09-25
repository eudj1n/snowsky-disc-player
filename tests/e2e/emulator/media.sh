#!/bin/sh
# Generates the acceptance media on the disposable emulator card (never on a
# player): two albums titled "Harbor" by different artists and genres, a second
# Lumen album, and track numbers that differ from file order. Tagged FLAC
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
find "$root" -name '*.flac' | sort
GUEST
