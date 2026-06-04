#!/usr/bin/env bash
# Converts public/og-image.svg → public/og-image.png (1200×630)
# Requires: rsvg-convert (librsvg)

set -euo pipefail

SVG="public/og-image.svg"
OUT="public/og-image.png"

if [[ ! -f "$SVG" ]]; then
  echo "Error: $SVG not found" >&2
  exit 1
fi

rsvg-convert -w 1200 -h 630 "$SVG" -o "$OUT"
echo "Generated $OUT"
