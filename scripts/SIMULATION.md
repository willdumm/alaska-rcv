# Alaska RCV explorer: the simulated projection

How the page's simulation section is made, why it's made that way, and what it can't tell you. The page's
section says what it assumes in brief. `refresh.sh build` runs it in the refresh sequence.

## What it's for

The CVR holds only scanned ballots that have been counted. The simulation asks what the rest could do: it fills in the
ballots still to be counted with copies of real ballots, runs the real tabulator, and repeats. The requirements are:

- Simulate each race 100 times, locally, and store the result as a static file.
- Every simulated ballot is a real ranking from the CVR, and every simulation goes through the real tabulator.
- Every number on the page regenerates from a committed, seeded script.
- Show how often each candidate wins a simulation, plus one dot per simulation, on separate lines for wins on first choices and wins after tabulation.
- Report a share of simulations, never a chance of winning.

## Files

| File | Role |
|---|---|
| `simulate_projection.mjs` | The simulation. Writes `site/static/data/alaska-rcv-2026/projection.json` |
| `site/static/rcv-tabulate.js` | The tabulator, shared with the page and checked against 2024 by `validate_2024.mjs` |
| `site/static/rcv-uncounted.js` | Uncounted and questioned estimates and the turnout ratio, shared with the page so they can't drift |
| `site/static/rcv-measures.js` | Turns ballot measures into two-"candidate" contests, shared with the page |
| `build_early_absentee_2024.mjs` | `early-absentee-2024.json`: each district's 2024 early and absentee ballots |
| `build_questioned_2024.mjs` | `questioned-2024.json`: each district's 2024 questioned and Election Day ballots |
| `build_holdovers.mjs` | `holdovers.json`: the State Senate seats not on the 2026 ballot, from the 2024 CVR |
| `calibrate_lean_2024.mjs` | Prints the 2024 evidence for the lean and the small-pool backtest. Writes nothing |
| `site/static/rcv-projection.js` | Draws the table and plot |

## Running it

```bash
node simulate_projection.mjs site/static/data/alaska-rcv-2026 site/static/data/alaska-rcv-2026/projection.json \
  --runs 100 --seed 20261104 --tau 0.2 --tau-local 0.28 --tau-party 0.2 --min-pool 300 --min-bucket 30
```

It takes about 30 seconds and needs `ballots.json`, `contest-*.json`, `coverage.json`, `early-absentee-2024.json`,
`questioned-2024.json` and `holdovers.json` in the data directory. Every flag is required. Any CVR refresh needs a rerun, and the page warns
"Out of date" if `projection.json` was made from a different CVR file.

| Flag | Value | Meaning |
|---|---|---|
| `--runs` | 100 | Simulations per race |
| `--seed` | 20261104 | Base seed. Each contest's generator starts from `seed ^ imul(id, 0x9e3779b1)`, so races don't depend on each other |
| `--tau` | 0.2 | Standard deviation of the lean in statewide races and ballot measures |
| `--tau-local` | 0.28 | The same in State House and Senate races |
| `--tau-party` | 0.2 | The part of a State House or Senate Republican's or Democrat's lean shared with their party in that simulation. See "Whole chambers" |
| `--min-pool` | 300 | Smallest pool to draw uncounted or questioned ballots from |
| `--min-bucket` | 30 | Fewest ballots to copy a hand-counted first choice's later rankings from |
| `--hand-only` | off | Adds only hand-counted ballots and stops with an error unless each first round has exactly the votes the simulation meant to add. This checks its arithmetic, not the data: `check_counts.mjs` compares the CVR with the summary. Use a throwaway output |

## The floor on hand-counted ballots

The summary counts each ballot's first rank as marked, but the count's round 1 also has ballots that reach a candidate past a blank or write-in first rank. So round 1 can exceed the summary in a district, by 3,147 votes across 42 races on the CVR posted 2026-11-05T00:24:43Z, and the hand-counted count floors those at 0. `check_counts.mjs` confirms the cause: first-rank marks alone never exceed the summary, and equal it exactly in fully scanned districts. Taking the hand-counted count from first-rank marks instead would add 426 ballots across the 45 ranked races. That isn't done, so the published simulation doesn't change.

## Which races

Every race with at least two candidates, and both ballot measures: 47 of the page's 55 contests. Single-candidate races
aren't simulated, and the page says so. Each simulation is always of the whole contest, whatever district the page has
selected.

## One simulation

Each race gets its own generator. Each simulation draws one lean per candidate, then does this for each house district
on the contest:

1. **Resample.** Bootstrap the district's Election Day ballots and its early and absentee ballots, with replacement.
2. **Hand-counted ballots.** Add the ballots below, with no lean.
3. **Uncounted early and absentee ballots.** Draw a count, then draw that many ballots with the lean.
4. **Questioned ballots.** Draw a count, then draw that many ballots with the lean.

The CVR's own ballots are added as they are, then the whole set goes through `tabulate`.

| Ballots | How many | Copied from |
|---|---|---|
| CVR | All | Not copied, and not resampled |
| Hand-counted | Per candidate and district: summary minus CVR first choices, floored at 0 | That district's resampled Election Day ballots with the same first choice. Under `--min-bucket`, its early and absentee ones too, then the same first choice elsewhere in the race |
| Uncounted early and absentee | The estimate below, redrawn each simulation | The district's resampled early and absentee ballots, filled up to `--min-pool` |
| Questioned | The estimate below, redrawn each simulation | The district's resampled Election Day and hand-counted ballots, filled up to `--min-pool` |

Filling from elsewhere in the race only happens in multi-district races. A single-district race with a short list keeps
it, unless it's empty. A candidate with hand-counted votes and no CVR ballots at all is an error.

### Estimated counts

**Uncounted.** The Division publishes ballots received only statewide, and no count of uncounted ballots. The statewide estimate
is the ballots received, less the table's questioned row, minus the early and absentee ballots in the CVR. Each district's expected
final count is that received total, less the same row, times its 2024 share of early and absentee ballots. Taking off what the summary has counted there, floored at 0, and scaling
so the districts add to the statewide number gives its estimate. Nothing is floored at present, so the scale is exactly 1.

From the Division's table of November 4, 11:37 AM, that's 110,404 received, less 143 questioned and 58,592 in the CVR, or 51,669:
20,149 early (70,261 less 50,112) and 31,520 absentee (fax, mail, online, in-person and special needs, 40,000, less 8,480). The
questioned row is left out so those ballots aren't counted twice, as the estimate below already covers them. It doesn't allow for ballots the Division later rejects, or for ballots yet to arrive: 19,557 issued ballots hadn't
been returned. If the summary has more early or absentee ballots than the CVR, the summary's count comes off instead.

**Questioned.** The Division hasn't given a full count. Its ballot table listed 143 received on November 4, against 11,031
in the 2024 CVR, with its questioned board starting review on November 5, so that's not used. Each district gets its 2024 count times the turnout ratio,
less any questioned ballots already in the CVR or ahead of it in the summary, since those are among the hand-counted ones. The ratio is the geometric mean of 2026 over 2024 Election Day ballots, in
districts with nothing counted by hand: 0.867 at present. Precincts yet to report could make it a bit low.

Statewide races and measures use the U.S. Representative count, 11,031 in 2024. State House and Senate races use the State
House count, 4,041. Questioned voters probably often vote outside their district, so only their statewide races count,
though the data doesn't say why. Using the statewide count locally would be about 2.7 times too high. Senate races use the
House count because 2024's Senate races were in other districts.

**Variation.** Each simulation draws a count as Poisson with mean `estimate * exp(N(0, sdLog))`. `sdLog` is how far
districts strayed from the typical turnout ratio: 0.069 at present.

### The lean

The lean says uncounted ballots might not vote like the ballots they're copied from.

- Each simulation draws `z ~ Normal(0, tau)` per candidate. It's the same in every district of the race. In State House and
  Senate races a Republican's or Democrat's `z` is partly shared: see "Whole chambers".
- In each uncounted or questioned pool, each candidate's first-choice ballots are weighted by `exp(z)`, then rescaled so
  blanks and overvotes keep their share.
- Hand-counted ballots don't lean, because their first choices are known.
- A pool with no ballots for a candidate can't lean to them. `noLeanTargetPerRun` counts those.

A tau of 0.2 moves a 50-50 race by about 7 points. Two independent leans move one candidate's share by about
`25 * sqrt(2) * tau` points.

**The mean is zero.** The 2024 absentee misses below went the same way in both statewide races. Most
uncounted ballots are probably absentee, and the pool they're drawn from is mostly early ballots, so if 2026 repeats that
pattern, Democrats would gain more than the simulation shows. The simulation doesn't assume that: it's
two related races in one election, and questioned ballots missed the opposite way.

### Evidence from 2024

`node calibrate_lean_2024.mjs EXTRACTED_2024_DIR` predicts 2024's ballots the way the simulation predicts 2026's, from the
same district's other ballots:

| Predicting | Race | Finalists' share missed by | Implied tau |
|---|---|---|---|
| Absentee from same-district early | President | 7.1 points toward Harris | 0.20 |
| | U.S. Representative | 6.8 toward Peltola | 0.19 |
| Questioned from same-district Election Day | President | 7.0 toward Trump | 0.20 |
| | U.S. Representative | 3.9 toward Begich | 0.11 |

The lean uses 7 points, from the absentee misses, which is tau 0.2 for statewide races and measures. Across all 41 of 2024's
contests with at least 300 such ballots, absentee from early misses by 10.7 points rms, or tau 0.30, though most of those
are small legislative races. The 31 State House races among them miss by 10.8 points rms, 10.0 beyond sampling noise, or
tau 0.28, which is why local races use it.

## Small districts

Some rural districts have almost nothing in the CVR because their ballots are counted by hand. House District 37 has 82
CVR ballots against about 2,700 counted by hand, and House Districts 38 to 40 and Senate S have a milder version. So:

- **`--min-pool 300`** fills a short pool from the district's other ballots, including hand-counted ones, whose first choices
  are published. 300 keeps sampling noise to about 3 points on a 50-50 split. The calibration script backtests this on the 6
  State House races it can: rms miss 10.0 points alone, 8.6 filled up, better in 4 and worse in House Districts 38 and 39.
  That's weak evidence.
- **`--min-bucket 30`** fills up the rankings copied for a hand-counted first choice from the same first choice across the
  race. See "Where copied rankings come from".
- **Varying counts and a larger local lean**, described above.
- **A warning on the page** when under half of a race's simulated ballots are CVR ballots (`LOW_RANKINGS` in `rcv-projection.js`).

These don't invent rankings. House District 37's later rankings still rest on 15 to 24 CVR ballots per candidate, so its
transfers remain nearly a guess, and its win counts are probably too confident. Widening them further would take made-up
rankings as a weak prior, which breaks the "only real ballots" rule, so it wasn't done.

## Where copied rankings come from

A hand-counted ballot has a first choice and no rankings, so it copies them from CVR ballots with the same first choice. The
question only arises in races spanning several districts: a single-district race has no ballots elsewhere. Both the page and
the simulation use the district's ballots when it has at least `--min-bucket` (30) of them. Below that, the page uses every
ballot in the race with that first choice, and the simulation keeps the district's and fills the shortfall from them. Those
race-wide ballots include the district's own.

`compare_rank_sources.mjs` tests this on the 2026 and 2024 CVRs, using real Election Day ballots as the truth. Each source
predicts them from a sample of n ballots in the district, from the other districts, or from a blend with weight k on the other
districts. Its arguments, run for seeds 1 and 2 with both extracted CVR directories:
`--seed S --draws 200 --sizes 10,20,30,50,100,200 --blend 10,30,100,300 --min-truth 30`.

Error in the share reaching a finalist, in points, with the truth's own noise removed, seed 1. Seed 2 moves these by at most 0.3.

| Truth compared with | CVR | n | District | Race | Blend, k=100 |
|---|---|---|---|---|---|
| Other Election Day ballots, all districts | 2026 | 30 | 7.4 | 4.7 | 4.0 |
| | 2026 | 100 | 3.9 | 4.7 | 3.1 |
| | 2024 | 30 | 7.8 | 5.4 | 4.5 |
| | 2024 | 100 | 4.2 | 4.3 | 3.0 |
| Early and absentee ballots, all districts | 2026 | 30 | 8.3 | 3.9 | 3.7 |
| | 2026 | 200 | 5.2 | 3.0 | 3.4 |
| | 2024 | 30 | 8.5 | 4.5 | 4.4 |
| | 2024 | 200 | 3.5 | 1.9 | 2.7 |
| Other Election Day ballots, House Districts 37 to 40 | 2026 | 30 | 7.7 | 14.6 | 11.4 |
| | 2024 | 30 | 7.8 | 11.0 | 8.7 |

- Among ballots of the same kind, the district's sample beats the race at about n=100, and a blend beats both.
- Early and absentee ballots never beat the race as a source for Election Day ballots, even at n=200.
- The rural districts go the other way: they're far from the race, so even a small district sample beats it. These rows rest on
  31 and 27 cells.
- This can't test what matters most in those districts: whether hand-counted ballots resemble scanned ones in the same place.

So the rule stays as it is. A blend would be more accurate in most of these comparisons, but it isn't used.

## Whole chambers

The picker's "all seats" views count seats per simulation, by party registration, so simulation 7's seat count takes simulation
7 of every race. `projection.json` has no separate run for this: `seatsPerRun` in `site/static/rcv-chambers.js` adds up each
race's winners, so a race's own page and its chamber's seat count come from the same simulations.

Seats only add up meaningfully if a party's good night shows in every race at once. So each simulation draws one lean for all
Republicans and one for all Democrats, in both chambers, as `Normal(0, tau-party)`. Each such candidate's lean is that plus
their own `Normal(0, sqrt(tau-local^2 - tau-party^2))`, so it still has sd `tau-local`, and a single race's spread doesn't change
much. Nonpartisan and minor-party candidates have no party to share with, so they keep `tau-local` as their own. Statewide
races and measures don't use it, so their simulations don't change.

`tau-party` is 0.2 because a statewide race's miss is as close as 2024 gets to a shared party lean: see the table above. That is
an assumption, not a measurement of how much State House misses share. A bigger value spreads the seat counts further.

- **Seats not on the ballot.** The 10 State Senate seats elected in 2024 count for their holders in every simulation.
  `build_holdovers.mjs` takes each holder and registration from the Division's 2024 CVR. It can't see a change since, so that
  was checked by hand: see `docs/RULES.md`.
- **Races with one candidate** count for that candidate every time, so a write-in win isn't possible here.
- **A race tied in a simulation** counts for no party, in a "tied" column.
- **On the page.** The seats table gives each party's median and spread. Below it, the up to 5 seat splits seen most often show
  how the parties' counts go together, since a run's counts aren't independent. Each is one simulation's seats for all the parties.
- **Party isn't control.** Alaska's chambers have often been run by bipartisan coalitions. The page says so, and doesn't call a
  party's seat count a majority of anything but seats.

## What it leaves out

- Ballots yet to arrive, and precincts yet to report.
- Uncertainty between districts: they're a fixed set, so the simulation doesn't resample across them.
- Later rankings shifting on their own. The lean only changes first choices, and later rankings come along with the copied
  ballot.
- Write-in resolution: the CVR has no write-in names.
- Ties for last are broken the tabulator's placeholder way. A simulation ending in a tie has no winner and isn't drawn.
- Overseas absentee voters, House District 99, aren't on non-federal contests, so their estimated ballots aren't placed in
  those races. Statewide races record them as `notOnBallot`.

With 100 simulations, a win count near 80 has a standard error of about 4. A different seed has moved results by several
wins, so small shifts mean nothing.

## Output

`projection.json` has no timestamps, so the same inputs give a byte-identical file:

```
{
  parameters: { runs, seed, tau, tauLocal, tauParty, minPool, minBucket, turnoutScale, turnoutSdLog },
  cvrLastModified,            // compared with coverage.json by the page
  chambers: { house, senate: {
    name, seats,
    races: [ { id, name, seat, hds, candidates: [ { letter, name, party } ] } ],
    notOnBallot: [ { seat, hds, name, party, until } ],           // holdovers.json
  } },
  contests: { [id]: {
    name, tau,
    ballots: { cvr, hand, uncounted, questioned, notOnBallot },   // expected counts, rounded
    toppedUpPerRun: { hand, uncounted, questioned },              // ballots per simulation whose pool was filled up
    noLeanTargetPerRun: { [letter]: n },                          // pools per simulation with no ballots for that candidate
    runs: [ { winner, round, votes, runnerUp, runnerUpVotes, continuing } ],   // the final round of each simulation
  } }
}
```

## On the page

- **Order.** After the map and the tabulation, in a tinted box tagged "Simulated", so the page reads as first choices, then transfers, then the ballots still to come. The rounds cover only ballots counted so far, so they can name a different leader, and the page says so. The line of numbers at the top gives the selected contest's largest win count.
- **Table.** One row per candidate, sorted by wins: share of simulations, wins on first choices and after tabulation, median winning share.
- **Plot.** One dot per simulation, at the winner's share of continuing ballots at the end of tabulation, on a line for first choices or tabulation.
  The axis runs from 50% to the largest share in that race. Dots only shift up or down to avoid overlapping. Tooltips give votes.
- **Candidates with no wins** are merged into one "0 of 100 wins" line under the plot.
- **Phones** get smaller dots, so the same shares don't stack as high.

## Checks

Run these after changing the simulation or its inputs:

1. Run it twice and `cmp` the files: they must be byte-identical.
2. Run with `--hand-only`, which stops with an error if the simulation's first rounds don't add up, and run `check_counts.mjs`, which compares the CVR with the summary.
3. Render every contest at phone and desktop widths, looking for page errors and anything past the screen edge.
4. `refresh.sh check` compares `CVR_Export.zip`'s `Last-Modified` with `cvrLastModified` in `coverage.json`, before deploying.

## Rejected along the way

- **A shift on the two finalists,** then **a favored candidate against the rest.** Both were replaced by the current lean in
  all directions.
- **A nonzero mean for the lean.** See above.
- **A vote-count axis** on the plot, the first version. Votes didn't show how close a win was.
- **Statewide races only,** the first version, before every race and measure.
- **Statewide questioned counts in local races.** About 2.7 times too high.
- **Storing each run's lean and first round,** dropped to keep `projection.json` at about 447 KB.

## Results as of the CVR posted 2026-11-05T00:24:43Z

Wins out of 100, from the committed `projection.json`. Rerun rather than quoting these after a refresh. This CVR has the same
ballots as the one posted 2026-11-04T11:42:46Z: only the summary and the ballots received moved.

| Race | Wins | Top candidate's wins, seeds 1, 2 and 3 |
|---|---|---|
| U.S. Senator | Peltola 89, Sullivan (Dan S.) 11 | 91, 87, 87 |
| U.S. Representative | Begich 86, Hill 14 | 92, 91, 93 |
| Governor | Kreiss-Tomkins 100 | 100, 100, 100 |
| Ballot Measure 2 | No 100 | 97, 99, 99 |
| Ballot Measure 3 | Yes 100 | 100, 100, 100 |
| House District 37 | Trefon 76, Smith 14, Wilson 10, with 2% of its simulated ballots from the CVR | 79, 80, 74 |
| House District 29 | Nelson 55, Menard 45 | Nelson 54, Nelson 61, Menard 51 |
| House District 24 | McCarty 58, Wall 42 | McCarty 55, Wall 51, McCarty 51 |
| House District 30 | McCabe 66, Massie 34 | 62, 62, 59 |
| House District 28 | Moore 63, Wright 37 | 60, 60, 68 |

The last four are the closest, and none has a firm leader. Across those seeds House Districts 24 and 29 changed leader. House
Districts 28 and 30 kept theirs, with 59 to 68 wins, but with the same arguments seeds 11 to 16 give Moore 57 to 65 and McCabe 48 to
59, so wins in a race this close move by about 10 between seeds.

Seats, by party registration, as the median and the lowest and highest of the 100 simulations:

| Chamber | Republican | Democrat | Nonpartisan and others |
|---|---|---|---|
| State House, 40 seats | 16 (14 to 18) | 17 (15 to 18) | 7 (5 to 9) |
| State Senate, 20 seats | 11 (11) | 8 (8) | 1 (1) |

Seeds 1, 2 and 3 give the same medians.
