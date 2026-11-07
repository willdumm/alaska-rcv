// Holdout test for where a hand-counted ballot's later rankings should be copied from. A hand-counted ballot has a first
// choice and no rankings, so simulate_projection.mjs and site/static/rcv-projected.js copy them from CVR ballots with the
// same first choice: the district's first, the whole race when the district has too few. This asks which source
// predicts a district's real ballots best, using only races in more than one district with at least 3 candidates.
//
// For each such race, house district and first-choice candidate, the truth is the district's Election Day CVR ballots
// with that first choice, as the distribution of what the ballot goes to next (a candidate, or stopping). Sources:
//   district  a random sample of n of the district's own other ballots with that first choice
//   race      every ballot with that first choice in the race's other districts
//   blend-k   (n * district share + k * race share) / (n + k)
// Two ways of making the district's ballots and the truth disjoint:
//   split  Election Day ballots are split at random in half: one half is the truth, the other the pool for the sample.
//          The same kind of ballot on both sides, so this measures sampling alone.
//   mail   all the Election Day ballots are the truth, and the pool is the district's early and absentee ballots.
//          This is how the projection tops up a short list, so it also carries any Election Day versus mail difference.
// Errors are weighted by the truth's ballots: total variation distance of the next-ranking distribution, and the error in
// the share of the first choice's ballots that reach each finalist (the two candidates left in the full count), which is
// what decides a race. Cells where the first choice is a finalist are left out of the second, since those ballots stay put.
// Noise: the truth set is itself a sample. "floor" is the total variation distance between a bootstrap resample of the
// truth and the truth, about what a perfect source would still show. The finalist errors are given as
// sqrt(mean squared error - mean sampling variance of the truth), floored at 0, so they leave the truth's noise out.
// Rows marked "any" use every cell with enough truth and only the race-wide source, whatever the district's own pool.
// Draws are seeded, so the same arguments print the same tables. Writes nothing but stdout.
// Usage: node compare_rank_sources.mjs --seed S --draws D --sizes 10,20,30,50,100,200 --blend 10,30,100,300 --min-truth M DIR...
import { join } from "node:path";
import { readBallot } from "../site/static/rcv-tabulate.js";
import { GROUP, eachRow } from "../site/static/rcv-rows.js";
import { add, finalists as finalistsOf, generator, loadContest, readJson } from "./lib.mjs";

const RURAL = new Set([37, 38, 39, 40]);
const MIN_CANDIDATES = 3;
const FLAGS = { seed: "one", draws: "one", sizes: "list", blend: "list", "min-truth": "one" };
const USAGE = "Usage: node compare_rank_sources.mjs --seed S --draws D --sizes N,N --blend K,K --min-truth M DIR...";

function parseArgs(args) {
  const values = {}, dirs = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) { dirs.push(args[i]); continue; }
    const name = args[i].slice(2), kind = FLAGS[name], text = args[++i];
    if (!kind) throw new Error(`Unknown argument ${args[i - 1]}`);
    const numbers = String(text).split(",").map(Number);
    if (text === undefined || numbers.some((x) => !Number.isInteger(x) || x < 1)) throw new Error(`--${name} needs ${kind === "list" ? "comma-separated positive integers" : "a positive integer"}, got ${text}`);
    if (kind === "one" && numbers.length > 1) throw new Error(`--${name} needs one integer, got ${text}`);
    values[name] = kind === "list" ? numbers : numbers[0];
  }
  for (const name of Object.keys(FLAGS)) if (values[name] === undefined) throw new Error(`--${name} is required. ${USAGE}`);
  if (!dirs.length) throw new Error(USAGE);
  return { ...values, dirs };
}
const opts = parseArgs(process.argv.slice(2));
const sizes = [...opts.sizes].sort((a, b) => a - b);
const SOURCES = ["district", "race", ...opts.blend.map((k) => `blend-${k}`)];

function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Sums, per variant, rural or not, row (n or "any") and source.
const blank = () => ({ w: 0, tv: 0, fw: 0, fse: 0, fvar: 0 });
const tables = {}, floors = {}, cellCounts = {};
const group = (rural) => (rural ? "rural" : "other");
const sums = (variant, rural, row, source) => (((tables[variant] ??= {})[group(rural)] ??= {})[row] ??= {})[source] ??= blank();
function noteFloor(variant, rural, row, w, floor, newCell) {
  const key = `${variant}|${group(rural)}|${row}`;
  floors[key] ??= { w: 0, floor: 0 };
  floors[key].w += w;
  floors[key].floor += w * floor;
  if (newCell) cellCounts[key] = (cellCounts[key] ?? 0) + 1;
}

function analyse(c, variant, salt) {
  const { letters } = c, K = letters.length;
  const all = new Set(letters), finals = new Set(finalistsOf(c)), finalists = [...finals];
  const first = c.patterns.map((p) => readBallot(p, all));
  // Per first choice and ballot ranking, a code: next * 4 + finalist. next is the index of the candidate the ballot goes to
  // after its first choice, or K for stopping. finalist is read with only the finalists continuing, or 2 for stopping.
  const codes = new Map(letters.map((l) => {
    const others = new Set(letters.filter((x) => x !== l));
    return [l, Uint8Array.from(c.patterns, (p) => {
      const next = letters.indexOf(readBallot(p, others));
      const fin = finalists.indexOf(readBallot(p, finals));
      return (next < 0 ? K : next) * 4 + (fin < 0 ? 2 : fin);
    })];
  }));
  // first choice -> district -> { day, mail, every }, each a Map of ranking -> ballots
  const byFirst = new Map(letters.map((l) => [l, new Map()]));
  for (const { pattern, hd, group: g, count } of eachRow(c)) {
    if (!all.has(first[pattern])) continue;
    const districts = byFirst.get(first[pattern]);
    if (!districts.has(hd)) districts.set(hd, { day: new Map(), mail: new Map(), every: new Map() });
    const cell = districts.get(hd);
    add(cell.every, pattern, count);
    if (g === GROUP.ELECTION_DAY) add(cell.day, pattern, count);
    if (g === GROUP.EARLY || g === GROUP.ABSENTEE) add(cell.mail, pattern, count);
  }
  const random = generator(opts.seed ^ Math.imul(c.id, 0x9e3779b1) ^ salt);
  const expand = (counts, l) => {
    const out = [], code = codes.get(l);
    for (const [p, n] of counts) for (let i = 0; i < n; i++) out.push(code[p]);
    return Uint8Array.from(out);
  };
  // Counts of next and finalist over the first `upTo` codes.
  const tally = (list, upTo = list.length) => {
    const next = new Float64Array(K + 1), fin = new Float64Array(3);
    for (let i = 0; i < upTo; i++) { next[list[i] >> 2]++; fin[list[i] & 3]++; }
    return { next, fin };
  };
  const blendOf = (counts, n, rest, restN, k) => Array.from(counts, (x, i) => (x + (k * rest[i]) / restN) / (n + k));

  for (const l of letters) {
    const districts = byFirst.get(l), isFinalist = finals.has(l);
    for (const hd of [...districts.keys()].sort((a, b) => a - b)) {
      const rural = RURAL.has(hd);
      const dayCodes = expand(districts.get(hd).day, l), mailCodes = expand(districts.get(hd).mail, l);
      const truthSize = variant === "mail" ? dayCodes.length : Math.ceil(dayCodes.length / 2);
      if (truthSize < opts["min-truth"]) continue;
      // The race's other districts, exactly.
      const rest = new Float64Array(K + 1), restFin = new Float64Array(3);
      for (const [other, cell] of districts) {
        if (other === hd) continue;
        const t = tally(expand(cell.every, l));
        t.next.forEach((x, i) => { rest[i] += x; });
        t.fin.forEach((x, i) => { restFin[i] += x; });
      }
      const restN = rest.reduce((a, b) => a + b, 0);
      if (!restN) continue;
      const raceNext = Array.from(rest, (x) => x / restN), raceFin = Array.from(restFin, (x) => x / restN);

      for (let draw = 0; draw < opts.draws; draw++) {
        let truthCodes = dayCodes, pool = Uint8Array.from(mailCodes);
        if (variant === "split") {
          const shuffled = Uint8Array.from(dayCodes);
          shuffle(shuffled, random);
          truthCodes = shuffled.subarray(0, truthSize);
          pool = Uint8Array.from(shuffled.subarray(truthSize));
        } else {
          shuffle(pool, random);
        }
        const t = truthSize, truth = tally(truthCodes);
        const truthNext = Array.from(truth.next, (x) => x / t), truthFin = Array.from(truth.fin, (x) => x / t);
        const tv = (est) => 0.5 * est.reduce((s, x, i) => s + Math.abs(x - truthNext[i]), 0);
        const boot = new Float64Array(K + 1);
        for (let i = 0; i < t; i++) boot[truthCodes[Math.floor(random() * t)] >> 2]++;
        const floor = tv(Array.from(boot, (x) => x / t));

        // est* are shares. A finalist is skipped when it is the first choice itself.
        const score = (row, source, estNext, estFin) => {
          const a = sums(variant, rural, row, source);
          a.w += t;
          a.tv += t * tv(estNext);
          if (isFinalist) return;
          for (let f = 0; f < finalists.length; f++) {
            const e = estFin[f] - truthFin[f];
            a.fw += t; a.fse += t * e * e; a.fvar += truthFin[f] * (1 - truthFin[f]);
          }
        };
        score("any", "race", raceNext, raceFin);
        noteFloor(variant, rural, "any", t, floor, draw === 0);
        for (const n of sizes) {
          if (pool.length < n) continue;
          const sample = tally(pool, n), row = String(n);
          score(row, "district", Array.from(sample.next, (x) => x / n), Array.from(sample.fin, (x) => x / n));
          score(row, "race", raceNext, raceFin);
          for (const k of opts.blend) score(row, `blend-${k}`, blendOf(sample.next, n, rest, restN, k), blendOf(sample.fin, n, restFin, restN, k));
          noteFloor(variant, rural, row, t, floor, draw === 0);
        }
      }
    }
  }
}

const pad = (x, w) => String(x).padStart(w);
const pct = (x) => (x * 100).toFixed(1);
function print(variant, groupName, metric) {
  const groups = groupName === "all" ? ["rural", "other"] : [groupName];
  console.log(`\n${variant}, ${groupName}: ${metric === "tv" ? "total variation distance, % points" : "error in the share reaching a finalist, % points, truth noise removed"}`);
  console.log([pad("n", 5), pad("cells", 6), pad("floor", 6), ...SOURCES.map((s) => pad(s, 10))].join(" "));
  for (const row of ["any", ...sizes.map(String)]) {
    const total = {}, floor = { w: 0, floor: 0 };
    let cells = 0;
    for (const g of groups) {
      const f = floors[`${variant}|${g}|${row}`];
      if (f) { floor.w += f.w; floor.floor += f.floor; cells += cellCounts[`${variant}|${g}|${row}`] ?? 0; }
      for (const s of SOURCES) {
        const a = tables[variant]?.[g]?.[row]?.[s];
        if (!a) continue;
        const sum = (total[s] ??= blank());
        for (const key of Object.keys(sum)) sum[key] += a[key];
      }
    }
    if (!floor.w) continue;
    const value = (s) => {
      const a = total[s];
      if (!a || !a.w) return "-";
      if (metric === "tv") return pct(a.tv / a.w);
      return a.fw ? pct(Math.sqrt(Math.max(0, (a.fse - a.fvar) / a.fw))) : "-";
    };
    console.log([pad(row, 5), pad(cells, 6), pad(metric === "tv" ? pct(floor.floor / floor.w) : "", 6), ...SOURCES.map((s) => pad(value(s), 10))].join(" "));
  }
}

console.log(`seed ${opts.seed}, ${opts.draws} draws, sizes ${sizes.join(",")}, blend ${opts.blend.join(",")}, min-truth ${opts["min-truth"]}`);
for (const dir of opts.dirs) {
  const index = readJson(join(dir, "ballots.json"));
  console.log(`\n=== ${dir}`);
  for (const t of [tables, floors, cellCounts]) for (const key of Object.keys(t)) delete t[key];
  const used = [];
  for (const { id, name } of index.contests) {
    const c = loadContest(dir, id);
    c.letters = c.candidates.map((x) => x.letter);
    const districts = new Set(Array.from({ length: c.rows.length / 4 }, (_, i) => c.rows[4 * i + 1]));
    if (c.letters.length < MIN_CANDIDATES || districts.size < 2) continue;
    used.push(name);
    analyse(c, "split", 0);
    analyse(c, "mail", 0x5bd1e995);
  }
  console.log(`races: ${used.join("; ")}`);
  for (const variant of ["split", "mail"]) {
    for (const g of ["all", "rural", "other"]) {
      print(variant, g, "tv");
      print(variant, g, "finalist");
    }
  }
}
