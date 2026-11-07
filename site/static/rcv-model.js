// The page's numbers, with no drawing: the page imports this and the tests run it directly. Nothing here touches the DOM or d3.
import { readBallot, tabulate } from "./rcv-tabulate.js";
import { questionedAheadOfCvr, questionedByDistrict, uncountedByDistrict } from "./rcv-uncounted.js";
import { GROUP, ballotCounts, eachRow, sum } from "./rcv-rows.js";
import { PARTY_COLORS } from "./rcv-chambers.js";
import { projectedBallots } from "./rcv-projected.js";
import { fmt } from "./rcv-dom.js";

// The loaded data files. These are live bindings, so the drawing modules always see what setData last set.
export let index, coverage, districts, districtNames, earlyAbsentee2024, questioned2024, projection;
export function setData(data) {
  ({ index, coverage, districts, districtNames, earlyAbsentee2024, questioned2024, projection } = data);
  uncountedEstimate = undefined;
  questionedEstimates.clear();
}

// A count of simulations, as the page always writes one.
export const ofRuns = (count) => `${fmt(count)} of ${fmt(projection.parameters.runs)}`;

export const MIDDLE = "#ece9e4";
export const MARGIN_BREAKS = [2.5, 10, 25];
export const LOW_COVERAGE = 0.9;
// Under this share of ballots with known rankings, where the rest go next is close to a guess.
export const LOW_RANKINGS = 0.5;

export function lowCoverage(hd) {
  const { summary, cvr } = districtBallots(hd);
  return summary > 0 && cvr / summary < LOW_COVERAGE;
}

// In each contest the best-placed Republican is red, Democrat blue and independent yellow. Everyone else
// takes the next of OTHER_COLORS. Checked for contrast against this
// site's white surface. A candidate keeps its colour through every filter within a contest.
const CANDIDATE_COLORS = { republican: PARTY_COLORS.republican, democrat: PARTY_COLORS.democrat, independent: PARTY_COLORS.other };
const OTHER_COLORS = ["#1baf7a", "#a0529e", "#e87ba4"];
const MEASURE_COLORS = { Y: "#1baf7a", N: "#a0529e" };
export const INACTIVE_COLOR = "#9aa2ab";
// A ticket counts as its first name's party. The Division lists some candidates with no party at all.
export function partyOf(candidate) {
  const party = (candidate.parties?.[0] ?? "").split("/")[0];
  if (party === "Registered Republican") return "republican";
  if (party === "Registered Democrat") return "democrat";
  return party === "Nonpartisan" || party === "Undeclared" ? "independent" : null;
}

// Adds what drawing needs to a loaded contest: short names, a colour and display order that don't change with the
// district selected, and which districts it has ballots in.
export function prepareContest(c) {
  c.letters = c.candidates.map((x) => x.letter);
  c.byLetter = Object.fromEntries(c.candidates.map((x) => [x.letter, x]));

  // A short name for tight places. Two candidates can share a last name (the two Sullivans).
  const lastName = (x) => x.name.split(/[,/]/)[0];
  const lastNames = new Map();
  for (const x of c.candidates) lastNames.set(lastName(x), (lastNames.get(lastName(x)) || 0) + 1);
  for (const x of c.candidates) x.short = lastNames.get(lastName(x)) > 1 ? x.name : lastName(x);

  // Colours and display order come from the whole contest, so filters don't repaint anyone.
  const whole = tabulate(countedBallots(c), c.letters, [], { ignoreMajority: true });
  const finalRound = whole.rounds[whole.rounds.length - 1];
  const finalists = c.letters.filter((l) => !whole.rounds.some((r) => r.eliminated === l))
    .sort((a, b) => finalRound.votes[b] - finalRound.votes[a]);
  const eliminated = whole.rounds.map((r) => r.eliminated).filter(Boolean).reverse();
  c.order = [...finalists, ...eliminated];
  const others = [...OTHER_COLORS];
  const parties = new Set();
  c.color = {};
  for (const l of c.order) {
    const party = partyOf(c.byLetter[l]);
    c.color[l] = party && !parties.has(party) ? CANDIDATE_COLORS[party] : others.shift();
    if (party) parties.add(party);
  }
  if (c.measure) { c.order = c.letters; c.color = MEASURE_COLORS; }

  // Districts with a ballot in the CVR, or a vote in the summary: some rural ones have only the second.
  const inSummary = c.candidates.flatMap((x) => Object.keys(summaryEntry(c)?.byDistrict[x.summaryName ?? x.name] ?? {}).map(Number));
  c.districts = [...new Set([...[...eachRow(c)].map((row) => row.hd), ...inSummary])].sort((a, b) => a - b);
  return c;
}

// What a ballot says under the count's rules: its candidates in order, and how it ends.
export function readRanking(pattern, letters) {
  const remaining = new Set(letters);
  const seq = [];
  for (;;) {
    const read = readBallot(pattern, remaining);
    if (!remaining.has(read)) return { seq, end: read };
    seq.push(read);
    remaining.delete(read);
  }
}

// The Division's first choices, for a whole contest or one district, without write-ins so they
// compare with the count (which passes write-ins over). Null if there's nothing to compare.
export const summaryEntry = (c) => coverage.contests[c.summaryName ?? c.name];

export function summaryFor(c, hd) {
  const summary = summaryEntry(c);
  if (!summary) return null;
  const votes = {};
  for (const x of c.candidates) {
    const by = summary.byDistrict[x.summaryName ?? x.name];
    if (!by) return null;
    votes[x.letter] = hd === "all" ? sum(Object.values(by)) : by[hd] || 0;
  }
  const total = sum(Object.values(votes));
  const leader = c.letters.reduce((a, b) => (votes[b] > votes[a] ? b : a));
  return { votes, total, leader, writeIn: hd === "all" ? summary.writeIn : null, timesCast: summary.timesCast };
}

// Every ballot the summary has counted, with later rankings from the CVR (rcv-projected.js), for the whole contest or one
// district. Falls back on the CVR's own ballots if the summary doesn't have this contest.
export function countedBallots(c, hd = "all") {
  const summary = summaryEntry(c);
  const names = c.candidates.map((x) => x.summaryName ?? x.name);
  if (!summary || names.some((name) => !summary.byDistrict[name])) return ballotCounts(c, hd);
  c.projected ??= projectedBallots(c, (letter) => summary.byDistrict[names[c.candidates.findIndex((x) => x.letter === letter)]]);
  return hd === "all" ? [...c.projected.values()].flat() : c.projected.get(hd) ?? [];
}

export function districtBallots(hd) {
  const d = coverage.districts[hd];
  return { summary: sum(Object.values(d?.summary ?? {})), cvr: sum(Object.values(d?.cvr ?? {})) };
}

export const districtName = (hd) => (hd === 99 ? "Overseas absentee" : `District ${hd}`);
// The name on the Division's form H07, like "Kodiak/Seward/Cordova". The overseas row has none.
export const placesOf = (hd) => districtNames?.names[hd] ?? "";

// The report's time, as written. The stamp has no time zone. The Division's servers put its files online 24 minutes later
// by their Last-Modified header, which fits Alaska time. Null if the Division changes the format.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function parseStamp(stamp) {
  const match = String(stamp).match(/^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):\d+ ([AP]M)$/);
  if (!match || !MONTHS[match[1] - 1]) return null;
  const [, month, day, year, hour, minute, half] = match;
  return { short: `${MONTHS[month - 1]} ${day}, ${hour}:${minute} ${half} Alaska time`, long: `${MONTHS[month - 1]} ${day}, ${year}, ${hour}:${minute} ${half} Alaska time` };
}

// Which round first puts a candidate over half the continuing ballots. Continuing ballots only shrink
// and that candidate's pile only grows, so later rounds can't change who finishes first.
export function majorityIn(rounds) {
  for (const [round, r] of rounds.entries()) {
    const letter = Object.keys(r.votes).find((l) => r.votes[l] * 2 > r.active);
    if (letter) return { round, letter };
  }
  return null;
}

// Offsets each point's y from its line by as little as keeps it from touching the ones already placed.
export function swarm(points, radius, maxReach = Infinity) {
  const placed = [];
  const offset = (step) => (step % 2 ? (step + 1) / 2 : -step / 2);
  for (const point of [...points].sort((p, q) => p.x - q.x)) {
    const clear = (y) => placed.every((o) => (o.x - point.x) ** 2 + (o.y - y) ** 2 >= (2 * radius) ** 2);
    let step = 0;
    while (Math.abs(offset(step)) <= maxReach && !clear(offset(step))) step++;
    if (Math.abs(offset(step)) > maxReach) continue;
    point.y = offset(step);
    placed.push(point);
  }
  return placed;
}

// Who leads each district, and with what share. In "first" mode that's of every candidate's first choices in the summary. In
// "final" mode it's of the two statewide finalists in the projected final round, as if only they were left. A ballot's final
// reading doesn't depend on the order of eliminations, so this matches running the count to the end.
export function districtShares(c, mode = "first") {
  if (c.letters.length < 2) return null;
  const [a, b] = c.order;
  const removed = c.letters.filter((l) => l !== a && l !== b);
  const running = c.order.filter((l) => mode === "first" || l === a || l === b);
  const entry = (hd) => {
    const votes = mode === "first" ? summaryFor(c, hd)?.votes ?? tabulate(ballotCounts(c, hd), c.letters).rounds[0].votes
      : tabulate(countedBallots(c, hd), c.letters, removed).rounds[0].votes;
    const total = sum(running.map((l) => votes[l]));
    const [leader, next] = [...running].sort((p, q) => votes[q] - votes[p]);
    return { hd, votes, total, leader, next, share: total ? votes[leader] / total : null };
  };
  return { mode, shares: new Map(c.districts.map((hd) => [hd, entry(hd)])), whole: entry("all") };
}

export const isStatewide = (c) => Boolean(c.measure) || index.statewide.includes(c.id);

let uncountedEstimate;
function uncountedIn(hd) {
  uncountedEstimate ??= uncountedByDistrict(coverage, earlyAbsentee2024);
  return uncountedEstimate.get(hd) || 0;
}

// Questioned ballots this contest should still get in a district: what's expected, less any already in the CVR.
const questionedEstimates = new Map();
function questionedIn(c, hd) {
  const kind = isStatewide(c);
  if (!questionedEstimates.has(kind)) questionedEstimates.set(kind, questionedByDistrict(coverage, questioned2024, kind));
  if (!c.cvrQuestioned) {
    c.cvrQuestioned = new Map();
    for (const { hd: rowHd, group, count } of eachRow(c)) {
      if (group === GROUP.QUESTIONED) c.cvrQuestioned.set(rowHd, (c.cvrQuestioned.get(rowHd) || 0) + count);
    }
  }
  return Math.max(0, questionedEstimates.get(kind).get(hd) - (c.cvrQuestioned.get(hd) || 0) - questionedAheadOfCvr(coverage, questioned2024, kind, hd));
}

// Ballots the summary doesn't include yet in a district: estimates of those not yet counted, and of questioned ones.
// `hand` is those the summary has and the CVR doesn't, so their first choices are known and their rankings aren't.
export function ballotsLeft(c, hd) {
  const { summary, cvr } = districtBallots(hd);
  const hand = Math.max(0, summary - cvr), uncounted = uncountedIn(hd), questioned = questionedIn(c, hd);
  return { hand, uncounted, questioned, total: uncounted + questioned };
}

// The same for the whole contest. Statewide contests count every district. Others count the districts they have ballots in.
export function ballotsLeftInContest(c) {
  const parts = (isStatewide(c) ? Object.keys(coverage.districts).map(Number) : c.districts).map((hd) => ballotsLeft(c, hd));
  const total = (key) => sum(parts.map((p) => p[key]));
  return { hand: total("hand"), uncounted: total("uncounted"), questioned: total("questioned"), total: total("total") };
}

// The share of the counted ballots whose rankings are known, in a contest or district.
export function knownRankings(c, hd) {
  const counted = hd === "all" ? summaryEntry(c)?.timesCast : districtBallots(hd).summary;
  const cvr = sum(ballotCounts(c, hd).map((b) => b[1]));
  return counted ? Math.min(1, cvr / counted) : 1;
}

// Ballots left are estimates, so they're shown to the nearest 10.
export const roundTen = (n) => Math.round(n / 10) * 10;
