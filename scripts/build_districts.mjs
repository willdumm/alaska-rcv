// Turns the house district shapes behind the Division's results map (shapes/districts.js) into GeoJSON
// for this page's map. Each path there is a string of longitude and latitude deltas. The western
// Aleutians move past -180 so HD 37 doesn't cross the map.
// Usage: node build_districts.mjs districts.js OUT.geojson
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);

function decodePath(path) {
  const deltas = path.trim().split(/\s+/).map(Number);
  const points = [];
  let lng = 0, lat = 0;
  for (let i = 0; i < deltas.length; i += 2) {
    lng += deltas[i];
    lat += deltas[i + 1];
    const point = [Number((lng > 0 ? lng - 360 : lng).toFixed(2)), Number(lat.toFixed(2))];
    const last = points[points.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push(point);
  }
  const [first] = points, last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
  return points;
}

const features = JSON.parse(readFileSync(input, "utf8")).map((region) => ({
  type: "Feature",
  properties: { hd: Number(region.number) },
  geometry: { type: "MultiPolygon", coordinates: region.coords.map((polygon) => polygon.map(decodePath)) },
}));
if (features.length !== 40) throw new Error(`expected 40 districts, got ${features.length}`);
writeFileSync(output, JSON.stringify({ type: "FeatureCollection", features }));
