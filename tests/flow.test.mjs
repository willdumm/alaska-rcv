// The words under each round of the flow chart.
import assert from "node:assert/strict";
import test from "node:test";
import { roundStory } from "../site/static/rcv-flow.js";
import { tabulate } from "../site/static/rcv-tabulate.js";
import { pct } from "../site/static/rcv-dom.js";

test("a share near half gets the decimals that show which side of half it's on", () => {
  assert.equal(pct(140884, 281540), "50.04%");
  assert.equal(pct(4822, 9650), "49.97%");
  assert.equal(pct(50004, 100000), "50.004%");
  assert.equal(pct(1, 2), "50.0%");
  assert.equal(pct(1, 3), "33.3%");
  assert.equal(pct(1, 2, 0), "50%");
});

const contest = (letters, extra = {}) => ({ order: letters, byLetter: Object.fromEntries(letters.map((l) => [l, { short: `Name ${l}` }])), ...extra });
const stories = (c, result) => result.rounds.map((_, i) => roundStory(c, result, i));

test("a round says who's eliminated and where the ballots went, and the last says how the count ended", () => {
  const result = tabulate([["A", 40], ["B", 35], ["CA", 10], ["CB", 5], ["C", 10]], ["A", "B", "C"]);
  assert.deepEqual(stories(contest(["A", "B", "C"]), result), [
    "Name C has the fewest votes (25) and is eliminated. Ballots move to their next choice: Name A (10), Name B (5), and 10 stopped counting.",
    "Two candidates remain, so the count ends. Name A leads Name B by 10 votes, 55.6% to 44.4%.",
  ]);
});

test("a first-round majority ends the count with more than two candidates left", () => {
  const result = tabulate([["A", 60], ["B", 30], ["C", 10]], ["A", "B", "C"]);
  assert.deepEqual(stories(contest(["A", "B", "C"]), result), ["Name A has over half of round 1, so the count ends. Name A leads Name B by 30 votes, 60.0% to 30.0%."]);
});

test("two candidates, a measure and a tie have their own words", () => {
  const two = tabulate([["A", 3], ["B", 1]], ["A", "B"]);
  assert.deepEqual(stories(contest(["A", "B"]), two), ["With two candidates, no one is eliminated. Name A leads Name B by 2 votes, 75.0% to 25.0%."]);
  assert.deepEqual(stories(contest(["A", "B"], { measure: true }), two), ["Name A leads Name B by 2 votes, 75.0% to 25.0%."]);
  const tied = tabulate([["A", 2], ["B", 2]], ["A", "B"]);
  assert.deepEqual(stories(contest(["A", "B"]), tied), ["With two candidates, no one is eliminated. Name A and Name B are tied, at 2 each."]);
});
