// Runs the page's tabulator over the 2024 CVR and compares every number with the Division's
// certified round-by-round reports, as pdftotext -layout text.
// Usage: node validate_2024.mjs EXTRACTED_2024_DIR REPORT.txt [REPORT.txt ...]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tabulate } from "../site/static/rcv-tabulate.js";
import { ballotCounts } from "../site/static/rcv-rows.js";

const number = (s) => Number(s.replace(/,/g, ""));
// A long name wraps in the reports, putting its quoted nickname and percentage on the next line.
const official = (votes, name) => votes[name] ?? votes[name.replace(/ ".*"$/, "")];

function parseReport(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  const name = lines.find((l) => /^(U\.S\.|Senate District|House District)/.test(l)).trim();
  const rounds = [];
  for (const line of lines) {
    if (/^Round \d+/.test(line)) { rounds.push({ votes: {} }); continue; }
    if (!rounds.length) continue;
    const round = rounds[rounds.length - 1];
    let m;
    if ((m = line.match(/^\s*(Blanks|Exhausted|Overvotes)\s+([\d,]+)\s*$/))) round[m[1].toLowerCase()] = number(m[2]);
    else if ((m = line.match(/^\s*Continuing Ballots Total\s+([\d,]+)/))) round.active = number(m[1]);
    else if ((m = line.match(/^(\S.*?)\s{2,}([\d,]+)(?:\s+[\d.]+%)?\s*$/))) round.votes[m[1].trim()] = number(m[2]);
    else if ((m = line.match(/^(\S.*?) is eliminated because the candidate had the least/))) round.eliminated = m[1];
  }
  return { name, rounds };
}

const dir = process.argv[2];
const { contests } = JSON.parse(readFileSync(join(dir, "ballots.json"), "utf8"));
const firstRoundMajorities = [];
const needsRcv = new Set();
let failures = 0;
let checked = 0;

function load(id) {
  const c = JSON.parse(readFileSync(join(dir, `contest-${id}.json`), "utf8"));
  return { ...c, ballots: ballotCounts(c), letters: c.candidates.map((x) => x.letter) };
}

for (const path of process.argv.slice(3)) {
  const report = parseReport(path);
  const meta = contests.find((c) => c.name.toLowerCase() === report.name.toLowerCase());
  if (!meta) { console.log(`no contest for ${report.name}`); failures++; continue; }
  needsRcv.add(meta.id);
  const contest = load(meta.id);
  const nameOf = Object.fromEntries(contest.candidates.map((x) => [x.letter, x.name]));
  const mine = tabulate(contest.ballots, contest.letters);
  const diffs = [];
  if (mine.rounds.length !== report.rounds.length) diffs.push(`rounds ${mine.rounds.length} vs official ${report.rounds.length}`);
  report.rounds.forEach((reported, i) => {
    const round = mine.rounds[i];
    if (!round) return;
    for (const key of ["active", "blanks", "exhausted", "overvotes"]) {
      checked++;
      if (round[key] !== reported[key]) diffs.push(`round ${i + 1} ${key}: ${round[key]} vs official ${reported[key]}`);
    }
    for (const [letter, name] of Object.entries(nameOf)) {
      checked++;
      if (round.votes[letter] !== official(reported.votes, name)) diffs.push(`round ${i + 1} ${name}: ${round.votes[letter]} vs official ${official(reported.votes, name)}`);
    }
    const eliminated = nameOf[round.eliminated] ?? "no one";
    if (reported.eliminated && eliminated.replace(/ ".*"$/, "") !== reported.eliminated.replace(/ ".*"$/, "")) diffs.push(`round ${i + 1} eliminated ${eliminated} vs official ${reported.eliminated}`);
  });
  console.log(`${diffs.length ? "DIFF" : "ok  "} ${report.name}: ${report.rounds.length} rounds`);
  diffs.slice(0, 14).forEach((d) => console.log(`       ${d}`));
  failures += diffs.length ? 1 : 0;
}

for (const { id, name } of contests) {
  const c = load(id);
  const r = tabulate(c.ballots, c.letters);
  if (r.majorityInRoundOne === needsRcv.has(id)) {
    console.log(`TRIGGER MISMATCH ${name}: round-one majority ${r.majorityInRoundOne}, official RCV report ${needsRcv.has(id)}`);
    failures++;
  }
}
console.log(`${checked} numbers checked, ${contests.length} contests checked for whether they went to rounds, ${failures} problems`);
process.exit(failures ? 1 : 0);
