// The page's versions: the list matches the directories, every directory has what the page reads, and the default is the newest.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { manifestEntry, versionId } from "../scripts/build_versions.mjs";
import { oldName } from "../site/static/rcv-versions.js";
import { readReceived } from "../scripts/received_from_table.mjs";

const root = new URL("../site/static/data/alaska-rcv-2026/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root)));
const { versions } = read("versions.json");
const isData = (name) => name !== "versions" && name !== "versions.json";
const script = fileURLToPath(new URL("../scripts/build_versions.mjs", import.meta.url));

test("the list is every version directory, newest first, with each one's own numbers", () => {
  assert.deepEqual(versions.map((v) => v.id), readdirSync(new URL("versions/", root)).sort().reverse());
  for (const version of versions) assert.deepEqual(version, manifestEntry(read(`versions/${version.id}/coverage.json`)));
});

test("the page's default data is the newest version, byte for byte", () => {
  assert.equal(versionId(read("coverage.json")), versions[0].id);
  const main = readdirSync(root).filter(isData).sort();
  assert.deepEqual(readdirSync(new URL(`versions/${versions[0].id}/`, root)).sort(), main);
  for (const name of main) assert.ok(readFileSync(new URL(name, root)).equals(readFileSync(new URL(`versions/${versions[0].id}/${name}`, root))), name);
});

test("every version has the page's files, simulated from its own CVR", () => {
  for (const { id } of versions) {
    for (const name of ["ballots.json", "coverage.json", "projection.json", "districts.geojson", "district-names.json", "early-absentee-2024.json", "questioned-2024.json"]) {
      assert.ok(existsSync(new URL(`versions/${id}/${name}`, root)), `${id}: ${name}`);
    }
    assert.equal(read(`versions/${id}/projection.json`).cvrLastModified, read(`versions/${id}/coverage.json`).cvrLastModified, id);
    for (const contest of read(`versions/${id}/ballots.json`).contests) assert.ok(existsSync(new URL(`versions/${id}/contest-${contest.id}.json`, root)), `${id}: contest ${contest.id}`);
  }
});

test("a version is named for its CVR and its received table, and dated by the Division's latest change, in Alaska time", () => {
  const base = { cvrLastModified: "2026-11-05T00:24:43Z", report: { stamp: "11/4/2026 1:09:44 PM", votersCast: 1 }, received: { asOf: "Nov 4, 2026, 11:37 AM", received: 1 } };
  assert.equal(versionId(base), "2026-11-05T002443Z-2026-11-04T203700Z");
  assert.equal(manifestEntry(base).time, "2026-11-05T00:24:43Z");
  const later = { ...base, received: { asOf: "Nov 5, 2026, 2:19 PM", received: 1 } };
  assert.equal(versionId(later), "2026-11-05T002443Z-2026-11-05T231900Z");
  assert.equal(manifestEntry(later).time, "2026-11-05T23:19:00Z");
  assert.equal(manifestEntry({ ...base, report: { stamp: "11/5/2026 12:05:00 AM", votersCast: 1 } }).time, "2026-11-05T09:05:00Z");
  assert.throws(() => versionId({ ...base, received: { asOf: "Nov 5" } }));
});

test("a table stamped before a CVR it was posted after still gets a version of its own, after that CVR's", () => {
  const cvr = { cvrLastModified: "2026-11-10T00:40:10Z", report: { stamp: "11/9/2026 2:55:21 PM", votersCast: 1 } };
  const first = versionId({ ...cvr, received: { asOf: "Nov 8, 2026, 12:27 PM", received: 1 } });
  const second = versionId({ ...cvr, received: { asOf: "Nov 9, 2026, 2:21 PM", received: 2 } });
  assert.notEqual(first, second);
  assert.ok(second > first);
});

test("a link with a version's old name still finds it, and the oldest of two versions with that time", () => {
  const listed = [{ id: "c", time: "2026-11-10T00:40:10Z" }, { id: "b", time: "2026-11-10T00:40:10Z" }, { id: "a", time: "2026-11-07T20:38:00Z" }];
  assert.equal(oldName(listed, "2026-11-07T203800Z").id, "a");
  assert.equal(oldName(listed, "2026-11-10T004010Z").id, "b");
  assert.equal(oldName(listed, "2026-11-08T000000Z"), undefined);
  assert.equal(oldName(listed, null), undefined);
});

test("keeping a build rebuilds its version, but won't replace one that holds other data from the Division", () => {
  const work = mkdtempSync(join(tmpdir(), "rcv-versions-"));
  try {
    const coverage = { cvrLastModified: "2026-11-05T00:24:43Z", report: { stamp: "11/4/2026 1:09:44 PM", votersCast: 1 }, received: { asOf: "Nov 4, 2026, 11:37 AM", received: 1 } };
    const built = join(work, "built"), data = join(work, "data");
    mkdirSync(built);
    mkdirSync(join(data, "versions"), { recursive: true });
    const keep = (c, extra = "") => {
      writeFileSync(join(built, "coverage.json"), JSON.stringify(c));
      writeFileSync(join(built, "projection.json"), extra);
      cpSync(join(built, "coverage.json"), join(data, "coverage.json"));
      return execFileSync(process.execPath, [script, built, data], { encoding: "utf8", stdio: "pipe" });
    };
    keep(coverage);
    assert.match(keep(coverage, "rebuilt"), /Kept version 2026-11-05T002443Z-2026-11-04T203700Z\. 1 versions/);
    assert.equal(readFileSync(join(data, "versions", versionId(coverage), "projection.json"), "utf8"), "rebuilt");
    assert.throws(() => keep({ ...coverage, report: { stamp: "11/5/2026 12:05:00 AM", votersCast: 2 } }), /already holds other data/);
    assert.equal(readFileSync(join(data, "versions", versionId(coverage), "projection.json"), "utf8"), "rebuilt");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

const row = (type, issued, received) => `<tr><td style='--v-responsive-table-label:"Ballot Type";'>${type}</td><td style='--v-responsive-table-label:"Number Issued";'>${issued}</td><td style='--v-responsive-table-label:"Number Received";'>${received}</td></tr>`;
const page = (total, stamp = "November 5, 2026 at 2:19 pm") => `<dd>Total Ballots Received: <em>${total}</em></dd><dd>Table last updated ${stamp}.</dd><table>${row("By Mail", "42,431", "28,717")}${row("Questioned", "1,355", "1,355")}</table>`;

test("the received table reads into received.json's fields", () => {
  assert.deepEqual(readReceived(page("30,072")), { asOf: "Nov 5, 2026, 2:19 PM", received: 30072, issued: 43786 });
});

test("a received table that doesn't add up or can't be read stops the build", () => {
  assert.throws(() => readReceived(page("30,073")), /add up/);
  assert.throws(() => readReceived(page("30,072", "sometime")), /no table date/);
  assert.throws(() => readReceived("<p>Down for maintenance</p>"), /no table date/);
});
