// How the simulations moved as the Division posted more of the count, from history.json (scripts/build_history.mjs). Shown with
// the final count, in place of the simulation, since there's nothing left to simulate. Each version's point is the share of
// simulations a candidate won on the data posted then. The final count's point is who won: every simulation of it ends the same way.
// Below it, each candidate's simulated shares in the first and final rounds: the median, and the band holding the middle of them.
import { $, alaskaTime, el, fmt, pct, withTip } from "./rcv-dom.js";

const dayOf = (date) => date.toLocaleString("en-US", { timeZone: "America/Anchorage", month: "short", day: "numeric" });
// Midnights in Alaska, every `step` days. The count ran after daylight saving time ended, so Alaska is 9 hours behind UTC throughout.
const ALASKA_OFFSET = 9 * 3600e3;
const alaskaMidnights = ([start, end], step) => d3.utcDay.every(step).range(new Date(+start - ALASKA_OFFSET), new Date(+end - ALASKA_OFFSET + 1))
  .map((d) => new Date(+d + ALASKA_OFFSET)).filter((d) => d >= start && d <= end);

// An end label: the candidate's name, then how they finished.
const endLabel = (c) => (t) => t
  .call((s) => s.append("tspan").attr("class", "strong").attr("fill", (d) => c.color[d.l]).text((d) => c.byLetter[d.l].short))
  .call((s) => s.append("tspan").attr("class", "dim").text((d) => ` ${d.text}`));

// How wide the widest end label is, drawn once off the chart, with "Final count" if there is one.
function widestLabel(box, c, labels, finalPoint) {
  const probe = d3.select(box).append("svg");
  probe.selectAll("text").data(labels).join("text").call(endLabel(c));
  if (finalPoint) probe.append("text").attr("class", "dim").text("Final count");
  const width = d3.max(probe.selectAll("text").nodes(), (n) => n.getComputedTextLength()) || 0;
  probe.remove();
  return width;
}

// The dates along the bottom, at Alaska midnights about 60 pixels apart, so they don't run into each other.
function dateAxis(svg, x, width, height, margin) {
  const days = (x.domain()[1] - x.domain()[0]) / 864e5;
  const step = [1, 2, 3, 4, 7].find((k) => days / k <= (width - margin.left - margin.right) / 60) ?? 7;
  const xTicks = alaskaMidnights(x.domain(), step);
  svg.append("g").selectAll("text").data(xTicks).join("text").attr("x", x).attr("y", height - margin.bottom + 18).attr("text-anchor", "middle").attr("class", "dim").text(dayOf);
}

function finalMarker(svg, x, finalPoint, height, margin) {
  svg.append("line").attr("x1", x(finalPoint.date)).attr("x2", x(finalPoint.date)).attr("y1", margin.top - 8).attr("y2", height - margin.bottom).attr("stroke", "#a9b0b8").attr("stroke-dasharray", "3 3");
  svg.append("text").attr("x", x(finalPoint.date) + 8).attr("y", margin.top - 12).attr("class", "dim").text("Final count");
}

// End labels, nudged apart so two finishing at the same height don't overlap.
function drawEndLabels(svg, c, labels, labelX) {
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);
  svg.append("g").selectAll("text").data(labels).join("text").attr("x", labelX).attr("y", (d) => d.y + 4).call(endLabel(c));
}

export function renderHistory(c, history) {
  const box = $("rcv-history"), table = $("rcv-history-table"), note = $("rcv-history-note");
  box.replaceChildren();
  table.replaceChildren();
  note.replaceChildren();
  const series = history?.contests[c.id];
  if (!series) {
    box.append(el("p", {}, c.letters.length === 1 ? "This contest has one candidate, so it was never simulated." : "There's no simulation history for this contest."));
    return;
  }
  const { runs } = history;
  const points = history.versions.map((v, i) => ({ ...v, date: new Date(v.time), wins: series.wins[i], ties: series.ties[i] })).filter((p) => p.wins);
  const finalPoint = points.find((p) => p.final);
  const simulated = points.filter((p) => !p.final);
  const winsOf = (p, l) => p.wins[l] ?? 0;
  // Everyone who won a simulation at some point, most wins at the end first.
  const last = points[points.length - 1];
  const shown = d3.sort(c.letters.filter((l) => points.some((p) => winsOf(p, l))), (l) => -winsOf(last, l));

  const width = Math.max(box.clientWidth, 280);
  const narrow = width < 500;
  // Room for the longest end label.
  const labelWidth = widestLabel(box, c, shown.map((l) => ({ l, text: finalPoint ? "lost" : fmt(runs) })), finalPoint);
  const margin = { top: 26, right: Math.min(Math.ceil(labelWidth) + 16, width / 2), bottom: 30, left: 44 };
  const height = narrow ? 240 : 280;
  const x = d3.scaleUtc(d3.extent(points, (p) => p.date), [margin.left, width - margin.right]);
  const y = d3.scaleLinear([0, runs], [height - margin.bottom, margin.top]);
  const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
    .attr("aria-label", `For each candidate, the share of ${fmt(runs)} simulations they won, at each update the Division posted, ending at the final count. The table below has the same numbers.`);

  const grid = svg.append("g");
  const yTicks = [0, runs / 4, runs / 2, (runs * 3) / 4, runs];
  grid.selectAll("line").data(yTicks).join("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y).attr("y2", y)
    .attr("stroke", (d) => (d === runs / 2 ? "#a9b0b8" : "#e6e8eb"));
  grid.selectAll("text").data(yTicks).join("text").attr("x", margin.left - 6).attr("y", (d) => y(d) + 4).attr("text-anchor", "end").attr("class", "dim")
    .text((d) => `${Math.round((d / runs) * 100)}%`);
  svg.append("text").attr("x", 0).attr("y", 12).attr("class", "strong").text("Share of simulations won");
  dateAxis(svg, x, width, height, margin);
  if (finalPoint) finalMarker(svg, x, finalPoint, height, margin);

  const line = d3.line().x((p) => x(p.date)).y((p) => y(p.value));
  const labels = [];
  for (const l of shown) {
    const values = simulated.map((p) => ({ date: p.date, value: winsOf(p, l), p }));
    const group = svg.append("g");
    group.append("path").attr("d", line(values)).attr("fill", "none").attr("stroke", c.color[l]).attr("stroke-width", 2);
    if (finalPoint && values.length) {
      const end = { date: finalPoint.date, value: winsOf(finalPoint, l) };
      group.append("path").attr("d", line([values[values.length - 1], end])).attr("fill", "none").attr("stroke", c.color[l]).attr("stroke-width", 2).attr("stroke-dasharray", "4 3");
    }
    group.selectAll("circle").data(values).join("circle").attr("cx", (d) => x(d.date)).attr("cy", (d) => y(d.value)).attr("r", narrow ? 3 : 3.5)
      .attr("fill", c.color[l]).attr("stroke", "var(--bg)").attr("stroke-width", 1.5)
      .call(withTip, (d) => [`${fmt(d.value)} of ${fmt(runs)}`, `${c.byLetter[l].short} wins this many simulations`, `${alaskaTime(d.date)}: ${fmt(d.p.counted)} ballots counted`]);
    const endValue = finalPoint ? winsOf(finalPoint, l) : values[values.length - 1]?.value ?? 0;
    labels.push({ l, y: y(endValue), text: finalPoint ? (endValue === runs ? "won" : "lost") : `${fmt(endValue)}` });
  }
  drawEndLabels(svg, c, labels, (finalPoint ? x(finalPoint.date) : width - margin.right) + 8);

  const neverWon = c.order.filter((l) => !shown.includes(l));
  table.replaceChildren(
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Results posted"), el("th", { scope: "col" }, "Ballots counted"), ...shown.map((l) => el("th", { scope: "col" }, c.byLetter[l].short)))),
    el("tbody", {}, ...[...points].reverse().map((p) => el("tr", {}, el("th", { scope: "row" }, `${alaskaTime(p.date)}${p.final ? " (final count)" : ""}`), el("td", {}, fmt(p.counted)),
      ...shown.map((l) => el("td", {}, p.final ? (winsOf(p, l) === runs ? "Won" : "–") : fmt(winsOf(p, l))))))),
  );
  const ties = d3.sum(simulated, (p) => p.ties ?? 0);
  note.append(`Each point runs this page's simulation, ${fmt(runs)} times, on what the Division had posted at that time, so it isn't exactly what this page showed that day. A point is a share of simulations, not a chance of winning, and chance alone moves a close race by about 16 of ${fmt(runs)} from one point to the next.`
    + (finalPoint ? " The dashed lines end at the final count, which has no ballots left to simulate." : "")
    + (neverWon.length ? ` ${new Intl.ListFormat("en").format(neverWon.map((l) => c.byLetter[l].short))} won no simulations.` : "")
    + (ties ? ` Simulations that ended in a tie aren't drawn.` : ""));
}

const ROUNDS = [["first", "First-round share"], ["last", "Final-round share"]];
// A final-round line is drawn only where at least this share of simulations reached that round, so its median means something.
const MIN_REACHED = 0.1;

// Each candidate's simulated first-round and final-round shares at every update: the median as a line, the middle range as a band
// around it. The final count's shares end each line, since every simulation of it ends the same way.
export function renderShareHistory(c, history) {
  const box = $("rcv-history-shares"), table = $("rcv-history-shares-table"), note = $("rcv-history-shares-note");
  box.replaceChildren();
  table.replaceChildren();
  note.replaceChildren();
  const series = history?.contests[c.id];
  $("rcv-history-shares-details").hidden = !series?.shares;
  if (!series?.shares) return;
  const { runs, interval } = history;
  const points = history.versions.map((v, i) => ({ ...v, date: new Date(v.time), shares: series.shares[i] })).filter((p) => p.shares);
  const finalPoint = points.find((p) => p.final);
  const simulated = points.filter((p) => !p.final);
  const last = points[points.length - 1];
  const reached = (p, l) => (p.shares.last[l]?.[3] ?? 0) >= runs * MIN_REACHED;
  const order = d3.sort(c.letters, (l) => -last.shares.first[l][1]);
  const shownIn = { first: order, last: order.filter((l) => points.some((p) => reached(p, l))) };
  const share = (x) => pct(x, 1);

  const width = Math.max(box.clientWidth, 280);
  const narrow = width < 500;
  const labelWidth = widestLabel(box, c, order.map((l) => ({ l, text: "50.02%" })), finalPoint);
  const margin = { top: 26, right: Math.min(Math.ceil(labelWidth) + 16, width / 2), bottom: 30, left: 44 };
  const height = narrow ? 220 : 260;
  const x = d3.scaleUtc(d3.extent(points, (p) => p.date), [margin.left, width - margin.right]);
  const middle = Math.round(interval * 100);

  for (const [round, title] of ROUNDS) {
    const shown = shownIn[round];
    const at = (p, l) => (round === "last" && !reached(p, l) ? null : p.shares[round][l]);
    const all = points.flatMap((p) => shown.map((l) => at(p, l))).filter(Boolean);
    // The final round always has 50% in view, the line a finalist has to cross.
    const extent = [d3.min(all, (v) => v[0]), d3.max(all, (v) => v[2])];
    const y = d3.scaleLinear(round === "last" ? d3.extent([...extent, 0.5]) : extent, [height - margin.bottom, margin.top]).nice(4);
    const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
      .attr("aria-label", `${title}: for each candidate, the median of ${fmt(runs)} simulations at each update the Division posted, with the middle ${middle}% shaded, ending at the final count. The table below has the same numbers.`);
    const yTicks = y.ticks(4);
    const grid = svg.append("g");
    grid.selectAll("line").data(yTicks).join("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y).attr("y2", y)
      .attr("stroke", (d) => (round === "last" && d === 0.5 ? "#a9b0b8" : "#e6e8eb"));
    grid.selectAll("text").data(yTicks).join("text").attr("x", margin.left - 6).attr("y", (d) => y(d) + 4).attr("text-anchor", "end").attr("class", "dim").text(d3.format(".0%"));
    svg.append("text").attr("x", 0).attr("y", 12).attr("class", "strong").text(title);
    dateAxis(svg, x, width, height, margin);
    if (finalPoint) finalMarker(svg, x, finalPoint, height, margin);

    const labels = [];
    for (const l of shown) {
      const values = simulated.map((p) => ({ p, v: at(p, l) }));
      const defined = (d) => d.v;
      const group = svg.append("g");
      group.append("path").attr("d", d3.area().defined(defined).x((d) => x(d.p.date)).y0((d) => y(d.v[0])).y1((d) => y(d.v[2]))(values))
        .attr("fill", c.color[l]).attr("fill-opacity", 0.18);
      group.append("path").attr("d", d3.line().defined(defined).x((d) => x(d.p.date)).y((d) => y(d.v[1]))(values)).attr("fill", "none").attr("stroke", c.color[l]).attr("stroke-width", 2);
      const end = finalPoint && at(finalPoint, l);
      const lastSimulated = values.findLast(defined);
      if (end && lastSimulated) {
        group.append("path").attr("d", d3.line()([[x(lastSimulated.p.date), y(lastSimulated.v[1])], [x(finalPoint.date), y(end[1])]]))
          .attr("fill", "none").attr("stroke", c.color[l]).attr("stroke-width", 2).attr("stroke-dasharray", "4 3");
      }
      const what = round === "first" ? "first-round share" : "final-round share";
      group.selectAll("circle").data(values.filter(defined)).join("circle").attr("cx", (d) => x(d.p.date)).attr("cy", (d) => y(d.v[1])).attr("r", narrow ? 3 : 3.5)
        .attr("fill", c.color[l]).attr("stroke", "var(--bg)").attr("stroke-width", 1.5)
        .call(withTip, (d) => [share(d.v[1]), `${c.byLetter[l].short}'s median ${what}; the middle ${middle}% of simulations ran ${share(d.v[0])} to ${share(d.v[2])}`,
          ...(round === "last" && d.v[3] < runs ? [`Reached the final round in ${fmt(d.v[3])} of ${fmt(runs)} simulations`] : []),
          `${alaskaTime(d.p.date)}: ${fmt(d.p.counted)} ballots counted`]);
      if (end) {
        group.append("circle").attr("cx", x(finalPoint.date)).attr("cy", y(end[1])).attr("r", narrow ? 3.5 : 4).attr("fill", c.color[l]).attr("stroke", "var(--bg)").attr("stroke-width", 1.5)
          .call(withTip, () => [share(end[1]), `${c.byLetter[l].short}'s ${what} in the final count`]);
        labels.push({ l, y: y(end[1]), text: share(end[1]) });
      } else if (lastSimulated) {
        labels.push({ l, y: y(lastSimulated.v[1]), text: share(lastSimulated.v[1]) });
      }
    }
    drawEndLabels(svg, c, labels, (finalPoint ? x(finalPoint.date) : width - margin.right) + 8);
  }

  const cell = (v) => (!v ? "–" : v[0] === v[2] ? share(v[1]) : `${share(v[1])} (${share(v[0])}–${share(v[2])})`);
  const columns = [...order.map((l) => ["first", l]), ...shownIn.last.map((l) => ["last", l])];
  table.replaceChildren(
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Results posted"), el("th", { scope: "col" }, "Ballots counted"),
      ...columns.map(([round, l]) => el("th", { scope: "col" }, `${c.byLetter[l].short}, ${round === "first" ? "first round" : "final round"}`)))),
    el("tbody", {}, ...[...points].reverse().map((p) => el("tr", {}, el("th", { scope: "row" }, `${alaskaTime(p.date)}${p.final ? " (final count)" : ""}`), el("td", {}, fmt(p.counted)),
      ...columns.map(([round, l]) => el("td", {}, cell(p.shares[round][l])))))),
  );
  note.append(`Each line is the median of the ${fmt(runs)} simulations at that update, and its shaded band holds the middle ${middle}% of them. A share is of the votes for candidates in that round, as this page's rounds give it. The final round is between the last two candidates, counted on past a first-round majority as this page's rounds are. A candidate's final-round line uses only the simulations they reached that round in, and is drawn only where that's at least ${fmt(runs * MIN_REACHED)} of them. Write-ins aren't drawn.`
    + (finalPoint ? " The dashed lines end at the final count." : ""));
}
