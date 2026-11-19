# Write-ins, repeats and skipped rankings

AS 15.15.350 makes a ballot inactive after two skipped rankings in a row, and defines a skipped ranking as a blank one.
The Division of Elections applies that rule as written to blank ranks (situation 3). Its count also treats two kinds of
filled-in rank as skipped: a write-in ranked after a write-in (situation 1), and a candidate ranked again (situation 2).
Counted the statute's way, 39 ballots in the unofficial final count of November 18, 2026 would be read differently in at
least one round, across 10 races. No winner changes, and none of these ballots is in the two closest races, House
Districts 29 and 30.

Ballots are written here as a ranking per position: a letter for a candidate, `W` for a filled-in write-in oval, `-` for
a blank rank.

## What the law and the Division say

Quotes are verbatim, from AS 15.15.350 as given in `statutes.md`, from
[6 AAC 25.071](https://www.law.cornell.edu/regulations/alaska/6-AAC-25.071), and from the "Tabulation Options" printed on
the Division's 15 round-by-round reports of November 18, 2026.

How a ballot counts, AS 15.15.350(d): "the election board shall initially tabulate each validly cast ballot as one vote
for the highest-ranked continuing candidate on that ballot or as an inactive ballot." When a candidate is defeated,
under (d)(2), their votes "shall be added to the totals of each ballot's next-highest-ranked continuing candidate or
considered an inactive ballot under (g)(2) of this section."

Skipped rankings, AS 15.15.350(e)(2): "if a ballot skips a ranking, then the election board shall count the next
ranking. If the next ranking is another skipped ranking, the ballot shall be considered an inactive ballot once the
second skipped ranking is encountered."

Definitions, AS 15.15.350(g):

- (1) "'continuing candidate' means a candidate who has not been defeated"
- (2) "'inactive ballot' means a ballot that is no longer tabulated, either in whole or in part, by the division because
  it does not rank any continuing candidate, contains an overvote at the highest continuing ranking, or contains two or
  more sequential skipped rankings before its highest continuing ranking"
- (3) "'overvote' means an instance where a voter has assigned the same ranking to more than one candidate"
- (4) "'ranking' or 'ranked' means the number assigned by a voter to a candidate to express the voter's choice for that
  candidate"
- (6) "'skipped ranking' means a blank ranking on a ballot on which a voter has ranked another candidate at a subsequent
  ranking"

Write-ins. 6 AAC 25.071: if the number of active ballots with a write-in ranked highest is less than the leading
candidate's first-round votes, "and the difference is equal to or greater than 0.5 percent of the total number of votes
for the leading candidate and the write-in candidates in the first round of tabulation, all write-in candidates are
defeated. Otherwise, the division shall conduct the tabulation under AS 15.15.350 with each valid write-in candidate as
an individual candidate." AS 15.15.365(b): "Write-in votes that do not meet the requirements of this section may not be
individually counted under this section." In 2026 no race is near the threshold: write-ins peak at 9.7% of the leader's
first choices, in House District 13. So every write-in in every race is defeated.

The Division's settings, the same on all 15 reports:

| Option | Setting |
| --- | --- |
| Handling skip rankings | Exhausted On Two Or More Ranks Skipped |
| Exclude unresolved write-ins | True |
| Skip overvoted rankings | False |
| Votes to include in threshold calculation | Continuing ballots per round |
| Declare winners by threshold | False |

No setting covers a candidate ranked twice, or says whether a write-in rank can count as a skipped one. Neither
AS 15.15.350 nor 6 AAC 25.071 mentions either case.

## 1. A write-in ranked after a write-in

**The case.** A voter fills in write-in ovals at ranks 1, 2 and 3, then ranks Peltola 4th and 5th: `WWWBB` in U.S.
Senator. Eight ballots in 2026 rank write-ins first, second and third and a candidate after them, in Governor, U.S.
Senator, U.S. Representative, Senate District S and House District 37.

**How the Division counts it.** As inactive before it reaches the candidate. It treats all of a race's write-ins as one
candidate, so the second and third write-ins repeat a candidate already ranked. It counts each repeat as a skipped
ranking, and two in a row make the ballot inactive. No published setting says this. It's inferred: it's the only reading
that reproduces the reports for U.S. Representative, Senate District S and House District 37, which have one such
ballot each.

**What the statute says.** Nothing in it makes a write-in rank a skipped ranking:

- A skipped ranking is "a blank ranking" ((g)(6)). A rank with its write-in oval filled in isn't blank.
- The write-ins are defeated under 6 AAC 25.071, so they aren't continuing candidates ((g)(1)). The ballot's highest
  continuing ranking is rank 4.
- (g)(2) makes a ballot inactive for "two or more sequential skipped rankings before its highest continuing ranking".
  Ranks 1 to 3 are filled, so there are none.
- So under (d) the ballot is "one vote for the highest-ranked continuing candidate on that ballot": Peltola.

Treating all write-ins as one candidate doesn't come from the regulation either. 6 AAC 25.071 speaks of "all write-in
candidates" and, when they matter, of "each valid write-in candidate as an individual candidate". AS 15.15.365(b) says
losing write-ins "may not be individually counted", which is why the names are never read; it doesn't say a second
write-in repeats the first. The CVR records no names, so the three write-ins on this ballot may name three people.

**The alternative.** Pass over every write-in rank as a ranking for a defeated candidate: not a vote, not a skipped
ranking, and, like any filled rank, it ends a run of blank ones. The page counted this way before November 19, 2026.
`WWWBB` then counts for Peltola. So would `W-W-B`, which the Division stops: a blank, then a repeated write-in, is two
skips in its count, though the statute sees two skipped rankings that aren't sequential.

## 2. A candidate ranked more than once

**The case.** A voter ranks the same candidate several times and then someone else: `AAAC` in Senate District O, Bauer
first, second and third and Sheldon fourth. Or `BBBBC` in U.S. Representative, Hafner four times and then Hill, on 6
ballots. Or `D-DCB` in Senate District M: Chesbro, a blank, Chesbro again, then Tilton and Berry.

**How the Division counts it.** A repeat counts as a skipped ranking. Once Bauer is defeated, `AAAC` meets two repeats
in a row and is inactive, so it never counts for Sheldon. `D-DCB` meets a blank and then a repeat. No published setting
says this either. It's inferred from the counts: it's the only reading that reproduces all 9 certified 2024 reports, and
in 2026 the reports for the 7 races where such ballots exist (below).

**What the statute says.** Nothing about it. An overvote is one ranking given to several candidates ((g)(3)); one
candidate given several rankings is not defined, and isn't among the three causes of an inactive ballot in (g)(2). A
repeat isn't blank, so it isn't a skipped ranking under (g)(6). When Bauer is defeated, (d)(2) moves the ballot to its
"next-highest-ranked continuing candidate", Sheldon at rank 4, and (g)(2) finds no skipped rankings before it. `D-DCB`
has one skipped ranking, rank 2, so it reaches Tilton.

**The alternative.** Pass over a repeated rank: it isn't a new vote, since the candidate was already counted or
defeated, and it isn't a skipped ranking. RCTab, the open source tabulator, also passes over a repeat without counting it as skipped (see
`RULES.md`). Under the alternative `AAAC` counts for
Sheldon once Bauer is out, and `BBBBC` for Hill once Hafner is out. Two U.S. Representative ballots, `BBBB*`, would stop at
their overvote instead of at the repeats: inactive either way.

## 3. Two skipped rankings in a row

**The case.** Blank ranks before a candidate: `--C` and `---C` in House District 30 (McCabe after two or three blanks),
or `A--B` once A is defeated.

**How the Division counts it.** "Exhausted On Two Or More Ranks Skipped": the ballot is inactive at the second blank in a
row. `--C` is inactive from the start, and the reports count it under "Blanks". `A--B` counts for A while A continues,
then is inactive.

**What the statute says.** The same. Under (g)(6) ranks 1 and 2 of `--C` are skipped rankings, since a candidate is
ranked later, and (g)(2) makes a ballot with "two or more sequential skipped rankings before its highest continuing
ranking" inactive. For `A--B` the highest continuing ranking is B's once A is out, with two sequential skipped rankings
before it. (e)(2) says the same thing as the ballot is read from the top: inactive "once the second skipped ranking is
encountered". Blanks that aren't sequential, as in `A-B-C`, don't stop a ballot under either.

**Where the Division goes further.** Only through situations 1 and 2: its count of skipped rankings includes repeated
write-ins and repeated candidates, which the statute's definition, "a blank ranking", doesn't. For blank ranks alone
there's no alternative reading of the text.

Counting with no two-skip rule at all, so that blanks never stop a ballot, contradicts (e)(2) and isn't a proposal. It
only shows how much the rule weighs: 1,620 ballots would be read differently somewhere
in the count, the most in any race 507 in Governor, and House District 30's margin would go from 3 to 2.

## What the statute's reading would change

Situations 1 and 2 counted the statute's way together, on the CVR posted 2026-11-19T02:57:53Z, with
`site/static/rcv-tabulate.js` and only those two rules changed. Ballots are those read differently in at least one of
the Division's rounds. Votes are the final round, or round 1 where it has a majority.

| Race | Ballots (situation 1 + 2) | Division's count | Statute's reading |
| --- | --- | --- | --- |
| U.S. Representative | 1 + 25 | Begich 140,346, Hill 132,961 | Begich 140,353, Hill 132,977 |
| U.S. Senator | 3 + 0 | Peltola 144,743, Dan S. Sullivan 132,171 | Peltola 144,745, Dan S. Sullivan 132,172 |
| Governor | 2 + 0 | Kreiss-Tomkins/Johnson 145,878, Wilson/Shower 79,527 | Kreiss-Tomkins/Johnson 145,879, Wilson/Shower 79,527 |
| Senate District M | 0 + 1 | Berry 6,309, Tilton 5,842 | Berry 6,309, Tilton 5,843 |
| Senate District O | 0 + 1 | Rauscher 7,220, Sheldon 5,647 | Rauscher 7,220, Sheldon 5,648 |
| Senate District S | 1 + 0 | Edgmon 3,490, Deacon 2,494 | the same |
| House District 23 | 0 + 1 | Allard 4,174, Arlington 3,547 | Allard 4,175, Arlington 3,547 |
| House District 28 | 0 + 1 | Wright 2,869, Moore 2,823 | Wright 2,869, Moore 2,824 |
| House District 37 | 1 + 1 | Trefon 1,875, Wilson 1,314 | Trefon 1,877, Wilson 1,314 |
| House District 38 | 0 + 1 | Jimmie 1,774, McCormick 1,274 | Jimmie 1,774, McCormick 1,275 |

In U.S. Representative and Senate District S, the situation 1 ballot counts for a candidate in the early rounds and
stops when that candidate is defeated, so it changes the rounds the Division reports but not the final one. House
Districts 29 and 30, decided by 4 and 3 votes, have no ballots in either situation.

## Open questions

- The Division hasn't published how it treats a repeated candidate or a repeated write-in. Both rules here are
  inferred from its counts. A written rule, or the tabulation software's documentation, would settle whether they're
  policy or a software default. The CVR's own list of conditions includes `DuplicatedRcvCandidate` and
  `SkippedRanking`, separately, but says nothing about how the count uses them.
- `RULES.md` records that the Division's 2026 media packet says a write-in rank isn't a skipped rank. That text should
  be found and quoted before relying on it: if it says so, the Division's own guidance contradicts its count in
  situation 1.
