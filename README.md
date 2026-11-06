# Alaska 2026 ranked-choice explorer

An unofficial, preliminary look at Alaska's 2026 general election at
https://alaska-rcv.dummthings.dev. It projects the ranked-choice rounds in the browser, from the Division
of Elections' first choices and the rankings in its cast vote record (CVR). It isn't affiliated with the State of Alaska or the Division of
Elections.

This project is heavily AI agent assisted: Claude Code wrote much of the code and docs.

- `site/content/_index.md`: the page's text, laid out by the shortcodes in `site/layouts/_shortcodes/rcv/`.
- `site/static/rcv.js`: draws the page, with its status, tables and controls. `rcv-flow.js`, `rcv-districts.js` and
  `rcv-projection.js` draw the charts, `rcv-state.js` holds what's selected, and `rcv-dom.js` has small DOM helpers.
- `site/static/rcv-tabulate.js`: the tabulator. It, `rcv-rows.js`, `rcv-measures.js` and `rcv-uncounted.js` are shared with the
  scripts, so the two can't drift. `rcv-projected.js` projects rounds from the summary and the CVR, and `rcv-model.js` has the
  page's numbers, with no DOM or d3.
- `site/static/d3-7.9.0.min.js`: d3, self-hosted.
- `site/static/data/alaska-rcv-2026/`: the prepared data, rebuilt at each refresh.
- `docs/RULES.md`: the rules the count applies, and how they were checked, including against RCTab.
- `scripts/README.md`: how to refresh the data, the checks, and deferred ideas. `scripts/refresh.sh` runs the refresh and the
  pre-deploy check.
- `scripts/SIMULATION.md`: the simulated projection's method, assumptions and evidence.
- `tests/`: unit and fixture tests (`npm test`), and a browser check of every contest (`npm run smoke`).
  `.github/workflows/test.yml` runs them with the checks that don't need the raw CVR.
- `SOURCES.md`: the raw files behind the data, kept as GitHub Release assets.

It's a [Hugo](https://gohugo.io) site in `site/`, built into `public/` (gitignored) and served by a
Cloudflare Worker that only serves static files (`wrangler.jsonc`). The
header, footer and base styles started as copies from dummthings.dev. Terms and privacy stay on
the main site, and its `_redirects` sends the page's old URLs here.

## Preview and deploy

The toolchain comes from the flake in `nix/` (kept out of the repo root so Nix never copies the whole
working directory into the store):

```bash
nix develop path:./nix -c hugo server --source site   # http://localhost:1313
nix develop path:./nix -c wrangler dev                # builds with Hugo first; http://localhost:8787
nix develop path:./nix -c wrangler deploy             # builds with Hugo first
```

Deploying needs `CLOUDFLARE_ACCOUNT_ID` in the environment or a gitignored `.env`.

Stop either dev server when you're done.

## License

Copyright 2026 Dumm Software LLC.

- Code: [AGPL-3.0-or-later](LICENSE).
- Docs, the page's text and the prepared data in `site/static/data/`: [CC BY 4.0](LICENSE-CC-BY-4.0.txt).

These don't cover other people's work. The Division of Elections' raw files, in this repo's releases, and what they say belong
to no license here. `site/static/d3-7.9.0.min.js` is d3's, under its ISC license, and `tests/fixtures/rctab/` is RCTab's,
under MPL-2.0 (see its `NOTICE.md`).
