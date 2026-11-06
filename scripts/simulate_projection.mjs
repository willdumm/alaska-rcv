// Simulates each race with at least two candidates, and each ballot measure: fills in the ballots still to be counted with copies of real CVR
// rankings, then runs the page's tabulator. scripts/README.md has how to rerun it, SIMULATION.md has the whole method, and the page's
// "Simulated projection" section has the assumptions in words. Same inputs give a byte-identical file.
// Usage: node simulate_projection.mjs DATA_DIR OUT.json --runs 100 --seed S --tau T --tau-local T --tau-party T --min-pool N --min-bucket N
// With --hand-only it adds only the hand-counted ballots, and stops with an error unless each race's first round has
// exactly the votes the simulation meant to add. OUT.json is then only useful for checking. This checks the simulation's
// arithmetic, not the data: check_counts.mjs is what compares the CVR with the Division's summary.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readBallot, tabulate } from "../site/static/rcv-tabulate.js";
import { questionedAheadOfCvr, questionedByDistrict, turnoutSince2024, uncountedByDistrict } from "../site/static/rcv-uncounted.js";
import { measureContest, measuresIn } from "../site/static/rcv-measures.js";
import { GROUP, eachRow } from "../site/static/rcv-rows.js";
import { partyGroup, senateDistricts } from "../site/static/rcv-chambers.js";

// Every value is recorded in the output and decides the result, so a bad or missing one has to stop the run.
const NUMBERS = { runs: "integer", seed: "integer", tau: "number", "tau-local": "number", "tau-party": "number", "min-pool": "integer", "min-bucket": "integer" };
function parseFlags(args) {
  const values = {};
  let handOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hand-only") { handOnly = true; continue; }
    const name = args[i].replace(/^--/, "");
    if (!args[i].startsWith("--") || !NUMBERS[name]) throw new Error(`Unknown argument ${args[i]}`);
    const text = args[++i], value = Number(text);
    if (text === undefined || text.trim() === "" || !Number.isFinite(value) || (NUMBERS[name] === "integer" && !Number.isInteger(value))) {
      throw new Error(`--${name} needs ${NUMBERS[name] === "integer" ? "an integer" : "a number"}, got ${text}`);
    }
    if (value < 0) throw new Error(`--${name} can't be negative, got ${text}`);
    values[name] = value;
  }
  for (const name of Object.keys(NUMBERS)) if (values[name] === undefined) throw new Error(`--${name} is required`);
  if (values.runs < 1) throw new Error("--runs must be at least 1");
  return { values, handOnly };
}
const [dataDir, output, ...flags] = process.argv.slice(2);
if (!dataDir || !output || dataDir.startsWith("--") || output.startsWith("--")) throw new Error("Usage: node simulate_projection.mjs DATA_DIR OUT.json --runs N --seed S --tau T --tau-local T --min-pool N --min-bucket N [--hand-only]");
const { values, handOnly } = parseFlags(flags);
const { runs, seed, tau: tauStatewide, "tau-local": tauLocal, "tau-party": tauParty, "min-pool": minPool, "min-bucket": minBucket } = values;
const load = (name) => JSON.parse(readFileSync(join(dataDir, name), "utf8"));

// mulberry32: small, seedable, and the same on every machine.
function generator(start) {
  let s = start | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted draws from { pattern index: weight }, by binary search over the running total.
class Pool {
  constructor(entries, random) {
    this.random = random;
    this.patterns = entries.map((e) => e[0]);
    this.cumulative = new Float64Array(entries.length);
    let total = 0;
    entries.forEach((e, i) => { total += e[1]; this.cumulative[i] = total; });
    this.total = total;
  }
  draw() {
    const u = this.random() * this.total, { cumulative } = this;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] > u) hi = mid; else lo = mid + 1;
    }
    return this.patterns[lo];
  }
}

const add = (map, key, n) => map.set(key, (map.get(key) || 0) + n);

// `size` draws with replacement, by default as many as there are ballots.
function resample(counts, random, size) {
  const pool = new Pool([...counts], random), out = new Map();
  const draws = size ?? pool.total;
  for (let i = 0; i < draws; i++) add(out, pool.draw(), 1);
  return out;
}

const merged = (...maps) => {
  const out = new Map();
  for (const map of maps) for (const [key, n] of map) add(out, key, n);
  return out;
};
const totalOf = (counts) => { let total = 0; for (const n of counts.values()) total += n; return total; };

function simulateContest(c, coverage, uncounted, turnout, questioned) {
  const random = generator(seed ^ Math.imul(c.id, 0x9e3779b1));
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const poisson = (mean) => {
    if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian()));
    let k = 0, term = Math.exp(-mean), reached = term;
    const u = random();
    while (u > reached) { k++; term *= mean / k; reached += term; }
    return k;
  };
  // A count that's only an estimate: districts stray from it as far as their turnout strayed from 2024's.
  const drawCount = (mean) => (mean > 0 ? poisson(mean * Math.exp(gaussian() * turnout.sdLog)) : 0);

  const statewide = c.measure || index.statewide.includes(c.id);
  const tau = statewide ? tauStatewide : tauLocal;
  // In State House and Senate races, part of a Republican's or Democrat's lean is shared by their party across every such race
  // in the simulation, which is what makes seat counts meaningful. The rest is the race's own, so each lean still has sd tau.
  const ownTau = statewide ? tau : Math.sqrt(tauLocal ** 2 - tauParty ** 2);
  const sharedLean = (x, run) => {
    const party = statewide ? "other" : partyGroup(x.parties?.[0]);
    return party === "other" ? { shared: 0, own: tau } : { shared: partyLeans[run][party], own: ownTau };
  };
  const letters = c.candidates.map((x) => x.letter);
  const everyone = new Set(letters);
  const first = c.patterns.map((p) => readBallot(p, everyone));
  const firstChoiceIs = (l) => ([p]) => first[p] === l;

  const whole = new Map(), electionDay = new Map(), earlyAbsentee = new Map(), cvrFirst = new Map(), cvrQuestioned = new Map();
  for (const { pattern, hd, group, count: n } of eachRow(c)) {
    add(whole, pattern, n);
    if (group === GROUP.ELECTION_DAY || group === GROUP.ABSENTEE || group === GROUP.EARLY) {
      const pools = group === GROUP.ELECTION_DAY ? electionDay : earlyAbsentee;
      if (!pools.has(hd)) pools.set(hd, new Map());
      add(pools.get(hd), pattern, n);
    }
    if (group === GROUP.QUESTIONED) add(cvrQuestioned, hd, n);
    if (!cvrFirst.has(hd)) cvrFirst.set(hd, new Map());
    add(cvrFirst.get(hd), first[pattern], n);
  }

  const summary = coverage.contests[c.summaryName ?? c.name].byDistrict;
  const summaryName = new Map(c.candidates.map((x) => [x.letter, x.summaryName ?? x.name]));
  const summaryVotes = (l, hd) => summary[summaryName.get(l)][hd] || 0;
  // The contest isn't on every ballot: overseas absentee voters had federal races only. Those districts get nothing.
  const allDistricts = Object.keys(coverage.districts).map(Number).sort((a, b) => a - b);
  const hds = allDistricts.filter((hd) => electionDay.has(hd) || earlyAbsentee.has(hd) || letters.some((l) => summaryVotes(l, hd)));
  const multiDistrict = hds.length > 1;
  const hand = new Map(hds.map((hd) => [hd, new Map(letters.map((l) => [l, Math.max(0, summaryVotes(l, hd) - (cvrFirst.get(hd)?.get(l) || 0))]))]));
  const questionedExpected = questionedByDistrict(coverage, questioned, statewide);
  const questionedHere = new Map(hds.map((hd) => [hd, Math.max(0, questionedExpected.get(hd) - (cvrQuestioned.get(hd) || 0) - questionedAheadOfCvr(coverage, questioned, statewide, hd))]));
  const uncountedHere = new Map(hds.map((hd) => [hd, uncounted.get(hd) || 0]));

  const cvrFirstTotals = new Map();
  for (const counts of cvrFirst.values()) for (const [l, n] of counts) add(cvrFirstTotals, l, n);
  const statewideByFirst = new Map(letters.map((l) => [l, new Map([...whole].filter(firstChoiceIs(l)))]));

  const totals = { cvr: totalOf(whole), hand: 0, uncounted: 0, questioned: 0, notOnBallot: 0 };
  for (const hd of hds) {
    totals.hand += totalOf(hand.get(hd));
    totals.uncounted += uncountedHere.get(hd);
    totals.questioned += questionedHere.get(hd);
  }
  totals.uncounted = Math.round(totals.uncounted);
  totals.questioned = Math.round(totals.questioned);
  if (statewide) {
    for (const hd of allDistricts) if (!hds.includes(hd)) totals.notOnBallot += Math.round(uncounted.get(hd) || 0);
  }

  const toppedUp = { hand: 0, uncounted: 0, questioned: 0 };
  const noBucket = Object.fromEntries(letters.map((l) => [l, 0]));

  // Multiplies each candidate's first-choice bucket by exp(z), rescaled so blanks and overvotes keep their share.
  function leaned(counts, lean) {
    const entries = [...counts];
    let plain = 0, weighted = 0;
    const seen = new Set();
    for (const [p, n] of entries) {
      if (!everyone.has(first[p])) continue;
      seen.add(first[p]);
      plain += n;
      weighted += n * lean[first[p]];
    }
    for (const l of letters) if (!seen.has(l)) noBucket[l]++;
    const scale = weighted ? plain / weighted : 1;
    return new Pool(entries.map(([p, n]) => [p, everyone.has(first[p]) ? n * lean[first[p]] * scale : n]), random);
  }

  // Later rankings for a hand-counted first choice, from the same first choice on the district's Election Day
  // ballots, then its others. A short list is filled up from the rest of the contest, if it has any.
  function handBucket(l, day, mail) {
    const fromDay = new Map([...day].filter(firstChoiceIs(l)));
    const bucket = totalOf(fromDay) >= minBucket ? fromDay : merged(fromDay, new Map([...mail].filter(firstChoiceIs(l))));
    const short = minBucket - totalOf(bucket);
    if (short <= 0 || (!multiDistrict && bucket.size)) return { bucket, filled: false };
    if (!statewideByFirst.get(l).size) throw new Error(`${c.name}: hand-counted votes for ${l}, who has no CVR ballots to copy rankings from`);
    return { bucket: merged(bucket, resample(statewideByFirst.get(l), random, short)), filled: true };
  }

  // A pool for ballots we know nothing about yet. A small one is filled up from the district's other ballots,
  // including the hand-counted ones, whose first choices the Division has published.
  function filledPool(pool, district) {
    const short = minPool - totalOf(pool);
    if (short <= 0 || !district.size) return { pool, filled: false };
    return { pool: merged(pool, resample(district, random, short)), filled: true };
  }

  const results = [];
  for (let run = 0; run < runs; run++) {
    const z = Object.fromEntries(c.candidates.map((x) => {
      const { shared, own } = sharedLean(x, run);
      return [x.letter, shared + gaussian() * own];
    }));
    const lean = Object.fromEntries(letters.map((l) => [l, Math.exp(z[l])]));
    const ballots = new Map(whole);

    for (const hd of hds) {
      const day = electionDay.has(hd) ? resample(electionDay.get(hd), random) : new Map();
      const mail = earlyAbsentee.has(hd) ? resample(earlyAbsentee.get(hd), random) : new Map();

      // Hand-counted ballots' first choices are known, so they aren't leaned: only later rankings are drawn.
      const handBallots = new Map();
      for (const l of letters) {
        const need = hand.get(hd).get(l);
        if (!need) continue;
        const { bucket, filled } = handBucket(l, day, mail);
        if (filled) toppedUp.hand += need;
        const pool = new Pool([...bucket], random);
        for (let i = 0; i < need; i++) add(handBallots, pool.draw(), 1);
      }
      for (const [p, n] of handBallots) add(ballots, p, n);
      if (handOnly) continue;

      const district = merged(day, mail, handBallots);
      const fillFrom = (kind, n, counts) => {
        if (!n) return;
        const { pool, filled } = filledPool(counts, district);
        if (!pool.size) throw new Error(`${c.name}: no ballots to copy for HD ${hd}`);
        if (filled) toppedUp[kind] += n;
        const draws = leaned(pool, lean);
        for (let i = 0; i < n; i++) add(ballots, draws.draw(), 1);
      };
      fillFrom("uncounted", drawCount(uncountedHere.get(hd)), mail);
      fillFrom("questioned", drawCount(questionedHere.get(hd)), merged(day, handBallots));
    }

    const result = tabulate([...ballots].map(([p, n]) => [c.patterns[p], n]), letters);
    if (handOnly) {
      for (const l of letters) {
        const expected = (cvrFirstTotals.get(l) || 0) + sumOf(hds, (hd) => hand.get(hd).get(l));
        if (result.rounds[0].votes[l] !== expected) throw new Error(`${c.name}: ${l} has ${result.rounds[0].votes[l]} first-round votes, expected ${expected}`);
      }
    }
    const last = result.rounds[result.rounds.length - 1];
    results.push({
      winner: result.leader,
      round: result.rounds.length,
      votes: Math.max(...Object.values(last.votes)),
      runnerUp: result.runnerUp,
      runnerUpVotes: last.votes[result.runnerUp],
      continuing: last.active,
    });
  }

  const perRun = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number((v / runs).toFixed(1))]));
  return { name: c.name, tau, ballots: totals, toppedUpPerRun: perRun(toppedUp), noLeanTargetPerRun: perRun(noBucket), runs: results };
}

const sumOf = (values, of) => values.reduce((sum, v) => sum + of(v), 0);

const index = load("ballots.json");
const coverage = load("coverage.json");
const uncounted = uncountedByDistrict(coverage, load("early-absentee-2024.json"));
const questioned = load("questioned-2024.json");
const turnout = turnoutSince2024(coverage, questioned);

if (tauParty > tauLocal) throw new Error("--tau-party can't be more than --tau-local");
// Drawn once per simulation, from their own generator, so a race's draws don't depend on the others.
const partyRandom = generator(seed ^ 0x51ed270b);
const partyGaussian = () => Math.sqrt(-2 * Math.log(1 - partyRandom())) * Math.cos(2 * Math.PI * partyRandom());
const partyLeans = Array.from({ length: runs }, () => ({ republican: partyGaussian() * tauParty, democrat: partyGaussian() * tauParty }));

const contests = {};
const everyContest = [...index.contests.map(({ id }) => load(`contest-${id}.json`)), ...measuresIn(index).map((m) => measureContest(m, index.measures))];
for (const c of everyContest) {
  if (c.candidates.length >= 2) contests[c.id] = simulateContest(c, coverage, uncounted, turnout, questioned);
}

// The seats each chamber has: its races this election, and those not on the ballot from holdovers.json.
const race = (c, seat, hds) => ({ id: c.id, name: c.name, seat, hds, candidates: c.candidates.map((x) => ({ letter: x.letter, name: x.name, party: x.parties?.[0] ?? "" })) });
const holdovers = load("holdovers.json");
function chamberOf(name, seats, races, notOnBallot) {
  const hds = [...races, ...notOnBallot].flatMap((x) => x.hds).sort((a, b) => a - b);
  if (races.length + notOnBallot.length !== seats || hds.some((hd, i) => hd !== i + 1) || hds.length !== 40) throw new Error(`${name}: races and seats not on the ballot don't cover ${seats} seats and every house district`);
  return { name, seats, races, notOnBallot };
}
const named = (pattern) => everyContest.filter((c) => pattern.test(c.name));
const chambers = {
  senate: chamberOf("State Senate", 20, named(/^Senate District /).map((c) => {
    const letter = c.name.at(-1);
    return race(c, `Senate ${letter}`, senateDistricts(letter));
  }), holdovers.senate),
  house: chamberOf("State House", 40, named(/^House District /).map((c) => {
    const hd = Number(c.name.split(" ").at(-1));
    return race(c, `HD ${hd}`, [hd]);
  }), []),
};
const parameters = { runs, seed, tau: tauStatewide, tauLocal, tauParty, minPool, minBucket, turnoutScale: Number(turnout.scale.toFixed(3)), turnoutSdLog: Number(turnout.sdLog.toFixed(3)) };
writeFileSync(output, `${JSON.stringify({ parameters, cvrLastModified: coverage.cvrLastModified, chambers, contests })}\n`);
