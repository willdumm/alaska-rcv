# Write-ins and round 1: plan

A plan, now built but for item 9: items 1 and 6–8 as written, and items 2–5 as changed in "Shown before round 1"
below. `RULES.md` has the rules as the page applies them now.

The page counts every race the way AS 15.15.350(d) says: each ballot is "one vote for the highest-ranked continuing
candidate", and a candidate with "more than one-half of the active ballots" wins. Where the Division of Elections reports
something different, the page shows the Division's numbers too, labelled as the Division's, and says how they differ.

Small caveats, a few ballots per race or details of past counts, go in `RULES.md`, not on the page, so the page stays
clear.

## What the Division publishes

- **The summary and the Statements of Votes Cast** have each candidate's first-rank marks, with write-ins on their own
  line and percentages of all votes, write-ins included. That's every race, including those that go to rounds: "The
  Summary Report only shows 1st Choice results from Round 1." They count each ballot only for its first rank, so a ballot
  that ranks a write-in or nothing first, and a candidate next, counts for no candidate. The summary has write-ins only by
  contest, not by district.
- **The round-by-round reports**, for races that go past round 1, count each ballot for its highest-ranked candidate.
  Write-ins are passed over, so those ballots count for the candidate they rank next, and there's no write-in line.
- **Which races get rounds.** The reports' option is "Votes to include in threshold calculation: Continuing ballots per
  round". `validate_2024.mjs` decides the same way, a majority of round 1's continuing ballots, and matches every 2024
  report.
- **Write-ins** are passed over unless they're first or a close second in first choices. The 2026 media packet's test is
  (leader − write-ins) / (leader + write-ins) < 0.5%.

The Division doesn't say which count certifies a race without rounds: first choices or round 1. No race in 2024, or so
far in 2026, has had a different winner under the two.

### Hand-counted ballots

Hand-count precincts phone in first choices on election night. Their ballots are mailed to Juneau and scanned into the
CVR, and the Division's rounds are run on the CVR. Most arrive. In 2024, every precinct in House District 38 is in the final
CVR with exactly its Statement of Votes Cast's ballots, hand-counted villages included, except Chevak (all 128 missing) and
Tuluksak (75 of 78 missing). The district's round 1 equals `tabulate` on the CVR, so those 203 ballots are in its first
choices and not in its rounds. In 2022, six villages' ballots, 259 voters, missed certification because the mail didn't
deliver them in time.

So hand-counted ballots normally end up in the count, and the page keeps estimating their later rankings from scanned
ballots like them. The villages left out of past counts are a caveat for `RULES.md`.

## What's wrong now

On the CVR posted 2026-11-15T00:46:37Z:

- **Round 1 leaves out ballots.** `rcv-projected.js` drops ballots that rank a write-in or leave first blank and then rank
  a candidate, so round 1 equals the summary without write-ins. The law and the Division count them.
- **Senate District C stops a round early.** On the summary without write-ins, Stutes has 6,782 of 13,563, 50.004%, so the
  page finds a majority. Round 1 counted correctly gives her 6,806 of 13,633, 49.92%: Harris is eliminated, and Stutes
  finishes with 7,219. The race is fully scanned, so this is exact. The winner is the same.
- **Two-candidate races show first choices, not the count.** House District 6 and 24 are fully scanned:

  | Race | First choices | Write-ins | Round 1 under the law |
  | --- | --- | --- | --- |
  | House District 6 | 4,826 to 4,813, margin 13 | 11 | 4,828 to 4,822, margin 6 |
  | House District 24 | 3,674 to 3,697, margin 23 | 99 | 3,689 to 3,719, margin 30 |

  Neither changes leader. House District 6 gets no "Not settled" warning, because that check skips races without rounds.
- **U.S. Senator is on the line.** Peltola has 50.10% of the summary without write-ins, 49.94% with them, and about 50.0% of
  round 1 counted correctly, a majority by a few hundredths of a point. Round 1, not first choices, decides whether there
  are rounds.
- **The write-in check** (`rcv.js:117`) divides by all candidates plus write-ins, not the leader plus write-ins.
- **Write-ins aren't shown.** The page says "without write-ins" and never gives the number.

## The change

One rule for every race: rounds as the law counts them, starting from round 1. First choices are the Division's summary.

1. **Round 1** (`rcv-projected.js:29-30`). Keep every CVR ballot whose first rank isn't a candidate as it is, instead of
   dropping the ones that reach a candidate. Hand-counted first choices are spread as now. Round 1 is then the summary's
   first choices plus the scanned ballots the law moves, exact wherever every ballot was scanned. The majority check then
   uses this round 1, which fixes Senate District C. Hand-counted write-ins, the summary's write-ins less the CVR's ballots
   with a write-in first, are shared among districts by their hand-counted votes for candidates and spread like any other
   first choice.
2–5. **Superseded** by "Shown before round 1" below. As first planned: two-candidate races showed round 1 with the
   Division's first choices in the text and no majority label; the first tile, the map and the district table showed round
   1; the drill-down's first level was the Division's first choices with a gray Write-in line; and the all-seats view stayed
   on shares of votes for candidates.
6. **The write-in check.** One tested function with the Division's formula, used by the warning.
7. **The collapsed scanned-ballots table.** Rename Blank to "No candidate ranked", which includes ballots that rank only
   write-ins, as in the Division's reports. Its note says it's scanned ballots only, counted as the law counts them.
8. **Words.** The count intro, including the one-candidate one, and `_index.md`'s methods get a write-ins bullet: "In the
   count, a ballot that ranks a write-in or nothing first counts for the next candidate it ranks, as the law says. The
   Division's first choices count it for no candidate, so the count's round 1 has a few more votes." Rewrite `RULES.md`'s
   write-in rules and its "Projected rounds" section (round 1, the two-candidate tag, the majority, the 3,147 figure) with
   this, and add the caveats below. The page's write-ins bullet later moved to `RULES.md`, as too detailed for the page.
9. **The simulation.** `simulate_projection.mjs:90,102,112` took hand-counted ballots as summary first choices less
   the CVR's round 1, so moved ballots were subtracted from them (426 across 45 races on the 2026-11-05 CVR), and copied
   their rankings from ballots with the same round 1 candidate. Use the CVR's first-rank marks instead, as `rcv-projected.js`
   does, add hand-counted write-ins the same way, and record each race's Write-in or blank group by district for the
   all-seats view. Its "Won on first choices" becomes "Won in round 1" (`rcv-projection.js:35`), and `SIMULATION.md`'s "The
   floor on hand-counted ballots" section and its "first choices" labels change to match, in a separate commit with each
   version's `projection.json` regenerated.

### Shown before round 1

After seeing items 2–5, the page changed to show write-in and blank first choices being reassigned:

- Ballots that rank a write-in first, or leave the first rank blank and rank a candidate later, form one "Write-in or blank"
  group (`firstChoices` in `rcv-model.js`). They're reassigned to the candidate they rank highest before round 1, and
  those that rank no candidate stop counting. Round 1's majority check comes after.
- "First choices" everywhere are candidates' first ranks and that group, as shares of all of them, not reassigned: the
  first card, the first column of the chart and table, the map's first view, and the drill-down's first level, where the
  group is clickable. The table keeps the group's row last, since write-ins go out before round 1 (6 AAC 25.071).
- A "Current result" card: who wins in round 1 or after tabulation, from the count stopped where Alaska's would. With a
  district selected, who leads.
- Two-candidate races mark round 1's majority in the chart and the table.
- The picker's all-seats view will add each race's group to its totals, from the simulation's output (item 9).

### Caveats for `RULES.md`

- Hand-counted ballots that leave the first rank blank and rank a candidate later are left out, since the summary counts
  them as undervotes. Hand-counted write-ins are in.
- In 2024, Chevak's and Tuluksak's ballots weren't in House District 38's rounds, and in 2022 six villages' ballots missed
  certification.
- The Division doesn't report write-ins by district, so a district's group is its CVR ballots plus its estimated share of
  the contest's hand-counted write-ins.
- A ballot with a write-in first and an overvote next is counted among those that rank no candidate.
- The scanned-ballots table can differ from first choices even where every ballot was scanned, because it counts as the law
  does.

### Old versions

Each version in `versions/` is data only, and every version runs today's code, as the page says. Every version's
`coverage.json` already has each race's write-in total, so all of the above works on every version with no rebuild. A race
can change between versions: Senate District C had a majority on the summary in some earlier versions.

### Tests

- `tests/projected.test.mjs`: round 1 equals `tabulate` on the CVR in fully scanned districts, each candidate's first
  choices equal the summary, hand-counted write-ins are shared between districts by hand-counted votes, and `firstChoices`
  reads each kind of first rank, keeping every ballot that's in round 1 or set aside.
- `tests/districts.test.mjs`: districts' first choices, with the group, add up to the contest's.
- `tests/flow.test.mjs`: the story of the reassignment.
- The write-in formula at its edges, and Senate District C's two rounds.

## Not doing

- Per-district write-ins from the precinct CSV. Ballots less votes, undervotes and overvotes is close for statewide
  races but wrong for district ones (64 against 11 in House District 6), since a district's ballots include ones without
  the race.
- Treating undervotes as blank first ranks. Most are ballots with no ranking at all.
- Deciding rounds by first choices with write-ins. The Division decides by round 1.
- A warning when round 1's leader is near half. Round 1 is exact but for a few ballots, and the simulation already shows
  how often round 1 decides a race.

## After November 18, 2026

Compare the Division's round-by-round reports with the page's rounds, and its Statements of Votes Cast with first
choices. Check whether the final CVR has every hand-counted precinct, and name any that it doesn't.
