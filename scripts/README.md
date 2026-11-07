# Alaska RCV explorer: data

Everything here prepares `site/static/data/alaska-rcv-2026/` for the page.
The Division's files are untrusted input: keep them in their own directory, and run Python with
`python3 -I` from somewhere else.

`elections.alaska.gov` sends the wrong TLS intermediate. Browsers cope, but curl needs the right one
passed with `--cacert`, found through the certificate's AIA URL. Don't turn verification off.

## Watching for updates

The Division overwrites its files at the same URLs, so a missed update is gone. `bash scripts/refresh.sh watch STORE CACERT`, run about
hourly, compares the three files' `Last-Modified` and the table's "Table last updated" text with the last run's, and saves a complete
snapshot to `STORE/TIME/` when any has changed. It writes nothing to this repo and publishes nothing. A file posted during a
download shows up as a change next run, so that run's snapshot is the complete one: build the newest for each posting.

`.github/workflows/watch.yml` runs that hourly on GitHub through `scripts/watch_action.sh`. A new snapshot becomes a prerelease named
`watch-TIME`, with its files and `seen`, and an issue; the newest such release's `seen` is the next run's state, so a repo with none
saves once. It builds nothing: a person follows "Refreshing results" from those files. `division-tls-intermediate.pem` is the
intermediate from the AIA URL, public, and good until June 2029. A failed run emails whoever last changed the schedule, and GitHub
turns scheduled runs off after 60 days with no activity in the repo.

## Earlier versions

The page has one version per update from the Division: a complete data directory at `site/static/data/alaska-rcv-2026/versions/ID/`,
where `ID` is the time of the Division's latest change to its CVR, summary or received table. `versions.json` lists them, and the
page's default data is a copy of the newest. Every version runs today's model on that day's data, so it isn't what the page showed that
day, and the page says so. Don't rebuild one from an old commit: old commits mix changes to the model with changes to the data.

`npm test` checks the list and the copies, and CI reruns every version's simulation. If that fails after a change to the model,
rerun each version's `simulate_projection.mjs`. If the data's format changed, rebuild each version from its release:
`refresh.sh build` into a directory holding copies of `district-names.json`, `districts.geojson`, `early-absentee-2024.json`,
`holdovers.json` and `questioned-2024.json`, then `refresh.sh keep THAT_DIR site/static/data/alaska-rcv-2026`.
Rebuild the newest last, in the data directory itself.

## Refreshing results

Each refresh changes the page's status line, which comes from these files. `refresh.sh` does what can be scripted,
and doesn't publish anything. It needs Node, `pdftotext`, `unzip`, and Python with `ijson`,
which `PYTHON` can point to:

```bash
nix shell nixpkgs#nodejs nixpkgs#poppler-utils nixpkgs#unzip -c bash
```

1. Copy a snapshot from the watcher to its own directory outside this repo, as `RAW_DIR`. Or `bash scripts/refresh.sh fetch RAW_DIR CACERT`
   downloads `CVR_Export.zip`, `ElectionSummaryReportRPT.pdf` and `GA_ENR_Precinct_State_of_Alaska.csv` from
   `https://www.elections.alaska.gov/enr/26GENR/results/`, and the "ballots received" table from
   https://www.elections.alaska.gov/election-results/e/, with their response headers.
2. `build` writes `RAW_DIR/received.json` from the saved table with `received_from_table.mjs`, unless it's already there:
   `{"asOf": "Nov 3, 2026, 12:26 PM", "received": 105419, "issued": 126521}`. It stops if the table's rows don't add up to its total.
   That total includes the table's questioned ballots (143 on November 4) and special needs ballots (286). `build_coverage.py`
   reads the questioned row from the saved table, stops if the table's total differs from `received.json`'s, and records the row
   in `coverage.json`. Uncounted ballots leave it out, because the questioned estimate already covers those ballots.
3. `bash scripts/refresh.sh build RAW_DIR site/static/data/alaska-rcv-2026` (about 4 minutes) extracts the CVR, then rebuilds
   `ballots.json`, the contest files, `coverage.json` and `projection.json`, using the CVR's `Last-Modified` and download time
   from its saved headers. It then checks the simulation's arithmetic and the vote totals.
   Same inputs give a byte-identical `projection.json`. Once the CVR includes questioned ballots (group 4), the simulation only
   adds whatever is left of each district's expected count; revisit that then.
4. By hand, reread the caveats in `site/content/_index.md`: they may go out of date.
5. By hand, once the Division publishes round-by-round reports on November 18, compare them and say so on the page.
6. `bash scripts/refresh.sh keep site/static/data/alaska-rcv-2026 site/static/data/alaska-rcv-2026` keeps this build as a version, and
   rewrites `versions.json`. Then `bash scripts/refresh.sh archive RAW_DIR site/static/data/alaska-rcv-2026` adds the raw files' checksums to `../sources.sha256`, since the Division overwrites
   them, and prints the `gh release create` command. Add a row to `../SOURCES.md` by hand.
7. Before deploying, `bash scripts/refresh.sh check site/static/data/alaska-rcv-2026 CACERT` runs the tests, the vote total
   checks and the simulation again, and fails unless the Division's latest CVR and received table are the ones in `coverage.json`.

Once per election, `node build_early_absentee_2024.mjs EXTRACTED_2024_DIR site/static/data/alaska-rcv-2026/early-absentee-2024.json`
makes the 2024 shares that split the uncounted ballots between districts, and
`node build_questioned_2024.mjs EXTRACTED_2024_DIR site/static/data/alaska-rcv-2026/questioned-2024.json`
makes the questioned ballot and Election Day counts the projection and ballots outstanding use.
`node build_holdovers.mjs EXTRACTED_2024_DIR site/static/data/alaska-rcv-2026/holdovers.json` makes the State Senate seats
not on the ballot, for the whole-chamber views.

## The simulated projection

`SIMULATION.md` has the method, its assumptions, the 2024 evidence for its settings, and what it leaves out.

## District names

`node build_district_names.mjs H07_PDF site/static/data/alaska-rcv-2026/district-names.json` takes the house district names from
the Division's form H07, "House and Senate District Designations", kept in the `sources-2026-11-05` release. It needs `pdftotext`, and stops
unless it finds districts 1 to 40 beside the right senate seats.

## Boundaries

From the shapes behind the Division's results map, https://www.elections.alaska.gov/enr/26GENR/:

```bash
curl -O https://www.elections.alaska.gov/enr/26GENR/shapes/districts.js
node build_districts.mjs districts.js raw-districts.geojson
```

Those shapes run far past the coast, so they're clipped to the Census Bureau's 1:500,000 outline of Alaska, which
removes about 267,000 km² of sea and leaves 94 km² of land outside any district, all thin slivers. This needs
`mapshaper` on the path (0.6.113: `npm i mapshaper@0.6.113`). The `.shp` comes from
https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_500k.zip, extracted:

```bash
bash build_coast_clip.sh raw-districts.geojson cb_2024_us_state_500k.shp site/static/data/alaska-rcv-2026/districts.geojson
```

The favicon comes from those districts, and also needs `mapshaper`:

```bash
node build_favicon.mjs site/static/data/alaska-rcv-2026/districts.geojson site/static/favicon.svg
```

An earlier version dissolved `AK_Election_Precincts_2023Final.zip` with mapshaper, and had large gaps,
such as about 33,000 km² of HD 37.

## Checks

`../docs/RULES.md` has the rules and these checks' results.

`validate_2024.mjs` runs the page's tabulator over the 2024 CVR (extracted with `extract_cvr.py`) and compares it with the
Division's 9 certified round-by-round reports, as `pdftotext -layout` text. It should report 0 problems. Run it after any change
to `rcv-tabulate.js` or `extract_cvr.py`.

`compare_rank_sources.mjs` is a holdout test of where a hand-counted ballot's later rankings should be copied from. It writes
only to stdout. `scripts/SIMULATION.md`, "Where copied rankings come from", has its arguments and what it found.

`check_counts.mjs` compares the CVR with the summary on each refresh. `npm test` runs the tests and `npm run smoke` draws every
contest in a browser, from a built site.

### Running RCTab

`compare_rctab.mjs` compares the page's tabulator with RCTab v2.1.0 on the raw CVR. Get `rctab_v2.1.0_Linux_X64.zip` from
https://github.com/BrightSpots/rcv/releases, check it against the release's sha512, and extract it to `RCTAB_DIR`. Then, for each
year, with `CVR_DIR` the raw CVR and `EXTRACTED_DIR` the same CVR through `extract_cvr.py`:

```bash
python3 -I prepare_rctab.py CVR_DIR WORK_DIR 2026-11-03    # about 7 minutes a year
nix shell nixpkgs#xvfb-run -c xvfb-run -a bash scripts/run_rctab.sh RCTAB_DIR WORK_DIR
node compare_rctab.mjs EXTRACTED_DIR WORK_DIR
```

RCTab's `--cli` mode still starts JavaFX, so it needs a display and X libraries. On NixOS, patch its JVM's interpreter as
`run_rctab.sh` says, and set the library path before the run:

```bash
export LD_LIBRARY_PATH=$(nix eval --raw --impure --expr 'let p = import (builtins.getFlake "nixpkgs") { system = "x86_64-linux"; }; in p.lib.makeLibraryPath [ p.libx11 p.libxxf86vm p.libxtst p.libxi p.libxrender p.libxext p.gtk3 p.glib p.pango p.cairo p.gdk-pixbuf p.atk p.freetype p.libGL p.zlib p.stdenv.cc.cc.lib ]')
```

A contest that already has a report is skipped, so a stopped run can resume.

## Deferred ideas

- A ballot walker: enter a ranking, see how each round reads it, and how many real ballots match
- Inactive ballots compared with the final margin
- The margin compared with ballots still out
- A head-to-head matrix
- What if a candidate is removed (`tabulate` already takes `removed`)
- A comparison with the Division's round-by-round reports, from November 18
- Filters by voting method or Ballot Measure 2 vote: built, then removed from the page. `ballots.json`'s `measures` rows still have the votes; the contest files no longer have the Ballot Measure 2 column
- Precinct-level detail (the CVR and precinct shapefile join, but the extractor only keeps districts)
