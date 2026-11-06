// Early and absentee ballots per house district in the 2024 CVR, from the U.S. Representative contest,
// which every voter had. The page uses them to split the Division's statewide count of ballots received
// but not yet counted, which it doesn't publish by district. The districts haven't changed since 2024.
// Usage: node build_early_absentee_2024.mjs EXTRACTED_2024_DIR OUT.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GROUP, eachRow } from "../site/static/rcv-rows.js";

const [dir, output] = process.argv.slice(2);
const { contests } = JSON.parse(readFileSync(join(dir, "ballots.json"), "utf8"));
const contest = contests.find((c) => c.name === "U.S. Representative");
const ballots = {};
for (const { hd, group, count } of eachRow(JSON.parse(readFileSync(join(dir, `contest-${contest.id}.json`), "utf8")))) {
  if (group === GROUP.ABSENTEE || group === GROUP.EARLY) ballots[hd] = (ballots[hd] || 0) + count;
}
writeFileSync(output, JSON.stringify({ contest: contest.name, ballots }));
