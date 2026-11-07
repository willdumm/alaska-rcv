// The 2024 evidence for the projection's lean, tau. Predicts 2024's ballots the way the projection
// predicts 2026's, from the same district's other ballots: absentee from early, and questioned from
// Election Day. Then it asks what per-candidate lean z = log(actual / predicted) would have fixed the
// statewide first-choice shares, and how far the prediction missed the two finalists' share.
// tau is the standard deviation of z. For two candidates near 50-50, a difference of two independent z
// moves one's share by about 25 * sqrt(2) * tau points. That finalists' reading is the one to compare with
// tau. The rms of z reads low with two big candidates, since one's gain is the other's loss.
// Usage: node calibrate_lean_2024.mjs EXTRACTED_2024_DIR
import { join } from "node:path";
import { readBallot } from "../site/static/rcv-tabulate.js";
import { GROUP, eachRow } from "../site/static/rcv-rows.js";
import { finalists, loadContest, readJson } from "./lib.mjs";

const dir = process.argv[2];
const { contests } = readJson(join(dir, "ballots.json"));
const COMPARISONS = [
  { label: "absentee from early", from: GROUP.EARLY, to: GROUP.ABSENTEE },
  { label: "questioned from Election Day", from: GROUP.ELECTION_DAY, to: GROUP.QUESTIONED },
];
const MIN_SHARE = 0.03;
const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
const rms = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// Tallies each [district][group] by how a ballot reads with these candidates continuing.
function byDistrictAndGroup(c, continuing) {
  const tally = {};
  const reads = c.patterns.map((p) => readBallot(p, continuing));
  for (const { pattern, hd, group, count } of eachRow(c)) {
    if (continuing.has(reads[pattern])) add((tally[hd] ??= {})[group] ??= {}, reads[pattern], count);
  }
  return tally;
}

// Statewide totals for `to`, and what they'd be if each district's `to` ballots split like its `from` ballots.
function predict(tally, from, to) {
  const actual = {}, predicted = {};
  for (const groups of Object.values(tally)) {
    const source = groups[from], target = groups[to];
    if (!source || !target) continue;
    const n = sum(target), of = sum(source);
    for (const [l, votes] of Object.entries(target)) add(actual, l, votes);
    for (const [l, votes] of Object.entries(source)) add(predicted, l, (votes / of) * n);
  }
  return { actual, predicted };
}

function load(id) {
  const c = loadContest(dir, id);
  return { ...c, letters: c.candidates.map((x) => x.letter) };
}

for (const { label, from, to } of COMPARISONS) {
  console.log(`\n${label}`);
  const misses = [], house = [];
  for (const { id, name } of contests) {
    const c = load(id);
    if (c.letters.length < 2) continue;
    const [a, b] = finalists(c);
    const duoTally = byDistrictAndGroup(c, new Set([a, b]));
    const { actual: duo, predicted: duoPredicted } = predict(duoTally, from, to);
    const duoFrom = {};
    for (const groups of Object.values(duoTally)) if (groups[from] && groups[to]) for (const [l, votes] of Object.entries(groups[from])) add(duoFrom, l, votes);
    const n = sum(duo);
    if (!n || n < 300) continue;
    const miss = ((duo[a] - duoPredicted[a]) / n) * 100;
    misses.push(miss);
    if (name.startsWith("House")) house.push({ miss, noise: 2500 / n + 2500 / sum(duoFrom) });
    if (!name.startsWith("U.S.") && !name.startsWith("President")) continue;

    const { actual, predicted } = predict(byDistrictAndGroup(c, new Set(c.letters)), from, to);
    const total = sum(actual);
    const big = c.letters.filter((l) => (actual[l] || 0) / total >= MIN_SHARE && predicted[l]);
    const zs = big.map((l) => Math.log(actual[l] / predicted[l]));
    console.log(`  ${name}: ${fmtN(n)} ballots for the finalists, ${c.candidates.find((x) => x.letter === a).name} share missed by ${miss.toFixed(1)} points`);
    big.forEach((l, i) => console.log(`    ${c.candidates.find((x) => x.letter === l).name.padEnd(36)} ${(100 * actual[l] / total).toFixed(1).padStart(5)}% actual, ${(100 * predicted[l] / total).toFixed(1).padStart(5)}% predicted, z ${zs[i].toFixed(3)}`));
    console.log(`    tau from these z (rms, candidates over ${MIN_SHARE * 100}%): ${rms(zs).toFixed(3)}`);
    console.log(`    tau from the finalists' miss: ${(Math.abs(miss) / (25 * Math.SQRT2)).toFixed(3)}`);
  }
  const abs = misses.map(Math.abs).sort((x, y) => x - y);
  console.log(`  All ${misses.length} contests with at least 300 such ballots: rms miss ${rms(misses).toFixed(1)} points, median ${abs[abs.length >> 1].toFixed(1)}, max ${abs[abs.length - 1].toFixed(1)}; implied tau ${(rms(misses) / (25 * Math.SQRT2)).toFixed(3)}`);
  // The projection resamples its pools, so the lean for local races is the miss beyond what sampling alone explains.
  if (house.length) {
    const raw = rms(house.map((h) => h.miss));
    const beyond = Math.sqrt(Math.max(0, raw ** 2 - house.reduce((s, h) => s + h.noise, 0) / house.length));
    console.log(`  The ${house.length} State House races among them: rms miss ${raw.toFixed(1)} points, ${beyond.toFixed(1)} beyond sampling noise; implied tau ${(beyond / (25 * Math.SQRT2)).toFixed(3)}`);
  }
}

// Does the projection's --min-pool help? Predicts each State House race's absentee ballots from early ballots alone,
// and from early ballots filled up to MIN_POOL with the district's Election Day ballots, where there were too few.
const MIN_POOL = 300;
const thin = [];
for (const { id, name } of contests) {
  if (!name.startsWith("House")) continue;
  const c = load(id);
  if (c.letters.length < 2) continue;
  const [a, b] = finalists(c);
  const groups = Object.values(byDistrictAndGroup(c, new Set([a, b])))[0];
  if (!groups?.[3] || !groups[2]) continue;
  const n = sum(groups[3]);
  if (n >= MIN_POOL || sum(groups[2]) < 100) continue;
  const share = (tally) => (tally[a] || 0) / sum(tally);
  const filled = n / MIN_POOL * share(groups[3]) + (1 - n / MIN_POOL) * share(groups[1] ?? groups[3]);
  thin.push({ name, n, early: (share(groups[2]) - share(groups[3])) * 100, filled: (share(groups[2]) - filled) * 100 });
}
console.log(`\nAbsentee from early, State House races with under ${MIN_POOL} early ballots and at least 100 absentee:`);
for (const t of thin) console.log(`  ${t.name}: ${t.n} early ballots, missed by ${t.early.toFixed(1)} alone, ${t.filled.toFixed(1)} filled up`);
console.log(`  rms miss: ${rms(thin.map((t) => t.early)).toFixed(1)} alone, ${rms(thin.map((t) => t.filled)).toFixed(1)} filled up`);

function fmtN(n) { return Math.round(n).toLocaleString("en-US"); }
