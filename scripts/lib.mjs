// What the scripts share. Nothing here decides a result on its own, and the page's code stays in site/static.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { measureContest, measuresIn } from "../site/static/rcv-measures.js";
import { ballotCounts } from "../site/static/rcv-rows.js";
import { tabulate } from "../site/static/rcv-tabulate.js";

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const loadContest = (dir, id) => readJson(join(dir, `contest-${id}.json`));

// The races and the ballot measures, in the order the simulation draws them.
export const everyContest = (dir, index) => [...index.contests.map(({ id }) => loadContest(dir, id)), ...measuresIn(index).map((m) => measureContest(m, index.measures))];

export const add = (map, key, n) => map.set(key, (map.get(key) || 0) + n);

// mulberry32: small, seedable, and the same on every machine.
export function generator(start) {
  let s = start | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One standard normal draw, taking two numbers from random.
export const gaussian = (random) => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());

// Binomial(n, p), exact: inversion when n * p is small, Hormann's BTRS rejection sampler otherwise.
const STIRLING = [0.08106146679532726, 0.04134069595540929, 0.02767792568499834, 0.02079067210376509, 0.01664469118982119, 0.01387612882307075, 0.01189670994589177, 0.01041126526197209, 0.009255462182712733, 0.008330563433362871];
const stirling = (k) => {
  if (k < STIRLING.length) return STIRLING[k];
  const k1 = k + 1, k2 = k1 * k1;
  return (1 / 12 - (1 / 360 - 1 / 1260 / k2) / k2) / k1;
};
export function binomial(n, probability, random) {
  if (n <= 0 || probability <= 0) return 0;
  if (probability >= 1) return n;
  const flip = probability > 0.5, p = flip ? 1 - probability : probability, q = 1 - p, r = p / q;
  let k = 0;
  if (n * p < 10) {
    const a = (n + 1) * r;
    let term = Math.pow(q, n), u = random();
    while (u > term && k < n) { u -= term; k++; term *= a / k - r; }
  } else {
    const spq = Math.sqrt(n * p * q), b = 1.15 + 2.53 * spq, a = -0.0873 + 0.0248 * b + 0.01 * p, c = n * p + 0.5, vr = 0.92 - 4.2 / b;
    const alpha = (2.83 + 5.1 / b) * spq, m = Math.floor((n + 1) * p);
    const h = (m + 0.5) * Math.log((m + 1) / (r * (n - m + 1))) + stirling(m) + stirling(n - m);
    for (;;) {
      const u = random() - 0.5, us = 0.5 - Math.abs(u);
      let v = random();
      k = Math.floor((2 * a / us + b) * u + c);
      if (us >= 0.07 && v <= vr) break;
      if (k < 0 || k > n) continue;
      v = Math.log(v * alpha / (a / (us * us) + b));
      if (v <= h + (n + 1) * Math.log((n - m + 1) / (n - k + 1)) + (k + 0.5) * Math.log(((n - k + 1) / (k + 1)) * r) - stirling(k) - stirling(n - k)) break;
    }
  }
  return flip ? n - k : k;
}

// The two candidates left when the count runs all the way down, even past a first-round majority.
export function finalists(c) {
  const letters = c.candidates.map((x) => x.letter);
  const { rounds } = tabulate(ballotCounts(c), letters, [], { ignoreMajority: true });
  const last = rounds[rounds.length - 1].votes;
  return letters.slice().sort((a, b) => last[b] - last[a]).slice(0, 2);
}
