// The district views: the list of districts, the coverage table, and the map.
import { $, addPlates, el, fmt, pct, strong, withTip } from "./rcv-dom.js";
import { MIDDLE, MARGIN_BREAKS, ballotsLeft, ballotsLeftInContest, coverage, districtBallots, districtName, districts, isStatewide, lowCoverage, placesOf, roundTen, districtLines } from "./rcv-model.js";
import { senateSeatOf } from "./rcv-chambers.js";
import { actions, currentContest as current, state } from "./rcv-state.js";

const MIN_ROW_BALLOTS = 1;
const currentContest = () => current.value;
const selectDistrict = (hd) => actions.selectDistrict(hd);

// Four steps of a leader's colour, for margins on the map. Even the palest is plainly that colour.
export function marginArm(color) {
  const mix = d3.interpolateLab("#ffffff", color);
  return [mix(0.2), mix(0.4), mix(0.65), mix(1)];
}

// A district takes its leader's colour, whoever that is, shaded by the lead over the next candidate.
function districtColor(d, c) {
  if (!d?.total) return MIDDLE;
  return shade(((d.votes[d.leader] - d.votes[d.next]) / d.total) * 100, c.color[d.leader]);
}

export function shade(size, color) {
  const arm = marginArm(color);
  return size < MARGIN_BREAKS[0] ? arm[0] : size < MARGIN_BREAKS[1] ? arm[1] : size < MARGIN_BREAKS[2] ? arm[2] : arm[3];
}

// Hollow dots only mean something for the projected rounds: first choices are known whether or not a ballot was scanned.
const isHollow = (d, shares) => shares.mode === "final" && d.hd !== "all" && lowCoverage(d.hd);

export function renderMapMode(c) {
  const box = $("rcv-map-mode");
  box.hidden = c.letters.length < 3;
  if (box.hidden) state.mapMode = "first";
  $("districts").querySelector(".rcv-tag").textContent = state.mapMode === "first" ? "Division's results" : "Projected from the Division's results";
  if (box.hidden) return;
  const option = (value, text) => el("label", {}, el("input", { type: "radio", name: "rcv-map-mode", value, checked: state.mapMode === value,
    onchange: () => { state.mapMode = value; actions.render(); } }), ` ${text}`);
  box.replaceChildren(option("first", "First choices"), option("final", "After ranked choice tabulation, projected"));
}

// One line per group in a ranking chart, on a background that hides the axis lines and anything else drawn behind its text.
export function drawGroupHeadings(svg, groups, { y, rowHeight, colorOf, textOf }) {
  const heading = svg.append("g").selectAll("g").data(groups).join("g").attr("transform", (g) => `translate(0,${y(g)})`);
  const background = heading.append("rect").attr("class", "heading-bg").attr("y", 4).attr("height", rowHeight - 4);
  heading.append("circle").attr("cx", 9).attr("cy", rowHeight / 2 + 2).attr("r", 5).attr("fill", colorOf);
  const text = heading.append("text").attr("x", 20).attr("y", rowHeight / 2 + 6).attr("class", "strong").text(textOf);
  background.attr("width", (g, i) => 26 + text.nodes()[i].getComputedTextLength());
  return heading;
}

export function renderDots(c, shares) {
  const box = $("rcv-dots");
  box.replaceChildren();
  $("rcv-dots-note").hidden = !shares;
  $("rcv-dots-final-note").hidden = !shares || c.letters.length < 3;
  if (!shares) { box.append(el("p", { class: "muted" }, "This contest has one candidate, so there's no comparison to plot.")); return; }
  const rows = [...shares.shares.values()].filter((d) => d.hd !== 99 && d.total >= MIN_ROW_BALLOTS);
  const missing = [...new Set([...c.districts, ...Object.keys(coverage.districts).map(Number)])]
    .filter((hd) => isStatewide(c) && hd !== 99 && hd > 0 && !rows.some((d) => d.hd === hd));

  const width = Math.max(box.clientWidth, 280);
  const rowHeight = 23;
  const leftWidth = 58;
  const margin = { top: 44, left: 76, right: leftWidth + 14, bottom: 8 };
  // Statewide, then each leader's districts together, highest share first.
  const wholeName = isStatewide(c) ? "Statewide" : "All";
  const groups = c.order.map((leader) => ({ leader, members: rows.filter((d) => d.leader === leader).sort((p, q) => q.share - p.share) })).filter((g) => g.members.length);
  const allRows = [...(rows.length > 1 && shares.whole.share !== null ? [{ ...shares.whole, hd: "all" }] : []), ...groups.flatMap((g) => g.members)];
  const lines = [...allRows.filter((d) => d.hd === "all"), ...groups.flatMap((g) => [g, ...g.members])];
  const height = margin.top + (lines.length + missing.length) * rowHeight + margin.bottom;
  // Whole 5% steps around the shares, always with 50% in view, since it's the line a leader has to cross.
  const low = Math.min(0.5, Math.floor((d3.min(allRows, (d) => d.share) ?? 0.5) * 20) / 20);
  const high = Math.max(0.55, Math.ceil((d3.max(allRows, (d) => d.share) ?? 0.5) * 20) / 20);
  const x = d3.scaleLinear([low, high], [margin.left, width - margin.right]);
  const y = (i) => margin.top + i * rowHeight;
  const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
    .attr("aria-label", `Each district's leader and that candidate's share, grouped by leader. The table below the map has the same numbers.`);

  svg.append("text").attr("x", 4).attr("y", 13).attr("class", "strong").text(shares.mode === "final" ? "District leader's share after tabulation" : "District leader's share of first choices");
  const ticks = x.ticks(width < 500 ? 4 : 5);
  const axis = svg.append("g");
  axis.selectAll("line").data(ticks).join("line").attr("x1", x).attr("x2", x).attr("y1", margin.top - 8).attr("y2", height - margin.bottom)
    .attr("stroke", (d) => (d === 0.5 ? "#a9b0b8" : "#e6e8eb"));
  axis.selectAll("text").data(ticks).join("text").attr("x", x).attr("y", margin.top - 13).attr("text-anchor", "middle").attr("class", "dim")
    .text((d) => `${Math.round(d * 100)}%`);

  svg.append("text").attr("x", width - 4).attr("y", 13).attr("text-anchor", "end").attr("class", "dim").text("Ballots");
  svg.append("text").attr("x", width - 4).attr("y", margin.top - 13).attr("text-anchor", "end").attr("class", "dim").text("left");
  const leftOf = (d) => {
    if (d.hd !== "all") return ballotsLeft(c, d.hd);
    return ballotsLeftInContest(c);
  };
  // One scale for a district's bar and a leader's total. A district's bar fills its column unless a total would run off the chart.
  const leaderLeft = (g) => d3.sum(g.members, (d) => ballotsLeft(c, d.hd).total);
  const largestLeft = d3.max([...rows.map((d) => d.hd), ...missing], (hd) => ballotsLeft(c, hd).total) || 1;
  const leftPerBallot = Math.min(leftWidth / largestLeft, (width - margin.left) / (d3.max(groups, leaderLeft) || 1));
  const leftScale = (n) => n * leftPerBallot;
  const roundLeft = (n) => fmt(roundTen(n));

  const row = svg.append("g").selectAll("g").data(allRows).join("g")
    .attr("class", (d) => `row${d.hd === state.hd ? " selected" : ""}`)
    .attr("transform", (d) => `translate(0,${y(lines.indexOf(d))})`)
    .attr("aria-label", (d) => `${d.hd === "all" ? "All districts" : districtName(d.hd)}, ${c.byLetter[d.leader].short} leads with ${pct(d.share, 1)}, about ${roundLeft(leftOf(d).total)} ballots left`);
  row.append("rect").attr("class", "hit").attr("width", width).attr("height", rowHeight).attr("fill", "transparent").attr("rx", 3);
  row.append("text").attr("x", 4).attr("y", rowHeight / 2 + 4)
    .attr("class", (d) => (d.hd === "all" || d.hd === state.hd ? "strong" : ""))
    .text((d) => (d.hd === "all" ? wholeName : districtName(d.hd)));
  row.append("circle").attr("cx", (d) => x(d.share)).attr("cy", rowHeight / 2).attr("r", 5)
    .attr("fill", (d) => (isHollow(d, shares) ? "#fff" : c.color[d.leader]))
    .attr("stroke", (d) => (isHollow(d, shares) ? c.color[d.leader] : "#fff"))
    .attr("stroke-width", 2);
  row.filter((d) => d.hd !== "all").append("rect").attr("class", "left-bar").attr("x", (d) => width - leftScale(ballotsLeft(c, d.hd).total)).attr("y", 3).attr("height", rowHeight - 6).attr("rx", 2)
    .attr("width", (d) => leftScale(ballotsLeft(c, d.hd).total));
  row.append("text").attr("x", width - 4).attr("y", rowHeight / 2 + 4).attr("text-anchor", "end").attr("class", (d) => (d.hd === "all" ? "strong" : ""))
    .text((d) => roundLeft(leftOf(d).total));
  row.call(withTip, (d) => [`${pct(d.share, 1)} ${c.byLetter[d.leader].short}`,
    d.hd === "all" ? (isStatewide(c) ? "Statewide" : "All districts") : `${districtName(d.hd)}: ${placesOf(d.hd)}`,
    `${fmt(d.votes[d.leader])} ${c.byLetter[d.leader].short}, ${fmt(d.votes[d.next])} ${c.byLetter[d.next].short}`,
    `About ${roundLeft(leftOf(d).total)} ballots left: an estimated ${roundLeft(leftOf(d).uncounted)} early and absentee not yet counted, and an estimated ${roundLeft(leftOf(d).questioned)} questioned`,
    ...(isHollow(d, shares) ? [`Rankings known for ${pct(districtBallots(d.hd).cvr, districtBallots(d.hd).summary, 0)} of this district's counted ballots`] : [])],
    { over: (d) => highlightDistricts(d.hd === "all" ? [] : [d.hd]), out: () => highlightDistricts([]), act: (d) => selectDistrict(d.hd) });

  svg.append("g").selectAll("rect").data(groups).join("rect").attr("class", "left-bar")
    .attr("x", (g) => width - leftScale(leaderLeft(g))).attr("y", (g) => y(lines.indexOf(g)) + 5).attr("height", rowHeight - 6).attr("rx", 2)
    .attr("width", (g) => leftScale(leaderLeft(g)));
  const heading = drawGroupHeadings(svg, groups, { y: (g) => y(lines.indexOf(g)), rowHeight, colorOf: (g) => c.color[g.leader], textOf: (g) => `${c.byLetter[g.leader].short} leads` });
  heading.append("text").attr("x", width - 4).attr("y", rowHeight / 2 + 6).attr("text-anchor", "end").attr("class", "strong").text((g) => roundLeft(leaderLeft(g)));

  svg.append("g").selectAll("text").data(missing).join("text")
    .attr("x", 4).attr("y", (d, i) => y(lines.length + i) + rowHeight / 2 + 4).attr("class", "dim")
    .text((d) => `${districtName(d)}: no votes here yet`);
  svg.append("g").selectAll("text").data(missing).join("text")
    .attr("x", width - 4).attr("y", (d, i) => y(lines.length + i) + rowHeight / 2 + 4).attr("text-anchor", "end")
    .text((d) => roundLeft(ballotsLeft(c, d).total));
}

export function renderCoverage(c, shares) {
  const rows = Object.keys(coverage.districts).map(Number).filter((hd) => hd > 0).sort((p, q) => p - q);
  $("rcv-coverage-caption").textContent = `Preliminary. ${c.measure ? "Leader is yes or no, as a share of yes and no votes."
    : !shares ? "No leader: this contest has one candidate." : shares.mode === "final" ? "Leader is the finalist ahead, as a share of the two finalists after the projected ranked choice tabulation." : "Leader is the candidate with the most first choices, as a share of all first choices."} Counted is every ballot in the district, in the Division's results. Rankings are known only for scanned ones.`;
  $("rcv-coverage").replaceChildren(
    el("thead", {}, el("tr", {}, ...["District", "Counted", "Scanned", "Rankings known", ...(shares ? ["Leader"] : []), "Ballots left"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...rows.map((hd) => {
      const { summary, cvr } = districtBallots(hd);
      const row = shares?.shares.get(hd);
      const name = hd === 99 ? "Overseas" : districtName(hd);
      return el("tr", {},
        el("th", { scope: "row" }, hd === 99 ? name : el("button", { type: "button", class: "link", onclick: () => selectDistrict(hd), title: placesOf(hd) }, name)),
        el("td", {}, fmt(summary)), el("td", {}, fmt(cvr)), el("td", {}, pct(cvr, summary, 0)),
        ...(shares ? [el("td", {}, row?.share != null ? `${c.byLetter[row.leader].short} ${pct(row.share, 1)}` : "–")] : []),
        el("td", {}, fmt(roundTen(ballotsLeft(c, hd).total))));
    })),
  );
}

// Map

// Alaska Albers for the whole state. Each inset turns the same projection to its own meridian, so north
// stays up. Each one's bounds are [[west, south], [east, north]], the least it has to show: its box keeps its shape, so it may show more.
const INSETS = [
  { name: "Anchorage and Mat-Su", bounds: [[-150.3, 61.09], [-148.9, 61.67]] },
  { name: "Fairbanks", bounds: [[-148.1, 64.65], [-146.9, 65.0]] },
  { name: "Kenai", bounds: [[-152.03, 59.13], [-148.5, 61.09]] },
  { name: "Southeast", bounds: [[-141, 54.2], [-129.9, 60.4]] },
];
// The state map stops here, so it can be wider. Islands wholly west of it are left out.
const STATE_MAP_WEST = -171;
const albers = (meridian) => d3.geoConicEqualArea().parallels([55, 65]).rotate([-meridian, 0]);
const LABEL_FITS = { width: 18, height: 13 };
// A seat's letter is narrower than a district's number.
const SEAT_LABEL_FITS = { width: 9, height: 9 };
// The map's district and seat labels are off: hovering a district names it.
const SHOW_MAP_LABELS = false;
const OFF_BALLOT = "#f1f2f4";
const SMALL_OUTLINE = 25;
export const windAllRings = () => { for (const f of districts.features) windRings(f.geometry); };

// d3 reads a ring's direction as which side is inside, so a ring running the other way would cover the
// rest of the globe. The Division's shapes don't all run the same way.
function windRings(geometry) {
  const pieces = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  for (const piece of pieces) {
    if (d3.geoArea({ type: "Polygon", coordinates: piece }) > 2 * Math.PI) piece.forEach((ring) => ring.reverse());
  }
}

// A copy of a district without the islands wholly west of the state map's edge. The Division's longitudes run past -180 there.
function withoutFarWest(feature) {
  const { geometry } = feature;
  if (geometry.type !== "MultiPolygon") return feature;
  const kept = geometry.coordinates.filter((piece) => d3.max(piece[0], ([lon]) => lon) >= STATE_MAP_WEST);
  return { ...feature, geometry: { ...geometry, coordinates: kept } };
}

// Where a district's number goes: the middle of the widest span across its largest piece, along that
// piece's centroid latitude. Crossings pair up even-odd, so the point is inside the piece and not in a hole.
function labelPoint(geometry) {
  const pieces = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  const area = (piece) => Math.abs(d3.polygonArea(piece[0]));
  const largest = pieces.reduce((a, b) => (area(b) > area(a) ? b : a));
  const lat = d3.polygonCentroid(largest[0])[1];
  const crossings = [];
  for (const ring of largest) {
    for (const [[x0, y0], [x1, y1]] of d3.pairs(ring)) {
      if ((y0 <= lat) !== (y1 <= lat)) crossings.push(x0 + ((lat - y0) / (y1 - y0)) * (x1 - x0));
    }
  }
  crossings.sort(d3.ascending);
  let [left, right] = crossings;
  for (let i = 2; i < crossings.length; i += 2) {
    if (crossings[i + 1] - crossings[i] > right - left) [left, right] = [crossings[i], crossings[i + 1]];
  }
  return [(left + right) / 2, lat];
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// One panel of the map: every district's shape and, where it fits, its number. With `seatOf`, the label is instead one per
// seat, on the seat's biggest district in this panel that has room.
function drawPanel(parent, projection, width, height, { features = districts.features, seatOf = null } = {}) {
  const path = d3.geoPath(projection);
  const svg = d3.select(parent).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
  const layer = svg.append("g");
  const shapes = layer.selectAll("path").data(features).join("path")
    .attr("class", "district").attr("d", path)
    .call(withTip, ({ properties: { hd } }) => [lastShares?.titleOf?.(hd) ?? districtName(hd), placesOf(hd), mapTipText(hd)], {
      over: (f) => highlightDistricts([f.properties.hd]),
      out: () => highlightDistricts([]),
      act: (f) => { if (currentContest()?.districts.includes(f.properties.hd)) selectDistrict(f.properties.hd); },
    });
  const { borders, coast } = districtLines(features);
  layer.append("path").attr("class", "district-coast").attr("d", path(coast));
  layer.append("path").attr("class", "district-borders").attr("d", path(borders));
  const marks = layer.append("g");
  const fits = (f) => {
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const [x, y] = projection(labelPoint(f.geometry));
    const room = seatOf ? SEAT_LABEL_FITS : LABEL_FITS;
    return x1 - x0 >= room.width && y1 - y0 >= room.height && x > 8 && x < width - 8 && y > 8 && y < height - 8;
  };
  const fitting = !SHOW_MAP_LABELS ? [] : (seatOf
    ? d3.groups(features.filter(fits), (f) => seatOf(f.properties.hd)).map(([, members]) => d3.greatest(members, (f) => path.area(f)))
    : features.filter(fits)).sort((p, q) => path.area(q) - path.area(p));
  const labelLayer = svg.append("g");
  const labels = labelLayer.selectAll("g").data(fitting).join("g").attr("class", "district-label");
  labels.append("text").attr("text-anchor", "middle")
    .attr("x", (f) => projection(labelPoint(f.geometry))[0]).attr("y", (f) => projection(labelPoint(f.geometry))[1] + 4)
    .text((f) => (seatOf ? seatOf(f.properties.hd) : f.properties.hd));
  labels.call(addPlates, 2, 0);
  // Where a district's label would overlap another, the larger district keeps its label. Every seat keeps its letter.
  const placed = [];
  if (!seatOf) labels.filter(function () {
    const box = this.getBBox();
    if (placed.some((other) => overlaps(box, other))) return true;
    placed.push(box);
    return false;
  }).remove();
  return { svg, path, shapes, marks, labels: labelLayer.selectAll(".district-label"), labelLayer };
}

// The inset's whole rectangle, as the state map's outline of what it shows.
function insetOutline(projection, width, height) {
  const corners = [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
  return { type: "LineString", coordinates: corners.map((point) => projection.invert(point)) };
}

// A label would hide most of a small inset's outline, so it moves to just below one.
function clearSmallOutlines(labels, outlines) {
  const small = outlines.filter(([[x0, y0], [x1, y1]]) => x1 - x0 < SMALL_OUTLINE && y1 - y0 < SMALL_OUTLINE);
  labels.each(function () {
    const box = this.getBBox();
    const hit = small.find(([[x0, y0], [x1, y1]]) => overlaps(box, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }));
    if (hit) this.setAttribute("transform", `translate(0,${hit[1][1] + 3 - box.y})`);
  });
}

// Charts are sized to their boxes, so this draws again only when the box's width changes, or a contest
// needs a different view: a State Senate race shows just its house districts, close up.
let mapView = null, mapPanels = [];
export function drawMap() {
  const box = $("rcv-map");
  const width = Math.max(box.clientWidth, 280);
  const c = currentContest();
  const senate = c?.name.startsWith("Senate") ? c : null;
  // The whole Senate labels its seats rather than its house districts.
  const seatOf = c?.id === "senate" ? senateSeatOf : null;
  const view = `${width}:${senate?.id ?? (seatOf ? "seats" : "state")}`;
  if (view === mapView) return;
  mapView = view;
  box.replaceChildren();
  $("rcv-map-insets-note").hidden = Boolean(senate);

  if (senate) {
    const wanted = { type: "GeometryCollection", geometries: districts.features.filter((f) => senate.districts.includes(f.properties.hd)).map((f) => f.geometry) };
    const height = Math.round(width * 0.8);
    const close = albers(d3.geoCentroid(wanted)[0]).fitExtent([[8, 8], [width - 8, height - 8]], wanted);
    close.clipExtent([[0, 0], [width, height]]);
    const panel = el("div", { class: "rcv-map-state", role: "group", "aria-label": `${senate.name}'s house districts. The table of every district below has the same numbers.` });
    box.append(panel);
    mapPanels = [drawPanel(panel, close, width, height)];
    return;
  }

  const stateBox = el("div", { class: "rcv-map-state", role: "group", "aria-label": "Alaska's house districts. The table of every district below has the same numbers." });
  const insets = el("div", { class: "rcv-map-insets" });
  box.append(stateBox, insets);

  const views = INSETS.map(({ name, bounds: [[west, south], [east, north]] }) => {
    const figure = el("figure", {}, el("figcaption", {}, name));
    insets.append(figure);
    const insetWidth = figure.clientWidth, insetHeight = Math.round(insetWidth * 0.85);
    const projection = albers((west + east) / 2)
      .fitSize([insetWidth, insetHeight], { type: "MultiPoint", coordinates: [[west, south], [(west + east) / 2, south], [east, south], [east, north], [(west + east) / 2, north], [west, north]] });
    const outline = insetOutline(projection, insetWidth, insetHeight);
    projection.clipExtent([[0, 0], [insetWidth, insetHeight]]);
    return { figure, projection, insetWidth, insetHeight, outline };
  });

  // The state map fits the outlines too, since Southeast's reaches past the land.
  const features = districts.features.map(withoutFarWest);
  const everything = { type: "GeometryCollection", geometries: [...features.map((f) => f.geometry), ...views.map((v) => v.outline)] };
  const whole = albers(-154).fitWidth(width, everything);
  const height = Math.ceil(d3.geoPath(whole).bounds(everything)[1][1]);
  mapPanels = [drawPanel(stateBox, whole, width, height, { features, seatOf })];
  for (const { figure, projection, insetWidth, insetHeight, outline } of views) {
    mapPanels.push(drawPanel(figure, projection, insetWidth, insetHeight, { seatOf }));
    // Closed, so the line's two ends join at the corner they share rather than leaving a notch there.
    for (const line of ["inset-casing", "inset-outline"]) mapPanels[0].svg.append("path").attr("class", line).attr("d", `${d3.geoPath(whole)(outline)}Z`);
  }
  mapPanels[0].labelLayer.raise();
  clearSmallOutlines(mapPanels[0].labels, views.map((v) => d3.geoPath(whole).bounds(v.outline)));
}

export function highlightDistricts(hds) {
  drawMarks("hovered", hds);
}

// A selected or hovered district's outline is its own shape over the map's lines. Moving the district itself up would take it
// out from under the pointer, and then the browser wouldn't say when the pointer leaves it.
function drawMarks(kind, hds) {
  for (const { path, shapes, marks } of mapPanels) {
    marks.selectAll(`path.${kind}`).data(shapes.data().filter((f) => hds.includes(f.properties.hd)))
      .join("path").attr("class", `mark ${kind}`).attr("d", path);
  }
}

let lastShares = null;
export const setLastShares = (shares) => { lastShares = shares; };
function mapTipText(hd) {
  const c = currentContest();
  if (lastShares?.mode === "chamber") return lastShares.tipOf(hd);
  const d = lastShares?.shares.get(hd);
  if (!c || !c.districts.includes(hd)) return `Not on ${c?.name ?? "this contest"}'s ballot`;
  if (!d) return "No votes here yet";
  if (!d.total) return "No votes here yet";
  if (lastShares.mode === "first") return [d.leader, d.next].map((l) => `${c.byLetter[l].short} ${pct(d.votes[l], d.total)}`).join(", ");
  return `${pct(d.share, 1)} ${c.byLetter[d.leader].short} of the two finalists, projected`;
}


export function paintMap() {
  const c = currentContest();
  const onBallot = (hd) => c?.districts.includes(hd);
  for (const { shapes, labels } of mapPanels) {
    shapes.attr("fill", (f) => {
      const { hd } = f.properties;
      if (lastShares?.mode === "chamber") return lastShares.colorOf(hd);
      return onBallot(hd) ? districtColor(lastShares?.shares.get(hd), c) : OFF_BALLOT;
    })
      .classed("off-ballot", (f) => !onBallot(f.properties.hd))
      .attr("aria-label", (f) => `${districtName(f.properties.hd)}: ${mapTipText(f.properties.hd)}`);
    labels.classed("off-ballot", (f) => !onBallot(f.properties.hd));
  }
  drawMarks("selected", [state.hd]);
}

export function renderMapLegend(c, shares) {
  const node = $("rcv-map-legend");
  if (!shares) { node.replaceChildren(); return; }
  const swatch = (color) => el("i", { style: `background:${color}` });
  const bands = `under ${MARGIN_BREAKS[0]}, to ${MARGIN_BREAKS[1]}, to ${MARGIN_BREAKS[2]}, and over ${MARGIN_BREAKS[2]} points`;
  if (shares.mode === "first") {
    const leaders = c.order.filter((l) => [...shares.shares.values()].some((d) => d.total && d.leader === l));
    node.replaceChildren(...leaders.flatMap((l) => [el("span", { class: "ramp", "aria-hidden": "true" }, ...marginArm(c.color[l]).map(swatch)), `${c.byLetter[l].short} leads`]),
      el("span", {}, `Bands: a lead of ${bands}. Gray: no votes yet.`));
  } else {
    node.replaceChildren(
      `${c.byLetter[c.order[1]].short} ahead`,
      el("span", { class: "ramp", "aria-hidden": "true" }, ...marginArm(c.color[c.order[1]]).reverse().map(swatch), ...marginArm(c.color[c.order[0]]).map(swatch)),
      `${c.byLetter[c.order[0]].short} ahead`,
      el("span", {}, `Bands: ${bands} between the two finalists. Gray: no votes yet.`),
    );
  }
  const hd = state.hd;
  const selected = $("rcv-selected");
  if (hd === "all") { selected.replaceChildren(); return; }
  const { summary, cvr } = districtBallots(hd);
  selected.replaceChildren(strong(districtName(hd)), hd === 99 ? "" : ` (${placesOf(hd)})`, `: rankings known for ${fmt(cvr)} of ${fmt(summary)} counted ballots. `,
    el("button", { type: "button", class: "link", onclick: () => selectDistrict(hd) }, "Clear"));
}
