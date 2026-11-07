---
title: Alaska 2026 General Election
subtitle: ranked choice results explorer
description: An unofficial, preliminary look at Alaska's 2026 general election, from the Division of Elections' posted results. Not affiliated with the State of Alaska.
---

{{< rcv/intro byline="Prepared by Will Dumm &middot; questions to [will@dummthings.dev](mailto:will@dummthings.dev?subject=Alaska%20RCV%20explorer)" repo="https://github.com/willdumm/alaska-rcv" >}}

{{< rcv/notice >}}
**Preliminary and unofficial.** Counting isn't finished, so anyone leading here may not lead at the end. Not affiliated with the State of Alaska or the Division of Elections. [Read the caveats](#caveats).
{{< /rcv/notice >}}

{{< rcv/prose id="rcv-about" >}}

The Division of Elections posts rankings for scanned ballots, but only first choices for hand-counted ballots, and its own ranked choice tabulation comes on November 18. This page estimates the result from what's posted so far. In ranked choice tabulation, if no one has a majority, the last-place candidate is eliminated and those ballots move to their next choice, until two candidates remain. Moving down the page:

- **By house district:** first choices in each district, and about how many ballots are left to count.
- **Ranked choice tabulation:** who would win if counting stopped now, if hand-counted ballots rank like scanned ones.
- **Simulations:** a better idea of who wins once counting finishes. Each district's uncounted ballots are drawn at random from ballots already counted there, then tabulated, 1,000 times over, to show how many of the 1,000 each candidate wins.
- **Ballot rankings:** how scanned ballots ranked their next choices.

{{< /rcv/prose >}}

{{< rcv/noscript >}}
This page runs the count in your browser, so it needs JavaScript. The caveats and sources below are still readable.
{{< /rcv/noscript >}}

{{< rcv/filters contest="Contest" district="District" >}}

{{< rcv/status >}}

{{< rcv/section id="districts" title="By house district" tag="Division's results" >}}

{{< rcv/slot id="rcv-map-mode" class="rcv-modes" >}}

{{< rcv/columns >}}

{{< rcv/column >}}

{{< rcv/slot id="rcv-map" >}}

{{< rcv/slot id="rcv-map-legend" class="rcv-scale" >}}

{{< rcv/note id="rcv-map-insets-note" >}}
Hover or tap a district for its numbers, and tap again to clear it.
{{< /rcv/note >}}

{{< rcv/note id="rcv-selected" muted=false >}}{{< /rcv/note >}}

{{< /rcv/column >}}

{{< rcv/details id="rcv-dots-details" class="rcv-dots-details" open=true summary="Every district, ranked" >}}

{{< rcv/slot id="rcv-dots" class="rcv-chart" >}}

{{< rcv/note id="rcv-dots-note" >}}
"Ballots left" are estimates: the Division publishes ballots received only statewide. A leader's line adds up the districts they lead.
{{< /rcv/note >}}

{{< rcv/note id="rcv-dots-final-note" >}}
In the view after ranked choice tabulation, hollow dots mark districts with under 90% of rankings known.
{{< /rcv/note >}}

{{< /rcv/details >}}

{{< /rcv/columns >}}

{{< rcv/details summary="Every district as a table" >}}

{{< rcv/note id="rcv-coverage-caption" >}}{{< /rcv/note >}}

{{< rcv/table id="rcv-coverage" >}}

{{< /rcv/details >}}

{{< /rcv/section >}}

{{< rcv/section id="count" title="Ranked choice tabulation, for ballots counted so far" tag="Projected from the Division's results" >}}

{{< rcv/slot id="rcv-count-intro" >}}

{{< rcv/slot id="rcv-callouts" >}}

{{< rcv/slot id="rcv-keep" >}}

{{< rcv/slot id="rcv-flow" class="rcv-chart" >}}

{{< rcv/note id="rcv-flow-note" >}}
Ribbon thickness is ballots, and percentages are of the ballots still in the count that round. Gray is ballots that stopped counting.
{{< /rcv/note >}}

{{< rcv/table id="rcv-rounds" >}}

{{< rcv/slot id="rcv-transfers" tag="ul" class="rcv-transfers" >}}

{{< rcv/details summary="The count of scanned ballots alone" >}}

{{< rcv/note >}}
Scanned ballots only, with nothing estimated. Hand-counted ballots aren't here, so don't read this as who's ahead. This is the count that was checked: [see below](#caveats).
{{< /rcv/note >}}

{{< rcv/table id="rcv-cvr-rounds" >}}

{{< /rcv/details >}}

{{< /rcv/section >}}

{{< rcv/section id="projection" title="With the rest of the ballots simulated" tag="Simulated" class="rcv-section-sim" >}}

{{< rcv/slot id="rcv-projection-intro" >}}

{{< rcv/slot id="rcv-projection-status" >}}

{{< rcv/table id="rcv-projection-table" >}}

{{< rcv/slot id="rcv-projection" class="rcv-chart rcv-projection" >}}

{{< rcv/note id="rcv-projection-note" >}}{{< /rcv/note >}}

{{< rcv/details id="rcv-how-simulation" summary="How the simulation works and what it assumes" >}}

For each district, the simulation estimates how many ballots are still uncounted and fills them in by drawing at random from ballots already counted there, rankings included. It adds a random skew for or against each candidate, runs ranked choice tabulation on the result, and repeats 1,000 times. Each dot on the plot is one simulation.

It assumes:

- **Hand-counted ballots rank like scanned ones.** Each copies its later choices from a scanned ballot with the same first choice, in its district where possible. Hand-counted ballots are mostly rural, so rural results rest on few scanned ballots.
- **The number of ballots left in each district can be estimated.** The Division gives ballots received only statewide, so these are shared out by each district's early and absentee ballots in 2024. Questioned ballots, set aside until the Division confirms the voter's eligibility, are estimated from each district's 2024 count and this year's turnout.
- **Uncounted ballots vote like counted ones of the same kind, apart from the skew.** Early and absentee ballots are drawn from those in the district, and questioned ballots from its Election Day and hand-counted ballots. A district with under 300 to draw from also uses its other ballots.
- **The skew favors no one on average.** Its size comes from 2024, when absentee ballots landed about 7 points from early ballots in the same district in statewide races, and further in State House races. That year absentee ballots ran more Democratic than early ballots, and questioned ballots ran more Republican than Election Day ballots. The simulation doesn't assume either repeats. In State House and Senate races, candidates of the same party share part of their skew.

It leaves out ballots yet to arrive, ballots the Division rejects, precincts yet to report, and the rankings on write-in ballots, since scanned ballot data doesn't name write-ins. Chance alone moves a count near 500 of 1,000 wins by about 16, so small differences mean nothing.

{{< /rcv/details >}}

{{< /rcv/section >}}

{{< rcv/section id="ranks-section" title="Explore ballot rankings" >}}

Pick a first choice to see how scanned ballots ranked their next choice.

{{< rcv/slot id="rcv-drill" class="rcv-drill" >}}

{{< rcv/details summary="How many candidates each scanned ballot ranked" >}}

{{< rcv/slot id="rcv-depth" class="rcv-depth" >}}

{{< /rcv/details >}}

{{< /rcv/section >}}

{{< rcv/prose id="caveats" >}}

## Before quoting anything here

- **No guarantee.** This is an independent page, not the Division's. The Division's count is the only official one, and it hasn't checked this page. Please don't contact the Division about it.
- **Hand-counted ballots have first choices but no rankings.** They're concentrated in rural areas, so later rounds there rest on few ballots and may be wrong.
- **Statewide races aren't decided by district.** Early and absentee ballots sit under the districts the Division's reports give them, which can differ from where voters live.
- **Simulations aren't forecasts.** Different assumptions give different numbers.

**How this was checked.** On scanned ballots alone, this page's count reproduces all 9 of the Division's certified 2024 round-by-round reports. It also agrees with [RCTab](https://github.com/BrightSpots/rcv), a separate open source vote-counting program, on every 2024 and 2026 contest, apart from at most 21 votes in a round. Nothing can check the projected rounds until the Division publishes its own. [Rules and checks](https://github.com/willdumm/alaska-rcv/blob/main/docs/RULES.md).

**Sources.** The Division's [list of scanned ballots and their rankings](https://www.elections.alaska.gov/enr/26GENR/results/CVR_Export.zip) (its Cast Vote Record), [results summary](https://www.elections.alaska.gov/enr/26GENR/results/ElectionSummaryReportRPT.pdf), [results page](https://www.elections.alaska.gov/election-results/e/), [district map](https://www.elections.alaska.gov/enr/26GENR/) and [district names](https://www.elections.alaska.gov/doc/forms/H07.pdf); the same list for 2024; the U.S. Census Bureau's [state outline](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html). Charts by [d3](https://d3js.org).

{{< /rcv/prose >}}
