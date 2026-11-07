#!/usr/bin/env bash
# Builds dist/chrome and dist/firefox (unpacked) plus a .zip of each.
set -euo pipefail
cd "$(dirname "$0")"

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifests/chrome.json | head -1)
rm -rf dist
for browser in chrome firefox; do
  out="dist/$browser"
  mkdir -p "$out/icons"
  cp src/*.js src/*.html src/*.css "$out/"
  cp icons/*.png "$out/icons/"
  cp "manifests/$browser.json" "$out/manifest.json"
  (cd "$out" && zip -qr "../quick-pin-$browser-$version.zip" .)
  echo "built $out  →  dist/quick-pin-$browser-$version.zip"
done
