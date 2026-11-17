// The projected rounds: round 1 has to count each ballot as AS 15.15.350(d) says, with the Division's first choices, and later
// rounds have to follow the CVR's rankings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GROUP, ballotCounts, sum } from "../site/static/rcv-rows.js";
import { MIN_BUCKET, projectedBallots } from "../site/static/rcv-projected.js";
import { tabulate } from "../site/static/rcv-tabulate.js";
import { firstChoices, writeInsMatter } from "../site/static/rcv-model.js";
import { everyContest } from "../scripts/lib.mjs";

const data = new URL("../site/static/data/alaska-rcv-2026/", import.meta.url).pathname;
const load = (name, dir = data) => JSON.parse(readFileSync(dir + name, "utf8"));
// The CVR posted 2026-11-15T00:46:37Z, with that day's summary, for races whose numbers are checked by hand.
const NOV_15 = `${data}versions/2026-11-15T004637Z-2026-11-15T200900Z/`;
const { ELECTION_DAY: ED, EARLY } = GROUP;
const candidates = [{ letter: "A", name: "A" }, { letter: "B", name: "B" }, { letter: "C", name: "C" }];

function contest(rows) {
  const patterns = [...new Set(rows.map((r) => r[0]))];
  return { candidates, patterns, rows: rows.flatMap(([pattern, hd, group, count]) => [patterns.indexOf(pattern), hd, group, count]) };
}
const project = (c, votes) => projectedBallots(c, (l) => votes[l] ?? {});
const count = (ballots) => Object.fromEntries(ballots);

test("the page copies rankings with the same minimum as the simulation", () => {
  assert.equal(MIN_BUCKET, load("projection.json").parameters.minBucket);
});

test("extra votes follow the district's Election Day ballots with that first choice", () => {
  const c = contest([["AB", 1, ED, 30], ["AC", 1, ED, 10], ["AC", 1, EARLY, 60]]);
  const got = count(project(c, { A: { 1: 120 } }).get(1));
  assert.equal(got.AB, 30 + 15);
  assert.equal(got.AC, 70 + 5);
});

test("too few Election Day ballots: all the district's, then elsewhere in the race", () => {
  const few = contest([["AB", 1, ED, MIN_BUCKET - 1], ["AC", 1, EARLY, MIN_BUCKET - 1]]);
  const local = count(project(few, { A: { 1: 2 * (MIN_BUCKET - 1) + 58 } }).get(1));
  assert.equal(local.AB + local.AC, 2 * (MIN_BUCKET - 1) + 58);
  assert.equal(local.AB, local.AC);

  const rural = contest([["AB", 1, ED, 2], ["AC", 2, ED, 100]]);
  const got = count(project(rural, { A: { 1: 52, 2: 100 } }).get(1));
  assert.equal(got.AB, 2 + 50 * (2 / 102));
  assert.equal(got.AC, 50 * (100 / 102));
});

test("a first choice no CVR ballot has still counts, with no later rankings", () => {
  const got = count(project(contest([["AB", 1, ED, 5]]), { A: { 1: 5 }, C: { 1: 7 } }).get(1));
  assert.equal(got.C, 7);
});

test("a ballot past a blank or write-in first rank counts for the next candidate it ranks", () => {
  const c = contest([["AB", 1, ED, 5], ["-A", 1, ED, 3], ["WB", 1, ED, 2], ["--", 1, ED, 4], ["W", 1, ED, 6], ["*", 1, ED, 1]]);
  const got = count(project(c, { A: { 1: 5 } }).get(1));
  assert.deepEqual(got, { AB: 5, "-A": 3, WB: 2, "--": 4, W: 6, "*": 1 });
  const { rounds } = tabulate([...Object.entries(got)], ["A", "B", "C"]);
  assert.equal(rounds[0].votes.A, 8);
  assert.equal(rounds[0].votes.B, 2);
  assert.equal(rounds[0].blanks, 4 + 6);
  assert.equal(rounds[0].overvotes, 1);
});

test("hand-counted write-ins are shared between districts by hand-counted votes, and copy write-in-first rankings", () => {
  // District 1 has 10 hand-counted votes for A and district 2 has 30, so the 40 write-ins the CVR doesn't have split 1:3.
  const c = contest([["A", 1, ED, 10], ["A", 2, ED, 10], ["WB", 1, ED, 40], ["-B", 1, ED, 40], ["WC", 2, ED, 40]]);
  const projected = projectedBallots(c, (l) => ({ A: { 1: 20, 2: 40 } })[l] ?? {}, 120);
  const [one, two] = [1, 2].map((hd) => count(projected.get(hd)));
  assert.equal(one.WB, 40 + 10);
  assert.equal(one["-B"], 40);
  assert.equal(two.WC, 40 + 30);
  // With no hand-counted votes, nothing shows where write-ins the CVR doesn't have were cast, so none are added.
  const scanned = projectedBallots(c, (l) => ({ A: { 1: 10, 2: 10 } })[l] ?? {}, 120);
  assert.equal(count(scanned.get(1)).WB, 40);
  assert.equal(count(scanned.get(2)).WC, 40);
});

test("first choices put write-in and blank first ranks in one group, reassigned to the next candidate or stopped", () => {
  const c = { letters: ["A", "B"] };
  const first = firstChoices(c, [["A", 1], ["-A", 2], ["WA", 4], ["W", 8], ["W*", 16], ["-W", 32], ["--A", 64], ["*A", 128]]);
  assert.deepEqual(first.votes, { A: 1, B: 0, W: 2 + 4 + 8 + 16 });
  // A write-in followed by an overvote stops at the overvote, and is counted with those that rank no candidate.
  assert.deepEqual(first.transfers, { A: 2 + 4, B: 0, exhausted: 8 + 16, overvotes: 0 });
  assert.equal(first.active, 1 + 30);
  assert.equal(first.eliminated, "W");
  assert.equal(firstChoices(c, [["A", 1], ["BA", 1], ["--A", 1], ["*", 1]]), null);
  assert.equal(firstChoices({ letters: ["Y", "N"], measure: true }, [["-Y", 1]]), null);
});

// Every contest's projected ballots, by district, with the summary's first choices and write-ins, as the page has them.
function everyProjection(dir) {
  const index = load("ballots.json", dir), coverage = load("coverage.json", dir);
  return everyContest(dir, index).map((c) => {
    const summary = coverage.contests[c.summaryName ?? c.name];
    const nameOf = (l) => { const x = c.candidates.find((y) => y.letter === l); return x.summaryName ?? x.name; };
    const firstChoices = (l) => summary.byDistrict[nameOf(l)];
    return { c, coverage, nameOf, firstChoices, letters: c.candidates.map((x) => x.letter), projected: projectedBallots(c, firstChoices, summary.writeIn ?? 0) };
  });
}

test("each candidate's first choices equal the Division's summary in every contest, by district", () => {
  const all = everyProjection(data);
  assert.equal(all.length, 55);
  for (const { c, nameOf, firstChoices, letters, projected } of all) {
    for (const [hd, ballots] of projected) {
      for (const l of letters) {
        const got = ballots.filter(([ranking]) => ranking[0] === l).reduce((sum, [, n]) => sum + n, 0);
        const want = firstChoices(l)[hd] || 0;
        assert.ok(Math.abs(got - want) < 1e-6, `${c.name}, ${nameOf(l)}, HD ${hd}: ${got} against ${want}`);
      }
    }
  }
});

test("round 1 equals the CVR's own round 1 in every fully scanned district", () => {
  let checked = 0;
  for (const { c, coverage, letters, projected } of everyProjection(data)) {
    for (const [hd, ballots] of projected) {
      const d = coverage.districts[hd];
      if (!d || sum(Object.values(d.summary)) !== sum(Object.values(d.cvr))) continue;
      const got = tabulate(ballots, letters).rounds[0], want = tabulate(ballotCounts(c, hd), letters).rounds[0];
      for (const l of letters) assert.ok(Math.abs(got.votes[l] - want.votes[l]) < 1e-6, `${c.name}, HD ${hd}, ${l}`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

test("first choices hold every ballot in round 1, and the write-in or blank ones that stop", () => {
  let checked = 0;
  for (const { c, letters, projected } of everyProjection(data)) {
    const ballots = [...projected.values()].flat();
    const first = firstChoices({ ...c, letters }, ballots);
    if (!first) continue;
    const round1 = tabulate(ballots, letters).rounds[0];
    assert.ok(Math.abs(first.active - round1.active - first.transfers.exhausted) < 1e-6, c.name);
    for (const l of letters) assert.ok(Math.abs(first.votes[l] + first.transfers[l] - round1.votes[l]) < 1e-6, `${c.name}, ${l}`);
    checked++;
  }
  assert.ok(checked > 40);
});

test("Senate District C goes to a second round, and House District 6 counts write-in ballots' next candidates", () => {
  const race = (name) => {
    const { letters, nameOf, projected } = everyProjection(NOV_15).find((x) => x.c.name === name);
    const { rounds } = tabulate([...projected.values()].flat(), letters);
    const votes = (r) => Object.fromEntries(letters.map((l) => [nameOf(l).split(",")[0], Math.round(r.votes[l])]));
    return { rounds, votes };
  };
  const senate = race("Senate District C");
  assert.equal(senate.rounds.length, 2);
  assert.equal(senate.rounds[0].active, 13633);
  assert.equal(senate.votes(senate.rounds[0]).Stutes, 6806);
  assert.equal(senate.votes(senate.rounds[1]).Stutes, 7219);
  const house = race("House District 6");
  assert.deepEqual(house.votes(house.rounds[0]), { Vance: 4828, Johnson: 4822 });
});

test("write-ins matter when they're first, or within half a percent of the leader", () => {
  assert.equal(writeInsMatter(100, 0), false);
  assert.equal(writeInsMatter(100, 120), true);
  assert.equal(writeInsMatter(100, 100), true);
  // (1005 − 995) / 2000 is exactly 0.5%, which isn't under it.
  assert.equal(writeInsMatter(1005, 995), false);
  assert.equal(writeInsMatter(1004, 995), true);
  assert.equal(writeInsMatter(140884, 872), false);
});
