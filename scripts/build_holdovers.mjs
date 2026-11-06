// holdovers.json: the State Senate seats not on the 2026 ballot, which 2024's election filled for four years. Each holder and
// party registration comes from the Division's 2024 CVR, extracted with extract_cvr.py, and its winners, through the page's
// tabulator, which reproduces the certified 2024 reports. So this can't see a resignation, appointment or party change since:
// docs/RULES.md says what was checked by hand.
// Usage: node build_holdovers.mjs EXTRACTED_2024_DIR OUT.json
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { senateDistricts } from "../site/static/rcv-chambers.js";
import { ballotCounts, eachRow } from "../site/static/rcv-rows.js";
import { tabulate } from "../site/static/rcv-tabulate.js";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) throw new Error("Usage: node build_holdovers.mjs EXTRACTED_2024_DIR OUT.json");
const senate = [];
for (const file of readdirSync(dir).filter((name) => /^contest-\d+\.json$/.test(name))) {
  const c = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const match = c.name.match(/^Senate District ([A-T])$/);
  if (!match) continue;
  const seat = match[1], hds = senateDistricts(seat);
  const seen = new Set([...eachRow(c)].map((row) => row.hd));
  if (hds.some((hd) => !seen.has(hd)) || seen.size !== 2) throw new Error(`${c.name} has house districts ${[...seen]}, not ${hds}`);
  const { leader } = tabulate(ballotCounts(c, "all"), c.candidates.map((x) => x.letter));
  const winner = c.candidates.find((x) => x.letter === leader);
  if (!winner) throw new Error(`${c.name}: no winner`);
  senate.push({ seat, hds, name: winner.name, party: winner.parties[0], until: "January 2029" });
}
if (senate.length !== 10) throw new Error(`${senate.length} Senate races in 2024, not 10`);
senate.sort((a, b) => a.seat.localeCompare(b.seat));
writeFileSync(output, `${JSON.stringify({ senate }, null, 1)}\n`);
