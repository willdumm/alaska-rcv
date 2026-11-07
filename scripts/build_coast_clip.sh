#!/usr/bin/env bash
# Makes the page's district shapes from the Alaska Redistricting Board's May 2023 proclamation: clips them to Alaska's
# coast and the Canadian border, then simplifies them together so neighbouring districts still meet. The city districts
# keep more detail, for the insets and the close-up State Senate maps. The outline is the Census Bureau's 1:500,000 state
# boundary file: https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_500k.zip
# The proclamation's shapefile has no attribute table. Its 40 records run in district order.
# Usage: build_coast_clip.sh 2023-May-Final-Proclamation.shp cb_2024_us_state_500k.shp OUT.geojson
set -euo pipefail
proclamation=$1 states=$2 output=$3
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mapshaper "$proclamation" -proj wgs84 -each 'hd=this.id+1' -o format=geojson "$work/districts-raw.geojson"
mapshaper "$states" -filter 'STUSPS=="AK"' -filter-fields -proj wgs84 -o format=geojson "$work/alaska-raw.geojson"
node "$here/wrap_outline.mjs" "$work/districts-raw.geojson" "$work/districts.geojson"
node "$here/wrap_outline.mjs" "$work/alaska-raw.geojson" "$work/alaska.geojson"
mapshaper "$work/districts.geojson" -clip "$work/alaska.geojson" \
  -simplify variable planar interval='this.area < 0.5 ? 0.0003 : 0.004' keep-shapes -clean \
  -o precision=0.0001 format=geojson "$output"
node -e 'const n = JSON.parse(require("fs").readFileSync(process.argv[1])).features.length; if (n !== 40) throw new Error(`expected 40 districts, got ${n}`);' "$output"
