#!/usr/bin/env bash
# Optional editorial-asset maintenance. Production serves committed derivatives.
# Requires ImageMagick; no package installation or deployment is performed here.
set -euo pipefail
cd "$(dirname "$0")/.."
for image in src/public/img/blog/*.svg; do
  magick "$image" -strip -define png:compression-level=9 "${image%.svg}.png"
done
