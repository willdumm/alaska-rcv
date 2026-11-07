// The simulation's sampler and what it stores for the page. The sampler has to give the same distribution as drawing
// one ballot at a time, since that's what SIMULATION.md describes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { binomial, generator } from "../scripts/lib.mjs";
import { Pool, parseFlags, simulateProjection, summarizeRuns } from "../scripts/simulate_projection.mjs";

const data = new URL("../site/static/data/alaska-rcv-2026/", import.meta.url).pathname;

function binomialPmf(n, p) {
  const pmf = [];
  let log = n * Math.log(1 - p);
  for (let k = 0; k <= n; k++) {
    pmf.push(Math.exp(log));
    log += Math.log(((n - k) * p) / ((k + 1) * (1 - p)));
  }
  return pmf;
}

// Pearson's statistic against expected counts, pooling the cells expected to have under 5. Returns it with its degrees of freedom.
function chiSquare(observed, expected) {
  let stat = 0, cells = 0, heldObserved = 0, heldExpected = 0;
  observed.forEach((o, i) => {
    heldObserved += o;
    heldExpected += expected[i];
    if (heldExpected >= 5) {
      stat += (heldObserved - heldExpected) ** 2 / heldExpected;
      cells++;
      heldObserved = heldExpected = 0;
    }
  });
  return { stat, df: cells - 1 };
}
// About the 99.9th percentile, by Wilson and Hilferty. The seeds are fixed, so these either always pass or always fail.
const limit = (df) => df * (1 - 2 / (9 * df) + 3.09 * Math.sqrt(2 / (9 * df))) ** 3;

for (const [n, p] of [[20, 0.3], [40, 0.2], [200, 0.4], [1000, 0.03], [5000, 0.5], [300, 0.9], [100000, 0.21]]) {
  test(`binomial(${n}, ${p}) has the right mean, variance and distribution`, () => {
    const random = generator(n + Math.round(p * 1000)), draws = 200000;
    const counts = new Array(n + 1).fill(0);
    let sum = 0, squares = 0;
    for (let i = 0; i < draws; i++) {
      const k = binomial(n, p, random);
      assert.ok(Number.isInteger(k) && k >= 0 && k <= n, `drew ${k}`);
      counts[k]++;
      sum += k;
      squares += k * k;
    }
    const mean = sum / draws, variance = squares / draws - mean * mean, sd = Math.sqrt(n * p * (1 - p));
    assert.ok(Math.abs(mean - n * p) < 4 * sd / Math.sqrt(draws), `mean ${mean}`);
    assert.ok(Math.abs(variance / (sd * sd) - 1) < 0.02, `variance ${variance}`);
    const { stat, df } = chiSquare(counts, binomialPmf(n, p).map((q) => q * draws));
    assert.ok(stat < limit(df), `chi-square ${stat} on ${df}`);
  });
}

test("binomial's edges", () => {
  const random = generator(1);
  assert.equal(binomial(0, 0.5, random), 0);
  assert.equal(binomial(10, 0, random), 0);
  assert.equal(binomial(10, 1, random), 10);
  assert.equal(binomial(10, 1 + 1e-12, random), 10);
  assert.equal(binomial(10, -1e-12, random), 0);
});

const entries = [[0, 500], [1, 3], [2, 120.5], [3, 0.25], [4, 2000], [5, 40]];

test("a pool allocates every draw, and the same seed gives the same draws", () => {
  for (const n of [0, 1, 7, 1000, 123456]) {
    const a = new Pool(entries, generator(n)).drawInto(new Map(), n), b = new Pool(entries, generator(n)).drawInto(new Map(), n);
    assert.equal([...a.values()].reduce((sum, k) => sum + k, 0), n);
    assert.deepEqual([...a], [...b]);
  }
});

test("a pool with one entry gets every draw, and existing counts are added to", () => {
  const out = new Map([[9, 5]]);
  new Pool([[9, 2]], generator(1)).drawInto(out, 4);
  assert.deepEqual([...out], [[9, 9]]);
});

test("drawing at once matches drawing one ballot at a time", () => {
  const total = entries.reduce((sum, e) => sum + e[1], 0), n = 500, repeats = 20000;
  const random = generator(7), pool = new Pool(entries, random);
  const atOnce = new Array(entries.length).fill(0), oneByOne = new Array(entries.length).fill(0);
  const atOnceSquares = new Array(entries.length).fill(0), oneByOneSquares = new Array(entries.length).fill(0);
  for (let r = 0; r < repeats; r++) {
    const out = pool.drawInto(new Map(), n), single = new Array(entries.length).fill(0);
    for (let i = 0; i < n; i++) {
      let u = random() * total, j = 0;
      while (u >= entries[j][1] && j < entries.length - 1) u -= entries[j++][1];
      single[j]++;
    }
    entries.forEach(([pattern], j) => {
      const k = out.get(pattern) ?? 0;
      atOnce[j] += k;
      atOnceSquares[j] += k * k;
      oneByOne[j] += single[j];
      oneByOneSquares[j] += single[j] ** 2;
    });
  }
  entries.forEach(([, weight], j) => {
    const p = weight / total, sd = Math.sqrt(n * p * (1 - p));
    for (const [sum, squares, name] of [[atOnce[j], atOnceSquares[j], "at once"], [oneByOne[j], oneByOneSquares[j], "one by one"]]) {
      const mean = sum / repeats, variance = squares / repeats - mean * mean;
      assert.ok(Math.abs(mean - n * p) < 4 * sd / Math.sqrt(repeats), `${name}, entry ${j}: mean ${mean}, expected ${n * p}`);
      if (sd > 1) assert.ok(Math.abs(variance / (sd * sd) - 1) < 0.08, `${name}, entry ${j}: variance ${variance}, expected ${sd * sd}`);
    }
  });
});

const run = (winner, round, share) => ({ winner, round, share });

test("every win is stored by winner and round, smallest share first, however rare", () => {
  const results = [
    ...Array.from({ length: 700 }, (_, i) => run("A", 2, 0.501 + (i % 100) / 1000)),
    ...Array.from({ length: 290 }, (_, i) => run("A", 1, 0.7 + (i % 50) / 1000)),
    ...Array.from({ length: 4 }, () => run("B", 2, 0.51)),
    ...Array.from({ length: 6 }, () => run(null, 2, 0.5)),
  ];
  const { winners, ties, highShare } = summarizeRuns(results, ["A", "B", "C"]);
  assert.equal(ties, 6);
  assert.deepEqual(Object.keys(winners), ["A", "B"]);
  assert.equal(winners.A.wins, 990);
  assert.equal(winners.A.byRound[1].length, 290);
  assert.equal(winners.A.byRound[2].length, 700);
  assert.deepEqual(winners.A.byRound[2], [...winners.A.byRound[2]].sort((a, b) => a - b));
  assert.deepEqual(winners.B, { wins: 4, byRound: { 2: [0.51, 0.51, 0.51, 0.51] }, medianShare: 0.51 });
  assert.equal(highShare, 0.749);
});

const settings = parseFlags("--runs 3 --seed 5 --tau 0.2 --tau-local 0.28 --tau-party 0.2 --min-pool 300 --min-bucket 30".split(" "));

test("the same inputs give the same bytes, and another seed doesn't", () => {
  const once = JSON.stringify(simulateProjection(data, settings));
  assert.equal(JSON.stringify(simulateProjection(data, settings)), once);
  assert.notEqual(JSON.stringify(simulateProjection(data, { ...settings, seed: 6 })), once);
});

test("flags that can't work stop the run", () => {
  assert.throws(() => parseFlags("--runs 3 --seed 5 --tau 0.2 --tau-local 0.1 --tau-party 0.2 --min-pool 300 --min-bucket 30".split(" ")), /tau-party/);
  assert.throws(() => parseFlags("--runs 0 --seed 5 --tau 0.2 --tau-local 0.28 --tau-party 0.2 --min-pool 300 --min-bucket 30".split(" ")), /runs/);
  assert.throws(() => parseFlags(["--runs", "3"]), /required/);
});

test("the committed file's counts add up for every contest", () => {
  const projection = JSON.parse(readFileSync(`${data}projection.json`));
  const { runs } = projection.parameters;
  for (const sim of Object.values(projection.contests)) {
    const winners = Object.values(sim.winners);
    assert.equal(winners.reduce((sum, w) => sum + w.wins, 0) + sim.ties, runs, sim.name);
    for (const w of winners) {
      const shares = Object.values(w.byRound).flat();
      assert.equal(shares.length, w.wins, sim.name);
      assert.ok(shares.every((share) => share >= 0.5 && share <= sim.highShare), sim.name);
    }
  }
  for (const chamber of Object.values(projection.chambers)) {
    assert.equal(chamber.outcomes.reduce((sum, row) => sum + row[4], 0), runs, chamber.name);
  }
});
