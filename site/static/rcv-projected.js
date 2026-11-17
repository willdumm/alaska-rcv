// Rounds projected from the Division's first choices: every ballot the summary has counted, with later rankings taken from
// the CVR. The summary has each candidate's first choices by district, including ballots counted by hand, and no rankings.
// So for each candidate and district this keeps the CVR's ballots with that first rank as they are, and spreads the
// summary's remaining votes over ballots like them, in the order scripts/simulate_projection.mjs copies them: the district's
// Election Day ballots, then its others, then the same first choice elsewhere in the race. It's the simulation's
// hand-counted step as an expected value, with no resampling and no uncounted ballots. docs/RULES.md has the method.
import { GROUP, eachRow } from "./rcv-rows.js";

export const MIN_BUCKET = 30;

const total = (rows) => rows.reduce((sum, row) => sum + row.count, 0);

// Returns Map(hd -> [[ranking, ballots], ...]), where ballots can be a fraction. summaryVotes(letter) gives { [hd]: votes }, and
// writeIns is the contest's write-ins in the summary, which has them by contest only. A CVR ballot whose first rank isn't a
// candidate stays as it is, so one past a blank or write-in first rank counts for the next candidate it ranks, as
// AS 15.15.350(d) says. Hand-counted write-ins are shared among districts like the hand-counted votes for candidates, and
// then spread like any other first choice.
export function projectedBallots(c, summaryVotes, writeIns = 0) {
  const letters = c.candidates.map((x) => x.letter);
  const continuing = new Set(letters);
  const rowsOf = new Map([...letters, "W"].map((l) => [l, []]));
  const byDistrict = new Map();
  const add = (hd, ranking, ballots) => {
    if (!byDistrict.has(hd)) byDistrict.set(hd, new Map());
    const counts = byDistrict.get(hd);
    counts.set(ranking, (counts.get(ranking) || 0) + ballots);
  };
  for (const row of eachRow(c)) {
    const ranking = c.patterns[row.pattern];
    if (continuing.has(ranking[0])) rowsOf.get(ranking[0]).push({ ...row, ranking });
    else {
      if (ranking[0] === "W") rowsOf.get("W").push({ ...row, ranking });
      add(row.hd, ranking, row.count);
    }
  }
  // Spreads a district's first choices that the CVR doesn't have over ballots like them.
  const spread = (letter, hd, here, extra) => {
    const rows = rowsOf.get(letter);
    const electionDay = here.filter((row) => row.group === GROUP.ELECTION_DAY);
    const source = [electionDay, here, rows].find((list) => total(list) >= MIN_BUCKET) ?? (here.length ? here : rows);
    // No CVR ballot at all has this first choice, so its later rankings are unknown.
    if (!source.length) { add(hd, letter, extra); return; }
    const scale = extra / total(source);
    for (const row of source) add(hd, row.ranking, row.count * scale);
  };
  const handCounted = new Map();
  for (const letter of letters) {
    const rows = rowsOf.get(letter);
    for (const [key, votes] of Object.entries(summaryVotes(letter))) {
      const hd = Number(key);
      const here = rows.filter((row) => row.hd === hd);
      for (const row of here) add(hd, row.ranking, row.count);
      const extra = votes - total(here);
      if (extra <= 0) continue;
      handCounted.set(hd, (handCounted.get(hd) || 0) + extra);
      spread(letter, hd, here, extra);
    }
  }
  const writeInRows = rowsOf.get("W");
  const extraWriteIns = writeIns - total(writeInRows);
  const allHandCounted = [...handCounted.values()].reduce((a, b) => a + b, 0);
  if (extraWriteIns > 0 && allHandCounted > 0) {
    for (const [hd, votes] of handCounted) spread("W", hd, writeInRows.filter((row) => row.hd === hd), (extraWriteIns * votes) / allHandCounted);
  }
  return new Map([...byDistrict].map(([hd, counts]) => [hd, [...counts]]));
}
