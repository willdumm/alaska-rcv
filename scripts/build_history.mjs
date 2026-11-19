// How the simulations moved from one version to the next: each version's wins per candidate, for every simulated contest.
// Usage: node build_history.mjs DATA_DIR
// Writes DATA_DIR/history.json from DATA_DIR/versions/*/projection.json. refresh.sh keep runs it, so it always has every version.
// It sits beside versions.json, not in any one version, since it's about all of them.
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readJson } from "./lib.mjs";

// A contest's letters must name the same candidates in every version, or one candidate's line would join another's.
function namesOf(dir, id) {
  const path = join(dir, `contest-${id}.json`);
  return existsSync(path) ? Object.fromEntries(readJson(path).candidates.map((x) => [x.letter, x.name])) : null;
}

export function buildHistory(data) {
  const { versions } = readJson(join(data, "versions.json"));
  const oldestFirst = [...versions].reverse();
  const newest = join(data, "versions", versions[0].id);
  const contests = {};
  for (const [i, version] of oldestFirst.entries()) {
    const dir = join(data, "versions", version.id);
    const projection = readJson(join(dir, "projection.json"));
    for (const [id, sim] of Object.entries(projection.contests)) {
      const names = namesOf(dir, id), newestNames = namesOf(newest, id);
      if (names && newestNames && Object.entries(names).some(([letter, name]) => newestNames[letter] !== name)) {
        throw new Error(`contest ${id}: version ${version.id} has other candidates under the same letters`);
      }
      contests[id] ??= { wins: Array(oldestFirst.length).fill(null), ties: Array(oldestFirst.length).fill(null) };
      contests[id].wins[i] = Object.fromEntries(Object.entries(sim.winners).map(([letter, w]) => [letter, w.wins]));
      contests[id].ties[i] = sim.ties;
      if (projection.parameters.runs !== readJson(join(newest, "projection.json")).parameters.runs) throw new Error(`version ${version.id} has a different number of simulations`);
    }
  }
  const history = {
    runs: readJson(join(newest, "projection.json")).parameters.runs,
    versions: oldestFirst.map(({ id, time, counted, final }) => ({ id, time, counted, ...(final ? { final } : {}) })),
    contests,
  };
  return history;
}

export const historyText = (history) => `${JSON.stringify(history)}\n`;

export function writeHistory(data) {
  const history = buildHistory(data);
  writeFileSync(join(data, "history.json"), historyText(history));
  return history;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = resolve(process.argv[2] ?? "");
  if (!existsSync(join(data, "versions.json"))) throw new Error("usage: build_history.mjs DATA_DIR");
  const { versions } = writeHistory(data);
  console.log(`Wrote history.json: ${versions.length} versions.`);
}
