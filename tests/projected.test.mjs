// The projected rounds: round 1 has to equal the Division's summary, and later rounds have to follow the CVR's rankings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { measureContest, measuresIn } from "../site/static/rcv-measures.js";
import { GROUP } from "../site/static/rcv-rows.js";
import { MIN_BUCKET, projectedBallots } from "../site/static/rcv-projected.js";
import { tabulate } from "../site/static/rcv-tabulate.js";

const data = new URL("../site/static/data/alaska-rcv-2026/", import.meta.url).pathname;
const load = (name) => JSON.parse(readFileSync(data + name, "utf8"));
const { ELECTION_DAY: ED, EARLY } = GROUP;
const candidates = [{ letter: "A", name: "A" }, { letter: "B", name: "B" }, { letter: "C", name: "C" }];

function contest(rows) {
  const patterns = [...new Set(rows.map((r) => r[0]))];
  return { candidates, patterns, rows: rows.flatMap(([pattern, hd, group, count]) => [patterns.indexOf(pattern), hd, group, count]) };
}
const project = (c, votes) => projectedBallots(c, (l) => votes[l] ?? {});
const count = (ballots) => Object.fromEntries(ballots);

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

test("a ballot past a blank or write-in first rank is left out, and one reaching no candidate stays", () => {
  const c = contest([["AB", 1, ED, 5], ["-A", 1, ED, 3], ["WB", 1, ED, 2], ["--", 1, ED, 4], ["*", 1, ED, 1]]);
  const got = count(project(c, { A: { 1: 5 } }).get(1));
  assert.deepEqual(got, { AB: 5, "--": 4, "*": 1 });
  const { rounds } = tabulate([...Object.entries(got)], ["A", "B", "C"]);
  assert.equal(rounds[0].votes.A, 5);
  assert.equal(rounds[0].blanks, 4);
  assert.equal(rounds[0].overvotes, 1);
});

test("round 1 equals the Division's summary in every contest, by district", () => {
  const index = load("ballots.json"), coverage = load("coverage.json");
  const all = [...index.contests.map(({ id }) => load(`contest-${id}.json`)), ...measuresIn(index).map((m) => measureContest(m, index.measures))];
  assert.equal(all.length, 55);
  for (const c of all) {
    const summary = coverage.contests[c.summaryName ?? c.name];
    const nameOf = (l) => { const x = c.candidates.find((y) => y.letter === l); return x.summaryName ?? x.name; };
    const letters = c.candidates.map((x) => x.letter);
    const projected = projectedBallots(c, (l) => summary.byDistrict[nameOf(l)]);
    for (const [hd, ballots] of projected) {
      const { votes } = tabulate(ballots, letters).rounds[0];
      for (const l of letters) {
        const want = summary.byDistrict[nameOf(l)][hd] || 0;
        assert.ok(Math.abs(votes[l] - want) < 1e-6, `${c.name}, ${nameOf(l)}, HD ${hd}: ${votes[l]} against ${want}`);
      }
    }
  }
});
