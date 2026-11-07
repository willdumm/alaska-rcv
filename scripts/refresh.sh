#!/usr/bin/env bash
# The refresh steps in scripts/README.md, and the check to run before any deploy.
#   refresh.sh watch STORE CACERT          Save a new snapshot in STORE if the Division changed a file or its received table
#   refresh.sh fetch RAW_DIR CACERT        Download the Division's three files and received table, each with its response headers
#   refresh.sh build RAW_DIR DATA_DIR      Extract, rebuild coverage.json and projection.json, and check them
#   refresh.sh keep BUILT_DIR DATA_DIR     Keep a build as one of the page's versions, and rewrite versions.json
#   refresh.sh versions DATA_DIR           Check the vote totals and simulation of every version. In CI
#   refresh.sh check DATA_DIR CACERT       The pre-deploy check. Exits with an error if anything is off
#   refresh.sh reproduce DATA_DIR          Does the simulation reproduce the committed file? Part of check, and in CI
#   refresh.sh archive RAW_DIR BUILT_DIR   Add the raw files' checksums to sources.sha256, and print the release command
# It doesn't publish anything. CACERT has the TLS intermediate the Division's server leaves out.
# Needs node, python3 with ijson (or set PYTHON), pdftotext and unzip. RAW_DIR holds untrusted files, so keep it apart from
# anything you run: Python runs with -I, from this script's absolute path.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
python=${PYTHON:-python3}
base=https://www.elections.alaska.gov/enr/26GENR/results
received_page=https://www.elections.alaska.gov/election-results/e/
files=(CVR_Export.zip ElectionSummaryReportRPT.pdf GA_ENR_Precinct_State_of_Alaska.csv)

# date reads an empty string as today at midnight, so a missing header has to stop here.
iso() { [ -n "$1" ] || { echo "PROBLEM: a time is missing from the Division's response headers" >&2; return 1; }; date -u -d "$1" +%Y-%m-%dT%H:%M:%SZ; }
header() { tr -d '\r' < "$2" | awk -v name="$1:" 'tolower($1) == name { $1 = ""; print substr($0, 2) }' | tail -1; }
modified() { iso "$(header last-modified "$1/CVR_Export.zip.headers")"; }
# A failed request fails this, so it can't look like a file that changed.
live_modified() { curl -fsSI --max-time 60 --cacert "$1" "$2" | header last-modified /dev/stdin; }

# Every number here decides the result. reproduce reads them back from the committed file instead.
sim_settings=(--seed 20261104 --tau 0.2 --tau-local 0.28 --tau-party 0.2 --min-pool 300 --min-bucket 30)
# A field of a JSON file. Fields are read as data: nothing from the file is ever run.
json_field() { node -p "process.argv[2].split('.').reduce((o, k) => o[k], JSON.parse(require('fs').readFileSync(process.argv[1])))" "$1" "$2"; }

fetch() {
  local raw=$1 cacert=$2
  mkdir -p "$raw"
  for file in "${files[@]}"; do
    curl -fsS --max-time 600 --cacert "$cacert" -D "$raw/$file.headers" -o "$raw/$file" "$base/$file"
  done
  curl -fsS --max-time 60 --cacert "$cacert" -D "$raw/ballots-received-table.html.headers" -o "$raw/ballots-received-table.html" "$received_page"
  echo "CVR posted $(modified "$raw"), table updated $(table_stamp "$raw/ballots-received-table.html"). Now run build."
}

# The page's HTML changes on every fetch (nonces, cache stats), so its "Table last updated" text says whether the table did.
table_stamp() { sed -n 's/.*Table last updated \([^<]*\)\..*/\1/p' "$1" | head -1; }

# What's posted now, one line per file. A page with no table text still gets saved, once, for a person to look at.
posted() {
  local cacert=$1 table=$2 file stamp
  for file in "${files[@]}"; do
    stamp=$(live_modified "$cacert" "$base/$file") || return 1
    echo "$file $stamp"
  done
  echo "table $(table_stamp "$table")"
}

# Run about hourly: the Division overwrites these at the same URLs, so a missed update is gone. Each snapshot is complete, so
# it can be built on its own. A snapshot taken while files are being posted is followed by a complete one on the next run.
watch() {
  local store=$1 cacert=$2 now saved stamp file
  mkdir -p "$store"
  work=$(mktemp -d "$store/.partial.XXXXXX")
  trap 'rm -rf "$work"' EXIT
  curl -fsS --max-time 60 --cacert "$cacert" -D "$work/ballots-received-table.html.headers" -o "$work/ballots-received-table.html" "$received_page"
  now=$(posted "$cacert" "$work/ballots-received-table.html")
  if [ "$now" = "$(cat "$store/seen" 2>/dev/null)" ]; then
    echo "No change: $(echo "$now" | tr '\n' ';')"
    return
  fi
  fetch "$work" "$cacert" > /dev/null
  # Recorded from what was downloaded, so a file posted during the download shows up as a change next time.
  saved=$(for file in "${files[@]}"; do echo "$file $(header last-modified "$work/$file.headers")"; done; echo "table $(table_stamp "$work/ballots-received-table.html")")
  stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
  mv "$work" "$store/$stamp"
  echo "$saved" > "$store/seen.new"
  mv "$store/seen.new" "$store/seen"
  echo "New snapshot $store/$stamp: $(echo "$saved" | tr '\n' ';')"
  [ -n "$(table_stamp "$store/$stamp/ballots-received-table.html")" ] || { echo "PROBLEM: no \"Table last updated\" text in the saved page"; return 1; }
}

build() {
  local raw=$1 data=$2 posted_at fetched_at
  [ -s "$raw/received.json" ] || node "$here/received_from_table.mjs" "$raw/ballots-received-table.html" > "$raw/received.json"
  test -s "$raw/ballots-received-table.html" || grep -q '"questionedNote"' "$raw/received.json" || { echo "No $raw/ballots-received-table.html: see scripts/README.md" >&2; exit 1; }
  raw=$(cd "$raw" && pwd)
  data=$(cd "$data" && pwd)
  posted_at=$(modified "$raw")
  fetched_at=$(iso "$(header date "$raw/CVR_Export.zip.headers")")
  rm -rf "$raw/cvr"
  mkdir "$raw/cvr"
  unzip -q "$raw/CVR_Export.zip" -d "$raw/cvr"
  pdftotext -layout "$raw/ElectionSummaryReportRPT.pdf" "$raw/summary.txt"
  "$python" -I "$here/extract_cvr.py" "$raw/cvr" "$data"
  # About 1 GB, and the zip it came from is kept.
  rm -rf "$raw/cvr"
  "$python" -I "$here/build_coverage.py" "$raw/summary.txt" "$raw/GA_ENR_Precinct_State_of_Alaska.csv" "$data/ballots.json" \
    "$raw/received.json" "$raw/ballots-received-table.html" "$posted_at" "$fetched_at" "$data/coverage.json"
  node "$here/simulate_projection.mjs" "$data" "$data/projection.json" --runs 1000 "${sim_settings[@]}"
  local throwaway
  throwaway=$(mktemp)
  node "$here/simulate_projection.mjs" "$data" "$throwaway" --runs 1 "${sim_settings[@]}" --hand-only
  rm -f "$throwaway"
  node "$here/check_counts.mjs" "$data"
  cat <<NEXT

Rebuilt from the CVR posted $posted_at. By hand, from here (scripts/README.md has each):
- Reread the page's caveats in site/content/_index.md.
- From November 18, compare the Division's round-by-round reports.
- Run: refresh.sh keep $data $data, refresh.sh archive $raw $data, then refresh.sh check $data CACERT.
NEXT
}

# With the parameters the committed file records, so this can't drift from how it was made.
reproduce() {
  local data=$1 flags fresh
  flags=$(node -p "const p = JSON.parse(require('fs').readFileSync(process.argv[1])).parameters; \`--runs \${p.runs} --seed \${p.seed} --tau \${p.tau} --tau-local \${p.tauLocal} --tau-party \${p.tauParty} --min-pool \${p.minPool} --min-bucket \${p.minBucket}\`" "$data/projection.json")
  fresh=$(mktemp)
  # shellcheck disable=SC2086
  node "$here/simulate_projection.mjs" "$data" "$fresh" $flags
  cmp "$fresh" "$data/projection.json" || { rm -f "$fresh"; echo "PROBLEM: projection.json isn't what the simulation makes"; return 1; }
  rm -f "$fresh"
  echo "projection.json reproduces."
}

check() {
  local data=$1 cacert=$2 problems=0 live built simulated table asof page
  page=$(mktemp)
  node --test "$root"/tests/*.test.mjs > /dev/null || { echo "PROBLEM: tests fail: run npm test"; problems=1; }
  node "$here/check_counts.mjs" "$data" || problems=1
  reproduce "$data" || problems=1
  versions "$data" || problems=1
  live=$(iso "$(live_modified "$cacert" "$base/CVR_Export.zip")")
  built=$(json_field "$data/coverage.json" cvrLastModified)
  simulated=$(json_field "$data/projection.json" cvrLastModified)
  curl -fsS --max-time 60 --cacert "$cacert" -o "$page" "$received_page"
  table=$(node "$here/received_from_table.mjs" "$page" | node -p "JSON.parse(require('fs').readFileSync(0)).asOf")
  rm -f "$page"
  asof=$(json_field "$data/coverage.json" received.asOf)
  [ "$table" = "$asof" ] || { echo "PROBLEM: the Division's received table is from $table, and coverage.json has $asof: refresh first"; problems=1; }
  [ "$live" = "$built" ] || { echo "PROBLEM: the Division's CVR was posted $live, and coverage.json has $built: refresh first"; problems=1; }
  [ "$simulated" = "$built" ] || { echo "PROBLEM: projection.json used the CVR posted $simulated, and coverage.json has $built"; problems=1; }
  [ "$problems" = 0 ] && echo "Ready to deploy: tests, vote totals and simulation are good, and the CVR posted $built and table from $asof are the Division's latest."
  return "$problems"
}

# The newest version also sits in DATA_DIR, as the page's default, so versions/ repeats it and it isn't simulated twice.
versions() {
  local data=$1 dir newest problems=0
  newest=$(json_field "$data/versions.json" versions.0.id)
  for dir in "$data"/versions/*/; do
    [ "$(basename "$dir")" = "$newest" ] && continue
    echo "Version $(basename "$dir"):"
    node "$here/check_counts.mjs" "$dir" || problems=1
    reproduce "$dir" || problems=1
  done
  return "$problems"
}

archive() {
  local raw=$1 built=$2 release names
  release=snapshot-$(node "$here/build_versions.mjs" --id "$built")
  names=$(find "$raw" -maxdepth 1 -type f ! -name summary.txt -printf '%f\n' | sort)
  (cd "$raw" && sha256sum $names) | sed "s|  |  $release/|" >> "$root/sources.sha256"
  cat <<NEXT
Added $release to sources.sha256. Add a row to SOURCES.md and commit. Then create the release from $raw:
gh release create $release $(echo $names) --notes-file NOTES -R willdumm/alaska-rcv --target COMMIT
NEXT
}

usage() { sed -n 2,10p "$0"; exit 2; }
command=${1:-}
[ $# -gt 0 ] && shift
needs() { [ "$1" = "$2" ] || usage; }
case "$command" in
  watch) needs $# 2; watch "$@" ;;
  fetch) needs $# 2; fetch "$@" ;;
  build) needs $# 2; build "$@" ;;
  keep) needs $# 2; node "$here/build_versions.mjs" "$@" ;;
  versions) needs $# 1; versions "$@" ;;
  check) needs $# 2; check "$@" ;;
  reproduce) needs $# 1; reproduce "$@" ;;
  archive) needs $# 2; archive "$@" ;;
  *) usage ;;
esac
