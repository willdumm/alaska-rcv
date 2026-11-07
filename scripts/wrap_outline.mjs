// Moves the western Aleutians in a GeoJSON file past -180, for both the districts and the state outline,
// so they're on the same side of the antimeridian and nothing crosses the map.
// Usage: node wrap_outline.mjs IN.geojson OUT.geojson
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
const wrap = (value) => (typeof value[0] === "number" ? [value[0] > 0 ? value[0] - 360 : value[0], value[1]] : value.map(wrap));
const collection = JSON.parse(readFileSync(input, "utf8"));
for (const { geometry } of collection.features ?? [{ geometry: collection.geometries[0] }]) geometry.coordinates = wrap(geometry.coordinates);
writeFileSync(output, JSON.stringify(collection));
