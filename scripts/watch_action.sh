#!/usr/bin/env bash
# What .github/workflows/watch.yml runs: refresh.sh watch, with the last run's state kept in the newest watch-* release. Anything new
# becomes a prerelease and an issue, for a person to build, check and release. It doesn't touch the page or the repo's files.
# Everything from the Division is handled here as data, in files and quoted variables. Needs GH_TOKEN and GH_REPO, as gh does.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
store=$(mktemp -d)
trap 'rm -rf "$store"' EXIT

# The Division's server leaves out its intermediate: see scripts/README.md.
cacert=$store/cacert.pem
cat "${SYSTEM_CACERT:-/etc/ssl/certs/ca-certificates.crt}" "$here/division-tls-intermediate.pem" > "$cacert"

# No earlier release means no state, which watch treats as a change, so the first run saves once.
latest=$(gh release list --limit 200 --json tagName --jq '[.[].tagName | select(startswith("watch-"))][0] // ""')
[ -z "$latest" ] || gh release download "$latest" --pattern seen --dir "$store"

status=0
mkdir "$store/snapshots"
[ ! -f "$store/seen" ] || mv "$store/seen" "$store/snapshots/seen"
bash "$here/refresh.sh" watch "$store/snapshots" "$cacert" || status=$?
snapshot=$(find "$store/snapshots" -mindepth 1 -maxdepth 1 -type d ! -name '.partial.*' -printf '%f\n')
if [ -z "$snapshot" ]; then exit "$status"; fi

tag=watch-$snapshot
notes=$store/notes.md
{
  echo "The Division's files as posted, saved by the hourly watch. Not built or checked: refresh.sh build does that."
  echo
  echo '```'
  tr -d '`' < "$store/snapshots/seen"
  echo '```'
} > "$notes"
gh release create "$tag" "$store/snapshots/$snapshot"/* "$store/snapshots/seen" --prerelease --latest=false --title "$tag" --notes-file "$notes"

issue=$store/issue.md
{
  cat "$notes"
  echo
  echo "Saved as release [$tag](https://github.com/$GH_REPO/releases/tag/$tag). To publish it, follow \"Refreshing results\" in scripts/README.md from its files, then close this issue."
  [ "$status" = 0 ] || echo "The watch reported a problem with the saved files: read the run's log before using them."
} > "$issue"
gh issue create --title "New Division data: $tag" --body-file "$issue"
exit "$status"
