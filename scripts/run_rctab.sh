#!/usr/bin/env bash
# Runs RCTab over each contest prepare_rctab.py wrote, skipping any that already has a report.
# Usage: run_rctab.sh RCTAB_DIR WORK_DIR
# RCTAB_DIR is the extracted rctab_v2.1.0_Linux_X64.zip, checked against the release's sha512. Its bundled JVM needs its
# interpreter patched on NixOS: patchelf --set-interpreter "$(cat "$NIX_CC/nix-support/dynamic-linker")" RCTAB_DIR/bin/java
# Its --cli mode still starts JavaFX, so it needs X libraries on LD_LIBRARY_PATH and a display. It only reads
# config.json and writes under each contest's directory. Run it under xvfb-run.
set -euo pipefail
rctab=$(cd "$1" && pwd)
work=$(cd "$2" && pwd)
for dir in "$work"/contest-*/; do
  summaries() { find "$1/output" -name "*_detailed_report.json" 2>/dev/null | grep -q .; }
  if summaries "$dir"; then continue; fi
  ( cd "$dir" && echo "compare_rctab" | "$rctab/bin/java" -Xmx6g -Djavafx.cachedir="$work/.fxcache" -Dprism.order=sw \
      -m network.brightspots.rcv/network.brightspots.rcv.Main --cli config.json > rctab.out 2>&1 ) \
    || { echo "RCTab failed in $dir; see rctab.out"; exit 1; }
  summaries "$dir" || { echo "RCTab wrote no report in $dir; see rctab.out"; exit 1; }
  echo "done $(basename "$dir")"
done
