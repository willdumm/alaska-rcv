#!/usr/bin/env bash
# Clips the district shapes to Alaska's coast and the Canadian border, then simplifies them together so
# neighbouring districts still meet. The outline is the Census Bureau's 1:500,000 state boundary file:
# https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_500k.zip
# Usage: build_coast_clip.sh DISTRICTS.geojson cb_2024_us_state_500k.shp OUT.geojson
set -euo pipefail
districts=$1 states=$2 output=$3
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mapshaper "$states" -filter 'STUSPS=="AK"' -filter-fields -proj wgs84 -o format=geojson "$work/alaska-raw.geojson"
node "$here/wrap_outline.mjs" "$work/alaska-raw.geojson" "$work/alaska.geojson"
mapshaper "$districts" -clip "$work/alaska.geojson" -simplify planar interval=0.004 keep-shapes -clean \
  -o precision=0.001 format=geojson "$output"
