# Rules and verification

The rules `site/static/rcv-tabulate.js` applies, how the page projects rounds from them, and how they were checked. The page summarizes this and links here. The
Division of Elections' count is the only official one, and this isn't affiliated with it or with the State of Alaska.

## The rules

They come from [AS 15.15.350](https://www.akleg.gov/basis/statutes.asp#15.15.350), 6 AAC 25.071, and the tabulation options
printed on the Division's round-by-round reports:

- If a candidate has more than half the continuing ballots in round 1, the count stops there. That's round 1 counted as
  below, not first choices: the reports' option is "Votes to include in threshold calculation: Continuing ballots per round",
  and `validate_2024.mjs` decides the same way. Otherwise the candidate with the fewest votes is eliminated, one per round,
  until two remain. The Division's option is "Declare by threshold: False", so
  a majority in a later round doesn't stop the count. It does decide it: continuing ballots only shrink and that candidate's
  pile only grows, so no one can catch up. The page marks that round.
- A ballot stops counting at an overvote (two candidates at one rank), even if those candidates have been eliminated, or at
  two or more skipped ranks in a row. A ballot that ranks no candidate, only write-ins or nothing, or whose first two ranks are skipped, is a blank.
- A rank repeating a candidate already ranked counts as a skipped rank. See below.
- A ballot is "one vote for the highest-ranked continuing candidate" (AS 15.15.350(d)), in round 1 too. Percentages are of
  continuing ballots. Write-ins aren't candidates in the count, so a ballot that ranks a write-in or nothing first is
  reassigned to the next candidate it ranks, before round 1's majority check. A write-in rank isn't a skipped rank, and an
  overvote with a write-in in it is still an overvote: the Division's 2026 media packet says both. The Division's
  round-by-round reports count the same way, with no write-in line: `validate_2024.mjs` matches round 1 of all 9 certified
  2024 reports exactly, and matches which of the 41 contests went to rounds.
- Write-in rankings only count if the write-ins together are first, or a close second, in first choices. Otherwise they're
  all defeated, before round 1. This is a regulation, [6 AAC 25.071](https://www.law.cornell.edu/regulations/alaska/6-AAC-25.071):
  the board first counts the ballots with a write-in ranked highest, and if that's fewer than the leading candidate's
  first-round votes by at least 0.5% of the two together, "all write-in candidates are defeated. Otherwise, the division
  shall conduct the tabulation under AS 15.15.350 with each valid write-in candidate as an individual candidate." So
  defeated write-ins aren't continuing candidates when AS 15.15.350(d) counts round 1, and a ballot ranking only write-ins
  is inactive, out of the "active ballots" a majority is measured against. The test is
  (leader − write-ins) / (leader + write-ins) < 0.5%, as the Division's 2026 media packet also puts it: `writeInsMatter` in `rcv-model.js`. The CVR has no write-in names,
  so the page can't resolve them, and it warns in a contest where the rule applies. Since write-ins go out first, the
  page's table keeps its Write-in or blank row last.
- A tie for last is decided by lot under AS 15.15.350(e), which only the Division can do. The page flags a tie and
  eliminates the candidate listed later as a placeholder.

Ballot measures aren't ranked, so the page shows the summary's yes and no, and its collapsed table adds them up on the CVR's ballots.

### Repeated rankings

The Division doesn't publish what it does with a ballot that ranks the same candidate twice. `rcv-tabulate.js` counts the
repeat as a skipped rank, so a repeat next to a blank rank stops the ballot. This is inferred: it's what reproduces the
certified 2024 reports exactly. RCTab has no setting for it, and passes over a repeat without counting it as skipped.

Unresolved write-ins count as one candidate for this, as they do in the Division's count: a write-in ranked after a
write-in is a repeat, though the voter may have written two different names. The 2026 reports showed it. One ballot ranked
write-ins first, second and third and then a candidate, and the Division counted it as blank in U.S. Representative, Senate
District S and House District 37. Before November 19, 2026 the page passed over every write-in rank and counted that ballot
for the candidate. No 2024 ballot in a contest with a report is counted differently by the two rules.

We don't think the Division's handling is correct, and the page follows it only so that its count matches the Division's.
The CVR doesn't say whether those write-ins name one person or several, and under 6 AAC 25.071 defeated write-ins aren't
candidates in the count at all, so the ballot's three write-in ranks should be passed over, the way a single write-in rank
is, and it should count for the candidate it ranks next. If this ballot decided a race, the page's count would be wrong.

### The Division's 2026 reports

On November 18, 2026 the Division posted 15 unofficial round-by-round reports, from the CVR posted 2026-11-19T02:57:53Z, the
first with every ballot scanned. `validate_2024.mjs` (which takes any year's reports) matches every number in every round of
all 15. One difference is left, in where the count stops. In Senate District C, Stutes has 7,365 of 14,653 continuing ballots
(50.26%) in round 1, a majority under AS 15.15.350, so the page stops there. The Division's report, with "Declare winners
by threshold: False", goes on to eliminate Harris and elects Stutes in round 2. The winner is the same. The Division posted
reports for Senate District C and House District 24, which have a round 1 majority only once write-in and blank first
choices move to their next candidate, and none for any other contest with a round 1 majority.

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

Later rounds in the rounds chart, the map's view after ranked choice tabulation and the page's "Current result" card aren't a count. They estimate how the ballots
the Division has counted so far would run through the rules, because the CVR leaves out hand-counted ballots and the summary has
no rankings. `site/static/rcv-projected.js` does this in the browser:

- Each candidate's first choices are the summary's, by district. A CVR ballot whose first rank is that candidate stays as it
  is. The summary's remaining votes, mostly hand-counted ballots, are spread over ballots with the same first rank, in
  proportion: the district's Election Day ballots, or if those are under 30, all its ballots, or if those are under 30, the
  same first rank elsewhere in the race. So hand-counted ballots are assumed to rank like scanned ones with the same first
  choice. `simulate_projection.mjs` copies them the same way, as a sample, by each ballot's first rank as marked.
- A CVR ballot whose first rank isn't a candidate stays as it is too, so one that ranks a write-in or nothing first is
  reassigned to the next candidate it ranks, as the rules above say. Round 1 is the summary's first choices plus those
  ballots: 5,352 votes across 53 races on the CVR posted 2026-11-15T00:46:37Z. `tests/projected.test.mjs` checks that each
  candidate's first choices equal the summary in every contest and district, and that round 1 equals the CVR's own round 1
  wherever every ballot was scanned.
- Hand-counted write-ins are the summary's write-ins less the CVR's ballots with a write-in first. The summary has write-ins
  by contest only, so they're shared among districts in proportion to each district's hand-counted votes for candidates, and
  then spread over ballots with a write-in first like any other first choice. The simulation adds them too, in whole
  ballots. On the CVR posted 2026-11-17T02:41:03Z there
  are none; on the earliest, 2026-11-04T11:42:46Z, 215 across 12 races, at most 49 in one.
- Ballots not yet counted aren't included. The simulation adds those, so the two can name different leaders.

So round 1 is exact but for the caveats below, and only a later round is an estimate. Whether a race goes to rounds is
decided on this round 1, as the Division decides it. On the CVR posted 2026-11-15T00:46:37Z, Stutes has 6,782 of the 13,563
votes for candidates in the Division's summary of Senate District C, 50.004%, but 6,806 of 13,633 in round 1, 49.92%: Harris
is eliminated, and Stutes finishes with 7,219.

### First choices

The page's first choices are each ballot's first rank as marked: each candidate's, and one Write-in or blank group for
ballots that rank a write-in first, or leave the first rank blank and rank a candidate later. Percentages are of all of
these together, before the group is reassigned. A ballot with a blank first rank and no candidate after it isn't in them.
They're the first card, the first column of the rounds chart and table, the map's and district table's "First choices"
view, and the first level of the ballot rankings, headed "N ballots counted", where Write-in or blank opens to show who
those ballots rank next. The picker's "all seats" view, which loads no ballots, takes each race's Write-in or blank group
by district from `projection.json`, worked out the same way.

The Division's percentages differ a little: its total has write-ins, but not ballots with a blank first rank, which the
summary counts as undervotes. Where a share rounds to 50.0% without being half, the page gives it to two or three decimals,
so it's clear which side of half it's on.

The "Current result" card is the count stopped where Alaska's would stop: "wins in round 1" with a round 1 majority,
otherwise "wins after tabulation". With one district selected it says "leads", since a district doesn't decide a race.

A race with one or two candidates has no later round, so its count is first choices and round 1. The page tags it as from
the Division's results, since it's computed from them rather than being them. With two candidates the chart and the table
both mark round 1's majority, and the "Not settled" warning applies when the gap is under the ballots left. With one
candidate round 1 decides it, and nothing is marked. A ballot measure isn't ranked, so its count is the summary's yes and
no, tagged as the Division's results.

Nothing can check these rounds until the Division publishes its own on November 18, 2026: the checks below cover the
tabulator on scanned ballots, which the page still shows in a collapsed table. That table counts as the rules above do, so its
"No candidate ranked" line includes ballots that rank only write-ins, as in the Division's reports.

### Caveats

These are too small or too detailed for the page.

- Hand-counted ballots that leave the first rank blank and rank a candidate later are left out: the summary counts them as
  undervotes, so nothing shows they exist. Hand-counted write-ins are in, as above.
- A ballot with a write-in first and an overvote next stops at the overvote. The page's text counts it among the
  ballots that "rank no candidate", and its table among those that stopped counting, not as an overvote.
- Hand-counted ballots are mailed to Juneau and scanned into the CVR, and the Division's rounds are run on the CVR, so most
  end up in the count. Not all: in 2024, Chevak's ballots (all 128) and 75 of Tuluksak's 78 weren't in House District 38's
  rounds, though they were in its first choices, and in 2022 six villages' ballots, 259 voters, missed certification because
  the mail didn't deliver them in time. The page counts every hand-counted ballot in round 1.
- The Division doesn't report write-ins by district, so a district's Write-in or blank group is its CVR ballots plus its
  share of the contest's hand-counted write-ins, estimated as above. It's exact wherever every ballot was scanned.
- The scanned-ballots table can differ from first choices even where every ballot was scanned, because it counts as the law
  does.
- The Division doesn't say which count certifies a race without rounds, first choices or round 1. No race in 2024, or so far
  in 2026, has had a different winner under the two.

## Seats not on the ballot

The picker's "all seats" view of the State Senate counts the 10 seats elected in 2024, B, D, F, H, J, L, N, P, R and T, for their
holders, from the Division's 2024 CVR (`scripts/build_holdovers.mjs`). A seat can change hands between elections, so that was
checked by hand on November 5, 2026, against [Wikipedia's Alaska Senate page](https://en.wikipedia.org/wiki/Alaska_Senate),
which showed the same 10 holders and parties and no change among them. The legislature's own site couldn't be reached then, so
that's not a primary source. Recheck it before relying on this.

## Verification

The 2026 reports themselves are compared under "The Division's 2026 reports" above. The checks below came first, while counting went on.

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
one is what matches the certified reports. Both runs predate the November 19, 2026 change that counts a write-in after a
write-in as a repeat, and the final 2026 CVR hasn't been run through RCTab.

RCTab's setup differs from the Division's in ways the comparison needs: it continues to two candidates even after a first-round
majority, passes over the write-in as an excluded candidate, and breaks ties by candidate order. `prepare_rctab.py` lists them.

**Vote totals.** `scripts/check_counts.mjs` compares the CVR's first-rank marks with the Division's summary per contest,
candidate and district. They can't exceed the summary, and must equal it in fully scanned districts.

**Tests.** `tests/tabulate.test.mjs` runs the rules on small ballots, and `tests/fixtures.test.mjs` runs RCTab's own test
fixtures (MPL-2.0, see their NOTICE). `tests/smoke.mjs` draws every contest in a browser.
