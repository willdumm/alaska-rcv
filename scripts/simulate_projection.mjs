// Simulates each race with at least two candidates, and each ballot measure: fills in the ballots still to be counted with copies of real CVR
// rankings, then runs the page's tabulator. scripts/README.md has how to rerun it, SIMULATION.md has the whole method, and the page's
// "Simulated projection" section has the assumptions in words. Same inputs give a byte-identical file.
// Usage: node simulate_projection.mjs DATA_DIR OUT.json --runs 1000 --seed S --tau T --tau-local T --tau-party T --min-pool N --min-bucket N
// With --hand-only it adds only the hand-counted ballots, and stops with an error unless each race's first-rank marks are
// exactly what the simulation meant to add, write-ins included. OUT.json is then only useful for checking. This checks the
// simulation's arithmetic, not the data: check_counts.mjs is what compares the CVR with the Division's summary.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tabulate } from "../site/static/rcv-tabulate.js";
import { questionedAheadOfCvr, questionedByDistrict, turnoutSince2024, uncountedByDistrict } from "../site/static/rcv-uncounted.js";
import { GROUP, eachRow } from "../site/static/rcv-rows.js";
import { outcomeRows, partyGroup, seatsPerRun, senateDistricts } from "../site/static/rcv-chambers.js";
import { projectedBallots } from "../site/static/rcv-projected.js";
import { firstChoices } from "../site/static/rcv-model.js";
import { add, binomial, everyContest, gaussian, generator, readJson } from "./lib.mjs";

// Every value is recorded in the output and decides the result, so a bad or missing one has to stop the run.
const NUMBERS = { runs: "integer", seed: "integer", tau: "number", "tau-local": "number", "tau-party": "number", "min-pool": "integer", "min-bucket": "integer" };
const USAGE = "Usage: node simulate_projection.mjs DATA_DIR OUT.json --runs N --seed S --tau T --tau-local T --tau-party T --min-pool N --min-bucket N [--hand-only]";
export function parseFlags(args) {
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
  if (values["tau-party"] > values["tau-local"]) throw new Error("--tau-party can't be more than --tau-local");
  const { runs, seed, tau, "tau-local": tauLocal, "tau-party": tauParty, "min-pool": minPool, "min-bucket": minBucket } = values;
  return { runs, seed, tau, tauLocal, tauParty, minPool, minBucket, handOnly };
}

// Weighted draws with replacement from [[pattern index, weight], ...].
export class Pool {
  constructor(entries, random) {
    this.random = random;
    this.entries = entries;
    this.total = entries.reduce((total, e) => total + e[1], 0);
  }
  // n draws at once: each pattern's count given what's left, the same distribution as n single draws, at a cost per pattern.
  drawInto(out, n) {
    const { entries, random } = this;
    let left = n, weightLeft = this.total;
    for (let i = 0; i < entries.length && left > 0; i++) {
      const [pattern, weight] = entries[i];
      const k = i === entries.length - 1 ? left : binomial(left, weight / weightLeft, random);
      if (k) add(out, pattern, k);
      left -= k;
      weightLeft -= weight;
    }
    return out;
  }
}

// `size` draws with replacement, by default as many as there are ballots.
function resample(counts, random, size) {
  const pool = new Pool([...counts], random);
  return pool.drawInto(new Map(), size ?? pool.total);
}

const merged = (...maps) => {
  const out = new Map();
  for (const map of maps) for (const [key, n] of map) add(out, key, n);
  return out;
};
const totalOf = (counts) => { let total = 0; for (const n of counts.values()) total += n; return total; };
const sumOf = (values, of) => values.reduce((sum, v) => sum + of(v), 0);

function poisson(mean, random) {
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian(random)));
  let k = 0, term = Math.exp(-mean), reached = term;
  const u = random();
  while (u > reached) { k++; term *= mean / k; reached += term; }
  return k;
}

// Everything about a contest that stays the same from one simulation to the next.
function prepareRace(c, { index, coverage, uncounted, questioned }) {
  const statewide = Boolean(c.measure || index.statewide.includes(c.id));
  const letters = c.candidates.map((x) => x.letter);
  const everyone = new Set(letters);
  // Each ballot's first rank as marked, as the summary counts it: a candidate, "W" for a write-in, or null for a blank or
  // overvote. rcv-projected.js picks hand-counted ballots' rankings by the same mark. Tabulating still reads the whole ballot.
  const mark = c.patterns.map((p) => (everyone.has(p[0]) || p[0] === "W" ? p[0] : null));
  const firstChoiceIs = (l) => ([p]) => mark[p] === l;

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
    if (mark[pattern]) add(cvrFirst.get(hd), mark[pattern], n);
  }

  const summary = coverage.contests[c.summaryName ?? c.name].byDistrict;
  const summaryName = new Map(c.candidates.map((x) => [x.letter, x.summaryName ?? x.name]));
  const summaryVotes = (l, hd) => summary[summaryName.get(l)][hd] || 0;
  // The contest isn't on every ballot: overseas absentee voters had federal races only. Those districts get nothing.
  const allDistricts = Object.keys(coverage.districts).map(Number).sort((a, b) => a - b);
  const hds = allDistricts.filter((hd) => electionDay.has(hd) || earlyAbsentee.has(hd) || letters.some((l) => summaryVotes(l, hd)));
  const hand = new Map(hds.map((hd) => [hd, new Map(letters.map((l) => [l, Math.max(0, summaryVotes(l, hd) - (cvrFirst.get(hd)?.get(l) || 0))]))]));
  const cvrFirstTotals = new Map();
  for (const counts of cvrFirst.values()) for (const [l, n] of counts) add(cvrFirstTotals, l, n);
  // The summary has write-ins by contest only, so those the CVR doesn't have are shared among districts by their
  // hand-counted votes for candidates, as rcv-projected.js does, in whole ballots: each district gets its share rounded down,
  // and the ballots left over go to the largest remainders.
  const summaryWriteIns = coverage.contests[c.summaryName ?? c.name].writeIn ?? 0;
  const handWriteIns = Math.max(0, summaryWriteIns - (cvrFirstTotals.get("W") || 0));
  const handVotes = hds.map((hd) => totalOf(hand.get(hd)));
  const allHandVotes = sumOf(handVotes, (n) => n);
  if (handWriteIns && allHandVotes) {
    const exact = handVotes.map((n) => (handWriteIns * n) / allHandVotes);
    const shares = exact.map(Math.floor);
    const left = handWriteIns - sumOf(shares, (n) => n);
    const byRemainder = exact.map((_, i) => i).sort((i, j) => exact[j] - shares[j] - (exact[i] - shares[i]) || i - j);
    for (const i of byRemainder.slice(0, left)) shares[i]++;
    hds.forEach((hd, i) => { if (shares[i]) hand.get(hd).set("W", shares[i]); });
  }
  const questionedExpected = questionedByDistrict(coverage, questioned, statewide);
  const questionedHere = new Map(hds.map((hd) => [hd, Math.max(0, questionedExpected.get(hd) - (cvrQuestioned.get(hd) || 0) - questionedAheadOfCvr(coverage, questioned, statewide, hd))]));
  const uncountedHere = new Map(hds.map((hd) => [hd, uncounted.get(hd) || 0]));

  const statewideByFirst = new Map([...letters, "W"].map((l) => [l, new Map([...whole].filter(firstChoiceIs(l)))]));

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

  return { c, statewide, letters, everyone, mark, firstChoiceIs, summaryWriteIns, whole, electionDay, earlyAbsentee, hds, multiDistrict: hds.length > 1, hand, questionedHere, uncountedHere, cvrFirstTotals, statewideByFirst, totals };
}

// Multiplies each candidate's first-choice bucket by exp(z), rescaled so ballots with a write-in, blank or overvote first
// keep their share. Buckets go by first rank as marked, so a ballot reassigned from a write-in or blank doesn't lean.
function leaned(counts, lean, race, noBucket, random) {
  const { everyone, mark, letters } = race;
  const entries = [...counts];
  let plain = 0, weighted = 0;
  const seen = new Set();
  for (const [p, n] of entries) {
    if (!everyone.has(mark[p])) continue;
    seen.add(mark[p]);
    plain += n;
    weighted += n * lean[mark[p]];
  }
  for (const l of letters) if (!seen.has(l)) noBucket[l]++;
  const scale = weighted ? plain / weighted : 1;
  return new Pool(entries.map(([p, n]) => [p, everyone.has(mark[p]) ? n * lean[mark[p]] * scale : n]), random);
}

// Later rankings for a hand-counted first choice, from the same first choice on the district's Election Day
// ballots, then its others. A short list is filled up from the rest of the contest, if it has any.
function handBucket(l, day, mail, race, minBucket, random) {
  const { c, firstChoiceIs, multiDistrict, statewideByFirst } = race;
  const fromDay = new Map([...day].filter(firstChoiceIs(l)));
  const bucket = totalOf(fromDay) >= minBucket ? fromDay : merged(fromDay, new Map([...mail].filter(firstChoiceIs(l))));
  const short = minBucket - totalOf(bucket);
  if (short <= 0 || (!multiDistrict && bucket.size)) return { bucket, filled: false };
  // A write-in with no candidate ranked after it counts for no one, so with nothing to copy, nothing changes the count.
  if (l === "W" && !statewideByFirst.get(l).size) return { bucket, filled: false };
  if (!statewideByFirst.get(l).size) throw new Error(`${c.name}: hand-counted votes for ${l}, who has no CVR ballots to copy rankings from`);
  return { bucket: merged(bucket, resample(statewideByFirst.get(l), random, short)), filled: true };
}

// A pool for ballots we know nothing about yet. A small one is filled up from the district's other ballots,
// including the hand-counted ones, whose first choices the Division has published.
function filledPool(pool, district, minPool, random) {
  const short = minPool - totalOf(pool);
  if (short <= 0 || !district.size) return { pool, filled: false };
  return { pool: merged(pool, resample(district, random, short)), filled: true };
}

// One district's part of one simulation, added to `ballots`.
function fillDistrict(hd, ballots, lean, race, { settings, turnout, random, toppedUp, noBucket }) {
  const { c, letters, electionDay, earlyAbsentee, hand, uncountedHere, questionedHere } = race;
  const day = electionDay.has(hd) ? resample(electionDay.get(hd), random) : new Map();
  const mail = earlyAbsentee.has(hd) ? resample(earlyAbsentee.get(hd), random) : new Map();

  // Hand-counted ballots' first choices are known, so they aren't leaned: only later rankings are drawn.
  const handBallots = new Map();
  for (const [l, need] of hand.get(hd)) {
    if (!need) continue;
    const { bucket, filled } = handBucket(l, day, mail, race, settings.minBucket, random);
    if (l === "W" && !bucket.size) continue;
    if (filled) toppedUp.hand += need;
    new Pool([...bucket], random).drawInto(handBallots, need);
  }
  for (const [p, n] of handBallots) add(ballots, p, n);
  if (settings.handOnly) return;

  // A count that's only an estimate: districts stray from it as far as their turnout strayed from 2024's.
  const drawCount = (mean) => (mean > 0 ? poisson(mean * Math.exp(gaussian(random) * turnout.sdLog), random) : 0);
  const district = merged(day, mail, handBallots);
  const fillFrom = (kind, n, counts) => {
    if (!n) return;
    const { pool, filled } = filledPool(counts, district, settings.minPool, random);
    if (!pool.size) throw new Error(`${c.name}: no ballots to copy for HD ${hd}`);
    if (filled) toppedUp[kind] += n;
    leaned(pool, lean, race, noBucket, random).drawInto(ballots, n);
  };
  fillFrom("uncounted", drawCount(uncountedHere.get(hd)), mail);
  fillFrom("questioned", drawCount(questionedHere.get(hd)), merged(day, handBallots));
}

// With only hand-counted ballots added, each candidate's first ranks must be the summary's wherever it has more than the CVR,
// and write-ins the summary's too, if any were added.
function checkHandCounted(ballots, race) {
  const { c, letters, mark, hds, hand, cvrFirstTotals, summaryWriteIns } = race;
  const marked = new Map();
  for (const [p, n] of ballots) if (mark[p]) add(marked, mark[p], n);
  for (const l of [...letters, "W"]) {
    const added = sumOf(hds, (hd) => hand.get(hd).get(l) || 0);
    const expected = (cvrFirstTotals.get(l) || 0) + added;
    if ((marked.get(l) || 0) !== expected) throw new Error(`${c.name}: ${l} is ranked first on ${marked.get(l) || 0} ballots, expected ${expected}`);
    if (l === "W" && added && expected !== summaryWriteIns) throw new Error(`${c.name}: ${expected} write-ins first, but the summary has ${summaryWriteIns}`);
  }
}

const median = (sorted) => (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
const roundedShare = (x) => Number(x.toFixed(4));
const ascending = (a, b) => a - b;

// What the page needs from every simulation of a contest: each winner's winning share in every simulation they won, by the round
// they won it in, smallest first. These are all the dots on the page. A tied simulation has only its count.
export function summarizeRuns(results, letters) {
  const winners = {};
  for (const l of letters) {
    const wins = results.filter((r) => r.winner === l);
    if (!wins.length) continue;
    const byRound = {};
    for (const round of new Set(wins.map((r) => r.round))) {
      byRound[round] = wins.filter((r) => r.round === round).map((r) => r.share).sort(ascending).map(roundedShare);
    }
    winners[l] = { wins: wins.length, byRound, medianShare: roundedShare(median(wins.map((r) => r.share).sort(ascending))) };
  }
  const won = results.filter((r) => r.winner);
  return { winners, ties: results.length - won.length, highShare: won.length ? roundedShare(Math.max(...won.map((r) => r.share))) : 0 };
}

function simulateContest(c, world, settings) {
  const { runs, seed, tau: tauStatewide, tauLocal, tauParty, handOnly } = settings;
  const { turnout, partyLeans } = world;
  const random = generator(seed ^ Math.imul(c.id, 0x9e3779b1));
  const race = prepareRace(c, world);
  const { statewide, letters, whole, hds, totals } = race;
  const tau = statewide ? tauStatewide : tauLocal;
  // In State House and Senate races, part of a Republican's or Democrat's lean is shared by their party across every such race
  // in the simulation, which is what makes seat counts meaningful. The rest is the race's own, so each lean still has sd tau.
  const ownTau = statewide ? tau : Math.sqrt(tauLocal ** 2 - tauParty ** 2);
  const sharedLean = (x, run) => {
    const party = statewide ? "other" : partyGroup(x.parties?.[0]);
    return party === "other" ? { shared: 0, own: tau } : { shared: partyLeans[run][party], own: ownTau };
  };

  const toppedUp = { hand: 0, uncounted: 0, questioned: 0 };
  const noBucket = Object.fromEntries(letters.map((l) => [l, 0]));
  const results = [];
  for (let run = 0; run < runs; run++) {
    const z = Object.fromEntries(c.candidates.map((x) => {
      const { shared, own } = sharedLean(x, run);
      return [x.letter, shared + gaussian(random) * own];
    }));
    const lean = Object.fromEntries(letters.map((l) => [l, Math.exp(z[l])]));
    const ballots = new Map(whole);
    for (const hd of hds) fillDistrict(hd, ballots, lean, race, { settings, turnout, random, toppedUp, noBucket });

    const result = tabulate([...ballots].map(([p, n]) => [c.patterns[p], n]), letters);
    if (handOnly) checkHandCounted(ballots, race);
    const last = result.rounds[result.rounds.length - 1];
    results.push({
      winner: result.leader,
      round: result.rounds.length,
      share: Math.max(...Object.values(last.votes)) / last.active,
    });
  }

  const perRun = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number((v / runs).toFixed(1))]));
  return { name: c.name, tau, ballots: totals, toppedUpPerRun: perRun(toppedUp), noLeanTargetPerRun: perRun(noBucket), runs: results };
}

// Each district's write-in or blank first choices in a race, as the race's own page counts them (firstChoices on
// countedBallots), so the all-seats view, which loads no ballots, can include them in its totals.
function writeInOrBlank(c, coverage) {
  const summary = coverage.contests[c.summaryName ?? c.name];
  const letters = c.candidates.map((x) => x.letter);
  const byLetter = new Map(c.candidates.map((x) => [x.letter, x.summaryName ?? x.name]));
  const projected = projectedBallots(c, (l) => summary.byDistrict[byLetter.get(l)], summary.writeIn ?? 0);
  const counts = [...projected].map(([hd, ballots]) => [hd, Number((firstChoices({ letters }, ballots)?.votes.W ?? 0).toFixed(2))]);
  return Object.fromEntries(counts.filter(([, n]) => n > 0));
}

// The seats each chamber has: its races this election, and those not on the ballot from holdovers.json.
function buildChambers(contests, holdovers, coverage) {
  const race = (c, seat, hds) => ({ id: c.id, name: c.name, seat, hds, candidates: c.candidates.map((x) => ({ letter: x.letter, name: x.name, party: x.parties?.[0] ?? "" })), writeInOrBlank: writeInOrBlank(c, coverage) });
  const chamberOf = (name, seats, races, notOnBallot) => {
    const hds = [...races, ...notOnBallot].flatMap((x) => x.hds).sort((a, b) => a - b);
    if (races.length + notOnBallot.length !== seats || hds.some((hd, i) => hd !== i + 1) || hds.length !== 40) throw new Error(`${name}: races and seats not on the ballot don't cover ${seats} seats and every house district`);
    return { name, seats, races, notOnBallot };
  };
  const named = (pattern) => contests.filter((c) => pattern.test(c.name));
  return {
    senate: chamberOf("State Senate", 20, named(/^Senate District /).map((c) => {
      const letter = c.name.at(-1);
      return race(c, `Senate ${letter}`, senateDistricts(letter));
    }), holdovers.senate),
    house: chamberOf("State House", 40, named(/^House District /).map((c) => {
      const hd = Number(c.name.split(" ").at(-1));
      return race(c, `HD ${hd}`, [hd]);
    }), []),
  };
}

// What's written to projection.json. settings is what parseFlags returns.
export function simulateProjection(dataDir, settings) {
  const { runs, seed, tau, tauLocal, tauParty, minPool, minBucket } = settings;
  const load = (name) => readJson(join(dataDir, name));
  const index = load("ballots.json"), coverage = load("coverage.json"), questioned = load("questioned-2024.json");
  const uncounted = uncountedByDistrict(coverage, load("early-absentee-2024.json"));
  const turnout = turnoutSince2024(coverage, questioned);
  // Drawn once per simulation, from their own generator, so a race's draws don't depend on the others.
  const partyRandom = generator(seed ^ 0x51ed270b);
  const partyLeans = Array.from({ length: runs }, () => ({ republican: gaussian(partyRandom) * tauParty, democrat: gaussian(partyRandom) * tauParty }));
  const world = { index, coverage, uncounted, questioned, turnout, partyLeans };

  const simulated = {}, all = everyContest(dataDir, index);
  for (const c of all) {
    if (c.candidates.length >= 2) simulated[c.id] = simulateContest(c, world, settings);
  }
  const chambers = buildChambers(all, load("holdovers.json"), coverage);
  // Seat counts need every race's result from the same simulation, so they're worked out here, while all the results exist.
  for (const chamber of Object.values(chambers)) chamber.outcomes = outcomeRows(seatsPerRun(chamber, { parameters: { runs }, contests: simulated }));
  const contests = Object.fromEntries(all.filter((c) => simulated[c.id]).map((c) => {
    const { runs: results, ...rest } = simulated[c.id];
    return [c.id, { ...rest, ...summarizeRuns(results, c.candidates.map((x) => x.letter)) }];
  }));
  const parameters = { runs, seed, tau, tauLocal, tauParty, minPool, minBucket, turnoutScale: Number(turnout.scale.toFixed(3)), turnoutSdLog: Number(turnout.sdLog.toFixed(3)) };
  return { parameters, cvrLastModified: coverage.cvrLastModified, chambers, contests };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dataDir, output, ...flags] = process.argv.slice(2);
  if (!dataDir || !output || dataDir.startsWith("--") || output.startsWith("--")) throw new Error(USAGE);
  writeFileSync(output, `${JSON.stringify(simulateProjection(dataDir, parseFlags(flags)))}\n`);
}
