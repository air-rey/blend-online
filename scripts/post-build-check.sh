#!/usr/bin/env bash
# Fails the build if anything from /private-content or /private-downloads
# leaked into the public publish directory. The deal room spec: proprietary
# text, media and assets must never be reachable from the public build.
set -euo pipefail

PUB="public"
FORBIDDEN=(
  "brief.md"
  "agreement.txt"
  "nda.txt"
  "legacy-marketing.html"
  "switchgear-panel-failing.png"
  "switchgear-panel-failing-vrhands.png"
  "highlight-pulse-ref.mp4"
  "hum-electric.mp3"
  "crackle.mp3"
  "EnterApp.mp3"
  "unlocking-metal-door.mp3"
  "mantleplace-sample"
)

echo "post-build-check: scanning $PUB for private artifacts"
FAIL=0
for name in "${FORBIDDEN[@]}"; do
  hits=$(find "$PUB" -name "*${name}*" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "LEAK: $hits"
    FAIL=1
  fi
done

# Also fail if private-content or private-downloads folders somehow nested.
for dir in private-content private-downloads; do
  if [ -d "$PUB/$dir" ]; then
    echo "LEAK: $PUB/$dir exists"
    FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "post-build-check: FAILED. Private files reachable in the public build."
  exit 1
fi
echo "post-build-check: OK."
