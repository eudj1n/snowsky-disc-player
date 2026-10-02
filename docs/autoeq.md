# AutoEQ: preliminary analysis (2026-10-02)

Headphone correction presets from the [AutoEq](https://github.com/jaakkopasanen/AutoEq)
project on the player's equalizer, as FiiO Control offers. This is the owner's
next large task; the analysis waits for the owner's decisions at the end
before any work starts. Facts were checked on 2026-10-02 in this repository,
the service's catalogs, the emulator's research notes and the sources linked.

## Summary

The integration needs no new firmware image: the commands that write the
equalizer are already in the reviewed command catalog. The one hard limit is
the filter type: every band of the DISC is a peaking filter, while AutoEq's
parametric results use shelves. AutoEq's fixed band results (ten peaking
filters on octave frequencies) map onto the DISC one to one; a fit of our own
to ten free peaking filters would be closer.

## The player's equalizer (firmware V2.57)

- Ten bands, each with its own frequency (whole Hz), gain (0.1 dB steps) and
  Q. The firmware sets every band's filter type to zero (Peak); FiiO
  Control's editor offers Peak only. Defaults: 32, 64, 125, 250, 500, 1k, 2k,
  4k, 8k, 16k Hz, 0 dB, Q 0.7.
- The page's bounds are frequency 20–20000 Hz, gain −24…+12 dB, Q 0.1–20
  (conservative client bounds; FiiO Control's editor shows Q 0.25–8). The
  firmware's own limits are not determined.
- A preamp ("master gain") for each user slot, −24.0…+12.0 dB in 0.1 dB steps.
- Ten user slots, Custom 1–10 (wire 160..169, `STYLE_PRESET` 11..20 in the
  `PEQ` table of song.db), besides the built-in styles. A slot cannot be named
  remotely: `STYLE_NAME` exists, no command writes it.
- Commands in the catalog: select a preset `0690` (`set_eq_type`), write one
  to ten bands in one message `0678` (`set_peq`, JSON with gain and Q as
  strings), write the preamp `0630` (`set_eq_master`); reads `0639`, `0629`,
  `0628`; the query `peq_presets` reads every slot. All writes need the serial
  number, a request ID and pacing.
- The Sound dialog already writes the changed bands in one `0678`, then the
  preamp, and confirms each by reading back. Its band sliders span −12…+12 dB
  in 0.5 dB steps; AutoEq's values have 0.1 dB precision.
- Confirmed by the owner (2026-10-02): the equalizer audibly changes the
  sound on the physical player.
- Not verified: whether Q 1.41 and 0.1 dB gains survive a reload (a Q of 0.71
  reads back as 0.70); the physical Custom 10 slot was left in an unknown state
  after FiiO's Auto EQ; whether the equalizer applies in USB DAC, Bluetooth,
  AirPlay and S/PDIF modes.

## AutoEq

- Results live in `results/<source>/<form>/` or `results/<source>/<rig>
  <form>/` (23 sources). A headphone's folder holds `ParametricEQ.txt`,
  `FixedBandEQ.txt`, `GraphicEQ.txt`, a CSV (none for crinacle), a graph and
  impulse responses. The last push was 2025-07-20; updates are irregular.
- `ParametricEQ.txt` (EqualizerAPO syntax): a `Preamp:` line, then ten
  filters of types PK, LSC and HSC with Fc, Gain and Q. The shelves rule it
  out for the DISC as it is.
- `FixedBandEQ.txt`: a `Preamp:` line, then ten PK filters at 31.25·2^i Hz
  (31…16000 Hz), Q 1.41, gains within ±12 dB. It fits the DISC's ten bands
  plus the slot's preamp.
- No machine-readable index: `results/README.md` lists the recommended result
  per model (6033 models), `INDEX.md` every result with its source and rig
  (8850 rows, 852 KB), both as Markdown links.
- Licences: the code is MIT. The results and measurements carry no licence of
  their own; crinacle's raw data is not in the repository (Patreon only), and
  Rtings put its full results behind a subscription in 2025. A fair credit:
  "AutoEq · measured by <source> on <rig> · target <target>".
- Fetching from the browser: jsDelivr with a pinned commit
  (`cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@<sha>/…`) sends
  `Access-Control-Allow-Origin: *` and is cached for good; raw GitHub sends
  it too but has tight anonymous limits; autoeq.app's API sends no CORS
  headers, so a page cannot call it.

## FiiO

- FiiO Control Web (WebHID) offers AutoEQ through FiiO's own server, which
  mirrors AutoEq's sources and targets; its endpoints are undocumented and not
  offered to third parties. The DISC is not among its devices.
- The mobile FiiO Control has Auto EQ since early 2026 and supports the DISC
  since 4.5.0; firmware V2.57 fixed "no output when using AUTO EQ", so FiiO
  writes the same PEQ bands.
- FiiO fits to the device's current bands (each keeps its filter type;
  frequency, Q and gain are free) and moves the preamp to the device's global
  gain.

## Ways to compute

- A. AutoEq's `FixedBandEQ` as it is: no computation, available for every
  model (crinacle's too), less exact than a parametric fit.
- B. A fit of our own to ten free peaking filters in the browser, from the
  measurement's CSV and a target (a base: `equalizer.js` of
  [squiglink/lab](https://github.com/squiglink/lab), 0BSD): closer, but no CSV
  for crinacle (A there), and more work and tests.
- C. AutoEq run beforehand with a ten-peaking configuration, published as our
  own data: the best fit, but we would redistribute data of unclear licence
  and keep a pipeline. Not advised.

Advised: A first, B later as a finer fit if A proves itself.

## What stage A needs

- Service, card-only (no image), with tests and documentation:
  `cdn.jsdelivr.net` in `origins.json`; a store collection recording which
  headphones a slot holds (model, source, rig, target, when), since a slot
  cannot be named on the player.
- Page: an "AutoEq" outside source in Settings, off by default; in the Sound
  dialog, a headphone search over the cached index with the source, rig and
  form; a preview of the bands and preamp; the choice of a Custom slot;
  writing the ten bands in one `0678`, the preamp and the slot, each
  confirmed by reading back; the credit; 0.1 dB precision in the editor.
- Tests: unit (the index and `FixedBandEQ` parsers, the mapping), e2e on the
  mock with a stubbed jsDelivr, the emulator for writing and reading the
  bands (not the sound).
- On the physical player, with the owner: Q and gain precision after a
  reload; reading with this page the bands FiiO Control's Auto EQ writes for
  the same headphones, to compare.

## Decisions for the owner

1. Computation: A (`FixedBandEQ`) first, B later?
2. Data: jsDelivr at a pinned AutoEq commit, the pin moved by hand?
3. Catalogue: the recommended result per model (6033), or every result
   (8850) with its source and rig?
4. Keep on the player which headphones each slot holds?
5. Check the equalizer on the physical player with the owner before the
   work starts? (That it changes the sound is confirmed.)

## Sources

- AutoEq: https://github.com/jaakkopasanen/AutoEq (results, `INDEX.md`,
  `autoeq/frequency_response.py`, `webapp/main.py`, `LICENSE`)
- crinacle data removal: https://github.com/jaakkopasanen/AutoEq/commit/ab0fcf2fe072665f8af1d253c14226621fadecec
- Rtings paywall: https://www.back2gaming.com/news/rtings-locks-full-test-results-behind-a-paywall-to-combat-ai-scraping/
- GitHub anonymous limits: https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/
- jsDelivr: https://github.com/jsdelivr/jsdelivr
- autoeq.app terms: https://autoeq.app/legal/terms-of-service.html
- FiiO Control Web: https://fiiocontrol.fiio.com
- FiiO Control (App Store history): https://apps.apple.com/us/app/fiio-control/id1485988916
- DISC firmware notes: https://forum.fiio.com/note/showNoteContent.do?id=202601311712087234434
- The DISC's equalizer protocol: the emulator repository's
  `docs/protocol/remote-settings.md` and `research/docs/reports/peq.md`; the
  service's `firmware/commands/v2.57.json` and `firmware/queries/v2.57.json`.
