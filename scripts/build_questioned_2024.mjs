// What the projection needs from the 2024 CVR about questioned ballots, per house district: how many had a statewide
// race (U.S. Representative), how many had their State House race, and Election Day ballots, for comparing
// turnout with 2026. Only 4,041 had a House race, against 11,031 for U.S. Representative. The districts haven't
// changed since 2024. 2024's State Senate races were in different districts, so Senate races use the House counts.
// Usage: node build_questioned_2024.mjs EXTRACTED_2024_DIR OUT.json
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { GROUP, eachRow } from "../site/static/rcv-rows.js";
import { loadContest, readJson } from "./lib.mjs";

const [dir, output] = process.argv.slice(2);
const { contests } = readJson(join(dir, "ballots.json"));

function addCounts(id, wanted, into) {
  for (const { hd, group, count } of eachRow(loadContest(dir, id))) {
    if (group === wanted) into[hd] = (into[hd] || 0) + count;
  }
}

const statewide = {}, house = {}, electionDay = {};
const representative = contests.find((c) => c.name === "U.S. Representative");
addCounts(representative.id, GROUP.QUESTIONED, statewide);
addCounts(representative.id, GROUP.ELECTION_DAY, electionDay);
for (const c of contests) if (c.name.startsWith("House District")) addCounts(c.id, GROUP.QUESTIONED, house);
writeFileSync(output, JSON.stringify({ statewide, house, electionDay }));
