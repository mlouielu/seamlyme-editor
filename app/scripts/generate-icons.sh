#!/usr/bin/env bash
# Usage: ./scripts/generate-icons.sh [path/to/icon.svg]
# Generates all favicon/icon sizes from a source SVG into public/icons/
# Requires: rsvg-convert (librsvg), ImageMagick (for .ico)

set -euo pipefail

SRC="${1:-public/icons/icon_512.svg}"
OUT="public/icons"

if [[ ! -f "$SRC" ]]; then
  echo "Error: source file not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"

echo "Source: $SRC"
echo "Output: $OUT/"
echo ""

# ── PNG exports ───────────────────────────────────────────────────────────────

png() {
  local size=$1
  local name=$2
  rsvg-convert -w "$size" -h "$size" "$SRC" -o "$OUT/$name"
  echo "  $OUT/$name  (${size}×${size})"
}

echo "Generating PNGs..."
png 16   favicon-16.png
png 32   favicon-32.png
png 48   favicon-48.png
png 180  apple-touch-icon.png
png 192  icon-192.png
png 512  icon-512.png

# ── Copy SVG as-is ────────────────────────────────────────────────────────────

if [[ "$(realpath "$SRC")" != "$(realpath "$OUT/icon.svg")" ]]; then
  cp "$SRC" "$OUT/icon.svg"
  echo "  $OUT/icon.svg  (source copy)"
fi

# ── .ico (multi-size, for legacy browsers) ────────────────────────────────────

echo ""
echo "Generating favicon.ico (16+32+48)..."
magick "$OUT/favicon-16.png" "$OUT/favicon-32.png" "$OUT/favicon-48.png" "$OUT/favicon.ico"
echo "  $OUT/favicon.ico"

echo ""
echo "Done."
