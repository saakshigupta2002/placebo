#!/usr/bin/env bash
# Build the README GIF from the 1080p MP4: crop to the windows (drop the wallpaper margin),
# scale to 1200 px, then a two-pass custom palette with ordered (bayer) dithering, which stays
# stable from frame to frame so unchanged regions cost almost nothing. About 9.6 MB for 43 s.
set -euo pipefail
cd "$(dirname "$0")/.."
in=../docs/assets/placebo-demo.mp4
out=../docs/assets/demo-walkthrough.gif
pal=$(mktemp -t placebo-pal).png
vf="crop=1680:1012:120:50,scale=1200:-2:flags=lanczos"
npx remotion ffmpeg -y -v error -i "$in" -vf "$vf,palettegen=stats_mode=diff:max_colors=192" "$pal"
npx remotion ffmpeg -y -v error -i "$in" -i "$pal" -lavfi "$vf [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -r 10 "$out"
rm -f "$pal"
echo "wrote $out ($(( $(wc -c < "$out") / 1024 )) KB)"
