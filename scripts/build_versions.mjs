// Keeps a built data directory as one of the page's versions, and rewrites the list of them.
// Usage: node build_versions.mjs BUILT_DIR DATA_DIR
//        node build_versions.mjs --id BUILT_DIR   Print the build's version ID, and do nothing else
// Copies BUILT_DIR to DATA_DIR/versions/ID/ and writes DATA_DIR/versions.json. BUILT_DIR can be DATA_DIR itself. Each version
// has every file the page and the simulation read, so the tools need no special case. Files that don't change between versions
// cost nothing: git and Cloudflare both store identical files once.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readJson } from "./lib.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A wall clock time in Alaska, as a Date.
function fromAlaska(year, month, day, hour, minute, second) {
  const utc = Date.UTC(year, month, day, hour, minute, second);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Anchorage", timeZoneName: "longOffset" }).formatToParts(utc).find((p) => p.type === "timeZoneName").value;
  return new Date(utc - Number(offset.match(/GMT-(\d\d)/)[1]) * -3600000);
}

const hour24 = (hour, half) => (Number(hour) % 12) + (half === "PM" ? 12 : 0);

// "Nov 4, 2026, 11:37 AM", from received.json.
function parseAsOf(text) {
  const match = text.match(/^(\w{3}) (\d+), (\d{4}), (\d+):(\d\d) ([AP]M)$/);
  if (!match || !MONTHS.includes(match[1])) throw new Error(`received.asOf: "${text}"`);
  return fromAlaska(Number(match[3]), MONTHS.indexOf(match[1]), Number(match[2]), hour24(match[4], match[6]), Number(match[5]), 0);
}

// "11/4/2026 1:09:44 PM", from the summary.
function parseReportStamp(text) {
  const match = text.match(/^(\d+)\/(\d+)\/(\d{4}) (\d+):(\d\d):(\d\d) ([AP]M)$/);
  if (!match) throw new Error(`report.stamp: "${text}"`);
  return fromAlaska(Number(match[3]), match[1] - 1, Number(match[2]), hour24(match[4], match[7]), Number(match[5]), Number(match[6]));
}

const stamp = (date) => date.toISOString().replace(/\.\d+Z$/, "Z");
const compact = (date) => stamp(date).replaceAll(":", "");

// When the page says a version is from: the Division's latest change to anything in it, the CVR, the summary or the received table.
export function versionTime(coverage) {
  return new Date(Math.max(new Date(coverage.cvrLastModified), parseAsOf(coverage.received.asOf), parseReportStamp(coverage.report.stamp)));
}

// A version is named for when the CVR was posted and when the received table says it was updated, so "2026-11-10T004010Z-2026-11-09T232100Z".
// Each only moves forward, so every update has a new name, and sorting the names puts them in the order they were posted. The latest
// of them alone isn't enough: on November 9 a table stamped before the CVR was posted after it. The summary and precinct CSV come
// with the CVR, so they aren't in the name. Versions kept before November 10 were named for versionTime, and old links use that.
export function versionId(coverage) {
  return `${compact(new Date(coverage.cvrLastModified))}-${compact(parseAsOf(coverage.received.asOf))}`;
}

export function manifestEntry(coverage) {
  return {
    id: versionId(coverage),
    time: stamp(versionTime(coverage)),
    counted: coverage.report.votersCast,
    received: coverage.received.received,
    ...(coverage.received.questionedNote ? { note: coverage.received.questionedNote } : {}),
  };
}

// What the Division had posted, from a coverage.json. A version can be rebuilt with new code, but not replaced by other data.
const sources = ({ cvrLastModified, report, received }) => JSON.stringify([cvrLastModified, report.stamp, report.votersCast, received.asOf, received.received]);

function keep(built, data) {
  const coverage = readJson(join(built, "coverage.json"));
  const id = versionId(coverage);
  const target = join(data, "versions", id);
  if (existsSync(join(target, "coverage.json")) && sources(readJson(join(target, "coverage.json"))) !== sources(coverage)) {
    throw new Error(`version ${id} already holds other data from the Division: keep it, and find out what changed`);
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(built)) {
    if (name !== "versions" && name !== "versions.json") cpSync(join(built, name), join(target, name));
  }
  return id;
}

function writeManifest(data) {
  const dir = join(data, "versions");
  const versions = readdirSync(dir).map((name) => manifestEntry(readJson(join(dir, name, "coverage.json")))).sort((a, b) => b.id.localeCompare(a.id));
  const unfiled = readdirSync(dir).filter((name) => !versions.some((v) => v.id === name));
  if (unfiled.length) throw new Error(`these aren't named for their data: ${unfiled.join(", ")}`);
  writeFileSync(join(data, "versions.json"), `${JSON.stringify({ versions }, null, 1)}\n`);
  return versions;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--id") {
    console.log(versionId(readJson(join(process.argv[3], "coverage.json"))));
    process.exit(0);
  }
  const [built, data] = process.argv.slice(2).map((path) => resolve(path));
  if (!existsSync(join(built, "coverage.json")) || !data) throw new Error("usage: build_versions.mjs BUILT_DIR DATA_DIR");
  const id = keep(built, data);
  const versions = writeManifest(data);
  const main = versionId(readJson(join(data, "coverage.json")));
  if (main !== versions[0].id) throw new Error(`${data} has version ${main}, but the newest is ${versions[0].id}: build the newest there`);
  console.log(`Kept version ${id}. ${versions.length} versions, the newest ${versions[0].id}.`);
}
