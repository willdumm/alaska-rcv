// Each district's leader, on the committed data: the share has to be of the right ballots, in both views.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { districtShares, placesOf, prepareContest, setData, summaryFor } from "../site/static/rcv-model.js";

const data = (name) => JSON.parse(readFileSync(new URL(`../site/static/data/alaska-rcv-2026/${name}`, import.meta.url)));
const index = data("ballots.json");
setData({ index, coverage: data("coverage.json"), districts: null, districtNames: data("district-names.json"), earlyAbsentee2024: data("early-absentee-2024.json"), questioned2024: data("questioned-2024.json"), projection: null });
const contests = index.contests.map((c) => prepareContest(data(`contest-${c.id}.json`)));
const ranked = contests.filter((c) => c.letters.length > 2 && summaryFor(c, "all"));

test("every house district has its name from the Division's form, and the overseas row has none", () => {
  const held = Object.keys(data("coverage.json").districts).map(Number).filter((hd) => hd > 0 && hd !== 99);
  assert.equal(held.length, 40);
  for (const hd of held) assert.ok(placesOf(hd).length > 3, `district ${hd}`);
  assert.equal(placesOf(5), "Kodiak/Seward/Cordova");
  assert.equal(placesOf(3), "Mendenhall Valley/Haines/Skagway/Gustavus");
  assert.equal(placesOf(36), "Copper River Basin/Delta/Tok/Yukon Drainage");
  assert.equal(placesOf(99), "");
});

test("first choices: the leader has the most votes, as a share of every candidate's", () => {
  for (const c of contests.filter((x) => x.letters.length > 1)) {
    const { shares, whole } = districtShares(c, "first");
    for (const d of [whole, ...shares.values()]) {
      if (!d.total) continue;
      const votes = c.letters.map((l) => d.votes[l]);
      assert.equal(d.votes[d.leader], Math.max(...votes));
      assert.equal(d.total, votes.reduce((p, q) => p + q, 0));
      assert.equal(d.share, d.votes[d.leader] / d.total);
    }
    const summary = summaryFor(c, "all");
    if (summary) assert.equal(whole.votes[whole.leader], summary.votes[summary.leader]);
  }
});

test("final round: the leader is one of the two finalists, with at least half", () => {
  for (const c of ranked) {
    const { shares, whole } = districtShares(c, "final");
    for (const d of [whole, ...shares.values()]) {
      if (!d.total) continue;
      assert.ok(c.order.slice(0, 2).includes(d.leader));
      assert.ok(d.share >= 0.5);
    }
  }
});

test("three candidates can each lead a district, though only two reach the final round", () => {
  const candidates = ["A", "B", "C"].map((letter) => ({ letter, name: letter }));
  const summary = { A: { 1: 50, 2: 30, 3: 10 }, B: { 1: 30, 2: 50, 3: 10 }, C: { 1: 20, 2: 20, 3: 40 } };
  setData({ index, coverage: { contests: { Fake: { byDistrict: summary } } }, districts: null, districtNames: data("district-names.json"), earlyAbsentee2024: null, questioned2024: null, projection: null });
  const c = prepareContest({ name: "Fake", candidates, patterns: ["A", "B", "C"], rows: [0, 1, 0, 50, 0, 2, 0, 30, 0, 3, 0, 10, 1, 1, 0, 30, 1, 2, 0, 50, 1, 3, 0, 10, 2, 1, 0, 20, 2, 2, 0, 20, 2, 3, 0, 40] });
  const first = districtShares(c, "first").shares;
  assert.deepEqual([1, 2, 3].map((hd) => first.get(hd).leader), ["A", "B", "C"]);
  assert.equal(first.get(3).share, 40 / 60);
  const final = districtShares(c, "final").shares;
  assert.ok([1, 2, 3].every((hd) => c.order.slice(0, 2).includes(final.get(hd).leader)));
});
