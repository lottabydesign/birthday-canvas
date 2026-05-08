#!/usr/bin/env bash
# Regenerate the Open Graph thumbnail by snapshotting the live dev server.
# Run with `npm run dev` already running on :3000.
#
# Usage:
#   bash scripts/regen-og.sh
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="${OG_URL:-http://localhost:3000/}"
OUT="${OG_OUT:-app/opengraph-image.png}"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at expected path: $CHROME" >&2
  exit 1
fi

echo "Snapshotting $URL → $OUT"
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --window-size=1200,630 \
  --screenshot="$OUT" \
  --virtual-time-budget=4000 \
  "$URL" 2>&1 | grep -E "(written|error|ERROR)" || true

ls -la "$OUT"
file "$OUT"
