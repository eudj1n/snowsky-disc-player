# lrc.red: lyrics with word timings (owner, 2026-10-20)

The owner's analysis of 2026-10-19, taken into work on 2026-10-20 after
AutoEq stage A. Facts were checked against the live service on both days.

## What it is

[lrc.red](https://lrc.red) is a free, donation-run lyrics service. No key,
`Access-Control-Allow-Origin: *`, plain GETs without a preflight. Its one
documented condition: a service that uses or proxies the API credits
lrc.red. Request limits are not published.

## The API, as checked

- `GET /search.json?q=<text>[&in=lyrics][&after=<cursor>]` →
  `{ hits: [{ isrc, title, artist, album, year, duration, cover, color }], next }`.
  Full text: "Radiohead Creep" answers Radiohead's recordings and other
  artists' covers alike; a Cyrillic query works ("Кино Пачка сигарет").
  `duration` is seconds with a fraction; `next` is a cursor (`p24`) or null;
  nothing found is `{ hits: [], next: null }`.
- `GET /s/<ISRC>.song.json` → the metadata, `level` (`word`, `line` or
  `none`), the lines with their words, and the TTML source.
- `GET /s/<ISRC>.lrc` → by the level: enhanced LRC with `<mm:ss.xx>` word
  stamps and a closing stamp on each line, plain LRC with line stamps, or
  untimed text; `[ti:]`, `[ar:]`, `[al:]`, `[length:]` headers; 404 for an
  unknown ISRC.
- `GET /s/<ISRC>.ttml`, `GET /s/<ISRC>.webp`: TTML (Apple-like, with
  background parts) and the cover; not used.
- `POST /s/<ISRC>/sync` runs their alignment model on their recording; the
  only non-GET request. Never called.

The catalog by `/stats.json` on 2026-09-19: 29.8 M tracks, 157,661 with word
timings, 12.3 M with line timings, 17.3 M untimed.

## Why it matters here

The page's parser (`src/domain/lyrics.ts`) already reads enhanced LRC, and
karaoke sings by words where a file has them. LRCLIB has almost no word
timings; lrc.red has them for 158 thousand tracks. The `.lrc` goes onto the
card by the same guarded upload as LRCLIB's.

## The owner's decisions (2026-10-20)

- The source is taken although the data's provenance is unclear (ISRC
  identifiers, TTML with `x-bg` roles look like a streaming catalog's
  export; only a request for credit): every outside source is off until the
  owner allows it, so the choice stays the owner's.
- The match is LRCLIB's: the track's artist and title are searched, a hit is
  the track when its title is the same, its artist names the track's (either
  way round: "Виктор Цой, Кино" names Кино) and its length is within three
  seconds when both are known; the track's album first, then the nearest
  length. Case, accents and punctuation aside.
- Only `.lrc` is written. For a track without lyrics lrc.red's line timings
  or plain text are taken when it has no word timings, as LRCLIB's would be.
- `POST /sync` stays unused.

## As built

- Service, card-only: `https://lrc.red` among the reviewed origins
  (`connect-src`); `release/origins.json` renders it here.
- Three levels of lyrics (`lyricsLevel`: none, line, word) replace the one
  `synced` flag where lookups decide. Each online source brings at most one
  level (LRCLIB: line; lrc.red: word) and is asked only when it could
  improve the track: a track with line timings of its own offers lrc.red
  only, and only word timings are taken for it; a track with plain text
  takes line timings or better; a track without lyrics takes anything. This
  closes the dead end the owner found: a track whose files carry line
  timings never got word timings.
- `gateway/lyricsOnline.ts` asks the allowed sources in order, lrc.red
  first, stopping at word timings; lrc.red's best of up to three matching
  hits is read, LRCLIB answers once; the highest level wins; a source that
  could not be reached is named in the panel. The library enrichment's
  lyrics step uses the same lookup for tracks without lyrics.
- The listening panel's lookup names the sources it asks (or would ask,
  when off) and the hosts the names go to; the find button says what it
  looks for (lyrics, synced lyrics, word timings); what was found is "From
  lrc.red, not on the card yet" until saved. Saving a `.lrc` over a `.lrc`
  with line timings moves the old one to the service's trash (reversible),
  as a plain one was before; embedded tags are left alone, the saved file
  wins on reading.
- Settings: lrc.red before LRCLIB among the lyrics sources, with an
  automatic choice "when a track without word timings plays".
- Tests: unit `lrcred` (the search, the file, the match, the levels, the
  order of sources, the levels wanted, the failures); e2e "finds word
  timings on lrc.red for a track with line timings and replaces its .lrc"
  on the mock with a stubbed lrc.red.
- Not done: the enrichment run does not yet upgrade tracks whose files
  already have line timings (it would need each track's lyrics read, one
  more request per track); the second page of search hits (`next`) is not
  read.
