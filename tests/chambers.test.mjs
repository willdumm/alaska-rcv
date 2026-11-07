// The chambers in the committed projection.json: every seat present once, and seat counts that add up in every simulation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { outcomeRows, partyGroup, rankedOutcomes, runsFromOutcomes, seatsPerRun, senateDistricts, senateSeatOf } from "../site/static/rcv-chambers.js";

const projection = JSON.parse(readFileSync(new URL("../site/static/data/alaska-rcv-2026/projection.json", import.meta.url)));

for (const [key, seats] of [["house", 40], ["senate", 20]]) {
  test(`${key}: ${seats} seats cover every house district once`, () => {
    const chamber = projection.chambers[key];
    assert.equal(chamber.races.length + chamber.notOnBallot.length, seats);
    const hds = [...chamber.races, ...chamber.notOnBallot].flatMap((x) => x.hds).sort((a, b) => a - b);
    assert.deepEqual(hds, Array.from({ length: 40 }, (_, i) => i + 1));
  });
  test(`${key}: seats add up in every simulation`, () => {
    const perRun = runsFromOutcomes(projection.chambers[key].outcomes);
    assert.equal(perRun.length, projection.parameters.runs);
    for (const s of perRun) assert.equal(s.republican + s.democrat + s.other + s.tied, seats);
  });
}

test("a seat with one candidate or off the ballot counts every time, and a tie counts for no one", () => {
  const chamber = { notOnBallot: [{ party: "Registered Democrat" }], races: [
    { id: 1, candidates: [{ letter: "A", party: "Nonpartisan" }] },
    { id: 2, candidates: [{ letter: "A", party: "Registered Republican" }, { letter: "B", party: "Registered Democrat" }] },
  ] };
  const fake = { parameters: { runs: 3 }, contests: { 2: { runs: [{ winner: "A" }, { winner: "B" }, { winner: null }] } } };
  assert.deepEqual(seatsPerRun(chamber, fake), [
    { republican: 1, democrat: 1, other: 1, tied: 0 },
    { republican: 0, democrat: 2, other: 1, tied: 0 },
    { republican: 0, democrat: 1, other: 1, tied: 1 },
  ]);
});

test("seat splits count whole simulations, most common first", () => {
  const a = { republican: 2, democrat: 1, other: 0, tied: 0 }, b = { republican: 1, democrat: 2, other: 0, tied: 0 };
  const outcomes = rankedOutcomes([a, b, { ...b }]);
  assert.deepEqual(outcomes.map((o) => [o.seats, o.count]), [[b, 2], [a, 1]]);
});

test("the stored seat splits unpack to the same simulations, in the same order", () => {
  const a = { republican: 2, democrat: 1, other: 0, tied: 0 }, b = { republican: 1, democrat: 2, other: 0, tied: 0 };
  const rows = outcomeRows([a, b, { ...b }]);
  assert.deepEqual(rows, [[1, 2, 0, 0, 2], [2, 1, 0, 0, 1]]);
  assert.deepEqual(rankedOutcomes(runsFromOutcomes(rows)).map((o) => [o.seats, o.count]), [[b, 2], [a, 1]]);
});

test("every house district belongs to the Senate seat that covers it", () => {
  for (const letter of "ABCDEFGHIJKLMNOPQRST") for (const hd of senateDistricts(letter)) assert.equal(senateSeatOf(hd), letter);
});

test("party groups and Senate districts", () => {
  assert.equal(partyGroup("Registered Republican"), "republican");
  assert.equal(partyGroup("Registered Democrat"), "democrat");
  assert.equal(partyGroup("Undeclared"), "other");
  assert.deepEqual(senateDistricts("A"), [1, 2]);
  assert.deepEqual(senateDistricts("T"), [39, 40]);
});
