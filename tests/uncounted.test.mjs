// The uncounted estimate leaves out the Division's questioned row, which the questioned estimate already covers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { questionedAheadOfCvr, questionedByDistrict, uncountedByDistrict } from "../site/static/rcv-uncounted.js";

const data = (name) => JSON.parse(readFileSync(new URL(`../site/static/data/alaska-rcv-2026/${name}`, import.meta.url)));
const coverage = data("coverage.json");
const shares = data("early-absentee-2024.json");
const questioned2024 = data("questioned-2024.json");
const sum = (map) => [...map.values()].reduce((a, b) => a + b, 0);
const withRow = (extra) => ({ ...coverage, received: { ...coverage.received, received: coverage.received.received + extra, questioned: coverage.received.questioned + extra } });

test("the questioned row isn't in the uncounted ballots", () => {
  const { received, cvrBallotsByGroup } = coverage;
  assert.ok(received.questioned > 0);
  const expected = received.received - received.questioned - cvrBallotsByGroup[2] - cvrBallotsByGroup[3];
  assert.ok(Math.abs(sum(uncountedByDistrict(coverage, shares)) - expected) < 1e-6);
});

test("a larger questioned row doesn't raise uncounted plus questioned", () => {
  const total = (c) => sum(uncountedByDistrict(c, shares)) + sum(questionedByDistrict(c, questioned2024, true));
  assert.ok(Math.abs(total(withRow(9000)) - total(coverage)) < 1e-6);
  const before = uncountedByDistrict(coverage, shares), after = uncountedByDistrict(withRow(9000), shares);
  for (const [key, value] of before) assert.ok(Math.abs(after.get(key) - value) < 1e-6);
});

test("questioned ballots ahead of the CVR come off the estimate, in a local race by its share", () => {
  const ahead = { ...coverage, districts: { ...coverage.districts, 5: { ...coverage.districts[5], summary: { ...coverage.districts[5].summary, q: 100 }, cvr: { ...coverage.districts[5].cvr, q: 40 } } } };
  assert.equal(questionedAheadOfCvr(coverage, questioned2024, true, 5), 0);
  assert.equal(questionedAheadOfCvr(ahead, questioned2024, true, 5), 60);
  assert.ok(Math.abs(questionedAheadOfCvr(ahead, questioned2024, false, 5) - (60 * questioned2024.house[5]) / questioned2024.statewide[5]) < 1e-9);
});

test("early and absentee ballots ahead of the CVR come off the uncounted ballots", () => {
  const before = sum(uncountedByDistrict(coverage, shares));
  const d = coverage.districts[5];
  const ahead = { ...coverage, districts: { ...coverage.districts, 5: { ...d, summary: { ...d.summary, ab: (d.summary.ab || 0) + 100 } } } };
  assert.ok(Math.abs(sum(uncountedByDistrict(ahead, shares)) - (before - 100)) < 1e-6);
});
