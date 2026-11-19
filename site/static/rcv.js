// The Alaska 2026 ranked-choice explorer: counts in the browser with rcv-tabulate.js, from the Division's first choices and
// the rankings extract_cvr.py pulled out of the cast vote record. This file holds the page's status, tables and controls.
// rcv-model.js has the numbers, and the charts have their own modules.
import { tabulate } from "./rcv-tabulate.js";
import { ballotCounts } from "./rcv-rows.js";
import { measureContest, measuresIn } from "./rcv-measures.js";
import { $, alaskaTime, el, fmt, pct, strong, watchPointers } from "./rcv-dom.js";
import { INACTIVE_COLOR, LOW_RANKINGS, WRITE_IN_COLOR, ballotsLeft, ballotsLeftInContest, countedBallots, coverage, districtName, districtShares, districts, firstChoices, index, isFinal, knownRankings, majorityIn, ofRuns, parseStamp, placesOf, prepareContest, projection, readRanking, roundTen, setData, summaryFor, writeInsMatter } from "./rcv-model.js";
import { renderFlow, roundStory } from "./rcv-flow.js";
import { renderProjection } from "./rcv-projection.js";
import { renderHistory, renderShareHistory } from "./rcv-history.js";
import { drawMap, paintMap, renderCoverage, renderDots, renderMapLegend, renderMapMode, setLastShares, windAllRings } from "./rcv-districts.js";
import { actions, currentContest, state } from "./rcv-state.js";
import { chamberContest, chamberLabel, isChamber, renderChamber } from "./rcv-seats.js";
import { chooseVersion, loadHistory, renderVersions, watchForNewer } from "./rcv-versions.js";

let dataDir;
let earlierVersion = null;
const contests = new Map();
let updatedText;
let measures;
let simHistory = null;

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
  $("rcv-updated-detail").textContent = isFinal()
    ? `The Division's final count, unofficial until it's certified: all ${report.precinctsTotal} precincts and ${fmt(report.votersCast)} ballots, every one scanned. Ballots posted ${alaskaTime(new Date(cvrLastModified))}.`
    : `The Division's results, with ${report.precinctsReported} of ${report.precinctsTotal} precincts and ${fmt(report.votersCast)} ballots. Scanned ballots posted ${alaskaTime(new Date(cvrLastModified))}. Ballots received as of ${received.asOf}. Last checked ${alaskaTime(new Date(fetched))}.`;
}


// The one line of numbers above the map: first choices (a ballot measure's votes), the current result, the simulations, and
// what's left.
function renderSummary(c, result) {
  const whole = state.hd === "all";
  const tile = (label, value, detail, link) => el("div", {}, el("dt", {}, label), el("dd", {}, value, el("small", {}, detail, ...(link ? [" ", el("a", { href: link.href }, link.text)] : []))));
  const tiles = [];
  const named = (l, votes, active) => `${c.byLetter[l].short} ${pct(votes[l], active)}`;
  // First choices as marked, not reassigned, with write-in and blank first choices in the total: the count's first column, as
  // everywhere else on the page.
  const summary = summaryFor(c, state.hd);
  const first = c.measure ? { votes: summary?.votes, total: summary?.total, other: null }
    : result.first ? { votes: result.first.votes, total: result.first.active, other: result.first.votes.W }
    : { votes: result.rounds[0].votes, total: result.rounds[0].active, other: null };
  if (first.total) {
    const [top, next] = d3.sort(c.letters, (l) => -first.votes[l]);
    const detail = [...(next ? [named(next, first.votes, first.total)] : []), ...(first.other ? [`write-in or blank ${pct(first.other, first.total)}`] : [])].join(", ");
    tiles.push(tile(c.measure ? "Votes" : "First choices", named(top, first.votes, first.total), c.measure ? `${detail}, from the Division's results` : detail));
  }
  // Where Alaska's count would end now: round 1 if someone has a majority there, or the last round. One district's ballots
  // don't decide a race, so there the leader only leads.
  const { stopped } = result;
  if (!c.measure && c.letters.length > 1 && stopped.rounds[0].active) {
    const final = stopped.rounds[stopped.rounds.length - 1];
    const when = stopped.rounds.length === 1 ? "in round 1" : "after tabulation";
    const value = stopped.leader ? `${c.byLetter[stopped.leader].short} ${whole ? "wins" : "leads"} ${when} with ${pct(final.votes[stopped.leader], final.active)}` : `Tied ${when}`;
    tiles.push(isFinal() ? tile("Result", value, "in the final count.", { href: "#rcv-flow", text: "see the ranked choice tabulation" })
      : tile("Current result", value, "if counting stopped now.", { href: "#rcv-flow", text: "see the ranked choice tabulation" }));
  }
  if (isFinal()) {
    $("rcv-tiles").replaceChildren(...tiles);
    return;
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

  result.first = firstChoices(c, countedBallots(c, hd));
  result.stopped = stopped;

  renderCountText(c, result);
  renderCallout(c, result);
  renderKeepCounting(c, stopped, keep);
  renderFlow(c, result, result.first);
  renderRounds($("rcv-rounds"), c, result, false, result.first);
  renderTransfers(c, result);
  renderRounds($("rcv-cvr-rounds"), c, tabulate(ballotCounts(c, hd), c.letters), true);
  return result;
}

// Only a race with three or more candidates has rounds to project. The chart and table show write-in and blank first choices
// being reassigned, so the text only says why.
function renderCountText(c, result) {
  const ranked = c.letters.length > 2;
  const notHere = isFinal() ? "" : " The simulations in the next section account for ballots not yet counted, so their winning candidates may not match current tabulation results here.";
  const later = isFinal() ? " Every ballot was scanned, so every round is counted from the ballots themselves." : " Later rounds are an estimate from scanned ballots with the same first choice.";
  const reassigned = result.first ? "Ballots with a write-in or blank first choice are reassigned to the candidate they rank highest (AS 15.15.350(d)). " : "";
  const intro = c.measure ? `The Division's results.${notHere}`
    : c.letters.length === 1 ? `${reassigned}This contest has one candidate, so round 1 decides it.`
    : !ranked ? `${reassigned}With two candidates, the one with more votes wins.${notHere}`
    : `${reassigned}If a candidate ${result.first ? "then " : ""}has over half the votes, they win in round 1. Otherwise the candidate with the fewest votes is eliminated, one round at a time, until two remain.${later}${notHere}`;
  $("rcv-count-intro").replaceChildren(el("p", {}, intro));
  $("count-title").textContent = isFinal() ? (ranked ? "Ranked choice tabulation" : "The count") : ranked ? "Ranked choice tabulation, for ballots counted so far" : "The count so far";
  document.querySelector("#count .rcv-tag").textContent = ranked && !isFinal() ? "Projected from the Division's results" : c.measure ? "Division's results" : "From the Division's results";
  $("rcv-projection-intro").replaceChildren(...(c.letters.length === 1 ? [] : [el("p", {}, "Here we simulate how the remaining ballots could look, based on the counts of ballots expected and the candidate shares of votes already counted in each district. The table below shows how many times each possible election outcome was observed in 1000 simulated elections. These should not be interpreted as candidates' probabilities of winning.")]));
}

// At most one warning above the rounds: the first of these that applies.
function renderCallout(c, result) {
  const last = result.rounds[result.rounds.length - 1];
  const whole = state.hd === "all";
  const warning = () => {
    const summary = summaryFor(c, state.hd);
    if (!result.rounds[0].active) return ["Nothing here yet. ", "No ballots match this selection."];
    const writeIns = summary?.writeIn ?? 0;
    if (whole && writeInsMatter(d3.max(Object.values(summary?.votes ?? {})) ?? 0, writeIns)) return ["Write-ins matter here. ", `Write-ins alone have ${fmt(writeIns)} first choices in the Division's results. Under state rules (6 AAC 25.071) their rankings may count in this contest. Scanned ballot data doesn't name write-ins, so these rounds can't be right if they do.`];
    const tie = result.rounds.find((r) => r.tieForLast);
    if (tie) return ["Tie for last. ", `${tie.tieForLast.map((l) => c.byLetter[l].short).join(" and ")} tie. The Division would decide this by lot. This page eliminates ${c.byLetter[tie.eliminated].short} as a placeholder.`];
    if (result.tiedFinal) return ["Tied. ", "Ranked choice tabulation ends in a tie on these ballots."];
    const known = knownRankings(c, state.hd);
    if (c.letters.length > 2 && known < LOW_RANKINGS) return ["Few known rankings. ", `Rankings are known for only ${pct(known, 1, 0)} of these ballots. The rest were counted by hand, so where their votes go next is close to a guess.`];
    if (whole && (result.rounds.length > 1 || c.measure || c.letters.length === 2)) {
      const [a, b] = c.letters.map((l) => last.votes[l]).sort(d3.descending);
      const left = roundTen(ballotsLeftInContest(c).total);
      if (a - b < left) return ["Not settled. ", `The gap${c.measure ? "" : c.letters.length === 2 ? " in the count" : " after ranked choice tabulation"} is about ${fmt(a - b)} ballots, with about ${fmt(left)} left.`];
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
  box.append(`${c.byLetter[stopped.leader].short} has over half of round 1, which ends Alaska's tabulation. `, el("label", {}, check, " Keep counting down to two anyway"));
}

// `full` splits out why ballots aren't counting. The projected rounds only know that for the ballots in the CVR, so they don't.
// `first` adds first choices as a column before round 1, with a Write-in or blank row, kept last.
function renderRounds(table, c, result, full, first = null) {
  const { rounds } = result;
  const columns = first ? [first, ...rounds] : rounds;
  const shift = first ? 1 : 0;
  // Marked as in the chart. A lone candidate has every vote, so their majority goes without saying.
  const found = c.letters.length > 1 ? majorityIn(rounds) : null;
  const won = found && { ...found, round: found.round + shift };
  const cell = (votes, active, majority) => el("td", {}, votes === null ? "" : fmt(votes), votes === null || !active ? "" : el("span", { class: "pct" }, `${pct(votes, active)}${majority ? " · majority" : ""}`));
  const rows = c.order.map((l) => {
    const eliminatedAt = columns.findIndex((r) => r.eliminated === l);
    return el("tr", {}, el("th", { scope: "row" }, c.byLetter[l].short, el("span", { class: "pct" }, (c.byLetter[l].parties || []).join(", "))),
      ...columns.map((r, i) => cell(eliminatedAt >= 0 && i > eliminatedAt ? null : r.votes[l], r.active, won?.round === i && won.letter === l)));
  });
  if (first) rows.push(el("tr", {}, el("th", { scope: "row" }, "Write-in or blank"), ...columns.map((r, i) => cell(i ? null : r.votes.W, r.active, false))));
  const line = (name, value, cls = "") => el("tr", { class: cls }, el("th", { scope: "row" }, name), ...columns.map((r) => el("td", {}, value(r) === null ? "" : fmt(value(r)))));
  const setAside = first ? first.transfers.exhausted : 0;
  const stoppedIn = (r) => (r.firstChoices ? null : setAside + r.exhausted + r.overvotes - rounds[0].overvotes);
  const inactive = full
    ? [line("No candidate ranked", (r) => r.blanks), line("Two candidates at one rank", (r) => r.overvotes), ...(c.measure ? [] : [line("Ran out of rankings", (r) => r.exhausted)])]
    : [...(rounds.length > 1 ? [line("Needed for a majority", (r) => (r.firstChoices ? null : Math.floor(r.active / 2) + 1))] : []), ...(d3.max(rounds, stoppedIn) > 0 ? [line("Stopped counting", stoppedIn)] : [])];
  table.replaceChildren(
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, c.measure ? "Choice" : "Candidate"), ...columns.map((_, i) => el("th", { scope: "col" }, c.measure ? "Votes" : first && i === 0 ? "First choices" : `Round ${i + 1 - shift}`)))),
    el("tbody", {}, ...rows, line(c.measure ? "Total" : "Ballots still in the count", (r) => r.active, "total"), ...inactive),
  );
}

function renderTransfers(c, result) {
  const drawn = result.rounds[0].active > 0 && c.letters.length > 1;
  const { first } = result;
  const columns = first ? [first, ...result.rounds] : result.rounds;
  $("rcv-transfers").replaceChildren(...(drawn ? columns.map((r, i) => el("li", {}, `${first && i === 0 ? "First choices" : `Round ${i + (first ? 0 : 1)}`}: ${roundStory(c, result, i, first)}`)) : []));
}

// Drill-down

// First choices come from the count's first column (firstChoices in rcv-model.js), which has every counted ballot, with
// write-in and blank first choices together as "W". Everything after comes from the CVR. A ballot reassigned from a write-in
// or blank first choice has "W" before its candidates, so choosing "W" shows who those ballots rank next.
function renderDrill(c, ballots) {
  const continuing = new Set(c.letters);
  const read = ballots.map(([pattern, count]) => {
    const ranking = readRanking(pattern, c.letters);
    const reassigned = !continuing.has(pattern[0]) && (pattern[0] === "W" || ranking.seq.length > 0);
    return { ...ranking, seq: reassigned ? ["W", ...ranking.seq] : ranking.seq, count };
  });
  const summary = summaryFor(c, state.hd);
  const first = firstChoices(c, countedBallots(c, state.hd));
  const nameOf = (key) => (key === "W" ? "Write-in or blank" : c.byLetter[key].short);
  // Drop any part of the path that no longer has ballots behind it.
  const valid = [];
  for (const l of state.path) {
    const prefix = [...valid, l];
    if (!read.some((r) => prefix.every((p, i) => r.seq[i] === p))) break;
    valid.push(l);
  }
  state.path = valid;
  if (!state.path.length && read.length) {
    const firstRanks = d3.rollup(read.filter((r) => r.seq.length), (v) => d3.sum(v, (r) => r.count), (r) => r.seq[0]);
    const top = summary?.total ? [summary.leader] : [...firstRanks].sort((a, b) => b[1] - a[1])[0];
    if (top && firstRanks.has(top[0])) state.path = [top[0]];
  }

  const levels = [];
  // A ballot can name each candidate once, so one block per candidate covers every ranking.
  const maxDepth = c.letters.length + (state.path[0] === "W" ? 1 : 0);
  for (let depth = 0; depth <= state.path.length && depth < maxDepth; depth++) {
    const prefix = state.path.slice(0, depth);
    const here = read.filter((r) => prefix.every((p, i) => r.seq[i] === p));
    const fromSummary = depth === 0 && (first || summary?.total);
    const total = !fromSummary ? d3.sum(here, (r) => r.count) : first ? first.active : summary.total;
    if (!total) break;
    const counts = new Map();
    if (fromSummary) {
      for (const l of c.letters) counts.set(l, (first ?? summary).votes[l]);
      if (first) counts.set("W", first.votes.W);
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
      const name = isCandidate || key === "W" ? nameOf(key)
        : key === "overvotes" ? "Overvote: stops here"
        : depth === 0 ? "No candidate ranked" : "No further ranking";
      const selected = state.path[depth] === key;
      const content = [
        el("span", { class: "top" }, el("span", {}, name), el("span", { class: "num" }, fromSummary ? `${pct(count, total)} · ${fmt(count)}` : `${pct(count, total)} · ${fmt(count)} of ${fmt(total)}`)),
        el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(count / total) * 100}%;background:${isCandidate ? c.color[key] : key === "W" ? WRITE_IN_COLOR : INACTIVE_COLOR}` })),
      ];
      if (isCandidate ? depth === maxDepth - 1 : key !== "W") return el("div", { class: "rcv-choice" }, ...content);
      return el("button", { type: "button", class: "rcv-choice", "aria-pressed": String(selected), onclick: () => {
        state.path = selected ? state.path.slice(0, depth) : [...prefix, key];
        renderDrill(c, ballots);
      } }, ...content);
    });
    const heading = depth === 0
      ? el("h3", {}, "First choice", el("small", {}, !fromSummary ? `${fmt(total)} scanned ballots` : first ? `${fmt(total)} ballots counted` : `${fmt(total)} votes in the Division's results`))
      : el("h3", {}, `Next after ${prefix.map(nameOf).join(" → ")}`, el("small", {}, `${fmt(total)} scanned ballots`));
    levels.push(el("div", { class: "rcv-level" }, heading, ...buttons));
  }
  $("rcv-drill").replaceChildren(...levels);
  if (!levels.length) $("rcv-drill").append(el("p", { class: "muted" }, "No scanned ballots match this selection."));

  const depths = new Map();
  for (const r of read) { const n = r.seq.filter((k) => k !== "W").length; depths.set(n, (depths.get(n) || 0) + r.count); }
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
  return navigate();
}

function selectDistrict(hd) {
  const race = currentContest.value?.raceAt?.(hd);
  if (currentContest.value?.chamber) { if (race) selectContest(race.id); return; }
  state.hd = state.hd === hd ? "all" : hd;
  state.keepCounting = false;
  navigate();
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
  state.hd = "all";
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
  const url = text ? `?${text}` : location.pathname;
  if (pushURL && (text ? `?${text}` : "") !== location.search) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
  pushURL = false;
}

// A reader choosing a contest or district gets a new history entry, so Back returns to the one before. Anything else that
// redraws (a resize, a check that tidies the URL on load) rewrites the current entry.
let pushURL = false;
function navigate() {
  pushURL = true;
  return render();
}

function renderDistrictWarning() {
  const narrowed = state.hd !== "all";
  $("f-hd").classList.toggle("narrowed", narrowed);
  const warning = $("rcv-district-warning");
  warning.hidden = !narrowed;
  if (!narrowed) { warning.replaceChildren(); return; }
  warning.replaceChildren(strong(`Only ${districtName(state.hd)}. `), el("span", { class: "rcv-warning-detail" }, isFinal() ? "Everything but the simulation history shows this one district, not the whole contest. " : "Everything but the simulations shows this one district, not the whole contest. "),
    el("button", { type: "button", class: "rcv-reset", onclick: () => selectDistrict(state.hd) }, "Reset to all districts"));
}

function scopeText(c) {
  return `${earlierVersion ? "Earlier version. " : ""}${c.name}, ${state.hd === "all" ? "all districts" : districtName(state.hd)}. ${isFinal() ? "Final count, unofficial until certified" : "Preliminary and unofficial, results"} as of ${updatedText}.`;
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
  // The final count has nothing left to simulate, so it looks back at the simulations instead, for one contest at a time.
  $("projection").hidden = isFinal();
  $("history").hidden = !isFinal() || whole;
  $("rcv-cvr-rounds").closest("details").hidden = isFinal();
  $("f-hd").closest("label").hidden = whole;
  $("rcv-coverage").closest("details").hidden = whole;
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
  if (isFinal()) {
    renderHistory(c, simHistory);
    renderShareHistory(c, simHistory);
  } else renderProjection(c);
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

// The browser puts a reloaded page back where the reader was as soon as it loads, before the charts draw, so on a short page
// it lands at the bottom, and stays with the bottom as the charts grow above it. So the page saves its place for this tab when
// it's hidden, and goes back there itself once the charts have drawn. Storage can be blocked, and then a reload starts at the top.
history.scrollRestoration = "manual";
const SCROLL_KEY = "rcv-scroll";
function saveScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: location.href, y: scrollY }));
  } catch {}
}
function savedScroll() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY));
    sessionStorage.removeItem(SCROLL_KEY);
    return saved?.url === location.href ? saved.y : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const scrollBack = savedScroll();
  addEventListener("pagehide", saveScroll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveScroll(); });
  const version = await chooseVersion(new URLSearchParams(location.search).get("version"));
  dataDir = version.dir;
  earlierVersion = version.earlier;
  try {
    if (typeof d3 === "undefined") throw new Error("the chart library didn't load");
    const [ballotsFile, coverageFile, districtsFile, namesFile, earlyAbsentee, questioned, projectionFile] = await Promise.all([json("ballots.json"), json("coverage.json"), json("districts.geojson"), json("district-names.json"), json("early-absentee-2024.json"), json("questioned-2024.json"), json("projection.json")]);
    setData({ index: ballotsFile, coverage: coverageFile, districts: districtsFile, districtNames: namesFile, earlyAbsentee2024: earlyAbsentee, questioned2024: questioned, projection: projectionFile });
    measures = measuresIn(index);
    if (isFinal()) simHistory = await loadHistory();
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
  windAllRings();
  await render();
  if (scrollBack) scrollTo(0, scrollBack);
  watchForNewer(version);

  $("f-contest").addEventListener("change", (event) => {
    const { value } = event.target;
    state.contest = isChamber(value) ? value : Number(value);
    if (isChamber(value)) state.hd = "all";
    state.path = [];
    state.keepCounting = false;
    navigate();
  });
  $("f-hd").addEventListener("change", (event) => {
    state.hd = event.target.value === "all" ? "all" : Number(event.target.value);
    state.keepCounting = false;
    navigate();
  });
  addEventListener("popstate", () => {
    readURL();
    state.path = [];
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
  watchPointers();
}

main();

