#!/usr/bin/env bash
# The refresh steps in scripts/README.md, and the check to run before any deploy.
#   refresh.sh fetch RAW_DIR CACERT        Download the Division's three files, each with its response headers
#   refresh.sh build RAW_DIR DATA_DIR      Extract, rebuild coverage.json and projection.json, and check them
#   refresh.sh check DATA_DIR CACERT       The pre-deploy check. Exits with an error if anything is off
#   refresh.sh reproduce DATA_DIR          Does the simulation reproduce the committed file? Part of check, and in CI
#   refresh.sh archive RAW_DIR             Add the raw files' checksums to sources.sha256, and print the release command
# It doesn't publish anything. Between fetch and build, write RAW_DIR/received.json by hand from the "ballots
# received" table, and save the table: scripts/README.md has the format. CACERT has the TLS intermediate the Division's server leaves out.
# Needs node, python3 with ijson (or set PYTHON), pdftotext and unzip. RAW_DIR holds untrusted files, so keep it apart from
# anything you run: Python runs with -I, from this script's absolute path.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
python=${PYTHON:-python3}
base=https://www.elections.alaska.gov/enr/26GENR/results
files=(CVR_Export.zip ElectionSummaryReportRPT.pdf GA_ENR_Precinct_State_of_Alaska.csv)

iso() { date -u -d "$1" +%Y-%m-%dT%H:%M:%SZ; }
header() { tr -d '\r' < "$2" | awk -v name="$1:" 'tolower($1) == name { $1 = ""; print substr($0, 2) }' | tail -1; }
modified() { iso "$(header last-modified "$1/CVR_Export.zip.headers")"; }

fetch() {
  local raw=$1 cacert=$2
  mkdir -p "$raw"
  for file in "${files[@]}"; do
    curl -fsS --cacert "$cacert" -D "$raw/$file.headers" -o "$raw/$file" "$base/$file"
  done
  echo "CVR posted $(modified "$raw"). Write $raw/received.json by hand, then run build."
}

build() {
  local raw=$1 data=$2
  test -s "$raw/received.json" || { echo "No $raw/received.json: see scripts/README.md" >&2; exit 1; }
  test -s "$raw/ballots-received-table.html" || { echo "No $raw/ballots-received-table.html: see scripts/README.md" >&2; exit 1; }
  raw=$(cd "$raw" && pwd)
  data=$(cd "$data" && pwd)
  rm -rf "$raw/cvr"
  mkdir "$raw/cvr"
  unzip -q "$raw/CVR_Export.zip" -d "$raw/cvr"
  pdftotext -layout "$raw/ElectionSummaryReportRPT.pdf" "$raw/summary.txt"
  ( cd "$raw" && "$python" -I "$here/extract_cvr.py" "$raw/cvr" "$data" )
  ( cd "$raw" && "$python" -I "$here/build_coverage.py" "$raw/summary.txt" "$raw/GA_ENR_Precinct_State_of_Alaska.csv" "$data/ballots.json" \
      "$raw/received.json" "$raw/ballots-received-table.html" "$(modified "$raw")" "$(iso "$(header date "$raw/CVR_Export.zip.headers")")" "$data/coverage.json" )
  node "$here/simulate_projection.mjs" "$data" "$data/projection.json" --runs 100 --seed 20261104 --tau 0.2 --tau-local 0.28 --tau-party 0.2 --min-pool 300 --min-bucket 30
  local throwaway
  throwaway=$(mktemp)
  node "$here/simulate_projection.mjs" "$data" "$throwaway" --runs 1 --seed 20261104 --tau 0.2 --tau-local 0.28 --tau-party 0.2 --min-pool 300 --min-bucket 30 --hand-only
  rm -f "$throwaway"
  node "$here/check_counts.mjs" "$data"
  cat <<NEXT

Rebuilt from the CVR posted $(modified "$raw"). By hand, from here (scripts/README.md has each):
- Reread the page's caveats in site/content/_index.md.
- From November 18, compare the Division's round-by-round reports.
- Run: refresh.sh archive $raw, then refresh.sh check $data CACERT.
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
  local data=$1 cacert=$2 problems=0 live built simulated
  node --test "$root"/tests/*.test.mjs > /dev/null || { echo "PROBLEM: tests fail: run npm test"; problems=1; }
  node "$here/check_counts.mjs" "$data" || problems=1
  reproduce "$data" || problems=1
  live=$(iso "$(curl -fsSI --cacert "$cacert" "$base/CVR_Export.zip" | tr -d '\r' | awk 'tolower($1) == "last-modified:" { $1 = ""; print substr($0, 2) }')")
  read -r built simulated < <(node -p "const read = (f) => JSON.parse(require('fs').readFileSync(process.argv[1] + '/' + f)).cvrLastModified; read('coverage.json') + ' ' + read('projection.json')" "$data")
  [ "$live" = "$built" ] || { echo "PROBLEM: the Division's CVR was posted $live, and coverage.json has $built: refresh first"; problems=1; }
  [ "$simulated" = "$built" ] || { echo "PROBLEM: projection.json used the CVR posted $simulated, and coverage.json has $built"; problems=1; }
  [ "$problems" = 0 ] && echo "Ready to deploy: tests, vote totals and simulation are good, and the CVR posted $built is the Division's latest."
  return "$problems"
}

archive() {
  local raw=$1 release names
  release=cvr-$(modified "$raw" | tr -d :)
  names=$(find "$raw" -maxdepth 1 -type f ! -name summary.txt -printf '%f\n' | sort)
  (cd "$raw" && sha256sum $names) | sed "s|  |  $release/|" >> "$root/sources.sha256"
  cat <<NEXT
Added $release to sources.sha256. Add a row to SOURCES.md and commit. Then create the release from $raw:
gh release create $release $(echo $names) --notes-file NOTES -R willdumm/alaska-rcv --target COMMIT
NEXT
}

command=${1:-}
[ $# -gt 0 ] && shift
case "$command" in
  fetch) [ $# = 2 ] && fetch "$@" ;;
  build) [ $# = 2 ] && build "$@" ;;
  check) [ $# = 2 ] && check "$@" ;;
  reproduce) [ $# = 1 ] && reproduce "$@" ;;
  archive) [ $# = 1 ] && archive "$@" ;;
  *) sed -n 2,6p "$0"; exit 2 ;;
esac
