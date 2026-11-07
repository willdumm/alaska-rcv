// The Alaska 2026 ranked-choice explorer: counts in the browser with rcv-tabulate.js, from the Division's first choices and
// the rankings extract_cvr.py pulled out of the cast vote record. This file holds the page's status, tables and controls.
// rcv-model.js has the numbers, and the charts have their own modules.
import { tabulate } from "./rcv-tabulate.js";
import { ballotCounts } from "./rcv-rows.js";
import { measureContest, measuresIn } from "./rcv-measures.js";
import { $, alaskaTime, el, fmt, hideTip, pct, strong } from "./rcv-dom.js";
import { INACTIVE_COLOR, LOW_RANKINGS, ballotsLeft, ballotsLeftInContest, countedBallots, coverage, districtName, districtShares, districts, index, knownRankings, majorityIn, ofRuns, parseStamp, placesOf, prepareContest, projection, readRanking, roundTen, setData, summaryEntry, summaryFor } from "./rcv-model.js";
import { renderFlow, roundStory } from "./rcv-flow.js";
import { renderProjection } from "./rcv-projection.js";
import { drawMap, paintMap, renderCoverage, renderDots, renderMapLegend, renderMapMode, setLastShares, windAllRings } from "./rcv-districts.js";
import { actions, currentContest, state } from "./rcv-state.js";
import { chamberContest, chamberLabel, isChamber, renderChamber } from "./rcv-seats.js";
import { chooseVersion, renderVersions } from "./rcv-versions.js";

let dataDir;
let earlierVersion = null;
const contests = new Map();
let updatedText;
let measures;

// Data

async function json(name) {
  const response = await fetch(dataDir + name);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.json();
}

async function loadContest(id) {
  if (contests.has(id)) return contests.get(id);
  const measure = measures.find((m) => m.id === id);
  const c = prepareContest(measure ? measureContest(measure, index.measures) : await json(`contest-${id}.json`));
  contests.set(id, c);
  return c;
}

// Status

function renderStatus() {
  const { report, cvrLastModified, fetched, received } = coverage;
  const stamp = parseStamp(report.stamp);
  updatedText = stamp?.short ?? report.stamp;
  $("rcv-updated").textContent = stamp?.long ?? report.stamp;
  $("rcv-updated-detail").textContent = `The Division's results, with ${report.precinctsReported} of ${report.precinctsTotal} precincts and ${fmt(report.votersCast)} ballots. Scanned ballots posted ${alaskaTime(new Date(cvrLastModified))}. Ballots received as of ${received.asOf}. Last checked ${alaskaTime(new Date(fetched))}.`;
}


// The one line of numbers above the map: first choices, the rounds, the simulations, and what's left.
function renderSummary(c, result) {
  const whole = state.hd === "all";
  const tile = (label, value, detail, link) => el("div", {}, el("dt", {}, label), el("dd", {}, value, el("small", {}, detail, ...(link ? [" ", el("a", { href: link.href }, link.text)] : []))));
  const tiles = [];
  const named = (l, votes, active) => `${c.byLetter[l].short} ${pct(votes[l], active)}`;
  const summary = summaryFor(c, state.hd);
  if (summary?.total) {
    const [top, next] = d3.sort(c.letters, (l) => -summary.votes[l]);
    tiles.push(tile(c.measure ? "Votes" : "First choices", named(top, summary.votes, summary.total), `${next ? `${named(next, summary.votes, summary.total)}, ` : ""}from the Division's results`));
  }
  const last = result.rounds[result.rounds.length - 1];
  if (result.rounds.length > 1 && last.active) {
    const [top, next] = d3.sort(c.letters, (l) => -last.votes[l]);
    tiles.push(tile("Current result after tabulation", named(top, last.votes, last.active), `${named(next, last.votes, last.active)}, if counting stopped now.`, { href: "#rcv-flow", text: "see the ranked choice tabulation" }));
  }
  const sim = projection.contests[c.id];
  if (sim) {
    const top = d3.greatest(c.letters, (l) => sim.winners[l]?.wins ?? 0);
    tiles.push(tile(`Simulated final outcomes${whole ? "" : ", whole contest"}`, `${c.byLetter[top].short} ${ofRuns(sim.winners[top]?.wins ?? 0)}`, "a share of simulations, not a chance of winning.", { href: "#projection", text: "see the simulation" }));
  }
  const left = whole ? ballotsLeftInContest(c) : ballotsLeft(c, state.hd);
  tiles.push(tile("Ballots left to count", `about ${fmt(roundTen(left.total))}`, "estimated: not yet counted, or questioned"));
  $("rcv-tiles").replaceChildren(...tiles);
}

// The count

function renderCount(c, hd) {
  const stopped = tabulate(countedBallots(c, hd), c.letters);
  const keep = state.keepCounting && c.letters.length > 2;
  const result = keep ? tabulate(countedBallots(c, hd), c.letters, [], { ignoreMajority: true }) : stopped;

  renderCountText(c);
  renderCallout(c, result);
  renderKeepCounting(c, stopped, keep);
  renderFlow(c, result);
  renderRounds($("rcv-rounds"), c, result, false);
  renderTransfers(c, result);
  renderRounds($("rcv-cvr-rounds"), c, tabulate(ballotCounts(c, hd), c.letters), true);
  return result;
}

// Only a race with three or more candidates has rounds to project: otherwise this is the Division's summary as it stands.
function renderCountText(c) {
  const ranked = c.letters.length > 2;
  const notHere = "The simulations below add the ballots not yet counted, so they can name a different leader.";
  const intro = c.measure ? `The Division's results. ${notHere}`
    : c.letters.length === 1 ? "The Division's first choices, without write-ins. This contest has one candidate, so there are no rounds to run."
    : !ranked ? `The Division's first choices, without write-ins. With two candidates, no one is eliminated, so there's one round. ${notHere}`
    : `Round 1 is the Division's first choices, without write-ins. Later rounds are an estimate from scanned ballots with the same first choice. ${notHere}`;
  $("rcv-count-intro").replaceChildren(el("p", {}, intro));
  $("count-title").textContent = ranked ? "Ranked choice tabulation, for ballots counted so far" : "The count so far";
  document.querySelector("#count .rcv-tag").textContent = ranked ? "Projected from the Division's results" : "Division's results";
  $("rcv-projection-intro").replaceChildren(...(c.letters.length === 1 ? [] : [el("p", {}, "How often each candidate won, always for the whole contest. That's a share of simulations, not a chance of winning.")]));
}

// At most one warning above the rounds: the first of these that applies.
function renderCallout(c, result) {
  const last = result.rounds[result.rounds.length - 1];
  const whole = state.hd === "all";
  const warning = () => {
    const summary = summaryFor(c, state.hd);
    if (!result.rounds[0].active) return ["Nothing here yet. ", "No ballots match this selection."];
    const writeIns = summaryEntry(c)?.writeIn ?? 0;
    if (summary && whole && writeIns) {
      const top = d3.max(Object.values(summary.votes)) ?? 0;
      // Collectively first, or a close second to the leader.
      if (writeIns >= top - (summary.total + writeIns) * 0.005) return ["Write-ins matter here. ", `Write-ins have ${fmt(writeIns)} first choices. Under state rules (6 AAC 25.071) their rankings may count in this contest. Scanned ballot data doesn't name write-ins, so these rounds can't be right if they do.`];
    }
    const tie = result.rounds.find((r) => r.tieForLast);
    if (tie) return ["Tie for last. ", `${tie.tieForLast.map((l) => c.byLetter[l].short).join(" and ")} tie. The Division would decide this by lot. This page eliminates ${c.byLetter[tie.eliminated].short} as a placeholder.`];
    if (result.tiedFinal) return ["Tied. ", "Ranked choice tabulation ends in a tie on these ballots."];
    const known = knownRankings(c, state.hd);
    if (c.letters.length > 2 && known < LOW_RANKINGS) return ["Few known rankings. ", `Rankings are known for only ${pct(known, 1, 0)} of these ballots. The rest were counted by hand, so where their votes go next is close to a guess.`];
    if (whole && (result.rounds.length > 1 || c.measure)) {
      const [a, b] = c.letters.map((l) => last.votes[l]).sort(d3.descending);
      const left = roundTen(ballotsLeftInContest(c).total);
      if (a - b < left) return ["Not settled. ", `The gap${c.measure ? "" : " after ranked choice tabulation"} is about ${fmt(a - b)} ballots, with about ${fmt(left)} left.`];
    }
    return null;
  };
  const found = warning();
  $("rcv-callouts").replaceChildren(...(c.measure ? [el("p", {}, c.about)] : []), ...(found ? [el("p", { class: "rcv-callout" }, strong(found[0]), found[1])] : []));
}

function renderKeepCounting(c, stopped, keep) {
  const box = $("rcv-keep");
  box.replaceChildren();
  if (!stopped.majorityInRoundOne || c.letters.length <= 2) return;
  const check = el("input", { type: "checkbox", checked: keep, onchange: (event) => { state.keepCounting = event.target.checked; render(); } });
  box.append(`${c.byLetter[stopped.leader].short} has over half of the first choices, which ends Alaska's tabulation. `, el("label", {}, check, " Keep counting down to two anyway"));
}

// `full` splits out why ballots aren't counting. The projected rounds only know that for the ballots in the CVR, so they don't.
function renderRounds(table, c, result, full) {
  const { rounds } = result;
  const won = majorityIn(rounds);
  const cell = (votes, active, majority) => el("td", {}, votes === null ? "" : fmt(votes), votes === null || !active ? "" : el("span", { class: "pct" }, `${pct(votes, active)}${majority ? " · majority" : ""}`));
  const rows = c.order.map((l) => {
    const eliminatedAt = rounds.findIndex((r) => r.eliminated === l);
    return el("tr", {}, el("th", { scope: "row" }, c.byLetter[l].short, el("span", { class: "pct" }, (c.byLetter[l].parties || []).join(", "))),
      ...rounds.map((r, i) => cell(eliminatedAt >= 0 && i > eliminatedAt ? null : r.votes[l], r.active, won?.round === i && won.letter === l)));
  });
  const line = (name, value, cls = "") => el("tr", { class: cls }, el("th", { scope: "row" }, name), ...rounds.map((r) => el("td", {}, fmt(value(r)))));
  const stoppedIn = (r) => r.exhausted + r.overvotes - rounds[0].overvotes;
  const inactive = full
    ? [line("Blank", (r) => r.blanks), line("Two candidates at one rank", (r) => r.overvotes), ...(c.measure ? [] : [line("Ran out of rankings", (r) => r.exhausted)])]
    : [...(rounds.length > 1 ? [line("Needed for a majority", (r) => Math.floor(r.active / 2) + 1)] : []), ...(d3.max(rounds, stoppedIn) > 0 ? [line("Stopped counting", stoppedIn)] : [])];
  table.replaceChildren(
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, c.measure ? "Choice" : "Candidate"), ...rounds.map((_, i) => el("th", { scope: "col" }, c.measure ? "Votes" : `Round ${i + 1}`)))),
    el("tbody", {}, ...rows, line(c.measure ? "Total" : "Ballots still in the count", (r) => r.active, "total"), ...inactive),
  );
}

function renderTransfers(c, result) {
  const drawn = result.rounds[0].active > 0 && c.letters.length > 1;
  $("rcv-transfers").replaceChildren(...(drawn ? result.rounds.map((r, i) => el("li", {}, `Round ${i + 1}: ${roundStory(c, result, i)}`)) : []));
}

// Drill-down

// First choices come from the Division's summary, which has every counted ballot. Everything after comes from the CVR.
function renderDrill(c, ballots) {
  const read = ballots.map(([pattern, count]) => ({ ...readRanking(pattern, c.letters), count }));
  const summary = summaryFor(c, state.hd);
  // Drop any part of the path that no longer has ballots behind it.
  const valid = [];
  for (const l of state.path) {
    const prefix = [...valid, l];
    if (!read.some((r) => prefix.every((p, i) => r.seq[i] === p))) break;
    valid.push(l);
  }
  state.path = valid;
  if (!state.path.length && read.length) {
    const first = d3.rollup(read.filter((r) => r.seq.length), (v) => d3.sum(v, (r) => r.count), (r) => r.seq[0]);
    const top = summary?.total ? [summary.leader] : [...first].sort((a, b) => b[1] - a[1])[0];
    if (top && first.has(top[0])) state.path = [top[0]];
  }

  const levels = [];
  // A ballot can name each candidate once, so one block per candidate covers every ranking.
  for (let depth = 0; depth <= state.path.length && depth < c.letters.length; depth++) {
    const prefix = state.path.slice(0, depth);
    const here = read.filter((r) => prefix.every((p, i) => r.seq[i] === p));
    const fromSummary = depth === 0 && summary?.total;
    const total = fromSummary ? summary.total : d3.sum(here, (r) => r.count);
    if (!total) break;
    const counts = new Map();
    if (fromSummary) {
      for (const l of c.letters) counts.set(l, summary.votes[l]);
    } else {
      for (const r of here) {
        const key = r.seq.length > depth ? r.seq[depth] : r.end;
        counts.set(key, (counts.get(key) || 0) + r.count);
      }
    }
    const rows = [...counts].sort((a, b) => {
      const ca = c.color[a[0]] ? 0 : 1, cb = c.color[b[0]] ? 0 : 1;
      return ca - cb || b[1] - a[1];
    });
    const buttons = rows.map(([key, count]) => {
      const isCandidate = Boolean(c.color[key]);
      const name = isCandidate ? c.byLetter[key].short
        : key === "overvotes" ? "Overvote: stops here"
        : depth === 0 ? "No candidate ranked" : "No further ranking";
      const selected = isCandidate && state.path[depth] === key;
      const content = [
        el("span", { class: "top" }, el("span", {}, name), el("span", { class: "num" }, fromSummary ? `${pct(count, total)} · ${fmt(count)}` : `${pct(count, total)} · ${fmt(count)} of ${fmt(total)}`)),
        el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(count / total) * 100}%;background:${isCandidate ? c.color[key] : INACTIVE_COLOR}` })),
      ];
      if (!isCandidate || depth === c.letters.length - 1) return el("div", { class: "rcv-choice" }, ...content);
      return el("button", { type: "button", class: "rcv-choice", "aria-pressed": String(selected), onclick: () => {
        state.path = selected ? state.path.slice(0, depth) : [...prefix, key];
        renderDrill(c, ballots);
      } }, ...content);
    });
    const heading = depth === 0
      ? el("h3", {}, "First choice", el("small", {}, fromSummary ? `${fmt(total)} votes in the Division's results` : `${fmt(total)} scanned ballots`))
      : el("h3", {}, `Next after ${prefix.map((l) => c.byLetter[l].short).join(" → ")}`, el("small", {}, `${fmt(total)} scanned ballots`));
    levels.push(el("div", { class: "rcv-level" }, heading, ...buttons));
  }
  $("rcv-drill").replaceChildren(...levels);
  if (!levels.length) $("rcv-drill").append(el("p", { class: "muted" }, "No scanned ballots match this selection."));

  const depths = new Map();
  for (const r of read) depths.set(r.seq.length, (depths.get(r.seq.length) || 0) + r.count);
  const total = d3.sum(read, (r) => r.count);
  const biggest = d3.max([...depths.values()]) || 1;
  $("rcv-depth").replaceChildren(...[...depths].sort((a, b) => a[0] - b[0]).flatMap(([n, count]) => [
    el("span", {}, n === 0 ? "None" : n === 1 ? "1 candidate" : `${n} candidates`),
    el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(count / biggest) * 100}%` })),
    el("span", {}, `${fmt(count)} · ${pct(count, total)}`),
  ]));
}

function selectContest(id) {
  state.contest = id;
  state.hd = "all";
  state.path = [];
  state.keepCounting = false;
  return render();
}

function selectDistrict(hd) {
  const race = currentContest.value?.raceAt?.(hd);
  if (currentContest.value?.chamber) { if (race) selectContest(race.id); return; }
  state.hd = state.hd === hd ? "all" : hd;
  state.keepCounting = false;
  render();
}

// Filters

function fillFilters(c) {
  const contestSelect = $("f-contest");
  if (!contestSelect.options.length) {
    const groups = [["Statewide", (x) => index.statewide.includes(x.id)], ["State Senate", (x) => x.name.startsWith("Senate")], ["State House", (x) => x.name.startsWith("House")], ["Ballot measures", (x) => x.name.startsWith("Ballot Measure")]];
    const order = (x) => index.statewide.indexOf(x.id);
    for (const [label, test] of groups) {
      const chosen = [...index.contests, ...measures].filter(test);
      if (label === "Statewide") chosen.sort((a, b) => order(a) - order(b));
      const whole = { "State Senate": "senate", "State House": "house" }[label];
      contestSelect.append(el("optgroup", { label }, ...(whole ? [el("option", { value: whole }, `${label}: ${chamberLabel(whole).toLowerCase()}`)] : []), ...chosen.map((x) => el("option", { value: x.id }, x.name))));
    }
  }
  contestSelect.value = state.contest;

  const hdSelect = $("f-hd");
  hdSelect.replaceChildren(el("option", { value: "all" }, c.districts.length > 2 ? "All districts" : "All on this ballot"),
    ...c.districts.map((hd) => el("option", { value: hd }, hd === 99 ? "Overseas absentee" : `District ${hd}: ${placesOf(hd)}`)));
  hdSelect.value = state.hd;
}

const defaultContest = () => index.contests.find((x) => x.name === "U.S. Senator").id;

function readURL() {
  state.contest = defaultContest();
  const q = new URLSearchParams(location.search);
  const contest = Number(q.get("contest"));
  if ([...index.contests, ...measures].some((x) => x.id === contest)) state.contest = contest;
  if (isChamber(q.get("contest"))) state.contest = q.get("contest");
  if (q.get("hd") && Number(q.get("hd"))) state.hd = Number(q.get("hd"));
}

function writeURL() {
  const q = new URLSearchParams();
  if (earlierVersion) q.set("version", earlierVersion.id);
  if (state.contest !== defaultContest()) q.set("contest", state.contest);
  if (state.hd !== "all") q.set("hd", state.hd);
  const text = q.toString();
  history.replaceState(null, "", text ? `?${text}` : location.pathname);
}

function renderDistrictWarning() {
  const narrowed = state.hd !== "all";
  $("f-hd").classList.toggle("narrowed", narrowed);
  const warning = $("rcv-district-warning");
  warning.hidden = !narrowed;
  if (!narrowed) { warning.replaceChildren(); return; }
  warning.replaceChildren(strong(`Only ${districtName(state.hd)}. `), el("span", { class: "rcv-warning-detail" }, "Everything but the simulations shows this one district, not the whole contest. "),
    el("button", { type: "button", class: "rcv-reset", onclick: () => selectDistrict(state.hd) }, "Reset to all districts"));
}

function scopeText(c) {
  return `${earlierVersion ? "Earlier version. " : ""}${c.name}, ${state.hd === "all" ? "all districts" : districtName(state.hd)}. Preliminary and unofficial, results as of ${updatedText}.`;
}

// Says so on the page, rather than leaving a half-drawn page that could be read as results.
function showFailure(error) {
  console.error(error);
  $("rcv-updated").textContent = "Couldn't draw this page";
  $("rcv-updated-detail").textContent = `Something went wrong (${error.message}), so the numbers below may be missing or out of step. Please try reloading.`;
  $("rcv-callouts").replaceChildren(el("p", { class: "rcv-callout" }, strong("This view didn't draw. "), "Please reload, or choose another contest."));
}

let renderToken = 0;
function render() {
  return draw().catch(showFailure);
}

async function draw() {
  const token = ++renderToken;
  const whole = isChamber(state.contest);
  const c = whole ? chamberContest(state.contest) : await loadContest(state.contest);
  if (token !== renderToken) return;
  currentContest.value = c;
  $("count").hidden = whole;
  $("f-hd").closest("label").hidden = whole;
  $("rcv-coverage").closest("details").hidden = whole;
  $("rcv-dots-details").querySelector("summary").textContent = whole ? "Every contested seat, ranked" : "Every district, ranked";
  if (state.hd !== "all" && !c.districts.includes(state.hd)) state.hd = "all";
  fillFilters(c);
  renderDistrictWarning();
  $("rcv-scope").textContent = scopeText(c);

  if (whole) {
    $("ranks-section").hidden = true;
    $("rcv-dots-note").hidden = true;
    $("rcv-dots-final-note").hidden = true;
    setLastShares(renderChamber(c));
    drawMap();
    paintMap();
    writeURL();
    return;
  }

  renderSummary(c, renderCount(c, state.hd));
  renderProjection(c);
  $("ranks-section").hidden = Boolean(c.measure);
  if (!c.measure) renderDrill(c, ballotCounts(c, state.hd));
  renderMapMode(c);
  const shares = districtShares(c, state.mapMode);
  setLastShares(shares);
  renderDots(c, shares);
  renderCoverage(c, shares);
  renderMapLegend(c, shares);
  drawMap();
  paintMap();
  writeURL();
}

async function main() {
  const version = await chooseVersion(new URLSearchParams(location.search).get("version"));
  dataDir = version.dir;
  earlierVersion = version.earlier;
  try {
    if (typeof d3 === "undefined") throw new Error("the chart library didn't load");
    const [ballotsFile, coverageFile, districtsFile, namesFile, earlyAbsentee, questioned, projectionFile] = await Promise.all([json("ballots.json"), json("coverage.json"), json("districts.geojson"), json("district-names.json"), json("early-absentee-2024.json"), json("questioned-2024.json"), json("projection.json")]);
    setData({ index: ballotsFile, coverage: coverageFile, districts: districtsFile, districtNames: namesFile, earlyAbsentee2024: earlyAbsentee, questioned2024: questioned, projection: projectionFile });
    measures = measuresIn(index);
  } catch (error) {
    $("rcv-updated").textContent = "Couldn't load the data";
    $("rcv-updated-detail").textContent = `The election data didn't load (${error.message}). Please try reloading.`;
    return;
  }
  renderVersions(version);
  actions.render = render;
  actions.selectDistrict = selectDistrict;
  actions.selectContest = selectContest;
  try {
    renderStatus();
  } catch (error) {
    showFailure(error);
  }
  readURL();
  // The district plot starts collapsed on a phone, and only a phone can collapse it.
  const phone = matchMedia("(max-width: 760px)");
  const dotsDetails = $("rcv-dots-details");
  dotsDetails.open = !phone.matches;
  windAllRings();
  await render();
  phone.addEventListener("change", () => { dotsDetails.open = !phone.matches; });
  // A closed box has no width to draw to, so draw the plot again when it opens.
  dotsDetails.addEventListener("toggle", () => { if (dotsDetails.open) render(); });

  $("f-contest").addEventListener("change", (event) => {
    const { value } = event.target;
    state.contest = isChamber(value) ? value : Number(value);
    if (isChamber(value)) state.hd = "all";
    state.path = [];
    state.keepCounting = false;
    render();
  });
  $("f-hd").addEventListener("change", (event) => {
    state.hd = event.target.value === "all" ? "all" : Number(event.target.value);
    state.keepCounting = false;
    render();
  });
  $("rcv-filters").addEventListener("submit", (event) => event.preventDefault());

  // Charts are sized to their boxes, so redraw when a box's width changes.
  let width = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth === width) return;
    width = innerWidth;
    render();
  });
  addEventListener("scroll", hideTip, { passive: true });
}

main();

