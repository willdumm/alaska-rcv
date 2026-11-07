// The rounds chart: ribbons of ballots between rounds, one row per candidate.
import { $, addPlates, fmt, pct, withTip } from "./rcv-dom.js";
import { INACTIVE_COLOR, majorityIn } from "./rcv-model.js";

function ribbonPath(x0, x1, y0a, y0b, y1a, y1b) {
  const mid = (x0 + x1) / 2;
  return `M${x0},${y0a}C${mid},${y0a} ${mid},${y1a} ${x1},${y1a}L${x1},${y1b}C${mid},${y1b} ${mid},${y0b} ${x0},${y0b}Z`;
}

// What happened in a round, in words: who was eliminated and where their ballots went, or how the count ended.
export function roundStory(c, { rounds }, i) {
  const round = rounds[i];
  const name = (l) => c.byLetter[l].short;
  if (round.eliminated) {
    const moved = round.transfers;
    const parts = c.order.filter((l) => moved[l] >= 0.5).map((l) => `${fmt(moved[l])} to ${name(l)}`);
    const stopped = (moved.exhausted || 0) + (moved.overvotes || 0);
    if (stopped >= 0.5) parts.push(`${fmt(stopped)} stopped counting`);
    return `${name(round.eliminated)} has the fewest votes (${fmt(round.votes[round.eliminated])}) and is eliminated: ${parts.join(", ") || "no ballots to move"}.`;
  }
  const out = new Set(rounds.map((r) => r.eliminated));
  const standing = c.order.filter((l) => !out.has(l)).sort((p, q) => round.votes[q] - round.votes[p]);
  const [a, b] = standing;
  const opening = rounds.length > 1 ? "Two candidates remain, so the count ends. " : c.measure ? "" : standing.length > 2 ? `${name(a)} has over half of the first choices, so the count ends. ` : "With two candidates, no one is eliminated. ";
  if (b === undefined) return `${opening}${name(a)} has all ${fmt(round.votes[a])} votes.`;
  if (Math.abs(round.votes[a] - round.votes[b]) < 0.5) return `${opening}${name(a)} and ${name(b)} are tied, at ${fmt(round.votes[a])} each.`;
  return `${opening}${name(a)} leads ${name(b)} by ${fmt(round.votes[a] - round.votes[b])} votes, ${pct(round.votes[a], round.active)} to ${pct(round.votes[b], round.active)}.`;
}

// Below the chart, each round's story hangs from its line. When one level's columns would be too narrow, the rounds alternate
// between two levels, each twice as wide, with the lines of the lower level running through the gaps in the upper one.
const STORY_WIDTH = 150, STORY_GAP = 12, STORY_LINE = 17;
function storyLayout(rounds, width, x, wrapped, storyOf) {
  const step = rounds.length > 1 ? x(1) - x(0) : width;
  const levels = step - STORY_GAP < STORY_WIDTH ? 2 : 1;
  const reach = (levels * step) / 2;
  const blocks = rounds.map((round, i) => {
    const left = Math.max(0, x(i) - reach + (i ? STORY_GAP / 2 : 0));
    const right = Math.min(width, x(i) + reach - (i < rounds.length - 1 ? STORY_GAP / 2 : 0));
    return { left, level: i % levels, lines: wrapped(storyOf(i), right - left) };
  });
  let top = 10;
  for (let level = 0; level < levels; level++) {
    const members = blocks.filter((b) => b.level === level);
    for (const b of members) b.top = top;
    top += (d3.max(members, (b) => b.lines.length) ?? 0) * STORY_LINE + 8;
  }
  return { blocks, height: top };
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
  const wrapped = (text, limit = width) => text.split(" ").reduce((lines, word) => {
    const last = lines[lines.length - 1];
    if (last && textWidth(`${last} ${word}`) <= limit) lines[lines.length - 1] = `${last} ${word}`;
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
        : fitted("Alaska's count runs on until two candidates remain, but the winner can't change", "Runs on to two; winner can't change") });
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
  const plotBottom = nextY;
  const stories = storyLayout(rounds, width, x, wrapped, (i) => roundStory(c, result, i));
  const height = plotBottom + stories.height;

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
    svg.append("rect").attr("class", "decided").attr("x", x(won.round)).attr("y", plotTop).attr("width", width - x(won.round)).attr("height", plotBottom - plotTop);
  }

  verdict.forEach((line, j) => {
    svg.append("text").attr("x", 0).attr("y", 14 + j * 18).append("tspan").attr("class", line.cls).text(line.text);
  });

  for (const row of rows) {
    const { i, round } = row;
    svg.append("line").attr("class", won?.round === i ? "round-line deciding" : "round-line")
      .attr("x1", x(i)).attr("x2", x(i)).attr("y1", plotTop - 4).attr("y2", plotBottom + stories.blocks[i].top - 4);
    const heading = svg.append("text").attr("x", x(i)).attr("text-anchor", "middle");
    heading.append("tspan").attr("x", x(i)).attr("y", plotTop - 24).attr("class", won && i > won.round ? "dim" : "strong").text(c.measure ? "The vote" : `Round ${i + 1}`);
    heading.append("tspan").attr("x", x(i)).attr("y", plotTop - 9).attr("class", "dim").text(roundDetail(round));
  }

  for (const { left, top, lines } of stories.blocks) {
    const story = svg.append("text").attr("text-anchor", rounds.length === 1 ? "middle" : null);
    lines.forEach((line, n) => story.append("tspan").attr("x", rounds.length === 1 ? width / 2 : left).attr("y", plotBottom + top + 13 + n * STORY_LINE).text(line));
  }

  for (const l of keys) {
    const name = svg.append("g").attr("class", "flow-name");
    name.append("text").attr("x", 3).attr("y", lanes.get(l).top + 13).append("tspan").attr("class", "strong").text(nameOf(l));
    name.call(addPlates, 3, 0);
  }

  for (const row of rows) {
    const { i, round } = row;
    const labels = svg.append("g").attr("class", "flow-labels").selectAll("g").data([...row.segments.values()]).join("g");
    const at = (d, dy) => lanes.get(d.l).mid + dy;
    labels.filter((d) => d.l !== "stopped").append("text").attr("class", "share").attr("x", x(i)).attr("y", (d) => at(d, -3)).attr("text-anchor", "middle")
      .text((d) => pct(d.votes, round.active));
    labels.append("text").attr("x", x(i)).attr("y", (d) => at(d, d.l === "stopped" ? 4 : 12)).attr("text-anchor", "middle").text((d) => fmt(d.votes));
    labels.filter((d) => statusOf(d.l, i)).append("text").attr("x", x(i)).attr("y", (d) => at(d, 27)).attr("text-anchor", "middle")
      .append("tspan").attr("class", (d) => (won?.round === i && won.letter === d.l ? "strong" : "")).text((d) => statusOf(d.l, i));
    labels.call(addPlates, 4, 1);
  }
}
