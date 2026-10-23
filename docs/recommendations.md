# Recommendations from one's own music: preliminary analysis (2026-10-22)

"My wave" and "In the style of {artist | track | album}" over the collection on
the card, as streaming services offer over theirs. The owner asked where such
recommendations can come from and how they can be built; this records the
answer, source by source, for a later round. Nothing of it is built. Facts
were checked on 2026-10-22 against the sources' documentation and with
requests from a terminal (CORS headers, rate limits, response shapes).

## Summary

Two layers. **Outside sources** give similarity between artists, recordings
and tags, popularity, and new releases, all by MusicBrainz ids, which the
page already has for identified albums and their artists. **The collection
itself** gives tags, the listening history (what was played together, what
was skipped, what was disliked) and, if we decide to compute them, audio
features. "In the style of" needs the first layer; "My wave" is built from
the second with the first as seasoning.

ListenBrainz is the one source that offers most of it without a key or an
account, with CORS open, and it fits the existing pattern of an outside
source the owner switches on. The one thing it does not give without an
account is its playlist generator (LB Radio) and the collaborative
recommendations, which need the owner's own token, as the scrobbling idea
recorded earlier in the plan.

## Constraints that shape the design

- **The page asks the sources itself, from the browser.** The service adds
  reviewed origins to the page's CSP from `release/origins.json` (policy as
  data: a new provider is a card release of the server, never an image).
  Every candidate therefore needs CORS open to any origin; a provider without
  it is out, as Deezer was for artist pictures.
- **Identities.** An identified album knows its MusicBrainz release, release
  group and artist ids; recording ids come from the release's track list,
  which the identification reads already, matched by position. A source that
  works by MBID needs no name matching; one that works by name needs the
  fuzzy matching of the lyrics lookup.
- **No personal data leaves the player unless the owner says so.** Asking
  "what is similar to this artist" sends an MBID, not the history. Sending
  the history (scrobbling) is a separate switch with the owner's own token,
  off by default, as recorded in the plan on 2026-09-29.
- **Rate limits.** ListenBrainz answers with `X-RateLimit-Limit: 30`,
  `X-RateLimit-Remaining` and `X-RateLimit-Reset-In` (seconds), exposed to
  the page; the batch endpoints take many ids per request. The page's
  outside-source queue (one request at a time, MusicBrainz's one per second)
  extends to this.
- **Computation on the player is out.** The X1000 has no cycles for audio
  analysis; anything computed runs in a browser on a computer and is kept
  on the card in the app's data through the server.

## Outside sources

### ListenBrainz (fits; no key)

Origins `https://api.listenbrainz.org` and `https://labs.api.listenbrainz.org`
(`connect-src`); both answer `Access-Control-Allow-Origin: *`. Checked on
2026-10-22.

Without an account:

| What                 | Endpoint                                                                                                                                                                                                                                                                                                                                                                       | For                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Similar artists      | labs `similar-artists/json?artist_mbids=…&algorithm=…` → `[{artist_mbid, name, score, reference_mbid}]`                                                                                                                                                                                                                                                                        | "In the style of {artist}": the similar ones present on the card, then those absent. The artist page's shelf.                                                                                                              |
| Similar recordings   | labs `similar-recordings/json?recording_mbids=…&algorithm=…` → `[{recording_mbid, recording_name, artist_credit_name, release_mbid, score}]`; an `mlhd-similar-recordings` variant on the MLHD corpus                                                                                                                                                                          | "In the style of {track}".                                                                                                                                                                                                 |
| Popularity           | `POST /1/popularity/recording`, `/artist`, `/release`, `/release-group` (lists of ids) → listen and listener counts; `GET /1/popularity/top-recordings-for-artist/{mbid}` (**needs the user token since 2026-10-23**: 401 without one, "due to bad actors and AI scrapers"; the owner's token is optional in Settings) and `top-release-groups-for-artist/{mbid}` (still open) | "Best of {artist}" from what the card holds; an album's tracks by fame; "Deep cuts" (the least known in the collection); the artist's best-known albums the card lacks (MusicBrainz gives the discography, this ranks it). |
| Tags with weights    | `GET /1/metadata/artist/?artist_mbids=…&inc=tag`, `/1/metadata/recording/?recording_mbids=…&inc=tag`, `/1/metadata/release_group/?release_group_mbids=…&inc=tag`; labs `bulk-tag-lookup/json?recording_mbid=…` → `[{tag, tag_count, percent, source}]`                                                                                                                         | Community genres and moods with vote counts, fuller than the files' tags; genre pages that fill; mood lists. Tags carry `genre_mbid` where MusicBrainz knows the tag as a genre.                                           |
| Tag similarity       | labs `tag-similarity/json?tag=…` → `[{similar_tag, count}]`                                                                                                                                                                                                                                                                                                                    | "In the style of {genre}" without exact string matches; a radio by tag that widens.                                                                                                                                        |
| Fresh releases       | `GET /1/explore/fresh-releases/?release_date=YYYY-MM-DD&days=N` (N ≤ 90) → `[{release_name, artist_credit_name, artist_mbids, release_date, release_group_mbid, release_group_primary_type, release_tags, listen_count}]`; about ten thousand entries for 30 days                                                                                                              | "New from your artists": filtered by the collection's artist ids. Not similarity, but the same source and a feature of its own.                                                                                            |
| Site-wide statistics | `GET /1/stats/sitewide/artists`, `/recordings`, `/release-groups` with `range`                                                                                                                                                                                                                                                                                                 | "Popular now, from your collection". A weak signal, free.                                                                                                                                                                  |

"Similar albums" has no endpoint. It is built from the bricks: similar
artists, then their top release groups by popularity, intersected with the
collection; or release-group tags, weighted, for albums whose artists are
unrelated.

With the owner's account (token kept in the browser, as fanart.tv's key):

- **Scrobbling** (`POST /1/submit-listens`): the history on the card, from
  the player and the browser, sent as listens. In return ListenBrainz
  computes collaborative recommendations across all its users.
- **Recommendations** `GET /1/cf/recommendation/user/{name}/recording`
  (recording ids with scores) and the generated playlists (Weekly Jams,
  Weekly Exploration, Daily Jams) through the playlist API. Intersected with
  the card they are "My wave" as a streaming service has it; the rest is a
  list of what to add.
- **Feedback** `POST /1/recommendation/feedback/submit` (`rating`): our
  dislikes map onto it one to one.
- **LB Radio** `GET /1/explore/lb-radio?prompt=…&mode=easy|medium|hard`: a
  prompt of weighted terms (`artist:(name):3 tag:(trip hop):2 country:(…)`,
  `nosim` for no similar artists, `recs:` and `stats:` over the account),
  answered as a JSPF playlist of recording ids. **Needs a token**: without
  one the endpoint answers 401 (checked 2026-10-22), contrary to the first
  reading of the documentation.
- `GET /1/metadata/lookup/` (names to ids) also needs a token; MusicBrainz's
  own search replaces it.

Out of scope there: the art service (SVG cover grids; CSP would not show
them anyway), releases by cover colour (we have our own cover colours),
streaming-service ids by MBID.

### Last.fm (fits with a key)

`https://ws.audioscrobbler.com/2.0/` answers with CORS open; every method
needs an API key (free, personal, like fanart.tv's). `artist.getSimilar`,
`track.getSimilar`, `tag.getTopArtists`, `artist.getTopTags`: the
longest-standing similarity data, by name (MBIDs are accepted but patchy).
A second source behind ListenBrainz if its similarity proves thin for the
owner's collection.

### Discogs (fits with a token)

`https://api.discogs.com` answers with CORS open; search without a token is
limited (25 requests a minute), with a personal token 60. Its value is the
**styles** of a release ("Minimal Techno", "Dream Pop", "Shoegaze"), much
finer than genres; MusicBrainz links releases to Discogs where the editors
added the link. For "in the style of {album}" by style, and for genre pages
with sub-genres. Discogs's licence forbids caching its data beyond the
session in bulk; what we keep on the card must stay to the styles of the
owner's own releases.

### Wikidata (already an origin)

Genres (P136), "influenced by" (P737), members and collaborations, by the
artist's Wikidata id that MusicBrainz links. No new origin. Thin for lesser
artists, and influences are editorial rather than listening-based; a third
signal for "in the style of {artist}".

### Not fitting

- **Deezer**: no `Access-Control-Allow-Origin` (checked again 2026-10-22).
- **Spotify**: related artists and audio features are closed to new
  applications since late 2024; an application registration anyway.
- **AcousticBrainz**: frozen (no new submissions since 2022); its low-level
  features by MBID may still be read for old recordings, but coverage will
  only shrink.
- **Every Noise at Once**: no API.

## The collection itself

- **Tags and neighbourhood.** Genre, decade, artist, plus the tags above:
  enough for a first "in the style of" without any sound analysis.
- **The history as a graph.** Which tracks played in one session or queue,
  one after the other; a transition count "after A came B". For one listener
  the data is thin, but a wave needs little: the next track leans towards
  what followed its predecessor before. A skip before 30 s is a negative
  signal, a full play a positive one; dislikes are a hard exclusion
  already.
- **Audio features, computed in the browser.** Web Audio decodes 30 s from
  the middle of a track from the card's own route; Meyda (small, no WASM)
  gives tempo, energy, spectral centroid and chroma; Essentia.js with its
  MusiCNN model (WASM, a few MB) gives an embedding whose nearest neighbours
  are the real "in the style of {track}". Computed once, on a computer, as
  one more step of the library's state run; the vectors kept on the card in
  the app's data through the server, so that similarity is cheap on every
  device after. WASM needs `'wasm-unsafe-eval'` in the gateway's
  `script-src`: a server change, to be weighed when this stage comes.
- **Lyrics.** The LRC files beside tracks (LRCLIB, lrc.red) give text; a
  TF-IDF over them is a cheap theme signal, weak alone, useful for mood.

## What the owner would get

- **In the style of {artist}**: the artist page's shelf of similar artists
  on the card (ListenBrainz, Last.fm, Wikidata), then "also like this
  artist" for those absent.
- **In the style of {track}**: similar recordings on the card, later by
  audio features; one tap makes a queue of them.
- **In the style of {album}**: by the artists' similarity and the album's
  tags or styles.
- **Best of {artist}** and **Deep cuts**: by popularity, from the card.
- **The albums you lack**: the artist's best-known release groups absent
  from the card, beside the discography the edition view shows.
- **New from your artists**: fresh releases filtered by the collection's
  artists, on New.
- **My wave**: an endless queue that grows one track at a time as the queue
  nears its end, in the browser or on the DISC (the queue is filled by
  commands either way). The mix: neighbours of what was recently played and
  liked, by tags and features; what was not played lately; a little new.
  The same artist not within N tracks, dislikes out, skips lowering the
  weight of a neighbourhood. With the account: ListenBrainz's own
  recommendations intersected with the card, as the first ingredient.

## Order, if one source at a time

1. ListenBrainz similar artists and popularity: "In the style of {artist}",
   "Best of", "The albums you lack". Two origins in the server's catalog, a
   source behind the existing switch, domain code only. **Built 2026-10-23**
   (the plan's "ListenBrainz, stage 1"): Popular, Similar artists and
   "Also by" on the artist's page.
2. Tags with weights and tag similarity: fuller genres, "in the style of
   {genre}".
3. Similar recordings: "In the style of {track}", the first queue from it.
4. Fresh releases on New.
5. My wave from the history graph and the sources above.
6. The account: scrobbling, collaborative recommendations, LB Radio;
   feedback from dislikes. Only on the owner's own decision.
7. Audio features in the browser, with the CSP change, if the tags prove
   too coarse.

Last.fm and Discogs come in where ListenBrainz's data is thin for the
owner's collection, each with the owner's own key.

## Open questions for the owner

- Which of the products above come first; whether "My wave" is a playlist
  the page refreshes (as the automatic playlists are) or a live queue.
- Whether anything computed (features, the graph) lives in the app's data
  on the card or in the browser only.
- Whether the account stage is wanted at all.
