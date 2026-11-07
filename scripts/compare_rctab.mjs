// Compares the page's tabulator with RCTab v2.1.0, a separate open source tabulator, round by round in every contest
// with at least two candidates, on the same CVR. Run after prepare_rctab.py and run_rctab.sh.
// Usage: node compare_rctab.mjs EXTRACTED_DIR WORK_DIR
//
// RCTab reads the raw CVR's marks, so this checks extract_cvr.py too. It's compared twice:
// - As is. Differences are expected: RCTab has no setting for the rule that a repeated ranking counts as a blank rank,
//   which reproducing the Division's certified 2024 reports needs (docs/RULES.md).
// - With each repeated ranking in our rankings treated RCTab's way: a rank that's passed over, not a blank one, like a
//   write-in in readBallot. There should be no differences at all.
// Exits with an error unless the second comparison is clean, so it fails if anything but that rule differs.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { tabulate } from "../site/static/rcv-tabulate.js";
import { ballotCounts } from "../site/static/rcv-rows.js";
import { readJson } from "./lib.mjs";

const [dir, work] = process.argv.slice(2);

function repeatsPassedOver(pattern) {
  const seen = new Set();
  return [...pattern].map((char) => {
    if (char === "-" || char === "W" || char === "*") return char;
    if (seen.has(char)) return "W";
    seen.add(char);
    return char;
  }).join("");
}

// RCTab uses a round to declare a majority winner and eliminates no one in it, then repeats that tally in the next round
// and carries on, because of continueUntilTwoCandidatesRemain. `tabulate` has no such round, so it's dropped here, after
// checking the next round really is the same tally.
function roundsWithEliminations(results, contestName) {
  return results.filter((round, i) => {
    if (i === results.length - 1 || round.tallyResults.some((t) => t.eliminated)) return true;
    if (JSON.stringify(round.tally) !== JSON.stringify(results[i + 1].tally)) throw new Error(`${contestName}: RCTab's round ${i + 1} eliminates no one, but the next round's tally differs`);
    return false;
  });
}

function differences(mine, theirs, candidates) {
  const diffs = [];
  diffs.largestVoteGap = 0;
  const results = roundsWithEliminations(theirs.results, theirs.config.contest);
  if (mine.rounds.length !== results.length) diffs.push(`${mine.rounds.length} rounds vs RCTab's ${results.length}`);
  const inactiveOf = (r) => Object.values(r.inactiveBallots).reduce((sum, n) => sum + Number(n), 0) + theirs.summary.undervotes;
  results.forEach((reported, i) => {
    const round = mine.rounds[i];
    if (!round) return;
    for (const { letter, name } of candidates) {
      const votes = Number(reported.tally[name] ?? 0);
      diffs.largestVoteGap = Math.max(diffs.largestVoteGap, Math.abs(round.votes[letter] - votes));
      if (round.votes[letter] !== votes) diffs.push(`round ${i + 1} ${name}: ${round.votes[letter]} vs RCTab's ${votes}`);
    }
    const inactive = round.blanks + round.exhausted + round.overvotes;
    if (inactive !== inactiveOf(reported)) diffs.push(`round ${i + 1} inactive: ${inactive} vs RCTab's ${inactiveOf(reported)}`);
    const out = reported.tallyResults.find((t) => t.eliminated)?.eliminated;
    const mineOut = candidates.find((x) => x.letter === round.eliminated)?.name;
    if (i < mine.rounds.length - 1 && out !== mineOut) diffs.push(`round ${i + 1} eliminated ${mineOut} vs RCTab's ${out}`);
  });
  return diffs;
}

let compared = 0, rounds = 0, asIsDiffer = 0, unexplained = 0, largestVoteGap = 0;
for (const name of readdirSync(work).filter((n) => n.startsWith("contest-")).sort((a, b) => a.slice(8) - b.slice(8))) {
  const c = readJson(join(dir, `${name}.json`));
  const report = readdirSync(join(work, name, "output"), { recursive: true }).find((f) => f.endsWith("_detailed_report.json"));
  const theirs = readJson(join(work, name, "output", report));
  const letters = c.candidates.map((x) => x.letter);
  const ballots = ballotCounts(c);
  const total = ballots.reduce((sum, b) => sum + b[1], 0);
  const options = { ignoreMajority: true };
  const asIs = tabulate(ballots, letters, [], options);
  const adjusted = tabulate(ballots.map(([p, n]) => [repeatsPassedOver(p), n]), letters, [], options);
  const direct = differences(asIs, theirs, c.candidates);
  const rest = differences(adjusted, theirs, c.candidates);
  if (Number(theirs.summary.totalNumBallots) !== total) rest.push(`${total} ballots vs RCTab's ${theirs.summary.totalNumBallots}`);
  compared++;
  rounds += asIs.rounds.length;
  largestVoteGap = Math.max(largestVoteGap, direct.largestVoteGap);
  if (direct.length) {
    asIsDiffer++;
    console.log(`repeat rule: ${c.name} differs in ${direct.length} numbers, such as ${direct[0]}`);
  }
  if (rest.length) {
    unexplained++;
    console.log(`UNEXPLAINED ${c.name}`);
    rest.slice(0, 10).forEach((d) => console.log(`  ${d}`));
  }
}
console.log(`${compared} contests, ${rounds} rounds. ${compared - asIsDiffer} match RCTab as is, ${asIsDiffer} differ through the repeated-ranking rule, ${unexplained} differ otherwise. The largest gap for one candidate in one round is ${largestVoteGap} votes.`);
process.exit(unexplained || !compared ? 1 : 0);
