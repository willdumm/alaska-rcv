// The page's versions: the list matches the directories, every directory has what the page reads, and the default is the newest.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { manifestEntry, versionId } from "../scripts/build_versions.mjs";
import { readReceived } from "../scripts/received_from_table.mjs";

const root = new URL("../site/static/data/alaska-rcv-2026/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root)));
const { versions } = read("versions.json");
const isData = (name) => name !== "versions" && name !== "versions.json";

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

test("a version is named for the Division's latest change, in Alaska time", () => {
  const base = { cvrLastModified: "2026-11-05T00:24:43Z", report: { stamp: "11/4/2026 1:09:44 PM" } };
  assert.equal(versionId({ ...base, received: { asOf: "Nov 4, 2026, 11:37 AM" } }), "2026-11-05T002443Z");
  assert.equal(versionId({ ...base, received: { asOf: "Nov 5, 2026, 2:19 PM" } }), "2026-11-05T231900Z");
  assert.equal(versionId({ cvrLastModified: "2026-11-05T00:24:43Z", report: { stamp: "11/5/2026 12:05:00 AM" }, received: { asOf: "Nov 3, 2026, 12:26 PM" } }), "2026-11-05T090500Z");
  assert.throws(() => versionId({ ...base, received: { asOf: "Nov 5" } }));
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
