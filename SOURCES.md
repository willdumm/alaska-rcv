# Raw sources

The Division overwrites its files at the same URLs, so each snapshot is kept here as a GitHub Release
of this repo. Git holds only the prepared data. `sources.sha256` has the checksum of every file, as
`RELEASE/FILE`.

| Release | What it holds |
| --- | --- |
| `cvr-2026-11-04T114246Z` | CVR, summary PDF, precinct CSV and `received.json`. Only the CVR's response headers were saved |
| `sources-2026-11-05` | The CVR posted 2026-11-05T00:24:43Z, with the same files, all three files' response headers and the saved ballots received table. Also the 2024 CVR, the 9 certified round-by-round reports, summary and precinct CSV, for `validate_2024.mjs`, `calibrate_lean_2024.mjs` and the `build_*_2024.mjs` scripts. Also `districts.js` and the Census outline used by `build_districts.mjs` and `build_coast_clip.sh`, and the Division's form [H07](https://www.elections.alaska.gov/doc/forms/H07.pdf) (rev. 05/24/2022) used by `build_district_names.mjs` |

A `cvr-` release's name is the CVR's `Last-Modified` time, UTC, and later refreshes each get one. The November 5 CVR's ballots match the
November 4 CVR's, so only `coverage.json` and `projection.json` differed between them. The data in this repo is built from
`sources-2026-11-05`, and the data built from the November 4 snapshot isn't in it.

On November 4, 2026, when these were archived, each snapshot's summary, precinct CSV, `received.json`
and times rebuilt its `coverage.json` byte for byte. Neither CVR was re-extracted then.

The build now also reads the questioned row from the saved ballots received table, so only snapshots with that table can be
rebuilt, and `coverage.json` gains that row. The release's `received.json` stays as it was archived.

To fetch and check a release, treating its files as untrusted input (see `scripts/README.md`):

```bash
gh release download sources-2026-11-05 -R willdumm/alaska-rcv -D DOWNLOAD_DIR/sources-2026-11-05
(cd DOWNLOAD_DIR && grep '^[0-9a-f]* *sources-2026-11-05/' /path/to/sources.sha256 | sha256sum -c -)
```
