#!/bin/bash
# Remux MKV files to MP4 for iPad/iPhone playback
# No re-encoding — just changes the container. Lossless and fast.
#
# Usage:
#   ./scripts/convert-to-mp4.sh ~/Desktop/BSG\ Season\ 1/
#   ./scripts/convert-to-mp4.sh /path/to/any/folder/with/mkvs

set -e

DIR="${1:-.}"

if [ ! -d "$DIR" ]; then
  echo "Usage: $0 <directory with MKV files>"
  exit 1
fi

cd "$DIR"
COUNT=$(ls *.mkv 2>/dev/null | wc -l)

if [ "$COUNT" -eq 0 ]; then
  echo "No MKV files found in $DIR"
  exit 0
fi

echo "Converting $COUNT MKV files to MP4 in: $DIR"
echo ""

for f in *.mkv; do
  out="${f%.mkv}.mp4"
  if [ -f "$out" ]; then
    echo "Skip: $out already exists"
    continue
  fi
  echo "Converting: $f"
  ffmpeg -i "$f" -c copy -tag:v hvc1 -movflags +faststart "$out" -y -loglevel warning
  if [ $? -eq 0 ]; then
    echo "  Done. Removing MKV."
    rm "$f"
  else
    echo "  Failed — keeping MKV."
    rm -f "$out"
  fi
done

echo ""
echo "All done! Files ready for AirDrop to iPad."
