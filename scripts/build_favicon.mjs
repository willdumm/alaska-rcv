// Draws the page's favicon: Alaska as one dark blue shape, in the map's Albers projection. Only the mainland, the Panhandle
// and the largest islands survive, since it has to read at 16 pixels. Dark browser themes get a white edge around the blue.
// Needs mapshaper on the path, as build_coast_clip.sh does.
// Usage: node build_favicon.mjs DISTRICTS.geojson OUT.svg
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
const SIZE = 32, MARGIN = 1;
const ALBERS = "+proj=aea +lat_1=55 +lat_2=65 +lat_0=0 +lon_0=-154 +datum=WGS84 +no_defs";

const collection = JSON.parse(execFileSync("mapshaper", [input, "-proj", ALBERS, "init=wgs84", "-dissolve2", "gap-fill-area=2000km2",
  "-filter-islands", "min-area=1500km2", "-simplify", "dp", "interval=50km", "keep-shapes", "-clean", "-o", "-", "format=geojson", "precision=1"],
  { maxBuffer: 1 << 24 }));
const polygons = collection.geometries[0].coordinates;

const points = polygons.flat(2);
const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
const [left, right, bottom, top] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const scale = (SIZE - 2 * MARGIN) / Math.max(right - left, top - bottom);
const offsetX = (SIZE - (right - left) * scale) / 2, offsetY = (SIZE - (top - bottom) * scale) / 2;
const place = ([x, y]) => `${(offsetX + (x - left) * scale).toFixed(1)} ${(offsetY + (top - y) * scale).toFixed(1)}`;
const path = polygons.flat().map((ring) => `M${ring.slice(0, -1).map(place).join("L")}Z`).join("");

writeFileSync(output, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><style>path{fill:#12305e}@media (prefers-color-scheme:dark){path{stroke:#fff;stroke-width:1.6;stroke-linejoin:round;paint-order:stroke}}</style><path d="${path}"/></svg>\n`);
