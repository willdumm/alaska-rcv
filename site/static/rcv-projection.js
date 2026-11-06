// The simulated outcome, from scripts/simulate_projection.mjs. It's always the whole contest,
// whatever the district filter says.
import { $, alaskaTime, el, fmt, pct, strong, withTip } from "./rcv-dom.js";
import { coverage, projection, swarm } from "./rcv-model.js";

const DOT_RADIUS = 5;
const LOW_RANKINGS = 0.5;

export function renderProjection(c) {
  const sim = projection.contests[c.id];
  const { runs } = projection.parameters;
  const status = $("rcv-projection-status"), box = $("rcv-projection"), table = $("rcv-projection-table"), note = $("rcv-projection-note");
  box.replaceChildren();
  table.replaceChildren();
  note.replaceChildren();
  if (!sim) {
    status.replaceChildren(el("p", {}, "This contest has one candidate, so there's nothing to simulate."));
    return;
  }
  const { cvr, hand, uncounted, questioned, notOnBallot } = sim.ballots;
  const cvrShare = cvr / (cvr + hand + uncounted + questioned);
  status.replaceChildren(...(projection.cvrLastModified === coverage.cvrLastModified ? [] : [
    el("p", { class: "rcv-callout" }, strong("Out of date: "), `these simulations used the scanned ballots posted ${alaskaTime(new Date(projection.cvrLastModified))}, not the one the rest of this page uses.`),
  ]), ...(cvrShare >= LOW_RANKINGS ? [] : [
    el("p", { class: "rcv-callout" }, strong("Few known ballots: "), `only ${pct(cvrShare, 1, 0)} of the ballots in these simulations have rankings we can see. The rest are copies, so the win counts here say much less than they seem to.`),
  ]));

  const roundsShown = [...new Set([1, c.letters.length - 1])];
  const winsOf = (l, round) => sim.runs.filter((r) => r.winner === l && (!round || r.round === round));
  const shareOf = (run) => run.votes / run.continuing;
  const order = d3.sort(c.order, (l) => -winsOf(l).length);
  const roundColumns = roundsShown.length > 1 ? roundsShown : [];
  // A win in round 1 is a first-choice majority, which ends the count. Every other win runs the tabulation down to two.
  const decided = (round) => (round === 1 ? "on first choices" : "after tabulation");
  table.replaceChildren(
    el("thead", {}, el("tr", {}, ...[c.measure ? "Result" : "Candidate", "Share of simulations", ...roundColumns.map((r) => `Won ${decided(r)}`), "Median winning share"].map((h) => el("th", { scope: "col" }, h)))),
    el("tbody", {}, ...order.map((l) => {
      const wins = winsOf(l);
      return el("tr", {}, el("th", { scope: "row", class: "keyed" }, el("i", { class: "rcv-key", style: `background:${c.color[l]}` }), c.byLetter[l].short),
        el("td", {}, `${wins.length} of ${runs}`), ...roundColumns.map((r) => el("td", {}, String(winsOf(l, r).length))),
        el("td", {}, wins.length ? pct(d3.median(wins, shareOf), 1) : "–"));
    })),
  );

  const width = Math.max(box.clientWidth, 280);
  const margin = { left: roundColumns.length ? 82 : 62, right: 26 };
  // Smaller dots on a phone, where the same shares have less width and stack higher.
  const radius = width < 500 ? 3 : DOT_RADIUS;
  const won = sim.runs.filter((r) => r.winner);
  // From a bare majority to the largest share in any simulation, so the axis means the same in every race.
  const high = Math.max(d3.max(won, shareOf) ?? 0, 0.51);
  const x = d3.scaleLinear([0.5, high], [margin.left + radius, width - margin.right - radius]);
  const svg = d3.select(box).append("svg").attr("role", "img")
    .attr("aria-label", `One dot per simulation, for each candidate, along that candidate's share of the votes when they won${roundColumns.length ? ", on separate lines for wins on first choices and wins after ranked choice tabulation" : ""}. The table above summarizes the same simulations.`);
  const grid = svg.append("g");
  let y = 0;
  for (const l of order.filter((l) => winsOf(l).length)) {
    const wins = winsOf(l);
    const group = svg.append("g").attr("transform", `translate(0,${y})`);
    group.append("circle").attr("cx", DOT_RADIUS).attr("cy", 11).attr("r", DOT_RADIUS - 1).attr("fill", c.color[l]);
    const heading = group.append("text").attr("x", DOT_RADIUS * 2 + 6).attr("y", 15);
    heading.append("tspan").attr("class", "strong").text(c.byLetter[l].short);
    heading.append("tspan").attr("class", "dim").text(`  ${wins.length} of ${runs} wins`);
    y += 24;
    for (const round of roundsShown) {
      const dots = swarm(winsOf(l, round).map((run) => ({ run, x: x(shareOf(run)), index: sim.runs.indexOf(run) })), radius);
      const reach = d3.max(dots, (d) => Math.abs(d.y)) ?? 0;
      const height = Math.max(38, 2 * (reach + radius) + 6);
      const line = svg.append("g").attr("transform", `translate(0,${y + height / 2})`);
      const label = line.append("text").attr("class", "dim");
      const count = `${dots.length} ${dots.length === 1 ? "win" : "wins"}`;
      if (roundsShown.length > 1) {
        label.append("tspan").attr("x", 0).attr("y", -3).text(round === 1 ? "First choices" : "Tabulation");
        label.append("tspan").attr("x", 0).attr("y", 12).text(count);
      } else {
        label.append("tspan").attr("x", 0).attr("y", 4).text(count);
      }
      line.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("stroke", "#c7ccd2");
      line.selectAll("circle").data(dots).join("circle").attr("cx", (d) => d.x).attr("cy", (d) => d.y).attr("r", radius)
        .attr("fill", c.color[l]).attr("stroke", "var(--bg)").attr("stroke-width", radius === DOT_RADIUS ? 2 : 1)
        .call(withTip, ({ run, index }) => [pct(run.votes, run.continuing),
          `${c.byLetter[l].short} wins simulation ${index + 1}${roundColumns.length ? ` ${decided(run.round)}` : ""}, with ${fmt(run.votes)} of ${fmt(run.continuing)} votes in the final count`,
          `Next: ${c.byLetter[run.runnerUp].short}, ${fmt(run.runnerUpVotes)}`]);
      y += height;
    }
    y += 22;
  }
  // The axis ends at the largest share, so that's always labelled, in place of a round tick too close to it.
  const ticks = [...x.ticks(width < 500 ? 3 : 6).filter((d) => x(high) - x(d) >= 56), high];
  const tickFormat = (d) => `${(d * 100).toFixed(high - 0.5 < 0.05 || d === high ? 1 : 0)}%`;
  grid.selectAll("line").data(ticks).join("line").attr("x1", x).attr("x2", x).attr("y1", 24).attr("y2", y).attr("stroke", "#e6e8eb");
  grid.selectAll("text").data(ticks).join("text").attr("x", x).attr("y", y + 16).attr("text-anchor", "middle").attr("class", "dim").text(tickFormat);
  // Two lines from the left edge on a phone, where one line runs off the screen.
  const axisTitle = !roundColumns.length ? ["Winner's share of the votes"]
    : width < 500 ? ["Winner's share of the votes", "at the end of tabulation"] : ["Winner's share of the votes at the end of tabulation"];
  const axisLabel = svg.append("text").attr("class", "dim");
  axisTitle.forEach((line, i) => axisLabel.append("tspan").attr("x", width < 500 ? 0 : margin.left).attr("y", y + 36 + i * 16).text(line));
  svg.attr("viewBox", `0 0 ${width} ${y + 42 + (axisTitle.length - 1) * 16}`);
  const winless = order.filter((l) => !winsOf(l).length);
  if (winless.length) {
    box.append(el("p", { class: "rcv-no-wins" }, `0 of ${runs} wins:`, ...winless.map((l) =>
      el("span", {}, el("i", { class: "rcv-key", style: `background:${c.color[l]}` }), c.byLetter[l].short))));
  }

  const ties = sim.runs.length - won.length;
  note.append(`Each of the ${runs} simulations adds to the ${fmt(cvr)} scanned ballots: ${fmt(hand)} counted by hand, about ${fmt(uncounted)} early and absentee not yet counted, and about ${fmt(questioned)} questioned.`
    + (ties ? ` ${ties} ${ties === 1 ? "simulation ends" : "simulations end"} in a tie and ${ties === 1 ? "isn't" : "aren't"} drawn.` : "")
    + (notOnBallot ? ` ${fmt(notOnBallot)} estimated ballots are left out here because their district's voters don't have this race.` : ""));
}
