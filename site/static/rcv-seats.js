// The picker's "all seats" views: a whole chamber on the map, and its seats per party across the simulations. These use the
// Division's summary and projection.json, without loading each race's ballots.
import { $, el, fmt, pct, withTip } from "./rcv-dom.js";
import { MIDDLE, coverage, ofRuns, projection } from "./rcv-model.js";
import { PARTY_GROUPS, partyGroup, rankedOutcomes, runsFromOutcomes, senateSeatOf } from "./rcv-chambers.js";
import { drawGroupHeadings, highlightDistricts, marginArm, shade } from "./rcv-districts.js";
import { actions, state } from "./rcv-state.js";

const colorOfGroup = Object.fromEntries(PARTY_GROUPS.map((g) => [g.key, g.color]));
const SIM_BREAKS = [600, 800, 950];
const NOT_ON_BALLOT = "#d4d7dc";
const MAX_OUTCOMES = 5;

export const isChamber = (id) => id === "house" || id === "senate";
export const chamberLabel = (id) => `All ${projection.chambers[id].seats} seats`;

// What a page needs from one race: first choices, with their leader, and who wins the most simulations.
function raceSummary(race) {
  const byDistrict = coverage.contests[race.name].byDistrict;
  const lastNames = race.candidates.map((x) => x.name.split(",")[0]);
  const candidates = race.candidates.map((x, i) => ({
    ...x,
    group: partyGroup(x.party),
    short: lastNames.indexOf(lastNames[i]) === lastNames.lastIndexOf(lastNames[i]) ? lastNames[i] : x.name,
    votes: Object.values(byDistrict[x.name] ?? {}).reduce((a, b) => a + b, 0),
    wins: projection.contests[race.id] ? projection.contests[race.id].winners[x.letter]?.wins ?? 0 : null,
  }));
  const total = candidates.reduce((sum, x) => sum + x.votes, 0);
  const [leader, next] = d3.sort(candidates, (x) => -x.votes);
  const lead = total ? ((leader.votes - (next?.votes ?? 0)) / total) * 100 : null;
  return { ...race, seat: race.seat.replace(/^HD /, "District "), candidates, total, leader, next, lead, simWinner: candidates.length > 1 ? d3.greatest(candidates, (x) => x.wins) : leader };
}

export function chamberContest(id) {
  const chamber = projection.chambers[id];
  const races = chamber.races.map(raceSummary);
  const byDistrict = new Map(races.flatMap((race) => race.hds.map((hd) => [hd, race])));
  return { id, chamber, races, name: `${chamber.name}, all ${chamber.seats} seats`, districts: d3.range(1, 41), raceAt: (hd) => byDistrict.get(hd), letters: [] };
}

const simWins = (race) => (race.candidates.length > 1 ? race.simWinner.wins : projection.parameters.runs);
const hasRunner = (race) => race.candidates.length > 1;
const withParty = (x) => `${x.short} (${PARTY_GROUPS.find((g) => g.key === x.group).name})`;

// A race's first choices within one house district, leader first. A Senate seat's two districts can have different leaders.
function firstChoicesIn(race, hd) {
  const byDistrict = coverage.contests[race.name].byDistrict;
  const votes = race.candidates.map((x) => ({ ...x, votes: byDistrict[x.name]?.[hd] ?? 0 }));
  const total = d3.sum(votes, (x) => x.votes);
  const [leader, next] = d3.sort(votes, (x) => -x.votes);
  return { total, leader, next, lead: total ? ((leader.votes - (next?.votes ?? 0)) / total) * 100 : null };
}
const firstChoicesLine = (candidates, total) => d3.sort(candidates, (x) => -x.votes).slice(0, 2).map((x) => `${withParty(x)} ${pct(x.votes, total)}`).join(", ");

function mapShares(c) {
  const notOnBallot = new Map(c.chamber.notOnBallot.flatMap((seat) => seat.hds.map((hd) => [hd, seat])));
  const colorOf = (hd) => {
    const race = c.raceAt(hd);
    if (!race) return NOT_ON_BALLOT;
    if (state.mapMode === "final") {
      const wins = simWins(race);
      const arm = marginArm(colorOfGroup[race.simWinner.group]);
      return wins < SIM_BREAKS[0] ? arm[0] : wins < SIM_BREAKS[1] ? arm[1] : wins < SIM_BREAKS[2] ? arm[2] : arm[3];
    }
    const here = firstChoicesIn(race, hd);
    return here.total ? shade(hasRunner(race) ? here.lead : 100, colorOfGroup[here.leader.group]) : MIDDLE;
  };
  const tipOf = (hd) => {
    const race = c.raceAt(hd);
    if (!race) {
      const seat = notOnBallot.get(hd);
      return `Senate ${seat.seat} isn't on this ballot: ${seat.name}, ${seat.party}, until ${seat.until}`;
    }
    if (!hasRunner(race)) return `${race.seat}: ${withParty(race.leader)} is the only candidate`;
    if (state.mapMode === "final") return `${race.seat}: ${withParty(race.simWinner)} wins ${ofRuns(race.simWinner.wins)} simulations`;
    if (!race.total) return `${race.seat}: no votes yet`;
    const whole = `${race.seat}: ${firstChoicesLine(race.candidates, race.total)}`;
    if (race.hds.length === 1) return whole;
    const here = firstChoicesIn(race, hd);
    return `${whole}. In this house district: ${here.total ? firstChoicesLine([here.leader, here.next], here.total) : "no votes yet"}`;
  };
  // The Senate map labels only its seats, so the tooltip names the seat and the house district.
  const titleOf = c.id === "senate" ? (hd) => `Senate ${senateSeatOf(hd)}, House District ${hd}` : null;
  return { mode: "chamber", colorOf, tipOf, titleOf };
}

function renderModes() {
  const box = $("rcv-map-mode");
  box.hidden = false;
  const option = (value, text) => el("label", {}, el("input", { type: "radio", name: "rcv-map-mode", value, checked: state.mapMode === value,
    onchange: () => { state.mapMode = value; actions.render(); } }), ` ${text}`);
  box.replaceChildren(option("first", "First choices"), option("final", "Simulations"));
  $("districts").querySelector(".rcv-tag").textContent = state.mapMode === "first" ? "Division's results" : "Simulated";
}

function renderLegend(c) {
  const swatch = (color) => el("i", { style: `background:${color}` });
  const groups = PARTY_GROUPS.flatMap((g) => [el("span", { class: "ramp", "aria-hidden": "true" }, ...marginArm(g.color).map(swatch)), g.name]);
  const bands = state.mapMode === "first"
    ? `Bands: a lead of under 2.5, to 10, to 25, and over 25 points, for the party of the first-choice leader${c.id === "senate" ? " in each house district" : ""}.`
    : `Bands: the party of the candidate winning most simulations, in under ${SIM_BREAKS[0]}, to ${SIM_BREAKS[1]}, to ${SIM_BREAKS[2]}, and ${SIM_BREAKS[2]} or more of ${fmt(projection.parameters.runs)}.`;
  $("rcv-map-legend").replaceChildren(...groups, el("span", {}, `${bands} ${c.chamber.notOnBallot.length ? "Darker gray: not on this ballot." : ""}`));
}

// One line per contested race: the first-choice leader's share, or the share of simulations its most frequent winner takes.
// Grouped by that candidate's party, highest share first, like a single race's list of districts.
function renderSeatDots(c) {
  const { runs } = projection.parameters;
  const first = state.mapMode === "first";
  const box = $("rcv-dots");
  box.replaceChildren();
  const rows = c.races.filter((race) => hasRunner(race) && (!first || race.total)).map((race) => {
    const who = first ? race.leader : race.simWinner;
    return { race, who, share: first ? who.votes / race.total : who.wins / runs };
  });
  const groups = PARTY_GROUPS.map((g) => ({ g, members: d3.sort(rows.filter((d) => d.who.group === g.key), (d) => -d.share) })).filter(({ members }) => members.length);
  const lines = groups.flatMap((group) => [group, ...group.members]);
  const width = Math.max(box.clientWidth, 280);
  const rowHeight = 23;
  const margin = { top: 44, left: 76, right: 110, bottom: 8 };
  const height = margin.top + lines.length * rowHeight + margin.bottom;
  const low = Math.min(0.5, Math.floor((d3.min(rows, (d) => d.share) ?? 0.5) * 20) / 20);
  const high = Math.max(0.55, Math.ceil((d3.max(rows, (d) => d.share) ?? 0.5) * 20) / 20);
  const x = d3.scaleLinear([low, high], [margin.left, width - margin.right]);
  const y = (d) => margin.top + lines.indexOf(d) * rowHeight;
  const label = first ? "of first choices" : "simulations won";
  const svg = d3.select(box).append("svg").attr("class", "rcv-seat-dots").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "group")
    .attr("aria-label", `Every contested seat's top candidate and that candidate's ${first ? "share of first choices" : "simulations won"}, grouped by party. Choose one to open its race.`);
  svg.append("text").attr("x", 4).attr("y", 13).attr("class", "strong").text(first ? "Leader's share of first choices" : `Most frequent winner's simulations won, of ${fmt(runs)}`);
  const ticks = x.ticks(width < 340 ? 3 : 5);
  const axis = svg.append("g");
  axis.selectAll("line").data(ticks).join("line").attr("x1", x).attr("x2", x).attr("y1", margin.top - 8).attr("y2", height - margin.bottom)
    .attr("stroke", (d) => (d === 0.5 ? "#a9b0b8" : "#e6e8eb"));
  axis.selectAll("text").data(ticks).join("text").attr("x", x).attr("y", margin.top - 13).attr("text-anchor", "middle").attr("class", "dim")
    .text((d) => (first ? `${Math.round(d * 100)}%` : fmt(d * runs)));

  const open = (d) => actions.selectContest(d.race.id);
  const row = svg.append("g").selectAll("g").data(rows).join("g").attr("class", "row")
    .attr("transform", (d) => `translate(0,${y(d)})`).attr("role", "link").attr("tabindex", 0)
    .attr("aria-label", (d) => `${d.race.seat}, ${withParty(d.who)}, ${first ? pct(d.share, 1) : ofRuns(d.who.wins)} ${label}`);
  row.append("rect").attr("class", "hit").attr("width", width).attr("height", rowHeight).attr("fill", "transparent").attr("rx", 3);
  row.append("text").attr("x", 4).attr("y", rowHeight / 2 + 4).text((d) => d.race.seat);
  row.append("circle").attr("cx", (d) => x(d.share)).attr("cy", rowHeight / 2).attr("r", 5).attr("fill", (d) => colorOfGroup[d.who.group]).attr("stroke", "#fff").attr("stroke-width", 2);
  row.append("text").attr("x", width - 4).attr("y", rowHeight / 2 + 4).attr("text-anchor", "end").text((d) => d.who.short);
  row.call(withTip, (d) => first ? [pct(d.share, 1), d.race.seat, firstChoicesLine(d.race.candidates, d.race.total)] : [ofRuns(d.who.wins), d.race.seat, `${withParty(d.who)} wins ${ofRuns(d.who.wins)} simulations`]);
  row.on("click", (event, d) => open(d))
    .on("keydown", (event, d) => { if (event.key === "Enter") open(d); })
    .on("pointerenter.map focus.map", (event, d) => highlightDistricts(d.race.hds))
    .on("pointerleave.map blur.map", () => highlightDistricts([]));

  drawGroupHeadings(svg, groups, { y, rowHeight, colorOf: ({ g }) => g.color, textOf: ({ g, members }) => `${g.name}: ${members.length} ${members.length === 1 ? "seat" : "seats"}` });
}

// The middle 90% and the median, for a list of seat counts.
const spread = (values) => {
  const sorted = d3.sort(values);
  return { median: d3.median(sorted), low: d3.quantile(sorted, 0.05), high: d3.quantile(sorted, 0.95) };
};

function renderSummaryTiles(c, perRun) {
  const { runs } = projection.parameters;
  const tile = (label, value, detail) => el("div", {}, el("dt", {}, label), el("dd", {}, value, el("small", {}, detail)));
  const leaders = Object.fromEntries(PARTY_GROUPS.map((g) => [g.key, c.races.filter((r) => r.total && r.leader.group === g.key).length + c.chamber.notOnBallot.filter((s) => partyGroup(s.party) === g.key).length]));
  const line = (of) => PARTY_GROUPS.map((g) => of(g)).join(" · ");
  const left = d3.sum(c.races, (r) => { const b = projection.contests[r.id]?.ballots; return b ? b.uncounted + b.questioned : 0; });
  $("rcv-tiles").replaceChildren(
    tile("First-choice leaders", line((g) => leaders[g.key]), `Republican, Democrat, others: seats of ${c.chamber.seats}${c.chamber.notOnBallot.length ? `, ${c.chamber.notOnBallot.length} not on this ballot` : ""}`),
    tile("With the rest simulated", line((g) => spread(perRun.map((s) => s[g.key])).median), `median seats in ${fmt(runs)} simulations, not a forecast`),
    tile("Ballots left", `about ${fmt(Math.round(left / 10) * 10)}`, "estimated, across races with more than one candidate"),
  );
}

// The seat splits the simulations reached most often. Each one is one simulation's seats for all the parties together. Each
// bar runs Republican, others, Democrat, so a bar past the mark at half the seats is a party with a majority of them.
function renderOutcomes(perRun) {
  const outcomes = rankedOutcomes(perRun);
  const shown = outcomes.slice(0, MAX_OUTCOMES);
  const rest = outcomes.slice(MAX_OUTCOMES);
  const restRuns = d3.sum(rest, (o) => o.count);
  const inBar = ["republican", "other", "democrat"].map((key) => PARTY_GROUPS.find((g) => g.key === key));
  const item = ({ seats, count }) => el("li", {},
    el("div", { class: "rcv-outcome-head" },
      el("span", {}, ...PARTY_GROUPS.map((g) => el("span", { class: "rcv-outcome-party" }, el("i", { class: "rcv-key", style: `background:${g.color}` }), `${seats[g.key]} ${g.name}`)),
        ...(seats.tied ? [el("span", { class: "rcv-outcome-party" }, `${seats.tied} tied`)] : [])),
      el("strong", {}, ofRuns(count))),
    el("div", { class: "rcv-seat-bar", "aria-hidden": "true" },
      ...inBar.map((g) => el("span", { style: `flex-grow:${seats[g.key]};background:${g.color}` })),
      ...(seats.tied ? [el("span", { style: `flex-grow:${seats.tied};background:${NOT_ON_BALLOT}` })] : [])));
  $("rcv-projection").replaceChildren(
    el("h3", { class: "rcv-outcomes-title" }, outcomes.length === 1 ? "The one seat split in every simulation" : "Most common seat splits"),
    el("ol", { class: "rcv-outcomes" }, ...shown.map(item)),
    el("p", { class: "rcv-no-wins" }, `${rest.length ? `${rest.length} other ${rest.length === 1 ? "split" : "splits"} make up the remaining ${ofRuns(restRuns)}. ` : ""}The mark on each bar is half the seats.`),
  );
}

function renderSeatTotals(c, perRun) {
  const majority = Math.floor(c.chamber.seats / 2) + 1;
  const held = (g) => c.chamber.notOnBallot.filter((s) => partyGroup(s.party) === g.key).length;
  const alone = (g) => c.races.filter((r) => r.candidates.length === 1 && r.candidates[0].group === g.key).length;
  const hasOff = c.chamber.notOnBallot.length > 0;
  $("rcv-projection-table").replaceChildren(
    el("thead", {}, el("tr", {}, ...["Party registration", "Median seats", "Middle 90%", `With ${majority} or more`, ...(hasOff ? ["Not on this ballot"] : []), "Unopposed"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...PARTY_GROUPS.map((g) => {
      const seats = perRun.map((s) => s[g.key]);
      const { median, low, high } = spread(seats);
      return el("tr", {}, el("th", { scope: "row", class: "keyed" }, el("i", { class: "rcv-key", style: `background:${g.color}` }), g.name),
        ...[String(median), `${Math.round(low)} to ${Math.round(high)}`, ofRuns(seats.filter((n) => n >= majority).length), ...(hasOff ? [String(held(g))] : []), String(alone(g))].map((t) => el("td", {}, t)));
    })),
  );

  renderOutcomes(perRun);

  const tied = spread(perRun.map((s) => s.tied)).high;
  $("rcv-projection-note").replaceChildren(`Each of the ${fmt(projection.parameters.runs)} simulations runs every contested race at once. In each one, all Republican candidates share one skew and all Democratic candidates share another, on top of each candidate's own, so a good night for a party shows up across its races. Nonpartisan and minor-party candidates have only their own.${tied ? " A race tied in a simulation counts for no party, so its seats can add up to fewer than the total." : ""}`);
}

export function renderChamber(c) {
  const perRun = runsFromOutcomes(c.chamber.outcomes);
  $("rcv-projection-status").replaceChildren();
  $("rcv-projection-intro").replaceChildren(el("p", {}, `This counts seats, by each candidate's party registration, with every race simulated together. ${c.chamber.notOnBallot.length ? `The ${c.chamber.notOnBallot.length} seats not on this ballot count for their current holders. ` : ""}Alaska's chambers have often been run by bipartisan coalitions, so a party's seat count doesn't say who would control one.`));
  renderSummaryTiles(c, perRun);
  renderModes();
  renderLegend(c);
  renderSeatDots(c);
  renderSeatTotals(c, perRun);
  $("rcv-selected").textContent = "Select a district to open its race.";
  return mapShares(c);
}
