// How the simulations moved as the Division posted more of the count, from history.json (scripts/build_history.mjs). Shown with
// the final count, in place of the simulation, since there's nothing left to simulate. Each version's point is the share of
// simulations a candidate won on the data posted then. The final count's point is who won: every simulation of it ends the same way.
import { $, alaskaTime, el, fmt, withTip } from "./rcv-dom.js";

const dayOf = (date) => date.toLocaleString("en-US", { timeZone: "America/Anchorage", month: "short", day: "numeric" });
// Midnights in Alaska, every `step` days. The count ran after daylight saving time ended, so Alaska is 9 hours behind UTC throughout.
const ALASKA_OFFSET = 9 * 3600e3;
const alaskaMidnights = ([start, end], step) => d3.utcDay.every(step).range(new Date(+start - ALASKA_OFFSET), new Date(+end - ALASKA_OFFSET + 1))
  .map((d) => new Date(+d + ALASKA_OFFSET)).filter((d) => d >= start && d <= end);

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
  // An end label: the candidate's name, then how they finished. Drawn once off the chart first, with "Final count", to leave
  // room for the longest.
  const endLabel = (t) => t
    .call((s) => s.append("tspan").attr("class", "strong").attr("fill", (d) => c.color[d.l]).text((d) => c.byLetter[d.l].short))
    .call((s) => s.append("tspan").attr("class", "dim").text((d) => ` ${d.text}`));
  const probe = d3.select(box).append("svg");
  probe.selectAll("text").data(shown.map((l) => ({ l, text: finalPoint ? "lost" : fmt(runs) }))).join("text").call(endLabel);
  if (finalPoint) probe.append("text").attr("class", "dim").text("Final count");
  const labelWidth = d3.max(probe.selectAll("text").nodes(), (n) => n.getComputedTextLength()) || 0;
  probe.remove();
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
  // About 60 pixels per date label, so they don't run into each other.
  const days = (x.domain()[1] - x.domain()[0]) / 864e5;
  const step = [1, 2, 3, 4, 7].find((k) => days / k <= (width - margin.left - margin.right) / 60) ?? 7;
  const xTicks = alaskaMidnights(x.domain(), step);
  svg.append("g").selectAll("text").data(xTicks).join("text").attr("x", x).attr("y", height - margin.bottom + 18).attr("text-anchor", "middle").attr("class", "dim").text(dayOf);

  if (finalPoint) {
    svg.append("line").attr("x1", x(finalPoint.date)).attr("x2", x(finalPoint.date)).attr("y1", margin.top - 8).attr("y2", height - margin.bottom).attr("stroke", "#a9b0b8").attr("stroke-dasharray", "3 3");
    svg.append("text").attr("x", x(finalPoint.date) + 8).attr("y", margin.top - 12).attr("class", "dim").text("Final count");
  }

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
  // End labels, nudged apart so two finishing at the same height don't overlap.
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);
  const labelX = (finalPoint ? x(finalPoint.date) : width - margin.right) + 8;
  svg.append("g").selectAll("text").data(labels).join("text").attr("x", labelX).attr("y", (d) => d.y + 4).call(endLabel);

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
