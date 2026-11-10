# Raw sources

The Division overwrites its files at the same URLs, so each snapshot is kept here as a GitHub Release
of this repo. Git holds only the prepared data. `sources.sha256` has the checksum of every file, as
`RELEASE/FILE`.

| Release | What it holds |
| --- | --- |
| `cvr-2026-11-04T114246Z` | CVR, summary PDF, precinct CSV and `received.json`. Only the CVR's response headers were saved |
| `sources-2026-11-05` | The CVR posted 2026-11-05T00:24:43Z, with the same files, all three files' response headers and the saved ballots received table. Also the 2024 CVR, the 9 certified round-by-round reports, summary and precinct CSV, for `validate_2024.mjs`, `calibrate_lean_2024.mjs` and the `build_*_2024.mjs` scripts. Also the Census outline used by `build_coast_clip.sh`, `districts.js`, the Division's map shapes that the proclamation's numbering was checked against, and the Division's form [H07](https://www.elections.alaska.gov/doc/forms/H07.pdf) (rev. 05/24/2022) used by `build_district_names.mjs` |
| `snapshot-2026-11-05T231900Z` | The same CVR, summary and precinct CSV as `sources-2026-11-05`, with the received table updated November 5 at 2:19 PM Alaska time, `received.json` made from it, and all four files' response headers |
| `snapshot-2026-11-07T203800Z` | The same CVR, summary and precinct CSV again, with the received table updated November 7 at 11:38 AM Alaska time, `received.json` made from it, and all four files' response headers |
| `snapshot-2026-11-08T212700Z` | The same CVR, summary and precinct CSV again, with the received table updated November 8 at 12:27 PM Alaska time, `received.json` made from it, and all four files' response headers |

Each later update gets a `snapshot-` release, named for its version: the Division's latest change, UTC, to the CVR, the summary or
the received table. So a release can hold the same CVR as the one before it, with a newer table.

The data in this repo's `versions/` directories is built from these, all with the current code.

On November 4, 2026, when these were archived, each snapshot's summary, precinct CSV, `received.json`
and times rebuilt its `coverage.json` byte for byte. Neither CVR was re-extracted then.

The build now also reads the questioned row from the saved ballots received table, and `coverage.json` gains that row. The release's
`received.json` stays as it was archived. `cvr-2026-11-04T114246Z` has no table, so its version is built with
`scripts/received-2026-11-04.json` in place of its `received.json`, which adds the questioned count from a day later (143). The page
says so on that version. That moves at most those 143 ballots between the uncounted and questioned estimates.

To fetch and check a release, treating its files as untrusted input (see `scripts/README.md`):

```bash
gh release download sources-2026-11-05 -R willdumm/alaska-rcv -D DOWNLOAD_DIR/sources-2026-11-05
(cd DOWNLOAD_DIR && grep '^[0-9a-f]* *sources-2026-11-05/' /path/to/sources.sha256 | sha256sum -c -)
```
