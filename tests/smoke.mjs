// Loads every contest in a real browser at phone and desktop widths, from a built site in public/, looking for page errors,
// anything past the screen edge, and charts that didn't draw. Then it breaks things on purpose, to see that the page says so.
// Usage: node tests/smoke.mjs
// Needs `hugo --source site` first. It needs Playwright from node_modules, or from PW_DIR, and Chromium, from Playwright or
// from CHROMIUM. Without any fonts headless Chromium paints no text and layout numbers are wrong: set FONTCONFIG_FILE if so.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const require = createRequire(`${process.env.PW_DIR ?? process.cwd()}/`);
const { chromium } = require("playwright");
const root = new URL("../public/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".geojson": "application/json", ".css": "text/css" };

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const file = join(root, normalize(path), path.endsWith("/") ? "index.html" : "");
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const index = JSON.parse(readFileSync(join(root, "data/alaska-rcv-2026/ballots.json"), "utf8"));
const projection = JSON.parse(readFileSync(join(root, "data/alaska-rcv-2026/projection.json"), "utf8"));
const ids = [...index.contests.map((c) => c.id), ...Object.values(index.measureIds)];
const WIDTHS = [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]];
const problems = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox"] });

async function opened(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push(m.text()); });
  await page.goto(url, { waitUntil: "networkidle" });
  return { page, errors };
}

for (const [name, viewport] of WIDTHS) {
  const context = await browser.newContext({ viewport });
  for (const id of ids) {
    const { page, errors } = await opened(context, `${base}?contest=${id}`);
    const seen = await page.evaluate(() => {
      const visible = (el) => el && el.offsetParent !== null;
      const past = [...document.querySelectorAll("main *")].filter((el) => visible(el) && !el.closest(".rcv-table-wrap") && el.getBoundingClientRect().right > innerWidth + 1);
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        past: past.slice(0, 3).map((el) => `${el.tagName}.${el.getAttribute("class") ?? ""}`),
        flow: Boolean(document.querySelector("#rcv-flow svg")),
        flowText: document.querySelector("#rcv-flow svg")?.textContent ?? "",
        oneCandidate: document.getElementById("rcv-count-intro").textContent.includes("one candidate"),
        rounds: document.querySelectorAll("#rcv-rounds tbody tr").length,
        map: document.querySelectorAll("#rcv-map path.district").length,
        updated: document.getElementById("rcv-updated").textContent,
        firstChart: document.getElementById("rcv-map").getBoundingClientRect().top < document.getElementById("rcv-flow").getBoundingClientRect().top,
        callouts: document.querySelectorAll("#rcv-callouts .rcv-callout").length,
        dotReach: Math.max(0, ...[...document.querySelectorAll("#rcv-projection svg circle")].map((dot) => Math.abs(dot.getAttribute("cy")))),
        text: document.querySelector("main").innerText,
      };
    });
    const fail = (what) => problems.push(`${name} contest ${id}: ${what}`);
    if (errors.length) fail(`errors: ${errors.join("; ")}`);
    if (seen.overflow > 0) fail(`page scrolls sideways by ${seen.overflow}px`);
    if (seen.past.length) fail(`past the edge: ${seen.past.join(", ")}`);
    if (seen.flow === seen.oneCandidate) fail(seen.flow ? "a rounds chart for one candidate" : "no rounds chart");
    if (seen.flow && !/leads|tied|has all/.test(seen.flowText)) fail("the rounds chart doesn't say how the count ended");
    if (!seen.rounds) fail("no rounds table");
    if (!seen.map) fail("no map");
    if (!seen.firstChart) fail("the map isn't first");
    if (seen.callouts > 1) fail(`${seen.callouts} warnings above the rounds`);
    if (seen.dotReach > 96) fail(`dots stack ${seen.dotReach}px from their line`);
    if (/Loading|Couldn't/.test(seen.updated)) fail(`status says "${seen.updated}"`);
    if (!/preliminary/i.test(seen.text) || !/unofficial/i.test(seen.text)) fail("doesn't say preliminary and unofficial");
    await page.close();
  }
  await context.close();
}

// Each of these has to tell the reader, not leave "Loading..." or a blank page.
const BROKEN = [
  ["d3 doesn't load", /d3-[\d.]+\.min\.js/],
  ["the data doesn't load", /coverage\.json/],
  ["a contest doesn't load", /contest-6\.json/],
];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

// Each version draws from its own data and says what it is, in a whole race and a whole chamber. The latest says nothing extra.
const { versions } = JSON.parse(readFileSync(join(root, "data/alaska-rcv-2026/versions.json"), "utf8"));
for (const [i, version] of versions.entries()) {
  const dir = i === 0 ? "data/alaska-rcv-2026/" : `data/alaska-rcv-2026/versions/${version.id}/`;
  const { report } = JSON.parse(readFileSync(join(root, dir, "coverage.json"), "utf8"));
  for (const contest of ["6", "house"]) {
    const { page, errors } = await opened(context, `${base}?contest=${contest}&version=${version.id}`);
    const seen = await page.evaluate(() => ({
      picked: document.getElementById("f-version").value,
      options: document.querySelectorAll("#f-version option").length,
      warning: !document.getElementById("rcv-version-warning").hidden,
      note: document.getElementById("rcv-version-note").textContent,
      detail: document.getElementById("rcv-updated-detail").textContent,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    const fail = (what) => problems.push(`version ${version.id} contest ${contest}: ${what}`);
    if (errors.length) fail(`errors: ${errors.join("; ")}`);
    if (seen.picked !== version.id) fail(`the picker says ${seen.picked}`);
    if (seen.options !== versions.length) fail(`${seen.options} versions in the picker`);
    if (seen.warning !== (i > 0)) fail(seen.warning ? "the latest says it's earlier" : "doesn't say it's earlier");
    if (i > 0 && !/isn't what this page showed that day/.test(seen.note)) fail("doesn't say it's today's model");
    if (i === 0 && seen.note) fail(`the latest has a note: ${seen.note}`);
    if (!seen.detail.includes(report.votersCast.toLocaleString("en-US"))) fail("the status isn't this version's");
    if (seen.overflow > 0) fail(`page scrolls sideways by ${seen.overflow}px`);
    await page.close();
  }
}
if (versions.length > 1) {
  const { page } = await opened(context, `${base}?contest=house`);
  await Promise.all([page.waitForURL(/version=/, { waitUntil: "networkidle" }), page.selectOption("#f-version", versions[1].id)]);
  if (!page.url().includes("contest=house")) problems.push("choosing a version loses the contest");
  await Promise.all([page.waitForURL((url) => !url.search.includes("version="), { waitUntil: "networkidle" }), page.click("#rcv-version-warning button")]);
  if (await page.locator("#rcv-version-warning").isVisible()) problems.push("back to the latest still says earlier");
  await page.close();
}
{
  const { page } = await opened(context, `${base}?version=nonsense`);
  const note = await page.locator("#rcv-version-note").textContent();
  if (!/wasn't found/.test(note)) problems.push("an unknown version doesn't say so");
  await page.close();
}
await context.route(/versions\.json/, (route) => route.abort());
{
  const { page, errors } = await opened(context, base);
  if (errors.length || !await page.locator("#rcv-map path.district").count()) problems.push("the page needs versions.json to draw");
  if (await page.locator("#rcv-version-picker").isVisible()) problems.push("an empty version picker");
  await page.close();
}
await context.unroute(/versions\.json/);

for (const [what, pattern] of BROKEN) {
  await context.route(pattern, (route) => route.abort());
  const { page } = await opened(context, base);
  const text = await page.evaluate(() => document.querySelector("main").innerText);
  if (!/Couldn't|didn't|failed/i.test(text) || /Loading…/.test(text)) problems.push(`when ${what}, the page doesn't say so`);
  await page.close();
  await context.unroute(pattern);
}
// A whole chamber: no rounds chart, every district painted, and seats that add up in every simulation.
for (const chamber of ["senate", "house"]) {
  const { page, errors } = await opened(context, `${base}?contest=${chamber}`);
  const seen = await page.evaluate(() => ({
    flow: document.getElementById("count").offsetParent !== null,
    painted: new Set([...document.querySelectorAll("#rcv-map path.district")].map((p) => p.getAttribute("fill"))).size,
    rows: document.querySelectorAll(".rcv-seat-dots .row").length,
    outcomes: document.querySelectorAll(".rcv-outcomes li").length,
    labels: [...new Set([...document.querySelectorAll("#rcv-map .district-label")].map((l) => l.textContent))],
    table: document.querySelectorAll("#rcv-projection-table tbody tr").length,
    text: document.querySelector("main").innerText,
  }));
  if (errors.length) problems.push(`${chamber}: ${errors.join("; ")}`);
  if (seen.flow) problems.push(`${chamber}: shows the rounds`);
  if (seen.painted < 3) problems.push(`${chamber}: the map isn't painted`);
  const contested = projection.chambers[chamber].races.filter((race) => race.candidates.length > 1).length;
  if (seen.rows !== contested) problems.push(`${chamber}: ${seen.rows} rows in the seat list, not ${contested}`);
  if (seen.outcomes < 1 || seen.outcomes > 5) problems.push(`${chamber}: ${seen.outcomes} seat splits listed`);
  if (seen.labels.length) problems.push(`${chamber}: map labels ${seen.labels.join()}, which are turned off`);
  if (seen.table !== 3) problems.push(`${chamber}: ${seen.table} rows in the seats table`);
  if (!/preliminary/i.test(seen.text) || !/unofficial/i.test(seen.text)) problems.push(`${chamber}: doesn't say preliminary and unofficial`);
  await page.check('input[name="rcv-map-mode"][value="final"]');
  await page.waitForFunction((n) => document.querySelectorAll(".rcv-seat-dots .row").length === n, contested);
  {
    await page.locator(".rcv-seat-dots .row").first().hover();
    const lit = await page.locator("#rcv-map path.hovered").count();
    if (lit < 1) problems.push(`${chamber}: hovering a seat doesn't light the map`);
  }
  await page.locator(".rcv-seat-dots .row").first().click();
  await page.waitForFunction(() => document.getElementById("count").offsetParent !== null);
  await page.close();
}
// A whole chamber chosen from the dropdown, with a district selected, as the URL can't show.
for (const chamber of ["senate", "house"]) {
  const { page, errors } = await opened(context, base);
  await page.selectOption("#f-hd", "5");
  await page.selectOption("#f-contest", chamber);
  await page.waitForFunction(() => document.getElementById("count").hidden);
  if (errors.length) problems.push(`${chamber} from the dropdown: ${errors.join("; ")}`);
  if (await page.locator("#rcv-district-warning").isVisible()) problems.push(`${chamber} from the dropdown: still narrowed to a district`);
  await page.close();
}
// Every district with votes takes a color from its leader, however close: no gray or white for a narrow lead.
{
  const { page } = await opened(context, base);
  const fills = await page.evaluate(() => [...document.querySelectorAll("#rcv-map path.district")].map((p) => p.getAttribute("fill")));
  if (fills.some((fill) => /^(#ece9e4|#ffffff|white)$/i.test(fill))) problems.push("a district with votes has no leader's color");
  await page.close();
}
// Each leader's line has its total of ballots left: a bar that stays on the chart, behind the background of the line's text.
{
  const { page } = await opened(context, base);
  await page.evaluate(() => document.querySelector(".rcv-dots-details").open = true);
  const lines = await page.evaluate(() => {
    const svg = document.querySelector("#rcv-dots svg");
    const bars = [...svg.querySelectorAll("rect.left-bar")].filter((bar) => !bar.closest(".row"));
    const backgrounds = [...svg.querySelectorAll("rect.heading-bg")];
    const inOrder = bars.every((bar, i) => bar.compareDocumentPosition(backgrounds[i]) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { bars: bars.length, backgrounds: backgrounds.length, inOrder, onChart: bars.every((bar) => Number(bar.getAttribute("x")) >= 0) };
  });
  if (!lines.bars || lines.bars !== lines.backgrounds) problems.push(`${lines.bars} ballots-left bars for ${lines.backgrounds} leaders' lines`);
  if (!lines.inOrder) problems.push("a leader's ballots-left bar is drawn over its text's background");
  if (!lines.onChart) problems.push("a leader's ballots-left bar runs off the chart");
  await page.close();
}
// The summary's links go to their charts, below the sticky filters.
for (const [text, target] of [["see the ranked choice tabulation", "#rcv-flow"], ["see the simulation", "#projection"]]) {
  const { page } = await opened(context, base);
  await page.getByRole("link", { name: text }).click();
  await page.waitForFunction(() => scrollY > 0);
  const gap = await page.evaluate((id) => document.querySelector(id).getBoundingClientRect().top - document.querySelector(".rcv-filters").getBoundingClientRect().bottom, target);
  if (gap < 0) problems.push(`${text}: ${target} lands under the filters`);
  await page.close();
}
// The district picker uses the Division's names.
{
  const { page } = await opened(context, base);
  const option = await page.locator('#f-hd option[value="5"]').textContent();
  if (option !== "District 5: Kodiak/Seward/Cordova") problems.push(`district picker says "${option}"`);
  await page.close();
}
// A row of a race's list of districts lights its district on the map.
{
  const governor = index.contests.find((c) => c.name.startsWith("Governor")).id;
  const { page } = await opened(context, `${base}?contest=${governor}`);
  const row = page.locator("#rcv-dots .row").nth(1);
  await row.hover();
  if (await page.locator("#rcv-map path.hovered").count() < 1) problems.push("hovering a district's row doesn't light the map");
  await page.close();
}
// The map's other view paints the map differently and keeps working. Governor has enough votes moving between rounds to change
// a district's color: in some races, such as U.S. Senator, transfers are small and the two views can look the same.
{
  const governor = index.contests.find((c) => c.name.startsWith("Governor")).id;
  const { page, errors } = await opened(context, `${base}?contest=${governor}`);
  const fills = () => page.evaluate(() => [...document.querySelectorAll("#rcv-map path.district")].map((p) => p.getAttribute("fill")).join());
  const first = await fills();
  await page.check('input[name="rcv-map-mode"][value="final"]');
  await page.waitForFunction(() => document.querySelector("#districts .rcv-tag").textContent.startsWith("Projected"));
  if (first === await fills()) problems.push("the map's tabulation view looks the same as first choices");
  if (errors.length) problems.push(`the map's tabulation view: ${errors.join("; ")}`);
  await page.close();
}
const stamp = /coverage\.json/;
await context.route(stamp, async (route) => {
  const response = await route.fetch();
  const json = await response.json();
  json.report.stamp = "a format the Division might change to";
  await route.fulfill({ response, json });
});
const changed = await opened(context, base);
if (changed.errors.length) problems.push(`a changed stamp throws: ${changed.errors.join("; ")}`);
if (!(await changed.page.locator("#rcv-flow svg").count())) problems.push("a changed stamp stops the charts");
await browser.close();
server.close();

problems.slice(0, 40).forEach((p) => console.log(p));
console.log(`${ids.length} contests at ${WIDTHS.length} widths, ${versions.length} versions, ${BROKEN.length + 1} failures simulated, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
