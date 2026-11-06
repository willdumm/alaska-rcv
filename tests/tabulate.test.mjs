// The rules 2024's reports can't test, because no ballot in them depends on the rule. Each of the first four of these
// was a planted bug that scripts/validate_2024.mjs didn't notice.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readBallot, tabulate } from "../site/static/rcv-tabulate.js";

const ABC = ["A", "B", "C"];
const running = (...letters) => new Set(letters);

test("a write-in is passed over, and isn't a skipped rank", () => {
  assert.equal(readBallot("-WA", running("A")), "A");
  assert.equal(readBallot("W-A", running("A")), "A");
});

test("a write-in resets the count of skipped ranks", () => {
  assert.equal(readBallot("-W-A", running("A")), "A");
  assert.equal(readBallot("--A", running("A")), "exhausted");
});

test("a majority needs more than half", () => {
  const exactlyHalf = tabulate([["A", 2], ["B", 1], ["C", 1]], ABC);
  assert.equal(exactlyHalf.majorityInRoundOne, false);
  assert.equal(exactlyHalf.rounds.length, 2);
  const moreThanHalf = tabulate([["A", 3], ["B", 1], ["C", 1]], ABC);
  assert.equal(moreThanHalf.majorityInRoundOne, true);
});

test("a first-round majority stops the count, unless told to keep counting", () => {
  const ballots = [["A", 3], ["B", 1], ["C", 1]];
  assert.equal(tabulate(ballots, ABC).rounds.length, 1);
  assert.equal(tabulate(ballots, ABC, [], { ignoreMajority: true }).rounds.length, 2);
});

test("a tie for last eliminates the later candidate on the ballot and flags it", () => {
  const { rounds } = tabulate([["A", 3], ["B", 2], ["C", 2]], ABC);
  assert.equal(rounds[0].eliminated, "C");
  assert.deepEqual(rounds[0].tieForLast, ["B", "C"]);
});

test("counting continues until two candidates remain, and not one further", () => {
  const letters = ["A", "B", "C", "D"];
  const { rounds, leader, runnerUp } = tabulate([["A", 4], ["B", 3], ["C", 2], ["DB", 1]], letters);
  assert.equal(rounds.length, 3);
  assert.equal(rounds[2].votes.A, 4);
  assert.equal(rounds[2].votes.B, 4);
  assert.equal(leader, null);
  assert.ok(runnerUp);
});

test("a majority after round 1 doesn't stop the count", () => {
  const letters = ["A", "B", "C", "D"];
  const { rounds } = tabulate([["A", 4], ["B", 2], ["C", 1], ["D", 1]], letters);
  assert.equal(rounds[0].votes.A * 2, rounds[0].active);
  assert.ok(rounds[1].votes.A * 2 > rounds[1].active);
  assert.equal(rounds.length, 3);
});

test("an overvote stops a ballot even when the marked candidates are out", () => {
  assert.equal(readBallot("*A", running("A", "B")), "overvotes");
  assert.equal(readBallot("B*A", running("A")), "overvotes");
});

test("a repeated ranking counts as a blank rank", () => {
  assert.equal(readBallot("AAB", running("B")), "B");
  assert.equal(readBallot("AAAB", running("B")), "exhausted");
  assert.equal(readBallot("A-AB", running("B")), "exhausted");
  assert.equal(readBallot("AB", running("B")), "B");
});

test("a repeated write-in isn't a repeat: names aren't known", () => {
  assert.equal(readBallot("WWWA", running("A")), "A");
});

test("inactive ballots land in the right pile", () => {
  const [round] = tabulate([["", 1], ["--A", 1], ["W", 1], ["*", 1], ["A", 2], ["B", 1]], ["A", "B"]).rounds;
  assert.equal(round.blanks, 3);
  assert.equal(round.overvotes, 1);
  assert.equal(round.exhausted, 0);
  assert.equal(round.active, 3);
});

test("transfers move to the next continuing candidate and report the rest", () => {
  const { rounds } = tabulate([["A", 4], ["B", 3], ["CB", 1], ["C", 1], ["C*", 1]], ABC);
  assert.deepEqual(rounds[0].transfers, { A: 0, B: 1, exhausted: 1, overvotes: 1 });
  assert.equal(rounds[1].exhausted, 1);
  assert.equal(rounds[1].overvotes, 1);
  assert.equal(rounds[1].votes.C, 0);
});

test("removed candidates are passed over", () => {
  const [round] = tabulate([["AB", 2], ["B", 1]], ["A", "B"], ["A"]).rounds;
  assert.equal(round.votes.B, 3);
});

test("a tied final round has no leader", () => {
  const { leader, tiedFinal } = tabulate([["A", 2], ["B", 2]], ["A", "B"]);
  assert.equal(leader, null);
  assert.equal(tiedFinal, true);
});
