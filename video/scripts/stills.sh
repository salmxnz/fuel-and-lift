#!/usr/bin/env bash
# Draft check: renders both formats at half size, then tiles frames from every
# scene into check/sheet-<format>.png so the whole cut can be eyeballed at once.
# Frames are in TIMES order, left to right, top to bottom.
#   bash scripts/stills.sh            # both formats
#   bash scripts/stills.sh vertical   # one format
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p check
TIMES="0.6 2.7 3.6 4.9 5.9 6.6 8.0 9.3 10.4 12.4 13.6 14.8 16.4 17.9 19.6 20.9 22.0 23.4 24.3"

sheet() {
  local id=$1 name=$2 cols=$3
  [ "${SKIP_RENDER:-}" = 1 ] || npx remotion render src/index.ts "$id" "check/draft-$name.mp4" --scale=0.5 --codec h264 --crf 22 --overwrite --log=error
  rm -rf "check/frames-$name" && mkdir -p "check/frames-$name"
  local n=0
  for t in $TIMES; do
    n=$((n + 1))
    ffmpeg -v error -y -ss "$t" -i "check/draft-$name.mp4" -frames:v 1 \
      "check/frames-$name/$(printf %02d $n).png"
  done
  local rows=$(((n + cols - 1) / cols))
  ffmpeg -v error -y -framerate 1 -i "check/frames-$name/%02d.png" \
    -vf "tile=${cols}x${rows}:padding=6:color=white" -frames:v 1 "check/sheet-$name.png"
  echo "check/sheet-$name.png"
}

case "${1:-both}" in
  vertical) sheet AdebitePromoVertical vertical 7 ;;
  landscape) sheet AdebitePromo landscape 5 ;;
  *) sheet AdebitePromo landscape 5; sheet AdebitePromoVertical vertical 7 ;;
esac
