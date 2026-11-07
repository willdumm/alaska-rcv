// refresh.sh watch, against a stand-in for the Division: what gets saved, what seen remembers, and who hears about it.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const PDF = "ElectionSummaryReportRPT.pdf";
const CVR = "CVR_Export.zip";
const CSV = "GA_ENR_Precinct_State_of_Alaska.csv";
const TABLE = "ballots-received-table.html";
const FILES = [CVR, PDF, CSV];
const DAY_ONE = "Thu, 05 Nov 2026 00:24:43 GMT";
const DAY_TWO = "Sat, 07 Nov 2026 03:00:00 GMT";

let server, dir, script, store, site;

// What a source does, instead of answering normally: 404, redirect, noLastModified or truncated.
function answer(request, response) {
  const name = request.url.split("/").pop();
  const send = (status, headers, body) => {
    response.writeHead(status, headers);
    response.end(request.method === "HEAD" ? undefined : body);
  };
  const how = site.broken[name];
  if (how === 404) return send(404, {}, "gone");
  if (how === "redirect") return send(302, { location: "/elsewhere" }, "moved");
  if (how === "truncated" && request.method !== "HEAD") {
    response.writeHead(200, { "last-modified": site.modified, "content-length": "1000" });
    response.write("short");
    return setTimeout(() => response.destroy(), 20);
  }
  if (name === "table") return send(200, {}, site.table);
  return send(200, how === "noLastModified" ? {} : { "last-modified": site.modified }, `${name} of ${site.modified}`);
}

// Exit code and output, whatever the exit code.
const watch = () => new Promise((resolve) => {
  execFile("bash", [script, "watch", store, new URL("../scripts/division-tls-intermediate.pem", import.meta.url).pathname], (error, stdout) => resolve({ code: error ? error.code : 0, stdout }));
});
const snapshots = () => readdirSync(store).filter((name) => /^\d{4}-/.test(name)).sort();
const seen = () => readFileSync(join(store, "seen"), "utf8");
const alerts = () => (existsSync(join(store, "alerts")) ? readFileSync(join(store, "alerts"), "utf8").trim().split("\n").filter((line) => line.startsWith("TITLE")) : []);
const seenLines = (modified, table) => `${FILES.map((file) => `${file} ${modified}`).join("\n")}\ntable ${table}\n`;

before(async () => {
  server = http.createServer(answer);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  dir = mkdtempSync(join(tmpdir(), "watch-test-"));
  script = join(dir, "refresh.sh");
  writeFileSync(script, readFileSync(new URL("../scripts/refresh.sh", import.meta.url), "utf8")
    .replace(/^base=.*$/m, `base=${url}/results`).replace(/^received_page=.*$/m, `received_page=${url}/table`));
});
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  site = { modified: DAY_TWO, table: "<p>Table last updated November 7, 2026 at 1:00 pm.</p>", broken: {} };
  store = mkdtempSync(join(dir, "store-"));
  writeFileSync(join(store, "seen"), seenLines(DAY_ONE, "November 5, 2026 at 2:19 pm"));
  writeFileSync(join(store, "notify"), `#!/usr/bin/env bash\nprintf 'TITLE %s | %s | %s\\n' "$1" "$2" "$3" >> "${store}/alerts"\n`);
  chmodSync(join(store, "notify"), 0o755);
});

test("an update is saved whole, remembered, and announced once", async () => {
  const first = await watch();
  assert.equal(first.code, 0);
  assert.match(first.stdout, /New snapshot/);
  const [snapshot, ...rest] = snapshots();
  assert.deepEqual(rest, []);
  for (const name of [...FILES, TABLE]) assert.ok(existsSync(join(store, snapshot, name)), name);
  assert.equal(seen(), seenLines(DAY_TWO, "November 7, 2026 at 1:00 pm"));
  assert.equal(alerts().length, 1);
  assert.match(alerts()[0], /new Division data/);
  const message = readFileSync(join(store, "alerts"), "utf8");
  assert.match(message, new RegExp(`${CVR} ${DAY_TWO}`));
  assert.match(message, /\| 0$/m);

  const second = await watch();
  assert.equal(second.code, 0);
  assert.match(second.stdout, /No change/);
  assert.equal(snapshots().length, 1);
  assert.equal(alerts().length, 1);
});

test("a change to the table alone saves everything", async () => {
  site.modified = DAY_ONE;
  assert.equal((await watch()).code, 0);
  for (const name of [...FILES, TABLE]) assert.ok(existsSync(join(store, snapshots()[0], name)), name);
});

test("a first run with no state saves, and no notify hook is fine", async () => {
  rmSync(join(store, "seen"));
  rmSync(join(store, "notify"));
  assert.equal((await watch()).code, 0);
  assert.equal(snapshots().length, 1);
});

test("a missing file doesn't stop the others being saved, and its update is picked up when it's back", async () => {
  site.broken[PDF] = 404;
  assert.equal((await watch()).code, 1);
  assert.equal(snapshots().length, 1);
  assert.ok(existsSync(join(store, snapshots()[0], CVR)));
  assert.ok(!existsSync(join(store, snapshots()[0], PDF)));
  assert.match(seen(), new RegExp(`${PDF} ${DAY_ONE}`));
  assert.match(seen(), new RegExp(`${CVR} ${DAY_TWO}`));
  assert.ok(alerts().some((alert) => alert.includes("problem") && alert.includes(PDF) && alert.endsWith(" 1")));

  // Still missing, with nothing else new: an error, but no second snapshot or alert.
  const count = alerts().length;
  assert.equal((await watch()).code, 1);
  assert.equal(snapshots().length, 1);
  assert.equal(alerts().length, count);

  site.broken = {};
  assert.equal((await watch()).code, 0);
  assert.equal(snapshots().length, 2);
  assert.ok(existsSync(join(store, snapshots()[1], PDF)));
  assert.ok(alerts().some((alert) => alert.includes("working again")));
  assert.ok(!existsSync(join(store, "failing")));
});

test("a problem is told again after a day, and when it changes", async () => {
  site.modified = DAY_ONE;
  site.table = "<p>Table last updated November 5, 2026 at 2:19 pm.</p>";
  site.broken[PDF] = 404;
  assert.equal((await watch()).code, 1);
  assert.equal(alerts().length, 1);
  await new Promise((resolve) => execFile("touch", ["-d", "2 days ago", join(store, "failing")], resolve));
  assert.equal((await watch()).code, 1);
  assert.equal(alerts().length, 2);
  site.broken[CSV] = 404;
  assert.equal((await watch()).code, 1);
  assert.equal(alerts().length, 3);
});

test("a redirect is a problem: no stub is saved as the file, and seen keeps the old line", async () => {
  site.broken[CVR] = "redirect";
  assert.equal((await watch()).code, 1);
  assert.ok(!existsSync(join(store, snapshots()[0], CVR)));
  assert.match(seen(), new RegExp(`${CVR} ${DAY_ONE}`));
  assert.equal((await watch()).code, 1);
  assert.equal(snapshots().length, 1);
});

test("a file with no Last-Modified is kept, but it's a problem, and seen keeps the old line", async () => {
  site.modified = DAY_TWO;
  site.broken[CVR] = "noLastModified";
  assert.equal((await watch()).code, 1);
  assert.ok(existsSync(join(store, snapshots()[0], CVR)));
  assert.match(seen(), new RegExp(`${CVR} ${DAY_ONE}`));
  assert.equal((await watch()).code, 1);
  assert.ok(alerts().some((alert) => alert.includes("no Last-Modified")));
});

test("a download cut short leaves no partial file", async () => {
  site.broken[CVR] = "truncated";
  assert.equal((await watch()).code, 1);
  assert.ok(!existsSync(join(store, snapshots()[0], CVR)));
  assert.match(seen(), new RegExp(`${CVR} ${DAY_ONE}`));
});

test("a page with no table text is saved once, and stays a problem", async () => {
  site.table = "<p>A new design</p>";
  assert.equal((await watch()).code, 1);
  assert.equal(snapshots().length, 1);
  assert.ok(existsSync(join(store, snapshots()[0], TABLE)));
  assert.equal((await watch()).code, 1);
  assert.equal(snapshots().length, 1);
  assert.equal(alerts().filter((alert) => alert.includes("problem")).length, 1);
});

test("nothing reachable: no snapshot, seen unchanged, no leftovers", async () => {
  const before = seen();
  for (const name of [...FILES, "table"]) site.broken[name] = 404;
  assert.equal((await watch()).code, 1);
  assert.deepEqual(snapshots(), []);
  assert.equal(seen(), before);
  assert.ok(!readdirSync(store).some((name) => name.startsWith(".partial")));
  assert.equal(alerts().length, 1);
});
