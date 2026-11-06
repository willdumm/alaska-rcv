// The page's tabulator against RCTab's published fixtures, and the Alaska partial CVR through extract_cvr.py as well.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ballotCounts } from "../site/static/rcv-rows.js";
import { tabulate } from "../site/static/rcv-tabulate.js";

const root = new URL("./fixtures/rctab/", import.meta.url).pathname;
const load = (path) => JSON.parse(readFileSync(path, "utf8"));

// A CDF fixture's ballots as ranking strings. Its selections are cs-a to cs-d.
function rankings(cvr) {
  const counts = new Map();
  for (const ballot of cvr.CVR) {
    const at = {};
    for (const contest of ballot.CVRSnapshot[0].CVRContest) {
      for (const selection of contest.CVRContestSelection) {
        for (const position of selection.SelectionPosition) (at[position.Rank] ??= []).push(selection.ContestSelectionId.slice(3).toUpperCase());
      }
    }
    const last = Math.max(0, ...Object.keys(at).map(Number));
    let ranking = "";
    for (let rank = 1; rank <= last; rank++) ranking += !at[rank] ? "-" : at[rank].length > 1 ? "*" : at[rank][0];
    counts.set(ranking, (counts.get(ranking) || 0) + 1);
  }
  return [...counts];
}

function fixtureRounds(name) {
  const expected = load(join(root, name, "expected_detailed_report.json"));
  const { rounds } = tabulate(rankings(load(join(root, name, "cvr.json"))), ["A", "B", "C", "D"]);
  const want = expected.results.map((r) => Object.fromEntries(Object.entries(r.tally).filter(([k]) => k.startsWith("Candidate")).map(([k, v]) => [k.split(" ")[1], Number(v)])));
  const got = rounds.map((r, i) => Object.fromEntries(Object.keys(want[i] ?? {}).map((k) => [k, r.votes[k]])));
  return { got, want };
}

for (const name of ["test_set_0_skipped_first_choice", "test_set_1_exhaust_at_overvote", "test_set_5_two_skipped_choice_exhaust", "test_set_7_duplicate_skip_to_next"]) {
  test(`RCTab fixture ${name} matches`, () => {
    const { got, want } = fixtureRounds(name);
    assert.deepEqual(got, want);
  });
}

test("RCTab fixture 6 differs by design: it exhausts a ballot on a repeat, and Alaska doesn't", () => {
  const { got, want } = fixtureRounds("test_set_6_duplicate_exhaust");
  assert.notDeepEqual(got, want);
});

test("Alaska's partial 2024 CVR gives RCTab's published result through the extractor", () => {
  const out = mkdtempSync(join(tmpdir(), "rcv-extract-"));
  try {
    const script = new URL("../scripts/extract_cvr.py", import.meta.url).pathname;
    execFileSync(process.env.PYTHON ?? "python3", ["-I", script, join(root, "alaska_partial"), out]);
    const { contests } = load(join(out, "ballots.json"));
    const { id } = contests.find((c) => c.name === "U.S. Representative");
    const c = load(join(out, `contest-${id}.json`));
    const ballots = ballotCounts(c);
    const letter = (last) => c.candidates.find((x) => x.name.startsWith(last)).letter;
    const { rounds } = tabulate(ballots, c.candidates.map((x) => x.letter));
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0].votes[letter("Begich")], 66);
    assert.equal(rounds[0].votes[letter("Peltola")], 45);
    assert.equal(rounds[0].votes[letter("Howe")], 4);
    assert.equal(rounds[0].votes[letter("Hafner")], 1);
    assert.equal(rounds[0].blanks, 8);
    assert.equal(ballots.reduce((sum, b) => sum + b[1], 0), 124);
  } finally {
    rmSync(out, { recursive: true });
  }
});
