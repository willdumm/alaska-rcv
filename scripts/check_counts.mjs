// Vote total checks between the CVR and the Division's summary, for each refresh. Writes nothing.
// Usage: node check_counts.mjs DATA_DIR
//
// The summary counts each ballot's first rank as marked, so a ballot that gets to a candidate past a blank or write-in
// first rank is in the count's round 1 but not in the summary's votes. That leaves two exact checks, per contest,
// candidate and district:
// - The CVR's first-rank marks can't exceed the summary's votes: the summary has everything the CVR has, and more.
// - They must equal them in a district whose ballots are all in the CVR: nothing there was counted by hand.
// Exits with an error if either fails. It also prints how many votes the count's round 1 has beyond the summary.
import { join } from "node:path";
import { readBallot } from "../site/static/rcv-tabulate.js";
import { eachRow } from "../site/static/rcv-rows.js";
import { add, everyContest, readJson } from "./lib.mjs";

const dir = process.argv[2];
const index = readJson(join(dir, "ballots.json")), coverage = readJson(join(dir, "coverage.json"));

const METHODS = ["ed", "ab", "ev", "q", "rm"];
const fullyScanned = new Set(Object.entries(coverage.districts)
  .filter(([, d]) => Object.keys(d.summary).length && METHODS.every((m) => (d.summary[m] || 0) === (d.cvr[m] || 0)))
  .map(([hd]) => Number(hd)));

const problems = [];
let cells = 0, exact = 0, beyondSummary = 0;
const racesBeyond = new Set();
const contests = everyContest(dir, index);
for (const c of contests) {
  const summary = coverage.contests[c.summaryName ?? c.name];
  if (!summary) { problems.push(`${c.name}: not in the summary`); continue; }
  const letters = new Set(c.candidates.map((x) => x.letter));
  const firstMark = new Map(), firstRound = new Map();
  for (const { pattern, hd, count } of eachRow(c)) {
    const ranking = c.patterns[pattern];
    if (letters.has(ranking[0])) add(firstMark, `${ranking[0]}|${hd}`, count);
    const read = readBallot(ranking, letters);
    if (letters.has(read)) add(firstRound, `${read}|${hd}`, count);
  }
  for (const x of c.candidates) {
    const name = x.summaryName ?? x.name;
    const votes = summary.byDistrict[name];
    if (!votes) { problems.push(`${c.name}: ${name} isn't in the summary`); continue; }
    for (const hd of Object.keys(coverage.districts).map(Number)) {
      const inSummary = votes[hd] || 0, marks = firstMark.get(`${x.letter}|${hd}`) || 0, round = firstRound.get(`${x.letter}|${hd}`) || 0;
      cells++;
      if (marks > inSummary) problems.push(`${c.name}, ${name}, HD ${hd}: ${marks} first-rank marks in the CVR, more than the summary's ${inSummary}`);
      if (fullyScanned.has(hd)) {
        exact++;
        if (marks !== inSummary) problems.push(`${c.name}, ${name}, HD ${hd}: ${marks} first-rank marks in a fully scanned district, against the summary's ${inSummary}`);
      }
      if (round > inSummary) { beyondSummary += round - inSummary; racesBeyond.add(c.name); }
    }
  }
}
console.log(`${contests.length} contests, ${cells} candidate and district counts, ${exact} of them in the ${fullyScanned.size} fully scanned districts.`);
console.log(`Round 1 has ${beyondSummary} votes beyond the summary, in ${racesBeyond.size} races, from ballots past a blank or write-in first rank.`);
problems.slice(0, 30).forEach((p) => console.log(`PROBLEM ${p}`));
console.log(`${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
