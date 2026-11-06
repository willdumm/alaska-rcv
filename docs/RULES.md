# Rules and verification

The rules `site/static/rcv-tabulate.js` applies, how the page projects rounds from them, and how they were checked. The page summarizes this and links here. The
Division of Elections' count is the only official one, and this isn't affiliated with it or with the State of Alaska.

## The rules

They come from [AS 15.15.350](https://www.akleg.gov/basis/statutes.asp#15.15.350), 6 AAC 25.071, and the tabulation options
printed on the Division's round-by-round reports:

- If a candidate has more than half the continuing ballots in round 1, the count stops there. Otherwise the candidate with
  the fewest votes is eliminated, one per round, until two remain. The Division's option is "Declare by threshold: False", so
  a majority in a later round doesn't stop the count. It does decide it: continuing ballots only shrink and that candidate's
  pile only grows, so no one can catch up. The page marks that round.
- A ballot goes to its highest-ranked continuing candidate. Percentages are of continuing ballots.
- A ballot stops counting at an overvote (two candidates at one rank), even if those candidates have been eliminated, or at
  two or more skipped ranks in a row. A ballot with no rankings, or whose first two ranks are skipped, is a blank.
- A rank repeating a candidate already ranked counts as a skipped rank. See below.
- Write-ins are passed over, and don't count as a skipped rank. Under 6 AAC 25.071 write-in rankings only count if the
  write-ins together are first, or second within half a percent. The CVR has no write-in names, so the page can't resolve
  them, and it warns in a contest where the rule could apply.
- A tie for last is decided by lot under AS 15.15.350(e), which only the Division can do. The page flags a tie and
  eliminates the candidate listed later as a placeholder.

Ballot measures aren't ranked, so the page shows the summary's yes and no, and its collapsed table adds them up on the CVR's ballots.

### Repeated rankings

The Division doesn't publish what it does with a ballot that ranks the same candidate twice. `rcv-tabulate.js` counts the
repeat as a skipped rank, so a repeat next to a blank rank stops the ballot. This is inferred: it's what reproduces the
certified 2024 reports exactly. RCTab has no setting for it, and passes over a repeat without counting it as skipped.

### What the CVR can't show

- The Division's description of the file, from its [2026 results page](https://www.elections.alaska.gov/election-results/e/):
  > The Cast Vote Record (CVR) contains the votes and rankings on all the election ballots that were scanned. It does not
  > include ballots that were only counted by hand. It also does not indicate the rankings that each individual write-in
  > candidate received. The CVR shows how voters ranked write-in candidates, but it does not show the names the voters wrote in.
  >
  > The CVR is a JSON file, used by the ranked-choice software to tabulate the results. The CVR is not tabulation, it is a
  > record of ballots. The division is providing the CVR to increase transparency and provide voters the data necessary to
  > confirm the results. The division cannot help voters access or analyze the data.
- The summary counts each ballot's first rank as marked, while the count's round 1 also has ballots that reach a candidate
  past a blank or write-in first rank. `scripts/check_counts.mjs` checks this on every refresh.

## Projected rounds

Later rounds in the rounds chart, the map's view after ranked choice tabulation and the page's "Current result after tabulation" card aren't a count. They estimate how the ballots
the Division has counted so far would run through the rules, because the CVR leaves out hand-counted ballots and the summary has
no rankings. `site/static/rcv-projected.js` does this in the browser:

- Round 1 is the summary's first choices, by candidate and district, without write-ins.
- A CVR ballot whose first rank is that candidate stays as it is. The summary's remaining votes are spread over ballots with the
  same first rank, in proportion: the district's Election Day ballots, or if those are under 30, all its ballots, or if those
  are under 30, the same first rank elsewhere in the race. So hand-counted ballots are assumed to rank like scanned ones with
  the same first choice. `simulate_projection.mjs` copies them the same way, as a sample.
- A ballot past a blank or write-in first rank is left out, because the summary doesn't count it as a first choice for
  anyone, though the Division's count would give it to its first ranked candidate. So round 1 equals the summary exactly, and
  `tests/projected.test.mjs` checks that for every contest. It's 3,147 votes across 42 races on the CVR posted
  2026-11-05T00:24:43Z.
- Ballots not yet counted aren't included. The simulation adds those, so the two can name different leaders.

So only a later round is an estimate. A race with one or two candidates, or a ballot measure, has no later round, and the page
tags it as the summary. A majority in round 1 is the summary's too.

Nothing can check these rounds until the Division publishes its own on November 18, 2026: the checks below cover the
tabulator on scanned ballots, which the page still shows in a collapsed table.

## Seats not on the ballot

The picker's "all seats" view of the State Senate counts the 10 seats elected in 2024, B, D, F, H, J, L, N, P, R and T, for their
holders, from the Division's 2024 CVR (`scripts/build_holdovers.mjs`). A seat can change hands between elections, so that was
checked by hand on November 5, 2026, against [Wikipedia's Alaska Senate page](https://en.wikipedia.org/wiki/Alaska_Senate),
which showed the same 10 holders and parties and no change among them. The legislature's own site couldn't be reached then, so
that's not a primary source. Recheck it before relying on this.

## Verification

None of these show that 2026 will match the Division's count. The Division publishes no 2026 rounds until November 18, 2026.

**Certified 2024 reports.** `scripts/validate_2024.mjs` runs the page's tabulator over the 2024 CVR and compares it with all 9
of the Division's certified round-by-round reports: 0 differences.

**RCTab.** [RCTab](https://github.com/BrightSpots/rcv) v2.1.0 is a separate open source tabulator. `scripts/prepare_rctab.py`,
`run_rctab.sh` and `compare_rctab.mjs` run it on the raw CVR, in every contest with at least two candidates, and compare every
round, which checks `extract_cvr.py` too. The comparison exits with an error unless every difference is explained by the
repeated-ranking rule above.

| CVR | Contests | Rounds | Match as is | Differ only through repeated rankings | Differ otherwise |
| --- | --- | --- | --- | --- | --- |
| 2026, posted 2026-11-05T00:24:43Z | 45 | 75 | 39 | 6 | 0 |
| 2024 general | 41 | 64 | 35 | 6 | 0 |

Those differences are small: at most 21 votes for one candidate in one round in 2026, and 9 in 2024. In 2024, our side of each
one is what matches the certified reports.

RCTab's setup differs from the Division's in ways the comparison needs: it continues to two candidates even after a first-round
majority, passes over the write-in as an excluded candidate, and breaks ties by candidate order. `prepare_rctab.py` lists them.

**Vote totals.** `scripts/check_counts.mjs` compares the CVR's first-rank marks with the Division's summary per contest,
candidate and district. They can't exceed the summary, and must equal it in fully scanned districts.

**Tests.** `tests/tabulate.test.mjs` runs the rules on small ballots, and `tests/fixtures.test.mjs` runs RCTab's own test
fixtures (MPL-2.0, see their NOTICE). `tests/smoke.mjs` draws every contest in a browser.
