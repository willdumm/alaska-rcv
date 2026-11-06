// The rounds chart: ribbons of ballots between rounds, one row per candidate.
import { $, el, fmt, pct, withTip } from "./rcv-dom.js";
import { INACTIVE_COLOR, majorityIn } from "./rcv-model.js";

function ribbonPath(x0, x1, y0a, y0b, y1a, y1b) {
  const mid = (x0 + x1) / 2;
  return `M${x0},${y0a}C${mid},${y0a} ${mid},${y1a} ${x1},${y1a}L${x1},${y1b}C${mid},${y1b} ${mid},${y0b} ${x0},${y0b}Z`;
}

export function renderFlow(c, result) {
  const box = $("rcv-flow");
  const { rounds } = result;
  box.replaceChildren();
  const drawn = rounds[0].active > 0 && c.letters.length > 1;
  $("rcv-flow-note").hidden = !drawn || rounds.length === 1;
  if (!drawn) return;

  const width = Math.max(box.clientWidth, 280);
  const phone = width < 560;
  const plotHeight = phone ? 240 : 300;
  const k = plotHeight / rounds[0].active;
  const nameHeight = 18;
  const stoppedAt = (r) => r.exhausted + r.overvotes - rounds[0].overvotes;
  const nameOf = (l) => (l === "stopped" ? "Stopped counting" : c.byLetter[l].short);
  const colorOf = (l) => (l === "stopped" ? INACTIVE_COLOR : c.color[l]);
  const votesIn = (l, r) => (l === "stopped" ? stoppedAt(r) : r.votes[l]);
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `600 13px ${getComputedStyle(box).fontFamily}`;
  const textWidth = (text) => measure.measureText(text).width;
  const fitted = (...options) => options.find((text) => textWidth(text) <= width) ?? options[options.length - 1];
  const wrapped = (text) => text.split(" ").reduce((lines, word) => {
    const last = lines[lines.length - 1];
    if (last && textWidth(`${last} ${word}`) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
    return lines;
  }, []);
  const roundDetail = (round) => (c.measure ? `${fmt(round.active)} votes` : phone ? fmt(round.active) : `${fmt(round.active)} in the count`);
  // Far enough in from each edge that a label centred on the first or last round still fits.
  const lead = Math.ceil(Math.max(phone ? 30 : 40, textWidth(roundDetail(rounds[0])) / 2, textWidth("eliminated") / 2)) + 3;
  const x = (i) => (rounds.length === 1 ? width / 2 : lead + (i * (width - 2 * lead)) / (rounds.length - 1));
  const won = majorityIn(rounds);
  const verdict = [];
  if (won) {
    const name = c.byLetter[won.letter].short;
    const where = rounds.length > 1 ? ` in round ${won.round + 1}` : "";
    for (const text of wrapped(`Counted so far${won.round ? ", projected" : ""}: ${name} has a majority${where}`)) verdict.push({ text, cls: "strong" });
    if (won.round < rounds.length - 1) {
      verdict.push({ cls: "dim", text: won.round === 0
        ? fitted("Alaska's count would have stopped at round 1", "The count would stop at round 1")
        : fitted("Alaska's count runs on until two remain, but the winner can't change", "Runs on to two; winner can't change") });
    }
  }
  const verdictHeight = verdict.length * 18 + (verdict.length ? 6 : 0);
  const plotTop = verdictHeight + 40;

  const eliminatedIn = new Set(rounds.map((r) => r.eliminated));
  const statusOf = (l, i) => (rounds[i].eliminated === l ? (phone ? "out" : "eliminated") : won?.round === i && won.letter === l ? "majority" : null);

  // Each candidate keeps a row all the way across: finalists on the outside and eliminated candidates
  // between them, so most ballots moving out of the middle don't cross anyone.
  const keys = [...c.order.slice(0, 1), ...c.order.slice(2), ...c.order.slice(1, 2)];
  if (d3.max(rounds, stoppedAt) > 0) keys.push("stopped");
  const lanes = new Map();
  let nextY = plotTop;
  for (const l of keys) {
    const hasStatus = eliminatedIn.has(l) || won?.letter === l;
    const body = Math.max(d3.max(rounds, (r) => votesIn(l, r)) * k, hasStatus ? 60 : 46);
    lanes.set(l, { top: nextY, mid: nextY + nameHeight + body / 2, index: lanes.size });
    nextY += nameHeight + body + 6;
  }
  const height = nextY;

  const rows = rounds.map((round, i) => {
    const out = new Set(rounds.slice(0, i).map((r) => r.eliminated));
    const segments = new Map();
    for (const l of keys) {
      const votes = votesIn(l, round);
      if (out.has(l) || (l === "stopped" && votes <= 0)) continue;
      const h = votes * k;
      segments.set(l, { l, votes, h, y: lanes.get(l).mid - h / 2 });
    }
    return { round, i, segments };
  });

  // Bands run in from the left edge and out to the right edge, so each round's labels sit on the ribbon.
  const ribbons = [];
  const flat = (row, x0, x1) => {
    for (const s of row.segments.values()) ribbons.push({ source: s.l, target: s.l, votes: s.votes, flat: row, d: ribbonPath(x0, x1, s.y, s.y + s.h, s.y, s.y + s.h) });
  };
  flat(rows[0], 0, x(0));
  rows.slice(0, -1).forEach((row, i) => {
    const next = rows[i + 1];
    const eliminated = row.round.eliminated;
    const flows = [];
    for (const s of row.segments.values()) {
      if (s.l !== eliminated && s.votes > 0) flows.push({ source: s.l, target: s.l, votes: s.votes, moved: false });
    }
    const moved = row.round.transfers;
    for (const l of keys) if (l !== "stopped" && moved[l] > 0) flows.push({ source: eliminated, target: l, votes: moved[l], moved: true });
    const stopped = (moved.exhausted || 0) + (moved.overvotes || 0);
    if (stopped > 0) flows.push({ source: eliminated, target: "stopped", votes: stopped, moved: true });

    // Slices sit in row order at both ends, so ribbons from one candidate never tangle.
    const index = (l) => lanes.get(l).index;
    const place = (primary, secondary, field) => {
      const used = new Map();
      for (const f of [...flows].sort((p, q) => index(p[primary]) - index(q[primary]) || index(p[secondary]) - index(q[secondary]))) {
        f[field] = used.get(f[primary]) || 0;
        used.set(f[primary], f[field] + f.votes * k);
      }
    };
    place("source", "target", "fromOffset");
    place("target", "source", "toOffset");
    for (const f of flows) {
      const a = row.segments.get(f.source).y + f.fromOffset, b = next.segments.get(f.target).y + f.toOffset;
      const h = f.votes * k;
      ribbons.push({ ...f, round: i + 1, d: ribbonPath(x(i), x(i + 1), a, a + h, b, b + h) });
    }
  });
  flat(rows[rows.length - 1], x(rows.length - 1), width);

  const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("class", phone ? "compact" : null)
    .attr("aria-label", "Ballots flowing between candidates, one row per candidate, rounds from left to right. The table below has the same numbers.");

  // A moved ribbon fades from its old candidate's colour to its new one, so the bands join without a seam.
  const defs = svg.append("defs");
  ribbons.filter((d) => d.moved).forEach((d, n) => {
    d.gradient = `rcv-flow-${n}`;
    const gradient = defs.append("linearGradient").attr("id", d.gradient).attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", x(d.round - 1)).attr("x2", x(d.round)).attr("y1", 0).attr("y2", 0);
    gradient.append("stop").attr("offset", 0).attr("stop-color", colorOf(d.source));
    gradient.append("stop").attr("offset", 1).attr("stop-color", colorOf(d.target));
  });
  const paint = (d) => (d.gradient ? `url(#${d.gradient})` : colorOf(d.source));
  svg.append("g").attr("class", "flows").selectAll("path").data(ribbons).join("path")
    .attr("class", "ribbon").attr("d", (d) => d.d).attr("fill", paint).attr("stroke", paint).attr("stroke-width", 0.75)
    .call(withTip, (d) => {
      if (d.flat) return [fmt(d.votes), `${nameOf(d.source)}, round ${d.flat.i + 1}${d.source === "stopped" ? "" : `: ${pct(d.votes, d.flat.round.active)} of ballots still in the count`}`];
      return [fmt(d.votes), d.moved
        ? `moved from ${nameOf(d.source)} to ${nameOf(d.target)}, round ${d.round} to ${d.round + 1}`
        : `stayed with ${nameOf(d.source)}, round ${d.round} to ${d.round + 1}`];
    });

  // Once a candidate has a majority, the rest of the count fades back.
  if (won && won.round < rounds.length - 1) {
    svg.append("rect").attr("class", "decided").attr("x", x(won.round)).attr("y", plotTop).attr("width", width - x(won.round)).attr("height", height - plotTop);
  }

  verdict.forEach((line, j) => {
    svg.append("text").attr("x", 0).attr("y", 14 + j * 18).append("tspan").attr("class", line.cls).text(line.text);
  });

  for (const row of rows) {
    const { i, round } = row;
    svg.append("line").attr("class", won?.round === i ? "round-line deciding" : "round-line")
      .attr("x1", x(i)).attr("x2", x(i)).attr("y1", plotTop - 4).attr("y2", height);
    const heading = svg.append("text").attr("x", x(i)).attr("text-anchor", "middle");
    heading.append("tspan").attr("x", x(i)).attr("y", plotTop - 24).attr("class", won && i > won.round ? "dim" : "strong").text(c.measure ? "The vote" : `Round ${i + 1}`);
    heading.append("tspan").attr("x", x(i)).attr("y", plotTop - 9).attr("class", "dim").text(roundDetail(round));
  }

  for (const l of keys) {
    svg.append("text").attr("class", "flow-name halo").attr("x", 0).attr("y", lanes.get(l).top + 13).append("tspan").attr("class", "strong").text(nameOf(l));
  }

  for (const row of rows) {
    const { i, round } = row;
    const labels = svg.append("g").attr("class", "flow-labels").selectAll("g").data([...row.segments.values()]).join("g");
    const at = (d, dy) => lanes.get(d.l).mid + dy;
    labels.filter((d) => d.l !== "stopped").append("text").attr("class", "share halo").attr("x", x(i)).attr("y", (d) => at(d, -3)).attr("text-anchor", "middle")
      .text((d) => pct(d.votes, round.active));
    labels.append("text").attr("class", "dim halo").attr("x", x(i)).attr("y", (d) => at(d, d.l === "stopped" ? 4 : 12)).attr("text-anchor", "middle").text((d) => fmt(d.votes));
    labels.filter((d) => statusOf(d.l, i)).append("text").attr("class", "halo").attr("x", x(i)).attr("y", (d) => at(d, 27)).attr("text-anchor", "middle")
      .append("tspan").attr("class", (d) => (won?.round === i && won.letter === d.l ? "strong" : "dim")).text((d) => statusOf(d.l, i));
  }
}
